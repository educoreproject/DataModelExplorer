'use strict';
const { readGoldenContainerName } = require('./lib/goldenContainerName'); // W-E-11: the golden is declared once
// dme-slack mapper gate (DME/Slack plan v3, task 1.5).
// Adversarial-term proof (user text ONLY in $params; hostile terms treated as
// data by the live golden), lookup fixture sanity, card shaping with output
// cap + deep link, and spend-ledger SQL escaping.
//
// Run: node server/test/dme-slack-mapper.test.js   (needs Docker + golden up)

process.global = {
	getConfig: () => ({}),
	xLog: {
		status: () => {},
		error: (m) => console.error('xLog.error:', m),
		verbose: () => {},
		result: () => {},
	},
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const dataMapping = require('../data-model/data-mapping/data-mapping')({
	pwHash: (x) => x,
	hashPassword: (x) => x,
	verifyPassword: () => true,
	validatePasswordStrength: () => ({ valid: true }),
});
const mapper = dataMapping['dme-slack'];

const validateReadOnly = require('../lib/cypher-validator');
const {
	resolveContainerConnection,
} = require('../data-model/lib/user-graph/container-connection-resolver');
const neo4jGen = require('../data-model/lib/neo4j-instance/neo4j-instance')({
	unused: true,
});

const results = [];
const ok = (name, cond, detail) => {
	results.push([name, !!cond]);
	console.log(`  ${cond ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

const series = (steps, done) => {
	let i = 0;
	const nextStep = (err) => {
		if (err) {
			done(err);
			return;
		}
		if (i >= steps.length) {
			done();
			return;
		}
		steps[i++](nextStep);
	};
	nextStep();
};

console.log('\n=== dme-slack mapper gate ===\n');

// --------------------------------------------------------------------
// static: adversarial terms never reach query text

console.log('Parameterization (static):');
const ADVERSARIAL_TERMS = [
	"birth' OR 1=1 --",
	'x}) MATCH (m) DETACH DELETE m //',
	'CALL apoc.load.json("x")',
	'$term',
	'"; DROP TABLE nodes; --',
];

// the real property: the query TEXT is a constant template — identical for a
// benign term and every hostile term — while the term itself rides in $params.
const baselineCypher = mapper.getCypher('elementSearch', { term: 'birth date' }).cypher;

ADVERSARIAL_TERMS.forEach((term) => {
	const spec = mapper.getCypher('elementSearch', { term });
	const templateConstant = spec.cypher === baselineCypher;
	const inParams = spec.params.term === term;
	const validatorPasses = validateReadOnly(spec.cypher).valid;
	ok(
		`hostile term stays in $params: ${JSON.stringify(term.slice(0, 24))}`,
		templateConstant && inParams && validatorPasses,
	);
});

// W-E-2: a card is keyed by stableId; both card queries keep a hostile key in $params and pass the validator
['elementCardOwn', 'elementCardViaInstance'].forEach((cardQueryName) => {
	const cardSpec = mapper.getCypher(cardQueryName, { stableId: "BirthDate') DETACH DELETE n //" });
	ok(
		`${cardQueryName} hostile stableId stays in $params`,
		!!cardSpec && !cardSpec.cypher.includes('DETACH DELETE n //') &&
			cardSpec.params.stableId === "BirthDate') DETACH DELETE n //" &&
			validateReadOnly(cardSpec.cypher).valid,
	);
});

console.log('\nSpend-ledger SQL escaping:');
const hostileUserId = "U123'; DROP TABLE dmeSlackSpend; --";
const spendSql = mapper.getSql('todayUserSpend', {
	tableName: 'dmeSlackSpend',
	slackUserId: hostileUserId,
	localDay: '2026-07-13',
});
// sqlite escaping doubles the payload's quote, so the injection stays INSIDE
// the string literal: ... slackUserId = 'U123''; DROP TABLE ... --'
ok(
	'hostile slackUserId quote is doubled (payload trapped in the literal)',
	spendSql.includes('dmeSlackSpend') && spendSql.includes("U123''; DROP TABLE"),
	spendSql.slice(0, 120),
);
ok(
	'escaped value is a single quoted literal to the statement end',
	/slackUserId = 'U123''; DROP TABLE dmeSlackSpend; --'/.test(spendSql),
);

console.log('\nBlock Kit shaping:');
const longAnswer = 'A'.repeat(20000);
const askBlocks = mapper.buildAskAnswerBlocks({
	question: 'what CEDS element corresponds to SIF StudentPersonal birth date?',
	answerText: longAnswer,
	dmeBaseUrl: 'https://qbook.work',
});
const sectionBlocks = askBlocks.filter((b) => b.type === 'section');
const contextBlock = askBlocks.find((b) => b.type === 'context');
const totalChars = sectionBlocks.reduce((sum, b) => sum + b.text.text.length, 0);
ok(
	'over-long answer capped with trim affordance',
	totalChars <= mapper.limits.answerTotalCap &&
		contextBlock &&
		/trimmed/i.test(contextBlock.elements[0].text),
	`sections=${sectionBlocks.length} chars=${totalChars}`,
);
ok(
	'every section respects the per-section cap',
	sectionBlocks.every((b) => b.text.text.length <= mapper.limits.sectionTextCap),
);
ok(
	'deep link is the ?prompt= explorer affordance, URL-encoded',
	/https:\/\/qbook\.work\/dm\/explorer\?prompt=what%20CEDS/.test(
		contextBlock.elements[0].text,
	),
);

console.log('\nMatch relations on the element card (lane Q, 2026-10-04):');
const judgedCardText = mapper
	.buildLookupBlocks({
		term: 'birthday',
		totalMatches: 1,
		dmeBaseUrl: 'https://qbook.work',
		cards: [
			{
				name: 'Birthday',
				source: 'PESC-CollegeTranscript-1.8.0',
				hubTuples: [
					{ mappingType: 'BROAD_MATCH', confidence: 0.9, mappingKind: 'inferred', mappingSource: 'bridge-jev', hubName: 'Birthdate', hubKey: 'P000033', cedsDomain: 'Person Birth', cedsProperty: 'Birthdate', cedsRange: 'date' },
					{ mappingType: 'NARROW_MATCH', confidence: 0, mappingKind: 'inferred', mappingSource: 'bridge-debug', hubName: 'Birth Place', hubKey: 'P000999', cedsProperty: 'Birth Place' },
				],
				peers: [],
			},
		],
	})
	.map((block) => (block.text ? block.text.text : ''))
	.join('\n');
ok('a BROAD_MATCH tuple is labelled broad, not close', /P000033`? \(broad 90%/.test(judgedCardText), judgedCardText.split('\n').find((l) => l.includes('P000033')));
ok('a NARROW_MATCH tuple is labelled narrow', /P000999`? \(narrow/.test(judgedCardText));
ok('the card names who decided (mappingSource)', judgedCardText.includes('bridge-jev,') || judgedCardText.includes('bridge-jev)'));
ok("a debug-judge tuple (mappingSource 'bridge-debug') is flagged as a placeholder", /DEBUG placeholder/.test(judgedCardText));

// W-E-1 / W-E-2 (campaign P1, 2026-10-06): instance-carried tuples say so; a card with more tuples than it shows says how
// many were left out; an undeclared carrier is refused by name
console.log('\nInstance-carried tuples and overflow (W-E-1 / W-E-2):');
const toolPayloadContract = require('../../cli/lib.d/data-model-explorer/lib/toolPayloadContract');
const { SLACK_LOOKUP_LIMITS, SLACK_LOOKUP_SEARCH_ROW_FIELD_LIST, SLACK_ELEMENT_CARD_TUPLE_FIELD_LIST, SLACK_CARDABLE_ROLE_LIST } = toolPayloadContract;
const manyTupleCardText = mapper
	.buildLookupBlocks({
		term: 'many',
		totalMatches: 1,
		dmeBaseUrl: 'https://qbook.work',
		cards: [{
			name: 'Many', source: 'EdFi',
			hubTuples: [1, 2, 3, 4, 5, 6].map((tupleNumber) => ({ mappingType: 'EXACT_MATCH', confidence: 0.9, mappingSource: 'bridge-jev', hubName: `Hub ${tupleNumber}`, hubKey: `P00000${tupleNumber}`, cedsProperty: `Property ${tupleNumber}`, carriedBy: 'own', instanceGroupList: [], instanceCount: 0 })),
			peers: [],
		}],
	})
	.map((block) => (block.text ? block.text.text : ''))
	.join('\n');
ok(`a card with 6 tuples shows ${SLACK_LOOKUP_LIMITS.tupleLinesShown} and says '+${6 - SLACK_LOOKUP_LIMITS.tupleLinesShown} more tuples'`, new RegExp(`\\+${6 - SLACK_LOOKUP_LIMITS.tupleLinesShown} more tuples`).test(manyTupleCardText), manyTupleCardText.split('\n').slice(-2).join(' | '));
const mergedCard = mapper.mergeElementCard({
	ownRow: { name: 'BirthDate', source: 'SIF260928', stableId: 'x', hubTuples: [{ mappingType: null, hubName: null }], peers: [] },
	viaInstanceRow: { hubTuples: [{ mappingType: 'EXACT_MATCH', confidence: 0.9, mappingSource: 'bridge-jev', hubName: 'Birthdate', hubKey: 'P000033', cedsProperty: 'Birthdate', carriedBy: 'instance', instanceGroupList: ['StudentPersonal', 'StaffPersonal'], instanceCount: 6 }], peers: [] },
});
ok('mergeElementCard joins the own and instance arms', !mergedCard.refusalText && mergedCard.card.hubTuples.filter((tuple) => tuple.hubName).length === 1);
const instanceCardText = mapper.buildLookupBlocks({ term: 'birth date', totalMatches: 1, dmeBaseUrl: 'https://qbook.work', cards: [mergedCard.card] }).map((block) => (block.text ? block.text.text : '')).join('\n');
ok("an instance-carried tuple reads 'via 6 instances: StudentPersonal, StaffPersonal'", /via 6 instances: StudentPersonal, StaffPersonal/.test(instanceCardText), instanceCardText.split('\n').find((lineText) => lineText.includes('P000033')));
const strangeCarrierCard = mapper.mergeElementCard({
	ownRow: { name: 'X', source: 'EdFi', stableId: 'x', hubTuples: [], peers: [] },
	viaInstanceRow: { hubTuples: [{ mappingType: 'EXACT_MATCH', hubName: 'H', hubKey: 'P1', carriedBy: 'cousin', instanceGroupList: [], instanceCount: 1 }], peers: [] },
});
ok("an undeclared carriedBy ('cousin') is refused by name", /carriedBy 'cousin'/.test(strangeCarrierCard.refusalText || ''), strangeCarrierCard.refusalText);

// --------------------------------------------------------------------
// live: fixture lookup + hostile terms as data

const conn = resolveContainerConnection(readGoldenContainerName());
if (conn.error) {
	console.error(`Cannot resolve golden connection: ${conn.error}`);
	process.exit(1);
}

let db;
let fixtureRows;

console.log('\nLive golden (fixture + adversarial):');
series(
	[
		(next) => {
			neo4jGen.initDatabaseInstance(
				{
					neo4jBoltUri: conn.boltUri,
					neo4jUser: conn.user,
					neo4jPassword: conn.password,
					readOnly: true,
					queryTimeoutMs: 15000,
				},
				(err, handle) => {
					db = handle;
					next(err);
				},
			);
		},

		(next) => {
			const spec = mapper.getCypher('elementSearch', { term: 'birth date' });
			db.runQuery(spec.cypher, spec.params, (err, rows) => {
				fixtureRows = rows || [];
				ok(
					"fixture '/dme birth date' finds elements (space-insensitive)",
					!err && fixtureRows.length > 0 &&
						fixtureRows.some((r) => /birth\s?date/i.test(r.name)),
					err || fixtureRows.slice(0, 3).map((r) => `${r.source}:${r.name}`).join(', '),
				);
				next();
			});
		},

		(next) => {
			ok(
				'elementSearch rows carry exactly SLACK_LOOKUP_SEARCH_ROW_FIELD_LIST, one per node (distinct stableId), declarations only',
				fixtureRows.length > 0 &&
					fixtureRows.every((row) => JSON.stringify(Object.keys(row).sort()) === JSON.stringify([...SLACK_LOOKUP_SEARCH_ROW_FIELD_LIST].sort())) &&
					new Set(fixtureRows.map((row) => row.stableId)).size === fixtureRows.length &&
					fixtureRows.every((row) => SLACK_CARDABLE_ROLE_LIST.includes(row.role)),
				fixtureRows.slice(0, 2).map((row) => JSON.stringify(row)).join(' | ').slice(0, 220),
			);
			const countSpec = mapper.getCypher('elementSearchCount', { term: 'birth date' });
			db.runQuery(countSpec.cypher, countSpec.params, (err, rows) => {
				const totalMatchCount = rows && rows[0] ? rows[0].totalMatchCount : null;
				ok(`elementSearchCount (${totalMatchCount}) >= the page and > the page size ${SLACK_LOOKUP_LIMITS.searchPageSize} (the "of N" is the whole count)`, !err && totalMatchCount >= fixtureRows.length && totalMatchCount > SLACK_LOOKUP_LIMITS.searchPageSize, err);
				next();
			});
		},

		(next) => {
			// the card for a node, by stableId: own arm + instance arm, merged as the dispatch merges them
			const readCard = (stableId, callback) => {
				const ownSpec = mapper.getCypher('elementCardOwn', { stableId });
				db.runQuery(ownSpec.cypher, ownSpec.params, (ownError, ownRows) => {
					const viaSpec = mapper.getCypher('elementCardViaInstance', { stableId });
					db.runQuery(viaSpec.cypher, viaSpec.params, (viaError, viaRows) => {
						callback(ownError || viaError, mapper.mergeElementCard({ ownRow: ownRows && ownRows[0], viaInstanceRow: viaRows && viaRows[0] }));
					});
				});
			};
			const cardTextOf = (card) => mapper.buildLookupBlocks({ term: 't', cards: [card], totalMatches: 1, dmeBaseUrl: 'https://qbook.work' }).map((block) => (block.text ? block.text.text : '')).join('\n');
			readCard('sif260928:question/77778159015aa9d8b4bfc223cb156fda47a1ef45584313d177383cc2398d8388', (err, { card, refusalText } = {}) => {
				const realTuples = card ? card.hubTuples.filter((tuple) => tuple.hubName) : [];
				ok('SIF Question BirthDate (0 own edges, 6 instance edges): ONE real tuple, P000033, carriedBy instance, instanceCount 6, groups include StudentPersonal',
					!err && !refusalText && realTuples.length === 1 && realTuples[0].hubKey === 'P000033' && realTuples[0].carriedBy === 'instance' && realTuples[0].instanceCount === 6 && realTuples[0].instanceGroupList.includes('StudentPersonal'),
					err || refusalText || JSON.stringify(realTuples).slice(0, 220));
				ok('  every tuple field is declared (SLACK_ELEMENT_CARD_TUPLE_FIELD_LIST)', !!card && card.hubTuples.every((tuple) => Object.keys(tuple).every((fieldName) => SLACK_ELEMENT_CARD_TUPLE_FIELD_LIST.includes(fieldName))));
				ok("  the card text says 'via 6 instances'", !!card && /via 6 instances/.test(cardTextOf(card)), card ? cardTextOf(card).split('\n').find((lineText) => lineText.includes('P000033')) : '');
				readCard('pesccollegetranscript1v8v0:type/urn:org:pesc:core:CoreMain:v1.19.0#BirthType/el/1:BirthDate', (pescError, pescCard) => {
					ok('PESC CollegeTranscript BirthDate: an instance tuple grouped by section CollegeTranscript/Student/Person', !pescError && pescCard.card && pescCard.card.hubTuples.some((tuple) => tuple.carriedBy === 'instance' && tuple.instanceGroupList.includes('CollegeTranscript/Student/Person')), pescError || JSON.stringify(pescCard.card && pescCard.card.hubTuples).slice(0, 200));
					db.runQuery("MATCH (n:ForgedNode {_source: 'EdFi', role: 'DmeProperty', name: 'BirthDate'})-[:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(:HubReference) RETURN n.stableId AS stableId ORDER BY n.stableId LIMIT 1", {}, (edfiError, edfiRows) => {
						readCard(edfiRows[0].stableId, (ownCardError, edfiCard) => {
							ok('control: an Ed-Fi property with its own edge shows carriedBy own', !ownCardError && edfiCard.card && edfiCard.card.hubTuples.some((tuple) => tuple.hubName && tuple.carriedBy === 'own'), JSON.stringify(edfiCard.card && edfiCard.card.hubTuples).slice(0, 200));
							next();
						});
					});
				});
			});
		},

		(next) => {
			const identitySpec = mapper.getCypher('graphIdentity');
			db.runQuery(identitySpec.cypher, identitySpec.params, (err, rows) => {
				db.runQuery('MATCH (n:ForgedNode) WHERE NOT n:GraphMeta RETURN count(n) AS contentNodeCount', {}, (countError, countRows) => {
					const identityRow = rows && rows[0];
					ok(`graphIdentity reads the passport: graphName ${readGoldenContainerName()}, contentNodeCount = the live non-GraphMeta count`,
						!err && !countError && identityRow && identityRow.graphName === readGoldenContainerName() && identityRow.contentNodeCount === countRows[0].contentNodeCount,
						err || countError || JSON.stringify(identityRow).slice(0, 200));
					next();
				});
			});
		},

		(next) => {
			// hostile terms, executed live: treated as data — no error, no effect
			let remaining = ADVERSARIAL_TERMS.length;
			let allBenign = true;
			ADVERSARIAL_TERMS.forEach((term) => {
				const spec = mapper.getCypher('elementSearch', { term });
				db.runQuery(spec.cypher, spec.params, (err, rows) => {
					if (err) {
						allBenign = false;
					}
					remaining -= 1;
					if (remaining === 0) {
						ok('hostile terms execute as inert data on live golden', allBenign);
						next();
					}
				});
			});
		},

		(next) => {
			db.runQuery(
				'MATCH (n:ForgedNode) RETURN count(n) AS c',
				{},
				(err, rows) => {
					ok(
						'golden node count unchanged shape (sanity)',
						!err && rows[0].c > 100000,
						`count=${rows && rows[0] && rows[0].c}`,
					);
					next();
				},
			);
		},
	],
	(err) => {
		if (db) {
			db.close();
		}
		if (err) {
			console.error(`\nGate aborted: ${err}`);
			process.exit(1);
		}
		const failed = results.filter(([, pass]) => !pass).length;
		console.log(
			`\n=== Results: ${results.length - failed} passed, ${failed} failed ===\n`,
		);
		process.exit(failed > 0 ? 1 : 0);
	},
);
