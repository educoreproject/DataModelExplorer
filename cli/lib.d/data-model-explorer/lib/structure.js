'use strict';

// structure.js — the dme_structure verb (lane DES, educoreForge campaign cedsRichness-101226, 2026-10-12): CEDS's own
// organising structure, which the graph carries as LAYERS beside the CEDS V14 ontology (StandardLayer nodes; amendment B
// keeps them out of every other verb). Read-only. Four modes, a registry rather than a switch:
//
//   listAreas           the DES domains (no --name), or the DES entities and categories under one DES domain (--name)
//   areaProperties      the CEDS V14 properties placed under a DES domain, entity or category (--name; --domain narrows)
//   propertyPlacements  where one CEDS V14 property sits in the DES (--name: its P-id or its name), with its V13 DES prose
//                       and, from the Ontology Guide V14, the Conceptual Model concepts of an event-date property
//   classConcepts       a CEDS class's primary and secondary Conceptual Model concept (--name: its C-id or its name)
//
// "DES domain" ALWAYS: a DES domain (K12, Postsecondary, ...) is an AREA of the Domain Entity Schema V13; it is NOT the rdfs
// domain of a property (that is the property's class, HubReference.domainName / HAS_CEDS_DOMAIN). The DES is Version 13;
// its prose is V13 text and is labelled so in every row; nothing here is ever V14 text unless it comes off the V14 node.
//
//   runStructure({ session, params, runCypherQuery, refusalFor, listEnvelopeFor, toNumber }, callback(err, payload))

const STRUCTURE_MODE_LIST = Object.freeze(['listAreas', 'areaProperties', 'propertyPlacements', 'classConcepts']);
// what --name means in each mode; a mode with no entry takes --name optionally (listAreas: absent lists the DES domains)
const REQUIRED_NAME_MEANING_BY_MODE = Object.freeze({ areaProperties: 'a DES domain, entity or category name', propertyPlacements: 'a CEDS property P-id or name', classConcepts: 'a CEDS class C-id or name' });
const STRUCTURE_ROW_LIMIT = 500;
const DES_PLACEMENT_WALK = '[:HAS_DES_ENTITY|HAS_DES_CATEGORY*0..5]';
const NOT_THE_RDFS_DOMAIN_TEXT = 'A DES domain is an area of the CEDS Domain Entity Schema (Version 13), not the rdfs domain of a property (the property\'s class).';

const LAYER_PRESENT_CYPHER = "MATCH (root:StandardLayer {role: 'DmeLayerRoot', layerKey: 'des'}) RETURN root.layerVersion AS desVersion, root.sourceUrl AS sourceUrl LIMIT 1";

const CYPHER_BY_MODE = Object.freeze({
	listAreas: `
		MATCH (area:StandardLayer {role: 'DmeArea'})
		WHERE ($name IS NULL AND area.areaKind = 'desDomain') OR ($name IS NOT NULL AND area.desDomainName = $name AND area.areaKind <> 'desDomain')
		OPTIONAL MATCH (area)-${DES_PLACEMENT_WALK}->(holder)-[:HAS_DES_PLACEMENT]->(placement)
		OPTIONAL MATCH (placement)-[:PLACES_PROPERTY]->(property)
		WITH area, count(DISTINCT placement) AS placementCount, count(DISTINCT property) AS propertyCount
		RETURN area.areaKind AS areaKind, area.desAreaPathText AS desAreaPath, area.name AS name, area.stableId AS stableId, placementCount, propertyCount
		ORDER BY desAreaPath`,
	areaProperties: `
		MATCH (area:StandardLayer {role: 'DmeArea'})
		WHERE (area.name = $name OR area.desAreaPathText = $name OR area.stableId = $name) AND ($domain IS NULL OR area.desDomainName = $domain)
		MATCH (area)-${DES_PLACEMENT_WALK}->(holder)-[:HAS_DES_PLACEMENT]->(placement)
		OPTIONAL MATCH (placement)-[:PLACES_PROPERTY]->(property)
		OPTIONAL MATCH (placement)-[:PLACES_ELEMENT]->(element)
		RETURN area.desAreaPathText AS matchedDesArea, placement.desAreaPathText AS placementDesPath, placement.dataModelId AS dataModelId,
		       property.cedsId AS propertyId, property.name AS propertyName, element.name AS desV13ElementName, element.globalId AS globalId
		ORDER BY matchedDesArea, placementDesPath, propertyName, desV13ElementName`,
	propertyPlacements: `
		MATCH (property:ForgedNode {role: 'DmeProperty'})
		WHERE NOT property:StandardLayer AND (property.cedsId = $name OR toLower(property.name) = toLower($name))
		OPTIONAL MATCH (property)<-[:PLACES_PROPERTY]-(placement)
		WITH property, placement ORDER BY placement.desAreaPathText
		WITH property, collect(DISTINCT { desPlacementPath: placement.desAreaPathText, dataModelId: placement.dataModelId }) AS placementList
		OPTIONAL MATCH (property)<-[:SAME_GLOBAL_ID_PROPERTY]-(element)
		OPTIONAL MATCH (property)-[eventEdge:HAS_EVENT_DATE_CONCEPT]->(eventConcept)
		WITH property, placementList, element, eventEdge, eventConcept ORDER BY eventEdge.conceptOrdinal
		RETURN property.cedsId AS propertyId, property.name AS propertyName, property._source AS standard,
		       [onePlacement IN placementList WHERE onePlacement.desPlacementPath IS NOT NULL] AS desPlacementList,
		       CASE WHEN element IS NULL THEN null ELSE { desVersion: element.desVersion, desV13ElementName: element.name, desV13Definition: element.definition,
		            desV13AlternateName: element.desAlternateName, desV13UsageNotes: element.desUsageNotes, desV13UseCaseConnection: element.desUseCaseConnectionText,
		            desV13TechnicalName: element.desTechnicalName, globalId: element.globalId } END AS desV13Element,
		       collect(DISTINCT eventConcept.name) AS guideV14EventDateConceptList`,
	classConcepts: `
		MATCH (class:ForgedNode {role: 'DmeClass'})
		WHERE NOT class:StandardLayer AND (class.cedsId = $name OR toLower(class.name) = toLower($name))
		OPTIONAL MATCH (class)-[primaryEdge:HAS_PRIMARY_CONCEPT]->(primaryConcept)
		OPTIONAL MATCH (class)-[:HAS_SECONDARY_CONCEPT]->(secondaryConcept)
		RETURN class.cedsId AS classId, class.name AS className, primaryEdge.guideClassName AS guideV14ClassName,
		       primaryConcept.name AS primaryConcept, secondaryConcept.name AS secondaryConcept, primaryConcept.definition AS primaryConceptDefinition`,
});

const NOTE_BY_MODE = Object.freeze({
	listAreas: `Rows are DES areas with the placements and distinct CEDS V14 properties beneath them. ${NOT_THE_RDFS_DOMAIN_TEXT}`,
	areaProperties: `One row per DES placement under the matched DES area(s): the CEDS V14 property it places (by Global ID only), or none for a DES V13 element CEDS V14 retired. ${NOT_THE_RDFS_DOMAIN_TEXT}`,
	propertyPlacements: `Where the property sits in the DES (Version 13) and what the DES V13 says of it (labelled V13: never the V14 text). guideV14EventDateConceptList comes from Table A-2 of the CEDS Ontology Guide V14. ${NOT_THE_RDFS_DOMAIN_TEXT}`,
	classConcepts: 'The CEDS Conceptual Model concept(s) the CEDS Ontology Guide V14 (Appendix A, Table A-1) assigns the class; guideV14ClassName is the class name as the guide prints it.',
});

const runStructure = ({ session, params, runCypherQuery, refusalFor, listEnvelopeFor, toNumber }, callback) => {
	const mode = params.mode;
	if (STRUCTURE_MODE_LIST.indexOf(mode) === -1) {
		callback('', refusalFor('structure', 'invalidStructureMode', `structure --mode must be one of ${STRUCTURE_MODE_LIST.join(', ')}; got '${mode}'.`, STRUCTURE_MODE_LIST));
		return;
	}
	const name = typeof params.name === 'string' && params.name.trim() !== '' ? params.name.trim() : null;
	if (REQUIRED_NAME_MEANING_BY_MODE[mode] !== undefined && name === null) {
		callback('', refusalFor('structure', 'emptyName', `structure --mode=${mode} needs --name (${REQUIRED_NAME_MEANING_BY_MODE[mode]}).`));
		return;
	}
	const domain = typeof params.domain === 'string' && params.domain.trim() !== '' ? params.domain.trim() : null;
	if (domain !== null && mode !== 'areaProperties') {
		callback('', refusalFor('structure', 'flagNotForStructureMode', `structure --domain narrows --mode=areaProperties only; --mode=${mode} does not take it.`));
		return;
	}
	runCypherQuery(session, LAYER_PRESENT_CYPHER, {}, (presenceError, presenceResult) => {
		if (presenceError) {
			callback(presenceError);
			return;
		}
		if (presenceResult.records.length === 0) {
			callback('', refusalFor('structure', 'noDesLayer', 'this graph carries no CEDS Domain Entity Schema layer (no StandardLayer root with layerKey des); it was built without the des layer.'));
			return;
		}
		runCypherQuery(session, CYPHER_BY_MODE[mode], { name, domain }, (queryError, queryResult) => {
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
			if (rowList.length === 0 && name !== null) {
				callback('', refusalFor('structure', 'nothingMatched', `structure --mode=${mode}: nothing is named '${name}'${domain ? ` in DES domain '${domain}'` : ''}. ${mode === 'areaProperties' ? 'Use --mode=listAreas to see the DES areas.' : 'dme_search finds nodes by meaning.'}`));
				return;
			}
			callback('', {
				...listEnvelopeFor('structure', rowList.slice(0, STRUCTURE_ROW_LIMIT), rowList.length),
				mode,
				desVersion: presenceResult.records[0].get('desVersion'),
				note: NOTE_BY_MODE[mode],
			});
		});
	});
};

module.exports = { runStructure, STRUCTURE_MODE_LIST };
