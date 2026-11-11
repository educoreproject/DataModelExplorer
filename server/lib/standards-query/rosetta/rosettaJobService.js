'use strict';

// rosettaJobService — submit, status, fetch and cancel, for every door (design 4.2, 4.8, section 5). The fuse's admission half is here; its running half is rosettaJobRunner's. Every answer is { answer } or { answer: refusal }; only a broken store is an error.
//
//   createRosettaJobService({ jobStore, judgeEngine, judgeAbsentReason, judgedValues, parserLimitValues, hubRowListFor, tickRunner, nowMs }) → { submit, status, fetch, cancel }
//   each: ({ principal, input, serviceFacts, withReadSession, answeredFrom, pageNumber, pageSize, rowDetail, namedSubjectList, answerNoteValues }, done(errText, { answer, retryAfterSeconds? }))
//
// OWNERSHIP. A job belongs to the users.refId behind the credential, whichever door it came through. Anyone else asking gets notFound, the same answer as no such job, so a guess learns nothing (design 4.8). jobRefId is 128 random bits.
// ⟪rosettaMeanings R3⟫ A job submitted without signing in belongs to its visitorRefId, and is reached by its jobRefId alone: whoever holds that link reads it, its price included.
// PRICE. The owner sees the estimate at submit and spentUsd after it, being the one spending (for an anonymous job, whoever holds its link). No other answer names a price, and neither does about.
// SUBMISSIONS TAKE TURNS. Admission reads several sums and then writes: two submissions at once could each pass on the room for one, so they run one after another here, in this process, the only writer.

const crypto = require('crypto');
const { SUBMISSION_FORM_LIST } = require('./rosettaRetrieval');
const { OPEN_STATUS_LIST } = require('./rosettaJobStore');
const { reportOf, usingOf, ownerJobFactsOf } = require('./rosettaReport');
const { judgedSettings } = require('./rosettaJudgeEngine');

const MILLISECONDS_PER_DAY = 86400000;
const JOB_REF_ID_BYTES = 16;
const BYTES_PER_TOKEN_ESTIMATE = 4;
const OMITTED_COUNT_NAME_LIST = Object.freeze(['unresolvedRefOmittedCount', 'unresolvedContextOmittedCount', 'notWalkedOmittedCount']);
const JOB_REF_ID_PATTERN = /^[0-9a-f]{32}$/;
// what a cancel did, by what it found: running told to stop, queued ended, or it arrived after the job had already finished
const cancelNoteOf = ({ wasChanged, status }) => {
	if (!wasChanged) {
		return 'the job had already finished when this arrived; what it did stays fetchable';
	}
	return status === 'cancelling' ? 'it stops at the next field; a judge call already sent is finished and recorded, and what is finished stays fetchable' : 'it had not begun; nothing was spent';
};
const refusalOf = (refusedByName, refusalName, reason, extraFields = {}) => ({ refusedByName, refusalName, reason, ...extraFields });
const roundedUsdOf = (usd) => Number(usd.toFixed(4));

const PATH_IN_REASON_PATTERN = /\/[^\s'"`,;:)]+/g; // the reason is an answer to a stranger; the whole of it is in the log
const MILLISECONDS_PER_MINUTE = 60000;
// each job action's operation, for a refusal the cap gives before the action runs (the registry rows' jobActionName, read back)
const OPERATION_NAME_BY_JOB_ACTION_NAME = Object.freeze(require('../standardsQueryOperations.json').operationList.filter((oneRow) => oneRow.jobActionName).reduce((soFar, oneRow) => ({ ...soFar, [oneRow.jobActionName]: oneRow.operationName }), {}));
const { ANONYMOUS_PRINCIPAL_KIND } = require('../admitRequest');
const ANONYMOUS_KIND_FILTER = Object.freeze({ ownerPrincipalKindList: [ANONYMOUS_PRINCIPAL_KIND] });
const SIGNED_IN_KIND_FILTER = Object.freeze({ exceptOwnerPrincipalKindList: [ANONYMOUS_PRINCIPAL_KIND] });
const TEMPLATE_SLOT_PATTERN = /\{([A-Za-z]+)\}/g;
// a reason from the settings' data with its {slots} filled; a slot with no value is a fault of this service, said by name rather than shown as braces
const templateFilled = (templateText, valueBySlotName) => templateText.replace(TEMPLATE_SLOT_PATTERN, (wholeSlot, slotName) => {
	if (valueBySlotName[slotName] === undefined) {
		throw new Error(`rosettaJobService: the reason '${templateText}' names {${slotName}}, which was not given`);
	}
	return String(valueBySlotName[slotName]);
});
const anonymousReasonOf = (refusalName, valueBySlotName) => templateFilled(judgedSettings.anonymousRefusalReasonByName[refusalName], valueBySlotName);
// ⟪rosettaMeanings R3, review S2⟫ who owns a job: a person by their users.refId; a visitor who is not signed in by visitorRefId, an HMAC of the address keyed by a
// secret from config (assembleRosettaJudged reads it), so the stored value cannot be turned back into the address by hashing every address
const visitorRefIdOf = ({ visitorAddress, visitorSecret }) => crypto.createHmac('sha256', visitorSecret).update(String(visitorAddress)).digest('hex');
// an anonymous job is reached by its link, its 128-bit jobRefId, by anyone who holds it; a signed-in job only by its owner
const mayReadJob = ({ job, principal }) => job.ownerPrincipalKind === ANONYMOUS_PRINCIPAL_KIND || (principal.kind !== ANONYMOUS_PRINCIPAL_KIND && job.ownerPrincipalRefId === principal.userRefId);

const createRosettaJobService = ({ jobStore, judgeEngine, judgeAbsentReason, judgedValues, visitorSecret, parserLimitValues, hubRowListFor, judgedTokensSpentToday, tickRunner, nowMs }) => {
	const ownerRefIdOf = (principal) => (principal.kind === ANONYMOUS_PRINCIPAL_KIND ? visitorRefIdOf({ visitorAddress: principal.visitorAddress, visitorSecret }) : principal.userRefId);
	const refusalJudgedAnswer = (operationName, refusalName, reason, extraFields) => ({ answer: refusalOf(operationName, refusalName, reason, extraFields) });

	let isAdmitting = false;
	const waitingAdmissionList = [];
	const inTurn = (admit, done) => {
		const finished = (...answerList) => {
			isAdmitting = false;
			done(...answerList);
			const nextInLine = waitingAdmissionList.shift();
			if (nextInLine) {
				nextInLine();
			}
		};
		const begin = () => {
			isAdmitting = true;
			admit(finished);
		};
		if (isAdmitting) {
			waitingAdmissionList.push(begin);
			return;
		}
		begin();
	};

	const ownedJobOr = ({ operationName, principal, input }, withJob, done) => {
		const notFound = () => done('', refusalJudgedAnswer(operationName, 'notFound', 'there is no such job for this account'));
		if (typeof input.jobRefId !== 'string' || !JOB_REF_ID_PATTERN.test(input.jobRefId)) {
			notFound();
			return;
		}
		jobStore.readJob(input.jobRefId, (readError, job) => {
			if (readError) {
				done(`the job store would not read: ${readError}`);
				return;
			}
			if (!job || !mayReadJob({ job, principal })) {
				notFound();
				return;
			}
			withJob(job);
		});
	};

	// the checks that read the store, in the order a person would want told: their own open job, the queue, then money
	const admissionRefusalFor = ({ principal, estimateUsd, estimatedTokens }, done) => {
		const operationName = 'rosettaSubmit';
		const isAnonymous = principal.kind === ANONYMOUS_PRINCIPAL_KIND;
		const ownerRefId = ownerRefIdOf(principal);
		judgedTokensSpentToday((tokenError, tokensSpent) => {
			if (tokenError) {
				done(tokenError);
				return;
			}
			if (tokensSpent + estimatedTokens > judgedValues.judgedDailyTokenCeiling) {
				done('', refusalJudgedAnswer(operationName, 'judgedTokenCeilingReached', 'today\'s tokens for judged jobs are spent. It resets at midnight UTC. Retrieval keeps working.'));
				return;
			}
			afterTokenCheck();
		});
		const afterTokenCheck = () => {
		if (estimateUsd > judgedValues.perJobCeilingUsd) {
			done('', refusalJudgedAnswer(operationName, 'perJobCeilingReached', `a job of this size is more than one job may spend; send fewer fields or fewer hubs. At most ${judgedValues.judgedMaxFieldListLength} fields a job.`));
			return;
		}
		// ⟪rosettaMeanings R3⟫ a visitor's allowance in the window comes before everything a signed-in person is also asked: it is the visitor's own limit
		const withVisitorAllowance = (afterAllowance) => {
			if (!isAnonymous) {
				afterAllowance();
				return;
			}
			jobStore.jobCountSince({ ownerPrincipalRefId: ownerRefId, sinceMs: nowMs() - judgedValues.anonymousVisitorWindowMinutes * MILLISECONDS_PER_MINUTE }, (windowError, windowJobCount) => {
				if (windowError) {
					done(windowError);
					return;
				}
				if (windowJobCount >= judgedValues.anonymousJobsPerVisitorWindow) {
					done('', refusalJudgedAnswer(operationName, 'anonymousVisitorJobLimitReached', anonymousReasonOf('anonymousVisitorJobLimitReached', { jobLimit: judgedValues.anonymousJobsPerVisitorWindow, windowMinutes: judgedValues.anonymousVisitorWindowMinutes })));
					return;
				}
				afterAllowance();
			});
		};
		withVisitorAllowance(() => jobStore.openJobCountOf(ownerRefId, (ownerError, openCount) => {
			if (ownerError) {
				done(ownerError);
				return;
			}
			if (isAnonymous && openCount >= judgedValues.anonymousJobsOpenPerVisitor) {
				done('', refusalJudgedAnswer(operationName, 'anonymousVisitorHasOpenJob', anonymousReasonOf('anonymousVisitorHasOpenJob', { openCount })));
				return;
			}
			if (!isAnonymous && openCount >= judgedValues.perPrincipalJobsOpen) {
				done('', refusalJudgedAnswer(operationName, 'principalHasOpenJob', `this account has ${openCount} job open, the most it may have; wait for it, or cancel it with rosetta_cancel`));
				return;
			}
			// each kind waits in its own queue: anonymous jobs can never fill the signed-in one
			jobStore.statusCountOf(['queued'], isAnonymous ? ANONYMOUS_KIND_FILTER : SIGNED_IN_KIND_FILTER, (queueError, queuedCount) => {
				if (queueError) {
					done(queueError);
					return;
				}
				if (isAnonymous && queuedCount >= judgedValues.anonymousMaxQueuedJobs) {
					done('', refusalJudgedAnswer(operationName, 'anonymousQueueFull', anonymousReasonOf('anonymousQueueFull', { queuedCount }), { lastQueuedPosition: queuedCount }));
					return;
				}
				if (!isAnonymous && queuedCount >= judgedValues.maxQueuedJobs) {
					done('', refusalJudgedAnswer(operationName, 'queueFull', `${queuedCount} jobs are waiting, the most the queue holds; try again later`, { lastQueuedPosition: queuedCount }));
					return;
				}
				const sinceMs = nowMs() - MILLISECONDS_PER_DAY;
				// ⟪rosettaMeanings review S1⟫ separate pots: the service-wide ceiling counts signed-in judging only, and anonymous judging has its own ceiling below; a visitor never spends the signed-in day
				const withServiceCeiling = (afterServiceCeiling) => (isAnonymous ? afterServiceCeiling() : jobStore.rollingSpendUsd({ sinceMs, ...SIGNED_IN_KIND_FILTER }, (dayError, daySpentUsd) => {
					if (dayError) {
						done(dayError);
						return;
					}
					jobStore.sumOpenEstimatesUsd(SIGNED_IN_KIND_FILTER, (openError, openEstimatesUsd) => {
						if (openError) {
							done(openError);
							return;
						}
						if (daySpentUsd + openEstimatesUsd + estimateUsd > judgedValues.dailyJudgeCeilingUsd) {
							done('', refusalJudgedAnswer(operationName, 'dailyCeilingReached', 'this service has reached the most it judges in any 24 hours, counting what is already queued; retrieval keeps working, and this will open again as the day rolls on'));
							return;
						}
						afterServiceCeiling();
					});
				}));
				withServiceCeiling(() => {
						// ⟪rosettaMeanings R3⟫ anonymous judging has its own 24 hours, counting what anonymous jobs spent, what their open jobs may still spend, and this one
						const withAnonymousCeiling = (afterCeiling) => {
							if (!isAnonymous) {
								afterCeiling();
								return;
							}
							jobStore.rollingSpendUsd({ sinceMs, ...ANONYMOUS_KIND_FILTER }, (anonymousSpendError, anonymousSpentUsd) => {
								if (anonymousSpendError) {
									done(anonymousSpendError);
									return;
								}
								jobStore.sumOpenEstimatesUsd(ANONYMOUS_KIND_FILTER, (anonymousOpenError, anonymousOpenUsd) => {
									if (anonymousOpenError) {
										done(anonymousOpenError);
										return;
									}
									if (anonymousSpentUsd + anonymousOpenUsd + estimateUsd > judgedValues.anonymousDailyCeilingUsd) {
										done('', refusalJudgedAnswer(operationName, 'anonymousDailyCeilingReached', anonymousReasonOf('anonymousDailyCeilingReached', {})));
										return;
									}
									afterCeiling();
								});
							});
						};
						withAnonymousCeiling(() => jobStore.rollingSpendUsd({ sinceMs, ownerPrincipalRefId: ownerRefId }, (ownerSpendError, ownerSpentUsd) => {
							if (ownerSpendError) {
								done(ownerSpendError);
								return;
							}
							// ⟪rosettaMeanings review S4⟫ one address's share of the anonymous day is its own setting, so no single address can take the whole anonymous pot
							if (isAnonymous && ownerSpentUsd + estimateUsd > judgedValues.anonymousPerVisitorDailyUsd) {
								done('', refusalJudgedAnswer(operationName, 'anonymousVisitorDailyCeilingReached', anonymousReasonOf('anonymousVisitorDailyCeilingReached', {})));
								return;
							}
							if (!isAnonymous && ownerSpentUsd + estimateUsd > judgedValues.perPrincipalDailyUsd) {
								done('', refusalJudgedAnswer(operationName, 'perPrincipalCeilingReached', 'this account has reached the most one person may judge in any 24 hours; retrieval keeps working'));
								return;
							}
							done('', { queuedCount });
						}));
				});
			});
		}));
		};
	};

	const submit = ({ principal, input, serviceFacts, withReadSession, answeredFrom, namedSubjectList }, done) => {
		const operationName = 'rosettaSubmit';
		if (!judgeEngine) {
			done('', refusalJudgedAnswer(operationName, 'judgeNotConfigured', `the judged step is off on this instance: ${String(judgeAbsentReason).replace(PATH_IN_REASON_PATTERN, '<path>')}. Retrieval keeps working.`));
			return;
		}
		const formList = SUBMISSION_FORM_LIST.filter((oneForm) => input[oneForm.inputName] !== undefined);
		if (formList.length !== 1) {
			done('', refusalJudgedAnswer(operationName, 'noSubmission', `give exactly one of ${SUBMISSION_FORM_LIST.map((oneForm) => oneForm.inputName).join(', ')}; this request gives ${formList.length}`, { validValueList: SUBMISSION_FORM_LIST.map((oneForm) => oneForm.inputName) }));
			return;
		}
		const [submissionForm] = formList;
		const isAnonymous = principal.kind === ANONYMOUS_PRINCIPAL_KIND;
		const parsed = submissionForm.parser({ submittedDocument: input[submissionForm.inputName], parserLimitValues: { ...parserLimitValues, maxFieldListLength: isAnonymous ? judgedValues.anonymousMaxFieldListLength : judgedValues.judgedMaxFieldListLength } });
		if (parsed.refusal) {
			const { refusalName, reason, ...extraFields } = parsed.refusal;
			done('', refusalJudgedAnswer(operationName, refusalName, reason, extraFields));
			return;
		}
		hubRowListFor({ withReadSession, serviceFacts }, (hubError, hubRowList) => {
			if (hubError) {
				done(hubError);
				return;
			}
			const validHubNameList = hubRowList.map((oneHub) => oneHub.hubName);
			if (input.hubList !== undefined && (input.hubList.length === 0 || input.hubList.some((hubName) => !validHubNameList.includes(hubName)))) {
				done('', refusalJudgedAnswer(operationName, 'unknownHub', 'hubList must name hubs this graph holds, or be left out for every hub', { validValueList: validHubNameList }));
				return;
			}
			const hubNameList = input.hubList ? validHubNameList.filter((hubName) => input.hubList.includes(hubName)) : validHubNameList;
			const unjudgedHubName = hubNameList.find((hubName) => judgeEngine.hubFactsFor(hubName).refusalText);
			if (unjudgedHubName) {
				done('', refusalJudgedAnswer(operationName, 'hubNotJudged', `the judged step cannot read hub ${unjudgedHubName} on this instance`, { validValueList: Object.keys(judgedSettings.hubRowByName) }));
				return;
			}
			const estimateUsd = roundedUsdOf(parsed.fieldList.length * hubNameList.length * judgedValues.judgeUsdPerFieldEstimate);
			// an upper bound, since a text the cache holds costs nothing: refused here rather than accepted and stopped at its first field
			const estimatedTokens = Math.ceil(parsed.fieldList.reduce((soFar, oneField) => soFar + Buffer.byteLength(oneField.name) + Buffer.byteLength(oneField.definition || ''), 0) / BYTES_PER_TOKEN_ESTIMATE);
			inTurn((finished) => admissionRefusalFor({ principal, estimateUsd, estimatedTokens }, (admitError, admission) => {
				if (admitError) {
					finished(`the job store would not read: ${admitError}`);
					return;
				}
				if (admission.answer) {
					finished('', admission);
					return;
				}
				const jobRefId = crypto.randomBytes(JOB_REF_ID_BYTES).toString('hex');
				jobStore.addJob({
					jobRefId,
					ownerPrincipalKind: principal.kind,
					ownerPrincipalRefId: ownerRefIdOf(principal),
					formatName: submissionForm.formatName,
					byteSize: Buffer.byteLength(JSON.stringify(input[submissionForm.inputName])),
					fieldList: parsed.fieldList,
					hubNameList,
					submissionNote: { unresolvedRefList: parsed.unresolvedRefList, unresolvedContextList: parsed.unresolvedContextList, notWalkedList: parsed.notWalkedList, ...OMITTED_COUNT_NAME_LIST.reduce((soFar, countName) => (parsed[countName] ? { ...soFar, [countName]: parsed[countName] } : soFar), {}) },
					expiresAtMs: nowMs() + (isAnonymous ? judgedValues.anonymousJobRetentionDays : judgedValues.jobRetentionDays) * MILLISECONDS_PER_DAY,
					estimateUsd,
					answeredFrom,
					judgeFacts: judgeEngine.judgeFacts,
				}, (addError) => {
					if (addError) {
						finished(`the job store would not take the job: ${addError}`);
						return;
					}
					hubNameList.forEach((hubName) => namedSubjectList.push({ subjectKind: 'hub', subjectText: hubName }));
					finished('', { answer: { jobRefId, status: 'queued', position: admission.queuedCount + 1, fieldCount: parsed.fieldList.length, hubList: hubNameList, estimateUsd, ...(parsed.unresolvedRefList.length || parsed.unresolvedContextList.length ? { unresolvedRefList: parsed.unresolvedRefList, unresolvedContextList: parsed.unresolvedContextList } : {}) } });
					tickRunner();
				});
			}), done);
		});
	};

	const status = ({ principal, input }, done) => ownedJobOr({ operationName: 'rosettaStatus', principal, input }, (job) => jobStore.jobSpendUsd(job.jobRefId, (spendError, spentUsd) => {
		if (spendError) {
			done(`the job store would not read: ${spendError}`);
			return;
		}
		jobStore.readJudgmentList(job.jobRefId, (judgmentError, judgmentRowList) => {
			if (judgmentError) {
				done(`the job store would not read: ${judgmentError}`);
				return;
			}
			jobStore.readJobList({ statusList: ['queued'] }, (queueError, queuedJobList) => {
				if (queueError) {
					done(`the job store would not read: ${queueError}`);
					return;
				}
				const positionIndex = queuedJobList.findIndex((oneJob) => oneJob.jobRefId === job.jobRefId);
				done('', { answer: { ...ownerJobFactsOf({ job, spentUsd, unitsFinished: judgmentRowList.length }), ...(positionIndex === -1 ? {} : { position: positionIndex + 1 }) } });
			});
		});
	}), done);

	// ⟪P7a⟫ the answer, and the using block the core puts in answeredFrom: the judge, what this job spent, and whether every judgment came from the cache (no vendor call at all)
	const fetch = ({ principal, input, pageNumber, pageSize, rowDetail, detail, answeredFrom, answerNoteValues }, done) => ownedJobOr({ operationName: 'rosettaFetch', principal, input }, (job) => jobStore.jobSpendUsd(job.jobRefId, (spendError, spentUsd) => {
		if (spendError) {
			done(`the job store would not read: ${spendError}`);
			return;
		}
		jobStore.readSubmission(job.jobRefId, (submissionError, submission) => {
			if (submissionError || !submission) {
				done(`the job store would not read: ${submissionError || 'no submission'}`);
				return;
			}
			jobStore.readJudgmentList(job.jobRefId, (judgmentError, judgmentRowList) => {
				if (judgmentError) {
					done(`the job store would not read: ${judgmentError}`);
					return;
				}
				jobStore.judgeCallTotalsOf(job.jobRefId, (callTotalsError, callTotalsRowList) => {
					if (callTotalsError) {
						done(`the job store would not read: ${callTotalsError}`);
						return;
					}
					const judgeCallCount = callTotalsRowList.reduce((soFar, oneRow) => soFar + oneRow.callCount, 0);
					done('', {
						answer: reportOf({ job, submission, judgmentRowList, spentUsd, answerNoteValues, pageNumber, pageSize, rowDetail, detail, answeredFromNow: answeredFrom }),
						answeredFromAddition: { using: usingOf({ job, spentUsd, judgmentRowList, judgeCallCount, detail }) },
					});
				});
			});
		});
	}), done);

	// ⟪rosettaMeanings R2⟫ the exact prompt each unit was judged with, a page at a time, for whoever may read the job. A unit judged with no prompt (an identifier in the text, no candidate) has no row.
	const prompts = ({ principal, input, pageNumber }, done) => ownedJobOr({ operationName: 'rosettaPrompts', principal, input }, (job) => jobStore.readSubmission(job.jobRefId, (submissionError, submission) => {
		if (submissionError || !submission) {
			done(`the job store would not read: ${submissionError || 'no submission'}`);
			return;
		}
		jobStore.readPromptList(job.jobRefId, (promptError, promptRowList) => {
			if (promptError) {
				done(`the job store would not read: ${promptError}`);
				return;
			}
			const pageSize = judgedValues.promptPageSize;
			const pageCount = Math.max(1, Math.ceil(promptRowList.length / pageSize));
			const pageRowList = promptRowList.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
			done('', { answer: { jobRefId: job.jobRefId, page: pageNumber, pageCount, promptCount: promptRowList.length, promptList: pageRowList.map((oneRow) => ({ requestName: submission.fieldList[oneRow.fieldIndex].name, hub: oneRow.hubName, systemPrompt: oneRow.systemPrompt, userPrompt: oneRow.userPrompt })) } });
		});
	}), done);

	const cancel = ({ principal, input }, done) => ownedJobOr({ operationName: 'rosettaCancel', principal, input }, (job) => {
		if (!['queued', 'running'].includes(job.status)) {
			done('', refusalJudgedAnswer('rosettaCancel', 'jobNotOpen', `this job is ${job.status}; there is nothing to cancel, and whatever it finished stays fetchable`, { status: job.status }));
			return;
		}
		jobStore.requestCancel(job.jobRefId, (cancelError, wasChanged) => {
			if (cancelError) {
				done(`the job store would not write: ${cancelError}`);
				return;
			}
			jobStore.readJob(job.jobRefId, (readError, currentJob) => (readError ? done(`the job store would not read: ${readError}`) : done('', { answer: { jobRefId: job.jobRefId, status: currentJob.status, cancelNote: cancelNoteOf({ wasChanged, status: currentJob.status }) } })));
		});
	}, done);

	// ⟪rosettaMeanings R3⟫ THE JOB ROWS' OWN IN-FLIGHT CAP (their registry rows say holdsOwnInFlightCap, so the core neither counts them nor lets them take a slot): a
	// submission waits its turn for admission, and a crowd of them must never hold the slots every other query needs. Past the cap, refused by name, to retry.
	// ⟪rosettaMeanings review S5⟫ one counter for each kind of caller, each its own setting, so a crowd of visitors can never make a signed-in person busy
	const capLaneList = [
		{ isAnonymousLane: false, maxInFlightSettingName: 'jobServiceMaxInFlight', inFlightCount: 0 },
		{ isAnonymousLane: true, maxInFlightSettingName: 'anonymousJobServiceMaxInFlight', inFlightCount: 0 },
	];
	const withinOwnCap = (actionName, action) => (actionArgs, done) => {
		const capLane = capLaneList.find((oneLane) => oneLane.isAnonymousLane === (actionArgs.principal.kind === ANONYMOUS_PRINCIPAL_KIND));
		if (capLane.inFlightCount >= judgedValues[capLane.maxInFlightSettingName]) {
			const busyReason = templateFilled(judgedSettings.jobServiceBusyReason, { inFlightCount: capLane.inFlightCount, retryAfterSeconds: judgedValues.jobServiceBusyRetrySeconds });
			done('', { ...refusalJudgedAnswer(OPERATION_NAME_BY_JOB_ACTION_NAME[actionName], 'jobServiceBusy', busyReason), retryAfterSeconds: judgedValues.jobServiceBusyRetrySeconds });
			return;
		}
		capLane.inFlightCount += 1;
		action(actionArgs, (...resultList) => {
			capLane.inFlightCount -= 1;
			done(...resultList);
		});
	};
	const actionByName = { submit, status, fetch, cancel, prompts };
	return Object.keys(actionByName).reduce((soFar, actionName) => ({ ...soFar, [actionName]: withinOwnCap(actionName, actionByName[actionName]) }), {});
};

module.exports = { createRosettaJobService, OPEN_STATUS_LIST };
