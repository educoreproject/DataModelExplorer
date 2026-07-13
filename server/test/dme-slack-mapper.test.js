'use strict';
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

const cardSpec = mapper.getCypher('elementCard', {
	name: "BirthDate') DETACH DELETE n //",
	source: 'SIF',
});
ok(
	'elementCard hostile name stays in $params',
	!cardSpec.cypher.includes('DETACH DELETE n //') &&
		cardSpec.params.name === "BirthDate') DETACH DELETE n //" &&
		validateReadOnly(cardSpec.cypher).valid,
);

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

// --------------------------------------------------------------------
// live: fixture lookup + hostile terms as data

const conn = resolveContainerConnection(process.env.GOLDEN_CONTAINER || 'gf_pvsEcand');
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
			const first = fixtureRows.find((r) => r.source !== 'CEDS') || fixtureRows[0];
			const spec = mapper.getCypher('elementCard', {
				name: first.name,
				source: first.source,
			});
			db.runQuery(spec.cypher, spec.params, (err, rows) => {
				const card = rows && rows[0];
				const tuples = card ? (card.hubTuples || []).filter((t) => t.hubName) : [];
				ok(
					'elementCard returns identity + hub tuples for a spoke element',
					!err && card && card.name === first.name,
					err || `${card.source}:${card.name} tuples=${tuples.length}`,
				);
				const blocks = mapper.buildLookupBlocks({
					term: 'birth date',
					cards: [card],
					totalMatches: fixtureRows.length,
					dmeBaseUrl: 'https://qbook.work',
				});
				ok(
					'lookup blocks build from live card',
					Array.isArray(blocks) &&
						blocks.some((b) => b.type === 'section' && b.text.text.includes(card.name)),
				);
				next();
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
