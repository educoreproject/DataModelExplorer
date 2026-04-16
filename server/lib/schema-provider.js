#!/usr/bin/env node
'use strict';

// ============================================================================
// schema-provider.js — Live DME knowledge graph schema description.
//
// Returns a structured markdown schema by introspecting Neo4j on every call:
// queries db.labels(), db.relationshipTypes(), and db.schema.nodeTypeProperties().
// Labels are auto-grouped by naming-prefix into the standards inventory; a
// curated prose section explains cross-standard mapping edges, structural
// node categories, and example query patterns.
//
// Exported as a factory so the access point can supply neo4jDb at wire-up
// time:
//
//   const getSchemaDescription = require('./lib/schema-provider')({ neo4jDb });
//   getSchemaDescription((err, schemaText) => { ... });
//
// ============================================================================

const { pipeRunner, taskListPlus } =
	new (require('qtools-asynchronous-pipe-plus'))();

// ----------------------------------------------------------------------------
// Standards prefix mapping. Order matters for display.
//
// Each label is assigned to the FIRST group whose prefixes match it.
// Labels not matching any prefix fall into Infrastructure (if known) or Other.

const STANDARD_GROUPS = [
	{ name: 'CEDS', prefixes: ['CEDS', 'Ceds'] },
	{ name: 'SIF', prefixes: ['Sif'] },
	{ name: 'Ed-Fi', prefixes: ['Edfi'] },
	{ name: 'PESC', prefixes: ['Pesc'] },
	{ name: 'CTDL', prefixes: ['Ctdl'] },
	{ name: 'SEDM', prefixes: ['Sedm'] },
	{ name: 'JEDx', prefixes: ['Jedx'] },
	{ name: 'CIP', prefixes: ['Cip'] },
	{ name: 'EdMatrix', prefixes: ['EdMatrix', 'EdStandard'] },
	{
		name: 'UseCase Library',
		prefixes: ['UseCase', 'DataReference', 'DataCategory'],
	},
];

const INFRASTRUCTURE_LABELS = new Set([
	'ForgedNode',
	'GraphHistory',
	'GraphHistoryEvent',
	'GraphSource',
	'ExternalReference',
	'Organization',
	'SerializationFormat',
	'SpecLayer',
]);

// Limit per-label property listing to keep schema response compact.
const MAX_PROPERTIES_DISPLAYED = 8;

// ----------------------------------------------------------------------------
// Group labels by detected standard prefix.

const groupLabels = (labels) => {
	const grouped = STANDARD_GROUPS.map((g) => ({ name: g.name, labels: [] }));
	const infrastructure = [];
	const other = [];

	labels.forEach((label) => {
		if (INFRASTRUCTURE_LABELS.has(label)) {
			infrastructure.push(label);
			return;
		}
		const matchIdx = STANDARD_GROUPS.findIndex((g) =>
			g.prefixes.some((p) => label === p || label.startsWith(p)),
		);
		if (matchIdx >= 0) {
			grouped[matchIdx].labels.push(label);
		} else {
			other.push(label);
		}
	});

	return {
		grouped: grouped.filter((g) => g.labels.length > 0),
		infrastructure,
		other,
	};
};

// ----------------------------------------------------------------------------
// Render the assembled schema as markdown.

const renderSchema = ({ labels, relationshipTypes, propertiesByLabel }) => {
	const { grouped, infrastructure, other } = groupLabels(labels);

	const formatLabelLine = (label) => {
		const props = propertiesByLabel[label] || [];
		if (props.length === 0) return `- **${label}**`;
		const shown = props.slice(0, MAX_PROPERTIES_DISPLAYED).join(', ');
		const more =
			props.length > MAX_PROPERTIES_DISPLAYED
				? `, ... (+${props.length - MAX_PROPERTIES_DISPLAYED} more)`
				: '';
		return `- **${label}** — ${shown}${more}`;
	};

	const lines = [];
	lines.push('# EDUcore Education Standards Knowledge Graph Schema');
	lines.push('');
	lines.push(
		'A unified property graph containing nine education data standards plus a use-case library. Standards are connected by cross-standard mapping edges (MAPS_TO authoritative, IMPLIED_MAPPING inferred). Schema below is introspected live from the database.',
	);
	lines.push('');

	lines.push('## Standards Inventory');
	lines.push('');
	grouped.forEach((g) => {
		lines.push(`### ${g.name}`);
		lines.push('');
		g.labels.forEach((label) => lines.push(formatLabelLine(label)));
		lines.push('');
	});

	if (infrastructure.length > 0) {
		lines.push('### Infrastructure (cross-cutting)');
		lines.push('');
		infrastructure.forEach((label) => lines.push(formatLabelLine(label)));
		lines.push('');
	}

	if (other.length > 0) {
		lines.push('### Other');
		lines.push('');
		other.forEach((label) => lines.push(formatLabelLine(label)));
		lines.push('');
	}

	lines.push('## Relationship Types');
	lines.push('');
	relationshipTypes.forEach((rt) => lines.push(`- ${rt}`));
	lines.push('');

	lines.push(CURATED_GUIDANCE);

	return lines.join('\n');
};

// ----------------------------------------------------------------------------
// Curated prose appendix — describes the cross-cutting structure and gives
// canonical query patterns. Hand-edited; survives forge additions.

const CURATED_GUIDANCE = `## Cross-Standard Relationships

Standards are connected by two relationship types:

- **MAPS_TO** — spec-annotated crosswalks. Authoritative, confidence 1.0. Created from the source standard's own documentation. Trust these as facts.
- **IMPLIED_MAPPING** — semantically inferred correspondences from vector similarity. Lower confidence. Treat as hypotheses.

Cross-standard MAPS_TO edges originate from Property and Field nodes (SifField, EdfiField, CedsProperty, CtdlProperty, etc.). They do NOT originate from class/entity nodes or codeset values.

## Node Structural Categories

- **Class / Entity nodes** (CedsClass, EdfiEntity, JedxEntity, SifObject, CtdlClass, SedmOntologyClass) — structural hubs. Connect to parent classes and child properties.
- **Property / Field nodes** (CedsProperty, SifField, EdfiField, JedxField, PescElement, CtdlProperty) — the richest traversal targets. Connect to parent entities, option sets, type chains, and cross-standard mapping edges.
- **Option Set / Codeset / Enumeration Value nodes** (CedsOptionSet, CedsOptionValue, SifCodeset, EdfiDescriptor, EdfiDescriptorValue, JedxCodeSet, PescEnumValue, SedmOptionSet, SedmOptionValue) — traversal-terminal. They carry allowed values but have no meaningful outgoing structural relationships.
- **Complex Type nodes** (SifComplexType, SifSimpleType, PescComplexType, PescSimpleType) — shared structural templates. Traversal reveals which objects use them.
- **Use Case nodes** (UseCase, UseCaseStep, UseCaseActor, UseCaseCategory, DataReference) — process-oriented. Cross-linked to CEDS data model elements via REFERENCES_DATA edges.

## Naming Conventions

- **Label prefix = standard.** CedsX → CEDS, SifX → SIF, EdfiX → Ed-Fi, PescX → PESC, CtdlX → CTDL, SedmX → SEDM, JedxX → JEDx, CipX → CIP. EdMatrix and EdStandard belong to EdMatrix. UseCase\*, DataReference, and DataCategory belong to the use-case library.
- **Every searchable node has a vector embedding** in the \`embedding\` property. Vector indexes exist per major label.
- **Use parameterized queries** (\`$param\` syntax) for any user-supplied filter values.

## Example Cypher Patterns

### List the root nodes of every standard
\`\`\`cypher
MATCH (r) WHERE r:CedsOntology OR r:SifRoot OR r:EdfiRoot OR r:PescRoot
   OR r:CtdlRoot OR r:SedmRoot OR r:JedxRoot OR r:CipRoot OR r:EdMatrix
RETURN labels(r) AS standard, properties(r) AS metadata
\`\`\`

### Cross-standard mappings for a CEDS property
\`\`\`cypher
MATCH (cp:CedsProperty {label: $cedsLabel})<-[:MAPS_TO]-(other)
RETURN labels(other) AS standard, other.name AS field
\`\`\`

### Use cases that depend on a CEDS data element
\`\`\`cypher
MATCH (cp:CedsProperty {label: $cedsLabel})<-[:REFERENCES_DATA]-(uc:UseCase)
RETURN uc.name AS useCase, uc.description AS description
\`\`\`

### Codeset values for a CEDS property
\`\`\`cypher
MATCH (p:CedsProperty {label: $label})-[:HAS_OPTION_SET]->(:CedsOptionSet)-[:HAS_VALUE]->(v:CedsOptionValue)
RETURN v.label AS value, v.description AS description
\`\`\`

### Hierarchy walk for a SIF object
\`\`\`cypher
MATCH (o:SifObject {name: $name})-[:HAS_ROOT_ELEMENT]->(re:SifXmlElement)
OPTIONAL MATCH (re)-[:CHILD_ELEMENT*1..5]->(child:SifXmlElement)-[:REALIZED_BY]->(f:SifField)
RETURN re.name AS root, collect(DISTINCT {element: child.name, field: f.name}) AS hierarchy
\`\`\`

### Compare codesets across standards
\`\`\`cypher
MATCH (cp:CedsProperty)<-[:MAPS_TO]-(sf)
WHERE sf:SifField OR sf:EdfiField OR sf:JedxField
OPTIONAL MATCH (cp)-[:HAS_OPTION_SET]->(:CedsOptionSet)-[:HAS_VALUE]->(cedsValue:CedsOptionValue)
OPTIONAL MATCH (sf)-[:CONSTRAINED_BY]->()-[:HAS_VALUE]->(otherValue)
RETURN cp.label,
       collect(DISTINCT cedsValue.label) AS cedsValues,
       collect(DISTINCT otherValue.label) AS otherValues
\`\`\`
`;

// ----------------------------------------------------------------------------
// Main: factory taking { neo4jDb }, returning callback-style schema fetcher.

const moduleFunction = ({ neo4jDb }) => (callback) => {
	if (!neo4jDb) {
		callback('schema-provider: neo4jDb not available');
		return;
	}

	const taskList = new taskListPlus();

	taskList.push((args, next) => {
		neo4jDb.runQuery(
			'CALL db.labels() YIELD label RETURN label ORDER BY label',
			{},
			(err, records) => {
				if (err) {
					next(`schema-provider: db.labels() failed: ${err}`, args);
					return;
				}
				next('', { ...args, labels: records.map((r) => r.label) });
			},
		);
	});

	taskList.push((args, next) => {
		neo4jDb.runQuery(
			'CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType ORDER BY relationshipType',
			{},
			(err, records) => {
				if (err) {
					next(`schema-provider: db.relationshipTypes() failed: ${err}`, args);
					return;
				}
				next('', {
					...args,
					relationshipTypes: records.map((r) => r.relationshipType),
				});
			},
		);
	});

	taskList.push((args, next) => {
		neo4jDb.runQuery(
			`CALL db.schema.nodeTypeProperties()
			   YIELD nodeLabels, propertyName
			 UNWIND nodeLabels AS label
			 RETURN label, collect(DISTINCT propertyName) AS properties
			 ORDER BY label`,
			{},
			(err, records) => {
				if (err) {
					next(
						`schema-provider: db.schema.nodeTypeProperties() failed: ${err}`,
						args,
					);
					return;
				}
				const propertiesByLabel = {};
				records.forEach((r) => {
					propertiesByLabel[r.label] = r.properties;
				});
				next('', { ...args, propertiesByLabel });
			},
		);
	});

	pipeRunner(taskList.getList(), {}, (err, args) => {
		if (err) {
			callback(err);
			return;
		}
		callback('', renderSchema(args));
	});
};

module.exports = moduleFunction;
