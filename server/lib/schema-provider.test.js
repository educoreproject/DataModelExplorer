#!/usr/bin/env node
'use strict';

// ============================================================================
// schema-provider.test.js — Tests for the DME graph schema provider.
//
// The provider's text is read by LLMs (the MCP getSchema tool, the DME's
// dme_user_schema tool), so what it SAYS about match edges is the contract under
// test: four SKOS relations, every edge a judgment carrying mappingConfidence /
// mappingKind / mappingSource, relation and confidence independent, nothing
// presented as authoritative. Runs against a stub neo4jDb; no live graph needed.
//
//   node server/lib/schema-provider.test.js
// ============================================================================

const schemaProviderPath = process.argv[2] || './schema-provider';
const schemaProvider = require(schemaProviderPath);

let passed = 0;
let failed = 0;

const assert = (testName, condition) => {
	if (condition) {
		passed++;
		console.log(`  PASS: ${testName}`);
	} else {
		failed++;
		console.log(`  FAIL: ${testName}`);
	}
};

const matchEdgeTypeList = ['EXACT_MATCH', 'CLOSE_MATCH', 'BROAD_MATCH', 'NARROW_MATCH'];
const skosPredicateList = ['exactMatch', 'closeMatch', 'broadMatch', 'narrowMatch'];

// A graph that holds three of the four match types, so the live listing must
// omit the absent one rather than invent its properties.
const stubRelationshipTypeList = ['EXACT_MATCH', 'CLOSE_MATCH', 'BROAD_MATCH', 'HAS_PROPERTY', 'HAS_CEDS_DOMAIN', 'HAS_CEDS_PROPERTY', 'HAS_CEDS_RANGE', 'HAS_CEDS_VALUE', 'HAS_CEDS_QUALIFIER'];
const stubMatchEdgePropertyList = ['mappingConfidence', 'mappingKind', 'mappingSource', 'predicate', 'zzStubOnlyProperty'];

const stubResultByQueryFragment = [
	{ queryFragment: 'db.labels()', records: [{ label: 'CedsProperty' }, { label: 'ForgedNode' }] },
	{
		queryFragment: 'db.relationshipTypes()',
		records: stubRelationshipTypeList.map((relationshipType) => ({ relationshipType })),
	},
	{ queryFragment: 'db.schema.nodeTypeProperties()', records: [{ label: 'CedsProperty', properties: ['name'] }] },
	// ⟪lane zbE, E2-4⟫ the label property names are read by a keys() scan; the passport identity keys the text cache
	{ queryFragment: 'UNWIND keys(n)', records: [{ label: 'CedsProperty', properties: ['name'] }] },
	{ queryFragment: 'MATCH (p:GraphProvenance)', records: [] },
	// W-D-17 (campaign P1): the role and _source lines are read from the graph
	{ queryFragment: 'DISTINCT n.role', records: [{ role: 'DmeProperty' }, { role: 'HubReference' }] },
	{ queryFragment: 'DISTINCT n._source', records: [{ source: 'CEDS' }] },
	// ⟪ctdlHub P7⟫ the hubs and the live matchBasis values are read from the graph
	{ queryFragment: 'MATCH (h:HubDefinition)', records: [{ hubName: 'CEDS', hubSource: 'CEDS', hubVersion: '14.0.0.0', canonicalKeyName: 'CEDS Global ID' }] },
	{ queryFragment: 'AS matchBasis', records: [{ matchBasis: 'derived' }] },
	{
		queryFragment: 'db.schema.relTypeProperties()',
		records: [
			{ relType: ':`EXACT_MATCH`', properties: stubMatchEdgePropertyList },
			{ relType: ':`CLOSE_MATCH`', properties: stubMatchEdgePropertyList },
			{ relType: ':`BROAD_MATCH`', properties: stubMatchEdgePropertyList },
			{ relType: ':`HAS_PROPERTY`', properties: [null] },
		],
	},
];

const stubNeo4jDb = {
	runQuery: (queryText, queryParams, callback) => {
		const stubResult = stubResultByQueryFragment.find((candidate) =>
			queryText.includes(candidate.queryFragment),
		);
		if (!stubResult) {
			callback(`stub neo4jDb: no canned result for query: ${queryText}`);
			return;
		}
		callback('', stubResult.records);
	},
};

console.log('\n=== Schema Provider Tests ===\n');

schemaProvider({ neo4jDb: undefined })((absentDbError) => {
	assert(
		'Refuses by name when neo4jDb is absent',
		typeof absentDbError === 'string' && absentDbError.includes('neo4jDb not available'),
	);

	schemaProvider({ neo4jDb: stubNeo4jDb })((err, schemaText) => {
		assert(`Renders without error (${err || 'none'})`, !err);
		assert('Returns a non-empty string', typeof schemaText === 'string' && schemaText.length > 0);
		if (typeof schemaText !== 'string') {
			finish();
			return;
		}

		const crossSection = schemaText.slice(
			schemaText.indexOf('## Cross-Standard Relationships'),
			schemaText.indexOf('## Node Structural Categories'),
		);

		matchEdgeTypeList.forEach((edgeType, index) => {
			assert(`Guidance names match relation ${edgeType}`, crossSection.includes(edgeType));
			assert(
				`Guidance names SKOS predicate ${skosPredicateList[index]}`,
				crossSection.includes(`'${skosPredicateList[index]}'`),
			);
		});

		['mappingConfidence', 'mappingKind', 'mappingSource'].forEach((fieldName) => {
			assert(`Guidance explains ${fieldName}`, crossSection.includes(`\`${fieldName}\``));
		});

		assert(
			"Guidance names mappingSource 'bridge-debug' as the debug marker",
			crossSection.includes('`bridge-debug`') && !crossSection.includes('invalid-debug'),
		);
		assert(
			'Guidance prose does not describe provenanceTier (match edges no longer carry it)',
			!crossSection.includes('provenanceTier'),
		);
		assert(
			'Guidance says every match edge is a judgment',
			/every match edge is a judgment/i.test(schemaText),
		);
		assert(
			'Guidance says relation and confidence are independent axes',
			/relation and confidence are independent axes/i.test(schemaText),
		);

		// Phrases that once told LLMs a judged edge was fact, or listed properties
		// no judged edge carries.
		const forbiddenPhraseList = [
			'— authored crosswalk',
			'Trust as fact',
			'Deterministic/authoritative',
			'confidence (1.0)',
			'rerankScore',
			'cosineScore',
			'EXACT_MATCH (authored)',
			'golden_vector',
			'(plus `:golden`)',
		];
		forbiddenPhraseList.forEach((forbiddenPhrase) => {
			assert(`Does not say "${forbiddenPhrase}"`, !schemaText.includes(forbiddenPhrase));
		});

		const liveSection = schemaText.slice(
			schemaText.indexOf('## Match Edge Properties (live)'),
			schemaText.indexOf('## The Universal Forge Contract'),
		);
		assert(
			'Lists match-edge properties read from the live graph',
			schemaText.includes('## Match Edge Properties (live)') &&
				liveSection.includes('zzStubOnlyProperty'),
		);
		assert(
			'Live listing omits a match type the graph does not hold',
			!liveSection.includes('NARROW_MATCH'),
		);

		const exampleQueryList = schemaText
			.split('```cypher')
			.slice(1)
			.map((block) => block.split('```')[0]);
		const mappingExampleList = exampleQueryList.filter((queryText) =>
			matchEdgeTypeList.some((edgeType) => queryText.includes(edgeType)),
		);
		assert(
			`Has example queries that read match edges (found ${mappingExampleList.length})`,
			mappingExampleList.length >= 3,
		);
		assert(
			'Every example that reads match edges reads all four relations',
			mappingExampleList.every((queryText) =>
				matchEdgeTypeList.every((edgeType) => queryText.includes(edgeType)),
			),
		);
		assert(
			'Every example that reads match edges returns mappingConfidence',
			mappingExampleList.every((queryText) => queryText.includes('mappingConfidence')),
		);
		// ⟪ctdlHub P7⟫ the hub prose is generated from the graph, and every hub-reading example filters by hubName
		assert('one hub: the anchor sentence names it with its version', schemaText.includes('anchored on 1 hub: CEDS 14.0.0.0'));
		assert('matchBasis is named as where the authority lies, with the live values', crossSection.includes('`matchBasis`') && crossSection.includes('live values: derived') && /edge TYPE never carries authority/.test(crossSection));
		assert('every example that reads match edges filters by hubName', mappingExampleList.every((queryText) => queryText.includes('hubName: $hubName')));
		assert('a graph without HAS_TERM_REFERENCE / DECLARED_CORRESPONDENCE gets neither passage', !schemaText.includes('**HAS_TERM_REFERENCE**') && !schemaText.includes('**DECLARED_CORRESPONDENCE**'));
		assert('the decomposition sentence names the graph\'s own slot edges, not a literal', crossSection.includes('(in this graph: HAS_CEDS_DOMAIN, HAS_CEDS_PROPERTY, HAS_CEDS_RANGE, HAS_CEDS_VALUE, HAS_CEDS_QUALIFIER)'));

		twoHubChecks();
	});
});

// ⟪ctdlHub P7⟫ the same provider over a graph holding TWO hubs, a term tier and declared correspondences; and over none
function twoHubChecks() {
	const twoHubStubDb = {
		runQuery: (queryText, queryParams, callback) => {
			if (queryText.includes('MATCH (h:HubDefinition)')) {
				callback('', [{ hubName: 'CEDS', hubSource: 'CEDS', hubVersion: '14.0.0.0', canonicalKeyName: 'CEDS Global ID' }, { hubName: 'CTDL', hubSource: 'CTDL', hubVersion: 'Release 20260327', canonicalKeyName: 'CTDL term CURIE' }]);
				return;
			}
			if (queryText.includes('db.relationshipTypes()')) {
				callback('', stubRelationshipTypeList.concat(['HAS_TERM_REFERENCE', 'DECLARED_CORRESPONDENCE', 'HAS_CTDL_DOMAIN', 'HAS_CTDL_PROPERTY', 'HAS_CTDL_RANGE', 'HAS_CTDL_VALUE']).map((relationshipType) => ({ relationshipType })));
				return;
			}
			stubNeo4jDb.runQuery(queryText, queryParams, callback);
		},
	};
	schemaProvider({ neo4jDb: twoHubStubDb })((twoHubError, twoHubText) => {
		assert(`two hubs: renders without error (${twoHubError || 'none'})`, !twoHubError);
		const text = twoHubText || '';
		assert('two hubs: "anchored on 2 hubs: CEDS 14.0.0.0, CTDL Release 20260327"', text.includes('anchored on 2 hubs: CEDS 14.0.0.0, CTDL Release 20260327'));
		assert('two hubs: each hub\'s card identifier in its own words', text.includes('CEDS: CEDS Global ID; CTDL: CTDL term CURIE'));
		assert('two hubs: hubs are peers and never chain', /Hubs are peers and never chain/.test(text));
		assert('two hubs: both hubs\' slot edges are listed', text.includes('HAS_CTDL_DOMAIN') && text.includes('HAS_CEDS_DOMAIN'));
		assert('a slot edge the graph does not hold is not named (CTDL here holds no QUALIFIER edge)', !text.includes('HAS_CTDL_QUALIFIER'));
		assert('a graph holding HAS_TERM_REFERENCE gets the term-tier passage', text.includes('**HAS_TERM_REFERENCE**'));
		assert('a graph holding DECLARED_CORRESPONDENCE is told it is NOT a match edge', text.includes('**DECLARED_CORRESPONDENCE** is NOT a match edge'));
		const noHubStubDb = { runQuery: (queryText, queryParams, callback) => (queryText.includes('MATCH (h:HubDefinition)') ? callback('', []) : stubNeo4jDb.runQuery(queryText, queryParams, callback)) };
		schemaProvider({ neo4jDb: noHubStubDb })((noHubError) => {
			assert('a graph holding no :HubDefinition is refused by name', /holds no :HubDefinition node/.test(noHubError || ''));
			finish();
		});
	});
}

function finish() {
	console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
	process.exit(failed > 0 ? 1 : 0);
}
