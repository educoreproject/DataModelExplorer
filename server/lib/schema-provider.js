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

// The four SKOS mapping relations a match edge can assert, one edge type each. The
// guidance prose and the live property listing both read this list.
const MATCH_RELATION_LIST = [
	{
		edgeType: 'EXACT_MATCH',
		skosPredicate: 'exactMatch',
		assertion: 'the element and the CEDS tuple mean the same thing',
	},
	{
		edgeType: 'CLOSE_MATCH',
		skosPredicate: 'closeMatch',
		assertion: 'near enough to stand in for each other in some contexts, but not interchangeable',
	},
	{
		edgeType: 'BROAD_MATCH',
		skosPredicate: 'broadMatch',
		assertion: 'the CEDS tuple is BROADER than the element',
	},
	{
		edgeType: 'NARROW_MATCH',
		skosPredicate: 'narrowMatch',
		assertion: 'the CEDS tuple is NARROWER than the element',
	},
];

const MATCH_EDGE_TYPE_ALTERNATION = MATCH_RELATION_LIST.map(
	(matchRelation) => matchRelation.edgeType,
).join('|');

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

const renderSchema = ({
	labels,
	relationshipTypes,
	propertiesByLabel,
	propertiesByRelationshipType,
}) => {
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
		'A forge property graph of education data standards on a universal contract: every node carries the :ForgedNode super-label plus a role and a _source. Cross-standard meaning is anchored on CEDS: elements resolve to CEDS tuples (:HubReference) through four match edges, one per SKOS mapping relation (EXACT_MATCH, CLOSE_MATCH, BROAD_MATCH, NARROW_MATCH). Every match edge is a judgment carrying its own confidence and source, never an established fact; see Cross-Standard Relationships below. (SPECIFIED_MAPPING/IMPLIED_MAPPING are retired — zero such edges exist.) The exact standards inventory is whatever the live introspection below reports — it grows as new standards are forged in.',
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

	// The match-edge property list is read from the live graph, never written from memory:
	// prose about edge properties went stale once (rerankScore/cosineScore/owner, none of
	// which a judged edge carries).
	const liveMatchRelationList = MATCH_RELATION_LIST.filter((matchRelation) =>
		relationshipTypes.includes(matchRelation.edgeType),
	);
	if (liveMatchRelationList.length > 0) {
		lines.push('## Match Edge Properties (live)');
		lines.push('');
		liveMatchRelationList.forEach((matchRelation) => {
			const edgePropertyList =
				propertiesByRelationshipType[matchRelation.edgeType] || [];
			lines.push(
				`- **${matchRelation.edgeType}** — ${edgePropertyList.slice().sort().join(', ')}`,
			);
		});
		lines.push('');
	}

	lines.push(CURATED_GUIDANCE);

	return lines.join('\n');
};

// ----------------------------------------------------------------------------
// Curated prose appendix — describes the cross-cutting structure and gives
// canonical query patterns. Hand-edited; survives forge additions.

const CURATED_GUIDANCE = `## The Universal Forge Contract

Every node in the graph carries a uniform contract:

- **Super-label** \`:ForgedNode\` on every node.
- **\`role\` property** — one of DmeClass, DmeProperty, DmeOptionSet, DmeOptionValue, DmeSupport, DmeStandardRoot. The role tells you what a node IS, independent of which standard it came from.
- **\`_source\` property** — the standard the node belongs to (e.g. CEDS, LIF, SIF). The inventory grows as standards are forged in; never assume a fixed list.
- **Native labels are retained** — a node may also carry its standard-specific label (CedsProperty, SifField, LifProperty, …) alongside :ForgedNode. Prefer matching on \`:ForgedNode\` + \`role\` + \`_source\` for portable queries.
- **Key properties:** \`_id\`, \`_source\`, \`name\`, \`description\`, \`path\`, \`parentId\`, \`stableId\`, \`role\`. A DmeOptionValue's value text lives in \`name\`.

## Cross-Standard Relationships

Cross-standard meaning is anchored on CEDS. A source element connects to a **HubReference** — the canonical CEDS *tuple* (domain + property + range [+ value]), keyed by \`canonicalKey\` (the CEDS Global ID) — by one of four match edges, one per SKOS mapping relation. The edge type and its \`predicate\` property name the relation:

${MATCH_RELATION_LIST.map(
	(matchRelation) =>
		`- **${matchRelation.edgeType}** (\`predicate\` '${matchRelation.skosPredicate}') — ${matchRelation.assertion}.`,
).join('\n')}

### Every match edge is a judgment

No match edge is a fact. Each records a decision in three fields — read them, never assume them:

- **\`mappingKind\`** — how the mapping came to exist: \`inferred\` (a mapping judge chose it — today an LLM judge choosing among CEDS candidates retrieved for the element), \`authored\` (a document named it: a published crosswalk or the standard's own specification), or \`invalid-debug\` (a DEBUG judge produced it mechanically — a placeholder that says nothing about meaning; never present it as a mapping).
- **\`mappingSource\`** — who decided: \`bridge-<judgeName>\` for a judged edge (e.g. \`bridge-jev\`; a debug judge's edges read \`bridge-debug\`), \`crosswalk-<name>\` or \`standard-<name>\` for an authored one.
- **\`mappingConfidence\`** — on judged edges only, the judge's confidence, 0–1. Current builds use three bands: 0.9 strong, 0.7 moderate, 0.5 weak but real. Authored edges carry none. (Graphs built before these three fields carry the number only as \`confidence\`.)

**Relation and confidence are independent axes.** The relation says WHAT correspondence is asserted; the confidence says HOW SURE the judge is of it. An EXACT_MATCH at 0.5 is a weakly held claim of sameness; a NARROW_MATCH at 0.9 is a firmly held claim that CEDS is narrower. Never read EXACT_MATCH as "more certain", a high confidence as "more exact", or a mapping as authoritative unless its \`mappingKind\` is \`authored\`. Present every mapping with its relation, confidence and source. The full live property list is in Match Edge Properties above.

### Reading two elements through one hub

Two source elements that resolve to the SAME HubReference are related through CEDS, and the relation between them is only as good as both hops. When BOTH hops are EXACT_MATCH the pair is an equivalence composed from two judgments; report both hops' relation and confidence and never combine them into one number. A pair with a CLOSE_MATCH hop is a candidate, weaker still. BROAD_MATCH and NARROW_MATCH never compose to equivalence: two elements can both be narrower than one broad CEDS tuple without being the same thing.

A HubReference decomposes to its CEDS leaves via HAS_CEDS_DOMAIN, HAS_CEDS_PROPERTY, HAS_CEDS_RANGE, HAS_CEDS_VALUE, HAS_CEDS_QUALIFIER — so a match reads back as an ordinary CEDS property/value target.

Match edges originate from source-standard elements (DmeProperty; in SIF and PESC, the DmeSupport instances described below; DmeOptionSet/DmeOptionValue where a build judges codesets) and point at a :HubReference. (Legacy SPECIFIED_MAPPING/IMPLIED_MAPPING edges, which pointed directly at CEDS leaf nodes, are retired in the equivalence graph.)

## Node Structural Categories (by role)

- **DmeStandardRoot** — the per-standard passport node. Props: _source, name, standardName, description, version, sourceUrl, stableId. Owns classes via HAS_CLASS.
- **DmeClass** — structural hubs. Connect to parent classes (SUBCLASS_OF) and child properties (HAS_PROPERTY).
- **DmeProperty** — the richest traversal targets. Connect to parent classes, option sets (HAS_OPTION_SET), supports (HAS_SUPPORT), and cross-standard mapping edges.
- **DmeOptionSet** — connect to allowed values via HAS_VALUE; may carry cross-standard mappings to other option sets.
- **DmeOptionValue** — traversal-terminal. The value text is in \`name\`.
- **DmeSupport** — supplementary detail attached to a node via HAS_SUPPORT. In SIF and PESC also the instance nodes (SIF Fields and Containers, PESC occurrences); the instances reached by HAS_INSTANCE carry those standards' mapping edges.

## Structural Edges

HAS_PROPERTY, HAS_OPTION_SET, HAS_VALUE, HAS_SUPPORT, HAS_CLASS, SUBCLASS_OF, and REFERENCES (intra-standard cross references).

SIF and PESC add three more: **HAS_INSTANCE** (an element stands for each of its occurrences — a SIF Question to one Field per object it appears in; a PESC element declaration to one occurrence per place it appears in the document), **HAS_FIELD** (SIF: an Object has a Field), and **HAS_CHILD** (element contains element — SIF Object/Container nesting, PESC occurrence nesting).

## Instance Nodes Carry the Mappings (SIF, PESC)

In SIF and PESC the element that search finds (a DmeProperty: the SIF Question, the PESC element declaration) carries **no** match edge. The bridges fan each verdict out onto the element's HAS_INSTANCE instances (DmeSupport nodes), so read its mappings THROUGH them and group them by where each instance sits: the owning SIF Object (\`(obj)-[:HAS_FIELD]->(inst)\`) or the PESC occurrence's \`sectionPath\`. Report one line per CEDS tuple with the groups that hold it — never one repeated line per instance. CEDS, Ed-Fi and the other standards have no instances; their mappings sit on the element itself.

## Conventions

- **Match on the contract**, not native labels: \`(:ForgedNode {role: 'DmeProperty', _source: 'CEDS'})\`.
- **Searchable nodes carry a vector embedding** in the \`embedding\` property, indexed by one vector index on \`:ForgedNode(embedding)\` (COSINE, 1024-dim). Its name varies by build: discover it with \`SHOW VECTOR INDEXES\`. A build may add a second, on \`:DmeEmbedText(textEmbedding)\`. There is NO fulltext index.
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
MATCH (src:ForgedNode)-[m:${MATCH_EDGE_TYPE_ALTERNATION}]->(hub:HubReference)
WHERE toLower(src.name) CONTAINS toLower($name)
MATCH (hub)<-[m2:${MATCH_EDGE_TYPE_ALTERNATION}]-(other:ForgedNode)
WHERE other <> src
RETURN src._source AS fromStandard, src.name AS fromElement,
       type(m) AS fromRelation, m.mappingConfidence AS fromConfidence, m.mappingSource AS fromMappingSource,
       hub.name AS cedsConcept, hub.canonicalKey AS cedsId,
       other._source AS otherStandard, other.name AS otherElement,
       type(m2) AS otherRelation, m2.mappingConfidence AS otherConfidence, m2.mappingSource AS otherMappingSource
\`\`\`

### CEDS mappings of a SIF Question or PESC element (they live on its instances)
\`\`\`cypher
MATCH (decl:ForgedNode {role: 'DmeProperty'})-[:HAS_INSTANCE]->(inst:ForgedNode)-[m:${MATCH_EDGE_TYPE_ALTERNATION}]->(hub:HubReference)
WHERE toLower(decl.name) CONTAINS toLower($name)
OPTIONAL MATCH (obj:ForgedNode)-[:HAS_FIELD]->(inst)
RETURN decl._source AS standard, decl.name AS element,
       hub.name AS cedsConcept, hub.canonicalKey AS cedsId, type(m) AS relation,
       m.mappingConfidence AS mappingConfidence, m.mappingKind AS mappingKind, m.mappingSource AS mappingSource,
       collect(DISTINCT coalesce(obj.name, inst.sectionPath)) AS instanceGroups, count(inst) AS instanceCount
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

### Compare codesets across standards (shared CEDS value hubs; both hops are judgments)
\`\`\`cypher
MATCH (os:ForgedNode {role: 'DmeOptionSet'})-[:HAS_VALUE]->(v:ForgedNode {role: 'DmeOptionValue'})
WHERE toLower(os.name) CONTAINS toLower($name)
MATCH (v)-[mNear:${MATCH_EDGE_TYPE_ALTERNATION}]->(hub:HubReference)<-[mFar:${MATCH_EDGE_TYPE_ALTERNATION}]-(tv:ForgedNode {role: 'DmeOptionValue'})
WHERE tv._source <> v._source
RETURN os._source AS sourceStandard, os.name AS optionSet,
       v.name AS sourceValue, tv._source AS targetStandard, tv.name AS targetValue,
       hub.name AS cedsValue,
       type(mNear) AS nearRelation, mNear.mappingConfidence AS nearConfidence,
       type(mFar) AS farRelation, mFar.mappingConfidence AS farConfidence,
       CASE WHEN type(mNear) = 'EXACT_MATCH' AND type(mFar) = 'EXACT_MATCH' THEN 'equivalentByTwoJudgments'
            WHEN type(mNear) IN ['EXACT_MATCH', 'CLOSE_MATCH'] AND type(mFar) IN ['EXACT_MATCH', 'CLOSE_MATCH'] THEN 'candidateEquivalent'
            ELSE 'relatedNotEquivalent' END AS equivalence
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

	taskList.push((args, next) => {
		neo4jDb.runQuery(
			`CALL db.schema.relTypeProperties()
			   YIELD relType, propertyName
			 RETURN relType, collect(DISTINCT propertyName) AS properties`,
			{},
			(err, records) => {
				if (err) {
					next(
						`schema-provider: db.schema.relTypeProperties() failed: ${err}`,
						args,
					);
					return;
				}
				// relType arrives quoted, e.g. ":`EXACT_MATCH`"; a type with no properties
				// reports a null propertyName.
				const propertiesByRelationshipType = {};
				records.forEach((r) => {
					const relationshipTypeName = r.relType.replace(/^:`|`$/g, '');
					propertiesByRelationshipType[relationshipTypeName] =
						r.properties.filter((propertyName) => propertyName !== null);
				});
				next('', { ...args, propertiesByRelationshipType });
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
