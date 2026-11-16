#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MapperPattern]]
// @concept: [[Neo4jAbstraction]]

// standards-neighbourhood — the named Cypher and the pure transformations behind the PESC Explorer page (DEV-123).
// One question drives every screen: "show me this node's neighbourhood" — the node, its children grouped by
// relationship type, its own mapping judgments, and (for a hub anchor) everything every standard maps to it.
//
// Graph facts this mapper leans on (probed 2026-10-13 on GOLD_EVAL_261013_qualifiers; see DEVLOG-pescExplorer.md):
//   - every ForgedNode carries a unique stableId (index forgedNodeStableIdUnique); it is the node's identity on the wire;
//   - an element's _source equals exactly one DmeStandardRoot._source (NOT its standardKey: PESC roots read
//     _source 'PESC-CollegeTranscript-1.8.0' against standardKey 'pesccollegetranscript1v8v0');
//   - PESC and SIF map from DmeInstance, Ed-Fi from DmeProperty, so every mapping read walks HAS_INSTANCE*0..1;
//   - releaseIndependentId embeds the namespace version (':v1.19.0') and, for properties, the element's POSITION
//     ('/el/4:'), so the cross-version identity strips both (see versionIdentityOf).
//
// Four synthetic node ids exist only on the wire, never in the graph: 'families:all' (every standards family the
// graph holds: the explorer's top), 'family:<standardFamily>' (one family's catalog as a node),
// 'release:<standardFamily>/<releaseLabel>' (a message offered in several versions: the version picker) and
// 'standardGroup:<standardKey>@<anchorStableId>' (one standard's elements mapped to one hub anchor). ⟪meaningsExplorer⟫ Five more walk the hub cards
// as meanings (meaningSyntheticIdPrefixList, below).
//
// A hub standard is a standard like the others (a DmeStandardRoot: root -HAS_CLASS-> class -HAS_PROPERTY-> property),
// but its anchors hang BELOW nothing: a HubReference points AT its hub's property and domain through its own hub's
// slot edges (HAS_<HUB>_PROPERTY, HAS_<HUB>_DOMAIN). So a hub property's way out to the standards mapped to it runs
// against the edge; hubElementsByHubPropertyStableId reads it, property tier only (hubElementTierList).
// ⟪lane R6⟫ a node is a hub's own property or domain because its _source is a hub's (hubName, read per node from
// :HubDefinition), never because of a hub-named label; measured on the P8 candidate graph, each hub-named property
// and class label coincides exactly with (hub _source, DmeProperty / DmeClass), so an existing hub's pages are unchanged.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

// the labels this mapper's Cypher reads; the access point refuses by name when the golden lacks one
const requiredLabelList = Object.freeze(['ForgedNode', 'DmeStandardRoot', 'DmeClass', 'DmeProperty', 'HubReference']);

// ⟪meaningsExplorer⟫ a card is matched as (:ForgedNode {stableId}) WHERE it is a HubReference: the stableId index is on ForgedNode, and a match on
// :HubReference alone scans every card (about 90 ms each on GOLD_261030_useCases; runs/meaningsExplorer/perf_before.txt)
// a JS number reaches Neo4j as a FLOAT and a slice bound refuses a float, so the cap is an integer in the Cypher text
const GROUP_ITEM_CAP = 500;
const MATCH_EDGE_TYPE_TEXT = 'EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH';
// ⟪ctdlHub P7⟫ an anchor reaches its property and domain through its OWN hub's slot edges (they were HAS_CEDS_PROPERTY /
// HAS_CEDS_DOMAIN): the card names its hub, so no literal.
const { cardHubSlotEdgeTypeTextFor, hubEdgeTypeFor, hubSlotEdgeTypeList, HUB_DECOMPOSITION_SLOT_LIST } = require('../../../../cli/lib.d/data-model-explorer/lib/toolPayloadContract');
const hubCardTupleRules = require('../../../lib/standards-query/hubCardTupleRules.json');
const { nativeIdentifierCypherTextFor } = require('../../../../cli/lib.d/data-model-explorer/lib/nativeIdentifier');
const anchorPropertySlotTextFor = (anchorVariableName) => cardHubSlotEdgeTypeTextFor(anchorVariableName, 'PROPERTY');
const anchorDomainSlotTextFor = (anchorVariableName) => cardHubSlotEdgeTypeTextFor(anchorVariableName, 'DOMAIN');

// the outgoing relationships that make a node's children; everything else (embed texts, edit history, layers,
// concept guides) is the graph's plumbing, not the standard's structure. Order is display order.
const childRelationshipTypeList = Object.freeze([
	'HAS_CLASS',
	// ⟪use-case forge Phase 5, 2026-10-30⟫ the use-case standard's root owns its cases (each opens on its own page)
	'HAS_USE_CASE',
	'HAS_PROPERTY',
	'HAS_FIELD',
	'HAS_INSTANCE',
	'HAS_CHILD',
	'HAS_OPTION_SET',
	'HAS_VALUE',
	'SUBCLASS_OF',
	'REFERENCES_TYPE',
	'REFERENCES',
	'REFERENCES_OBJECT',
	'HAS_DEFINITION',
	'HAS_SUPPORT',
]);

// the climb from a standard's root down to one of its elements, for the breadcrumb
const ancestorRelationshipTypeText = 'HAS_CLASS|HAS_PROPERTY|HAS_FIELD|HAS_INSTANCE|HAS_CHILD|HAS_OPTION_SET|HAS_VALUE|HAS_SUPPORT';
// ⟪meaningsExplorer review S6⟫ the climb's Cypher, written once: every shortest climb from a root to a node, and a climb's nodes as the breadcrumb reads them
// (ancestorChainsByStableId and meaningExpressionsByCardStableId both use these; chooseAncestorChain picks among the climbs)
const ancestorChainPathTextFor = (rootVariableName, focusVariableName) => `allShortestPaths((${rootVariableName})-[:${ancestorRelationshipTypeText}*1..8]->(${focusVariableName}))`;
const chainNodeListTextFor = (chainVariableName) =>
	`[chainNode IN nodes(${chainVariableName}) | { stableId: chainNode.stableId, name: chainNode.name, labelList: labels(chainNode), hubName: ${hubNameOfNodeTextFor('chainNode')} }]`;
// every element mapped to one card, with its standard's root ($stableId is the card): the head of the anchor fan-out and of "Expressed in"
const cardExpressionHeadText = `MATCH (anchor:ForgedNode {stableId: $stableId})<-[matchEdge:${MATCH_EDGE_TYPE_TEXT}]-(element:ForgedNode) WHERE anchor:HubReference
					MATCH (root:DmeStandardRoot {_source: element._source})`;

// label → page kind; the FIRST label in this list that a node carries decides. hubStandardNodeKind is the kind when the
// node belongs to a hub standard (its record carries the hub's hubName): a hub's own domains and properties
const kindByLabelList = Object.freeze([
	{ labelName: 'HubReference', nodeKind: 'hubAnchor' },
	{ labelName: 'DmeStandardRoot', nodeKind: 'standard' },
	{ labelName: 'DmeClass', nodeKind: 'class', hubStandardNodeKind: 'hubDomain' },
	{ labelName: 'DmeProperty', nodeKind: 'property', hubStandardNodeKind: 'hubProperty' },
	{ labelName: 'DmeInstance', nodeKind: 'instance' },
	{ labelName: 'DmeOptionSet', nodeKind: 'optionSet' },
	{ labelName: 'DmeOptionValue', nodeKind: 'optionValue' },
	{ labelName: 'DmeSupport', nodeKind: 'support' },
	{ labelName: 'DmeVocabularyTerm', nodeKind: 'support' },
	{ labelName: 'HubDefinition', nodeKind: 'support' },
	{ labelName: 'UcUseCase', nodeKind: 'useCase' },
]);

// match edge type → the page's match kind; strengthRank orders exact > close > narrow > broad (spec §5)
const matchKindByEdgeType = Object.freeze({
	EXACT_MATCH: { matchKind: 'exact', strengthRank: 1 },
	CLOSE_MATCH: { matchKind: 'close', strengthRank: 2 },
	NARROW_MATCH: { matchKind: 'narrow', strengthRank: 3 },
	BROAD_MATCH: { matchKind: 'broad', strengthRank: 4 },
});

// a match edge's strength rank as Cypher, from the registry above, so a query can order strongest first as byStrength does
const matchStrengthRankTextFor = (edgeVariableName) =>
	`CASE type(${edgeVariableName}) ${Object.entries(matchKindByEdgeType).map(([edgeType, matchKindEntry]) => `WHEN '${edgeType}' THEN ${matchKindEntry.strengthRank}`).join(' ')} END`;

// VERSION COUNTERPARTS — what definitionDigest covers, as the graph shows it (educoreForge pesc-release-forge
// walk.js, read 2026-10-14). The forge hashes the parser's model of a definition: for a type, its documentation,
// derivation and content model INCLUDING every local element's declaration; for an element, its declaration plus
// its resolved type's own definition (one level). So "different" can live in a field of the node, in a member
// (a class's properties, a code list's values) or in the type a property points at. Each is named here as data.
//   valueForm: 'verbatim' compares as stored; 'versionStripped' drops ':vX.Y.Z' first (a QName carries its
//   namespace version, which differs between any two releases and is not in the hashed model)
//   showsValues: short scalars print both values on the tile; long or structured fields are only named
const versionDifferenceFieldList = Object.freeze([
	{ fieldName: 'documentationValueList', fieldLabel: 'documentation', valueForm: 'verbatim', showsValues: false },
	{ fieldName: 'typeAsWritten', fieldLabel: 'type as written', valueForm: 'verbatim', showsValues: true },
	{ fieldName: 'minOccursAsWritten', fieldLabel: 'minimum occurrences', valueForm: 'verbatim', showsValues: true },
	{ fieldName: 'maxOccursAsWritten', fieldLabel: 'maximum occurrences', valueForm: 'verbatim', showsValues: true },
	{ fieldName: 'nillableAsWritten', fieldLabel: 'nillable', valueForm: 'verbatim', showsValues: true },
	{ fieldName: 'formAsWritten', fieldLabel: 'form', valueForm: 'verbatim', showsValues: true },
	{ fieldName: 'defaultAsWritten', fieldLabel: 'default value', valueForm: 'verbatim', showsValues: true },
	{ fieldName: 'fixedAsWritten', fieldLabel: 'fixed value', valueForm: 'verbatim', showsValues: true },
	{ fieldName: 'useAsWritten', fieldLabel: 'use', valueForm: 'verbatim', showsValues: true },
	{ fieldName: 'sequencePosition', fieldLabel: 'position in its type', valueForm: 'verbatim', showsValues: true },
	{ fieldName: 'value', fieldLabel: 'code value', valueForm: 'verbatim', showsValues: true },
	{ fieldName: 'substitutionGroupQName', fieldLabel: 'substitution group', valueForm: 'versionStripped', showsValues: true },
	{ fieldName: 'baseTypeQName', fieldLabel: 'base type', valueForm: 'versionStripped', showsValues: true },
	{ fieldName: 'derivationVariety', fieldLabel: 'derivation', valueForm: 'verbatim', showsValues: true },
	{ fieldName: 'contentStyle', fieldLabel: 'content style', valueForm: 'verbatim', showsValues: true },
	{ fieldName: 'facets', fieldLabel: 'facets', valueForm: 'verbatim', showsValues: false },
	{ fieldName: 'derivationDocumentationValueList', fieldLabel: 'derivation documentation', valueForm: 'verbatim', showsValues: false },
	{ fieldName: 'contentModelShape', fieldLabel: 'content model', valueForm: 'verbatim', showsValues: false },
]);

// the members a definition's digest covers (a class's properties, a code list's values), and the edges to the
// type a property's digest covers one level of (named or anonymous)
const versionMemberRelationshipTypeList = Object.freeze(['HAS_PROPERTY', 'HAS_VALUE']);
const versionTypeRelationshipTypeList = Object.freeze(['REFERENCES_TYPE', 'HAS_OPTION_SET']);

// the synthetic node ids; a registry, so the access point dispatches on data, not on string tests scattered about
const syntheticIdPrefixList = Object.freeze([
	{ idPrefix: 'families:', nodeKind: 'familyCatalog' },
	{ idPrefix: 'family:', nodeKind: 'family' },
	{ idPrefix: 'release:', nodeKind: 'release' },
	{ idPrefix: 'standardGroup:', nodeKind: 'standardGroup' },
]);
// (the meanings walk's five are appended below, after their own block; parseSyntheticId reads allSyntheticIdPrefixList)

// the one families-catalog id; 'families:' followed by anything else is refused by name
const FAMILY_CATALOG_STABLE_ID = 'families:all';

// ================================================================================
// ⟪meaningsExplorer, WORKORDER-meaningsExplorer-111026⟫ THE MEANINGS WALK — the hub cards (HubReference, 'meanings' to a reader) as the subject:
//   meanings:all                                     every meaning group (today: one per hub)
//   meaningHub:<hubName>                             one hub's domains (the hub classes its property cards are in)
//   meaningDomain:<domainStableId>                   one domain's property meanings, and the domain's own term meaning, listed apart
//   meaning:<cardStableId>                           one meaning: its tuple, where it is expressed, and (a property meaning) its value meanings
// ⟪meaningsPolish, TQ's ruling on punch-list items 3 and 4⟫ the walk is hub → domain → meanings. The property level that stood between a domain and its
// meanings (meaningProperty:<domainStableId>@<propertyStableId>, a grouping with no URI that held one meaning) is retired: its prefix stays registered,
// retiredLevel set, so a link made before the ruling is refused by name rather than read as a graph stableId.
// citesStableIdOfRemainder: the remainder IS a graph stableId the row stands for, so the row cites that node's URI (stage 4, withUriFields).
const meaningSyntheticIdPrefixList = Object.freeze([
	{ idPrefix: 'meanings:', nodeKind: 'meaningCatalog' },
	{ idPrefix: 'meaningHub:', nodeKind: 'meaningHub' },
	{ idPrefix: 'meaningDomain:', nodeKind: 'meaningDomain', citesStableIdOfRemainder: true },
	{ idPrefix: 'meaningProperty:', nodeKind: 'meaningProperty', retiredLevel: true },
	{ idPrefix: 'meaning:', nodeKind: 'meaning', citesStableIdOfRemainder: true },
]);

const MEANING_CATALOG_STABLE_ID = 'meanings:all';

// THE MEANINGS WALK'S GROUPING — the one place that says what the catalog's first level is. Today a meaning is grouped by its hub; a later grouping (by
// topic, say) is a new entry here and a reader for its groups, and the walk beneath the group does not change. groupNodeKind names the group level's
// synthetic kind (its handler is in the access point's handlerBySyntheticKind); groupListQueryName is the query listing the groups.
const meaningCatalogGrouping = Object.freeze({ groupNodeKind: 'meaningHub', groupIdPrefix: 'meaningHub:', groupListQueryName: 'meaningHubCatalog', relationshipType: 'HAS_MEANING_HUB' });

// the tiers the walk's lists show. A property-tier meaning is one hub property in one hub domain; a term-tier meaning is one hub element meant on its own (a
// domain's own term is listed beside its meanings, apart from them). A value-tier meaning is one code of a property in a domain: up to 7,916 under one property
// card on GOLD_261030_useCases, so it is listed only inside its property meaning, capped at GROUP_ITEM_CAP with its true count.
const meaningListTierList = Object.freeze(['property', 'term']);
const MEANING_VALUE_TIER = 'value';
// the term tier listed beside a domain: the term card whose term IS that domain (a property's own term card is no longer listed in the walk, since the
// walk has no property level; it is reachable by its URI and from the Standards Explorer, as every other term card is)
const meaningTermKindByLevel = Object.freeze({ meaningDomain: ['class'] });
const MEANING_PROPERTY_TIER = 'property';
const MEANING_TERM_TIER = 'term';

const allSyntheticIdPrefixList = Object.freeze(syntheticIdPrefixList.concat(meaningSyntheticIdPrefixList));

// a card's match edges, and the judged elements a meaning row counts
const cardMappedElementCountTextFor = (cardVariableName) => `COUNT { MATCH (${cardVariableName})<-[:${MATCH_EDGE_TYPE_TEXT}]-(mappedElement:ForgedNode) RETURN DISTINCT mappedElement }`;
// what a meaning row says it means: the card's own definition for its tier, then its hub element's
const cardDefinitionTextFor = (cardVariableName) =>
	`coalesce(${cardVariableName}.valueDefinition, ${cardVariableName}.termDefinition, ${cardVariableName}.propertyDefinition, ${cardVariableName}.description, '')`;
// one meaning as a row of the walk (the mapper's mapMeaningItem shapes it)
const meaningRowTextFor = (cardVariableName) => `{ cardStableId: ${cardVariableName}.stableId, name: ${cardVariableName}.name, hubName: ${cardVariableName}.hubName,
	referenceTier: ${cardVariableName}.referenceTier, termKind: ${cardVariableName}.termKind, description: ${cardDefinitionTextFor(cardVariableName)},
	domainName: ${cardVariableName}.domainName, qualifierNameList: coalesce(${cardVariableName}.qualifierNames, []),
	rangeName: coalesce(${cardVariableName}.rangeOptionSetName, ${cardVariableName}.rangeClassName, ${cardVariableName}.rangeDatatype),
	mappedElementCount: ${cardMappedElementCountTextFor(cardVariableName)} }`;

// ⟪meaningsClarity⟫ A PROPERTY MEANING'S VALUE MEANINGS: the value cards of the same domain, property, range and qualifiers. One rule, read by the meaning's own level
// (valueMeaningsByCardStableId, which lists them), by its domain's level (meaningsByDomainStableId, which counts them on its row) and by an /edc element page
// (valueMeaningGroupsByDomainStableId, its "as the domain of value meanings" lines). The property card, its domain and its DOMAIN edge are bound by the caller;
// the value card and its DOMAIN edge are introduced here. Prefix OPTIONAL for a count that may be 0. Needs $valueTier.
// ⟪review S3⟫ the rule is the cards' PROPERTY SIGNATURE: property, range and qualifiers. A value card belongs to the property card of its domain with the same signature
const propertySignatureTextFor = (cardVariableName) => `[${cardVariableName}.propertyKey, coalesce(${cardVariableName}.rangeOptionSetId, ''), coalesce(${cardVariableName}.qualifierKeys, [])]`;
const valueCardOfPropertyCardMatchTextFor = ({ cardVariableName, domainVariableName, domainEdgeVariableName, valueCardVariableName }) => `MATCH (${domainVariableName})<-[${valueCardVariableName}DomainEdge]-(${valueCardVariableName}:HubReference)
	WHERE type(${valueCardVariableName}DomainEdge) = type(${domainEdgeVariableName}) AND ${valueCardVariableName}.referenceTier = $valueTier AND ${propertySignatureTextFor(valueCardVariableName)} = ${propertySignatureTextFor(cardVariableName)}`;

// ⟪meaningsClarity, TQ 2026-11-11: "why do the two things it participates in not in the diagram. Don't they have a relationship to that element?"⟫ AN INCOMING
// MEANING (a "naming meaning" on an element's page): a meaning of ANOTHER domain that names this element in one of its other slots. Into a domain, on
// GOLD_261030_useCases, only property meanings do and only as RANGE: 475 such edges into CEDS domains, 77,308 into CTDL's, where one CTDL domain is the range of
// up to 1,253. Into a property or a code it is every meaning naming it as its property or value. A meaning's own DOMAIN edge is what lists it in its own domain; a
// meaning naming its own domain again in another slot is already one of that domain's meanings, so it is not counted twice. The walk's domain rows
// (meaningDomainsByHubName) and every element's meaning facts (elementMeaningFacts.js) read this one rule.
const INCOMING_SLOT_NAME_LIST = Object.freeze(HUB_DECOMPOSITION_SLOT_LIST.filter((slotName) => slotName !== 'DOMAIN'));
const incomingCardWhereTextFor = ({ cardVariableName, domainVariableName }) =>
	`NOT EXISTS { (${cardVariableName})-[${cardVariableName}OwnDomainEdge]->(${domainVariableName}) WHERE type(${cardVariableName}OwnDomainEdge) = ${cardHubSlotEdgeTypeTextFor(cardVariableName, 'DOMAIN')} }`;
// the incoming slots' edge types of a card's own hub, as a Cypher list (for a query that reads no hub list first)
const incomingSlotEdgeTypeListTextFor = (cardVariableName) => `[${INCOMING_SLOT_NAME_LIST.map((slotName) => cardHubSlotEdgeTypeTextFor(cardVariableName, slotName)).join(', ')}]`;
// a slot edge's type in words: HAS_CEDS_RANGE is the 'range' slot (hubCardTupleRules' slotList names each slot); a type it does not name is refused by name
const SLOT_NAME_BY_EDGE_SLOT_NAME = Object.freeze(hubCardTupleRules.slotList.reduce((soFar, oneSlot) => ({ ...soFar, [oneSlot.edgeSlotName]: oneSlot.slotName }), {}));
const slotNameOfEdgeTypeFor = ({ hubName, slotEdgeType }) => {
	const edgeTypePrefix = hubEdgeTypeFor(hubName, '');
	const slotName = slotEdgeType.indexOf(edgeTypePrefix) === 0 ? SLOT_NAME_BY_EDGE_SLOT_NAME[slotEdgeType.slice(edgeTypePrefix.length)] : undefined;
	if (!slotName) {
		throw new Error(`${moduleName}: '${slotEdgeType}' is not a slot edge of hub '${hubName}' (${hubCardTupleRules.slotList.map((oneSlot) => oneSlot.edgeSlotName).join(', ')})`);
	}
	return slotName;
};

// the HubReference tiers a hub property lists as its hub elements. A property-tier anchor is one hub property in
// one hub domain, the thing standards map to (1,123 of 2,777 carry judgments on GOLD_EVAL_261013_jevQuestionPerBridge);
// a value-tier anchor is one code of that property in that domain (91,825, none judged), up to 55,000 under one
// property, so listing them would bury the elements that matter. They stay reachable from anything mapped to them.
const hubElementTierList = Object.freeze(['property']);

// ⟪lane R6⟫ the hub a node belongs to: the hubName of the :HubDefinition sharing its _source, null for a node of a
// standard that is no hub
const hubNameOfNodeTextFor = (nodeVariableName) => `head(COLLECT { MATCH (nodeHubDefinition:HubDefinition {_source: ${nodeVariableName}._source}) RETURN nodeHubDefinition.hubName })`;
// the family of the standard a hub anchor's hub is (its DmeStandardRoot's standardFamily)
const anchorStandardFamilyTextFor = (anchorVariableName) => `head(COLLECT { MATCH (anchorRoot:DmeStandardRoot {_source: ${anchorVariableName}._source}) RETURN anchorRoot.standardFamily })`;

//START OF moduleFunction() ============================================================

const moduleFunction =
	({ moduleName }) =>
	({ baseMappingProcess }) => {
		// ================================================================================
		// NAMED CYPHER QUERIES — getCypher(queryName, params) → { cypher, params }

		const mappingSubjectText = `(subject)-[matchEdge:${MATCH_EDGE_TYPE_TEXT}]->(anchor:HubReference)`;

		const queryBuilderByQueryName = {
			// every family with its standards, releases and classes: the explorer's top level
			familyCatalog: () => ({
				cypher: `
					MATCH (root:DmeStandardRoot) WHERE root.standardFamily IS NOT NULL
					WITH root, COUNT { (root)-[:HAS_CLASS]->() } AS classCount
					ORDER BY root.releaseLabel, root.version
					RETURN root.standardFamily AS standardFamily, count(root) AS standardCount, count(DISTINCT root.releaseLabel) AS releaseCount,
					       sum(classCount) AS classCount, collect({ releaseLabel: root.releaseLabel, version: root.version, classCount: classCount }) AS versionList
					ORDER BY standardFamily
				`,
				params: {},
			}),

			// a hub property's hub elements (the anchors standards map to), with every judgment on each
			hubElementsByHubPropertyStableId: ({ stableId }) => ({
				cypher: `
					MATCH (:ForgedNode {stableId: $stableId})<-[propertySlotEdge]-(anchor:HubReference)
					WHERE type(propertySlotEdge) = ${anchorPropertySlotTextFor('anchor')} AND anchor.referenceTier IN $hubElementTierList
					WITH anchor ORDER BY anchor.domainName, anchor.name
					WITH count(anchor) AS itemCount, collect(anchor)[0..${GROUP_ITEM_CAP}] AS cappedAnchorList
					UNWIND cappedAnchorList AS anchor
					RETURN itemCount, collect({
					         stableId: anchor.stableId, name: anchor.name, labelList: labels(anchor),
					         description: coalesce(anchor.propertyDefinition, ''), hubDomainName: anchor.domainName,
					         hubName: anchor.hubName, hubStandardFamily: ${anchorStandardFamilyTextFor('anchor')},
					         judgmentList: [(anchor)<-[matchEdge:${MATCH_EDGE_TYPE_TEXT}]-(element:ForgedNode) | { matchEdgeType: type(matchEdge), elementStableId: element.stableId }] }) AS itemList
				`,
				params: { stableId, hubElementTierList: [...hubElementTierList] },
			}),

			familyNameList: () => ({
				cypher: `MATCH (root:DmeStandardRoot) WHERE root.standardFamily IS NOT NULL RETURN DISTINCT root.standardFamily AS standardFamily ORDER BY standardFamily`,
				params: {},
			}),

			catalogByFamily: ({ standardFamily }) => ({
				cypher: `
					MATCH (root:DmeStandardRoot {standardFamily: $standardFamily})
					RETURN root.stableId AS stableId, root.name AS name, root.standardKey AS standardKey,
					       root.standardFamily AS standardFamily, root.releaseLabel AS releaseLabel, root.version AS version,
					       coalesce(root.description, '') AS description,
					       COUNT { (root)-[:HAS_CLASS]->() } AS classCount
					ORDER BY releaseLabel, version
				`,
				params: { standardFamily },
			}),

			nodeByStableId: ({ stableId }) => ({
				cypher: `
					MATCH (focus:ForgedNode {stableId: $stableId})
					OPTIONAL MATCH (root:DmeStandardRoot {_source: focus._source})
					RETURN focus.stableId AS stableId, focus.name AS name, labels(focus) AS labelList, ${hubNameOfNodeTextFor('focus')} AS hubName,
					       coalesce(focus.definition, focus.description, focus.documentation, focus.propertyDefinition, '') AS description,
					       focus.path AS path, focus.contextText AS contextText,
					       focus.releaseIndependentId AS releaseIndependentId, focus.definitionDigest AS definitionDigest,
					       root.stableId AS rootStableId, root.name AS rootName, root.standardKey AS standardKey,
					       root.standardFamily AS standardFamily, root.releaseLabel AS releaseLabel, root.version AS version
				`,
				params: { stableId },
			}),

			nodeSummaryByStableIdList: ({ stableIdList }) => ({
				cypher: `
					MATCH (focus:ForgedNode) WHERE focus.stableId IN $stableIdList
					OPTIONAL MATCH (root:DmeStandardRoot {_source: focus._source})
					RETURN focus.stableId AS stableId, focus.name AS name, labels(focus) AS labelList, ${hubNameOfNodeTextFor('focus')} AS hubName,
					       root.standardKey AS standardKey, root.standardFamily AS standardFamily,
					       root.releaseLabel AS releaseLabel, root.version AS version
				`,
				params: { stableIdList },
			}),

			// ⟪explorerUris⟫ the standard each shown node belongs to (its _source), which is what the URI minter names it by, and whether it is a standard's root
			sourceNameByStableIdList: ({ stableIdList }) => ({
				cypher: `MATCH (node:ForgedNode) WHERE node.stableId IN $stableIdList RETURN node.stableId AS stableId, node._source AS standardSourceName, node:DmeStandardRoot AS isStandardRoot`,
				params: { stableIdList },
			}),

			// children by relationship type: the true count, the first GROUP_ITEM_CAP by name, and each item's summary
			childGroupsByStableId: ({ stableId }) => ({
				cypher: `
					MATCH (focus:ForgedNode {stableId: $stableId})-[childEdge]->(child:ForgedNode)
					WHERE type(childEdge) IN $childRelationshipTypeList
					WITH type(childEdge) AS relationshipType, child
					ORDER BY coalesce(child.name, child.stableId)
					WITH relationshipType, count(child) AS itemCount, collect(child)[0..${GROUP_ITEM_CAP}] AS cappedChildList
					UNWIND cappedChildList AS child
					WITH relationshipType, itemCount, child,
					     [(child)-[:HAS_INSTANCE*0..1]->${mappingSubjectText} |
					       { matchEdgeType: type(matchEdge), mappingConfidence: matchEdge.mappingConfidence, mappingSource: matchEdge.mappingSource,
					         anchorStableId: anchor.stableId, anchorName: anchor.name, anchorHubName: anchor.hubName, anchorStandardFamily: ${anchorStandardFamilyTextFor('anchor')},
					         subjectStableId: subject.stableId }] AS childMappingList
					RETURN relationshipType, itemCount, collect({
					         stableId: child.stableId, name: child.name, labelList: labels(child), hubName: ${hubNameOfNodeTextFor('child')},
					         description: coalesce(child.definition, child.description, ''),
					         path: child.path,
					         hasStructuralChildren: EXISTS { MATCH (child)-[grandchildEdge]->(:ForgedNode) WHERE type(grandchildEdge) IN $childRelationshipTypeList },
					         hasNonInstanceStructuralChildren: EXISTS { MATCH (child)-[grandchildEdge]->(:ForgedNode) WHERE type(grandchildEdge) IN $childRelationshipTypeList AND type(grandchildEdge) <> 'HAS_INSTANCE' },
					         propertyCount: COUNT { (child)-[:HAS_PROPERTY|HAS_FIELD]->() },
					         mappedPropertyCount: COUNT { MATCH (child)-[:HAS_PROPERTY|HAS_FIELD]->(member)
					           WHERE EXISTS { (member)-[:HAS_INSTANCE*0..1]->()-[:${MATCH_EDGE_TYPE_TEXT}]->(:HubReference) }
					              OR EXISTS { MATCH (member)<-[propertySlotEdge]-(memberAnchor:HubReference)<-[:${MATCH_EDGE_TYPE_TEXT}]-() WHERE type(propertySlotEdge) = ${anchorPropertySlotTextFor('memberAnchor')} } },
					         hubElementCount: COUNT { MATCH (child)<-[propertySlotEdge]-(anchor:HubReference) WHERE type(propertySlotEdge) = ${anchorPropertySlotTextFor('anchor')} AND anchor.referenceTier IN $hubElementTierList },
					         mappedElementCount: COUNT { MATCH (child)<-[propertySlotEdge]-(childAnchor:HubReference)<-[:${MATCH_EDGE_TYPE_TEXT}]-() WHERE type(propertySlotEdge) = ${anchorPropertySlotTextFor('childAnchor')} },
					         occurrenceCount: COUNT { (child)-[:HAS_INSTANCE]->() },
					         releaseIndependentId: child.releaseIndependentId,
					         definitionDigest: child.definitionDigest,
					         mappingList: childMappingList }) AS itemList
				`,
				params: { stableId, childRelationshipTypeList: [...childRelationshipTypeList], hubElementTierList: [...hubElementTierList] },
			}),

			// the node's own judgments, and its occurrences' (PESC and SIF judge occurrences, Ed-Fi the property)
			mappingsByStableId: ({ stableId }) => ({
				cypher: `
					MATCH (focus:ForgedNode {stableId: $stableId})
					OPTIONAL MATCH (focus)-[:HAS_INSTANCE*0..1]->${mappingSubjectText}
					WITH focus, collect(CASE WHEN matchEdge IS NULL THEN null ELSE
					       { matchEdgeType: type(matchEdge), mappingConfidence: matchEdge.mappingConfidence, mappingSource: matchEdge.mappingSource,
					         anchorStableId: anchor.stableId, anchorName: anchor.name, anchorHubName: anchor.hubName, anchorStandardFamily: ${anchorStandardFamilyTextFor('anchor')},
					         subjectStableId: subject.stableId } END) AS mappingRowList
					RETURN mappingRowList, [(focus)-[:HAS_INSTANCE]->(occurrence) | occurrence.stableId] AS occurrenceStableIdList
				`,
				params: { stableId },
			}),

			anchorContextByStableId: ({ stableId }) => ({
				cypher: `
					MATCH (anchor:ForgedNode {stableId: $stableId}) WHERE anchor:HubReference
					RETURN anchor.hubName AS hubName, anchor.referenceTier AS referenceTier, anchor.domainName AS domainName, anchor.propertyName AS propertyName,
					       anchor.valueName AS valueName, anchor.rangeOptionSetName AS rangeOptionSetName,
					       [(anchor)-[propertySlotEdge]->(hubProperty) WHERE type(propertySlotEdge) = ${anchorPropertySlotTextFor('anchor')} | { stableId: hubProperty.stableId, name: hubProperty.name, definition: coalesce(hubProperty.definition, hubProperty.description, ''),
					         hasStructuralChildren: EXISTS { MATCH (hubProperty)-[grandchildEdge]->(:ForgedNode) WHERE type(grandchildEdge) IN $childRelationshipTypeList } }] AS hubPropertyList,
					       [(anchor)-[domainSlotEdge]->(hubDomain) WHERE type(domainSlotEdge) = ${anchorDomainSlotTextFor('anchor')} | { stableId: hubDomain.stableId, name: hubDomain.name, definition: coalesce(hubDomain.definition, hubDomain.description, ''),
					         hasStructuralChildren: EXISTS { MATCH (hubDomain)-[grandchildEdge]->(:ForgedNode) WHERE type(grandchildEdge) IN $childRelationshipTypeList } }] AS hubDomainList
				`,
				params: { stableId, childRelationshipTypeList: [...childRelationshipTypeList] },
			}),

			// every element mapped to one anchor, gathered per owning standard and match edge type
			anchorFanOutByStableId: ({ stableId }) => ({
				cypher: `
					${cardExpressionHeadText}
					WITH root, type(matchEdge) AS matchEdgeType, collect(DISTINCT element.stableId) AS elementStableIdList,
					     max(matchEdge.mappingConfidence) AS maximumConfidence
					RETURN root.stableId AS rootStableId, root.name AS rootName, root.standardKey AS standardKey,
					       root.standardFamily AS standardFamily, root.releaseLabel AS releaseLabel, root.version AS version,
					       matchEdgeType, elementStableIdList, maximumConfidence
				`,
				params: { stableId },
			}),

			standardGroupMembers: ({ anchorStableId, standardKey }) => ({
				cypher: `
					MATCH (root:DmeStandardRoot {standardKey: $standardKey})
					MATCH (anchor:ForgedNode {stableId: $anchorStableId})<-[matchEdge:${MATCH_EDGE_TYPE_TEXT}]-(element:ForgedNode {_source: root._source}) WHERE anchor:HubReference
					WITH element, matchEdge, head([(owner)-[:HAS_INSTANCE]->(element) | owner.name]) AS ownerName
					ORDER BY matchEdge.mappingConfidence DESC, element.name, element.stableId
					WITH count(element) AS itemCount, collect({ element: element, matchEdge: matchEdge, ownerName: ownerName })[0..${GROUP_ITEM_CAP}] AS cappedMemberList
					UNWIND cappedMemberList AS member
					WITH itemCount, member.element AS element, member.matchEdge AS matchEdge, member.ownerName AS ownerName
					RETURN itemCount, collect({
					         stableId: element.stableId, name: element.name, labelList: labels(element), hubName: ${hubNameOfNodeTextFor('element')},
					         description: coalesce(element.definition, element.description, ''),
					         path: coalesce(element.contextPath, element.path),
					         ownerName: ownerName,
					         hasStructuralChildren: EXISTS { MATCH (element)-[grandchildEdge]->(:ForgedNode) WHERE type(grandchildEdge) IN $childRelationshipTypeList },
					         hasNonInstanceStructuralChildren: EXISTS { MATCH (element)-[grandchildEdge]->(:ForgedNode) WHERE type(grandchildEdge) IN $childRelationshipTypeList AND type(grandchildEdge) <> 'HAS_INSTANCE' },
					         mappingList: [{ matchEdgeType: type(matchEdge), mappingConfidence: matchEdge.mappingConfidence, mappingSource: matchEdge.mappingSource,
					                         anchorStableId: $anchorStableId, anchorName: null, subjectStableId: element.stableId }] }) AS itemList
				`,
				params: { anchorStableId, standardKey, childRelationshipTypeList: [...childRelationshipTypeList] },
			}),

			// every shortest climb from the owning root; the transformation prefers the one through a class
			ancestorChainsByStableId: ({ stableId }) => ({
				cypher: `
					MATCH (focus:ForgedNode {stableId: $stableId})
					MATCH (root:DmeStandardRoot {_source: focus._source}) WHERE root <> focus
					MATCH chain = ${ancestorChainPathTextFor('root', 'focus')}
					RETURN ${chainNodeListTextFor('chain')} AS chainNodeList
					LIMIT 25
				`,
				params: { stableId },
			}),

			versionPeerRoots: ({ standardKey }) => ({
				cypher: `
					MATCH (root:DmeStandardRoot {standardKey: $standardKey})
					MATCH (peer:DmeStandardRoot {standardFamily: root.standardFamily, releaseLabel: root.releaseLabel})
					RETURN peer.standardKey AS standardKey, peer.version AS version, peer.stableId AS stableId,
					       peer.standardFamily AS standardFamily, peer.releaseLabel AS releaseLabel, peer._source AS standardSourceName
				`,
				params: { standardKey },
			}),

			// the nodes of one standard that could be a counterpart: same name, carrying a version identity; the
			// identity itself is decided in JS (versionIdentityMatchOf), the one rule the badges use
			counterpartCandidates: ({ standardSourceName, name }) => ({
				cypher: `
					MATCH (candidate:ForgedNode {_source: $standardSourceName, name: $name})
					WHERE candidate.releaseIndependentId IS NOT NULL
					RETURN candidate.stableId AS stableId, candidate.releaseIndependentId AS releaseIndependentId, candidate.definitionDigest AS definitionDigest
				`,
				params: { standardSourceName, name },
			}),

			// what one node's digest covers, as the graph shows it: its hashed fields, its members, its types
			versionComparisonFacts: ({ stableId }) => ({
				cypher: `
					MATCH (subject:ForgedNode {stableId: $stableId})
					RETURN subject.stableId AS stableId, subject.definitionDigest AS definitionDigest,
					       subject { ${versionDifferenceFieldList.map((oneField) => `.${oneField.fieldName}`).join(', ')} } AS fieldByName,
					       [(subject)-[memberEdge]->(member:ForgedNode) WHERE type(memberEdge) IN $memberRelationshipTypeList |
					         { name: member.name, releaseIndependentId: member.releaseIndependentId, definitionDigest: member.definitionDigest }] AS memberList,
					       [(subject)-[typeEdge]->(typeNode:ForgedNode) WHERE type(typeEdge) IN $typeRelationshipTypeList |
					         { relationshipType: type(typeEdge), name: typeNode.name, releaseIndependentId: typeNode.releaseIndependentId, definitionDigest: typeNode.definitionDigest }] AS typeList
				`,
				params: { stableId, memberRelationshipTypeList: [...versionMemberRelationshipTypeList], typeRelationshipTypeList: [...versionTypeRelationshipTypeList] },
			}),

			rootSummaryByStandardKeyList: ({ standardKeyList }) => ({
				cypher: `
					MATCH (root:DmeStandardRoot) WHERE root.standardKey IN $standardKeyList
					RETURN root.standardKey AS standardKey, root.standardFamily AS standardFamily, root.releaseLabel AS releaseLabel, root.version AS version
				`,
				params: { standardKeyList },
			}),

			classDigestsByStandardKey: ({ standardKey }) => ({
				cypher: `
					MATCH (:DmeStandardRoot {standardKey: $standardKey})-[:HAS_CLASS]->(classNode:DmeClass)
					RETURN classNode.stableId AS stableId, classNode.releaseIndependentId AS releaseIndependentId, classNode.definitionDigest AS definitionDigest
				`,
				params: { standardKey },
			}),

			propertyDigestsByClassStableId: ({ classStableId }) => ({
				cypher: `
					MATCH (:DmeClass {stableId: $classStableId})-[:HAS_PROPERTY]->(propertyNode:DmeProperty)
					RETURN propertyNode.stableId AS stableId, propertyNode.releaseIndependentId AS releaseIndependentId, propertyNode.definitionDigest AS definitionDigest
				`,
				params: { classStableId },
			}),

			// ================================================================================
			// ⟪meaningsExplorer⟫ THE MEANINGS WALK'S READS. Every card is matched through its slot edges or as (:ForgedNode {stableId}) WHERE card:HubReference
			// (the stableId index is on ForgedNode); a slot edge's type is the card's own hub's (cardHubSlotEdgeTypeTextFor), never a literal hub name.

			// the catalog's groups today: one per hub, with what it holds (meaningCatalogGrouping names this query). ⟪meaningsPolish⟫ What a hub holds is what its
			// next level lists: its domains, and the property meanings they hold, counted through the DOMAIN slot edge as meaningDomainsByHubName counts them.
			// ⟪review S6⟫ A domain is any hub element a property meaning names as its domain, or whose own term card (termKind class) names it: no domain's own
			// term is left unreachable (33 were on the base). The edges are matched by type (hubSlotEdgeTypeList, from the graph's own hub list; a card
			// carries only its own hub's edges), one pass for every hub: about 50 ms on GOLD_261030_useCases, where the old per-tier inventory, a scan of
			// every card (117,839 for CEDS), took about 150 ms and was the count TQ found did not match the next level. A hub with no domain holds 0 of each.
			meaningHubCatalog: ({ hubNameList }) => ({
				cypher: `
					CALL {
						MATCH (card:HubReference)-[:${hubSlotEdgeTypeList(hubNameList, 'DOMAIN').join('|')}]->(domain:ForgedNode) WHERE card.referenceTier = $propertyTier
						RETURN card.hubName AS cardHubName, domain, count(card) AS domainMeaningCount, sum(${cardMappedElementCountTextFor('card')}) AS domainMappingCount
						UNION ALL
						MATCH (termCard:HubReference)-[:${hubSlotEdgeTypeList(hubNameList, 'TERM').join('|')}]->(domain:ForgedNode)
						WHERE termCard.referenceTier = $termTier AND termCard.termKind IN $termKindList
						RETURN termCard.hubName AS cardHubName, domain, 0 AS domainMeaningCount, sum(${cardMappedElementCountTextFor('termCard')}) AS domainMappingCount
					}
					WITH cardHubName, count(DISTINCT domain) AS domainCount, sum(domainMeaningCount) AS domainMeaningCount, sum(domainMappingCount) AS domainMappingCount
					WITH collect({ hubName: cardHubName, domainCount: domainCount, domainMeaningCount: domainMeaningCount, domainMappingCount: domainMappingCount }) AS hubTotalList
					MATCH (hub:HubDefinition)
					OPTIONAL MATCH (hubRoot:DmeStandardRoot {_source: hub._source})
					WITH hub, head(collect(hubRoot)) AS hubRoot, head([oneTotal IN hubTotalList WHERE oneTotal.hubName = hub.hubName]) AS hubTotal
					RETURN hub.hubName AS hubName, coalesce(hub.displayName, hub.name, hub.hubName) AS hubTitle, hubRoot.standardFamily AS standardFamily, hubRoot.version AS version,
					       coalesce(hubTotal.domainCount, 0) AS domainCount, coalesce(hubTotal.domainMeaningCount, 0) AS domainMeaningCount, coalesce(hubTotal.domainMappingCount, 0) AS domainMappingCount
					ORDER BY hubName
				`,
				params: { propertyTier: MEANING_PROPERTY_TIER, termTier: MEANING_TERM_TIER, termKindList: [...meaningTermKindByLevel.meaningDomain] },
			}),

			// one hub: is it a hub, and its family (for the colours)
			meaningHubByName: ({ hubName }) => ({
				cypher: `
					MATCH (hub:HubDefinition {hubName: $hubName})
					OPTIONAL MATCH (hubRoot:DmeStandardRoot {_source: hub._source})
					RETURN hub.hubName AS hubName, coalesce(hub.displayName, hub.name, hub.hubName) AS hubTitle, head(collect(hubRoot.standardFamily)) AS standardFamily
				`,
				params: { hubName },
			}),

			// every hub and its family: the breadcrumb's colours, and the names a refusal lists
			hubFamilyList: () => ({
				cypher: `MATCH (hub:HubDefinition) OPTIONAL MATCH (hubRoot:DmeStandardRoot {_source: hub._source}) RETURN hub.hubName AS hubName, head(collect(hubRoot.standardFamily)) AS standardFamily ORDER BY hubName`,
				params: {},
			}),

			// a hub's domains: the hub elements its property meanings name as their domain, ⟪review S6⟫ and those only its own term card names (no domain's own
			// term is left unreachable), each with what its own level lists: how many property meanings it holds, how many of those a standard's element maps
			// to, and how many own term meanings (the domain's own term card) are listed beside them; ⟪review S4⟫ and its id in its hub's standard (the graph's
			// declared native identifier, nativeIdentifierCypherTextFor; null when the graph declares none, and the row says why). Edges are matched by type
			// (hubEdgeTypeFor refuses a hubName that is not a plain identifier; the caller has already found the hub): a domain's in-edges include every value
			// card's DOMAIN edge, and filtering them all by type() cost about 70 ms on CEDS.
			meaningDomainsByHubName: ({ hubName, declarationList }) => ({
				cypher: `
					CALL {
						MATCH (card:HubReference)-[:${hubEdgeTypeFor(hubName, 'DOMAIN')}]->(domain:ForgedNode) WHERE card.referenceTier = $propertyTier
						RETURN domain, count(card) AS meaningCount, count(CASE WHEN EXISTS { (card)<-[:${MATCH_EDGE_TYPE_TEXT}]-() } THEN card END) AS mappedMeaningCount, 0 AS termMeaningCount, sum(${cardMappedElementCountTextFor('card')}) AS mappingCount
						UNION ALL
						MATCH (termCard:HubReference)-[:${hubEdgeTypeFor(hubName, 'TERM')}]->(domain:ForgedNode) WHERE termCard.referenceTier = $termTier AND termCard.termKind IN $termKindList
						RETURN domain, 0 AS meaningCount, 0 AS mappedMeaningCount, count(termCard) AS termMeaningCount, sum(${cardMappedElementCountTextFor('termCard')}) AS mappingCount
					}
					WITH domain, sum(meaningCount) AS meaningCount, sum(mappedMeaningCount) AS mappedMeaningCount, sum(termMeaningCount) AS termMeaningCount, sum(mappingCount) AS mappingCount
					RETURN domain.stableId AS stableId, domain.name AS name, coalesce(domain.definition, domain.description, '') AS description, domain._source AS sourceKey,
					       ${declarationList ? nativeIdentifierCypherTextFor('domain', declarationList) : 'null'} AS nativeIdentifier,
					       meaningCount, mappedMeaningCount, termMeaningCount, mappingCount,
					       COUNT { MATCH (domain)<-[:${INCOMING_SLOT_NAME_LIST.map((slotName) => hubEdgeTypeFor(hubName, slotName)).join('|')}]-(incomingCard:HubReference)
					               WHERE ${incomingCardWhereTextFor({ cardVariableName: 'incomingCard', domainVariableName: 'domain' })} RETURN DISTINCT incomingCard } AS incomingMeaningCount
					ORDER BY name, stableId
				`,
				params: { propertyTier: MEANING_PROPERTY_TIER, termTier: MEANING_TERM_TIER, termKindList: [...meaningTermKindByLevel.meaningDomain] },
			}),

			// a domain: its own facts (⟪meaningsClarity⟫ the meanings it takes part in are its meaning facts, lib/edc-resolver/elementMeaningFacts.js)
			meaningDomainContext: ({ domainStableId, declarationList }) => ({
				cypher: `
					MATCH (domain:ForgedNode {stableId: $domainStableId})
					RETURN domain.stableId AS stableId, domain.name AS name, coalesce(domain.definition, domain.description, '') AS description, domain._source AS sourceKey,
					       ${declarationList ? nativeIdentifierCypherTextFor('domain', declarationList) : 'null'} AS nativeIdentifier,
					       ${hubNameOfNodeTextFor('domain')} AS hubName, ${anchorStandardFamilyTextFor('domain')} AS standardFamily
				`,
				params: { domainStableId },
			}),

			// ⟪meaningsPolish⟫ a domain's meanings: every property meaning that names it as its domain, one row each (a property with more than one meaning in
			// the domain, one per qualifier or range, lists each), by name then stableId (no tie left to the planner)
			// ⟪meaningsClarity⟫ each with the value meanings it holds and how many elements map to them, so a row that holds 48 values does not read as empty
			meaningsByDomainStableId: ({ domainStableId }) => ({
				cypher: `
					MATCH (domain:ForgedNode {stableId: $domainStableId})<-[domainEdge]-(card:HubReference)
					WHERE card.referenceTier = $propertyTier AND type(domainEdge) = ${cardHubSlotEdgeTypeTextFor('card', 'DOMAIN')}
					CALL {
						WITH domain, domainEdge, card
						OPTIONAL ${valueCardOfPropertyCardMatchTextFor({ cardVariableName: 'card', domainVariableName: 'domain', domainEdgeVariableName: 'domainEdge', valueCardVariableName: 'valueCard' })}
						OPTIONAL MATCH (valueCard)<-[:${MATCH_EDGE_TYPE_TEXT}]-(valueElement:ForgedNode)
						RETURN count(DISTINCT valueCard) AS valueMeaningCount, count(DISTINCT valueElement) AS valueElementCount
					}
					WITH card, valueMeaningCount, valueElementCount ORDER BY card.name, card.stableId
					RETURN ${meaningRowTextFor('card')} AS meaningRow, valueMeaningCount, valueElementCount
				`,
				params: { domainStableId, propertyTier: MEANING_PROPERTY_TIER, valueTier: MEANING_VALUE_TIER },
			}),

			// ⟪meaningsClarity, Addendum A⟫ THE ELEMENT'S MEANING FACTS (read by lib/edc-resolver/elementMeaningFacts.js for both the explorer and the /edc page). Where each
			// meaning naming an element places it, counted once per meaning: as its DOMAIN (a property or value meaning of this domain), as its own TERM, or else by
			// the first other slot it names it in (incomingCardWhereTextFor: a meaning of another domain), in the hub's slot order
			elementMeaningPlaceCounts: ({ elementStableId }) => ({
				cypher: `
					MATCH (element:ForgedNode {stableId: $elementStableId})<-[slotEdge]-(card:HubReference)
					WHERE type(slotEdge) IN [${['DOMAIN', 'TERM', ...INCOMING_SLOT_NAME_LIST].map((slotName) => cardHubSlotEdgeTypeTextFor('card', slotName)).join(', ')}]
					WITH card, collect(type(slotEdge)) AS slotEdgeTypeList
					WITH card, CASE ${['DOMAIN', 'TERM', ...INCOMING_SLOT_NAME_LIST].map((slotName) => `WHEN ${cardHubSlotEdgeTypeTextFor('card', slotName)} IN slotEdgeTypeList THEN '${slotName}'`).join(' ')} END AS placeSlotName
					RETURN card.hubName AS hubName, card.referenceTier AS referenceTier, card.termKind AS termKind, placeSlotName, count(card) AS meaningCount
					ORDER BY hubName, placeSlotName, referenceTier
				`,
				params: { elementStableId },
			}),

			// the meanings of other domains that name an element (incomingCardWhereTextFor), by name then stableId, capped at GROUP_ITEM_CAP with their true count, each
			// with the slots it names the element in and its own domain (where the walk lists it)
			// ⟪explorerTidy review S1⟫ withIncomingValueCount (required, no default): true only for a meanings domain level, whose rows open by it; an element's meaning facts
			// (the panel, the /edc page) do not use the count, so they do not pay for it
			incomingMeaningsByElementStableId: ({ elementStableId, withIncomingValueCount }) => {
				if (typeof withIncomingValueCount !== 'boolean') throw new Error(`${moduleName}: incomingMeaningsByElementStableId needs withIncomingValueCount true or false (received ${JSON.stringify(withIncomingValueCount)})`);
				return {
				cypher: `
					MATCH (element:ForgedNode {stableId: $elementStableId})<-[slotEdge]-(card:HubReference)
					WHERE type(slotEdge) IN ${incomingSlotEdgeTypeListTextFor('card')} AND ${incomingCardWhereTextFor({ cardVariableName: 'card', domainVariableName: 'element' })}
					WITH card, collect(DISTINCT type(slotEdge)) AS slotEdgeTypeList ORDER BY card.name, card.stableId
					WITH count(card) AS itemCount, collect({ card: card, slotEdgeTypeList: slotEdgeTypeList })[0..${GROUP_ITEM_CAP}] AS cappedIncomingList
					UNWIND cappedIncomingList AS incoming
					WITH itemCount, incoming.card AS card, incoming.slotEdgeTypeList AS slotEdgeTypeList
					RETURN itemCount, collect({ meaningRow: ${meaningRowTextFor('card')}, slotEdgeTypeList: slotEdgeTypeList,
					         ownDomainStableId: head([(card)-[ownDomainEdge]->(ownDomain:ForgedNode) WHERE type(ownDomainEdge) = ${cardHubSlotEdgeTypeTextFor('card', 'DOMAIN')} | ownDomain.stableId])${withIncomingValueCount ? `,
					         // ⟪explorerTidy⟫ the value meanings it holds in its own domain (the one value rule), so its row opens only when its level would list one
					         valueMeaningCount: CASE WHEN card.referenceTier = $propertyTier THEN COUNT { MATCH (card)-[incomingOwnDomainEdge]->(incomingOwnDomain:ForgedNode) WHERE type(incomingOwnDomainEdge) = ${cardHubSlotEdgeTypeTextFor('card', 'DOMAIN')}
					           ${valueCardOfPropertyCardMatchTextFor({ cardVariableName: 'card', domainVariableName: 'incomingOwnDomain', domainEdgeVariableName: 'incomingOwnDomainEdge', valueCardVariableName: 'incomingValueCard' })}
					           RETURN DISTINCT incomingValueCard } ELSE 0 END` : ''} }) AS itemList
				`,
				params: { elementStableId, ...(withIncomingValueCount ? { propertyTier: MEANING_PROPERTY_TIER, valueTier: MEANING_VALUE_TIER } : {}) },
				};
			},

			// the meanings of other domains that name an element, counted by their own domain and the first slot they name it in (the hub's slot order): where each lives
			// in the walk. A meaning with no domain of its own is counted under none.
			namingMeaningCountsByElementStableId: ({ elementStableId }) => ({
				// ⟪review S3⟫ and, within its own domain, by the property meaning that holds it (the property signature): a property meaning and its values naming the
				// element are one group, linked to that meaning, whose level lists those values; with how many values that meaning holds in all, so a line can say
				// "1 of the 48 values" when not all of them name the element. A value whose domain has no property meaning of its signature is held by none.
				cypher: `
					MATCH (element:ForgedNode {stableId: $elementStableId})<-[slotEdge]-(card:HubReference)
					WHERE type(slotEdge) IN ${incomingSlotEdgeTypeListTextFor('card')} AND ${incomingCardWhereTextFor({ cardVariableName: 'card', domainVariableName: 'element' })}
					WITH card, collect(type(slotEdge)) AS slotEdgeTypeList
					WITH card, CASE ${INCOMING_SLOT_NAME_LIST.map((slotName) => `WHEN ${cardHubSlotEdgeTypeTextFor('card', slotName)} IN slotEdgeTypeList THEN '${slotName}'`).join(' ')} END AS placeSlotName,
					     head([(card)-[ownDomainEdge]->(ownDomain:ForgedNode) WHERE type(ownDomainEdge) = ${cardHubSlotEdgeTypeTextFor('card', 'DOMAIN')} | { domain: ownDomain, domainEdgeType: type(ownDomainEdge) }]) AS own
					WITH card, placeSlotName, own ORDER BY card.name, card.stableId
					WITH card.hubName AS hubName, own.domain AS ownDomain, own.domainEdgeType AS ownDomainEdgeType, placeSlotName, ${propertySignatureTextFor('card')} AS propertySignature,
					     count(card) AS meaningCount, count(CASE WHEN card.referenceTier = $propertyTier THEN card END) AS holderIncludedCount,
					     head(collect(CASE WHEN card.referenceTier = $propertyTier THEN card END)) AS namingHolder, head(collect(card.stableId)) AS firstCardStableId
					CALL {
						WITH ownDomain, ownDomainEdgeType, propertySignature, namingHolder
						OPTIONAL MATCH (ownDomain)<-[holderDomainEdge]-(holderCandidate:HubReference)
						WHERE namingHolder IS NULL AND type(holderDomainEdge) = ownDomainEdgeType AND holderCandidate.referenceTier = $propertyTier AND ${propertySignatureTextFor('holderCandidate')} = propertySignature
						WITH namingHolder, head(collect(holderCandidate)) AS foundHolder
						RETURN coalesce(namingHolder, foundHolder) AS holder
					}
					RETURN hubName, ownDomain.stableId AS ownDomainStableId, ownDomain.name AS ownDomainName, placeSlotName, meaningCount, firstCardStableId,
					       holder.stableId AS holderCardStableId, holder.name AS holderName, holderIncludedCount,
					       CASE WHEN holder IS NULL THEN 0 ELSE COUNT { MATCH (ownDomain)<-[valueDomainEdge]-(holderValue:HubReference)
					         WHERE type(valueDomainEdge) = ownDomainEdgeType AND holderValue.referenceTier = $valueTier AND ${propertySignatureTextFor('holderValue')} = propertySignature } END AS holderValueCount
					ORDER BY ownDomainName, ownDomainStableId, placeSlotName, holderName
				`,
				params: { elementStableId, propertyTier: MEANING_PROPERTY_TIER, valueTier: MEANING_VALUE_TIER },
			}),

			// an element's own term meanings: the term cards whose TERM is it (a class's is its domain's own term), by name
			termMeaningsByElementStableId: ({ elementStableId }) => ({
				cypher: `
					MATCH (element:ForgedNode {stableId: $elementStableId})<-[termEdge]-(termCard:HubReference)
					WHERE type(termEdge) = ${cardHubSlotEdgeTypeTextFor('termCard', 'TERM')}
					WITH termCard ORDER BY termCard.name, termCard.stableId
					RETURN ${meaningRowTextFor('termCard')} AS meaningRow
				`,
				params: { elementStableId },
			}),

			// the meanings an element is mapped to (its match edges to cards), by hub, name and stableId, capped at GROUP_ITEM_CAP with their true count
			mappedMeaningsByElementStableId: ({ elementStableId }) => ({
				cypher: `
					MATCH (element:ForgedNode {stableId: $elementStableId})-[matchEdge:${MATCH_EDGE_TYPE_TEXT}]->(card:HubReference)
					WITH card, matchEdge ORDER BY card.hubName, card.name, card.stableId
					WITH collect({ cardStableId: card.stableId, relationType: type(matchEdge), matchBasis: matchEdge.matchBasis, mappingConfidence: matchEdge.mappingConfidence }) AS mappedRowList
					RETURN size(mappedRowList) AS itemCount, mappedRowList[0..${GROUP_ITEM_CAP}] AS itemList
				`,
				params: { elementStableId },
			}),

			// one meaning: the card and where it sits (its domain, for a property or value meaning; none for a term)
			meaningCardFacts: ({ cardStableId }) => ({
				cypher: `
					MATCH (card:ForgedNode {stableId: $cardStableId}) WHERE card:HubReference
					RETURN ${meaningRowTextFor('card')} AS meaningRow, card.hubVersion AS hubVersion, ${anchorStandardFamilyTextFor('card')} AS standardFamily,
					       card.valueName AS valueName, card.propertyName AS propertyName,
					       head([(card)-[domainEdge]->(domain:ForgedNode) WHERE type(domainEdge) = ${cardHubSlotEdgeTypeTextFor('card', 'DOMAIN')} | { stableId: domain.stableId, name: domain.name }]) AS domain
				`,
				params: { cardStableId },
			}),

			// "Expressed in": the elements mapped to one meaning, PER STANDARD (the anchor fan-out gives each standard's true count), strongest first, then by
			// confidence, name and stableId (no tie left to the planner), capped at GROUP_ITEM_CAP per standard; each with its root's release version count and
			// every climb from its root (the Standards Explorer's path to it; standardsWalkPathOf picks the climb as chooseAncestorChain does)
			meaningExpressionsByCardStableId: ({ stableId }) => ({
				cypher: `
					${cardExpressionHeadText}
					WITH root, element, matchEdge ORDER BY ${matchStrengthRankTextFor('matchEdge')}, matchEdge.mappingConfidence DESC, element.name, element.stableId
					WITH root, collect({ element: element, matchEdge: matchEdge })[0..${GROUP_ITEM_CAP}] AS cappedExpressionList
					WITH root, cappedExpressionList, COUNT { MATCH (peer:DmeStandardRoot) WHERE peer.standardFamily = root.standardFamily AND peer.releaseLabel = root.releaseLabel } AS releaseVersionCount
					UNWIND cappedExpressionList AS expression
					WITH root, releaseVersionCount, expression.element AS element, expression.matchEdge AS matchEdge
					CALL {
						WITH root, element
						MATCH chain = ${ancestorChainPathTextFor('root', 'element')} WHERE root <> element
						RETURN collect(${chainNodeListTextFor('chain')})[0..25] AS chainNodeListList
					}
					RETURN root.standardKey AS standardKey, root.standardFamily AS standardFamily, root.releaseLabel AS releaseLabel, releaseVersionCount, collect({
					         stableId: element.stableId, name: element.name, labelList: labels(element), hubName: ${hubNameOfNodeTextFor('element')},
					         ownerName: head([(owner)-[:HAS_INSTANCE]->(element) | owner.name]),
					         matchEdgeType: type(matchEdge), matchBasis: matchEdge.matchBasis, mappingConfidence: matchEdge.mappingConfidence, mappingSource: matchEdge.mappingSource,
					         chainNodeListList: chainNodeListList }) AS expressionList
				`,
				params: { stableId },
			}),

			// a property meaning's value meanings (valueCardOfPropertyCardMatchTextFor), by name, capped with their true count; ⟪meaningsClarity⟫ and how many elements
			// map to any of them (valueElementCount), counted over all of them, not the capped list
			valueMeaningsByCardStableId: ({ cardStableId }) => ({
				cypher: `
					MATCH (card:ForgedNode {stableId: $cardStableId}) WHERE card:HubReference AND card.referenceTier = $propertyTier
					MATCH (card)-[domainEdge]->(domain:ForgedNode) WHERE type(domainEdge) = ${cardHubSlotEdgeTypeTextFor('card', 'DOMAIN')}
					${valueCardOfPropertyCardMatchTextFor({ cardVariableName: 'card', domainVariableName: 'domain', domainEdgeVariableName: 'domainEdge', valueCardVariableName: 'valueCard' })}
					WITH valueCard ORDER BY valueCard.name, valueCard.stableId
					WITH collect(valueCard) AS valueCardList
					CALL {
						WITH valueCardList
						UNWIND valueCardList AS countedValueCard
						OPTIONAL MATCH (countedValueCard)<-[:${MATCH_EDGE_TYPE_TEXT}]-(valueElement:ForgedNode)
						RETURN count(DISTINCT valueElement) AS valueElementCount
					}
					WITH size(valueCardList) AS itemCount, valueElementCount, valueCardList[0..${GROUP_ITEM_CAP}] AS cappedValueCardList
					UNWIND cappedValueCardList AS valueCard
					RETURN itemCount, valueElementCount, collect(${meaningRowTextFor('valueCard')}) AS itemList
				`,
				params: { cardStableId, valueTier: MEANING_VALUE_TIER, propertyTier: MEANING_PROPERTY_TIER },
			}),
		};

		const getCypher = (queryName, queryParams) => {
			const queryBuilder = queryBuilderByQueryName[queryName];
			if (!queryBuilder) {
				throw new Error(`${moduleName}: no query named '${queryName}'; valid: ${Object.keys(queryBuilderByQueryName).join(', ')}`);
			}
			return queryBuilder(queryParams || {});
		};

		// ================================================================================
		// IDENTITY AND KIND

		// hubName: the hub the node belongs to (hubNameOfNodeTextFor), null for a standard that is no hub
		const nodeKindOf = (labelList, hubName) => {
			const kindEntry = kindByLabelList.find((oneEntry) => (labelList || []).indexOf(oneEntry.labelName) !== -1);
			if (!kindEntry) {
				return 'unclassified';
			}
			return hubName && kindEntry.hubStandardNodeKind ? kindEntry.hubStandardNodeKind : kindEntry.nodeKind;
		};
		// a node of a hub kind names its hub (hubName); every other node carries no such field
		const HUB_NODE_KIND_LIST = Object.freeze(['hubAnchor', 'hubProperty', 'hubDomain']);
		const hubNameFieldOf = (nodeKind, hubName) => (HUB_NODE_KIND_LIST.indexOf(nodeKind) !== -1 && hubName ? { hubName } : {});

		// answers { nodeKind, remainderText } for a synthetic id, or null for a graph stableId
		const parseSyntheticId = (stableId) => {
			const prefixEntry = allSyntheticIdPrefixList.find((oneEntry) => stableId.indexOf(oneEntry.idPrefix) === 0);
			return prefixEntry ? { nodeKind: prefixEntry.nodeKind, remainderText: stableId.slice(prefixEntry.idPrefix.length) } : null;
		};

		const familyIdOf = (standardFamily) => `family:${standardFamily}`;

		// 'families:' names one catalog only; anything after it but 'all' is not an id this page made
		const isFamilyCatalogId = (stableId) => stableId === FAMILY_CATALOG_STABLE_ID;

		// release:<standardFamily>/<releaseLabel> — one message offered in more than one version (the version picker)
		const releaseIdOf = ({ standardFamily, releaseLabel }) => `release:${standardFamily}/${releaseLabel}`;
		// a message is a step of the walk (the version picker) only when it is offered in more than one version; with one, the family lists its standard
		const releaseIsWalkStepFor = (releaseVersionCount) => releaseVersionCount > 1;
		const parseReleaseRemainder = (remainderText) => {
			const dividerIndex = remainderText.indexOf('/');
			if (dividerIndex < 1 || dividerIndex === remainderText.length - 1) {
				return null;
			}
			return { standardFamily: remainderText.slice(0, dividerIndex), releaseLabel: remainderText.slice(dividerIndex + 1) };
		};

		// standardGroup:<standardKey>@<anchorStableId> — standardKeys are [a-z0-9]+, so the first '@' divides
		const standardGroupIdOf = ({ standardKey, anchorStableId }) => `standardGroup:${standardKey}@${anchorStableId}`;
		const parseStandardGroupRemainder = (remainderText) => {
			const dividerIndex = remainderText.indexOf('@');
			if (dividerIndex < 1 || dividerIndex === remainderText.length - 1) {
				return null;
			}
			return { standardKey: remainderText.slice(0, dividerIndex), anchorStableId: remainderText.slice(dividerIndex + 1) };
		};

		// ================================================================================
		// MAPPINGS — one judgment row → the wire's mapping; strongest first

		const mappingOf = (mappingRow) => {
			const matchKindEntry = matchKindByEdgeType[mappingRow.matchEdgeType];
			return {
				matchKind: matchKindEntry.matchKind,
				mappingConfidence: mappingRow.mappingConfidence,
				mappingSource: mappingRow.mappingSource,
				anchor: { stableId: mappingRow.anchorStableId, name: mappingRow.anchorName, ...(mappingRow.anchorHubName ? { hubName: mappingRow.anchorHubName, standardFamily: mappingRow.anchorStandardFamily } : {}) },
				subjectStableId: mappingRow.subjectStableId,
			};
		};

		const strengthRankOf = (matchKind) => Object.values(matchKindByEdgeType).find((oneEntry) => oneEntry.matchKind === matchKind).strengthRank;

		const byStrength = (left, right) => strengthRankOf(left.matchKind) - strengthRankOf(right.matchKind) || (right.mappingConfidence || 0) - (left.mappingConfidence || 0);

		// one row per (matchKind, anchor), counting the occurrences that carry it and keeping the highest confidence
		const collapseMappingList = (mappingRowList) => {
			const mappingBySignature = {};
			(mappingRowList || []).filter(Boolean).forEach((oneRow) => {
				const oneMapping = mappingOf(oneRow);
				const signatureText = `${oneMapping.matchKind}\u0000${oneMapping.anchor.stableId}`;
				const existingMapping = mappingBySignature[signatureText];
				if (existingMapping) {
					existingMapping.occurrenceCount += 1;
					existingMapping.mappingConfidence = Math.max(existingMapping.mappingConfidence, oneMapping.mappingConfidence);
					return;
				}
				mappingBySignature[signatureText] = { matchKind: oneMapping.matchKind, mappingConfidence: oneMapping.mappingConfidence, mappingSource: oneMapping.mappingSource, anchor: oneMapping.anchor, occurrenceCount: 1 };
			});
			return Object.values(mappingBySignature).sort(byStrength);
		};

		// instances fold away when there is at most one, or when every one carries the same judgments (spec §6.5)
		const instanceFoldingOf = ({ mappingRowList, occurrenceStableIdList }) => {
			const occurrenceCount = (occurrenceStableIdList || []).length;
			if (occurrenceCount <= 1) {
				return { folded: true, occurrenceCount, foldingReason: occurrenceCount === 0 ? 'noOccurrences' : 'singleOccurrence' };
			}
			const signatureTextByOccurrence = {};
			occurrenceStableIdList.forEach((occurrenceStableId) => {
				signatureTextByOccurrence[occurrenceStableId] = [];
			});
			(mappingRowList || []).filter(Boolean).forEach((oneRow) => {
				if (signatureTextByOccurrence[oneRow.subjectStableId]) {
					signatureTextByOccurrence[oneRow.subjectStableId].push(`${oneRow.matchEdgeType}|${oneRow.anchorStableId}|${oneRow.mappingConfidence}`);
				}
			});
			const distinctSignatureCount = new Set(Object.values(signatureTextByOccurrence).map((signatureList) => signatureList.sort().join(','))).size;
			return distinctSignatureCount === 1
				? { folded: true, occurrenceCount, foldingReason: 'occurrencesMapIdentically' }
				: { folded: false, occurrenceCount, foldingReason: 'occurrencesMapDifferently' };
		};

		// ================================================================================
		// VERSION IDENTITY — releaseIndependentId without its namespace versions and without the element position.
		// The position strip is ours, not the spec's: on College Transcript 1.8.0 against 1.7.0 the spec's key alone
		// reads 39 properties as 'only in 1.7' that 1.8.0 still has, moved; with the position stripped there are
		// still 0 collisions (DEVLOG, Phase 1 probe).

		const versionIdentityOf = (releaseIndependentId) =>
			typeof releaseIndependentId === 'string' && releaseIndependentId !== '' ? releaseIndependentId.replace(/:v\d+\.\d+\.\d+/g, '').replace(/\/el\/\d+:/, '/el/') : null;

		const versionPartList = (versionText) => String(versionText || '').split('.').map((onePart) => parseInt(onePart, 10) || 0);
		const compareVersionText = (leftText, rightText) => {
			const leftPartList = versionPartList(leftText);
			const rightPartList = versionPartList(rightText);
			for (let partIndex = 0; partIndex < Math.max(leftPartList.length, rightPartList.length); partIndex++) {
				const partDifference = (leftPartList[partIndex] || 0) - (rightPartList[partIndex] || 0);
				if (partDifference !== 0) {
					return partDifference;
				}
			}
			return 0;
		};

		// the version to compare against: the nearest lower; for the lowest, the nearest higher; none when alone
		const comparisonPeerOf = ({ version, peerList }) => {
			const otherPeerList = (peerList || []).filter((onePeer) => compareVersionText(onePeer.version, version) !== 0);
			const lowerPeerList = otherPeerList.filter((onePeer) => compareVersionText(onePeer.version, version) < 0).sort((left, right) => compareVersionText(right.version, left.version));
			if (lowerPeerList.length) {
				return lowerPeerList[0];
			}
			const higherPeerList = otherPeerList.sort((left, right) => compareVersionText(left.version, right.version));
			return higherPeerList.length ? higherPeerList[0] : null;
		};

		// badge for each digest row against the comparison version's rows; refuses a key collision by name
		const versionBadgeByStableId = ({ digestRowList, comparisonDigestRowList, thisVersion, comparedVersion }) => {
			const comparisonDigestByIdentity = {};
			const collisionList = [];
			(comparisonDigestRowList || []).forEach((oneRow) => {
				const identityText = versionIdentityOf(oneRow.releaseIndependentId);
				if (identityText === null) {
					return;
				}
				if (comparisonDigestByIdentity[identityText] !== undefined) {
					collisionList.push(identityText);
				}
				comparisonDigestByIdentity[identityText] = oneRow.definitionDigest;
			});
			const badgeByStableId = {};
			(digestRowList || []).forEach((oneRow) => {
				const identityText = versionIdentityOf(oneRow.releaseIndependentId);
				if (identityText === null) {
					return;
				}
				const comparisonDigest = comparisonDigestByIdentity[identityText];
				const badgeState = comparisonDigest === undefined ? 'new' : comparisonDigest === oneRow.definitionDigest ? 'unchanged' : 'changed';
				badgeByStableId[oneRow.stableId] = { badgeState, thisVersion, comparedVersion };
			});
			return { badgeByStableId, collisionList };
		};

		const versionIdentityMatchOf = ({ releaseIndependentId, comparisonDigestRowList }) => {
			const identityText = versionIdentityOf(releaseIndependentId);
			return identityText === null ? null : (comparisonDigestRowList || []).find((oneRow) => versionIdentityOf(oneRow.releaseIndependentId) === identityText) || null;
		};

		// the other versions of a node's message, newest first: what the browser needs to know before it asks for tiles
		const otherVersionListOf = ({ peerList, standardKey }) =>
			(peerList || [])
				.filter((onePeer) => onePeer.standardKey !== standardKey)
				.sort((left, right) => compareVersionText(right.version, left.version))
				.map((onePeer) => ({ version: onePeer.version, standardKey: onePeer.standardKey, standardStableId: onePeer.stableId }));

		// ================================================================================
		// VERSION DIFFERENCES — why two counterparts' digests differ, from what the graph shows (registries above).
		// Answers a list of { differenceKind: 'field' | 'members' | 'type' | 'unexplained', ... }; empty when the
		// digests agree. 'unexplained' means the digest moved and nothing the page can show did: the tile says so
		// rather than show two identical-looking tiles under a "Different" badge.

		const versionValueFormByName = {
			verbatim: (fieldValue) => JSON.stringify(fieldValue === undefined ? null : fieldValue),
			versionStripped: (fieldValue) => JSON.stringify(typeof fieldValue === 'string' ? fieldValue.replace(/:v\d+\.\d+\.\d+/g, '') : fieldValue === undefined ? null : fieldValue),
		};

		const fieldDifferenceListOf = ({ thisFacts, counterpartFacts }) =>
			versionDifferenceFieldList
				.filter((oneField) => {
					const comparableOf = versionValueFormByName[oneField.valueForm];
					return comparableOf((thisFacts.fieldByName || {})[oneField.fieldName]) !== comparableOf((counterpartFacts.fieldByName || {})[oneField.fieldName]);
				})
				.map((oneField) => {
					const fieldDifference = { differenceKind: 'field', fieldName: oneField.fieldName, fieldLabel: oneField.fieldLabel };
					return oneField.showsValues
						? { ...fieldDifference, thisValue: (thisFacts.fieldByName || {})[oneField.fieldName] ?? null, counterpartValue: (counterpartFacts.fieldByName || {})[oneField.fieldName] ?? null }
						: fieldDifference;
				});

		// members by version identity: added here, missing here (present only in the counterpart), defined differently
		const memberDifferenceOf = ({ thisFacts, counterpartFacts }) => {
			const counterpartMemberByIdentity = {};
			(counterpartFacts.memberList || []).forEach((oneMember) => {
				const identityText = versionIdentityOf(oneMember.releaseIndependentId);
				if (identityText !== null) counterpartMemberByIdentity[identityText] = oneMember;
			});
			const thisIdentitySet = new Set();
			const addedNameList = [];
			const differingNameList = [];
			(thisFacts.memberList || []).forEach((oneMember) => {
				const identityText = versionIdentityOf(oneMember.releaseIndependentId);
				if (identityText === null) return;
				thisIdentitySet.add(identityText);
				const counterpartMember = counterpartMemberByIdentity[identityText];
				if (!counterpartMember) addedNameList.push(oneMember.name);
				else if (counterpartMember.definitionDigest !== oneMember.definitionDigest) differingNameList.push(oneMember.name);
			});
			const missingNameList = Object.keys(counterpartMemberByIdentity).filter((identityText) => !thisIdentitySet.has(identityText)).map((identityText) => counterpartMemberByIdentity[identityText].name);
			if (!addedNameList.length && !missingNameList.length && !differingNameList.length) return null;
			const byName = (left, right) => String(left).localeCompare(String(right));
			return { differenceKind: 'members', addedNameList: addedNameList.sort(byName), missingNameList: missingNameList.sort(byName), differingNameList: differingNameList.sort(byName) };
		};

		// the type a property points at, matched by version identity; a differing digest means the type changed
		const typeDifferenceListOf = ({ thisFacts, counterpartFacts }) =>
			(thisFacts.typeList || [])
				.map((oneType) => {
					const counterpartType = versionIdentityMatchOf({ releaseIndependentId: oneType.releaseIndependentId, comparisonDigestRowList: counterpartFacts.typeList });
					if (counterpartType && counterpartType.definitionDigest === oneType.definitionDigest) return null;
					return { differenceKind: 'type', typeName: oneType.name, counterpartTypeName: counterpartType ? counterpartType.name : null };
				})
				.filter(Boolean);

		const versionDifferenceListOf = ({ thisFacts, counterpartFacts }) => {
			if (thisFacts.definitionDigest === counterpartFacts.definitionDigest) {
				return [];
			}
			const memberDifference = memberDifferenceOf({ thisFacts, counterpartFacts });
			const differenceList = fieldDifferenceListOf({ thisFacts, counterpartFacts })
				.concat(memberDifference ? [memberDifference] : [])
				.concat(typeDifferenceListOf({ thisFacts, counterpartFacts }));
			return differenceList.length ? differenceList : [{ differenceKind: 'unexplained' }];
		};

		// ================================================================================
		// RESULT TRANSFORMATION

		const mapNodeRecord = (nodeRecord) => ({
			stableId: nodeRecord.stableId,
			name: nodeRecord.name,
			kind: nodeKindOf(nodeRecord.labelList, nodeRecord.hubName),
			...hubNameFieldOf(nodeKindOf(nodeRecord.labelList, nodeRecord.hubName), nodeRecord.hubName),
			description: nodeRecord.description,
			path: nodeRecord.contextText || nodeRecord.path || null,
			standardKey: nodeRecord.standardKey,
			standardFamily: nodeRecord.standardFamily,
			releaseLabel: nodeRecord.releaseLabel,
			version: nodeRecord.version,
			rootStableId: nodeRecord.rootStableId,
			rootName: nodeRecord.rootName,
			hasVersionIdentity: versionIdentityOf(nodeRecord.releaseIndependentId) !== null,
		});

		const mapNodeSummaryRecord = (summaryRecord) => ({
			stableId: summaryRecord.stableId,
			name: summaryRecord.name,
			kind: nodeKindOf(summaryRecord.labelList, summaryRecord.hubName),
			...hubNameFieldOf(nodeKindOf(summaryRecord.labelList, summaryRecord.hubName), summaryRecord.hubName),
			standardKey: summaryRecord.standardKey,
			standardFamily: summaryRecord.standardFamily,
			releaseLabel: summaryRecord.releaseLabel,
			version: summaryRecord.version,
		});

		// ⟪explorerTidy review S2⟫ a row opens when its level would draw a row. A property's level folds its instances when there is at most one, or when every one maps the
		// same way (instanceFoldingOf); with no mapping on the property or any instance they all map the same way (none), so its instances never draw a row. A property
		// therefore opens only with a mapping, or a structural child that is not an instance. Every other kind opens on any structural child or mapping.
		const childHasRowsOf = ({ itemKind, childRecord, mappingList }) => {
			if (itemKind !== 'property') return Boolean(childRecord.hasStructuralChildren) || mappingList.length > 0;
			if (typeof childRecord.hasNonInstanceStructuralChildren !== 'boolean') throw new Error(`${moduleName}: the property '${childRecord.stableId}' was read without hasNonInstanceStructuralChildren, so whether it opens to anything is unknown`);
			return mappingList.length > 0 || childRecord.hasNonInstanceStructuralChildren;
		};

		const mapChildItem = (childRecord) => {
			const itemKind = nodeKindOf(childRecord.labelList, childRecord.hubName);
			const mappingList = collapseMappingList(childRecord.mappingList);
			const childItem = {
				stableId: childRecord.stableId,
				name: childRecord.name,
				kind: itemKind,
				...hubNameFieldOf(itemKind, childRecord.hubName),
				description: childRecord.description,
				hasChildren: childHasRowsOf({ itemKind, childRecord, mappingList }),
				hasVersionIdentity: versionIdentityOf(childRecord.releaseIndependentId) !== null,
			};
			if (childRecord.path !== undefined && childRecord.path !== null) {
				childItem.path = childRecord.path;
			}
			if (childRecord.ownerName) {
				childItem.ownerName = childRecord.ownerName;
			}
			if (itemKind === 'class' || itemKind === 'hubDomain') {
				childItem.propertyCount = childRecord.propertyCount;
				childItem.mappedPropertyCount = childRecord.mappedPropertyCount;
			}
			if (itemKind === 'property' || itemKind === 'instance' || itemKind === 'hubProperty') {
				childItem.mapping = mappingList.length ? mappingList[0] : null;
				childItem.mappingCount = mappingList.length;
				childItem.occurrenceCount = childRecord.occurrenceCount;
			}
			// a hub property is mapped TO, through its hub elements: how many there are and how many judgments reach them
			if (itemKind === 'hubProperty' && childRecord.hubElementCount !== undefined) {
				childItem.hubElementCount = childRecord.hubElementCount;
				childItem.mappedElementCount = childRecord.mappedElementCount;
				childItem.hasChildren = childItem.hasChildren || childRecord.hubElementCount > 0;
			}
			return childItem;
		};

		const mapChildGroupRecord = (groupRecord) => ({
			relationshipType: groupRecord.relationshipType,
			count: groupRecord.itemCount,
			truncated: groupRecord.itemCount > groupRecord.itemList.length,
			itemList: groupRecord.itemList.map(mapChildItem),
		});

		const childGroupOrderOf = (relationshipType) => {
			const orderIndex = childRelationshipTypeList.indexOf(relationshipType);
			return orderIndex === -1 ? childRelationshipTypeList.length : orderIndex;
		};

		const mapChildGroupRecordList = (groupRecordList) =>
			groupRecordList.map(mapChildGroupRecord).sort((left, right) => childGroupOrderOf(left.relationshipType) - childGroupOrderOf(right.relationshipType));

		// per match kind, how many distinct elements carry it, strongest first; the strongest names a group's one style
		const matchKindSummaryOf = (judgmentList) => {
			const elementStableIdSetByKind = {};
			const allElementStableIdSet = new Set();
			(judgmentList || []).forEach((oneJudgment) => {
				const matchKind = matchKindByEdgeType[oneJudgment.matchEdgeType].matchKind;
				(elementStableIdSetByKind[matchKind] || (elementStableIdSetByKind[matchKind] = new Set())).add(oneJudgment.elementStableId);
				allElementStableIdSet.add(oneJudgment.elementStableId);
			});
			const matchKindCountList = Object.keys(elementStableIdSetByKind)
				.map((matchKind) => ({ matchKind, elementCount: elementStableIdSetByKind[matchKind].size }))
				.sort((left, right) => strengthRankOf(left.matchKind) - strengthRankOf(right.matchKind));
			return { elementCount: allElementStableIdSet.size, matchKindCountList, strongestMatchKind: matchKindCountList.length ? matchKindCountList[0].matchKind : null };
		};

		// a hub property's hub elements, one item per anchor (domain × property), each with what maps to it
		const mapHubElementGroupRecord = (groupRecord) => ({
			relationshipType: 'USED_BY_HUB_ELEMENT',
			count: groupRecord.itemCount,
			truncated: groupRecord.itemCount > groupRecord.itemList.length,
			itemList: groupRecord.itemList.map((anchorRecord) => ({
				stableId: anchorRecord.stableId,
				name: anchorRecord.name,
				kind: nodeKindOf(anchorRecord.labelList, anchorRecord.hubName),
				hubName: anchorRecord.hubName,
				description: anchorRecord.description,
				hasChildren: true,
				standardFamily: anchorRecord.hubStandardFamily,
				hubDomainName: anchorRecord.hubDomainName,
				...matchKindSummaryOf(anchorRecord.judgmentList),
			})),
		});

		// the explorer's top: one item per family, with what the family holds
		const mapFamilyCatalogItemList = (familyRecordList) =>
			familyRecordList.map((familyRecord) => {
				const versionList = [...familyRecord.versionList].sort((left, right) => String(left.releaseLabel).localeCompare(String(right.releaseLabel)) || compareVersionText(left.version, right.version));
				return {
					stableId: familyIdOf(familyRecord.standardFamily),
					name: familyRecord.standardFamily,
					kind: 'family',
					description: '',
					hasChildren: familyRecord.standardCount > 0,
					standardFamily: familyRecord.standardFamily,
					standardCount: familyRecord.standardCount,
					releaseCount: familyRecord.releaseCount,
					classCount: familyRecord.classCount,
					versionList,
					...(familyRecord.standardCount === 1 ? { version: versionList[0].version } : {}),
				};
			});

		// the anchor's fan-out, one group per owning standard; a group's single edge style is its strongest kind
		const mapAnchorFanOut = ({ fanOutRecordList, anchorStableId }) => {
			const groupByStandardKey = {};
			(fanOutRecordList || []).forEach((oneRecord) => {
				const existingGroup =
					groupByStandardKey[oneRecord.standardKey] ||
					(groupByStandardKey[oneRecord.standardKey] = {
						stableId: standardGroupIdOf({ standardKey: oneRecord.standardKey, anchorStableId }),
						name: oneRecord.rootName,
						kind: 'standardGroup',
						hasChildren: true,
						standardKey: oneRecord.standardKey,
						standardFamily: oneRecord.standardFamily,
						releaseLabel: oneRecord.releaseLabel,
						version: oneRecord.version,
						elementStableIdSet: new Set(),
						matchKindCountList: [],
						maximumConfidence: 0,
					});
				oneRecord.elementStableIdList.forEach((elementStableId) => existingGroup.elementStableIdSet.add(elementStableId));
				existingGroup.matchKindCountList.push({ matchKind: matchKindByEdgeType[oneRecord.matchEdgeType].matchKind, elementCount: oneRecord.elementStableIdList.length });
				existingGroup.maximumConfidence = Math.max(existingGroup.maximumConfidence, oneRecord.maximumConfidence || 0);
			});
			return Object.values(groupByStandardKey)
				.map(({ elementStableIdSet, ...groupFieldList }) => {
					const matchKindCountList = groupFieldList.matchKindCountList.sort((left, right) => strengthRankOf(left.matchKind) - strengthRankOf(right.matchKind));
					return { ...groupFieldList, elementCount: elementStableIdSet.size, matchKindCountList, strongestMatchKind: matchKindCountList[0].matchKind };
				})
				.sort((left, right) => right.elementCount - left.elementCount || String(left.name).localeCompare(String(right.name)));
		};

		// of every shortest climb from the root, the one through a class; ties broken by the names, so it is stable
		const chooseAncestorChain = (chainRecordList) => {
			const chainList = (chainRecordList || []).map((oneRecord) => oneRecord.chainNodeList);
			if (chainList.length === 0) {
				return [];
			}
			const throughClassScore = (oneChain) => (oneChain[1] && nodeKindOf(oneChain[1].labelList, oneChain[1].hubName) === 'class' ? 0 : 1);
			const chainText = (oneChain) => oneChain.map((chainNode) => chainNode.name).join('/');
			const chosenChain = chainList.sort((left, right) => throughClassScore(left) - throughClassScore(right) || chainText(left).localeCompare(chainText(right)))[0];
			return chosenChain.slice(0, -1).map((chainNode) => ({ stableId: chainNode.stableId, name: chainNode.name, kind: nodeKindOf(chainNode.labelList, chainNode.hubName), ...hubNameFieldOf(nodeKindOf(chainNode.labelList, chainNode.hubName), chainNode.hubName) }));
		};

		// ================================================================================
		// ⟪meaningsExplorer⟫ THE MEANINGS WALK — ids and rows

		const meaningPrefixOf = (nodeKind) => meaningSyntheticIdPrefixList.find((oneEntry) => oneEntry.nodeKind === nodeKind).idPrefix;
		const meaningHubIdOf = (hubName) => `${meaningPrefixOf('meaningHub')}${hubName}`;
		const meaningDomainIdOf = (domainStableId) => `${meaningPrefixOf('meaningDomain')}${domainStableId}`;
		const meaningIdOf = (cardStableId) => `${meaningPrefixOf('meaning')}${cardStableId}`;
		const isMeaningCatalogId = (stableId) => stableId === MEANING_CATALOG_STABLE_ID;
		// the group a meaning is listed under at the catalog's first level (meaningCatalogGrouping): today its hub. A new grouping changes this and the registry
		const meaningGroupOf = ({ hubName }) => ({ stableId: meaningHubIdOf(hubName), name: hubName });

		// ⟪meaningsPolish⟫ an id of a level the walk no longer has (the registry's retiredLevel), so the caller refuses it by name
		const isRetiredMeaningLevelId = (stableId) => {
			const syntheticId = parseSyntheticId(stableId);
			return Boolean(syntheticId && allSyntheticIdPrefixList.find((oneEntry) => oneEntry.nodeKind === syntheticId.nodeKind).retiredLevel);
		};

		// the graph stableId an answer's object cites for its URI: its own stableId, or, for a synthetic row that stands for one graph node (a meaning, a
		// domain), that node's; null for any other synthetic id
		const citedGraphStableIdOf = (stableId) => {
			const syntheticId = parseSyntheticId(stableId);
			if (!syntheticId) {
				return stableId;
			}
			const prefixEntry = allSyntheticIdPrefixList.find((oneEntry) => oneEntry.nodeKind === syntheticId.nodeKind);
			return prefixEntry.citesStableIdOfRemainder && syntheticId.remainderText ? syntheticId.remainderText : null;
		};

		// ⟪explorerTidy, TQ: a value's Open "leads to an empty page"⟫ a meaning's next level lists its value meanings, and only a property meaning holds any (readMeaningNode),
		// so a row opens only when that level would list at least one: a property meaning holding values. A property meaning read without its value count is refused
		// by name, never guessed open or shut: the access point asks meaningCountAbsentRefusalOf first and answers its callback with the refusal (⟪review N3⟫); the
		// throw below is only the invariant behind that check.
		const valueMeaningCountNumberOf = (valueMeaningCount) => (typeof valueMeaningCount === 'number' ? valueMeaningCount : valueMeaningCount && typeof valueMeaningCount.toNumber === 'function' ? valueMeaningCount.toNumber() : null);
		const meaningCountAbsentRefusalOf = (meaningRecordList) => {
			const uncountedRecord = meaningRecordList.find((meaningRecord) => meaningRecord.referenceTier === MEANING_PROPERTY_TIER && valueMeaningCountNumberOf(meaningRecord.valueMeaningCount) === null);
			return uncountedRecord ? `${moduleName}: the property meaning '${uncountedRecord.cardStableId}' was read without its valueMeaningCount, so whether it opens to anything is unknown` : '';
		};
		const meaningOpensToRowsOf = (meaningRecord) => {
			if (meaningRecord.referenceTier !== MEANING_PROPERTY_TIER) return false;
			const countNumber = valueMeaningCountNumberOf(meaningRecord.valueMeaningCount);
			if (countNumber === null) throw new Error(meaningCountAbsentRefusalOf([meaningRecord]));
			return countNumber > 0;
		};

		// a meaning as a row: kind 'meaning', its id carrying the card's stableId; it opens when its level lists something (meaningOpensToRowsOf). Its own panel, focused
		// or selected, holds its tuple and where it is expressed.
		const mapMeaningItem = (meaningRecord, standardFamily) => ({
			stableId: meaningIdOf(meaningRecord.cardStableId),
			name: meaningRecord.name,
			kind: 'meaning',
			hubName: meaningRecord.hubName,
			standardFamily: standardFamily || null,
			description: meaningRecord.description || '',
			hasChildren: meaningOpensToRowsOf(meaningRecord),
			referenceTier: meaningRecord.referenceTier,
			...(meaningRecord.termKind ? { termKind: meaningRecord.termKind } : {}),
			...(meaningRecord.domainName ? { hubDomainName: meaningRecord.domainName } : {}),
			...(meaningRecord.rangeName ? { rangeName: meaningRecord.rangeName } : {}),
			...((meaningRecord.qualifierNameList || []).length ? { qualifierNameList: meaningRecord.qualifierNameList } : {}),
			elementCount: meaningRecord.mappedElementCount,
			// ⟪meaningsClarity⟫ a property meaning listed in its domain says what it holds: its value meanings, and the elements mapped to them (read only where listed)
			...(meaningRecord.valueMeaningCount === undefined ? {} : { valueMeaningCount: meaningRecord.valueMeaningCount, valueElementCount: meaningRecord.valueElementCount }),
		});

		// ⟪meaningsClarity⟫ a point of the meanings walk, as the walk reaches it from the top: the catalog, the hub's group, the domain, and (with a card) the meaning
		const meaningsWalkPathOf = ({ hubName, domainStableId, cardStableId }) => [
			MEANING_CATALOG_STABLE_ID,
			meaningGroupOf({ hubName }).stableId,
			meaningDomainIdOf(domainStableId),
			...(cardStableId === undefined ? [] : [meaningIdOf(cardStableId)]),
		];

		// ⟪meaningsClarity⟫ an incoming meaning as a row of the domain it names: the meaning's own row, the slots it names this domain in (in words: 'range'), and the
		// walk's path to it in its OWN domain, so opening it goes there (TQ: "goes to that meaning in its own domain"), not one step below this one
		// an incoming meaning's row record, with the value count its query read alongside it
		const incomingMeaningRecordOf = (incomingRecord) => ({ ...incomingRecord.meaningRow, valueMeaningCount: incomingRecord.valueMeaningCount });
		const mapIncomingMeaningItem = ({ incomingRecord, standardFamily }) => {
			const meaningItem = mapMeaningItem(incomingMeaningRecordOf(incomingRecord), standardFamily);
			return {
				...meaningItem,
				incomingSlotNameList: incomingRecord.slotEdgeTypeList.map((slotEdgeType) => slotNameOfEdgeTypeFor({ hubName: meaningItem.hubName, slotEdgeType })),
				meaningsWalkPathStableIdList: meaningsWalkPathOf({ hubName: meaningItem.hubName, domainStableId: incomingRecord.ownDomainStableId, cardStableId: incomingRecord.meaningRow.cardStableId }),
			};
		};

		const mapMeaningHubItem = (hubRecord) => ({
			stableId: meaningHubIdOf(hubRecord.hubName),
			name: hubRecord.hubName,
			kind: 'meaningHub',
			hubName: hubRecord.hubName,
			standardFamily: hubRecord.standardFamily || null,
			description: hubRecord.hubTitle || '',
			// ⟪meaningsPolish⟫ what its next level shows: its domains, and the property meanings they hold (the sum of the domains' meaningCount)
			domainCount: hubRecord.domainCount,
			meaningCount: hubRecord.domainMeaningCount,
			// TQ 2026-11-12: the mappings its domains' rows add up to (the same rule as each domain's mappingCount)
			mappingCount: hubRecord.domainMappingCount,
			hasChildren: hubRecord.domainCount > 0,
			...(hubRecord.version ? { version: hubRecord.version } : {}),
		});

		// ⟪review S4⟫ a domain's id in its hub's standard, in hubCardTuple's part shape: { nativeId: { <declared identifier name>: text } }, or the name of why
		// there is none (the graph declares no identifier for its standard, or the element carries none)
		const nativeIdFieldsOf = ({ sourceKey, nativeIdentifier, declarationList, declarationAbsentName }) => {
			if (!declarationList) return { nativeIdAbsentName: declarationAbsentName };
			const declaration = declarationList.find((oneDeclaration) => oneDeclaration.sourceKey === sourceKey);
			if (!declaration) return { nativeIdAbsentName: 'hubStandardDeclaresNoNativeIdentifier' };
			return nativeIdentifier === null || nativeIdentifier === undefined || String(nativeIdentifier) === ''
				? { nativeIdAbsentName: 'hubElementCarriesNoNativeIdentifier' }
				: { nativeId: { [declaration.nativeIdentifierPropertyName]: String(nativeIdentifier) } };
		};

		const mapMeaningDomainItem = ({ domainRecord, hubName, standardFamily, declarationList, declarationAbsentName }) => ({
			stableId: meaningDomainIdOf(domainRecord.stableId),
			name: domainRecord.name,
			kind: 'meaningDomain',
			hubName,
			standardFamily: standardFamily || null,
			description: domainRecord.description || '',
			// ⟪review S6⟫ a domain whose only meaning is its own term opens to that term
			hasChildren: domainRecord.meaningCount > 0 || domainRecord.termMeaningCount > 0,
			// ⟪meaningsPolish⟫ what its own level lists: its property meanings, how many of them a standard's element maps to, and its own term meaning (0 or 1)
			meaningCount: domainRecord.meaningCount,
			mappedMeaningCount: domainRecord.mappedMeaningCount,
			termMeaningCount: domainRecord.termMeaningCount,
			// ⟪meaningsClarity⟫ and the meanings of other domains that name it (incomingCardWhereTextFor), listed on its level apart from its own
			incomingMeaningCount: domainRecord.incomingMeaningCount,
			// TQ 2026-11-12: the mappings to its own meanings and its own term (the shared count rule, cardMappedElementCountTextFor, summed over its cards)
			mappingCount: domainRecord.mappingCount,
			...nativeIdFieldsOf({ sourceKey: domainRecord.sourceKey, nativeIdentifier: domainRecord.nativeIdentifier, declarationList, declarationAbsentName }),
		});

		// ⟪review S3, S6⟫ an element's path in the Standards Explorer, made here from the walk's own rules (familyIdOf, releaseIdOf, releaseIsWalkStepFor) so the
		// page never rebuilds them: the families catalog, the family, the release when it is a step, the climb from the root, the element. An element no climb
		// reaches from its root has no path, and says so by name (a path through a parent edge the graph does not hold would be invented).
		const STANDARDS_WALK_PATH_ABSENT_NAME_LIST = Object.freeze(['noClimbFromRoot']);
		const standardsWalkPathFieldsOf = ({ standardFamily, releaseLabel, releaseVersionCount, ancestorList, stableId }) =>
			ancestorList.length
				? { standardsWalkPathStableIdList: [FAMILY_CATALOG_STABLE_ID, familyIdOf(standardFamily), ...(releaseIsWalkStepFor(releaseVersionCount) ? [releaseIdOf({ standardFamily, releaseLabel })] : []), ...ancestorList.map((oneAncestor) => oneAncestor.stableId), stableId] }
				: { standardsWalkPathAbsentName: STANDARDS_WALK_PATH_ABSENT_NAME_LIST[0] };

		// "Expressed in": the anchor fan-out's groups (mapAnchorFanOut: one per standard, its true count and match mix, in its order), each holding its own capped,
		// ordered element rows (meaningExpressionsByCardStableId), each element with its relation, match basis, confidence and its Standards Explorer path
		const mapMeaningExpressionGroupList = ({ fanOutRecordList, expressionRecordList, cardStableId }) => {
			const expressionRecordByStandardKey = Object.fromEntries((expressionRecordList || []).map((oneRecord) => [oneRecord.standardKey, oneRecord]));
			return mapAnchorFanOut({ fanOutRecordList, anchorStableId: cardStableId }).map((oneGroup) => {
				const expressionRecord = expressionRecordByStandardKey[oneGroup.standardKey] || { expressionList: [] };
				const elementList = expressionRecord.expressionList.map((oneExpression) => {
					const ancestorList = chooseAncestorChain((oneExpression.chainNodeListList || []).map((chainNodeList) => ({ chainNodeList })));
					return {
						stableId: oneExpression.stableId,
						name: oneExpression.name,
						kind: nodeKindOf(oneExpression.labelList, oneExpression.hubName),
						...(oneExpression.ownerName ? { ownerName: oneExpression.ownerName } : {}),
						matchKind: matchKindByEdgeType[oneExpression.matchEdgeType].matchKind,
						...(oneExpression.matchBasis ? { matchBasis: oneExpression.matchBasis } : {}),
						...(typeof oneExpression.mappingConfidence === 'number' ? { mappingConfidence: oneExpression.mappingConfidence } : {}),
						...(oneExpression.mappingSource ? { mappingSource: oneExpression.mappingSource } : {}),
						ancestorList,
						...standardsWalkPathFieldsOf({ standardFamily: expressionRecord.standardFamily, releaseLabel: expressionRecord.releaseLabel, releaseVersionCount: expressionRecord.releaseVersionCount, ancestorList, stableId: oneExpression.stableId }),
					};
				});
				return { ...oneGroup, elementList, elementsTruncated: oneGroup.elementCount > elementList.length };
			});
		};

		// ⟪review N1⟫ a list of the meanings walk as a child group: its true count, at most GROUP_ITEM_CAP items, and whether it was cut
		const cappedChildGroupOf = ({ relationshipType, itemList }) => ({ relationshipType, count: itemList.length, truncated: itemList.length > GROUP_ITEM_CAP, itemList: itemList.slice(0, GROUP_ITEM_CAP) });

		const mapStandardItem = (catalogRecord) => ({
			stableId: catalogRecord.stableId,
			name: catalogRecord.name,
			kind: 'standard',
			description: catalogRecord.description,
			hasChildren: catalogRecord.classCount > 0,
			standardKey: catalogRecord.standardKey,
			standardFamily: catalogRecord.standardFamily,
			releaseLabel: catalogRecord.releaseLabel,
			version: catalogRecord.version,
			classCount: catalogRecord.classCount,
		});

		// the family's children: a one-version message is its standard; a many-version message is a release to pick from
		const mapFamilyItemList = (catalogRecordList) =>
			mapCatalogRecordList(catalogRecordList).map((oneRelease) => {
				if (!releaseIsWalkStepFor(oneRelease.versionList.length)) {
					return mapStandardItem(catalogRecordList.find((oneRecord) => oneRecord.stableId === oneRelease.versionList[0].stableId));
				}
				return {
					stableId: releaseIdOf(oneRelease),
					name: oneRelease.releaseLabel,
					kind: 'release',
					description: '',
					hasChildren: true,
					standardFamily: oneRelease.standardFamily,
					releaseLabel: oneRelease.releaseLabel,
					versionList: oneRelease.versionList.map((oneVersion) => ({ stableId: oneVersion.stableId, version: oneVersion.version, classCount: oneVersion.classCount })),
				};
			});

		const mapCatalogRecordList = (catalogRecordList) => {
			const releaseByLabel = {};
			catalogRecordList.forEach((oneRecord) => {
				const existingRelease = releaseByLabel[oneRecord.releaseLabel] || (releaseByLabel[oneRecord.releaseLabel] = { releaseLabel: oneRecord.releaseLabel, standardFamily: oneRecord.standardFamily, versionList: [] });
				existingRelease.versionList.push({ stableId: oneRecord.stableId, name: oneRecord.name, standardKey: oneRecord.standardKey, version: oneRecord.version, classCount: oneRecord.classCount, description: oneRecord.description });
			});
			return Object.values(releaseByLabel).map((oneRelease) => ({ ...oneRelease, versionList: oneRelease.versionList.sort((left, right) => compareVersionText(left.version, right.version)) }));
		};

		return {
			getCypher,
			requiredLabelList,
			matchKindByEdgeType,
			nodeKindOf,
			parseSyntheticId,
			familyIdOf,
			isFamilyCatalogId,
			FAMILY_CATALOG_STABLE_ID,
			mapFamilyCatalogItemList,
			mapHubElementGroupRecord,
			matchKindSummaryOf,
			releaseIdOf,
			parseReleaseRemainder,
			mapStandardItem,
			mapFamilyItemList,
			standardGroupIdOf,
			parseStandardGroupRemainder,
			collapseMappingList,
			instanceFoldingOf,
			versionIdentityOf,
			comparisonPeerOf,
			versionBadgeByStableId,
			versionIdentityMatchOf,
			versionDifferenceListOf,
			otherVersionListOf,
			versionDifferenceFieldList,
			mapNodeRecord,
			mapNodeSummaryRecord,
			mapChildItem,
			mapChildGroupRecordList,
			mapAnchorFanOut,
			chooseAncestorChain,
			mapCatalogRecordList,
			// ⟪meaningsExplorer⟫
			MEANING_CATALOG_STABLE_ID,
			MEANING_VALUE_TIER,
			MEANING_PROPERTY_TIER,
			GROUP_ITEM_CAP,
			meaningCatalogGrouping,
			meaningListTierList,
			isMeaningCatalogId,
			meaningGroupOf,
			meaningHubIdOf,
			meaningDomainIdOf,
			meaningIdOf,
			isRetiredMeaningLevelId,
			citedGraphStableIdOf,
			mapMeaningItem,
			meaningCountAbsentRefusalOf,
			// ⟪meaningsClarity⟫
			mapIncomingMeaningItem,
			incomingMeaningRecordOf,
			meaningsWalkPathOf,
			slotNameOfEdgeTypeFor,
			valueCardOfPropertyCardMatchTextFor,
			INCOMING_SLOT_NAME_LIST,
			MATCH_EDGE_TYPE_TEXT,
			meaningTermKindByLevel,
			mapMeaningHubItem,
			mapMeaningDomainItem,
			nativeIdFieldsOf,
			MEANING_TERM_TIER,
			mapMeaningExpressionGroupList,
			cappedChildGroupOf,
			STANDARDS_WALK_PATH_ABSENT_NAME_LIST,
		};
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
