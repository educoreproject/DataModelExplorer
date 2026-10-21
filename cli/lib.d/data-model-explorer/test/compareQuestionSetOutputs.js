'use strict';

// compareQuestionSetOutputs.js — the ctdlHub P7 regression gate: two runs of multiHubQuestionSet.js (the single-hub gold
// before the multi-hub change, and after it) must answer byte for byte alike, EXCEPT for fields the change was ordered
// to add. Those are named here, once (ALLOWED_ADDED_FIELD_NAME_LIST); a field outside the list that appears in the
// after-run is a failure, as is any changed or missing value.
//
// How a JSON answer is compared: every field the after-run ADDED (absent from the baseline object at the same place)
// and named in the list is removed, the rest is re-serialised exactly as multiHubQuestionSet writes it, and the bytes
// are compared with the baseline file. Order therefore counts: a row that moved is a difference.
// ONE exception, counted and printed: a Neo4j map literal (traversal.cypher's entries) comes back with its keys in an
// order Neo4j derives from the key SET, so adding a key to the literal re-orders the others. In an object that gained a
// named field, and only there, the remaining keys are put back in the baseline's order before the bytes are compared;
// their values must still be identical. Measured on GOLD_EVAL_261013_jevQuestionPerBridge (DEVLOG-P7 checkpoint 2).
// A text answer (getSchema, the MCP instructions) has no fields: it is compared byte for byte and, when it differs, its
// line diff is printed so the change can be named in the DEVLOG; TEXT_ANSWER_CHANGE_ALLOWED_BY_FILE_NAME names those
// whose change the work order ordered (step 4).
//
// Run: node cli/lib.d/data-model-explorer/test/compareQuestionSetOutputs.js <baselineDirectoryPath> <afterDirectoryPath>
// Exit: 0 every answer identical or identical after named additions (and every changed text answer allowed); 1 otherwise.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ALLOWED_ADDED_FIELD_NAME_LIST = Object.freeze([
	// findMappings rows and payload (ruling SCARLET_ARROW 2026-10-21: hubName on every row, hubList + totalRowCountByHub)
	'hubName', 'hubTuple', 'hubDomain', 'hubProperty', 'hubRange', 'hubValue', 'hubQualifier', 'hubList', 'totalRowCountByHub',
	// compareCodesets rows
	'hubValueKey',
	// traversal entries and the Slack card, whose existing 'hubName' is the CARD's name: the hub standard is hubSource
	'hubSource',
	// unmappedFields / stats / listStandards: the hub standards, all of them; stats: per hub, the properties mapped onto it
	'hubStandardList', 'mappedPropertyCountByHub',
	// listStandards rows: their match edges per hub
	'hubMatchEdgeCountByHub',
	// Schema Verifier rows: whether the row's own standard is a hub (the name unmappedFields rows already use)
	'isHubStandard',
	// findMappings / explore: published cross-IRI assertions, listed apart and never a mapping (ruling 2026-10-21)
	'declaredCorrespondenceList', 'declaredCorrespondenceCount', 'declaredCorrespondenceRowUnit',
	// ⟪lane R6⟫ the explorer's mapping anchor names its hub's family (hubName is above)
	'standardFamily',
]);

// ⟪lane R6⟫ (educoreForge deCedsRefactor-102126, WORKORDER R6) what the hub-neutral DME was ordered to REMOVE, RENAME or
// REWORD. The BASELINE is brought to the R6 names first (each change counted and printed), then compared byte for byte
// as above. A removal, rename or rewording not declared here is still a failure.
//   removed: the one-hub ceds* row fields (findMappings, compareCodesets, the Slack card), on every graph
const LANE_R6_REMOVED_FIELD_NAME_LIST = Object.freeze(['cedsDomain', 'cedsProperty', 'cedsRange', 'cedsValue', 'cedsQualifier', 'cedsTuple', 'cedsValueKey']);
//   renamed fields of the standards explorer (one name across mapper, access point, store and components)
const LANE_R6_RENAMED_FIELD_NAME_BY_BASELINE_NAME = Object.freeze({ cedsPropertyList: 'hubPropertyList', cedsDomainList: 'hubDomainList', cedsElementCount: 'hubElementCount', cedsDomainName: 'hubDomainName' });
//   renamed VALUES: the explorer's kinds and its hub-element relationship
const LANE_R6_RENAMED_VALUE_BY_BASELINE_VALUE = Object.freeze({ cedsAnchor: 'hubAnchor', cedsProperty: 'hubProperty', cedsDomain: 'hubDomain', USED_BY_CEDS_ELEMENT: 'USED_BY_HUB_ELEMENT' });
//   reworded model-read text [P], as [baseline text, R6 text]; the identifier example is READ FROM THE GRAPH now (the
//   lowest canonicalKey per hub and tier), so its R6 text is what the graph answers (measured, DEVLOG-R6)
const LANE_R6_TEXT_REPLACEMENT_LIST = Object.freeze([
	['one row per (direction, element, CEDS tuple, relation, via-relation)', 'one row per (direction, element, hub tuple, relation, via-relation)'],
	["(as 'incoming' through the CEDS leaf AND", "(as 'incoming' through the hub leaf AND"],
	['CEDS TUPLES (HubReferences) the rows reach', 'HUB TUPLES (HubReferences) the rows reach'],
	['into this CEDS tuple, each counted once', 'into this hub tuple, each counted once'],
	['EDGES into this CEDS tuple per relation', 'EDGES into this hub tuple per relation'],
	['a CEDS Global ID looks like P000033 (property) or OV001637175776 (value)', 'a CEDS Global ID looks like P000001 (property) or OV000002113286 (value)'],
	['a CTDL term CURIE looks like ceterms:Credential (term) or ceterms:name (property)', 'a CTDL term CURIE looks like ceterms:accommodationType (property) or accommodation:AccessibleHousing (value)'],
	["never compose it with a match edge, never count it as mapped", "never compose it with a match edge, never count it as mapped. Its edge's mappingKind 'authored' names who published the statement: it is a published statement, never a mapping and never an 'authored mapping'"],
]);

// the baseline brought to the R6 names: removed fields dropped, fields renamed IN PLACE (key order kept), values renamed,
// texts reworded; laneR6ChangeCount tallies each kind of change
const laneR6NormalisedBaselineOf = (baselineValue, laneR6ChangeCount) => {
	const tally = (changeName) => { laneR6ChangeCount[changeName] = (laneR6ChangeCount[changeName] || 0) + 1; };
	if (Array.isArray(baselineValue)) {
		return baselineValue.map((baselineMember) => laneR6NormalisedBaselineOf(baselineMember, laneR6ChangeCount));
	}
	if (baselineValue && typeof baselineValue === 'object') {
		return Object.keys(baselineValue).reduce((normalisedObject, fieldName) => {
			if (LANE_R6_REMOVED_FIELD_NAME_LIST.indexOf(fieldName) !== -1) {
				tally(`removed ${fieldName}`);
				return normalisedObject;
			}
			const renamedFieldName = LANE_R6_RENAMED_FIELD_NAME_BY_BASELINE_NAME[fieldName];
			if (renamedFieldName) tally(`field ${fieldName}->${renamedFieldName}`);
			return { ...normalisedObject, [renamedFieldName || fieldName]: laneR6NormalisedBaselineOf(baselineValue[fieldName], laneR6ChangeCount) };
		}, {});
	}
	if (typeof baselineValue === 'string') {
		if (LANE_R6_RENAMED_VALUE_BY_BASELINE_VALUE[baselineValue]) {
			tally(`value ${baselineValue}->${LANE_R6_RENAMED_VALUE_BY_BASELINE_VALUE[baselineValue]}`);
			return LANE_R6_RENAMED_VALUE_BY_BASELINE_VALUE[baselineValue];
		}
		return LANE_R6_TEXT_REPLACEMENT_LIST.reduce((soFar, [baselineText, laneR6Text]) => {
			if (soFar.indexOf(baselineText) === -1) return soFar;
			tally(`text '${baselineText.slice(0, 32)}…'`);
			return soFar.split(baselineText).join(laneR6Text);
		}, baselineValue);
	}
	return baselineValue;
};
const TEXT_ANSWER_CHANGE_ALLOWED_BY_FILE_NAME = Object.freeze({
	'getSchemaText.txt': 'step 4: hub paragraph generated from HubDefinition, hubName filters in examples, matchBasis authority',
	'mcpInstructionText.txt': 'step 4: hub-neutral instructions',
});

const [baselineDirectoryPath, afterDirectoryPath] = process.argv.slice(2);
if (!baselineDirectoryPath || !afterDirectoryPath) {
	console.error('usage: compareQuestionSetOutputs.js <baselineDirectoryPath> <afterDirectoryPath>');
	process.exit(2);
}

// strippedOfNamedAdditions — the after-value with every allowed field the baseline lacks removed; addedNameCount tallies them
const strippedOfNamedAdditions = (afterValue, baselineValue, addedNameCount, unexpectedPathList, pathText) => {
	if (Array.isArray(afterValue) && Array.isArray(baselineValue)) {
		return afterValue.map((afterMember, memberIndex) => strippedOfNamedAdditions(afterMember, baselineValue[memberIndex], addedNameCount, unexpectedPathList, `${pathText}[${memberIndex}]`));
	}
	if (afterValue && typeof afterValue === 'object' && !Array.isArray(afterValue) && baselineValue && typeof baselineValue === 'object' && !Array.isArray(baselineValue)) {
		const strippedObject = {};
		let namedFieldAdded = false;
		Object.keys(afterValue).forEach((fieldName) => {
			if (!(fieldName in baselineValue)) {
				if (ALLOWED_ADDED_FIELD_NAME_LIST.indexOf(fieldName) !== -1) {
					addedNameCount[fieldName] = (addedNameCount[fieldName] || 0) + 1;
					namedFieldAdded = true;
					return;
				}
				unexpectedPathList.push(`${pathText}.${fieldName}`);
			}
			strippedObject[fieldName] = strippedOfNamedAdditions(afterValue[fieldName], baselineValue[fieldName], addedNameCount, unexpectedPathList, `${pathText}.${fieldName}`);
		});
		const strippedKeyList = Object.keys(strippedObject);
		const baselineKeyList = Object.keys(baselineValue);
		const sameKeySet = strippedKeyList.length === baselineKeyList.length && baselineKeyList.every((fieldName) => fieldName in strippedObject);
		if (namedFieldAdded && sameKeySet && strippedKeyList.join('\u0000') !== baselineKeyList.join('\u0000')) {
			addedNameCount['(map keys re-ordered by Neo4j)'] = (addedNameCount['(map keys re-ordered by Neo4j)'] || 0) + 1;
			return baselineKeyList.reduce((reorderedObject, fieldName) => ({ ...reorderedObject, [fieldName]: strippedObject[fieldName] }), {});
		}
		return strippedObject;
	}
	return afterValue;
};

const firstDifferingLineOf = (leftText, rightText) => {
	const leftLineList = leftText.split('\n');
	const rightLineList = rightText.split('\n');
	const lineIndex = leftLineList.findIndex((leftLine, oneIndex) => leftLine !== rightLineList[oneIndex]);
	return lineIndex === -1 ? `line ${leftLineList.length + 1}: after-run is longer` : `line ${lineIndex + 1}: baseline ${JSON.stringify(leftLineList[lineIndex])} / after ${JSON.stringify(rightLineList[lineIndex])}`;
};

const baselineFileNameList = fs.readdirSync(baselineDirectoryPath).filter((fileName) => /^\d\d-/.test(fileName)).sort();
const afterFileNameList = fs.readdirSync(afterDirectoryPath).filter((fileName) => /^\d\d-/.test(fileName)).sort();
let failureCount = 0;
const reportLine = (verdictText, fileName, detailText) => console.log(`${verdictText.padEnd(34)} ${fileName}${detailText ? `  ${detailText}` : ''}`);

baselineFileNameList.forEach((fileName) => {
	if (afterFileNameList.indexOf(fileName) === -1) {
		failureCount++;
		reportLine('FAIL missing in after-run', fileName);
		return;
	}
	const rawBaselineText = fs.readFileSync(path.join(baselineDirectoryPath, fileName), 'utf8');
	const afterText = fs.readFileSync(path.join(afterDirectoryPath, fileName), 'utf8');
	const laneR6ChangeCount = {};
	const baselineText = fileName.endsWith('.json') ? `${JSON.stringify(laneR6NormalisedBaselineOf(JSON.parse(rawBaselineText), laneR6ChangeCount), null, 2)}\n` : rawBaselineText;
	const laneR6ChangeText = Object.keys(laneR6ChangeCount).length ? `  [lane R6: ${Object.keys(laneR6ChangeCount).map((changeName) => `${changeName}×${laneR6ChangeCount[changeName]}`).join(' ')}]` : '';
	if (rawBaselineText === afterText) {
		reportLine('IDENTICAL', fileName);
		return;
	}
	if (fileName.endsWith('.txt')) {
		const allowedReason = TEXT_ANSWER_CHANGE_ALLOWED_BY_FILE_NAME[fileName.replace(/^\d\d-/, '')];
		if (!allowedReason) failureCount++;
		reportLine(allowedReason ? 'TEXT CHANGED (named)' : 'FAIL text changed', fileName, allowedReason || '');
		// diff exits 1 when the files differ, the expected outcome here; spawnSync reports it rather than throwing
		const diffText = spawnSync('diff', [path.join(baselineDirectoryPath, fileName), path.join(afterDirectoryPath, fileName)], { encoding: 'utf8' }).stdout;
		console.log(diffText.split('\n').map((diffLine) => `      ${diffLine}`).join('\n'));
		return;
	}
	const addedNameCount = {};
	const unexpectedPathList = [];
	const strippedText = `${JSON.stringify(strippedOfNamedAdditions(JSON.parse(afterText), JSON.parse(baselineText), addedNameCount, unexpectedPathList, '$'), null, 2)}\n`;
	if (unexpectedPathList.length > 0) {
		failureCount++;
		reportLine('FAIL unnamed field added', fileName, unexpectedPathList.slice(0, 5).join(', '));
		return;
	}
	if (strippedText !== baselineText) {
		failureCount++;
		reportLine('FAIL differs', fileName, firstDifferingLineOf(baselineText, strippedText));
		return;
	}
	reportLine(laneR6ChangeText ? 'IDENTICAL after named R6 changes' : 'IDENTICAL after named additions', fileName, `${Object.keys(addedNameCount).map((fieldName) => `${fieldName}×${addedNameCount[fieldName]}`).join(' ')}${laneR6ChangeText}`);
});
afterFileNameList.filter((fileName) => baselineFileNameList.indexOf(fileName) === -1).forEach((fileName) => reportLine('(after-run only, not compared)', fileName));

console.log(`\ncompareQuestionSetOutputs: ${baselineFileNameList.length} answers, ${failureCount} failure(s)`);
process.exit(failureCount > 0 ? 1 : 0);
