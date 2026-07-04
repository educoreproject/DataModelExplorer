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
	// Wave-B in-graph self-documentation (educoreForge finishers): the build passport, the manifest
	// recipe + its blocks, per-standard definitions, the schema-term catalog, and the :GraphMeta
	// marker every legitimately source-less node carries. Infrastructure, not standards content.
	'GraphProvenance',
	'GraphMeta',
	'ManifestRecipe',
	'RecipeBlock',
	'StandardDefinition',
	'SchemaView',
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
		'A forge property graph of education data standards on a universal contract: every node carries the :ForgedNode super-label plus a role and a _source. Cross-standard meaning is anchored on CEDS: elements resolve to CEDS tuples (:HubReference) via EXACT_MATCH (authored) and CLOSE_MATCH (inferred) edges; two elements sharing a hub are equivalent only when both hops are EXACT_MATCH, otherwise the pair is a candidate. (SPECIFIED_MAPPING/IMPLIED_MAPPING are retired — zero such edges exist.) The exact standards inventory is whatever the live introspection below reports — it grows as new standards are forged in.',
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

const CURATED_GUIDANCE = `## The Universal Forge Contract

Every node in the graph carries a uniform contract:

- **Super-label** \`:ForgedNode\` (plus \`:golden\`) on every node.
- **\`role\` property** — one of DmeClass, DmeProperty, DmeOptionSet, DmeOptionValue, DmeSupport, DmeStandardRoot. The role tells you what a node IS, independent of which standard it came from.
- **\`_source\` property** — the standard the node belongs to (e.g. CEDS, LIF, SIF). The inventory grows as standards are forged in; never assume a fixed list.
- **Native labels are retained** — a node may also carry its standard-specific label (CedsProperty, SifField, LifProperty, …) alongside :ForgedNode. Prefer matching on \`:ForgedNode\` + \`role\` + \`_source\` for portable queries.
- **Key properties:** \`_id\`, \`_source\`, \`name\`, \`description\`, \`path\`, \`parentId\`, \`stableId\`, \`role\`. A DmeOptionValue's value text lives in \`name\`.

## Cross-Standard Relationships

Cross-standard meaning is anchored on CEDS. A source element connects to a **HubReference** — the canonical CEDS *tuple* (domain + property + range [+ value]), keyed by \`canonicalKey\` (the CEDS Global ID) — by one of two edge types:

- **EXACT_MATCH** — authored crosswalk. Deterministic/authoritative. Props: confidence (1.0), predicate ('exactMatch'), provenanceTier, mappingJustification, owner. Trust as fact.
- **CLOSE_MATCH** — semantically inferred correspondence. Props: confidence (0–1), predicate ('closeMatch'), rerankScore, cosineScore, provenanceTier, mappingJustification, owner. Treat as a scored hypothesis.

Two source elements are **equivalent** when they resolve to the SAME HubReference. A HubReference decomposes to its CEDS leaves via HAS_CEDS_DOMAIN, HAS_CEDS_PROPERTY, HAS_CEDS_RANGE, HAS_CEDS_VALUE, HAS_CEDS_QUALIFIER — so a match reads back as an ordinary CEDS property/value target.

Match edges originate from DmeProperty (and DmeOptionSet/DmeOptionValue) source nodes and point at a :HubReference. (Legacy SPECIFIED_MAPPING/IMPLIED_MAPPING edges, which pointed directly at CEDS leaf nodes, are retired in the equivalence graph.)

## Node Structural Categories (by role)

- **DmeStandardRoot** — the per-standard passport node. Props: _source, name, standardName, description, version, sourceUrl, stableId. Owns classes via HAS_CLASS.
- **DmeClass** — structural hubs. Connect to parent classes (SUBCLASS_OF) and child properties (HAS_PROPERTY).
- **DmeProperty** — the richest traversal targets. Connect to parent classes, option sets (HAS_OPTION_SET), supports (HAS_SUPPORT), and cross-standard mapping edges.
- **DmeOptionSet** — connect to allowed values via HAS_VALUE; may carry cross-standard mappings to other option sets.
- **DmeOptionValue** — traversal-terminal. The value text is in \`name\`.
- **DmeSupport** — supplementary detail attached to a node via HAS_SUPPORT.

## Structural Edges

HAS_PROPERTY, HAS_OPTION_SET, HAS_VALUE, HAS_SUPPORT, HAS_CLASS, SUBCLASS_OF, and REFERENCES (intra-standard cross references).

## Conventions

- **Match on the contract**, not native labels: \`(:ForgedNode {role: 'DmeProperty', _source: 'CEDS'})\`.
- **Every searchable node has a vector embedding** in the \`embedding\` property. There is ONE vector index, \`golden_vector\`, on \`:ForgedNode(embedding)\` (COSINE, 1024-dim). There is NO fulltext index.
- **Use parameterized queries** (\`$param\` syntax) for any user-supplied filter values.

## Example Cypher Patterns

### List the root nodes of every standard
\`\`\`cypher
MATCH (r:DmeStandardRoot)
RETURN r._source AS source, r.standardName AS standardName, r.version AS version
ORDER BY source
\`\`\`

### Cross-standard equivalents of an element (via the CEDS tuple)
\`\`\`cypher
MATCH (src:ForgedNode)-[m:EXACT_MATCH|CLOSE_MATCH]->(hub:HubReference)
WHERE toLower(src.name) CONTAINS toLower($name)
MATCH (hub)<-[m2:EXACT_MATCH|CLOSE_MATCH]-(other:ForgedNode)
RETURN src._source AS fromStandard, src.name AS fromElement,
       hub.name AS cedsConcept, hub.canonicalKey AS cedsId,
       other._source AS equivalentStandard, other.name AS equivalentElement,
       type(m2) AS matchType, m2.confidence AS confidence
\`\`\`

### Codeset values for a property
\`\`\`cypher
MATCH (p:ForgedNode {role: 'DmeProperty'})-[:HAS_OPTION_SET]->(:ForgedNode {role: 'DmeOptionSet'})-[:HAS_VALUE]->(v:ForgedNode {role: 'DmeOptionValue'})
WHERE toLower(p.name) CONTAINS toLower($name)
RETURN v.name AS value, v.description AS description
\`\`\`

### Class hierarchy walk for a standard
\`\`\`cypher
MATCH (root:DmeStandardRoot {_source: $source})-[:HAS_CLASS]->(c:ForgedNode {role: 'DmeClass'})
OPTIONAL MATCH (c)-[:HAS_PROPERTY]->(p:ForgedNode {role: 'DmeProperty'})
RETURN c.name AS class, collect(DISTINCT p.name) AS properties
\`\`\`

### Compare codesets across standards (equivalence model: shared CEDS value hubs)
\`\`\`cypher
MATCH (os:ForgedNode {role: 'DmeOptionSet'})-[:HAS_VALUE]->(v:ForgedNode {role: 'DmeOptionValue'})
WHERE toLower(os.name) CONTAINS toLower($name)
MATCH (v)-[mNear:EXACT_MATCH|CLOSE_MATCH]->(hub:HubReference)<-[mFar:EXACT_MATCH|CLOSE_MATCH]-(tv:ForgedNode {role: 'DmeOptionValue'})
WHERE tv._source <> v._source
RETURN os._source AS sourceStandard, os.name AS optionSet,
       v.name AS sourceValue, tv._source AS targetStandard, tv.name AS targetValue,
       hub.name AS cedsValue,
       CASE WHEN type(mNear) = 'EXACT_MATCH' AND type(mFar) = 'EXACT_MATCH'
            THEN 'equivalent' ELSE 'candidateEquivalent' END AS equivalence
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
