'use strict';

// rdfParser.js — Parse CEDS Ontology v14 RDF/XML into structured entities
// Extracts CedsClass, CedsProperty, CedsOptionSet, CedsOptionValue from RDF

const fs = require('fs');
const xml2js = require('xml2js');

const CEDS_URI_PREFIX = 'https://w3id.org/CEDStandards/terms/';
const CONCEPT_SCHEME_URI = 'http://www.w3.org/2004/02/skos/core#ConceptScheme';
const XSD_PREFIX = 'http://www.w3.org/2001/XMLSchema#';

// ============================================================
// Helpers
// ============================================================

const getText = (element, tagName) => {
	const values = element[tagName];
	if (!values || !values.length) { return undefined; }
	const val = values[0];
	if (typeof val === 'string') { return val; }
	if (typeof val === 'object' && val['_']) { return val['_']; }
	return undefined;
};

const getAttr = (element, attrName) => {
	const attrs = element['$'];
	if (!attrs) { return undefined; }
	return attrs[attrName];
};

const getResourceRefs = (element, tagName) => {
	const values = element[tagName];
	if (!values || !values.length) { return []; }
	return values
		.map(val => {
			if (typeof val === 'object' && val['$']) {
				return val['$']['rdf:resource'];
			}
			return undefined;
		})
		.filter(Boolean);
};

const isCedsUri = (uri) => uri && uri.startsWith(CEDS_URI_PREFIX);

const hasConceptSchemeType = (element) => {
	const types = element['rdf:type'];
	if (!types || !types.length) { return false; }
	return types.some(t => {
		if (typeof t === 'object' && t['$']) {
			return t['$']['rdf:resource'] === CONCEPT_SCHEME_URI;
		}
		return false;
	});
};

// ============================================================
// Entity extractors
// ============================================================

const extractBaseProperties = (element) => {
	const uri = getAttr(element, 'rdf:about');
	return {
		cedsId: getText(element, 'dc:identifier'),
		label: getText(element, 'rdfs:label'),
		description: getText(element, 'dc:description'),
		notation: getText(element, 'skos:notation'),
		uri
	};
};

const extractClass = (element) => {
	const base = extractBaseProperties(element);

	const subClassOf = element['rdfs:subClassOf'];
	let parentRef;
	if (subClassOf && subClassOf.length) {
		for (const sc of subClassOf) {
			if (typeof sc === 'object' && sc['$'] && sc['$']['rdf:resource']) {
				const ref = sc['$']['rdf:resource'];
				if (isCedsUri(ref)) {
					parentRef = ref;
					break;
				}
			}
		}
	}

	return { ...base, parentRef };
};

const extractProperty = (element) => {
	const base = extractBaseProperties(element);

	const allRangeRefs = getResourceRefs(element, 'schema:rangeIncludes');
	const domainRefs = getResourceRefs(element, 'schema:domainIncludes').filter(isCedsUri);
	const rangeRefs = allRangeRefs.filter(isCedsUri);

	const xsdRefs = allRangeRefs.filter(r => r.startsWith(XSD_PREFIX));
	const dataType = xsdRefs.length > 0
		? xsdRefs[0].replace(XSD_PREFIX, '')
		: undefined;

	const textFormat = getText(element, 'textFormat');
	const maxLength = getText(element, 'maxLength');

	const result = { ...base, domainRefs, rangeRefs };
	if (dataType) { result.dataType = dataType; }
	if (textFormat) { result.textFormat = textFormat; }
	if (maxLength) { result.maxLength = maxLength; }

	return result;
};

const extractOptionValue = (element) => {
	const base = extractBaseProperties(element);

	const inSchemeRefs = getResourceRefs(element, 'skos:inScheme');
	const inSchemeRef = inSchemeRefs.length > 0 ? inSchemeRefs[0] : undefined;

	return { ...base, inSchemeRef };
};

// ============================================================
// Main parser
// ============================================================

const parseRdf = async (rdfPath) => {
	const { xLog } = process.global;

	if (!fs.existsSync(rdfPath)) {
		throw new Error(`RDF file not found: ${rdfPath}`);
	}

	xLog.status(`[rdfParser] Reading ${rdfPath}...`);
	const xml = fs.readFileSync(rdfPath, 'utf8');

	xLog.status(`[rdfParser] Parsing XML (${(xml.length / 1024 / 1024).toFixed(1)} MB)...`);
	const parsed = await xml2js.parseStringPromise(xml);

	const root = parsed['rdf:RDF'];

	// Extract version
	const ontologyElements = root['owl:Ontology'] || [];
	const version = ontologyElements.length > 0
		? getText(ontologyElements[0], 'owl:versionInfo') || 'unknown'
		: 'unknown';

	xLog.status(`[rdfParser] Ontology version: ${version}`);

	// Collect raw elements
	const rdfsClasses = (root['rdfs:Class'] || []).filter(el => isCedsUri(getAttr(el, 'rdf:about')));
	const owlClasses = (root['owl:Class'] || []).filter(el => isCedsUri(getAttr(el, 'rdf:about')));
	const rdfProperties = (root['rdf:Property'] || []).filter(el => isCedsUri(getAttr(el, 'rdf:about')));
	const namedIndividuals = (root['owl:NamedIndividual'] || []).filter(el => isCedsUri(getAttr(el, 'rdf:about')));

	xLog.status(`[rdfParser] Raw counts — rdfs:Class=${rdfsClasses.length}, owl:Class=${owlClasses.length}, rdf:Property=${rdfProperties.length}, owl:NamedIndividual=${namedIndividuals.length}`);

	// Classify classes vs option sets
	const classes = [];
	const optionSets = [];

	for (const el of rdfsClasses) {
		if (hasConceptSchemeType(el)) {
			optionSets.push(extractClass(el));
		} else {
			classes.push(extractClass(el));
		}
	}

	for (const el of owlClasses) {
		if (hasConceptSchemeType(el)) {
			optionSets.push(extractClass(el));
		} else {
			classes.push(extractClass(el));
		}
	}

	const properties = rdfProperties.map(extractProperty);
	const optionValues = namedIndividuals.map(extractOptionValue);

	return {
		version,
		counts: {
			classes: classes.length,
			properties: properties.length,
			optionSets: optionSets.length,
			optionValues: optionValues.length
		},
		entities: {
			classes,
			properties,
			optionSets,
			optionValues
		}
	};
};

module.exports = { parseRdf };
