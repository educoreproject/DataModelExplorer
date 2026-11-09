'use strict';
// rosetta-memory-live.test.js — the standing memory gate. 200 fields on two hubs once took a process from 180 MB to 2.2 GB, and demo's box under 1 GB available: neo4j-driver's Session keeps every Result until it closes, and one session read every admitted card's vector. Peak RSS growth, sampled while it runs, over repeated retrievals, against a stated bound. Also: no statement sends a card vector to this process. Skipped by name when no graph is reachable.

const { openHarness, holdOutSubjectsOf } = require('./lib/rosettaLiveHarness');
const { runCypherQuery } = require('../../cli/lib.d/data-model-explorer/lib/runCypherQuery');

const PEAK_GROWTH_BOUND_MEGABYTES = 450; // measured about 340 here, before the bound was set; the unfixed code measured 2,030
const RUN_COUNT = 2;
const SAMPLE_MILLISECONDS = 100;
const VECTOR_LENGTH = 1024;
const anonymous = { kind: 'anonymous' };
const megabytes = (byteCount) => Math.round(byteCount / 1048576);

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

let vectorRowCount = 0;
const watchingRunCypher = (session, cypherText, cypherParameters, callback) => runCypherQuery(session, cypherText, cypherParameters, (queryError, queryResult) => {
	if (!queryError) {
		vectorRowCount += queryResult.records.filter((oneRecord) => oneRecord.keys.some((fieldName) => { const oneValue = oneRecord.get(fieldName); return Array.isArray(oneValue) && oneValue.length === VECTOR_LENGTH && typeof oneValue[0] === 'number'; })).length;
	}
	callback(queryError, queryResult);
});

openHarness({ runCypher: watchingRunCypher }, (harnessError, harness) => {
	if (harnessError === 'noGraph') {
		console.log('  SKIP: rosetta-memory-live: no graph is reachable');
		process.exit(0);
	}
	if (harnessError) {
		console.log(`  FAIL: harness: ${harnessError}`);
		process.exit(1);
	}
	holdOutSubjectsOf({ goldenHandle: harness.goldenHandle, standardName: 'LIF', hubName: 'CEDS', subjectCount: 200, sampleSeed: '110426' }, (fixtureError, fixture) => {
		ok('the fixture reads', !fixtureError, fixtureError);
		const fieldList = fixture.subjectList.map(({ name, definition }) => ({ name, ...(definition ? { definition } : {}) }));
		const startRss = process.memoryUsage().rss;
		let peakRss = startRss;
		const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, SAMPLE_MILLISECONDS);
		const runNext = (runIndex) => {
			if (runIndex >= RUN_COUNT) {
				clearInterval(sampler);
				const growth = megabytes(peakRss - startRss);
				console.log(`  RSS ${megabytes(startRss)} MB at the start, peak ${megabytes(peakRss)} MB over ${RUN_COUNT} retrievals of 200 fields on two hubs`);
				ok(`peak RSS growth ${growth} MB is within ${PEAK_GROWTH_BOUND_MEGABYTES} MB`, growth <= PEAK_GROWTH_BOUND_MEGABYTES);
				ok('no statement brought a card vector into this process', vectorRowCount === 0, `${vectorRowCount} rows`);
				console.log(`\nrosetta-memory-live: ${passedCount} passed, ${failedCount} failed`);
				process.exit(failedCount === 0 ? 0 : 1);
			}
			harness.core.runOperation({ operationName: 'rosettaRetrieval', input: { fieldList }, principal: anonymous }, (unusedError, answer) => {
				ok(`retrieval ${runIndex + 1} answers 200`, answer.httpStatus === 200, answer.bodyText.slice(0, 200));
				runNext(runIndex + 1);
			});
		};
		runNext(0);
	});
});
