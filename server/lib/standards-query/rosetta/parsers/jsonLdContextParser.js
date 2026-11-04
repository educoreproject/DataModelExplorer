'use strict';

// jsonLdContextParser — a JSON-LD document's @context becomes fields: each term is one, its name the term, its definition an rdfs:comment beside it when there is one, its path the IRI it maps to, recorded and never fetched. See parserLimits.js for THE PARSER INTERFACE.
// A remote @context URL is recorded in unresolvedContextList and its terms are not fields. A keyword (@vocab, @base) is no field. A term mapping to a namespace (schema: "https://schema.org/") is a prefix, not a field, and is named in notWalkedList, as is a term's own scoped context.

const { isPlainRecord, depthRefusalFor, fieldCollectorFor } = require('./parserLimits');

const CONTEXT_PROPERTY_NAME = '@context';
const KEYWORD_PREFIX = '@';
const COMMENT_PROPERTY_NAME_LIST = Object.freeze(['rdfs:comment', 'http://www.w3.org/2000/01/rdf-schema#comment', 'comment']);
const NAMESPACE_ENDING_PATTERN = /[/#:]$/;

const iriOfTerm = (termBody) => (isPlainRecord(termBody) ? termBody['@id'] : termBody);

const parseJsonLdContext = ({ submittedDocument, parserLimitValues }) => {
	const depthRefusal = depthRefusalFor({ submittedDocument, parserLimitValues });
	if (depthRefusal) {
		return { refusal: depthRefusal };
	}
	if (submittedDocument[CONTEXT_PROPERTY_NAME] === undefined) {
		return { refusal: { refusalName: 'noFieldsFound', reason: `this document has no ${CONTEXT_PROPERTY_NAME}` } };
	}
	const collector = fieldCollectorFor(parserLimitValues);
	const unresolvedContextList = [];
	const notWalkedList = [];
	const contextPartList = Array.isArray(submittedDocument[CONTEXT_PROPERTY_NAME]) ? submittedDocument[CONTEXT_PROPERTY_NAME] : [submittedDocument[CONTEXT_PROPERTY_NAME]];
	for (let partIndex = 0; partIndex < contextPartList.length; partIndex += 1) {
		const contextPart = contextPartList[partIndex];
		if (typeof contextPart === 'string') {
			unresolvedContextList.push({ context: contextPart, reason: 'remote: never fetched, so its terms are not fields' });
			continue;
		}
		if (!isPlainRecord(contextPart)) {
			notWalkedList.push({ path: `${CONTEXT_PROPERTY_NAME}[${partIndex}]`, reason: 'not an object or a URL' });
			continue;
		}
		const termNameList = Object.keys(contextPart).filter((termName) => !termName.startsWith(KEYWORD_PREFIX));
		for (let termIndex = 0; termIndex < termNameList.length; termIndex += 1) {
			const termName = termNameList[termIndex];
			const termBody = contextPart[termName];
			const termIri = iriOfTerm(termBody);
			if (typeof termIri === 'string' && NAMESPACE_ENDING_PATTERN.test(termIri)) {
				notWalkedList.push({ path: termName, reason: 'a prefix for a namespace, not a term' });
				continue;
			}
			if (isPlainRecord(termBody) && termBody[CONTEXT_PROPERTY_NAME] !== undefined) {
				notWalkedList.push({ path: termName, reason: 'its scoped context is not walked' });
			}
			const commentName = isPlainRecord(termBody) ? COMMENT_PROPERTY_NAME_LIST.find((propertyName) => typeof termBody[propertyName] === 'string') : undefined;
			const addRefusal = collector.add({ name: termName, definition: commentName ? termBody[commentName] : undefined, path: typeof termIri === 'string' ? termIri : undefined });
			if (addRefusal) {
				return { refusal: addRefusal };
			}
		}
	}
	if (collector.fieldList.length === 0) {
		return { refusal: { refusalName: 'noFieldsFound', reason: 'this @context defines no term to read as a field', unresolvedContextList, notWalkedList } };
	}
	return { fieldList: collector.fieldList, unresolvedRefList: [], unresolvedContextList, notWalkedList };
};

module.exports = { parseJsonLdContext };
