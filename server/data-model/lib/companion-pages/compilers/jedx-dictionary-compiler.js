#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]
//
// jedx-dictionary-compiler — builds the jedx-dictionary companion page's payload (SPEC-companionPages-102826, "The JEDx
// compiler") from Steve Saxton's dictionary tabs, the Arkansas pilot sheet and three row lists read from the golden.
// PURE: no file, database or graph access; the access point companion-compile-current reads everything and hands it in.
//
// The join is the 2026-10-28 join probe's (management/.../companionPages-102826/joinProbe/joinProbe.py), ported step for
// step so gate G3.1 can hold it to the probe's numbers:
//   - each element's HR Open Property path is split on '/', each segment trimmed (Python's whitespace set) and lowered,
//     empty and '*' segments dropped; the first segment must name a root schema (rules rootSchemaNameBySegment);
//   - each later segment is looked up on the current schema as itself, without trailing s's, or with an s added (the
//     first form present wins), then depth first on the schemas it REFERENCES, in the order given; the property found
//     becomes the position and its REFERENCES target the next schema (a property with no target leaves none);
//   - a path that reaches a property is resolved, and its matches are that property's hub matches.
// Where a schema has several parents, the probe's answer depends on parent order. Every candidate the walk could have
// taken at a step is therefore collected, and a step with more than one distinct candidate is reported on the element
// (walkChoiceList) instead of being decided silently.
//
//   compileJedxDictionary({ dictionarySourceList, arkansasPilotSource, goldenRowSet, compileRules })
//     dictionarySourceList  [{ sourcePart, fileName, documentDate, contentBuffer }] (every current dictionary part)
//     arkansasPilotSource   { sourcePart, fileName, documentDate, contentBuffer }, or null when the page has none
//     goldenRowSet          { propertyRowList [{ schemaName, propertyName, stableId, targetSchemaName }],
//                             schemaReferenceRowList [{ schemaName, referencedSchemaName }],
//                             matchRowList [{ stableId, relationshipType, matchName, matchStableId, hubName, mappingMethod,
//                                             mappingSource, mappingConfidence, mappingRationale }], jedxVersion }
//     compileRules          jedx-dictionary-rules.json
//   -> { compileErrorText, payloadBody }   compileErrorText is '' on success
//
// An element is named by elementRowId, '<sourcePart>:<record number>' (1-based CSV records, not text lines), because
// element IDs repeat in the dictionary. A record shorter than the header reads its missing trailing cells as empty
// (spreadsheet CSV exports drop trailing empty cells); the probe would have stopped on such a record instead.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const { csvRowListOf } = require('./csv-row-list');

// Python's str.strip() whitespace (str.isspace), which is not JavaScript's trim(): it adds \x1c-\x1f and \x85, and has no
const PYTHON_SPACE_CLASS_TEXT = '[\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]';
const PYTHON_EDGE_SPACE_PATTERN = new RegExp(`^${PYTHON_SPACE_CLASS_TEXT}+|${PYTHON_SPACE_CLASS_TEXT}+$`, 'g');
const pythonStrip = (fieldText) => (fieldText || '').replace(PYTHON_EDGE_SPACE_PATTERN, '');

const MATCH_KIND_BY_RELATIONSHIP_TYPE = { EXACT_MATCH: 'exact', CLOSE_MATCH: 'close', NARROW_MATCH: 'narrow', BROAD_MATCH: 'broad' };
const MATCH_KIND_ORDER_LIST = ['exact', 'close', 'narrow', 'broad'];

const countBy = (itemList, nameOf) => itemList.reduce((countByName, oneItem) => ({ ...countByName, [nameOf(oneItem)]: (countByName[nameOf(oneItem)] || 0) + 1 }), {});

// ================================================================================
// THE GOLDEN'S JEDx SCHEMAS, indexed for the walk

const graphIndexOf = (goldenRowSet) => {
	const propertyBySchemaName = {};
	goldenRowSet.propertyRowList.forEach(({ schemaName, propertyName, stableId, targetSchemaName }) => {
		propertyBySchemaName[schemaName] = propertyBySchemaName[schemaName] || {};
		propertyBySchemaName[schemaName][propertyName.toLowerCase()] = { stableId, targetSchemaName: targetSchemaName || null, propertyName, schemaName };
	});
	const parentSchemaNameListBySchemaName = {};
	goldenRowSet.schemaReferenceRowList.forEach(({ schemaName, referencedSchemaName }) => {
		parentSchemaNameListBySchemaName[schemaName] = parentSchemaNameListBySchemaName[schemaName] || [];
		parentSchemaNameListBySchemaName[schemaName].push(referencedSchemaName);
	});
	const matchListByStableId = {};
	goldenRowSet.matchRowList.forEach((matchRow) => {
		matchListByStableId[matchRow.stableId] = matchListByStableId[matchRow.stableId] || [];
		matchListByStableId[matchRow.stableId].push(matchRow);
	});
	return { propertyBySchemaName, parentSchemaNameListBySchemaName, matchListByStableId };
};

// every property the probe's findProperty could reach for one segment, in its search order (the first is its answer)
const propertyCandidateListOf = ({ graphIndex, schemaName, segmentText, visitedSchemaNameSet }) => {
	if (visitedSchemaNameSet.has(schemaName)) return [];
	visitedSchemaNameSet.add(schemaName);
	const propertyByLowerName = graphIndex.propertyBySchemaName[schemaName] || {};
	const ownFormText = [segmentText, segmentText.replace(/s+$/, ''), `${segmentText}s`].find((formText) => propertyByLowerName[formText]);
	const ownCandidateList = ownFormText ? [propertyByLowerName[ownFormText]] : [];
	if (ownCandidateList.length) return ownCandidateList;
	return (graphIndex.parentSchemaNameListBySchemaName[schemaName] || []).flatMap((parentSchemaName) => propertyCandidateListOf({ graphIndex, schemaName: parentSchemaName, segmentText, visitedSchemaNameSet }));
};

const walkPathOf = ({ graphIndex, hrOpenPath, compileRules }) => {
	const segmentList = hrOpenPath
		.replace(/\n/g, ' ')
		.split('/')
		.map((segmentText) => pythonStrip(segmentText).toLowerCase())
		.filter((segmentText) => segmentText && segmentText !== compileRules.wildcardSegmentText);
	const rootSchemaName = segmentList.length ? compileRules.rootSchemaNameBySegment[segmentList[0]] : undefined;
	if (!rootSchemaName) return { walkStatus: 'noRoot', jedxProperty: null, unresolvedSegment: '', walkChoiceList: [] };
	let schemaName = rootSchemaName;
	let jedxProperty = null;
	const walkChoiceList = [];
	for (const segmentText of segmentList.slice(1)) {
		// one visited set per segment, shared by the whole depth-first search (the probe's `seen`)
		const candidateList = propertyCandidateListOf({ graphIndex, schemaName, segmentText, visitedSchemaNameSet: new Set() });
		if (!candidateList.length) return { walkStatus: 'unresolved', jedxProperty, unresolvedSegment: segmentText, walkChoiceList };
		const distinctStableIdList = [...new Set(candidateList.map((oneCandidate) => oneCandidate.stableId))];
		if (distinctStableIdList.length > 1) walkChoiceList.push({ segmentText, takenStableId: candidateList[0].stableId, candidateStableIdList: distinctStableIdList });
		jedxProperty = candidateList[0];
		schemaName = jedxProperty.targetSchemaName;
	}
	return { walkStatus: jedxProperty ? 'resolved' : 'rootOnly', jedxProperty, unresolvedSegment: '', walkChoiceList };
};

// ================================================================================
// THE DICTIONARY

const dictionaryElementListOf = ({ dictionarySource, compileRules }) => {
	const rowList = csvRowListOf(dictionarySource.contentBuffer);
	const headerRowIndex = rowList.findIndex((oneRow) => oneRow.includes(compileRules.dictionaryHeaderMarkerText));
	if (headerRowIndex < 0) return { partErrorText: `dictionary part ${dictionarySource.sourcePart} (${dictionarySource.fileName}) has no header row holding '${compileRules.dictionaryHeaderMarkerText}'` };
	const headerRow = rowList[headerRowIndex];
	const columnIndexByFieldName = {};
	const missingColumnNameList = [];
	Object.entries(compileRules.dictionaryColumnNameByFieldName).forEach(([fieldName, columnName]) => {
		columnIndexByFieldName[fieldName] = headerRow.indexOf(columnName);
		if (columnIndexByFieldName[fieldName] < 0) missingColumnNameList.push(columnName);
	});
	if (missingColumnNameList.length) return { partErrorText: `dictionary part ${dictionarySource.sourcePart} (${dictionarySource.fileName}) lacks the column(s) ${missingColumnNameList.join(', ')}` };
	const elementList = [];
	rowList.slice(headerRowIndex + 1).forEach((oneRow, rowOffset) => {
		const elementIdColumnIndex = columnIndexByFieldName.elementId;
		if (oneRow.length <= elementIdColumnIndex || !pythonStrip(oneRow[elementIdColumnIndex])) return;
		const elementRecord = { elementRowId: `${dictionarySource.sourcePart}:${headerRowIndex + 2 + rowOffset}`, sourcePart: dictionarySource.sourcePart };
		Object.entries(columnIndexByFieldName).forEach(([fieldName, columnIndex]) => {
			elementRecord[fieldName] = pythonStrip(oneRow[columnIndex]);
		});
		elementList.push(elementRecord);
	});
	return { partErrorText: '', elementList };
};

const pathAbsenceOf = ({ hrOpenPath, compileRules }) => compileRules.pathAbsentPatternList.some((patternText) => new RegExp(patternText, 'i').test(hrOpenPath));

const STATUS_OF_WALK_STATUS = {
	resolved: () => 'resolved',
	unresolved: () => 'unresolved',
	rootOnly: () => 'rootOnly',
	noRoot: ({ hrOpenPath, compileRules }) => (pathAbsenceOf({ hrOpenPath, compileRules }) ? 'pathAbsent' : 'unknownRoot'),
};

const matchRecordOf = (matchRow) => ({
	matchKind: MATCH_KIND_BY_RELATIONSHIP_TYPE[matchRow.relationshipType],
	hubName: matchRow.hubName,
	matchName: matchRow.matchName,
	matchStableId: matchRow.matchStableId,
	mappingMethod: matchRow.mappingMethod,
	mappingSource: matchRow.mappingSource,
	mappingConfidence: matchRow.mappingConfidence,
	mappingRationale: matchRow.mappingRationale,
});

const matchOrderOf = (leftMatch, rightMatch) =>
	MATCH_KIND_ORDER_LIST.indexOf(leftMatch.matchKind) - MATCH_KIND_ORDER_LIST.indexOf(rightMatch.matchKind) ||
	(rightMatch.mappingConfidence || 0) - (leftMatch.mappingConfidence || 0) ||
	String(leftMatch.matchName).localeCompare(String(rightMatch.matchName));

// ================================================================================
// THE ARKANSAS PILOT SHEET: kept close to the sheet, so the page decides how to show it

const arkansasPilotOf = ({ arkansasPilotSource, dictionaryElementIdSet, compileRules }) => {
	if (!arkansasPilotSource) return { pilotErrorText: '', arkansasPilot: null };
	const pilotRules = compileRules.arkansasPilot;
	const rowList = csvRowListOf(arkansasPilotSource.contentBuffer);
	const markerRowIndex = rowList.findIndex((oneRow) => pythonStrip(oneRow[pilotRules.elementIdColumnIndex]) === pilotRules.headerMarkerText);
	const programNameRow = rowList[markerRowIndex + pilotRules.programNameRowOffset];
	const groupLabelRow = rowList[markerRowIndex + pilotRules.groupLabelRowOffset];
	if (markerRowIndex < 0 || !programNameRow || !groupLabelRow) return { pilotErrorText: `the Arkansas pilot sheet (${arkansasPilotSource.fileName}) has no '${pilotRules.headerMarkerText}' row with its program and group rows above it` };
	const elementIdPattern = new RegExp(pilotRules.elementIdPattern);
	const firstMarkColumnIndex = pilotRules.elementNameColumnIndex + 1;
	let groupLabelText = '';
	const groupLabelByColumnIndex = {};
	const columnCount = Math.max(...rowList.map((oneRow) => oneRow.length));
	for (let columnIndex = firstMarkColumnIndex; columnIndex < columnCount; columnIndex++) {
		groupLabelText = pythonStrip(groupLabelRow[columnIndex]) || groupLabelText;
		groupLabelByColumnIndex[columnIndex] = groupLabelText;
	}
	let sectionTitle = '';
	const elementMarkList = [];
	rowList.slice(markerRowIndex + 1).forEach((oneRow) => {
		const elementIdText = pythonStrip(oneRow[pilotRules.elementIdColumnIndex]);
		const elementNameText = pythonStrip(oneRow[pilotRules.elementNameColumnIndex]);
		if (!elementIdPattern.test(elementIdText)) {
			if (!elementIdText && elementNameText) sectionTitle = elementNameText;
			return;
		}
		const markList = oneRow
			.map((cellText, columnIndex) => ({ columnIndex, cellText: pythonStrip(cellText) }))
			.filter(({ columnIndex, cellText }) => columnIndex >= firstMarkColumnIndex && cellText);
		elementMarkList.push({ elementId: elementIdText, elementName: elementNameText, sectionTitle, markList, inDictionary: dictionaryElementIdSet.has(elementIdText) });
	});
	const markedColumnIndexSet = new Set(elementMarkList.flatMap(({ markList }) => markList.map(({ columnIndex }) => columnIndex)));
	const programColumnList = Object.keys(groupLabelByColumnIndex)
		.map(Number)
		.filter((columnIndex) => pythonStrip(programNameRow[columnIndex]) || markedColumnIndexSet.has(columnIndex))
		.map((columnIndex) => ({ columnIndex, programName: pythonStrip(programNameRow[columnIndex]), groupLabel: groupLabelByColumnIndex[columnIndex] }));
	return { pilotErrorText: '', arkansasPilot: { fileName: arkansasPilotSource.fileName, documentDate: arkansasPilotSource.documentDate, titleText: pythonStrip(programNameRow[pilotRules.elementIdColumnIndex]), programColumnList, elementMarkList } };
};

// ================================================================================
// THE COMPILE

const compileJedxDictionary = ({ dictionarySourceList, arkansasPilotSource, goldenRowSet, compileRules }) => {
	const absentInputList = [
		['dictionarySourceList', Array.isArray(dictionarySourceList)],
		['goldenRowSet', goldenRowSet && ['propertyRowList', 'schemaReferenceRowList', 'matchRowList'].every((listName) => Array.isArray(goldenRowSet[listName])) && typeof goldenRowSet.jedxVersion === 'string'],
		['compileRules', compileRules && compileRules.rootSchemaNameBySegment && compileRules.dictionaryColumnNameByFieldName],
		['arkansasPilotSource (an object or null)', arkansasPilotSource === null || (arkansasPilotSource && Buffer.isBuffer(arkansasPilotSource.contentBuffer))],
	].filter(([, isPresent]) => !isPresent).map(([inputName]) => inputName);
	if (absentInputList.length) return { compileErrorText: `${moduleName}: absent or malformed input: ${absentInputList.join(', ')}` };

	const unknownRelationshipTypeList = [...new Set(goldenRowSet.matchRowList.map((matchRow) => matchRow.relationshipType).filter((relationshipType) => !MATCH_KIND_BY_RELATIONSHIP_TYPE[relationshipType]))];
	if (unknownRelationshipTypeList.length) return { compileErrorText: `${moduleName}: the golden gave match relationship(s) this compiler does not know: ${unknownRelationshipTypeList.join(', ')}` };
	if (!goldenRowSet.propertyRowList.length) return { compileErrorText: `${moduleName}: the golden holds no JEDx properties` };

	const elementPartList = dictionarySourceList
		.filter(({ sourcePart }) => !compileRules.skippedDictionarySourcePartList.includes(sourcePart))
		.sort((leftSource, rightSource) => (leftSource.sourcePart < rightSource.sourcePart ? -1 : leftSource.sourcePart > rightSource.sourcePart ? 1 : 0));
	if (!elementPartList.length) return { compileErrorText: `${moduleName}: the page has no current dictionary part other than ${compileRules.skippedDictionarySourcePartList.join(', ')}` };
	const partResultList = elementPartList.map((dictionarySource) => dictionaryElementListOf({ dictionarySource, compileRules }));
	const partErrorList = partResultList.map(({ partErrorText }) => partErrorText).filter(Boolean);
	if (partErrorList.length) return { compileErrorText: `${moduleName}: ${partErrorList.join('; ')}` };

	const graphIndex = graphIndexOf(goldenRowSet);
	const elementList = partResultList
		.flatMap(({ elementList }) => elementList)
		.map((dictionaryElement) => {
			const { walkStatus, jedxProperty, unresolvedSegment, walkChoiceList } = walkPathOf({ graphIndex, hrOpenPath: dictionaryElement.hrOpenPath, compileRules });
			const status = STATUS_OF_WALK_STATUS[walkStatus]({ hrOpenPath: dictionaryElement.hrOpenPath, compileRules });
			const isResolved = status === 'resolved';
			return {
				...dictionaryElement,
				status,
				unresolvedSegment,
				jedxStableId: jedxProperty ? jedxProperty.stableId : null,
				jedxPropertyName: jedxProperty ? jedxProperty.propertyName : null,
				jedxSchemaName: jedxProperty ? jedxProperty.schemaName : null,
				walkChoiceList,
				matchList: isResolved ? (graphIndex.matchListByStableId[jedxProperty.stableId] || []).map(matchRecordOf).sort(matchOrderOf) : [],
			};
		});

	const resolvedElementList = elementList.filter(({ status }) => status === 'resolved');
	const elementRowIdListByStableId = {};
	resolvedElementList.forEach(({ jedxStableId, elementRowId }) => {
		elementRowIdListByStableId[jedxStableId] = [...(elementRowIdListByStableId[jedxStableId] || []), elementRowId];
	});
	elementList.forEach((oneElement) => {
		oneElement.sharedPropertyElementRowIdList = oneElement.status === 'resolved' && elementRowIdListByStableId[oneElement.jedxStableId].length > 1 ? elementRowIdListByStableId[oneElement.jedxStableId].filter((elementRowId) => elementRowId !== oneElement.elementRowId) : [];
	});
	const elementByRowId = Object.fromEntries(elementList.map((oneElement) => [oneElement.elementRowId, oneElement]));
	const sharedPropertyList = Object.entries(elementRowIdListByStableId)
		.filter(([, elementRowIdList]) => elementRowIdList.length > 1)
		.map(([jedxStableId, elementRowIdList]) => ({
			jedxStableId,
			elementList: elementRowIdList.map((elementRowId) => ({ elementRowId, elementId: elementByRowId[elementRowId].elementId, elementName: elementByRowId[elementRowId].elementName, hrOpenFilterCondition: elementByRowId[elementRowId].hrOpenFilterCondition })),
		}))
		.sort((leftShared, rightShared) => rightShared.elementList.length - leftShared.elementList.length || leftShared.jedxStableId.localeCompare(rightShared.jedxStableId));

	const matchedElementList = elementList.filter(({ matchList }) => matchList.length);
	const { pilotErrorText, arkansasPilot } = arkansasPilotOf({ arkansasPilotSource, dictionaryElementIdSet: new Set(elementList.map(({ elementId }) => elementId)), compileRules });
	if (pilotErrorText) return { compileErrorText: `${moduleName}: ${pilotErrorText}` };

	return {
		compileErrorText: '',
		payloadBody: {
			jedxVersion: goldenRowSet.jedxVersion,
			countSummary: {
				elementCount: elementList.length,
				resolvedCount: resolvedElementList.length,
				distinctPropertyCount: Object.keys(elementRowIdListByStableId).length,
				matchedElementCount: matchedElementList.length,
				elementCountByStatus: countBy(elementList, ({ status }) => status),
				matchedElementCountByHub: countBy(matchedElementList.flatMap(({ matchList }) => [...new Set(matchList.map(({ hubName }) => hubName))]), (hubName) => hubName),
				matchCountByKind: countBy(matchedElementList.flatMap(({ matchList }) => matchList), ({ matchKind }) => matchKind),
				walkChoiceElementCount: elementList.filter(({ walkChoiceList }) => walkChoiceList.length).length,
			},
			elementList,
			sharedPropertyList,
			pathAbsentElementRowIdList: elementList.filter(({ status }) => status === 'pathAbsent').map(({ elementRowId }) => elementRowId),
			notLinkedElementRowIdList: elementList.filter(({ status }) => ['unresolved', 'unknownRoot', 'rootOnly'].includes(status)).map(({ elementRowId }) => elementRowId),
			arkansasPilot,
		},
	};
};

module.exports = { compileJedxDictionary };
