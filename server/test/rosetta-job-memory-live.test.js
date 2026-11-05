'use strict';
// rosetta-job-memory-live.test.js — a judged job holds no pool or prompt past the field in hand (P4 G4.12's standing half; demo's numbers are the report's). 50 fields on two hubs with a fake vendor: peak RSS growth is bounded, no statement brings a card vector into the process, and the API's loop keeps turning, measured by a timer's lateness. Skips by name with no graph.
const { openHarness } = require('./lib/rosettaLiveHarness');
const { fakeJudgeVendorFor, pickOf } = require('./lib/fakeJudgeVendor');
const { runCypherQuery } = require('../../cli/lib.d/data-model-explorer/lib/runCypherQuery');

const RSS_GROWTH_BOUND_MB = Number(process.env.JOB_MEMORY_BOUND_MB || 300);
const LOOP_LATE_BOUND_MS = 1500;
const VECTOR_LENGTH = 1024;
let vectorRowCount = 0;
const hasVector = (candidate) => Array.isArray(candidate) && candidate.length === VECTOR_LENGTH && typeof candidate[0] === 'number';
const watchingRunCypher = (session, cypherText, cypherParams, done) => runCypherQuery(session, cypherText, cypherParams, (queryError, queryResult) => {
	if (!queryError) {
		queryResult.records.forEach((oneRecord) => oneRecord.keys.forEach((fieldName) => { const fieldValue = oneRecord.get(fieldName); if (hasVector(fieldValue) || (fieldValue && typeof fieldValue === 'object' && Object.values(fieldValue).some(hasVector))) { vectorRowCount += 1; } }));
	}
	done(queryError, queryResult);
});
// a real hub vector for every text, so every pool is full: a made-up vector finds nothing, and an empty pool would make this gate pass by holding nothing
const embedderHolder = {};
const anyTextEmbedder = { batchSize: 20, embed: (textList, done) => embedderHolder.withVector((vectorError, oneVector) => (vectorError ? done(vectorError) : done('', textList.map(() => oneVector)))) };
const vendor = fakeJudgeVendorFor({ answerFor: () => pickOf('1', 'moderate', 'It means nearly the same thing.') });
const fieldList = Array.from({ length: 50 }, (unusedItem, fieldIndex) => ({ name: `memoryField${fieldIndex}`, definition: `A date on which a person ended a period of service, number ${fieldIndex}.` }));

openHarness({ vendorPostOnce: vendor.postOnce, embedder: anyTextEmbedder, runCypher: watchingRunCypher, fuseOverrideValues: { judgeUsdPerFieldEstimate: 0.01 } }, (harnessError, harness) => {
	if (harnessError === 'noGraph') { console.log('  SKIP: rosetta-job-memory-live: no graph is reachable'); process.exit(0); }
	if (harnessError) { console.log(`  FAIL: harness: ${harnessError}`); process.exit(1); }
	embedderHolder.withVector = (vectorDone) => harness.goldenHandle.withReadSession((session, sessionDone) => session.run("MATCH (t:DmeEmbedText { _source: 'CEDS' }) RETURN t.textEmbedding AS vector LIMIT 1").then((queryResult) => sessionDone('', queryResult.records[0].get('vector')), (queryError) => sessionDone(String(queryError))), vectorDone);
	const principal = { kind: 'oauthUser', userRefId: 'memoryGate', role: 'user' };
	const startRss = process.memoryUsage().rss;
	let peakRss = startRss;
	let worstLateMs = 0;
	let lastTickMs = Date.now();
	const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); worstLateMs = Math.max(worstLateMs, Date.now() - lastTickMs - 100); lastTickMs = Date.now(); }, 100);
	harness.core.runOperation({ operationName: 'rosettaSubmit', input: { fieldList }, principal }, (unusedError, submitAnswer) => {
		const { jobRefId } = JSON.parse(submitAnswer.bodyText).answer;
		const poll = () => harness.core.runOperation({ operationName: 'rosettaStatus', input: { jobRefId }, principal }, (statusError, statusAnswer) => {
			const statusBody = JSON.parse(statusAnswer.bodyText).answer;
			if (['queued', 'running'].includes(statusBody.status)) { setTimeout(poll, 500); return; }
			clearInterval(sampler);
			const growthMb = (peakRss - startRss) / 1048576;
			const checkList = [
				[`the job finishes all 100 units (${statusBody.status}, ${statusBody.unitsFinished})`, statusBody.status === 'done' && statusBody.unitsFinished === 100],
				[`the vendor was asked every unit, so every pool was real (${vendor.callLog.length} calls)`, vendor.callLog.length === 100],
				[`peak RSS growth ${growthMb.toFixed(0)} MB within ${RSS_GROWTH_BOUND_MB} MB`, growthMb <= RSS_GROWTH_BOUND_MB],
				[`no statement brought a vector into the process (${vectorRowCount} rows)`, vectorRowCount === 0],
				[`the event loop kept turning: worst lateness ${worstLateMs} ms, within ${LOOP_LATE_BOUND_MS}`, worstLateMs <= LOOP_LATE_BOUND_MS],
			];
			checkList.forEach(([checkName, isPassed]) => console.log(`  ${isPassed ? 'PASS' : 'FAIL'}: ${checkName}`));
			const failedCount = checkList.filter(([, isPassed]) => !isPassed).length;
			console.log(`\nrosetta-job-memory-live: ${checkList.length - failedCount} passed, ${failedCount} failed`);
			process.exit(failedCount === 0 ? 0 : 1);
		});
		poll();
	});
});
