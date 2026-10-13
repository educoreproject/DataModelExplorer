'use strict';

// structure.js — the dme_structure verb (lane DES, educoreForge campaign cedsRichness-101226, 2026-10-12; lane UNDES,
// 2026-10-13, removed the V13 structure layer and its three modes): CEDS's Conceptual Model, which the graph carries as the
// `guide` LAYER beside the CEDS V14 ontology (StandardLayer nodes; amendment B keeps them out of every other verb). Read-only.
// Two modes, a registry rather than a switch:
//
//   classConcepts     a CEDS class's primary and secondary Conceptual Model concept (--name: its C-id or its name)
//   propertyConcepts  the Conceptual Model concepts the Ontology Guide V14 lists for a CEDS date property that records an
//                     Event (Table A-2), in the guide's order (--name: its P-id or its name)
//
//   runStructure({ session, params, runCypherQuery, refusalFor, listEnvelopeFor, toNumber }, callback(err, payload))

const STRUCTURE_MODE_LIST = Object.freeze(['classConcepts', 'propertyConcepts']);
// what --name means in each mode (every mode requires it)
const REQUIRED_NAME_MEANING_BY_MODE = Object.freeze({ classConcepts: 'a CEDS class C-id or name', propertyConcepts: 'a CEDS property P-id or name' });
const STRUCTURE_ROW_LIMIT = 500;

const LAYER_PRESENT_CYPHER = "MATCH (root:StandardLayer {role: 'DmeLayerRoot', layerKey: 'guide'}) RETURN root.layerVersion AS guideVersion LIMIT 1";

const CYPHER_BY_MODE = Object.freeze({
	classConcepts: `
		MATCH (class:ForgedNode {role: 'DmeClass'})
		WHERE NOT class:StandardLayer AND (class.cedsId = $name OR toLower(class.name) = toLower($name))
		OPTIONAL MATCH (class)-[primaryEdge:HAS_PRIMARY_CONCEPT]->(primaryConcept)
		OPTIONAL MATCH (class)-[:HAS_SECONDARY_CONCEPT]->(secondaryConcept)
		RETURN class.cedsId AS classId, class.name AS className, primaryEdge.guideClassName AS guideV14ClassName,
		       primaryConcept.name AS primaryConcept, secondaryConcept.name AS secondaryConcept, primaryConcept.definition AS primaryConceptDefinition`,
	propertyConcepts: `
		MATCH (property:ForgedNode {role: 'DmeProperty'})
		WHERE NOT property:StandardLayer AND (property.cedsId = $name OR toLower(property.name) = toLower($name))
		OPTIONAL MATCH (property)-[eventEdge:HAS_EVENT_DATE_CONCEPT]->(eventConcept)
		WITH property, eventEdge, eventConcept ORDER BY eventEdge.conceptOrdinal
		RETURN property.cedsId AS propertyId, property.name AS propertyName, property._source AS standard,
		       collect(eventConcept.name) AS guideV14EventDateConceptList`,
});

const NOTE_BY_MODE = Object.freeze({
	classConcepts: 'The CEDS Conceptual Model concept(s) the CEDS Ontology Guide V14 (Appendix A, Table A-1) assigns the class; guideV14ClassName is the class name as the guide prints it.',
	propertyConcepts: 'The concepts Table A-2 of the CEDS Ontology Guide V14 lists for a date property that records an Event, in the guide\'s order; an empty list means the guide does not mark this property as an Event date.',
});

const runStructure = ({ session, params, runCypherQuery, refusalFor, listEnvelopeFor, toNumber }, callback) => {
	const mode = params.mode;
	if (STRUCTURE_MODE_LIST.indexOf(mode) === -1) {
		callback('', refusalFor('structure', 'invalidStructureMode', `structure --mode must be one of ${STRUCTURE_MODE_LIST.join(', ')}; got '${mode}'.`, STRUCTURE_MODE_LIST));
		return;
	}
	const name = typeof params.name === 'string' && params.name.trim() !== '' ? params.name.trim() : null;
	if (name === null) {
		callback('', refusalFor('structure', 'emptyName', `structure --mode=${mode} needs --name (${REQUIRED_NAME_MEANING_BY_MODE[mode]}).`));
		return;
	}
	runCypherQuery(session, LAYER_PRESENT_CYPHER, {}, (presenceError, presenceResult) => {
		if (presenceError) {
			callback(presenceError);
			return;
		}
		if (presenceResult.records.length === 0) {
			callback('', refusalFor('structure', 'noGuideLayer', 'this graph carries no CEDS Ontology Guide layer (no StandardLayer root with layerKey guide); it was built without the guide layer.'));
			return;
		}
		runCypherQuery(session, CYPHER_BY_MODE[mode], { name }, (queryError, queryResult) => {
			if (queryError) {
				callback(queryError);
				return;
			}
			const rowList = queryResult.records.map((oneRecord) =>
				oneRecord.keys.reduce((soFar, fieldName) => {
					const fieldValue = oneRecord.get(fieldName);
					return { ...soFar, [fieldName]: fieldValue !== null && typeof fieldValue === 'object' && typeof fieldValue.toNumber === 'function' ? toNumber(fieldValue) : fieldValue };
				}, {}),
			);
			if (rowList.length === 0) {
				callback('', refusalFor('structure', 'nothingMatched', `structure --mode=${mode}: nothing is named '${name}'. dme_search finds nodes by meaning.`));
				return;
			}
			callback('', {
				...listEnvelopeFor('structure', rowList.slice(0, STRUCTURE_ROW_LIMIT), rowList.length),
				mode,
				guideVersion: presenceResult.records[0].get('guideVersion'),
				note: NOTE_BY_MODE[mode],
			});
		});
	});
};

module.exports = { runStructure, STRUCTURE_MODE_LIST };
