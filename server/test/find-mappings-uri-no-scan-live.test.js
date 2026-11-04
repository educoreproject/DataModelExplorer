'use strict';
// find-mappings-uri-no-scan-live.test.js — an edc: URI that names nothing is refused by name without a scan, as the resolver refuses it (cardUriAnswers-110426). The scan read every node, 8 s on demo, and held a scan slot,
// to look in names for something no name holds. Every kind reaching the path, by the verb's own admitScan: a scan attempted is a failure. Also the two facts this rests on, checked on the golden it runs against, so a golden
// where they stop being true fails here: no name or identifier holds such a URI except as a stableId. Skips by name when no graph is reachable.

const { openHarness } = require('./lib/rosettaLiveHarness');
const dmeSearchModule = require('../../cli/lib.d/data-model-explorer/dataModelExplorerSearch');
const { runCypherQuery } = require('../../cli/lib.d/data-model-explorer/lib/runCypherQuery');
const { EDC_URI_INPUT_PREFIX_LIST } = require('../../cli/lib.d/data-model-explorer/lib/toolPayloadContract');

const anonymous = { kind: 'anonymous', userRefId: '', role: '' };
const ZERO_HASH = '0'.repeat(64);
const BASE = 'https://w3id.org/EDUcore/';
const ABSENT_URI_LIST = Object.freeze([
	`${BASE}CEDStandards/hub/14.0.0.0/${ZERO_HASH}`,
	`${BASE}CTDL/hub/Release_20260927/${ZERO_HASH}`,
	`${BASE}JEDx/9.9.9/jedx:MilitaryServiceType/dischargeDate`,
	`${BASE}JEDx/1.0.0/jedx:MilitaryServiceType/dischargeDate@jev`,
	`${BASE}assertion/${ZERO_HASH}/${ZERO_HASH}`,
	`${BASE}layer/jev`,
	`${BASE}manifest/educore-2026-10-30`,
	`${BASE}manifest/educore-2026-10-30/q/JEDx/1.0.0/jedx:MilitaryServiceType/dischargeDate`,
	`${BASE}schemaBlock/sha256/${ZERO_HASH}`,
	`${BASE}agent/org/educore`,
	`${BASE}bestMatch`,
	`${BASE}`,
	`edc:CEDStandards/hub/14.0.0.0/${ZERO_HASH}`,
	'edc:bestMatch',
]);
const REAL_CARD_URI = `${BASE}CEDStandards/hub/14.0.0.0/ab39501d8fb28c316fc72ba39c1658cc369796ffd35ec2a4a446e5eb0e0c013d`;

let failedCount = 0;
let passedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

openHarness({}, (harnessError, harness) => {
	if (harnessError === 'noGraph') {
		console.log('  SKIP: find-mappings-uri-no-scan-live: no graph is reachable');
		process.exit(0);
	}
	if (harnessError) {
		console.log(`  FAIL: harness: ${harnessError}`);
		process.exit(1);
	}
	const withSession = (work, done) => harness.goldenHandle.withReadSession(work, done);
	const steps = [];
	steps.push((next) => {
		ok('the shape this reads is the scheme\'s own', JSON.stringify(EDC_URI_INPUT_PREFIX_LIST) === JSON.stringify([BASE, 'edc:']), JSON.stringify(EDC_URI_INPUT_PREFIX_LIST));
		next();
	});
	steps.push((next) => withSession((session, done) => runCypherQuery(session, `MATCH (n:ForgedNode) WHERE any(onePrefix IN $prefixList WHERE n.name CONTAINS onePrefix OR (n._id STARTS WITH onePrefix AND n._id <> n.stableId) OR (n.path STARTS WITH onePrefix) OR (n.uri STARTS WITH onePrefix AND n.uri <> n.stableId)) RETURN count(n) AS holdCount`, { prefixList: EDC_URI_INPUT_PREFIX_LIST }, done), (queryError, queryResult) => {
		const holdCount = queryError ? -1 : queryResult.records[0].get('holdCount').toNumber();
		ok('on this golden, no name or identifier holds an edc: URI except as a stableId', holdCount === 0, queryError || `${holdCount} nodes`);
		next();
	}));
	ABSENT_URI_LIST.forEach((oneUri) => {
		steps.push((next) => {
			let scanAskedCount = 0;
			withSession((session, done) => dmeSearchModule.findMappingsMatchedNodeList(session, oneUri, () => { scanAskedCount += 1; return false; }, done), (matchError, matchedNodeList) => {
				ok(`no scan: ${oneUri.slice(0, 70)}`, !matchError && scanAskedCount === 0 && matchedNodeList.length === 0, matchError || `${scanAskedCount} scans asked`);
				next();
			});
		});
	});
	steps.push((next) => {
		const startMs = Date.now();
		harness.core.runOperation({ operationName: 'mappings', input: { element: ABSENT_URI_LIST[0] }, principal: anonymous }, (unusedError, answered) => {
			const body = JSON.parse(answered.bodyText);
			ok('mappings given an absent card uri refuses by name', answered.httpStatus === 404 && body.answer.refusalName === 'nothingMatched', `${answered.httpStatus} ${answered.bodyText.slice(0, 160)}`);
			console.log(`  (it took ${Date.now() - startMs} ms)`);
			next();
		});
	});
	steps.push((next) => harness.core.runOperation({ operationName: 'mappings', input: { element: REAL_CARD_URI }, principal: anonymous }, (unusedError, answered) => {
		ok('a real card uri still answers', answered.httpStatus === 200 && JSON.parse(answered.bodyText).answer.totalRowCount === 4, `${answered.httpStatus}`);
		next();
	}));
	steps.push((next) => {
		let scanAskedCount = 0;
		withSession((session, done) => dmeSearchModule.findMappingsMatchedNodeList(session, 'http://www.w3.org/2004/02/skos/core#narrower', () => { scanAskedCount += 1; return false; }, done), () => {
			ok('a uri of anyone else can sit in a name, so it still asks to scan', scanAskedCount === 1, `${scanAskedCount} scans asked`);
			next();
		});
	});
	const run = (stepIndex) => {
		if (stepIndex >= steps.length) {
			harness.close(() => {
				console.log(`find-mappings-uri-no-scan-live: ${passedCount} passed, ${failedCount} failed`);
				process.exit(failedCount === 0 ? 0 : 1);
			});
			return;
		}
		steps[stepIndex](() => run(stepIndex + 1));
	};
	run(0);
});
