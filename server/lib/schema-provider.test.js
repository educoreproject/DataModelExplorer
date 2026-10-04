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
const stubRelationshipTypeList = ['EXACT_MATCH', 'CLOSE_MATCH', 'BROAD_MATCH', 'HAS_PROPERTY'];
const stubMatchEdgePropertyList = ['mappingConfidence', 'mappingKind', 'mappingSource', 'predicate', 'zzStubOnlyProperty'];

const stubResultByQueryFragment = [
	{ queryFragment: 'db.labels()', records: [{ label: 'CedsProperty' }, { label: 'ForgedNode' }] },
	{
		queryFragment: 'db.relationshipTypes()',
		records: stubRelationshipTypeList.map((relationshipType) => ({ relationshipType })),
	},
	{ queryFragment: 'db.schema.nodeTypeProperties()', records: [{ label: 'CedsProperty', properties: ['name'] }] },
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

		finish();
	});
});

function finish() {
	console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
	process.exit(failed > 0 ? 1 : 0);
}
