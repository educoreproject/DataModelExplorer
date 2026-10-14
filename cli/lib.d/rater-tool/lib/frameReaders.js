'use strict';

// frameReaders.js — each standard's sampling FRAME: its own leaf elements, read from the gold's forge content (never its
// bridge edges). A registry by standard name; every reader has the same interface:
//
//   reader({ raterGraph, drawConfig }, callback(errText, memberRowList))
//
// memberRowList holds one row per declaration in the graph, each:
//   { memberStableId, name, definition, typeNameList, dataTypeText, optionSetName, optionValueSampleList,
//     ownerName, ownerDefinition, pathText, subStandardName, exclusionMatch: { edFiPath | sifXpath | pescSourceName } }
// and groupSignatureOf(memberRow) says which rows are ONE element to a rater:
//   Ed-Fi — each entity property is its own element (its path);
//   SIF   — identical name + definition + type count as one (a question asked in many objects);
//   PESC  — identical name + definition + type count as one, across the latest release of each sub-standard.
//
// The leaf rules (documented again in sample-report.md):
//   Ed-Fi — an EdfiProperty that REFERENCES no other construct, owned by an entity (drawConfig.edFiEntityOwnerTypeList:
//           domain entities, associations, their subclasses and extensions, abstract entities); commons, inline commons and
//           choices are reusable groups, not entities, and are left out;
//   SIF   — a Sif260928Field with no HAS_CHILD field below it;
//   PESC  — an element declaration whose type is not a complex type (no REFERENCES_TYPE to a DmeClass), in the latest release
//           of each of the seven sub-standards (drawConfig.pescLatestReleaseList).

const OPTION_VALUE_SAMPLE_SIZE = 12;

const EDFI_FRAME_CYPHER = `
	MATCH (owner:DmeClass)-[:HAS_PROPERTY]->(property:EdfiProperty)
	WHERE owner.stableId = property.parentId AND property.owningConstructType IN $edFiEntityOwnerTypeList AND NOT (property)-[:REFERENCES]->()
	OPTIONAL MATCH (property)-[:REFERENCES_TYPE]->(sharedType)
	OPTIONAL MATCH (property)-[:HAS_OPTION_SET]->(optionSet)
	OPTIONAL MATCH (optionSet)-[:HAS_VALUE]->(optionValue)
	WITH owner, property, sharedType, optionSet, optionValue ORDER BY optionValue.name
	WITH owner, property, sharedType, optionSet, collect(optionValue.name)[0..${OPTION_VALUE_SAMPLE_SIZE}] AS optionValueSampleList
	RETURN property.stableId AS memberStableId, property.name AS name, property.description AS definition,
	       property.propertyType AS propertyType, sharedType.name AS sharedTypeName, optionSet.name AS optionSetName, optionValueSampleList,
	       owner.name AS ownerName, owner.description AS ownerDefinition, property.path AS pathText
	ORDER BY memberStableId`;

const SIF_FRAME_CYPHER = `
	MATCH (field:Sif260928Field)
	WHERE field._source = $sifSourceName AND NOT (field)-[:HAS_CHILD]->(:Sif260928Field)
	OPTIONAL MATCH (parentField:Sif260928Field)-[:HAS_CHILD]->(field)
	OPTIONAL MATCH (field)-[:HAS_OPTION_SET]->(codeset)
	OPTIONAL MATCH (codeset)-[:HAS_VALUE]->(codesetValue)
	WITH field, parentField, codeset, codesetValue ORDER BY codesetValue.name
	WITH field, parentField, codeset, collect(codesetValue.name)[0..${OPTION_VALUE_SAMPLE_SIZE}] AS optionValueSampleList
	RETURN field.stableId AS memberStableId, field.name AS name, field.description AS definition, field.type AS fieldTypeName,
	       codeset.name AS optionSetName, optionValueSampleList, field.objectName AS objectName, field.parentPath AS parentPath,
	       parentField.name AS parentFieldName, parentField.description AS parentFieldDefinition, field.xpath AS pathText
	ORDER BY memberStableId`;

const PESC_FRAME_CYPHER = `
	MATCH (owner)-[:HAS_PROPERTY]->(element:DmeProperty)
	WHERE element._source IN $pescSourceNameList AND NOT (element)-[:REFERENCES_TYPE]->(:DmeClass)
	OPTIONAL MATCH (element)-[:REFERENCES_TYPE]->(dataType:DmeSupport)
	OPTIONAL MATCH (element)-[:HAS_OPTION_SET]->(codeList)
	OPTIONAL MATCH (codeList)-[:HAS_VALUE]->(codeValue)
	WITH owner, element, dataType, codeList, codeValue ORDER BY codeValue.name
	WITH owner, element, dataType, codeList, collect(codeValue.name)[0..${OPTION_VALUE_SAMPLE_SIZE}] AS optionValueSampleList
	RETURN element.stableId AS memberStableId, element.name AS name, element.effectiveDocumentation AS definition, element.typeName AS pescTypeName,
	       dataType.baseTypeQName AS baseTypeQName, codeList.name AS optionSetName, optionValueSampleList,
	       owner.name AS ownerName, owner.description AS ownerDefinition, element.contextPathSampleList AS contextPathSampleList, element._source AS sourceName
	ORDER BY memberStableId`;

const XSD_NAMESPACE_PREFIX = 'http://www.w3.org/2001/XMLSchema#';

const blankToNull = (text) => (typeof text === 'string' && text.trim() !== '' ? text.replace(/\s+/g, ' ').trim() : null);

const FRAME_READER_BY_STANDARD = Object.freeze({
	'Ed-Fi': ({ raterGraph, drawConfig }, callback) => {
		raterGraph.runQuery(EDFI_FRAME_CYPHER, { edFiEntityOwnerTypeList: drawConfig.edFiEntityOwnerTypeList }, (queryError, rowList) => {
			if (queryError) {
				callback(`the Ed-Fi frame query failed: ${queryError}`);
				return;
			}
			callback('', rowList.map((oneRow) => ({
				memberStableId: oneRow.memberStableId,
				name: oneRow.name,
				definition: blankToNull(oneRow.definition),
				typeNameList: [oneRow.propertyType, oneRow.sharedTypeName].filter(Boolean),
				dataTypeText: oneRow.sharedTypeName ? `${oneRow.propertyType} (${oneRow.sharedTypeName})` : oneRow.optionSetName ? `${oneRow.propertyType} (${oneRow.optionSetName})` : oneRow.propertyType,
				optionSetName: oneRow.optionSetName,
				optionValueSampleList: oneRow.optionValueSampleList,
				ownerName: oneRow.ownerName,
				ownerDefinition: blankToNull(oneRow.ownerDefinition),
				pathText: oneRow.pathText,
				subStandardName: 'Ed-Fi Data Standard',
				exclusionMatch: { edFiPath: oneRow.pathText },
			})));
		});
	},
	SIF: ({ raterGraph, drawConfig }, callback) => {
		raterGraph.runQuery(SIF_FRAME_CYPHER, { sifSourceName: drawConfig.sifSourceName }, (queryError, rowList) => {
			if (queryError) {
				callback(`the SIF frame query failed: ${queryError}`);
				return;
			}
			callback('', rowList.map((oneRow) => {
				const ownerPathSegmentList = `${oneRow.parentPath || ''}`.split('/').filter(Boolean);
				return {
					memberStableId: oneRow.memberStableId,
					name: oneRow.name,
					definition: blankToNull(oneRow.definition),
					typeNameList: [oneRow.fieldTypeName].filter(Boolean),
					dataTypeText: oneRow.fieldTypeName || 'type not declared',
					optionSetName: oneRow.optionSetName,
					optionValueSampleList: oneRow.optionValueSampleList,
					// the owner is the element directly above: a parent field when there is one (it carries a definition), else the
					// container or object, which SIF 2026-09-28 publishes without a definition
					ownerName: oneRow.parentFieldName || ownerPathSegmentList[ownerPathSegmentList.length - 1] || oneRow.objectName,
					ownerDefinition: blankToNull(oneRow.parentFieldDefinition),
					pathText: oneRow.pathText,
					subStandardName: `SIF ${drawConfig.sifSourceName}`,
					exclusionMatch: { sifXpath: oneRow.pathText },
				};
			}));
		});
	},
	PESC: ({ raterGraph, drawConfig }, callback) => {
		const subStandardNameBySource = drawConfig.pescLatestReleaseList.reduce((soFar, release) => ({ ...soFar, [release.sourceName]: release.subStandardName }), {});
		raterGraph.runQuery(PESC_FRAME_CYPHER, { pescSourceNameList: Object.keys(subStandardNameBySource) }, (queryError, rowList) => {
			if (queryError) {
				callback(`the PESC frame query failed: ${queryError}`);
				return;
			}
			callback('', rowList.map((oneRow) => {
				const xsdBaseTypeName = typeof oneRow.baseTypeQName === 'string' && oneRow.baseTypeQName.startsWith(XSD_NAMESPACE_PREFIX) ? oneRow.baseTypeQName.slice(XSD_NAMESPACE_PREFIX.length) : null;
				const releaseText = `${subStandardNameBySource[oneRow.sourceName]} ${oneRow.sourceName.replace(/^.*-/, '')}`;
				const contextPathText = Array.isArray(oneRow.contextPathSampleList) && oneRow.contextPathSampleList.length > 0 ? oneRow.contextPathSampleList.slice().sort()[0] : null;
				return {
					memberStableId: oneRow.memberStableId,
					name: oneRow.name,
					definition: blankToNull(oneRow.definition),
					typeNameList: [xsdBaseTypeName].filter(Boolean),
					dataTypeText: [oneRow.pescTypeName || (oneRow.optionSetName ? 'inline code list' : 'inline type'), xsdBaseTypeName ? `xsd:${xsdBaseTypeName}` : null].filter(Boolean).join(', '),
					optionSetName: oneRow.optionSetName,
					optionValueSampleList: oneRow.optionValueSampleList,
					ownerName: oneRow.ownerName,
					ownerDefinition: blankToNull(oneRow.ownerDefinition),
					pathText: contextPathText || `${releaseText} / ${oneRow.ownerName} / ${oneRow.name}`,
					subStandardName: releaseText,
					exclusionMatch: { pescSourceName: oneRow.sourceName },
				};
			}));
		});
	},
});

// which member rows are one element: a registry by standard, the same shape for each
const GROUP_SIGNATURE_BY_STANDARD = Object.freeze({
	'Ed-Fi': (memberRow) => memberRow.memberStableId,
	SIF: (memberRow) => JSON.stringify([memberRow.name, memberRow.definition, memberRow.dataTypeText]),
	PESC: (memberRow) => JSON.stringify([memberRow.name, memberRow.definition, memberRow.dataTypeText]),
});

module.exports = { FRAME_READER_BY_STANDARD, GROUP_SIGNATURE_BY_STANDARD };
