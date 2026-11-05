'use strict';
// rosettaRestartChild — the process rosetta-judged-live's G4.9 kills: a job of five fields, two answered, the third call left open, and a line saying so. Its parent then sends SIGKILL and opens the store itself.
const { openHarness } = require('./rosettaLiveHarness');
const { fakeJudgeVendorFor } = require('./fakeJudgeVendor');

const storeFilePath = process.argv[2];
const OWNER_REF_ID = 'restartOwner';
const fieldList = Array.from({ length: 5 }, (unusedItem, fieldIndex) => ({ name: `restartField${fieldIndex}`, definition: `The date of discharge, number ${fieldIndex}.` }));
const vendor = fakeJudgeVendorFor();
const embedder = { batchSize: 20, embed: (textList, done) => harnessHolder.harness.goldenHandle.withReadSession((session, sessionDone) => session.run("MATCH (t:DmeEmbedText { _source: 'CEDS' }) RETURN t.textEmbedding AS vector LIMIT 1").then((queryResult) => sessionDone('', queryResult.records[0].get('vector')), (queryError) => sessionDone(String(queryError))), (vectorError, vector) => (vectorError ? done(vectorError) : done('', textList.map(() => vector)))) };
const harnessHolder = {};
const postOnce = (postInput, callback) => {
	if (vendor.callLog.length === 2) {
		vendor.holdCalls();
	}
	vendor.postOnce(postInput, callback);
	if (vendor.heldCallCount() > 0) {
		process.stdout.write(`HOLDING ${JSON.stringify({ jobRefId: harnessHolder.jobRefId, owner: OWNER_REF_ID, callsBeforeKill: vendor.callLog.length })}\n`);
	}
};
openHarness({ embedder, vendorPostOnce: postOnce, storeFilePath }, (harnessError, harness) => {
	if (harnessError) {
		process.stderr.write(`child: ${harnessError}\n`);
		process.exit(2);
	}
	harnessHolder.harness = harness;
	harness.core.runOperation({ operationName: 'rosettaSubmit', input: { fieldList, hubList: ['CEDS'] }, principal: { kind: 'oauthUser', userRefId: OWNER_REF_ID, role: 'user' } }, (unusedError, answer) => { harnessHolder.jobRefId = JSON.parse(answer.bodyText).answer.jobRefId; });
});
