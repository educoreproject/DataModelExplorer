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
const { reasonOf } = require('./rosettaReasonWords');
const { hubElementIdentityFor, absentOf } = require('./hubElementIdentity');
const { hubCardTupleFor, tupleAbsentOf } = require('../hubCardTuple');

const MILLISECONDS_PER_DAY = 86400000;
const MILLISECONDS_PER_SECOND = 1000;
const TIER_OFFERED = 'property';
const UNIT_STATUS_NO_CANDIDATE = 'noCandidate';
const JUDGED_TOKEN_ACCOUNT_NAME = 'judged';
const EMBEDDING_PROVIDER_NAME = 'voyage';
const RELEASE_JOB = Object.freeze({ releaseJob: true });
const { ANONYMOUS_PRINCIPAL_KIND } = require('../admitRequest');
// the two pots the fuse reads before every unit, keyed by whether the job is anonymous (DATA: a kind filter, the ceiling and per-owner settings, and what a stop says)
const RUNNER_POT_BY_IS_ANONYMOUS = Object.freeze({
	false: Object.freeze({ kindFilter: { exceptOwnerPrincipalKindList: [ANONYMOUS_PRINCIPAL_KIND] }, dailyCeilingSettingName: 'dailyJudgeCeilingUsd', ownerDailySettingName: 'perPrincipalDailyUsd', dailyStop: { stopReasonName: 'dailyCeilingReached', stopReasonText: reasonOf('dailyCeilingStop') }, ownerStop: { stopReasonName: 'perPrincipalCeilingReached', stopReasonText: reasonOf('perPrincipalCeilingStop') } }),
	true: Object.freeze({ kindFilter: { ownerPrincipalKindList: [ANONYMOUS_PRINCIPAL_KIND] }, dailyCeilingSettingName: 'anonymousDailyCeilingUsd', ownerDailySettingName: 'anonymousPerVisitorDailyUsd', dailyStop: { stopReasonName: 'anonymousDailyCeilingReached', stopReasonText: reasonOf('anonymousDailyCeilingStop') }, ownerStop: { stopReasonName: 'anonymousVisitorDailyCeilingReached', stopReasonText: reasonOf('anonymousVisitorDailyCeilingStop') } }),
});
const RUNNER_LANE_LIST = Object.freeze([
	Object.freeze({ laneName: 'signedIn', maxRunningSettingName: 'maxRunningJobs', isAnonymousLane: false }),
	Object.freeze({ laneName: 'anonymous', maxRunningSettingName: 'anonymousMaxRunningJobs', isAnonymousLane: true }),
]);
const JOB_STATUS = Object.freeze({ done: 'done', running: 'running', cancelled: 'cancelled', fuseTripped: 'fuseTripped', vendorStopped: 'vendorStopped', stopped: 'stopped' });
const CARD_FACTS_CYPHER_FOR = (candidateFieldNameList) => `MATCH (card:HubReference) WHERE card.stableId IN $cardStableIdList RETURN card { .stableId, .qualifierNames, ${candidateFieldNameList.filter((oneName) => oneName !== 'componentIdeaList').map((oneName) => `.${oneName}`).join(', ')} } AS cardFacts`;

// WHAT THE JUDGE IS OFFERED. judgedPoolCap 0 is the pool as retrieval built it. Above 0 it is the pool's first judgedPoolCap by rank, plus the card closest by cosine, always, even from past the cap or past the pool: vote-first order can rank the true card behind every card a generic name reached twice (P4's organization name: cosine rank 1 at rank 33 to 41). Retrieval's own answer never reads this.
// ⟪rosettaMeanings R5⟫ a hubHybrid pool says how far the judge's view reaches (its judgedViewLength: the cap's cards and the meanings added after them); no other kind says it, and the cap rules
const judgedCandidateListOf = ({ pool, judgedPoolCap }) => {
	if (judgedPoolCap === 0) {
		return pool.candidateList;
	}
	const firstList = pool.candidateList.slice(0, pool.judgedViewLength === undefined ? judgedPoolCap : pool.judgedViewLength);
	const cosineRankOne = pool.cosineRankOneOutsidePool || pool.candidateList.find((oneCandidate) => oneCandidate.rankByCosine === 1);
	return cosineRankOne && !firstList.some((oneCandidate) => oneCandidate.stableId === cosineRankOne.stableId) ? [...firstList, cosineRankOne] : firstList;
};

// ⟪P7a⟫ what a proposal stores of its card's tuple read: the tuple or why there is none; a hub's descriptive ranges (only for a hub whose range is not identity); a datatype range as written
const cardTupleFieldsOf = ({ tuple, tupleAbsentName, rangePartList, rangeIsIdentity, rangeDatatypeList }) => ({
	...(tuple ? { tuple } : { tupleAbsentName }),
	...(rangeIsIdentity === false ? { rangeList: rangePartList } : {}),
	...(rangeDatatypeList && rangeDatatypeList.length ? { rangeDatatypeList } : {}),
});

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
				done('', { jobStatus: JOB_STATUS.stopped, stopReasonName: 'jobDeleted', stopReasonText: reasonOf('jobDeleted') });
				return;
			}
			if (currentJob.status === 'cancelling') {
				done('', { jobStatus: JOB_STATUS.cancelled, stopReasonName: 'cancelledByOwner', stopReasonText: reasonOf('cancelledByOwner') });
				return;
			}
			// compared before every unit: the graph can come back on another golden under a running job, and pools from it are not this job's. No facts just now is not a change: the unit will wait for them.
			const currentFacts = getServiceFacts();
			if (currentFacts && currentFacts.passport.manifestRefId !== job.answeredFrom.manifestRefId) {
				done('', manifestChangedStop({ job, serviceFacts: currentFacts }));
				return;
			}
			const sinceMs = nowMs() - MILLISECONDS_PER_DAY;
			jobStore.jobSpendUsd(job.jobRefId, (jobSpendError, jobSpentUsd) => {
				if (jobSpendError) {
					done(jobSpendError);
					return;
				}
				if (jobSpentUsd >= judgedValues.perJobCeilingUsd) {
					done('', { jobStatus: JOB_STATUS.fuseTripped, stopReasonName: 'perJobCeilingReached', stopReasonText: reasonOf('perJobCeilingStop') });
					return;
				}
				// ⟪rosettaMeanings review S1, S4⟫ each kind of job is held to its own pot and its own per-owner share (RUNNER_POT_BY_IS_ANONYMOUS); a visitor never spends the signed-in day
				const runnerPot = RUNNER_POT_BY_IS_ANONYMOUS[String(job.ownerPrincipalKind === ANONYMOUS_PRINCIPAL_KIND)];
				jobStore.rollingSpendUsd({ sinceMs, ...runnerPot.kindFilter }, (dayError, daySpentUsd) => {
					if (dayError) {
						done(dayError);
						return;
					}
					if (daySpentUsd >= judgedValues[runnerPot.dailyCeilingSettingName]) {
						done('', { jobStatus: JOB_STATUS.fuseTripped, ...runnerPot.dailyStop });
						return;
					}
					jobStore.rollingSpendUsd({ sinceMs, ownerPrincipalRefId: job.ownerPrincipalRefId }, (ownerError, ownerSpentUsd) => {
						if (ownerError) {
							done(ownerError);
							return;
						}
						if (ownerSpentUsd >= judgedValues[runnerPot.ownerDailySettingName]) {
							done('', { jobStatus: JOB_STATUS.fuseTripped, ...runnerPot.ownerStop });
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

	const manifestChangedStop = ({ job, serviceFacts }) => ({ jobStatus: JOB_STATUS.stopped, stopReasonName: 'manifestChanged', stopReasonText: reasonOf('manifestChanged', { startedManifestRefId: job.answeredFrom.manifestRefId, currentManifestRefId: serviceFacts.passport.manifestRefId }) });

	const runnerUpListOf = ({ candidateList, chosenCardStableId }) => candidateList.filter((oneCandidate) => oneCandidate.stableId !== chosenCardStableId).slice(0, judgedSettings.runnerUpListLength).map(({ uri, label, cosine }) => ({ uri, label, cosine }));

	// a field with a pool comes out as one row, whichever way the judge went. A vendor fault writes no row here: the caller ends the job and the report reads notJudged.
	const unitRowOf = ({ outcome, pool, alreadyMappedFrom, hubElementIdentityFields, cardTupleFields }) => {
		const chosenCandidate = outcome.chosenCardStableId ? pool.candidateList.find((oneCandidate) => oneCandidate.stableId === outcome.chosenCardStableId) : undefined;
		return {
			poolSize: pool.poolSize,
			admittedCount: pool.admittedCount,
			runnerUpList: pool.candidateList ? runnerUpListOf({ candidateList: pool.candidateList, chosenCardStableId: outcome.chosenCardStableId }) : [],
			...(pool.cosineRankOneOutsidePool ? { cosineRankOneOutsidePool: { uri: pool.cosineRankOneOutsidePool.uri, label: pool.cosineRankOneOutsidePool.label, cosine: pool.cosineRankOneOutsidePool.cosine } } : {}),
			...(outcome.identifierScanPatternName ? { identifierScanPatternName: outcome.identifierScanPatternName } : {}),
			...(outcome.judgesRationale ? { judgesRationale: outcome.judgesRationale } : {}),
			...(outcome.answerWasCut ? { answerWasCut: true } : {}),
			...(outcome.notJudgedReason ? { notJudgedReason: outcome.notJudgedReason } : {}),
			...(outcome.judgedWithSearchDescription ? { judgedWithSearchDescription: true } : {}),
			...(outcome.rendererVersion ? { rendererVersion: outcome.rendererVersion } : {}),
			...(chosenCandidate ? {
				proposal: {
					uri: chosenCandidate.uri,
					label: chosenCandidate.label,
					domain: chosenCandidate.domain,
					category: outcome.category,
					confidence: outcome.confidence,
					...(outcome.predicate ? { predicate: outcome.predicate } : {}),
					...(outcome.collapsedMemberStableIdList ? { collapsedMemberList: outcome.collapsedMemberStableIdList } : {}),
					...hubElementIdentityFields,
					...cardTupleFields,
				},
				alreadyMappedFrom,
			} : {}),
		};
	};

	const runUnit = ({ job, oneField, searchDescriptionText, fieldIndex, hubName }, unitDone) => {
		// the graph is reconnecting: the job lets go, keeps its status, and the next tick picks it up where it was
		const serviceFacts = getServiceFacts();
		if (!serviceFacts) {
			unitDone('', RELEASE_JOB);
			return;
		}
		const stopReasonNow = stopReasonFor(job);
		stopReasonNow((stopError, stopReason) => {
			if (stopError) {
				unitDone('', { jobStatus: JOB_STATUS.stopped, stopReasonName: 'storeFailed', stopReasonText: reasonOf('storeUnreadable') });
				return;
			}
			if (stopReason) {
				unitDone('', stopReason);
				return;
			}
			// a session of its own, closed before the judge is asked: a judge call takes seconds and no graph session waits on it
			withReadSession((session, sessionDone) => rosettaRetrieval.retrieveCandidates({ session, serviceFacts, queryTextList: [oneField.name, oneField.definition, searchDescriptionText], target: { kind: rosettaRetrieval.hubTargetKind, hubName, tier: TIER_OFFERED }, tokenAccountName: JUDGED_TOKEN_ACCOUNT_NAME, onTokensCharged: (tokenFacts) => jobStore.addEmbeddingTokens({ jobRefId: job.jobRefId, ...tokenFacts }, (tokenError) => (tokenError ? xLog.error(`rosettaJobRunner: job ${job.jobRefId}: the embedding count would not write: ${tokenError}`) : undefined)) }, (poolError, pool) => {
				if (poolError || pool.refusal || pool.status === UNIT_STATUS_NO_CANDIDATE) {
					sessionDone(poolError, { pool });
					return;
				}
				const judgedCandidateList = judgedCandidateListOf({ pool, judgedPoolCap: judgedValues.judgedPoolCap });
				readCandidateCards({ session, hubName, candidateList: judgedCandidateList }, (cardError, candidateCardList) => sessionDone(cardError, { pool, judgedCandidateList, candidateCardList }));
			}), (readError, poolRead) => {
				if (readError) {
					xLog.error(`rosettaJobRunner: job ${job.jobRefId}: a pool could not be read: ${readError}`);
					unitDone('', { jobStatus: JOB_STATUS.stopped, stopReasonName: 'poolUnreadable', stopReasonText: reasonOf('poolUnreadable') });
					return;
				}
				const { pool, judgedCandidateList, candidateCardList } = poolRead;
				if (pool.refusal) {
					// ⟪rosettaLoginPolish review B1⟫ the refusal's own words: retrieval refuses for a ceiling, a vendor or a size as well as the graph, and its reason is
					// already a rosettaReasonWords sentence
					unitDone('', { jobStatus: JOB_STATUS.stopped, stopReasonName: pool.refusal.refusalName, stopReasonText: pool.refusal.reason });
					return;
				}
				// ⟪rosettaMeanings R2⟫ the prompt the unit was judged with goes first, beside the judgment: a unit whose judgment is written is finished, so its prompt must already be there
				const writeUnit = ({ unitStatus, promptHash, judgment, judgedPrompt }, afterWrite) => {
					const writePrompt = (afterPrompt) => (judgedPrompt ? jobStore.writeJudgmentPrompt({ jobRefId: job.jobRefId, fieldIndex, hubName, ...judgedPrompt }, afterPrompt) : afterPrompt(''));
					writePrompt((promptError) => {
						if (promptError) {
							xLog.error(`rosettaJobRunner: job ${job.jobRefId}: a prompt would not write: ${promptError}`);
							unitDone('', { jobStatus: JOB_STATUS.stopped, stopReasonName: 'storeFailed', stopReasonText: reasonOf('storeRefusedPrompt') });
							return;
						}
						jobStore.writeJudgment({ jobRefId: job.jobRefId, fieldIndex, hubName, unitStatus, promptHash, judgment }, (writeError) => {
							if (writeError) {
								xLog.error(`rosettaJobRunner: job ${job.jobRefId}: a judgment would not write: ${writeError}`);
								unitDone('', { jobStatus: JOB_STATUS.stopped, stopReasonName: 'storeFailed', stopReasonText: reasonOf('storeRefusedJudgment') });
								return;
							}
							afterWrite();
						});
					});
				};
				if (pool.status === UNIT_STATUS_NO_CANDIDATE) {
					writeUnit({ unitStatus: UNIT_STATUS_NO_CANDIDATE, judgment: { poolSize: 0, admittedCount: 0, runnerUpList: [] } }, () => unitDone('', null));
					return;
				}
				judgeEngine.judgeFieldAgainstPool({ jobRefId: job.jobRefId, ownerPrincipalRefId: job.ownerPrincipalRefId, ownerPrincipalKind: job.ownerPrincipalKind, fieldIndex, oneField, searchDescriptionText, hubName, candidateCardList, stopReasonNow }, (judgeError, outcome) => {
					if (judgeError) {
						xLog.error(`rosettaJobRunner: job ${job.jobRefId}: judging could not start: ${judgeError}`);
						unitDone('', { jobStatus: JOB_STATUS.stopped, stopReasonName: 'judgeUnavailable', stopReasonText: reasonOf('judgeUnavailable') });
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
					// ⟪P7⟫ the chosen card's hub element by its OWN identifier, read in a session of its own; a read that fails is named in the row, never lost with it
					const withHubElementIdentity = (afterIdentity) => (outcome.chosenCardStableId ? withReadSession((identitySession, identitySessionDone) => hubElementIdentityFor({ runCypher, session: identitySession, cardStableId: outcome.chosenCardStableId, hubName, tierName: TIER_OFFERED }, identitySessionDone), (identityError, hubElementIdentityFields) => {
						if (identityError) {
							xLog.error(`rosettaJobRunner: job ${job.jobRefId}: the chosen card's element would not read: ${identityError}`);
							afterIdentity(absentOf('hubElementUnreadable'));
							return;
						}
						afterIdentity(hubElementIdentityFields);
					}) : afterIdentity(undefined));
					// ⟪P7a⟫ the chosen card as the tuple of elements it names (hubCardTuple), read once here so a fetch stays a store read. A hub whose range is description, not
					// identity, keeps its ranges beside the tuple (rangeList); a datatype range is kept as written. A read that fails is named, and the judgment is still written.
					const withCardTuple = (afterTuple) => (outcome.chosenCardStableId ? withReadSession((tupleSession, tupleSessionDone) => hubCardTupleFor({ runCypher, session: tupleSession, hubName, cardStableId: outcome.chosenCardStableId, uriForElement: serviceFacts.uriMinter.uriForNode }, tupleSessionDone), (tupleError, cardTupleFacts) => {
						if (tupleError) {
							xLog.error(`rosettaJobRunner: job ${job.jobRefId}: the chosen card's tuple would not read: ${tupleError}`);
							afterTuple(tupleAbsentOf('hubCardTupleUnreadable'));
							return;
						}
						afterTuple(cardTupleFieldsOf(cardTupleFacts));
					}) : afterTuple(undefined));
					withEnrichment((alreadyMappedFrom) => withHubElementIdentity((hubElementIdentityFields) => withCardTuple((cardTupleFields) => writeUnit({ unitStatus: outcome.unitStatus, promptHash: outcome.promptHash, judgedPrompt: outcome.judgedPrompt, judgment: unitRowOf({ outcome, pool: { ...pool, candidateList: judgedCandidateList }, alreadyMappedFrom, hubElementIdentityFields, cardTupleFields }) }, () => unitDone('', null)))));
				});
			});
		});
	};

	const runJob = (job, jobDone) => {
		const serviceFacts = getServiceFacts();
		const finishWith = (stopReason) => finishJob({ job, stopReason }, jobDone);
		// the facts were there at the tick and went while the queue was read: nothing has begun, and the next tick asks again
		if (!serviceFacts) {
			jobDone();
			return;
		}
		if (!judgeEngine) {
			xLog.error(`rosettaJobRunner: job ${job.jobRefId}: there is no judge: ${judgeAbsentReason}`);
			finishWith({ jobStatus: JOB_STATUS.stopped, stopReasonName: 'judgeNotConfigured', stopReasonText: reasonOf('judgeAbsentStop') });
			return;
		}
		if (serviceFacts.passport.manifestRefId !== job.answeredFrom.manifestRefId) {
			finishWith(manifestChangedStop({ job, serviceFacts }));
			return;
		}
		jobStore.markJobRunning({ jobRefId: job.jobRefId, startedAtMs: nowMs() }, (statusError, hasBegun) => {
			if (statusError || !hasBegun) {
				if (statusError) {
					xLog.error(`rosettaJobRunner: job ${job.jobRefId} would not start: ${statusError}`);
				}
				jobDone();
				return;
			}
			jobStore.readSubmission(job.jobRefId, (submissionError, submission) => {
				if (submissionError || !submission) {
					finishWith({ jobStatus: JOB_STATUS.stopped, stopReasonName: 'storeFailed', stopReasonText: reasonOf('submissionUnreadable') });
					return;
				}
				// ⟪rosettaSearchDescription⟫ the bare fields' search descriptions, written once when the job first runs and read back on a resume. Each unit searches with it, and
				// (TQ Q110) the judge is shown it on its own labelled line beside oneField, which stays exactly as the person sent it. It draws on its owner's pot (review S3).
				// A describer that is off, busy or over its ceiling names that per field, once, and the job goes on.
				const withDescribedList = (useDescribedList) => jobStore.readSearchDescribedList(job.jobRefId, (describedReadError, storedDescribedList) => {
					if (describedReadError) {
						finishWith({ jobStatus: JOB_STATUS.stopped, stopReasonName: 'storeFailed', stopReasonText: reasonOf('submissionUnreadable') });
						return;
					}
					if (storedDescribedList) {
						useDescribedList(storedDescribedList);
						return;
					}
					rosettaRetrieval.searchDescriber.describeFieldList({ fieldList: submission.fieldList, isAnonymous: job.ownerPrincipalKind === ANONYMOUS_PRINCIPAL_KIND }, (unusedDescribeError, described) => jobStore.writeSearchDescribedList({ jobRefId: job.jobRefId, describedList: described.describedList }, (describedWriteError) => {
						if (describedWriteError) {
							finishWith({ jobStatus: JOB_STATUS.stopped, stopReasonName: 'storeFailed', stopReasonText: reasonOf('storeRefusedSearchDescriptions') });
							return;
						}
						useDescribedList(described.describedList);
					}));
				});
				withDescribedList((describedList) => jobStore.judgedUnitNameSet(job.jobRefId, (doneError, finishedUnitNameSet) => {
					if (doneError) {
						finishWith({ jobStatus: JOB_STATUS.stopped, stopReasonName: 'storeFailed', stopReasonText: reasonOf('finishedUnitsUnreadable') });
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
						const described = describedList[fieldIndex];
						runUnit({ job, oneField: submission.fieldList[fieldIndex], searchDescriptionText: described && described.searchDescription ? described.searchDescription.descriptionText : undefined, fieldIndex, hubName }, (unusedError, stopReason) => {
							if (stopReason === RELEASE_JOB) {
								jobDone();
								return;
							}
							if (stopReason) {
								finishWith(stopReason);
								return;
							}
							setImmediate(() => runNextUnit(unitIndex + 1));
						});
					};
					runNextUnit(0);
				}));
			});
		});
	};

	// ⟪rosettaMeanings R3, TQ Q86⟫ TWO LANES, each with its own cap: anonymous jobs run beside signed-in ones, never in their slots. A lane is DATA: its cap's setting and which jobs are its own.
	const runnerLaneList = RUNNER_LANE_LIST.map((oneLane) => ({ ...oneLane, activeJobCount: 0 }));
	// running ones first, so a restart resumes before anything new begins
	const tick = () => {
		if (!getServiceFacts()) {
			return;
		}
		runnerLaneList.forEach(tickLane);
	};
	const tickLane = (runnerLane) => {
		if (runnerLane.activeJobCount >= judgedValues[runnerLane.maxRunningSettingName]) {
			return;
		}
		const isLaneJob = (oneJob) => runnerLane.isAnonymousLane === (oneJob.ownerPrincipalKind === ANONYMOUS_PRINCIPAL_KIND);
		runnerLane.activeJobCount += 1;
		activeJobCount += 1;
		const letGoOfSlot = () => {
			runnerLane.activeJobCount -= 1;
			activeJobCount -= 1;
		};
		const released = () => {
			letGoOfSlot();
			setImmediate(tick);
		};
		// defined before the first read, which can answer at once (a closed store errs synchronously)
		const startNextJob = () => jobStore.readJobList({ statusList: [JOB_STATUS.running] }, (runningError, runningJobList) => {
			if (runningError) {
				xLog.error(`rosettaJobRunner: the queue would not read: ${runningError}`);
				letGoOfSlot();
				return;
			}
			const heldRefIdSet = heldJobRefIdSet;
			const resumable = runningJobList.filter(isLaneJob).find((oneJob) => !heldRefIdSet.has(oneJob.jobRefId));
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
					letGoOfSlot();
					return;
				}
				const nextQueuedJob = queuedJobList.filter(isLaneJob).find((oneJob) => !heldRefIdSet.has(oneJob.jobRefId));
				if (!nextQueuedJob) {
					letGoOfSlot();
					return;
				}
				startJob(nextQueuedJob);
			});
		});
		jobStore.readJobList({ statusList: ['cancelling'] }, (cancellingError, cancellingJobList) => {
			// told to stop, and no unit will ever read that: nobody holds it. It would keep its owner's one slot and its estimate for ever.
			const unheldCancelling = cancellingError ? undefined : cancellingJobList.filter(isLaneJob).find((oneJob) => !heldJobRefIdSet.has(oneJob.jobRefId));
			if (unheldCancelling) {
				heldJobRefIdSet.add(unheldCancelling.jobRefId);
				finishJob({ job: unheldCancelling, stopReason: { jobStatus: JOB_STATUS.cancelled, stopReasonName: 'cancelledByOwner', stopReasonText: reasonOf('cancelledByOwner') } }, () => {
					heldJobRefIdSet.delete(unheldCancelling.jobRefId);
					released();
				});
				return;
			}
			startNextJob();
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
	const withFreshJob = (useJob) => jobStore.readJob(job.jobRefId, (readError, currentJob) => (readError ? done(readError) : useJob(currentJob)));
	withFreshJob((freshJob) => jobStore.judgeCallTotalsOf(job.jobRefId, (totalsError, totalsRowList) => {
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
				embeddingSpendRecordList: freshJob.embeddingTextCount + freshJob.embeddingCachedCount > 0 ? [{ provider: EMBEDDING_PROVIDER_NAME, model: freshJob.answeredFrom.embeddingModelVersion, texts: freshJob.embeddingTextCount + freshJob.embeddingCachedCount, distinctMisses: freshJob.embeddingTextCount, servedFromCache: freshJob.embeddingCachedCount, tokens: freshJob.embeddingTokens, latencyMs: 0 }] : [],
				spendPricer: judgeEngine.spendPricer,
			});
			if (ledgerMade.error) {
				done(ledgerMade.error);
				return;
			}
			spendLedgerLib.appendLifetimeSpendLedger({ lifetimeLedgerFilePath: judgedValues.spendLedgerFilePath, spendLedger: ledgerMade.spendLedger }, (appendError) => done(appendError || ''));
		});
	}));
};

module.exports = { cardTupleFieldsOf, createRosettaJobRunner, spendLedgerWriterFor, readCandidateCardsFor, judgedCandidateListOf, OPEN_STATUS_LIST };
