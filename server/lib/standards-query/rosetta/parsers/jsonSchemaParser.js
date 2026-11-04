'use strict';

// jsonSchemaParser — a JSON Schema (draft 2020-12 or 7) becomes fields: each property is one, its name the property name, its definition the description (or title), its path the JSON pointer, nested objects and array items walked. See parserLimits.js for THE PARSER INTERFACE.
// $ref resolves only inside the document. A remote one is recorded in unresolvedRefList and never fetched; this file reaches no network, by having nothing to reach it with. A cycle is refused by name, and so is a document past the expansion cap: a 2 KB schema can otherwise fan out to 10^k fields.
// What is not walked (anyOf, oneOf, allOf past its first level) is named in notWalkedList, never dropped in silence.

const { isPlainRecord, depthRefusalFor, fieldCollectorFor } = require('./parserLimits');

const LOCAL_REF_PREFIX = '#';
const UNWALKED_COMPOSITION_NAME_LIST = Object.freeze(['anyOf', 'oneOf', 'not']);
const ALL_OF_DEPTH_WALKED = 1;

// the JSON pointer escapes only. A percent-escape is not decoded: a malformed one would throw on hostile input, and a $ref that finds nothing is listed in unresolvedRefList, so nothing is lost in silence
const pointerSegmentOf = (segmentText) => segmentText.replace(/~1/g, '/').replace(/~0/g, '~');
const escapedSegmentOf = (propertyName) => propertyName.replace(/~/g, '~0').replace(/\//g, '~1');

const localRefTargetOf = (schemaDocument, refText) => {
	const segmentList = refText.slice(1).split('/').filter(Boolean).map(pointerSegmentOf);
	return segmentList.reduce((soFar, oneSegment) => ((isPlainRecord(soFar) || Array.isArray(soFar)) && Object.prototype.hasOwnProperty.call(soFar, oneSegment) ? soFar[oneSegment] : undefined), schemaDocument);
};

const typeTextOf = (schemaPart) => {
	const typeList = Array.isArray(schemaPart.type) ? schemaPart.type : [schemaPart.type];
	return typeList.every((oneType) => typeof oneType === 'string') ? typeList.join('|') : undefined;
};

const parseJsonSchema = ({ submittedDocument, parserLimitValues }) => {
	const depthRefusal = depthRefusalFor({ submittedDocument, parserLimitValues });
	if (depthRefusal) {
		return { refusal: depthRefusal };
	}
	const collector = fieldCollectorFor(parserLimitValues);
	const unresolvedRefList = [];
	const notWalkedList = [];
	let refExpansionCount = 0;

	// follows $ref to the schema it names: { schemaPart, refStack } | { refusal } | {} when unresolved, which is recorded
	const resolveSchemaPart = ({ schemaPart, pathText, refStack }) => {
		if (typeof schemaPart.$ref !== 'string') {
			return { schemaPart, refStack };
		}
		const refText = schemaPart.$ref;
		if (!refText.startsWith(LOCAL_REF_PREFIX)) {
			unresolvedRefList.push({ path: pathText, ref: refText, reason: 'remote: never fetched' });
			return {};
		}
		if (refStack.includes(refText)) {
			return { refusal: { refusalName: 'refCycle', reason: `$ref ${refText} at ${pathText} refers back to itself`, path: pathText } };
		}
		refExpansionCount += 1;
		if (refExpansionCount > parserLimitValues.maxRefExpansions) {
			return { refusal: { refusalName: 'refExpansionsExceeded', reason: `the document expands more than ${parserLimitValues.maxRefExpansions} $ref`, maxRefExpansions: parserLimitValues.maxRefExpansions } };
		}
		const refTarget = localRefTargetOf(submittedDocument, refText);
		if (!isPlainRecord(refTarget)) {
			unresolvedRefList.push({ path: pathText, ref: refText, reason: 'names nothing in this document' });
			return {};
		}
		return resolveSchemaPart({ schemaPart: refTarget, pathText, refStack: [...refStack, refText] });
	};

	const walkChildren = ({ schemaPart, pathText, depth, refStack, allOfDepth }) => {
		if (depth > parserLimitValues.maxDocumentDepth) {
			return { refusalName: 'depthExceeded', reason: `the schema at ${pathText} walks deeper than ${parserLimitValues.maxDocumentDepth} levels`, maxDepth: parserLimitValues.maxDocumentDepth, path: pathText };
		}
		UNWALKED_COMPOSITION_NAME_LIST.filter((compositionName) => schemaPart[compositionName] !== undefined).forEach((compositionName) => notWalkedList.push({ path: pathText, reason: `${compositionName} is not walked` }));
		const propertyByName = isPlainRecord(schemaPart.properties) ? schemaPart.properties : {};
		const propertyNameList = Object.keys(propertyByName);
		for (let propertyIndex = 0; propertyIndex < propertyNameList.length; propertyIndex += 1) {
			const propertyName = propertyNameList[propertyIndex];
			const propertyPath = `${pathText}/${escapedSegmentOf(propertyName)}`;
			const propertyPart = propertyByName[propertyName];
			if (!isPlainRecord(propertyPart)) {
				notWalkedList.push({ path: propertyPath, reason: 'its schema is not an object' });
				continue;
			}
			const resolved = resolveSchemaPart({ schemaPart: propertyPart, pathText: propertyPath, refStack });
			if (resolved.refusal) {
				return resolved.refusal;
			}
			const describedPart = resolved.schemaPart || propertyPart;
			const definitionText = propertyPart.description || propertyPart.title || describedPart.description || describedPart.title;
			const addRefusal = collector.add({ name: propertyName, definition: definitionText, path: propertyPath, type: typeTextOf(describedPart), valueTierNotOffered: Array.isArray(describedPart.enum) });
			if (addRefusal) {
				return addRefusal;
			}
			if (resolved.schemaPart) {
				const childRefusal = walkChildren({ schemaPart: resolved.schemaPart, pathText: propertyPath, depth: depth + 1, refStack: resolved.refStack, allOfDepth: 0 });
				if (childRefusal) {
					return childRefusal;
				}
			}
		}
		if (isPlainRecord(schemaPart.items)) {
			const resolvedItems = resolveSchemaPart({ schemaPart: schemaPart.items, pathText: `${pathText}/items`, refStack });
			if (resolvedItems.refusal) {
				return resolvedItems.refusal;
			}
			if (resolvedItems.schemaPart) {
				const itemsRefusal = walkChildren({ schemaPart: resolvedItems.schemaPart, pathText: `${pathText}/items`, depth: depth + 1, refStack: resolvedItems.refStack, allOfDepth: 0 });
				if (itemsRefusal) {
					return itemsRefusal;
				}
			}
		}
		if (Array.isArray(schemaPart.allOf)) {
			if (allOfDepth >= ALL_OF_DEPTH_WALKED) {
				notWalkedList.push({ path: pathText, reason: 'allOf past its first level is not walked' });
				return null;
			}
			for (let memberIndex = 0; memberIndex < schemaPart.allOf.length; memberIndex += 1) {
				const memberPart = schemaPart.allOf[memberIndex];
				if (!isPlainRecord(memberPart)) {
					notWalkedList.push({ path: `${pathText}/allOf/${memberIndex}`, reason: 'its schema is not an object' });
					continue;
				}
				const resolvedMember = resolveSchemaPart({ schemaPart: memberPart, pathText: `${pathText}/allOf/${memberIndex}`, refStack });
				if (resolvedMember.refusal) {
					return resolvedMember.refusal;
				}
				if (resolvedMember.schemaPart) {
					const memberRefusal = walkChildren({ schemaPart: resolvedMember.schemaPart, pathText, depth: depth + 1, refStack: resolvedMember.refStack, allOfDepth: allOfDepth + 1 });
					if (memberRefusal) {
						return memberRefusal;
					}
				}
			}
		}
		return null;
	};

	const resolvedRoot = resolveSchemaPart({ schemaPart: submittedDocument, pathText: '', refStack: [] });
	if (resolvedRoot.refusal) {
		return { refusal: resolvedRoot.refusal };
	}
	const walkRefusal = resolvedRoot.schemaPart ? walkChildren({ schemaPart: resolvedRoot.schemaPart, pathText: '', depth: 1, refStack: resolvedRoot.refStack, allOfDepth: 0 }) : null;
	if (walkRefusal) {
		return { refusal: walkRefusal };
	}
	if (collector.fieldList.length === 0) {
		return { refusal: { refusalName: 'noFieldsFound', reason: 'this schema has no properties to read as fields', unresolvedRefList, notWalkedList } };
	}
	return { fieldList: collector.fieldList, unresolvedRefList, unresolvedContextList: [], notWalkedList };
};

module.exports = { parseJsonSchema };
