'use strict';

// rosettaJobRunner — the job, field by field and hub by hub, outside any request (design 4.2). A slow client holds nothing: submit returns at once and this runs on its own.
//
//   createRosettaJobRunner({ jobStore, judgeEngine, judgedValues, rosettaRetrieval, withReadSession, getServiceFacts, alreadyMappedFromFor, spendLedgerWriter, runCypher, nowMs, xLog })
//     → { startUp(done), tick(), isIdle(), stopTicking() }
//   Each unit (one field, one hub): ask the fuse, read a pool in a session of its own, ask the judge, write the row. The pool and the prompt leave memory with the unit: only the row stays, and the row is on disk.
//
// WHAT A RESTART DOES (G4.9). startUp reconciles first: a call that never answered keeps its estimate on the bill and its unit is finished as lostAtRestart, not asked again, because the vendor may have billed it. A job still running then resumes at its next unit. A finished unit has a row, so nothing is asked twice, and the judgment cache would serve it free if it were.
// A job that cannot go on ends by name and its partial report stays fetchable: a changed manifest, a judge this instance no longer has, a vendor that will not answer. No job stays running for ever: every path below ends in finishJob or in the next unit.

const crypto = require('crypto');
const { unitNameOf, OPEN_STATUS_LIST } = require('./rosettaJobStore');
const { judgedSettings } = require('./rosettaJudgeEngine');

const MILLISECONDS_PER_DAY = 86400000;
const MILLISECONDS_PER_SECOND = 1000;
const TIER_OFFERED = 'property';
const UNIT_STATUS_NO_CANDIDATE = 'noCandidate';
const JOB_STATUS = Object.freeze({ done: 'done', running: 'running', cancelled: 'cancelled', fuseTripped: 'fuseTripped', vendorStopped: 'vendorStopped', stopped: 'stopped' });
const CARD_FACTS_CYPHER_FOR = (candidateFieldNameList) => `MATCH (card:HubReference) WHERE card.stableId IN $cardStableIdList RETURN card { .stableId, .qualifierNames, ${candidateFieldNameList.filter((oneName) => oneName !== 'componentIdeaList').map((oneName) => `.${oneName}`).join(', ')} } AS cardFacts`;

// WHAT THE JUDGE IS OFFERED. judgedPoolCap 0 is the pool as retrieval built it. Above 0 it is the pool's first judgedPoolCap by rank, plus the card closest by cosine, always, even from past the cap or past the pool: vote-first order can rank the true card behind every card a generic name reached twice (P4's organization name: cosine rank 1 at rank 33 to 41). Retrieval's own answer never reads this.
const judgedCandidateListOf = ({ pool, judgedPoolCap }) => {
	if (judgedPoolCap === 0) {
		return pool.candidateList;
	}
	const firstList = pool.candidateList.slice(0, judgedPoolCap);
	const cosineRankOne = pool.cosineRankOneOutsidePool || pool.candidateList.find((oneCandidate) => oneCandidate.rankByCosine === 1);
	return cosineRankOne && !firstList.some((oneCandidate) => oneCandidate.stableId === cosineRankOne.stableId) ? [...firstList, cosineRankOne] : firstList;
};

// the forge's loader writes a one-element list as a plain string (SIF certificate, note 3); the renderer takes a list
const cardOfFacts = (cardFacts) => ({ ...cardFacts, ...(typeof cardFacts.qualifierNames === 'string' ? { qualifierNames: [cardFacts.qualifierNames] } : {}), ...(cardFacts.qualifierNames === null ? { qualifierNames: undefined } : {}) });

// THE CORE'S TWO HALVES, each usable alone, so a gate can run pool and judge apart: readCandidateCards turns a pool into what the judge is shown
const readCandidateCardsFor = ({ runCypher, judgeEngine }) => ({ session, hubName, candidateList }, done) => {
	const hubFacts = judgeEngine.hubFactsFor(hubName);
	if (hubFacts.refusalText) {
		done(hubFacts.refusalText);
		return;
	}
	const orderOfStableId = new Map(candidateList.map((oneCandidate, candidateIndex) => [oneCandidate.stableId, candidateIndex]));
	runCypher(session, CARD_FACTS_CYPHER_FOR(hubFacts.candidateFieldNameList), { cardStableIdList: candidateList.map((oneCandidate) => oneCandidate.stableId) }, (cardError, cardResult) => {
		if (cardError) {
			done(`reading the cards of ${hubName}: ${cardError}`);
			return;
		}
		done('', cardResult.records.map((oneRecord) => cardOfFacts(oneRecord.get('cardFacts'))).sort((left, right) => orderOfStableId.get(left.stableId) - orderOfStableId.get(right.stableId)));
	});
};

const createRosettaJobRunner = ({ jobStore, judgeEngine, judgeAbsentReason, judgedValues, rosettaRetrieval, withReadSession, getServiceFacts, alreadyMappedFromFor, spendLedgerWriter, runCypher, nowMs, xLog }) => {
	let activeJobCount = 0;
	let tickTimer = null;
	const readCandidateCards = judgeEngine ? readCandidateCardsFor({ runCypher, judgeEngine }) : null;

	// the fuse, read from the store before every unit and every attempt, so a restart resets nothing. Anything open that must stop answers its reason; '' means go on.
	const stopReasonFor = (job) => (done) => {
		jobStore.readJob(job.jobRefId, (jobError, currentJob) => {
			if (jobError) {
				done(jobError);
				return;
			}
			if (!currentJob) {
				done('', { jobStatus: JOB_STATUS.stopped, stopReasonName: 'jobDeleted', stopReasonText: 'the job is gone from the store' });
				return;
			}
			if (currentJob.status === 'cancelling') {
				done('', { jobStatus: JOB_STATUS.cancelled, stopReasonName: 'cancelledByOwner', stopReasonText: 'the owner cancelled this job' });
				return;
			}
			const sinceMs = nowMs() - MILLISECONDS_PER_DAY;
			jobStore.jobSpendUsd(job.jobRefId, (jobSpendError, jobSpentUsd) => {
				if (jobSpendError) {
					done(jobSpendError);
					return;
				}
				if (jobSpentUsd >= judgedValues.perJobCeilingUsd) {
					done('', { jobStatus: JOB_STATUS.fuseTripped, stopReasonName: 'perJobCeilingReached', stopReasonText: 'this job reached the most one job may spend' });
					return;
				}
				jobStore.rollingSpendUsd({ sinceMs }, (dayError, daySpentUsd) => {
					if (dayError) {
						done(dayError);
						return;
					}
					if (daySpentUsd >= judgedValues.dailyJudgeCeilingUsd) {
						done('', { jobStatus: JOB_STATUS.fuseTripped, stopReasonName: 'dailyCeilingReached', stopReasonText: 'this service reached the most it spends on judging in any 24 hours' });
						return;
					}
					jobStore.rollingSpendUsd({ sinceMs, ownerPrincipalRefId: job.ownerPrincipalRefId }, (ownerError, ownerSpentUsd) => {
						if (ownerError) {
							done(ownerError);
							return;
						}
						if (ownerSpentUsd >= judgedValues.perPrincipalDailyUsd) {
							done('', { jobStatus: JOB_STATUS.fuseTripped, stopReasonName: 'perPrincipalCeilingReached', stopReasonText: 'this account reached the most one person may spend in any 24 hours' });
							return;
						}
						done('', null);
					});
				});
			});
		});
	};

	const finishJob = ({ job, stopReason }, done) => {
		const status = stopReason ? stopReason.jobStatus : JOB_STATUS.done;
		jobStore.setJobStatus({ jobRefId: job.jobRefId, status, stopReasonName: stopReason ? stopReason.stopReasonName : undefined, stopReasonText: stopReason ? stopReason.stopReasonText : undefined, finishedAtMs: nowMs() }, (statusError) => {
			if (statusError) {
				xLog.error(`rosettaJobRunner: job ${job.jobRefId} would not finish: ${statusError}`);
				done();
				return;
			}
			xLog.status(`rosettaJobRunner: job ${job.jobRefId} ended ${status}${stopReason ? ` (${stopReason.stopReasonName})` : ''}`);
			spendLedgerWriter(job, (ledgerError) => {
				if (ledgerError) {
					xLog.error(`rosettaJobRunner: job ${job.jobRefId}: the lifetime ledger would not take its line: ${ledgerError}`);
				}
				done();
			});
		});
	};

	const runnerUpListOf = ({ candidateList, chosenCardStableId }) => candidateList.filter((oneCandidate) => oneCandidate.stableId !== chosenCardStableId).slice(0, judgedSettings.runnerUpListLength).map(({ uri, label, cosine }) => ({ uri, label, cosine }));

	// a field with a pool comes out as one row, whichever way the judge went. A vendor fault writes no row here: the caller ends the job and the report reads notJudged.
	const unitRowOf = ({ outcome, pool, alreadyMappedFrom }) => {
		const chosenCandidate = outcome.chosenCardStableId ? pool.candidateList.find((oneCandidate) => oneCandidate.stableId === outcome.chosenCardStableId) : undefined;
		return {
			poolSize: pool.poolSize,
			admittedCount: pool.admittedCount,
			runnerUpList: pool.candidateList ? runnerUpListOf({ candidateList: pool.candidateList, chosenCardStableId: outcome.chosenCardStableId }) : [],
			...(pool.cosineRankOneOutsidePool ? { cosineRankOneOutsidePool: { uri: pool.cosineRankOneOutsidePool.uri, label: pool.cosineRankOneOutsidePool.label, cosine: pool.cosineRankOneOutsidePool.cosine } } : {}),
			...(outcome.identifierScanPatternName ? { identifierScanPatternName: outcome.identifierScanPatternName } : {}),
			...(outcome.judgesRationale ? { judgesRationale: outcome.judgesRationale } : {}),
			...(outcome.answerWasCut ? { answerWasCut: true } : {}),
			...(chosenCandidate ? {
				proposal: {
					uri: chosenCandidate.uri,
					label: chosenCandidate.label,
					domain: chosenCandidate.domain,
					category: outcome.category,
					confidence: outcome.confidence,
					...(outcome.predicate ? { predicate: outcome.predicate } : {}),
					...(outcome.collapsedMemberStableIdList ? { collapsedMemberList: outcome.collapsedMemberStableIdList } : {}),
				},
				alreadyMappedFrom,
			} : {}),
		};
	};

	const runUnit = ({ job, oneField, fieldIndex, hubName, serviceFacts }, unitDone) => {
		const stopReasonNow = stopReasonFor(job);
		stopReasonNow((stopError, stopReason) => {
			if (stopError) {
				unitDone('', { jobStatus: JOB_STATUS.stopped, stopReasonName: 'storeFailed', stopReasonText: 'the job store could not be read' });
				return;
			}
			if (stopReason) {
				unitDone('', stopReason);
				return;
			}
			// a session of its own, closed before the judge is asked: a judge call takes seconds and no graph session waits on it
			withReadSession((session, sessionDone) => rosettaRetrieval.retrieveCandidates({ session, serviceFacts, queryTextList: [oneField.name, oneField.definition], target: { kind: 'hubCards', hubName, tier: TIER_OFFERED } }, (poolError, pool) => {
				if (poolError || pool.refusal || pool.status === UNIT_STATUS_NO_CANDIDATE) {
					sessionDone(poolError, { pool });
					return;
				}
				const judgedCandidateList = judgedCandidateListOf({ pool, judgedPoolCap: judgedValues.judgedPoolCap });
				readCandidateCards({ session, hubName, candidateList: judgedCandidateList }, (cardError, candidateCardList) => sessionDone(cardError, { pool, judgedCandidateList, candidateCardList }));
			}), (readError, poolRead) => {
				if (readError) {
					xLog.error(`rosettaJobRunner: job ${job.jobRefId}: a pool could not be read: ${readError}`);
					unitDone('', { jobStatus: JOB_STATUS.stopped, stopReasonName: 'poolUnreadable', stopReasonText: 'a pool could not be read from the graph' });
					return;
				}
				const { pool, judgedCandidateList, candidateCardList } = poolRead;
				if (pool.refusal) {
					unitDone('', { jobStatus: JOB_STATUS.stopped, stopReasonName: pool.refusal.refusalName, stopReasonText: pool.refusal.reason });
					return;
				}
				const writeUnit = ({ unitStatus, promptHash, judgment }, afterWrite) => jobStore.writeJudgment({ jobRefId: job.jobRefId, fieldIndex, hubName, unitStatus, promptHash, judgment }, (writeError) => {
					if (writeError) {
						xLog.error(`rosettaJobRunner: job ${job.jobRefId}: a judgment would not write: ${writeError}`);
						unitDone('', { jobStatus: JOB_STATUS.stopped, stopReasonName: 'storeFailed', stopReasonText: 'the job store would not take a judgment' });
						return;
					}
					afterWrite();
				});
				if (pool.status === UNIT_STATUS_NO_CANDIDATE) {
					writeUnit({ unitStatus: UNIT_STATUS_NO_CANDIDATE, judgment: { poolSize: 0, admittedCount: 0, runnerUpList: [] } }, () => unitDone('', null));
					return;
				}
				judgeEngine.judgeFieldAgainstPool({ jobRefId: job.jobRefId, ownerPrincipalRefId: job.ownerPrincipalRefId, fieldIndex, oneField, hubName, candidateCardList, stopReasonNow }, (judgeError, outcome) => {
					if (judgeError) {
						xLog.error(`rosettaJobRunner: job ${job.jobRefId}: judging could not start: ${judgeError}`);
						unitDone('', { jobStatus: JOB_STATUS.stopped, stopReasonName: 'judgeUnavailable', stopReasonText: 'this instance could not put the question to the judge' });
						return;
					}
					if (outcome.stoppedBy) {
						unitDone('', outcome.stoppedBy);
						return;
					}
					if (outcome.vendorStop) {
						unitDone('', { jobStatus: JOB_STATUS.vendorStopped, stopReasonName: outcome.vendorStop.faultName, stopReasonText: outcome.vendorStop.reason });
						return;
					}
					// asked only after the judge has answered, so a published mapping can never reach a prompt
					const withEnrichment = (afterEnrichment) => (outcome.chosenCardStableId ? alreadyMappedFromFor({ cardUri: judgedCandidateList.find((oneCandidate) => oneCandidate.stableId === outcome.chosenCardStableId).uri }, afterEnrichment) : afterEnrichment(undefined));
					withEnrichment((alreadyMappedFrom) => writeUnit({ unitStatus: outcome.unitStatus, promptHash: outcome.promptHash, judgment: unitRowOf({ outcome, pool: { ...pool, candidateList: judgedCandidateList }, alreadyMappedFrom }) }, () => unitDone('', null)));
				});
			});
		});
	};

	const runJob = (job, jobDone) => {
		const serviceFacts = getServiceFacts();
		const finishWith = (stopReason) => finishJob({ job, stopReason }, jobDone);
		if (!judgeEngine) {
			finishWith({ jobStatus: JOB_STATUS.stopped, stopReasonName: 'judgeNotConfigured', stopReasonText: judgeAbsentReason || 'this instance has no judge' });
			return;
		}
		if (serviceFacts.passport.manifestRefId !== job.answeredFrom.manifestRefId) {
			finishWith({ jobStatus: JOB_STATUS.stopped, stopReasonName: 'manifestChanged', stopReasonText: `this job began on manifest ${job.answeredFrom.manifestRefId}; the instance now answers from ${serviceFacts.passport.manifestRefId}` });
			return;
		}
		jobStore.setJobStatus({ jobRefId: job.jobRefId, status: JOB_STATUS.running, startedAtMs: job.startedAtMs || nowMs() }, (statusError) => {
			if (statusError) {
				xLog.error(`rosettaJobRunner: job ${job.jobRefId} would not start: ${statusError}`);
				jobDone();
				return;
			}
			jobStore.readSubmission(job.jobRefId, (submissionError, submission) => {
				if (submissionError || !submission) {
					finishWith({ jobStatus: JOB_STATUS.stopped, stopReasonName: 'storeFailed', stopReasonText: 'the submission could not be read' });
					return;
				}
				jobStore.judgedUnitNameSet(job.jobRefId, (doneError, finishedUnitNameSet) => {
					if (doneError) {
						finishWith({ jobStatus: JOB_STATUS.stopped, stopReasonName: 'storeFailed', stopReasonText: 'the finished units could not be read' });
						return;
					}
					const runNextUnit = (unitIndex) => {
						const fieldIndex = Math.floor(unitIndex / job.hubNameList.length);
						if (fieldIndex >= submission.fieldList.length) {
							finishWith(null);
							return;
						}
						const hubName = job.hubNameList[unitIndex % job.hubNameList.length];
						if (finishedUnitNameSet.has(unitNameOf({ fieldIndex, hubName }))) {
							runNextUnit(unitIndex + 1);
							return;
						}
						runUnit({ job, oneField: submission.fieldList[fieldIndex], fieldIndex, hubName, serviceFacts }, (unusedError, stopReason) => {
							if (stopReason) {
								finishWith(stopReason);
								return;
							}
							setImmediate(() => runNextUnit(unitIndex + 1));
						});
					};
					runNextUnit(0);
				});
			});
		});
	};

	// running ones first, so a restart resumes before anything new begins
	const tick = () => {
		if (activeJobCount >= judgedValues.maxRunningJobs || !getServiceFacts()) {
			return;
		}
		activeJobCount += 1;
		const released = () => {
			activeJobCount -= 1;
			setImmediate(tick);
		};
		jobStore.readJobList({ statusList: [JOB_STATUS.running] }, (runningError, runningJobList) => {
			if (runningError) {
				xLog.error(`rosettaJobRunner: the queue would not read: ${runningError}`);
				activeJobCount -= 1;
				return;
			}
			const heldRefIdSet = heldJobRefIdSet;
			const resumable = runningJobList.find((oneJob) => !heldRefIdSet.has(oneJob.jobRefId));
			const startJob = (oneJob) => {
				heldRefIdSet.add(oneJob.jobRefId);
				runJob(oneJob, () => {
					heldRefIdSet.delete(oneJob.jobRefId);
					released();
				});
			};
			if (resumable) {
				startJob(resumable);
				return;
			}
			jobStore.readJobList({ statusList: ['queued'] }, (queueError, queuedJobList) => {
				if (queueError) {
					xLog.error(`rosettaJobRunner: the queue would not read: ${queueError}`);
					activeJobCount -= 1;
					return;
				}
				const nextQueuedJob = queuedJobList.find((oneJob) => !heldRefIdSet.has(oneJob.jobRefId));
				if (!nextQueuedJob) {
					activeJobCount -= 1;
					return;
				}
				startJob(nextQueuedJob);
			});
		});
	};
	const heldJobRefIdSet = new Set();

	const startUp = (done) => jobStore.reconcileAfterRestart((reconcileError, reconciled) => {
		if (reconcileError) {
			done(reconcileError);
			return;
		}
		if (reconciled.lostCallCount > 0) {
			xLog.status(`rosettaJobRunner: ${reconciled.lostCallCount} judge calls were under way at the last stop; each keeps its estimate on the bill and its field is not asked again`);
		}
		tickTimer = setInterval(tick, judgedValues.jobRunnerPollSeconds * MILLISECONDS_PER_SECOND);
		tickTimer.unref();
		tick();
		done('', reconciled);
	});

	return { startUp, tick, isIdle: () => activeJobCount === 0, stopTicking: () => clearInterval(tickTimer) };
};

// one line per job in Rosetta's lifetime file, by the forge's own ledger (design 5). It holds counts and dollars and never a text.
const spendLedgerWriterFor = ({ jobStore, judgeEngine, judgedValues, xLog }) => (job, done) => {
	if (!judgeEngine) {
		done('');
		return;
	}
	jobStore.judgeCallTotalsOf(job.jobRefId, (totalsError, totalsRowList) => {
		if (totalsError) {
			done(totalsError);
			return;
		}
		jobStore.readJudgmentList(job.jobRefId, (judgmentError, judgmentRowList) => {
			if (judgmentError) {
				done(judgmentError);
				return;
			}
			const sumOf = (fieldName) => totalsRowList.reduce((soFar, oneRow) => soFar + oneRow[fieldName], 0);
			const usdByProviderModel = totalsRowList.reduce((soFar, oneRow) => {
				const providerModelName = `anthropic:${oneRow.wireModel}`;
				const previous = soFar[providerModelName] || { callCount: 0, inputTokens: 0, outputTokens: 0, usd: 0 };
				return { ...soFar, [providerModelName]: { callCount: previous.callCount + oneRow.callCount, inputTokens: previous.inputTokens + oneRow.inputTokens, outputTokens: previous.outputTokens + oneRow.outputTokens, usd: previous.usd + oneRow.usd } };
			}, {});
			const { spendLedgerLib } = judgeEngine.ledgerModules;
			const ledgerMade = spendLedgerLib.spendLedgerFor({
				recipeName: 'rosettaJudged',
				buildRunStamp: crypto.createHash('sha256').update(job.jobRefId).digest('hex').slice(0, 16), // the jobRefId is the owner's secret; the ledger gets its hash
				buildStartedAtIso: new Date(job.startedAtMs || job.submittedAtMs).toISOString(),
				storeDirPath: 'rosettaJobs.sqlite',
				bridgeSpendList: [{ bridgeName: 'rosetta', pairKey: job.hubNameList.join('+'), judgeSpend: { asked: sumOf('callCount'), servedFromCache: 0, abstained: judgmentRowList.filter((oneRow) => oneRow.unitStatus === 'abstained').length, inputTokens: sumOf('inputTokens'), outputTokens: sumOf('outputTokens'), usd: sumOf('usd'), savedUsd: 0, savedUsdUnknownCount: 0, debugUnitCount: 0, usdByProviderModel } }],
				embeddingSpendRecordList: [],
				spendPricer: judgeEngine.spendPricer,
			});
			if (ledgerMade.error) {
				done(ledgerMade.error);
				return;
			}
			spendLedgerLib.appendLifetimeSpendLedger({ lifetimeLedgerFilePath: judgedValues.spendLedgerFilePath, spendLedger: ledgerMade.spendLedger }, (appendError) => done(appendError || ''));
		});
	});
};

module.exports = { createRosettaJobRunner, spendLedgerWriterFor, readCandidateCardsFor, judgedCandidateListOf, OPEN_STATUS_LIST };
