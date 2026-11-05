'use strict';
// standards-query-size-live.test.js — the standing size gate (P3's G3.10): P2.1 measured the nine largest summaries once, so a later manifest could pass 20 KB unnoticed. This asks them on every suite run, through the core on the real golden, with graph and retrieval's summary besides. Skipped by name when no graph is reachable.
// When graph crosses: the report says what to do; this gate only says it has.

const { openHarness, holdOutSubjectsOf } = require('./lib/rosettaLiveHarness');
const { fakeJudgeVendorFor, pickOf } = require('./lib/fakeJudgeVendor');

const SUMMARY_BYTE_BOUND = 20000;
const anonymous = { kind: 'anonymous', userRefId: '', role: '' };
const QUESTION_LIST = Object.freeze([
	{ operationName: 'mappings', input: { element: 'race' } },
	{ operationName: 'element', input: { name: 'BirthDate' } },
	{ operationName: 'graph', input: {} },
	{ operationName: 'mappings', input: { element: 'First Name' } },
	{ operationName: 'mappings', input: { element: 'RaceEthnicity' } },
	{ operationName: 'mappings', input: { element: 'Birthdate' } },
	{ operationName: 'mappings', input: { element: 'studentRefId' } },
	{ operationName: 'element', input: { name: 'birthdate', nameMatch: 'caseInsensitive', standard: 'CEDS' } },
	{ operationName: 'element', input: { name: 'Birthdate', standard: 'CEDS' } },
]);

let failedCount = 0;
let passedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const boundBytes = Number(process.env.SIZE_GATE_BYTE_BOUND || SUMMARY_BYTE_BOUND); // the observed-failing run sets this; nothing else does

openHarness({}, (harnessError, harness) => {
	if (harnessError === 'noGraph') {
		console.log('  SKIP: standards-query-size-live: no graph is reachable');
		process.exit(0);
	}
	if (harnessError) {
		console.log(`  FAIL: harness: ${harnessError}`);
		process.exit(1);
	}
	const measureNext = (questionIndex, done) => {
		if (questionIndex >= QUESTION_LIST.length) {
			done();
			return;
		}
		const { operationName, input } = QUESTION_LIST[questionIndex];
		harness.core.runOperation({ operationName, input, principal: anonymous }, (unusedError, answer) => {
			const byteCount = Buffer.byteLength(answer.bodyText);
			ok(`${operationName} ${JSON.stringify(input)}: ${byteCount} bytes, within ${boundBytes}`, answer.httpStatus === 200 && byteCount <= boundBytes, `status ${answer.httpStatus}`);
			measureNext(questionIndex + 1, done);
		});
	};
	measureNext(0, () => {
		holdOutSubjectsOf({ goldenHandle: harness.goldenHandle, standardName: 'LIF', hubName: 'CEDS', subjectCount: 20, sampleSeed: '110426' }, (fixtureError, fixture) => {
			ok('the retrieval fixture reads', !fixtureError, fixtureError);
			const fieldList = fixture.subjectList.map(({ name, definition }) => ({ name, ...(definition ? { definition } : {}) }));
			harness.core.runOperation({ operationName: 'rosettaRetrieval', input: { fieldList }, principal: anonymous }, (unusedError, answer) => {
				const byteCount = Buffer.byteLength(answer.bodyText);
				ok(`rosetta/retrieval, 20 fields, every hub: ${byteCount} bytes, within ${boundBytes}`, answer.httpStatus === 200 && byteCount <= boundBytes, `status ${answer.httpStatus}`);
				console.log(`\nstandards-query-size-live: ${passedCount} passed, ${failedCount} failed`);
				process.exit(failedCount === 0 ? 0 : 1);
			});
		});
	});
});
