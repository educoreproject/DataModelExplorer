'use strict';

// rosettaJobService — submit, status, fetch and cancel, for every door (design 4.2, 4.8, section 5). The fuse's admission half is here; its running half is rosettaJobRunner's. Every answer is { answer } or { answer: refusal }; only a broken store is an error.
//
//   createRosettaJobService({ jobStore, judgeEngine, judgeAbsentReason, judgedValues, parserLimitValues, hubRowListFor, tickRunner, nowMs }) → { submit, status, fetch, cancel }
//   each: ({ principal, input, serviceFacts, withReadSession, answeredFrom, pageNumber, pageSize, rowDetail, namedSubjectList, answerNoteValues }, done(errText, { answer, retryAfterSeconds? }))
//
// OWNERSHIP. A job belongs to the users.refId behind the credential, whichever door it came through. Anyone else asking gets notFound, the same answer as no such job, so a guess learns nothing (design 4.8). jobRefId is 128 random bits.
// PRICE. The owner sees the estimate at submit and spentUsd after it, being the one spending. No other answer names a price, and neither does about.
// SUBMISSIONS TAKE TURNS. Admission reads several sums and then writes: two submissions at once could each pass on the room for one, so they run one after another here, in this process, the only writer.

const crypto = require('crypto');
const { SUBMISSION_FORM_LIST } = require('./rosettaRetrieval');
const { OPEN_STATUS_LIST } = require('./rosettaJobStore');
const { reportOf, ownerJobFactsOf } = require('./rosettaReport');
const { judgedSettings } = require('./rosettaJudgeEngine');

const MILLISECONDS_PER_DAY = 86400000;
const JOB_REF_ID_BYTES = 16;
const JOB_REF_ID_PATTERN = /^[0-9a-f]{32}$/;
const refusalOf = (refusedByName, refusalName, reason, extraFields = {}) => ({ refusedByName, refusalName, reason, ...extraFields });
const roundedUsdOf = (usd) => Number(usd.toFixed(4));

const createRosettaJobService = ({ jobStore, judgeEngine, judgeAbsentReason, judgedValues, parserLimitValues, hubRowListFor, tickRunner, nowMs }) => {
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
			if (!job || job.ownerPrincipalRefId !== principal.userRefId) {
				notFound();
				return;
			}
			withJob(job);
		});
	};

	// the checks that read the store, in the order a person would want told: their own open job, the queue, then money
	const admissionRefusalFor = ({ principal, estimateUsd }, done) => {
		const operationName = 'rosettaSubmit';
		if (estimateUsd > judgedValues.perJobCeilingUsd) {
			done('', refusalJudgedAnswer(operationName, 'perJobCeilingReached', `a job of this size is more than one job may spend; send fewer fields or fewer hubs. At most ${judgedValues.judgedMaxFieldListLength} fields a job.`));
			return;
		}
		jobStore.openJobCountOf(principal.userRefId, (ownerError, openCount) => {
			if (ownerError) {
				done(ownerError);
				return;
			}
			if (openCount >= judgedValues.perPrincipalJobsOpen) {
				done('', refusalJudgedAnswer(operationName, 'principalHasOpenJob', `this account has ${openCount} job open, the most it may have; wait for it, or cancel it with rosetta_cancel`));
				return;
			}
			jobStore.statusCountOf(['queued'], (queueError, queuedCount) => {
				if (queueError) {
					done(queueError);
					return;
				}
				if (queuedCount >= judgedValues.maxQueuedJobs) {
					done('', refusalJudgedAnswer(operationName, 'queueFull', `${queuedCount} jobs are waiting, the most the queue holds; try again later`, { lastQueuedPosition: queuedCount }));
					return;
				}
				const sinceMs = nowMs() - MILLISECONDS_PER_DAY;
				jobStore.rollingSpendUsd({ sinceMs }, (dayError, daySpentUsd) => {
					if (dayError) {
						done(dayError);
						return;
					}
					jobStore.sumOpenEstimatesUsd((openError, openEstimatesUsd) => {
						if (openError) {
							done(openError);
							return;
						}
						if (daySpentUsd + openEstimatesUsd + estimateUsd > judgedValues.dailyJudgeCeilingUsd) {
							done('', refusalJudgedAnswer(operationName, 'dailyCeilingReached', 'this service has reached the most it judges in any 24 hours, counting what is already queued; retrieval keeps working, and this will open again as the day rolls on'));
							return;
						}
						jobStore.rollingSpendUsd({ sinceMs, ownerPrincipalRefId: principal.userRefId }, (ownerSpendError, ownerSpentUsd) => {
							if (ownerSpendError) {
								done(ownerSpendError);
								return;
							}
							if (ownerSpentUsd + estimateUsd > judgedValues.perPrincipalDailyUsd) {
								done('', refusalJudgedAnswer(operationName, 'perPrincipalCeilingReached', 'this account has reached the most one person may judge in any 24 hours; retrieval keeps working'));
								return;
							}
							done('', { queuedCount });
						});
					});
				});
			});
		});
	};

	const submit = ({ principal, input, serviceFacts, withReadSession, answeredFrom, namedSubjectList }, done) => {
		const operationName = 'rosettaSubmit';
		if (!judgeEngine) {
			done('', refusalJudgedAnswer(operationName, 'judgeNotConfigured', `the judged step is off on this instance: ${judgeAbsentReason}. Retrieval keeps working.`));
			return;
		}
		const formList = SUBMISSION_FORM_LIST.filter((oneForm) => input[oneForm.inputName] !== undefined);
		if (formList.length !== 1) {
			done('', refusalJudgedAnswer(operationName, 'noSubmission', `give exactly one of ${SUBMISSION_FORM_LIST.map((oneForm) => oneForm.inputName).join(', ')}; this request gives ${formList.length}`, { validValueList: SUBMISSION_FORM_LIST.map((oneForm) => oneForm.inputName) }));
			return;
		}
		const [submissionForm] = formList;
		const parsed = submissionForm.parser({ submittedDocument: input[submissionForm.inputName], parserLimitValues: { ...parserLimitValues, maxFieldListLength: judgedValues.judgedMaxFieldListLength } });
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
			inTurn((finished) => admissionRefusalFor({ principal, estimateUsd }, (admitError, admission) => {
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
					ownerPrincipalRefId: principal.userRefId,
					formatName: submissionForm.formatName,
					byteSize: Buffer.byteLength(JSON.stringify(input[submissionForm.inputName])),
					fieldList: parsed.fieldList,
					hubNameList,
					submissionNote: { unresolvedRefList: parsed.unresolvedRefList, unresolvedContextList: parsed.unresolvedContextList, notWalkedList: parsed.notWalkedList },
					expiresAtMs: nowMs() + judgedValues.jobRetentionDays * MILLISECONDS_PER_DAY,
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

	const fetch = ({ principal, input, pageNumber, pageSize, rowDetail, answerNoteValues }, done) => ownedJobOr({ operationName: 'rosettaFetch', principal, input }, (job) => jobStore.jobSpendUsd(job.jobRefId, (spendError, spentUsd) => {
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
				done('', { answer: reportOf({ job, submission, judgmentRowList, spentUsd, answerNoteValues, pageNumber, pageSize, rowDetail }) });
			});
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
			jobStore.readJob(job.jobRefId, (readError, currentJob) => (readError ? done(`the job store would not read: ${readError}`) : done('', { answer: { jobRefId: job.jobRefId, status: currentJob.status, cancelNote: wasChanged && currentJob.status === 'cancelling' ? 'it stops at the next field; a judge call already sent is finished and recorded, and what is finished stays fetchable' : 'it had not begun; nothing was spent' } })));
		});
	}, done);

	return { submit, status, fetch, cancel };
};

module.exports = { createRosettaJobService, OPEN_STATUS_LIST };
