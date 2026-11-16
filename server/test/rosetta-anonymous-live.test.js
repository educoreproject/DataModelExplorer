'use strict';
// rosetta-anonymous-live.test.js — WORKORDER-rosettaMeanings-111026 R2, R3 and R4's Rosetta half, on the real golden with a fake vendor at the forge client's network seam
// (the real client, judgeOne, renderer, store and graph run; nothing reaches Anthropic). Skipped by name when no graph is reachable.
//   anonLimits      a visitor's job takes at most anonymousMaxFieldListLength fields; a visitor may submit anonymousJobsPerVisitorWindow jobs in the window, and another visitor is not counted with them
//   anonLanes       21 visitors at once: the anonymous queue cap refuses by name, anonymous jobs run at most anonymousMaxRunningJobs at once, a signed-in job runs beside them in its own
//                   lane, and the rest of the service answers, holding none of the core's slots
//   anonCeilingSubmit  anonymous judging's 24 hours, at submit: refused with no vendor call; a signed-in person is not
//   anonCeilingCall    and before every call, at the call's worst case: a job the estimate admitted stops fuseTripped with no vendor call
//   anonLink        an anonymous job is read by its jobRefId by anyone; a signed-in job only by its owner (status, fetch and prompts alike)
//   anonRetention   an anonymous job is deleted after anonymousJobRetentionDays, its prompts with it; a signed-in job keeps its own days
//   prompts         the stored prompt is the exact text the vendor was sent, paged by promptPageSize; a re-ask stores the re-ask; a cache hit stores the question it answered
//   meaningVariant  judgePromptVariant rosettaMeaning reaches the vendor framed as meanings (needs EDUCORE_FORGE_CODE_PATH at a forge carrying the variant; skipped by name otherwise)
//   xff             behind one proxy hop, a client-sent X-Forwarded-For cannot change the visitor's address; the endpoint hands admitRequest req.ip and reads no header
//   doors           the MCP tool list is 83591df's; an anonymous MCP caller is still refused; the old judgedStep test still refuses the anonymous
//   node server/test/rosetta-anonymous-live.test.js [gateName ...]

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const express = require('express');
const { openHarness } = require('./lib/rosettaLiveHarness');
const { fakeJudgeVendorFor, pickOf } = require('./lib/fakeJudgeVendor');
const { admitRequest } = require('../lib/standards-query/admitRequest');
const registry = require('../lib/standards-query/standardsQueryOperations.json');

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const BRANCH_BASE_COMMIT = '83591df';
const codeRootPath = path.join(__dirname, '..', '..');
const OPEN_STATUS_LIST = ['queued', 'running', 'cancelling'];
const MILLISECONDS_PER_DAY = 86400000;
const USER_A = Object.freeze({ kind: 'oauthUser', userRefId: 'anonGateUserAlpha', role: 'user' });
const USER_B = Object.freeze({ kind: 'oauthUser', userRefId: 'anonGateUserBravo', role: 'user' });
const rowOf = (operationName) => registry.operationList.find((oneRow) => oneRow.operationName === operationName);
// a visitor as the API door names one: no credential, an address
// a visitor the door refuses is handed on as a principal no row admits, so the gate that uses it fails by name rather than crashing
const visitorFor = (clientAddress, done) => admitRequest({ door: 'api', credential: undefined, clientAddress, operationName: 'rosettaSubmit', registryRow: rowOf('rosettaSubmit') }, (admitError, admission) => done(admission.principal || { kind: 'refusedAtTheDoor', userRefId: '', role: '', refusal: admission.refusal }));
const askFor = (harness) => (operationName, input, principal, done) => harness.core.runOperation({ operationName, input, principal }, (unusedError, answer) => done({ ...answer, body: JSON.parse(answer.bodyText), answer: JSON.parse(answer.bodyText).answer }));
const fieldListOf = (fieldCount, prefix = 'anonField') => Array.from({ length: fieldCount }, (unusedItem, fieldIndex) => ({ name: `${prefix}${fieldIndex}`, definition: `The date of discharge, number ${fieldIndex}.` }));
const untilClosed = (ask, jobRefId, principal, done) => {
	const poll = () => ask('rosettaStatus', { jobRefId }, principal, ({ answer }) => (OPEN_STATUS_LIST.includes(answer.status) ? setTimeout(poll, 50) : done(answer)));
	poll();
};
const eachInTurn = (itemList, workOnOne, done) => {
	const runNext = (itemIndex) => (itemIndex >= itemList.length ? done() : workOnOne(itemList[itemIndex], itemIndex, () => runNext(itemIndex + 1)));
	runNext(0);
};

// any text gets one vector, so every field has a pool. What is under test here is never retrieval.
const anyTextEmbedderFor = () => {
	const holder = {};
	return {
		batchSize: 20,
		setGoldenHandle: (goldenHandle) => { holder.goldenHandle = goldenHandle; },
		embed: (textList, done) => holder.goldenHandle.withReadSession((session, sessionDone) => session.run("MATCH (t:DmeEmbedText { _source: 'CEDS' }) RETURN t.textEmbedding AS vector LIMIT 1").then((queryResult) => sessionDone('', queryResult.records[0].get('vector')), (queryError) => sessionDone(String(queryError))), (vectorError, vector) => (vectorError ? done(vectorError) : done('', textList.map(() => vector)))),
	};
};
const withHarness = (harnessOptions, useHarness, afterAll) => {
	const embedder = anyTextEmbedderFor();
	openHarness({ embedder, ...harnessOptions }, (harnessError, harness) => {
		if (harnessError === 'noGraph') {
			console.log('SKIP: rosetta-anonymous-live: no graph is reachable, so nothing here ran');
			process.exit(0);
		}
		if (harnessError) {
			ok(`harness: ${harnessError}`, false);
			afterAll();
			return;
		}
		embedder.setGoldenHandle(harness.goldenHandle);
		useHarness(harness, () => {
			harness.runner.stopTicking();
			harness.close(afterAll);
		});
	});
};
// spend already on the bill for a kind of owner: a closed job of that kind with one answered call at usdSpent
const seedSpend = ({ harness, ownerPrincipalKind, ownerPrincipalRefId, usdSpent }, done) => {
	const { jobStore } = harness.rosettaJudged;
	const jobRefId = crypto.randomBytes(16).toString('hex');
	jobStore.addJob({ jobRefId, ownerPrincipalKind, ownerPrincipalRefId, formatName: 'fieldList', byteSize: 1, fieldList: [{ name: 'seeded' }], hubNameList: ['CEDS'], submissionNote: {}, expiresAtMs: Date.now() + MILLISECONDS_PER_DAY, estimateUsd: usdSpent, answeredFrom: { manifestRefId: 'seeded' }, judgeFacts: {}, embeddingTokensEstimate: 0 }, (addError) => jobStore.setJobStatus({ jobRefId, status: 'done', finishedAtMs: Date.now() }, () => jobStore.addJudgeCall({ jobRefId, ownerPrincipalRefId, fieldIndex: 0, hubName: 'CEDS', estimateUsd: usdSpent, wireModel: 'claude-opus-5' }, (callError, callRefId) => jobStore.finishJudgeCall({ callRefId, callStatus: 'answered', usd: usdSpent, inputTokens: 1, outputTokens: 1 }, (finishError) => done(addError || callError || finishError)))));
};

const GATE_LIST = [];
const gate = (gateName, runGate) => GATE_LIST.push({ gateName, runGate });

gate('anonLimits', (done) => {
	const vendor = fakeJudgeVendorFor();
	withHarness({ vendorPostOnce: vendor.postOnce }, (harness, close) => {
		const ask = askFor(harness);
		const { judgedValues } = harness.rosettaJudged;
		visitorFor('203.0.113.10', (visitor) => visitorFor('203.0.113.11', (otherVisitor) => {
			ok('a visitor named by address carries its address in memory, and no userRefId', visitor.kind === 'anonymous' && visitor.userRefId === '' && visitor.visitorAddress === '203.0.113.10');
			ask('rosettaSubmit', { fieldList: fieldListOf(judgedValues.anonymousMaxFieldListLength + 1), hubList: ['CEDS'] }, visitor, (overAnswer) => {
				ok(`a visitor's job of ${judgedValues.anonymousMaxFieldListLength + 1} fields is refused maxFieldListLength, naming ${judgedValues.anonymousMaxFieldListLength}`, overAnswer.httpStatus === 413 && overAnswer.answer.refusalName === 'maxFieldListLength' && new RegExp(String(judgedValues.anonymousMaxFieldListLength)).test(overAnswer.answer.reason), JSON.stringify(overAnswer.answer).slice(0, 200));
				ask('rosettaSubmit', { fieldList: fieldListOf(judgedValues.anonymousMaxFieldListLength + 1), hubList: ['CEDS'] }, USER_A, (signedInAnswer) => {
					ok('a signed-in job of that size is admitted: signed-in limits stay as they are', signedInAnswer.httpStatus === 200, signedInAnswer.answer.refusalName);
					untilClosed(ask, signedInAnswer.answer.jobRefId, USER_A, () => {
						const answerList = [];
						eachInTurn(Array.from({ length: judgedValues.anonymousJobsPerVisitorWindow + 1 }), (unusedItem, jobIndex, nextJob) => ask('rosettaSubmit', { fieldList: fieldListOf(1, `window${jobIndex}`), hubList: ['CEDS'] }, visitor, (oneAnswer) => {
							answerList.push(oneAnswer);
							if (oneAnswer.httpStatus !== 200) {
								nextJob();
								return;
							}
							untilClosed(ask, oneAnswer.answer.jobRefId, visitor, () => nextJob());
						}), () => {
							const lastAnswer = answerList[answerList.length - 1];
							ok(`a visitor's first ${judgedValues.anonymousJobsPerVisitorWindow} jobs in the window are admitted`, answerList.slice(0, -1).every((oneAnswer) => oneAnswer.httpStatus === 200), answerList.map((oneAnswer) => oneAnswer.httpStatus).join(','));
							ok('the next is refused anonymousVisitorJobLimitReached (429), naming the number and the window', lastAnswer.httpStatus === 429 && lastAnswer.answer.refusalName === 'anonymousVisitorJobLimitReached' && lastAnswer.answer.reason.includes(String(judgedValues.anonymousJobsPerVisitorWindow)) && lastAnswer.answer.reason.includes(String(judgedValues.anonymousVisitorWindowMinutes)), JSON.stringify(lastAnswer.answer));
							ask('rosettaSubmit', { fieldList: fieldListOf(1), hubList: ['CEDS'] }, otherVisitor, (otherAnswer) => {
								ok('another address is not counted with it', otherAnswer.httpStatus === 200, otherAnswer.answer.refusalName);
								harness.rosettaJudged.jobStore.readJob(otherAnswer.answer.jobRefId, (readError, job) => {
									const visitorSecret = fs.readFileSync(path.join(harness.scratchDirPath, 'visitorSecret.txt'), 'utf8');
									ok('the job\'s owner is the visitor\'s HMAC under the configured secret, its kind anonymous (review S2)', job.ownerPrincipalKind === 'anonymous' && job.ownerPrincipalRefId === crypto.createHmac('sha256', visitorSecret).update('203.0.113.11').digest('hex'));
									ok('and never the address, nor its plain sha256, which hashing every address would reverse', job.ownerPrincipalRefId !== '203.0.113.11' && job.ownerPrincipalRefId !== crypto.createHash('sha256').update('203.0.113.11').digest('hex'));
									untilClosed(ask, otherAnswer.answer.jobRefId, otherVisitor, () => close());
								});
							});
						});
					});
				});
			});
		}));
	}, done);
});

gate('anonLanes', (done) => {
	const vendor = fakeJudgeVendorFor();
	vendor.holdCalls();
	const VISITOR_COUNT = 21;
	// the core is held to 2 slots, and the anonymous queue opened to all 21: if a submission took a core slot, the third would be refused busy
	withHarness({ vendorPostOnce: vendor.postOnce, limitOverrideValues: { inFlightMax: 2 }, fuseOverrideValues: { anonymousMaxQueuedJobs: VISITOR_COUNT, anonymousJobServiceMaxInFlight: VISITOR_COUNT + 4, anonymousJobsOpenPerVisitor: 2, jobRunnerPollSeconds: 1 } }, (harness, close) => {
		const ask = askFor(harness);
		const { judgedValues } = harness.rosettaJudged;
		const visitorList = [];
		eachInTurn(Array.from({ length: VISITOR_COUNT }), (unusedItem, visitorIndex, nextVisitor) => visitorFor(`198.51.100.${visitorIndex + 1}`, (visitor) => { visitorList.push(visitor); nextVisitor(); }), () => {
			// all at once, as 21 browsers would
			let answeredCount = 0;
			const answerList = [];
			let aboutWhileSubmitting = null;
			visitorList.forEach((visitor, visitorIndex) => ask('rosettaSubmit', { fieldList: fieldListOf(2, `lane${visitorIndex}`), hubList: ['CEDS'] }, visitor, (oneAnswer) => {
				answerList[visitorIndex] = oneAnswer;
				answeredCount += 1;
				if (answeredCount === VISITOR_COUNT && aboutWhileSubmitting) {
					afterSubmits();
				}
			}));
			const coreSlotsWhileSubmitting = harness.core.serviceState().inFlightCount;
			ask('about', {}, visitorList[0], (aboutAnswer) => {
				aboutWhileSubmitting = aboutAnswer;
				if (answeredCount === VISITOR_COUNT) {
					afterSubmits();
				}
			});
			const afterSubmits = () => {
				ok(`${VISITOR_COUNT} visitors at once, the core held to 2 slots: every one admitted`, answerList.every((oneAnswer) => oneAnswer.httpStatus === 200), answerList.map((oneAnswer) => oneAnswer.answer.refusalName || oneAnswer.httpStatus).join(','));
				ok('while they were being admitted they held none of the core\'s slots, and about, asked among them, answered 200', coreSlotsWhileSubmitting === 0 && aboutWhileSubmitting.httpStatus === 200, `${coreSlotsWhileSubmitting} slots, about ${aboutWhileSubmitting.httpStatus}`);
				const waitForHeld = (waitCount) => {
					if (vendor.heldCallCount() < judgedValues.anonymousMaxRunningJobs && waitCount < 200) {
						setTimeout(() => waitForHeld(waitCount + 1), 25);
						return;
					}
					harness.rosettaJudged.jobStore.readJobList({ statusList: ['running'] }, (runningError, runningList) => {
						ok(`anonymous jobs run at most ${judgedValues.anonymousMaxRunningJobs} at once: ${judgedValues.anonymousMaxRunningJobs} calls held at the vendor, ${judgedValues.anonymousMaxRunningJobs} jobs running`, vendor.heldCallCount() === judgedValues.anonymousMaxRunningJobs && runningList.length === judgedValues.anonymousMaxRunningJobs, `${vendor.heldCallCount()} held, ${runningList.length} running`);
						ask('rosettaSubmit', { fieldList: fieldListOf(1, 'signedInLane'), hubList: ['CEDS'] }, USER_A, (signedInAnswer) => {
							ok('a signed-in job is admitted beside them: the anonymous queue is not the signed-in one', signedInAnswer.httpStatus === 200, signedInAnswer.answer.refusalName);
							const waitForSignedIn = (signedInWaitCount) => {
								if (vendor.heldCallCount() < judgedValues.anonymousMaxRunningJobs + 1 && signedInWaitCount < 200) {
									setTimeout(() => waitForSignedIn(signedInWaitCount + 1), 25);
									return;
								}
								ok('and it runs in its own lane at once, not after the visitors', vendor.heldCallCount() === judgedValues.anonymousMaxRunningJobs + 1, `${vendor.heldCallCount()} held`);
								// the 21 submissions were sent at once and reach the queue in whatever order they finish admission, so the waiting job is read from the queue, not taken by visitor index
								harness.rosettaJudged.jobStore.readJobList({ statusList: ['queued'] }, (queueError, queuedJobList) => {
								const lastWaitingJob = queuedJobList.filter((oneJob) => oneJob.ownerPrincipalKind === 'anonymous').slice(-1)[0] || { jobRefId: 'x' };
								const waitingVisitorIndex = answerList.findIndex((oneAnswer) => oneAnswer.answer.jobRefId === lastWaitingJob.jobRefId);
								const expectedPosition = VISITOR_COUNT - judgedValues.anonymousMaxRunningJobs;
								ask('about', {}, visitorList[0], (aboutAnswer) => ask('rosettaStatus', { jobRefId: lastWaitingJob.jobRefId }, visitorList[waitingVisitorIndex] || visitorList[0], (statusAnswer) => {
									ok(`the rest of the service answers meanwhile: about 200, the last waiting job's status 200, queued at place ${expectedPosition}`, !queueError && aboutAnswer.httpStatus === 200 && statusAnswer.httpStatus === 200 && statusAnswer.answer.status === 'queued' && statusAnswer.answer.position === expectedPosition, `${queueError || ''} ${aboutAnswer.httpStatus} ${statusAnswer.httpStatus} ${JSON.stringify(statusAnswer.answer).slice(0, 300)}`);
									ok('and the jobs hold none of the core\'s query slots', harness.core.serviceState().inFlightCount === 0, `${harness.core.serviceState().inFlightCount}`);
									vendor.releaseCalls();
									// every job runs out before the store closes
									eachInTurn(answerList, (oneAnswer, visitorIndex, nextJob) => untilClosed(ask, oneAnswer.answer.jobRefId, visitorList[visitorIndex], () => nextJob()), () => untilClosed(ask, signedInAnswer.answer.jobRefId, USER_A, () => close()));
								}));
								});
							};
							waitForSignedIn(0);
						});
					});
				};
				waitForHeld(0);
			};
		});
	}, () => {
		const cappedVendor = fakeJudgeVendorFor();
		cappedVendor.holdCalls();
		withHarness({ vendorPostOnce: cappedVendor.postOnce }, (harness, close) => {
			const ask = askFor(harness);
			const { judgedValues } = harness.rosettaJudged;
			const answerList = [];
			eachInTurn(Array.from({ length: VISITOR_COUNT }), (unusedItem, visitorIndex, nextVisitor) => visitorFor(`192.0.2.${visitorIndex + 1}`, (visitor) => ask('rosettaSubmit', { fieldList: fieldListOf(1, `capped${visitorIndex}`), hubList: ['CEDS'] }, visitor, (oneAnswer) => {
				answerList.push(oneAnswer);
				// the first ones must be running before the rest are counted as waiting
				const waitForRunning = (waitCount) => (cappedVendor.heldCallCount() >= Math.min(visitorIndex + 1, judgedValues.anonymousMaxRunningJobs) || waitCount > 200 ? nextVisitor() : setTimeout(() => waitForRunning(waitCount + 1), 25));
				waitForRunning(0);
			})), () => {
				const admittedCount = answerList.filter((oneAnswer) => oneAnswer.httpStatus === 200).length;
				const refusedList = answerList.filter((oneAnswer) => oneAnswer.httpStatus !== 200);
				ok(`at the configured caps, ${judgedValues.anonymousMaxRunningJobs} run and ${judgedValues.anonymousMaxQueuedJobs} wait: ${judgedValues.anonymousMaxRunningJobs + judgedValues.anonymousMaxQueuedJobs} of ${VISITOR_COUNT} admitted`, admittedCount === judgedValues.anonymousMaxRunningJobs + judgedValues.anonymousMaxQueuedJobs, `${admittedCount}`);
				ok('the rest are refused anonymousQueueFull (429) with the last place, by name', refusedList.length > 0 && refusedList.every((oneAnswer) => oneAnswer.httpStatus === 429 && oneAnswer.answer.refusalName === 'anonymousQueueFull' && oneAnswer.answer.lastQueuedPosition === judgedValues.anonymousMaxQueuedJobs), JSON.stringify(refusedList[0] && refusedList[0].answer));
				cappedVendor.releaseCalls();
				const admittedList = answerList.filter((oneAnswer) => oneAnswer.httpStatus === 200);
				eachInTurn(admittedList, (oneAnswer, unusedIndex, nextJob) => untilClosed(ask, oneAnswer.answer.jobRefId, USER_A, () => nextJob()), () => close());
			});
		}, () => {
			// the job rows' own cap: 21 at once past jobServiceMaxInFlight, the excess refused by name to retry, and the service still answering
			const burstVendor = fakeJudgeVendorFor();
			burstVendor.holdCalls();
			withHarness({ vendorPostOnce: burstVendor.postOnce, fuseOverrideValues: { anonymousMaxQueuedJobs: VISITOR_COUNT } }, (harness, close) => {
				const ask = askFor(harness);
				const { judgedValues } = harness.rosettaJudged;
				const visitorList = [];
				eachInTurn(Array.from({ length: VISITOR_COUNT }), (unusedItem, visitorIndex, nextVisitor) => visitorFor(`198.18.0.${visitorIndex + 1}`, (visitor) => { visitorList.push(visitor); nextVisitor(); }), () => {
					const answerList = [];
					let aboutAnswer = null;
					let signedInAnswer = null;
					const isBurstAnswered = () => answerList.length === VISITOR_COUNT && aboutAnswer && signedInAnswer;
					const afterBurst = () => {
						const busyList = answerList.filter((oneAnswer) => oneAnswer.answer.refusalName === 'jobServiceBusy');
						ok(`past anonymousJobServiceMaxInFlight (${judgedValues.anonymousJobServiceMaxInFlight}), the excess of ${VISITOR_COUNT} visitors at once is refused jobServiceBusy (503) with a Retry-After; the rest are admitted`, busyList.length === VISITOR_COUNT - judgedValues.anonymousJobServiceMaxInFlight && busyList.every((oneAnswer) => oneAnswer.httpStatus === 503 && oneAnswer.retryAfterSeconds === judgedValues.jobServiceBusyRetrySeconds) && answerList.filter((oneAnswer) => oneAnswer.httpStatus === 200).length === judgedValues.anonymousJobServiceMaxInFlight, answerList.map((oneAnswer) => oneAnswer.answer.refusalName || oneAnswer.httpStatus).join(','));
						ok('a signed-in submission sent among them is admitted: the visitors\' cap is not the signed-in one (review S5)', signedInAnswer.httpStatus === 200, signedInAnswer.answer.refusalName);
						ok('and about, asked among them, answered 200', aboutAnswer.httpStatus === 200);
						burstVendor.releaseCalls();
						const admittedList = answerList.filter((oneAnswer) => oneAnswer.httpStatus === 200);
						eachInTurn(admittedList, (oneAnswer, unusedIndex, nextJob) => untilClosed(ask, oneAnswer.answer.jobRefId, USER_A, () => nextJob()), () => untilClosed(ask, signedInAnswer.answer.jobRefId, USER_B, () => close()));
					};
					visitorList.forEach((visitor, visitorIndex) => ask('rosettaSubmit', { fieldList: fieldListOf(1, `burst${visitorIndex}`), hubList: ['CEDS'] }, visitor, (oneAnswer) => {
						answerList.push(oneAnswer);
						if (isBurstAnswered()) {
							afterBurst();
						}
					}));
					ask('rosettaSubmit', { fieldList: fieldListOf(1, 'burstSignedIn'), hubList: ['CEDS'] }, USER_B, (oneAnswer) => {
						signedInAnswer = oneAnswer;
						if (isBurstAnswered()) {
							afterBurst();
						}
					});
					ask('about', {}, visitorList[0], (oneAboutAnswer) => {
						aboutAnswer = oneAboutAnswer;
						if (isBurstAnswered()) {
							afterBurst();
						}
					});
				});
			}, done);
		});
	});
});

gate('anonCeilingSubmit', (done) => {
	const vendor = fakeJudgeVendorFor();
	withHarness({ vendorPostOnce: vendor.postOnce, fuseOverrideValues: { judgeUsdPerFieldEstimate: 0.07, anonymousDailyCeilingUsd: 10 } }, (harness, close) => {
		const ask = askFor(harness);
		visitorFor('203.0.113.20', (visitor) => seedSpend({ harness, ownerPrincipalKind: 'anonymous', ownerPrincipalRefId: 'seededVisitor', usdSpent: 9.99 }, (seedError) => {
			ok('seeded: $9.99 of anonymous judging today', !seedError, seedError);
			ask('rosettaSubmit', { fieldList: fieldListOf(1), hubList: ['CEDS'] }, visitor, (refusedAnswer) => {
				ok('a visitor whose job would pass the $10 anonymous ceiling is refused anonymousDailyCeilingReached (429)', refusedAnswer.httpStatus === 429 && refusedAnswer.answer.refusalName === 'anonymousDailyCeilingReached', JSON.stringify(refusedAnswer.answer));
				ok('and no vendor call was made', vendor.callLog.length === 0, `${vendor.callLog.length}`);
				ok('that refusal names no dollar', !/\$|usd/i.test(refusedAnswer.answer.reason));
				ask('rosettaSubmit', { fieldList: fieldListOf(1), hubList: ['CEDS'] }, USER_A, (signedInAnswer) => {
					ok('a signed-in person is not stopped by the anonymous ceiling', signedInAnswer.httpStatus === 200, signedInAnswer.answer.refusalName);
					untilClosed(ask, signedInAnswer.answer.jobRefId, USER_A, (statusAnswer) => {
						ok('and that job runs to the end', statusAnswer.status === 'done', `${statusAnswer.status} ${statusAnswer.stopReasonName}`);
						close();
					});
				});
			});
		}));
	}, done);
});

gate('anonCeilingCall', (done) => {
	const vendor = fakeJudgeVendorFor();
	withHarness({ vendorPostOnce: vendor.postOnce, fuseOverrideValues: { judgeUsdPerFieldEstimate: 0.01, anonymousDailyCeilingUsd: 10 } }, (harness, close) => {
		const ask = askFor(harness);
		visitorFor('203.0.113.21', (visitor) => seedSpend({ harness, ownerPrincipalKind: 'anonymous', ownerPrincipalRefId: 'seededVisitor', usdSpent: 9.95 }, () => {
			ask('rosettaSubmit', { fieldList: fieldListOf(1), hubList: ['CEDS'] }, visitor, (submitAnswer) => {
				ok('the estimate ($0.01) admits the job at $9.95 spent', submitAnswer.httpStatus === 200, submitAnswer.answer.refusalName);
				untilClosed(ask, submitAnswer.answer.jobRefId, visitor, (statusAnswer) => {
					ok('before the call goes, its worst case (prompt characters + overhead, whole output budget) passes $10: the job stops fuseTripped, anonymousDailyCeilingReached', statusAnswer.status === 'fuseTripped' && statusAnswer.stopReasonName === 'anonymousDailyCeilingReached', `${statusAnswer.status} ${statusAnswer.stopReasonName}`);
					ok('and the vendor was never called', vendor.callLog.length === 0, `${vendor.callLog.length}`);
					harness.rosettaJudged.jobStore.jobSpendUsd(submitAnswer.answer.jobRefId, (spendError, spentUsd) => {
						ok('nothing is on its bill', spentUsd === 0, `${spentUsd}`);
						close();
					});
				});
			});
		}));
	}, () => {
		// at $9.00 spent the worst case fits: the call goes, entered at its worst case and corrected to the bill
		const vendor2 = fakeJudgeVendorFor();
		vendor2.holdCalls();
		withHarness({ vendorPostOnce: vendor2.postOnce, fuseOverrideValues: { judgeUsdPerFieldEstimate: 0.01, anonymousDailyCeilingUsd: 10 } }, (harness, close) => {
			const ask = askFor(harness);
			visitorFor('203.0.113.22', (visitor) => seedSpend({ harness, ownerPrincipalKind: 'anonymous', ownerPrincipalRefId: 'seededVisitor', usdSpent: 9.0 }, () => ask('rosettaSubmit', { fieldList: fieldListOf(1), hubList: ['CEDS'] }, visitor, (submitAnswer) => {
				const waitForCall = (waitCount) => (vendor2.heldCallCount() > 0 || waitCount > 200 ? afterCall() : setTimeout(() => waitForCall(waitCount + 1), 25));
				const afterCall = () => harness.rosettaJudged.jobStore.jobSpendUsd(submitAnswer.answer.jobRefId, (inFlightError, inFlightUsd) => {
					ok('a call in flight is on the bill at its worst case, above the estimate', inFlightUsd > 0.01, `${inFlightUsd}`);
					vendor2.releaseCalls();
					untilClosed(ask, submitAnswer.answer.jobRefId, visitor, (statusAnswer) => harness.rosettaJudged.jobStore.jobSpendUsd(submitAnswer.answer.jobRefId, (billError, billedUsd) => {
						ok('answered, the job is done and the row holds the bill, below the worst case', statusAnswer.status === 'done' && billedUsd > 0 && billedUsd < inFlightUsd, `${statusAnswer.status} ${billedUsd} < ${inFlightUsd}`);
						close();
					}));
				});
				waitForCall(0);
			})));
		}, done);
	});
});

gate('anonLink', (done) => {
	const vendor = fakeJudgeVendorFor();
	withHarness({ vendorPostOnce: vendor.postOnce }, (harness, close) => {
		const ask = askFor(harness);
		visitorFor('203.0.113.30', (visitor) => visitorFor('203.0.113.31', (otherVisitor) => ask('rosettaSubmit', { fieldList: fieldListOf(1), hubList: ['CEDS'] }, visitor, ({ answer: anonymousJob }) => untilClosed(ask, anonymousJob.jobRefId, visitor, () => ask('rosettaSubmit', { fieldList: fieldListOf(1), hubList: ['CEDS'] }, USER_A, ({ answer: signedInJob }) => untilClosed(ask, signedInJob.jobRefId, USER_A, () => {
			const readerList = [['another visitor', otherVisitor], ['a signed-in person', USER_B]];
			const anonymousReadList = [];
			eachInTurn(readerList, ([readerName, reader], unusedIndex, nextReader) => ask('rosettaStatus', { jobRefId: anonymousJob.jobRefId }, reader, (statusAnswer) => ask('rosettaFetch', { jobRefId: anonymousJob.jobRefId }, reader, (fetchAnswer) => ask('rosettaPrompts', { jobRefId: anonymousJob.jobRefId }, reader, (promptsAnswer) => {
				anonymousReadList.push({ readerName, statusCode: [statusAnswer.httpStatus, fetchAnswer.httpStatus, promptsAnswer.httpStatus] });
				nextReader();
			}))), () => {
				ok('an anonymous job is read by its jobRefId by anyone: another visitor and a signed-in person get status, fetch and prompts', anonymousReadList.every((oneRead) => oneRead.statusCode.every((oneStatus) => oneStatus === 200)), JSON.stringify(anonymousReadList));
				const strangerList = [['a visitor', otherVisitor], ['another signed-in person', USER_B]];
				const signedInReadList = [];
				eachInTurn(strangerList, ([readerName, reader], unusedIndex, nextReader) => ask('rosettaStatus', { jobRefId: signedInJob.jobRefId }, reader, (statusAnswer) => ask('rosettaFetch', { jobRefId: signedInJob.jobRefId }, reader, (fetchAnswer) => ask('rosettaPrompts', { jobRefId: signedInJob.jobRefId }, reader, (promptsAnswer) => ask('rosettaCancel', { jobRefId: signedInJob.jobRefId }, reader, (cancelAnswer) => {
					signedInReadList.push({ readerName, refusalList: [statusAnswer, fetchAnswer, promptsAnswer, cancelAnswer].map((oneAnswer) => `${oneAnswer.httpStatus}:${oneAnswer.answer.refusalName}`) });
					nextReader();
				})))), () => {
					ok('a signed-in job is not its owner\'s to anyone else: notFound (404) for status, fetch, prompts and cancel', signedInReadList.every((oneRead) => oneRead.refusalList.every((oneRefusal) => oneRefusal === '404:notFound')), JSON.stringify(signedInReadList));
					ask('rosettaPrompts', { jobRefId: signedInJob.jobRefId }, USER_A, (ownerAnswer) => {
						ok('its owner reads its prompts', ownerAnswer.httpStatus === 200 && ownerAnswer.answer.promptList.length === 1, JSON.stringify(ownerAnswer.answer).slice(0, 200));
						close();
					});
				});
			});
		}))))));
	}, done);
});

gate('anonRetention', (done) => {
	let offsetMs = 0;
	const vendor = fakeJudgeVendorFor();
	withHarness({ vendorPostOnce: vendor.postOnce, nowDate: () => new Date(Date.now() + offsetMs) }, (harness, close) => {
		const ask = askFor(harness);
		const { judgedValues, jobStore } = harness.rosettaJudged;
		visitorFor('203.0.113.40', (visitor) => ask('rosettaSubmit', { fieldList: fieldListOf(1), hubList: ['CEDS'] }, visitor, ({ answer: anonymousJob }) => untilClosed(ask, anonymousJob.jobRefId, visitor, () => ask('rosettaSubmit', { fieldList: fieldListOf(1), hubList: ['CEDS'] }, USER_A, ({ answer: signedInJob }) => untilClosed(ask, signedInJob.jobRefId, USER_A, () => jobStore.readJob(anonymousJob.jobRefId, (unusedError, anonymousRow) => jobStore.readJob(signedInJob.jobRefId, (unusedSignedInError, signedInRow) => {
			ok(`an anonymous job expires anonymousJobRetentionDays (${judgedValues.anonymousJobRetentionDays}) after it was submitted`, anonymousRow.expiresAtMs - anonymousRow.submittedAtMs > (judgedValues.anonymousJobRetentionDays * MILLISECONDS_PER_DAY) - 60000 && anonymousRow.expiresAtMs - anonymousRow.submittedAtMs < (judgedValues.anonymousJobRetentionDays * MILLISECONDS_PER_DAY) + 60000, `${(anonymousRow.expiresAtMs - anonymousRow.submittedAtMs) / MILLISECONDS_PER_DAY} days`);
			ok(`a signed-in job keeps jobRetentionDays (${judgedValues.jobRetentionDays})`, Math.round((signedInRow.expiresAtMs - signedInRow.submittedAtMs) / MILLISECONDS_PER_DAY) === judgedValues.jobRetentionDays);
			offsetMs = (judgedValues.anonymousJobRetentionDays + 1) * MILLISECONDS_PER_DAY;
			harness.rosettaJudged.sweepNow((sweepError, deletedList) => jobStore.rowCounts((countError, rowCount) => ask('rosettaFetch', { jobRefId: anonymousJob.jobRefId }, visitor, (expiredAnswer) => ask('rosettaPrompts', { jobRefId: signedInJob.jobRefId }, USER_A, (keptAnswer) => {
				ok(`${judgedValues.anonymousJobRetentionDays + 1} days on, the anonymous job is swept and the signed-in one is not`, JSON.stringify(deletedList) === JSON.stringify([anonymousJob.jobRefId]), `${sweepError} ${JSON.stringify(deletedList)}`);
				ok('its link answers notFound', expiredAnswer.answer.refusalName === 'notFound');
				ok('its judgment cache went with it (keyed by its jobRefId); the signed-in owner\'s cache row remains (review S3)', rowCount.rosettaJudgmentCache === 1, JSON.stringify(rowCount));
				ok('its prompts went with it; the signed-in job\'s remain', rowCount.judgmentPrompts === 1 && keptAnswer.httpStatus === 200 && keptAnswer.answer.promptList.length === 1, JSON.stringify(rowCount));
				close();
			}))));
		})))))));
	}, done);
});

gate('prompts', (done) => {
	// the first call answers with an ordinal-only rationale, which judgeOne re-asks once: the unit's stored prompt is then the re-ask's
	const vendor = fakeJudgeVendorFor({ answerFor: ({ callIndex }) => (callIndex === 0 ? pickOf('1', 'strong', 'Candidate 1.') : pickOf('1', 'strong', 'The first candidate means the same thing as the field.')) });
	withHarness({ vendorPostOnce: vendor.postOnce, fuseOverrideValues: { promptPageSize: 2 } }, (harness, close) => {
		const ask = askFor(harness);
		ask('rosettaSubmit', { fieldList: fieldListOf(3, 'promptGate'), hubList: ['CEDS'] }, USER_A, ({ answer: submitted }) => untilClosed(ask, submitted.jobRefId, USER_A, () => ask('rosettaPrompts', { jobRefId: submitted.jobRefId }, USER_A, (firstPage) => ask('rosettaPrompts', { jobRefId: submitted.jobRefId, page: '2' }, USER_A, (secondPage) => {
			const promptList = [...firstPage.answer.promptList, ...secondPage.answer.promptList];
			ok('pages hold promptPageSize prompts: 2, then 1, three in all', firstPage.answer.promptList.length === 2 && secondPage.answer.promptList.length === 1 && firstPage.answer.pageCount === 2 && firstPage.answer.promptCount === 3, JSON.stringify({ ...firstPage.answer, promptList: undefined }));
			ok('each names its field as sent and its hub', JSON.stringify(promptList.map((onePrompt) => `${onePrompt.requestName}/${onePrompt.hub}`)) === JSON.stringify(['promptGate0/CEDS', 'promptGate1/CEDS', 'promptGate2/CEDS']));
			const lastCallOfField = (fieldName) => vendor.callLog.filter((oneCall) => oneCall.userPrompt.includes(`name: ${fieldName}\n`)).slice(-1)[0];
			ok('each stored prompt is the exact text last sent to the vendor for that field, system and user', promptList.every((onePrompt) => { const sentCall = lastCallOfField(onePrompt.requestName); return sentCall && sentCall.systemPrompt === onePrompt.systemPrompt && sentCall.userPrompt === onePrompt.userPrompt; }), `${vendor.callLog.length} calls`);
			ok('the re-asked field stores the re-ask, not the first ask', vendor.callLog.length === 4 && /RESTATE YOUR RATIONALE/.test(promptList[0].userPrompt) && !/RESTATE YOUR RATIONALE/.test(promptList[1].userPrompt), `${vendor.callLog.length} calls`);
			const callCountBefore = vendor.callLog.length;
			ask('rosettaSubmit', { fieldList: fieldListOf(3, 'promptGate').slice(1), hubList: ['CEDS'] }, USER_A, ({ answer: resubmitted }) => untilClosed(ask, resubmitted.jobRefId, USER_A, () => ask('rosettaPrompts', { jobRefId: resubmitted.jobRefId }, USER_A, (cachedPage) => {
				ok('the same fields again are answered from the cache: no vendor call', vendor.callLog.length === callCountBefore, `${vendor.callLog.length - callCountBefore} more calls`);
				ok('a cache hit stores the question it answered, byte for byte the prompt first sent', cachedPage.answer.promptList.length === 2 && cachedPage.answer.promptList.every((onePrompt, promptIndex) => onePrompt.userPrompt === promptList[promptIndex + 1].userPrompt && onePrompt.systemPrompt === promptList[promptIndex + 1].systemPrompt), JSON.stringify(cachedPage.answer).slice(0, 200));
				close();
			})));
		}))));
	}, done);
});

gate('meaningVariant', (done) => {
	if (!process.env.EDUCORE_FORGE_CODE_PATH) {
		console.log('  SKIP: meaningVariant: EDUCORE_FORGE_CODE_PATH names no forge carrying rosettaMeaning, so the variant gate did not run');
		done();
		return;
	}
	const vendor = fakeJudgeVendorFor();
	withHarness({ vendorPostOnce: vendor.postOnce, judgePromptVariant: 'rosettaMeaning' }, (harness, close) => {
		const ask = askFor(harness);
		ask('rosettaSubmit', { fieldList: [{ name: 'staffID', definition: 'The unique identifier assigned to a staff member.' }], hubList: ['CEDS'] }, USER_A, ({ answer: submitted }) => untilClosed(ask, submitted.jobRefId, USER_A, (statusAnswer) => ask('rosettaFetch', { jobRefId: submitted.jobRefId, detail: 'audit' }, USER_A, (fetchAnswer) => {
			const sentCall = vendor.callLog[0];
			ok('the job is judged on rosettaMeaning', statusAnswer.status === 'done' && sentCall, `${statusAnswer.status} ${statusAnswer.stopReasonName}`);
			ok('the vendor is asked which MEANING the field expresses', sentCall && /Which MEANING does this SOURCE ELEMENT express\?/.test(sentCall.userPrompt) && /A MEANING is one complete idea/.test(sentCall.systemPrompt));
			ok('each candidate reaches it as a meaning: its property of its class', sentCall && /MEANING NUMBER: \[1\]\n {6}meaning: .+ of .+: class .+, property .+\n/.test(sentCall.userPrompt), sentCall && sentCall.userPrompt.slice(0, 600));
			ok('the answer names the prompt version rosettaMeaning-v1', JSON.stringify(fetchAnswer.body.answeredFrom.using || {}).includes('rosettaMeaning-v1'), JSON.stringify(fetchAnswer.body.answeredFrom.using));
			close();
		})));
	}, done);
});

gate('xff', (done) => {
	const expressApp = express();
	expressApp.set('trust proxy', 1);
	expressApp.get('/visitor', (xReq, xRes) => admitRequest({ door: 'api', credential: undefined, clientAddress: xReq.ip, operationName: 'rosettaSubmit', registryRow: rowOf('rosettaSubmit') }, (unusedError, admission) => xRes.json({ visitorAddress: admission.principal.visitorAddress })));
	const server = expressApp.listen(0, '127.0.0.1', () => {
		const { port } = server.address();
		const askWith = (forwardedText, answered) => http.get({ host: '127.0.0.1', port, path: '/visitor', headers: { 'X-Forwarded-For': forwardedText } }, (response) => {
			const chunkList = [];
			response.on('data', (chunk) => chunkList.push(chunk));
			response.on('end', () => answered(JSON.parse(Buffer.concat(chunkList).toString()).visitorAddress));
		});
		// nginx's $proxy_add_x_forwarded_for appends the address it saw to whatever the client sent; trust proxy 1 takes that last entry
		askWith('1.1.1.1, 10.9.9.9', (firstRefId) => askWith('2.2.2.2, 3.3.3.3, 10.9.9.9', (secondRefId) => askWith('10.9.9.8', (otherRefId) => {
			ok('behind one proxy hop, what the client wrote before nginx\'s entry cannot change the visitor\'s address', firstRefId === secondRefId && firstRefId === '10.9.9.9', `${firstRefId} ${secondRefId}`);
			ok('another address nginx saw is another visitor', otherRefId !== firstRefId);
			const endpointText = fs.readFileSync(path.join(__dirname, '..', 'endpoints-dot-d', 'qtDotLib.d', 'standards-query.js'), 'utf8');
			ok('the endpoint hands admitRequest req.ip and reads no forwarded header', /clientAddress: xReq\.ip/.test(endpointText) && !/forwarded/i.test(endpointText.replace(/\/\/.*$/gm, '')));
			server.close(() => done());
		})));
	});
});

gate('doors', (done) => {
	const baseRegistry = JSON.parse(execFileSync('git', ['show', `${BRANCH_BASE_COMMIT}:server/lib/standards-query/standardsQueryOperations.json`], { cwd: codeRootPath, encoding: 'utf8' }));
	const mcpToolNamesOf = (anyRegistry) => JSON.stringify(anyRegistry.operationList.filter((oneRow) => oneRow.doorList.includes('mcp')).map((oneRow) => oneRow.mcpToolName));
	ok(`the MCP tool list is ${BRANCH_BASE_COMMIT}'s, unchanged`, mcpToolNamesOf(registry) === mcpToolNamesOf(baseRegistry), mcpToolNamesOf(registry));
	ok('rosetta/jobs/prompts is a web route alone: the api door, no MCP tool, not in about', JSON.stringify(rowOf('rosettaPrompts').doorList) === '["api"]' && rowOf('rosettaPrompts').mcpToolName === undefined && rowOf('rosettaPrompts').isListedInAbout === false);
	admitRequest({ door: 'mcp', credential: undefined, operationName: 'rosettaSubmit', registryRow: rowOf('rosettaSubmit') }, (unusedError, mcpAdmission) => admitRequest({ door: 'api', credential: undefined, operationName: 'rosettaSubmit', registryRow: rowOf('rosettaSubmit') }, (unusedApiError, noAddressAdmission) => admitRequest({ door: 'api', credential: undefined, clientAddress: '203.0.113.50', operationName: 'rosettaSubmit', registryRow: { ...rowOf('rosettaSubmit'), admission: 'judgedStep' } }, (unusedOldError, oldAdmission) => {
		ok('an anonymous MCP caller is still refused loopbackNotAdmitted', mcpAdmission.refusal && mcpAdmission.refusal.refusalName === 'loopbackNotAdmitted');
		ok('an anonymous API caller with no address is refused what the row names', noAddressAdmission.refusal && noAddressAdmission.refusal.refusalName === rowOf('rosettaSubmit').anonymousRefusalName);
		ok('the old judgedStep test still refuses any anonymous caller', oldAdmission.refusal && oldAdmission.refusal.refusalName === rowOf('rosettaSubmit').anonymousRefusalName);
		done();
	})));
});

// ⟪review S1⟫ separate pots: anonymous spend never takes the signed-in day, nor signed-in spend the anonymous one
gate('separatePots', (done) => {
	const vendor = fakeJudgeVendorFor();
	withHarness({ vendorPostOnce: vendor.postOnce, fuseOverrideValues: { judgeUsdPerFieldEstimate: 0.01, dailyJudgeCeilingUsd: 0.5, anonymousDailyCeilingUsd: 0.5, perPrincipalDailyUsd: 10, anonymousPerVisitorDailyUsd: 10 } }, (harness, close) => {
		const ask = askFor(harness);
		visitorFor('203.0.113.60', (visitor) => seedSpend({ harness, ownerPrincipalKind: 'anonymous', ownerPrincipalRefId: 'seededVisitor', usdSpent: 0.495 }, () => ask('rosettaSubmit', { fieldList: fieldListOf(1), hubList: ['CEDS'] }, USER_A, (signedInAnswer) => {
			ok('$0.495 of anonymous spend against a $0.50 signed-in day: a signed-in job is still admitted', signedInAnswer.httpStatus === 200, signedInAnswer.answer.refusalName);
			untilClosed(ask, signedInAnswer.answer.jobRefId, USER_A, (signedInStatus) => {
				ok('and runs to the end: the runner reads the signed-in pot alone', signedInStatus.status === 'done', `${signedInStatus.status} ${signedInStatus.stopReasonName}`);
				seedSpend({ harness, ownerPrincipalKind: 'oauthUser', ownerPrincipalRefId: 'seededPerson', usdSpent: 0.6 }, () => ask('rosettaSubmit', { fieldList: fieldListOf(1, 'potVisitor'), hubList: ['CEDS'] }, visitor, (anonymousAnswer) => {
					ok('signed-in spend past the signed-in day does not refuse a visitor: their pot is their own', anonymousAnswer.httpStatus === 429 && anonymousAnswer.answer.refusalName === 'anonymousDailyCeilingReached', `${anonymousAnswer.httpStatus} ${anonymousAnswer.answer.refusalName}: the anonymous pot holds 0.495 + 0.01 > 0.50, refused by ITS ceiling, not dailyCeilingReached`);
					close();
				}));
			});
		})));
	}, done);
});

// ⟪review S4⟫ one address's share: open jobs and daily spend, each its own setting
gate('perVisitor', (done) => {
	const vendor = fakeJudgeVendorFor();
	vendor.holdCalls();
	withHarness({ vendorPostOnce: vendor.postOnce, fuseOverrideValues: { judgeUsdPerFieldEstimate: 0.01, anonymousPerVisitorDailyUsd: 0.5 } }, (harness, close) => {
		const ask = askFor(harness);
		const { judgedValues } = harness.rosettaJudged;
		visitorFor('203.0.113.70', (visitor) => {
			const answerList = [];
			eachInTurn(Array.from({ length: judgedValues.anonymousJobsOpenPerVisitor + 1 }), (unusedItem, jobIndex, nextJob) => ask('rosettaSubmit', { fieldList: fieldListOf(1, `openCap${jobIndex}`), hubList: ['CEDS'] }, visitor, (oneAnswer) => { answerList.push(oneAnswer); nextJob(); }), () => {
				const lastAnswer = answerList[answerList.length - 1];
				ok(`an address may hold anonymousJobsOpenPerVisitor (${judgedValues.anonymousJobsOpenPerVisitor}) open jobs; the next is refused anonymousVisitorHasOpenJob (429), never in an account's words`, answerList.slice(0, -1).every((oneAnswer) => oneAnswer.httpStatus === 200) && lastAnswer.httpStatus === 429 && lastAnswer.answer.refusalName === 'anonymousVisitorHasOpenJob' && !/account/.test(lastAnswer.answer.reason), JSON.stringify(lastAnswer.answer));
				vendor.releaseCalls();
				eachInTurn(answerList.filter((oneAnswer) => oneAnswer.httpStatus === 200), (oneAnswer, unusedIndex, nextJob) => untilClosed(ask, oneAnswer.answer.jobRefId, visitor, () => nextJob()), () => {
					const visitorSecret = fs.readFileSync(path.join(harness.scratchDirPath, 'visitorSecret.txt'), 'utf8');
					seedSpend({ harness, ownerPrincipalKind: 'anonymous', ownerPrincipalRefId: crypto.createHmac('sha256', visitorSecret).update('203.0.113.71').digest('hex'), usdSpent: 0.495 }, () => visitorFor('203.0.113.71', (spentVisitor) => visitorFor('203.0.113.72', (freshVisitor) => ask('rosettaSubmit', { fieldList: fieldListOf(1, 'shareSpent'), hubList: ['CEDS'] }, spentVisitor, (spentAnswer) => ask('rosettaSubmit', { fieldList: fieldListOf(1, 'shareFresh'), hubList: ['CEDS'] }, freshVisitor, (freshAnswer) => {
						ok('an address past its anonymousPerVisitorDailyUsd share is refused anonymousVisitorDailyCeilingReached', spentAnswer.httpStatus === 429 && spentAnswer.answer.refusalName === 'anonymousVisitorDailyCeilingReached', JSON.stringify(spentAnswer.answer));
						ok('another address is not', freshAnswer.httpStatus === 200, freshAnswer.answer.refusalName);
						untilClosed(ask, freshAnswer.answer.jobRefId, freshVisitor, () => close());
					})))));
				});
			});
		});
	}, done);
});

// ⟪review⟫ no cached answer may reveal another submitter's text or identity: two visitors behind ONE address, and two signed-in people, each send the same field
gate('cacheIsolation', (done) => {
	const vendor = fakeJudgeVendorFor({ answerFor: ({ callIndex }) => pickOf('1', 'strong', `The first candidate means the same thing; answer number ${callIndex}.`) });
	withHarness({ vendorPostOnce: vendor.postOnce }, (harness, close) => {
		const ask = askFor(harness);
		const sharedField = [{ name: 'cacheProbeField', definition: 'The date the student was discharged.' }];
		const jobOf = (principal, jobDone) => ask('rosettaSubmit', { fieldList: sharedField, hubList: ['CEDS'] }, principal, ({ answer: submitted }) => untilClosed(ask, submitted.jobRefId, principal, () => ask('rosettaFetch', { jobRefId: submitted.jobRefId, detail: 'audit', rowDetail: 'full' }, principal, (fetched) => jobDone(fetched))));
		visitorFor('203.0.113.80', (firstVisitor) => visitorFor('203.0.113.80', (secondVisitor) => jobOf(firstVisitor, (firstFetch) => {
			const callsAfterFirst = vendor.callLog.length;
			jobOf(secondVisitor, (secondFetch) => {
				const firstRationale = firstFetch.answer.fieldList[0].resultList[0].judgesRationale;
				const secondRationale = secondFetch.answer.fieldList[0].resultList[0].judgesRationale;
				ok('a second visitor at the SAME address sending the same field is judged afresh: the vendor is called again', vendor.callLog.length === callsAfterFirst + 1, `${vendor.callLog.length} calls`);
				ok('their answer is not served from the first visitor\'s cache, and says so', secondFetch.body.answeredFrom.using.cached === false && secondRationale !== firstRationale, `${JSON.stringify(secondFetch.body.answeredFrom.using)} ${secondRationale}`);
				ok('nothing in it carries the first visitor\'s answer or any owner identity', !JSON.stringify(secondFetch.body).includes(firstRationale) && !/ownerPrincipalRefId|visitorRefId|visitorAddress/.test(JSON.stringify(secondFetch.body)));
				const callsBeforePeople = vendor.callLog.length;
				jobOf(USER_A, (personAFetch) => jobOf(USER_B, (personBFetch) => {
					ok('two signed-in people sending the same field: the second is judged afresh, not served the first\'s cache', vendor.callLog.length === callsBeforePeople + 2 && personBFetch.body.answeredFrom.using.cached === false && personBFetch.answer.fieldList[0].resultList[0].judgesRationale !== personAFetch.answer.fieldList[0].resultList[0].judgesRationale, `${vendor.callLog.length - callsBeforePeople} calls`);
					close();
				}));
			});
		})));
	}, done);
});

// ⟪review B1⟫ a variant the loaded forge does not render turns the judged step off at startup, by name, and nothing is admitted to fail unit by unit
gate('variantAtStartup', (done) => {
	const vendor = fakeJudgeVendorFor();
	withHarness({ vendorPostOnce: vendor.postOnce, judgePromptVariant: 'noSuchVariant', judgedOffAllowed: true }, (harness, close) => {
		askFor(harness)('rosettaSubmit', { fieldList: fieldListOf(1), hubList: ['CEDS'] }, USER_A, ({ httpStatus, answer }) => {
			ok('an unknown judgePromptVariant: every submission is refused judgeNotConfigured, naming the variant and those the forge renders', httpStatus === 503 && answer.refusalName === 'judgeNotConfigured' && /judgePromptVariant 'noSuchVariant' is not a variant the loaded forge renders; it renders .*derivedJudgeSlot/.test(answer.judgeAbsentDetail), `${httpStatus} ${answer.judgeAbsentDetail}`);
			ok('and the vendor was never called', vendor.callLog.length === 0);
			close();
		});
	}, () => {
		const knownVendor = fakeJudgeVendorFor();
		withHarness({ vendorPostOnce: knownVendor.postOnce, judgePromptVariant: 'derivedJudgeSlot' }, (harness, close) => {
			askFor(harness)('rosettaSubmit', { fieldList: fieldListOf(1), hubList: ['CEDS'] }, USER_A, ({ httpStatus, answer }) => {
				ok('a variant the forge renders: admitted', httpStatus === 200, answer.refusalName);
				untilClosed(askFor(harness), answer.jobRefId, USER_A, () => close());
			});
		}, done);
	});
});

// ⟪re-verification N1⟫ deletion never depends on the secret: a store with an expired anonymous job, restarted with the secret file missing, is still swept
gate('sweepWithoutSecret', (done) => {
	const storeDirPath = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rosettaSweepNoSecret-'));
	const storeFilePath = path.join(storeDirPath, 'rosettaJobs.sqlite');
	const vendor = fakeJudgeVendorFor();
	openHarness({ embedder: (() => { const embedder = anyTextEmbedderFor(); return embedder; })(), storeFilePath, vendorPostOnce: vendor.postOnce }, (harnessError, harness) => {
		if (harnessError) { ok(`harness: ${harnessError}`, false); done(); return; }
		harness.usedEmbedder.setGoldenHandle(harness.goldenHandle);
		const ask = askFor(harness);
		visitorFor('203.0.113.90', (visitor) => ask('rosettaSubmit', { fieldList: fieldListOf(1), hubList: ['CEDS'] }, visitor, ({ answer: submitted }) => untilClosed(ask, submitted.jobRefId, visitor, () => {
			harness.runner.stopTicking();
			const countSubmissions = (counted) => {
				const sqlite3 = require('sqlite3');
				const handle = new sqlite3.Database(storeFilePath, sqlite3.OPEN_READONLY, () => handle.get('SELECT (SELECT count(*) FROM submissions) AS submissions, (SELECT count(*) FROM rosettaJudgmentCache) AS cacheRows', [], (readError, oneRow) => handle.close(() => counted(readError, oneRow))));
			};
			countSubmissions((beforeError, beforeCount) => harness.strangerVectorStore.close(() => {
				ok('before: the anonymous job is in the store', !beforeError && beforeCount.submissions === 1, JSON.stringify(beforeCount));
				const laterNow = () => new Date(Date.now() + 8 * 86400000);
				openHarness({ storeFilePath, judgedOffAllowed: true, nowDate: laterNow, fuseOverrideValues: { anonymousVisitorSecretFilePath: path.join(storeDirPath, 'noSuchSecretFile.txt') } }, (laterError, laterHarness) => {
					ok('restarted 8 days on with the secret file missing: the judged step is off, by name', !laterError && laterHarness.errorLineList.some((oneLine) => /anonymousVisitorSecretFilePath .* would not read \(ENOENT\)/.test(oneLine)), laterError || JSON.stringify(laterHarness.errorLineList));
					countSubmissions((afterError, afterCount) => {
						ok('and the expired anonymous job was swept anyway, its cache with it', !afterError && afterCount.submissions === 0 && afterCount.cacheRows === 0, JSON.stringify(afterCount));
						laterHarness.strangerVectorStore.close(() => { fs.rmSync(storeDirPath, { recursive: true, force: true }); done(); });
					});
				});
			}));
		})));
	});
});

// ⟪re-verification N2⟫ nothing a job reports may tell its owner that someone else sent the same text: the embedding estimate is the same cached or not
gate('estimateCacheBlind', (done) => {
	const vendor = fakeJudgeVendorFor();
	withHarness({ vendorPostOnce: vendor.postOnce }, (harness, close) => {
		const ask = askFor(harness);
		const sameField = [{ name: 'estimateProbeField', definition: 'The date the learner left the programme.' }];
		visitorFor('203.0.113.91', (firstVisitor) => visitorFor('203.0.113.92', (secondVisitor) => ask('rosettaSubmit', { fieldList: sameField, hubList: ['CEDS'] }, firstVisitor, ({ answer: firstJob }) => untilClosed(ask, firstJob.jobRefId, firstVisitor, (firstStatus) => ask('rosettaSubmit', { fieldList: sameField, hubList: ['CEDS'] }, secondVisitor, ({ answer: secondJob }) => untilClosed(ask, secondJob.jobRefId, secondVisitor, (secondStatus) => {
			ok('the second sender of the same text sees the same embedding estimate as the first, and a real one', firstStatus.embeddingTokensEstimate > 0 && secondStatus.embeddingTokensEstimate === firstStatus.embeddingTokensEstimate, `${firstStatus.embeddingTokensEstimate} vs ${secondStatus.embeddingTokensEstimate}`);
			ask('rosettaStatus', { jobRefId: 'f'.repeat(32) }, secondVisitor, (unknownAnswer) => {
				ok('a visitor asking for no such job is told in a visitor\'s words, never "this account"', unknownAnswer.answer.refusalName === 'notFound' && !/account/.test(unknownAnswer.answer.reason), unknownAnswer.answer.reason);
				close();
			});
		}))))));
	}, done);
});

const selectedNameList = process.argv.slice(2);
const runList = selectedNameList.length ? GATE_LIST.filter((oneGate) => selectedNameList.includes(oneGate.gateName)) : GATE_LIST;
const runGate = (gateIndex) => {
	if (gateIndex >= runList.length) {
		console.log(`rosetta-anonymous-live: ${passedCount} passed, ${failedCount} failed`);
		process.exit(failedCount === 0 ? 0 : 1);
	}
	console.log(`-- ${runList[gateIndex].gateName}`);
	runList[gateIndex].runGate(() => runGate(gateIndex + 1));
};
runGate(0);
