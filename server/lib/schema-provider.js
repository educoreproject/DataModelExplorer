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
// W-D-17 (campaign P1, 2026-10-06): the live _source list is the DME's one declared query, shared with every dme_* verb
const { LIVE_SOURCE_LIST_CYPHER, OPTION_SET_EDGE_TYPE_LIST, HUB_LIST_CYPHER, HUB_DECOMPOSITION_SLOT_LIST, hubDecompositionEdgeTypeList } = require('../../cli/lib.d/data-model-explorer/lib/toolPayloadContract');
// ⟪ctdlHub P7⟫ the hubs are read from the graph (every :HubDefinition), and the hub prose is generated from them: a graph
// may hold several (CEDS and CTDL), each a peer; an equivalence runs through ONE card, so never across hubs
const LIVE_MATCH_BASIS_LIST_CYPHER = 'MATCH ()-[matchEdge:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(:HubReference) WHERE matchEdge.matchBasis IS NOT NULL RETURN DISTINCT matchEdge.matchBasis AS matchBasis ORDER BY matchBasis';

const LIVE_ROLE_LIST_CYPHER = 'MATCH (n:ForgedNode) WHERE n.role IS NOT NULL RETURN DISTINCT n.role AS role ORDER BY role';

// the structural edge types the guidance explains, each with what it means; the section lists those the live graph
// holds (an edge type the graph lacks is not described as if it existed)
const STRUCTURAL_EDGE_MEANING_BY_TYPE = {
	HAS_CLASS: 'a standard root owns a class',
	SUBCLASS_OF: 'class to parent class',
	HAS_PROPERTY: 'a class owns a property (CEDS, Ed-Fi; PESC from DmeSupport); in SIF the root owns each Question',
	HAS_OPTION_SET: 'a property owns its code list (CEDS, Ed-Fi, PESC); in SIF the Question\'s instance Field points at its Codeset (read SIF code lists through the instances), and the root owns each Codeset',
	HAS_VALUE: 'an option set owns its values',
	HAS_SUPPORT: 'from a standard root only, to its support/type scaffolding',
	REFERENCES: 'intra-standard cross reference',
	REFERENCES_TYPE: 'a property refers to its type (Ed-Fi, PESC)',
	REFERENCES_OBJECT: 'SIF: a Field refers to the Object it holds',
	HAS_INSTANCE: 'SIF/PESC: an element stands for each of its occurrences',
	HAS_FIELD: 'SIF: an Object has a Field',
	HAS_CHILD: 'element contains element (SIF nesting, PESC occurrences)',
	// ⟪lane DES, 2026-10-12⟫ the CEDS LAYER edges (see "CEDS Layers" below); listed only when the graph holds them
	HAS_LAYER: 'a standard root to one of its LAYERS (a separately published companion: for CEDS the Ontology Guide V14 Appendix A and the U+FFFD text repairs)',
	HAS_PRIMARY_CONCEPT: 'CEDS class to its primary Conceptual Model concept (Ontology Guide V14, Table A-1)',
	HAS_SECONDARY_CONCEPT: 'CEDS class to its secondary Conceptual Model concept (Ontology Guide V14, Table A-1)',
	HAS_EVENT_DATE_CONCEPT: 'CEDS date property to the concepts Ontology Guide V14 Table A-2 lists for it (an Event date)',
	DECLARES_CONCEPT: 'the Ontology Guide layer root to a Conceptual Model concept',
	REPAIRS_TEXT_OF: 'a text repair to the CEDS node whose U+FFFD-damaged text it repairs (shown BESIDE the faithful text, never instead)',
	DECLARES_REPAIR: 'the text-repair layer root to one repair',
};

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
		assertion: 'the element and the hub tuple mean the same thing',
	},
	{
		edgeType: 'CLOSE_MATCH',
		skosPredicate: 'closeMatch',
		assertion: 'near enough to stand in for each other in some contexts, but not interchangeable',
	},
	{
		edgeType: 'BROAD_MATCH',
		skosPredicate: 'broadMatch',
		assertion: 'the hub tuple is BROADER than the element',
	},
	{
		edgeType: 'NARROW_MATCH',
		skosPredicate: 'narrowMatch',
		assertion: 'the hub tuple is NARROWER than the element',
	},
];

const MATCH_EDGE_TYPE_ALTERNATION = MATCH_RELATION_LIST.map(
	(matchRelation) => matchRelation.edgeType,
).join('|');

// ----------------------------------------------------------------------------
// Group labels by detected standard prefix.

const groupLabels = (labels) => {
	const grouped = STANDARD_GROUPS.map((g) => ({ name: g.name, prefixes: g.prefixes, labels: [] }));
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
	liveRoleList,
	liveSourceList,
	hubList,
	liveMatchBasisList,
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
		`A forge property graph of education data standards on a universal contract: every node carries the :ForgedNode super-label plus a role and a _source. Cross-standard meaning is anchored on ${hubAnchorTextFor(hubList)}. Elements resolve to hub tuples (:HubReference cards, each carrying its hub's \`hubName\`) through four match edges, one per SKOS mapping relation (EXACT_MATCH, CLOSE_MATCH, BROAD_MATCH, NARROW_MATCH). Every match edge is a judgment carrying its own confidence and source, never an established fact; see Cross-Standard Relationships below. (SPECIFIED_MAPPING/IMPLIED_MAPPING are retired — zero such edges exist.) The exact standards inventory is whatever the live introspection below reports — it grows as new standards are forged in.`,
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

	// example native labels: the first live label of each standard group, never a literal list; a bare group label (one
	// that IS a prefix of its own group, e.g. a label named for the standard alone) is no example of a native label.
	// ⟪lane R6⟫ was the literal /^(CEDS|Ceds)$/; neither DEV_p8AllWithCtdlHub nor GOLD_EVAL_261013_jevQuestionPerBridge
	// holds any bare prefix label (measured), so the sample is unchanged
	const sampleLabelList = grouped.map((labelGroup) => labelGroup.labels.find((labelName) => labelGroup.prefixes.indexOf(labelName) === -1) || labelGroup.labels[0]).filter(Boolean).slice(0, 4);
	const structuralEdgeLineList = Object.keys(STRUCTURAL_EDGE_MEANING_BY_TYPE)
		.filter((edgeType) => relationshipTypes.includes(edgeType))
		.map((edgeType) => `- **${edgeType}** — ${STRUCTURAL_EDGE_MEANING_BY_TYPE[edgeType]}`);
	lines.push(curatedGuidanceFor({ liveRoleList, liveSourceList, sampleLabelList, structuralEdgeLineList, hubList, liveMatchBasisList, relationshipTypes }));

	return lines.join('\n');
};

// ----------------------------------------------------------------------------
// ⟪ctdlHub P7⟫ the hub prose, generated from the graph's :HubDefinitions

// "1 hub: CEDS 14.0.0.0" / "2 hubs: CEDS 14.0.0.0, CTDL Release 20260327"
const hubAnchorTextFor = (hubList) => `${hubList.length} hub${hubList.length === 1 ? '' : 's'}: ${hubList.map((hubRow) => `${hubRow.hubName} ${hubRow.hubVersion}`).join(', ')}`;
// what each hub's cards are keyed by, in the hub's own words (HubDefinition.canonicalKeyName)
// a HubDefinition that names no canonicalKeyName is SAID so, never given a stand-in name
const hubCardIdentifierTextFor = (hubList) => hubList.map((hubRow) => `${hubRow.hubName}: ${hubRow.canonicalKeyName ? hubRow.canonicalKeyName : 'its HubDefinition names no canonicalKeyName'}`).join('; ');
// the slot edges each hub's cards decompose through, per hub: the declared slots this graph actually holds (a hub that mints
// no term tier has no HAS_<HUB>_TERM, and the text never names an edge the graph lacks)
const hubDecompositionTextFor = (hubList, relationshipTypes) => hubList.map((hubRow) => hubDecompositionEdgeTypeList(hubRow.hubName).filter((edgeType) => relationshipTypes.includes(edgeType)).join(', ')).join('; ');
// the passages that exist only when the graph holds what they describe
const termTierTextFor = (relationshipTypes) => (relationshipTypes.includes('HAS_TERM_REFERENCE')
	? `\n\nA hub may also mint a **term** tier: one HubReference per hub-native term (\`referenceTier\` 'term', keyed by \`termIri\`, no \`canonicalKey\`), decomposing to its term by its own slot edge (e.g. HAS_CTDL_TERM). Each property-tier card points at the term card of its own property by **HAS_TERM_REFERENCE** (card to card, not a decomposition), so every match landing anywhere on one term is one hop away: \`(term:HubReference {referenceTier: 'term'})<-[:HAS_TERM_REFERENCE]-(propertyCard)\`. The graph's SchemaView nodes document both edges.`
	: '');
const declaredCorrespondenceTextFor = (relationshipTypes) => (relationshipTypes.includes('DECLARED_CORRESPONDENCE')
	? `\n\n**DECLARED_CORRESPONDENCE** is NOT a match edge: it carries a published cross-IRI assertion verbatim (\`sourcePredicate\`: owl:equivalentClass, skos:relatedMatch, rdfs:subPropertyOf, …) from one standard's term to another's, the source's own words. Never read it as EXACT/CLOSE/BROAD/NARROW and never compose it with match edges. Its edge also carries forge stamps (\`mappingKind\` 'authored', \`mappingSource\`): they say who published the statement, not that it is a mapping. Call it a declared correspondence, a published statement; never a mapping and never an 'authored mapping'.`
	: '');

// ----------------------------------------------------------------------------
// Curated prose appendix — describes the cross-cutting structure and gives
// canonical query patterns. Hand-edited; survives forge additions.

const curatedGuidanceFor = ({ liveRoleList, liveSourceList, sampleLabelList, structuralEdgeLineList, hubList, liveMatchBasisList, relationshipTypes }) => `## The Universal Forge Contract

Every node in the graph carries a uniform contract:

- **Super-label** \`:ForgedNode\` on every node.
- **\`role\` property** — one of ${liveRoleList.join(', ')} (live: MATCH (n:ForgedNode) RETURN DISTINCT n.role). The role tells you what a node IS, independent of which standard it came from.
- **\`_source\` property** — the standard the node belongs to; the live values are ${liveSourceList.join(', ')}. The inventory grows as standards are forged in; never assume a fixed list (dme_list_standards reads it).
- **Native labels are retained** — a node may also carry its standard-specific label (${sampleLabelList.join(', ')}, …) alongside :ForgedNode. Prefer matching on \`:ForgedNode\` + \`role\` + \`_source\` for portable queries.
- **Key properties:** \`_id\`, \`_source\`, \`name\`, \`description\`, \`path\`, \`parentId\`, \`stableId\`, \`role\`. A DmeOptionValue's value text lives in \`name\`.

## Cross-Standard Relationships

Cross-standard meaning is anchored on ${hubAnchorTextFor(hubList)} (each a :HubDefinition). A source element connects to a **HubReference** — one hub's canonical *tuple* (domain + property + range [+ value]), keyed by \`canonicalKey\` (${hubCardIdentifierTextFor(hubList)}) and carrying its hub's \`hubName\` — by one of four match edges, one per SKOS mapping relation. The edge type and its \`predicate\` property name the relation:

${MATCH_RELATION_LIST.map(
	(matchRelation) =>
		`- **${matchRelation.edgeType}** (\`predicate\` '${matchRelation.skosPredicate}') — ${matchRelation.assertion}.`,
).join('\n')}

### Every match edge is a judgment

No match edge is a fact. Each records a decision in three fields — read them, never assume them:

- **\`mappingKind\`** — how the mapping came to exist: \`inferred\` (a judge chose it — today an LLM judge choosing among hub candidates retrieved for the element) or \`authored\` (a document named it: a published crosswalk or the standard's own specification).
- **\`mappingSource\`** — who decided: \`bridge-<judgeName>\` for a judged edge, naming the actual judge (e.g. \`bridge-jev\`), \`crosswalk-<name>\` or \`standard-<name>\` for an authored one. **\`bridge-debug\`** means a DEBUG judge produced the edge mechanically: a placeholder that says nothing about meaning — never present it as a mapping.
- **\`matchBasis\`** — WHERE THE AUTHORITY LIES, and the one field that says it (live values: ${liveMatchBasisList.length ? liveMatchBasisList.join(', ') : 'none recorded in this graph'}): \`derived\` is a judgment, \`standard\` the source standard's own published mapping, \`declaredIdentity\` the same IRI declared on both sides. The edge TYPE never carries authority: an EXACT_MATCH may be derived, a CLOSE_MATCH may be published. Filter on \`matchBasis\`, not on the relation.
- **\`mappingConfidence\`** — on judged edges only, the judge's confidence, 0–1. Current builds use three bands: 0.9 strong, 0.7 moderate, 0.5 weak but real; a debug judge's edges carry 0. Authored edges carry none. (Graphs built before these three fields carry the number only as \`confidence\`.)

**Relation and confidence are independent axes.** The relation says WHAT correspondence is asserted; the confidence says HOW SURE the judge is of it. An EXACT_MATCH at 0.5 is a weakly held claim of sameness; a NARROW_MATCH at 0.9 is a firmly held claim that the hub tuple is narrower. Never read EXACT_MATCH as "more certain", a high confidence as "more exact", or a mapping as authoritative unless its \`matchBasis\` is \`standard\` or \`declaredIdentity\` (on a graph that predates matchBasis: unless its \`mappingKind\` is \`authored\`). Present every mapping with its relation, confidence and source. The full live property list is in Match Edge Properties above.

### Reading two elements through one hub

Two source elements that resolve to the SAME HubReference are related through that card's hub, and the relation between them is only as good as both hops. When BOTH hops are EXACT_MATCH the pair is an equivalence composed from two judgments; report both hops' relation and confidence and never combine them into one number. A pair with a CLOSE_MATCH hop is a candidate, weaker still. BROAD_MATCH and NARROW_MATCH never compose to equivalence: two elements can both be narrower than one broad hub tuple without being the same thing.

**Hubs are peers and never chain.** Two elements are equivalent through a hub only when both reach the SAME card; a card of one hub never leads to a card of another. Name the hub of every mapping you report (\`hub.hubName\`), filter every query by it, and when an element reaches cards of two hubs, report the two hubs separately, never as one list.

A HubReference decomposes to its own hub's leaves via HAS_<HUB>_DOMAIN, HAS_<HUB>_PROPERTY, HAS_<HUB>_RANGE, HAS_<HUB>_VALUE, HAS_<HUB>_QUALIFIER (in this graph: ${hubDecompositionTextFor(hubList, relationshipTypes)}) — so a match reads back as an ordinary property/value target of that hub's standard.${termTierTextFor(relationshipTypes)}${declaredCorrespondenceTextFor(relationshipTypes)}

Match edges originate from source-standard elements (DmeProperty; in SIF and PESC, the DmeInstance nodes described below; DmeOptionSet/DmeOptionValue where a build judges codesets) and point at a :HubReference. (Legacy SPECIFIED_MAPPING/IMPLIED_MAPPING edges, which pointed directly at hub leaf nodes, are retired in the equivalence graph.)

## Node Structural Categories (by role)

- **DmeStandardRoot** — the per-standard root node. Props: _source, name, standardName, description, version, sourceUrl, stableId. Owns classes via HAS_CLASS (in SIF also its Questions via HAS_PROPERTY and its Codesets via HAS_OPTION_SET) and its scaffolding via HAS_SUPPORT; HAS_SUPPORT edges start only at a standard root.
- **DmeClass** — structural hubs. In most standards they own properties (HAS_PROPERTY) and sit under parents (SUBCLASS_OF); SIF objects own Fields by HAS_FIELD and have no HAS_PROPERTY. The standard's StandardDefinition card (standardUsageTips) says what its classes own.
- **DmeProperty** — the richest traversal targets. They carry match edges to :HubReference (directly, or on their HAS_INSTANCE instances) and may own option sets: HAS_OPTION_SET in CEDS, Ed-Fi and PESC; in SIF the code list hangs off the Question's Fields (its DmeInstance nodes) by HAS_OPTION_SET, and every SIF code set carries a name built from the elements that use it. No DmeProperty has HAS_SUPPORT.
- **DmeOptionSet** — connect to allowed values via HAS_VALUE; may carry cross-standard mappings to other option sets.
- **DmeOptionValue** — traversal-terminal. The value text is in \`name\`.
- **DmeSupport** — supplementary detail and scaffolding (HAS_SUPPORT targets, SIF Containers, PESC schema files and groups). Never a mapping unit.
- **DmeInstance** — one occurrence of a DmeProperty in a concrete context: a SIF Field inside an Object, a PESC element occurrence inside a document section. Reached from its declaration by HAS_INSTANCE; it carries that declaration's mapping edges and no vector of its own.

- **CEDS layer roles** — DmeLayerRoot, DmeConcept, DmeTextRepair. Nodes in these roles carry the label \`StandardLayer\` and \`_source\` CEDS but are NOT CEDS V14 content; see "CEDS Layers" below.

## Structural Edges

The structural edge types this graph holds (from db.relationshipTypes()), and what each means — not every standard uses every one:

${structuralEdgeLineList.join('\n')}

A SIF Question stands for one Field per object it appears in (HAS_INSTANCE); a PESC element declaration for one occurrence per place it appears in the document.

## Instance Nodes Carry the Mappings (SIF, PESC)

In SIF and PESC the element that search finds (a DmeProperty: the SIF Question, the PESC element declaration) carries **no** match edge. The bridges fan each verdict out onto the element's HAS_INSTANCE instances (DmeInstance nodes), so read its mappings THROUGH them and group them by where each instance sits: the owning SIF Object (\`(obj)-[:HAS_FIELD]->(inst)\`) or the PESC occurrence's \`sectionPath\`. Report one line per hub tuple with the groups that hold it — never one repeated line per instance. CEDS, Ed-Fi and the other standards have no instances; their mappings sit on the element itself.

## CEDS Layers: the Conceptual Model and the text repairs

CEDS publishes more than its V14 ontology, and this graph carries two of those publications as LAYERS beside it (block kind \`layer\`), never written onto a V14 node. Every layer node carries the label \`StandardLayer\` and \`_source\` CEDS; **exclude \`StandardLayer\` whenever you count or list CEDS itself** (\`AND NOT n:StandardLayer\`). Use the dme_structure tool first; it answers the concept questions without Cypher.

- **The Conceptual Model** (CEDS Ontology Guide V14, Appendix A; layerKey guide): every class's primary (and sometimes secondary) concept among Person, Organization, Resource, Membership, Asset, Event, Claim and Provenance (HAS_PRIMARY_CONCEPT, HAS_SECONDARY_CONCEPT), and the 204 date properties that record an Event (HAS_EVENT_DATE_CONCEPT).
- **Text repairs** (layerKey textRepair): some 950 CEDS terms carry U+FFFD replacement characters in the ontology itself (e.g. 'C\uFFFDTE D\'IVOIRE'). Where the CEDS IDS v14 reference data spells the same coded value correctly, a DmeTextRepair node rides BESIDE the CEDS node (REPAIRS_TEXT_OF) with faithfulText, repairedText and its source line. Show the repaired text beside the faithful one and say which is which; never silently replace the CEDS text.

## Conventions

- **Match on the contract**, not native labels: \`(:ForgedNode {role: 'DmeProperty', _source: $source})\`.
- **Searchable nodes carry a vector embedding** in the \`embedding\` property, indexed by one vector index on \`:ForgedNode(embedding)\` (COSINE, 1024-dim). Its name varies by build: discover it with \`SHOW VECTOR INDEXES\`. A build may add a second, on \`:DmeEmbedText(textEmbedding)\`.
- **Names and descriptions are also keyword-searchable**: one FULLTEXT (BM25) index on \`:ForgedNode\` over \`name\` and \`description\`, named \`<graphName>_fulltext\` (graphName is the passport's, shown by dme_describe_graph; query it with \`CALL db.index.fulltext.queryNodes(<name>, $text)\`). dme_search and dme_graph_retriever already fuse it with the vector index (hybrid search, the default); use it directly only for an exact-word lookup the tools do not cover.
- **Pattern and spelling search**: the DME's dme_grep tool matches a regular expression against names or descriptions, or ranks names by spelling similarity, inside a time limit it enforces. In your own read-only Cypher, of APOC ONLY these seven pure text functions may be called, each by its exact name: \`apoc.text.levenshteinSimilarity\`, \`apoc.text.levenshteinDistance\`, \`apoc.text.jaroWinklerDistance\` (a distance: 0 means identical), \`apoc.text.sorensenDiceSimilarity\`, \`apoc.text.fuzzyMatch\`, \`apoc.text.clean\`, \`apoc.text.compareCleaned\`; every other apoc function and procedure is refused. Cypher's regular-expression operator \`=~\` is refused in your own Cypher (a backtracking pattern is not stopped by the query timeout and can hold the graph); for any regex, use dme_grep, which runs it inside a time limit.
- **Use parameterized queries** (\`$param\` syntax) for any user-supplied filter values.

## Example Cypher Patterns

### List the root nodes of every standard
\`\`\`cypher
MATCH (r:DmeStandardRoot)
RETURN r._source AS source, r.standardName AS standardName, r.version AS version
ORDER BY source
\`\`\`

### Cross-standard equivalents of an element (via ONE hub card; $hubName is a hub of this graph)
\`\`\`cypher
MATCH (src:ForgedNode)-[m:${MATCH_EDGE_TYPE_ALTERNATION}]->(hub:HubReference {hubName: $hubName})
WHERE toLower(src.name) CONTAINS toLower($name)
MATCH (hub)<-[m2:${MATCH_EDGE_TYPE_ALTERNATION}]-(other:ForgedNode)
WHERE other <> src
RETURN src._source AS fromStandard, src.name AS fromElement,
       type(m) AS fromRelation, m.mappingConfidence AS fromConfidence, m.mappingSource AS fromMappingSource, m.matchBasis AS fromMatchBasis,
       hub.hubName AS hubName, hub.name AS hubConcept, hub.canonicalKey AS hubCardId,
       other._source AS otherStandard, other.name AS otherElement,
       type(m2) AS otherRelation, m2.mappingConfidence AS otherConfidence, m2.mappingSource AS otherMappingSource
\`\`\`

### Hub mappings of a SIF Question or PESC element (they live on its instances; one hub at a time)
\`\`\`cypher
MATCH (decl:ForgedNode {role: 'DmeProperty'})-[:HAS_INSTANCE]->(inst:ForgedNode)-[m:${MATCH_EDGE_TYPE_ALTERNATION}]->(hub:HubReference {hubName: $hubName})
WHERE toLower(decl.name) CONTAINS toLower($name)
OPTIONAL MATCH (obj:ForgedNode)-[:HAS_FIELD]->(inst)
RETURN decl._source AS standard, decl.name AS element,
       hub.hubName AS hubName, hub.name AS hubConcept, hub.canonicalKey AS hubCardId, type(m) AS relation,
       m.mappingConfidence AS mappingConfidence, m.mappingKind AS mappingKind, m.mappingSource AS mappingSource,
       collect(DISTINCT coalesce(obj.name, inst.sectionPath)) AS instanceGroups, count(inst) AS instanceCount
\`\`\`

### Codeset values for a property (directly, or — SIF — through its instance Fields)
\`\`\`cypher
MATCH (p:ForgedNode {role: 'DmeProperty'})
WHERE toLower(p.name) CONTAINS toLower($name)
OPTIONAL MATCH (p)-[:${OPTION_SET_EDGE_TYPE_LIST.join('|')}]->(os:ForgedNode {role: 'DmeOptionSet'})
OPTIONAL MATCH (p)-[:HAS_INSTANCE]->()-[:${OPTION_SET_EDGE_TYPE_LIST.join('|')}]->(ios:ForgedNode {role: 'DmeOptionSet'})
WITH p, coalesce(os, ios) AS optionSet
WHERE optionSet IS NOT NULL
MATCH (optionSet)-[:HAS_VALUE]->(v:ForgedNode {role: 'DmeOptionValue'})
RETURN p._source AS standard, coalesce(optionSet.name, optionSet.path) AS optionSet, v.name AS value, v.description AS description
\`\`\`

### Class hierarchy walk for a standard
(SIF: the root has no HAS_CLASS; walk \`(o:ForgedNode {role: 'DmeClass', _source: $source})-[:HAS_FIELD]->(f)\` instead.)
\`\`\`cypher
MATCH (root:DmeStandardRoot {_source: $source})-[:HAS_CLASS]->(c:ForgedNode {role: 'DmeClass'})
OPTIONAL MATCH (c)-[:HAS_PROPERTY]->(p:ForgedNode {role: 'DmeProperty'})
RETURN c.name AS class, collect(DISTINCT p.name) AS properties
\`\`\`

### Compare codesets across standards (one shared hub value card; both hops are judgments)
\`\`\`cypher
MATCH (os:ForgedNode {role: 'DmeOptionSet'})-[:HAS_VALUE]->(v:ForgedNode {role: 'DmeOptionValue'})
WHERE toLower(os.name) CONTAINS toLower($name)
MATCH (v)-[mNear:${MATCH_EDGE_TYPE_ALTERNATION}]->(hub:HubReference {hubName: $hubName})<-[mFar:${MATCH_EDGE_TYPE_ALTERNATION}]-(tv:ForgedNode {role: 'DmeOptionValue'})
WHERE tv._source <> v._source
RETURN os._source AS sourceStandard, os.name AS optionSet,
       v.name AS sourceValue, tv._source AS targetStandard, tv.name AS targetValue,
       hub.hubName AS hubName, hub.name AS hubValue,
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

	taskList.push((args, next) => {
		neo4jDb.runQuery(LIVE_ROLE_LIST_CYPHER, {}, (err, records) => {
			if (err) {
				next(`schema-provider: live role list failed: ${err}`, args);
				return;
			}
			next('', { ...args, liveRoleList: records.map((r) => r.role) });
		});
	});

	taskList.push((args, next) => {
		neo4jDb.runQuery(LIVE_SOURCE_LIST_CYPHER, {}, (err, records) => {
			if (err) {
				next(`schema-provider: live _source list failed: ${err}`, args);
				return;
			}
			next('', { ...args, liveSourceList: records.map((r) => r.source) });
		});
	});

	// ⟪ctdlHub P7⟫ the hubs; a graph naming none cannot be described as anchored on anything, and says so by name
	taskList.push((args, next) => {
		neo4jDb.runQuery(HUB_LIST_CYPHER, {}, (err, records) => {
			if (err) {
				next(`schema-provider: hub list failed: ${err}`, args);
				return;
			}
			if (records.length === 0) {
				next('schema-provider: this graph holds no :HubDefinition node; the hub standard(s) cannot be named', args);
				return;
			}
			next('', { ...args, hubList: records.map((r) => ({ hubName: r.hubName, hubVersion: r.hubVersion, canonicalKeyName: r.canonicalKeyName })) });
		});
	});

	taskList.push((args, next) => {
		neo4jDb.runQuery(LIVE_MATCH_BASIS_LIST_CYPHER, {}, (err, records) => {
			if (err) {
				next(`schema-provider: live matchBasis list failed: ${err}`, args);
				return;
			}
			next('', { ...args, liveMatchBasisList: records.map((r) => r.matchBasis) });
		});
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
