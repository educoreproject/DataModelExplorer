'use strict';

// rosettaJobStore — what a judged job leaves in Rosetta's own store, <dataStores>/rosettaJobs.sqlite (design 4.6). It shares strangerVectorStore's handle, so one file has one writer. Nothing here reaches graphBuilderSupport.sqlite or the forge's forensic files: judgeOne writes where it is told, and judgmentCacheFor and appendForensicRecord are what it is told.
//
//   createRosettaJobStore({ storeHandle, nowMs, xLog }, callback) → callback('', jobStore)
//   jobStore: addJob, readJob, readSubmission, readJobList, setJobStatus, markJobRunning, requestCancel, reconcileAfterRestart, sumOpenEstimatesUsd, openJobCountOf, statusCountOf, jobCountSince, rollingSpendUsd, jobSpendUsd, jobSpendSplitOf, addJudgeCall, finishJudgeCall, judgeCallTotalsOf, writeJudgment, readJudgmentList, readPromptList, judgedUnitNameSet, judgmentCacheFor, appendForensicRecord, sweepExpired, rowCounts
//   ⟪rosettaMeanings R3⟫ an owner KIND (anonymous, siteUser, oauthUser) narrows the queue count, the open estimates and the rolling spend, so anonymous judging is counted on its own and never fills the signed-in queue.
//
// MONEY LIVES IN ONE TABLE. judgeCalls holds a row for every call to the vendor, written BEFORE the call goes, at the estimate, and corrected to the bill when it answers. Every sum is read from that table, so a process that dies mid-call has already written down what it may owe, and no second counter can disagree with it. A row left inFlight by a kill becomes lostAtRestart and keeps its estimate.
// A UNIT is one field against one hub (fieldIndex, hubName). A judgments row means that unit is finished, whatever its outcome, and a finished unit is never asked again: that is the whole of "no field is paid for twice".

const CREATE_STATEMENT_LIST = Object.freeze([
	'CREATE TABLE IF NOT EXISTS submissions (jobRefId TEXT PRIMARY KEY, ownerPrincipalKind TEXT NOT NULL, ownerPrincipalRefId TEXT NOT NULL, formatName TEXT NOT NULL, byteSize INTEGER NOT NULL, fieldCount INTEGER NOT NULL, hubListJson TEXT NOT NULL, submittedJson TEXT NOT NULL, submissionNoteJson TEXT NOT NULL, expiresAtMs INTEGER NOT NULL)',
	'CREATE TABLE IF NOT EXISTS jobs (jobRefId TEXT PRIMARY KEY, queueOrder INTEGER NOT NULL, status TEXT NOT NULL, stopReasonName TEXT, stopReasonText TEXT, submittedAtMs INTEGER NOT NULL, startedAtMs INTEGER, finishedAtMs INTEGER, estimateUsd REAL NOT NULL, answeredFromJson TEXT NOT NULL, judgeFactsJson TEXT NOT NULL, embeddingTokens INTEGER NOT NULL DEFAULT 0, embeddingTextCount INTEGER NOT NULL DEFAULT 0, embeddingCachedCount INTEGER NOT NULL DEFAULT 0, embeddingTokensEstimate INTEGER NOT NULL DEFAULT 0)',
	'CREATE INDEX IF NOT EXISTS jobsByStatus ON jobs (status, queueOrder)',
	'CREATE TABLE IF NOT EXISTS judgments (jobRefId TEXT NOT NULL, fieldIndex INTEGER NOT NULL, hubName TEXT NOT NULL, unitStatus TEXT NOT NULL, promptHash TEXT, judgmentJson TEXT NOT NULL, finishedAtMs INTEGER NOT NULL, PRIMARY KEY (jobRefId, fieldIndex, hubName))',
	'CREATE TABLE IF NOT EXISTS judgeCalls (callRefId INTEGER PRIMARY KEY AUTOINCREMENT, jobRefId TEXT NOT NULL, ownerPrincipalRefId TEXT NOT NULL, fieldIndex INTEGER NOT NULL, hubName TEXT NOT NULL, startedAtMs INTEGER NOT NULL, finishedAtMs INTEGER, callStatus TEXT NOT NULL, usd REAL NOT NULL, inputTokens INTEGER, outputTokens INTEGER, wireModel TEXT NOT NULL, faultName TEXT, promptHash TEXT)',
	'CREATE INDEX IF NOT EXISTS judgeCallsByStart ON judgeCalls (startedAtMs)',
	'CREATE INDEX IF NOT EXISTS judgeCallsByJob ON judgeCalls (jobRefId)',
	'CREATE TABLE IF NOT EXISTS rosettaJudgmentCache (seq INTEGER PRIMARY KEY AUTOINCREMENT, ownerPrincipalRefId TEXT NOT NULL, promptHash TEXT NOT NULL, model TEXT NOT NULL, rendererVersion TEXT NOT NULL, judgmentJson TEXT NOT NULL, answerWasCut INTEGER NOT NULL DEFAULT 0, generation TEXT, fillingSpendCallListJson TEXT, createdAtMs INTEGER NOT NULL, UNIQUE (ownerPrincipalRefId, promptHash, model, rendererVersion))',
	'CREATE TABLE IF NOT EXISTS rosettaForensics (seq INTEGER PRIMARY KEY AUTOINCREMENT, jobRefId TEXT NOT NULL, pairName TEXT, generation TEXT, recordJson TEXT NOT NULL, createdAtMs INTEGER NOT NULL)',
	'CREATE INDEX IF NOT EXISTS rosettaForensicsByJob ON rosettaForensics (jobRefId)',
	// ⟪rosettaMeanings R2⟫ the exact prompt a unit was judged with, beside its judgment and never in it, so no answer that reads judgments can carry it by accident
	'CREATE TABLE IF NOT EXISTS judgmentPrompts (jobRefId TEXT NOT NULL, fieldIndex INTEGER NOT NULL, hubName TEXT NOT NULL, systemPrompt TEXT NOT NULL, userPrompt TEXT NOT NULL, PRIMARY KEY (jobRefId, fieldIndex, hubName))',
]);

const TABLE_CREATE_PREFIX = 'CREATE TABLE IF NOT EXISTS ';
const SCHEMA_CHECK_TABLE_PREFIX = 'schemaCheck_';
const tableNameOfCreate = (createStatement) => createStatement.slice(TABLE_CREATE_PREFIX.length).split(' ')[0];

const { reasonOf } = require('./rosettaReasonWords');

const OPEN_STATUS_LIST = Object.freeze(['queued', 'running', 'cancelling']);
const HALF_WRITTEN_JOB_OLDEST_MS = 3600000;
const SPENDING_CALL_STATUS_IN_FLIGHT = 'inFlight';
const CALL_STATUS_LOST_AT_RESTART = 'lostAtRestart';
const UNIT_STATUS_LOST_AT_RESTART = 'lostAtRestart';
const openStatusSqlList = OPEN_STATUS_LIST.map((oneStatus) => `'${oneStatus}'`).join(',');

const eachInTurn = (itemList, workOnOne, done) => {
	const runNext = (itemIndex) => {
		if (itemIndex >= itemList.length) {
			done('');
			return;
		}
		workOnOne(itemList[itemIndex], (workError) => (workError ? done(workError) : runNext(itemIndex + 1)));
	};
	runNext(0);
};

const unitNameOf = ({ fieldIndex, hubName }) => `${fieldIndex}\u0000${hubName}`;

const createRosettaJobStore = ({ storeHandle, nowMs, xLog }, callback) => {
	const run = (statementText, parameterList, done) => storeHandle.run(statementText, parameterList, function afterRun(runError) { done(runError ? runError.message : '', this); });
	const one = (statementText, parameterList, done) => storeHandle.get(statementText, parameterList, (readError, oneRow) => done(readError ? readError.message : '', oneRow));
	const all = (statementText, parameterList, done) => storeHandle.all(statementText, parameterList, (readError, rowList) => done(readError ? readError.message : '', rowList));

	const jobOfRow = (jobRow) => (jobRow ? { ...jobRow, answeredFrom: JSON.parse(jobRow.answeredFromJson), judgeFacts: JSON.parse(jobRow.judgeFactsJson), hubNameList: JSON.parse(jobRow.hubListJson) } : null);
	const JOB_READ_SQL = 'SELECT jobs.*, submissions.ownerPrincipalKind, submissions.ownerPrincipalRefId, submissions.formatName, submissions.byteSize, submissions.fieldCount, submissions.hubListJson, submissions.expiresAtMs FROM jobs JOIN submissions ON submissions.jobRefId = jobs.jobRefId';

	// the job row first: a kill between the two leaves a row with no text, which the sweep clears, and never a text with nothing to name it
	// ⟪rosettaMeanings re-verification N2⟫ embeddingTokensEstimate is fixed at submit from the submission's own text, as if nothing were cached: what a job reports can never tell its owner that someone else sent the same text (embeddingTokens, the cache-aware count, stays for the bill)
	const addJob = ({ jobRefId, ownerPrincipalKind, ownerPrincipalRefId, formatName, byteSize, fieldList, hubNameList, submissionNote, expiresAtMs, estimateUsd, answeredFrom, judgeFacts, embeddingTokensEstimate }, done) => {
		if (!Number.isInteger(embeddingTokensEstimate) || embeddingTokensEstimate < 0) {
			done(`addJob needs embeddingTokensEstimate, a whole number of tokens from the submission's own text; it was given ${JSON.stringify(embeddingTokensEstimate)}`);
			return;
		}
		run("INSERT INTO jobs (jobRefId, queueOrder, status, submittedAtMs, estimateUsd, answeredFromJson, judgeFactsJson, embeddingTokensEstimate) VALUES (?, (SELECT coalesce(max(queueOrder), 0) + 1 FROM jobs), 'queued', ?, ?, ?, ?, ?)", [jobRefId, nowMs(), estimateUsd, JSON.stringify(answeredFrom), JSON.stringify(judgeFacts), embeddingTokensEstimate], (jobError) => {
			if (jobError) {
				done(jobError);
				return;
			}
			run('INSERT INTO submissions (jobRefId, ownerPrincipalKind, ownerPrincipalRefId, formatName, byteSize, fieldCount, hubListJson, submittedJson, submissionNoteJson, expiresAtMs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [jobRefId, ownerPrincipalKind, ownerPrincipalRefId, formatName, byteSize, fieldList.length, JSON.stringify(hubNameList), JSON.stringify(fieldList), JSON.stringify(submissionNote), expiresAtMs], (submissionError) => done(submissionError));
		});
	};

	const readJob = (jobRefId, done) => one(`${JOB_READ_SQL} WHERE jobs.jobRefId = ?`, [jobRefId], (readError, jobRow) => (readError ? done(readError) : done('', jobOfRow(jobRow))));

	const readSubmission = (jobRefId, done) => one('SELECT submittedJson, submissionNoteJson FROM submissions WHERE jobRefId = ?', [jobRefId], (readError, oneRow) => (readError ? done(readError) : done('', oneRow ? { fieldList: JSON.parse(oneRow.submittedJson), submissionNote: JSON.parse(oneRow.submissionNoteJson) } : null)));

	const readJobList = ({ statusList }, done) => all(`${JOB_READ_SQL} WHERE jobs.status IN (${statusList.map(() => '?').join(',')}) ORDER BY jobs.queueOrder`, statusList, (readError, jobRowList) => (readError ? done(readError) : done('', jobRowList.map(jobOfRow))));

	const setJobStatus = ({ jobRefId, status, stopReasonName, stopReasonText, startedAtMs, finishedAtMs }, done) => run('UPDATE jobs SET status = ?, stopReasonName = coalesce(?, stopReasonName), stopReasonText = coalesce(?, stopReasonText), startedAtMs = coalesce(?, startedAtMs), finishedAtMs = coalesce(?, finishedAtMs) WHERE jobRefId = ?', [status, stopReasonName === undefined ? null : stopReasonName, stopReasonText === undefined ? null : stopReasonText, startedAtMs === undefined ? null : startedAtMs, finishedAtMs === undefined ? null : finishedAtMs, jobRefId], (writeError) => done(writeError));

	// a job begins only from queued or running, and says whether it did: a cancel that landed after the queue was read must not be overwritten
	const markJobRunning = ({ jobRefId, startedAtMs }, done) => run("UPDATE jobs SET status = 'running', startedAtMs = coalesce(startedAtMs, ?) WHERE jobRefId = ? AND status IN ('queued', 'running')", [startedAtMs, jobRefId], (writeError, runFacts) => (writeError ? done(writeError) : done('', runFacts.changes > 0)));

	// a queued job ends here and now; a running one is told, and stops at its next boundary, so a call already sent is still recorded when it answers
	const requestCancel = (jobRefId, done) => run("UPDATE jobs SET status = CASE status WHEN 'queued' THEN 'cancelled' ELSE 'cancelling' END, finishedAtMs = CASE status WHEN 'queued' THEN ? ELSE finishedAtMs END, stopReasonName = 'cancelledByOwner', stopReasonText = ? WHERE jobRefId = ? AND status IN ('queued', 'running')", [nowMs(), reasonOf('cancelledByOwner'), jobRefId], (writeError, runFacts) => (writeError ? done(writeError) : done('', runFacts.changes > 0)));

	// an owner-kind clause: { ownerPrincipalKindList } keeps those kinds, { exceptOwnerPrincipalKindList } keeps the rest; neither keeps every job
	const ownerKindClauseOf = ({ ownerPrincipalKindList, exceptOwnerPrincipalKindList }, columnName) => {
		const kindList = ownerPrincipalKindList || exceptOwnerPrincipalKindList;
		if (!kindList) {
			return { clauseText: '', parameterList: [] };
		}
		return { clauseText: ` AND ${columnName} ${ownerPrincipalKindList ? 'IN' : 'NOT IN'} (${kindList.map(() => '?').join(',')})`, parameterList: kindList };
	};

	const sumOpenEstimatesUsd = (ownerKindFilter, done) => {
		const ownerKind = ownerKindClauseOf(ownerKindFilter, 'submissions.ownerPrincipalKind');
		all(`SELECT jobs.jobRefId, jobs.estimateUsd, (SELECT coalesce(sum(judgeCalls.usd), 0) FROM judgeCalls WHERE judgeCalls.jobRefId = jobs.jobRefId) AS spentUsd FROM jobs JOIN submissions ON submissions.jobRefId = jobs.jobRefId WHERE jobs.status IN (${openStatusSqlList})${ownerKind.clauseText}`, ownerKind.parameterList, (readError, rowList) => (readError ? done(readError) : done('', rowList.reduce((soFar, oneRow) => soFar + Math.max(0, oneRow.estimateUsd - oneRow.spentUsd), 0))));
	};

	const openJobCountOf = (ownerPrincipalRefId, done) => one(`SELECT count(*) AS openCount FROM jobs JOIN submissions ON submissions.jobRefId = jobs.jobRefId WHERE submissions.ownerPrincipalRefId = ? AND jobs.status IN (${openStatusSqlList})`, [ownerPrincipalRefId], (readError, oneRow) => (readError ? done(readError) : done('', oneRow.openCount)));

	const statusCountOf = (statusList, ownerKindFilter, done) => {
		const ownerKind = ownerKindClauseOf(ownerKindFilter, 'submissions.ownerPrincipalKind');
		one(`SELECT count(*) AS statusCount FROM jobs JOIN submissions ON submissions.jobRefId = jobs.jobRefId WHERE jobs.status IN (${statusList.map(() => '?').join(',')})${ownerKind.clauseText}`, [...statusList, ...ownerKind.parameterList], (readError, oneRow) => (readError ? done(readError) : done('', oneRow.statusCount)));
	};

	// ⟪rosettaMeanings R3⟫ how many jobs an owner submitted since a moment, whatever became of them: a cancelled job still counts against a visitor's hourly allowance
	const jobCountSince = ({ ownerPrincipalRefId, sinceMs }, done) => one('SELECT count(*) AS jobCount FROM jobs JOIN submissions ON submissions.jobRefId = jobs.jobRefId WHERE submissions.ownerPrincipalRefId = ? AND jobs.submittedAtMs >= ?', [ownerPrincipalRefId, sinceMs], (readError, oneRow) => (readError ? done(readError) : done('', oneRow.jobCount)));

	const rollingSpendUsd = ({ sinceMs, ownerPrincipalRefId, ownerPrincipalKindList, exceptOwnerPrincipalKindList }, done) => {
		const ownerClause = ownerPrincipalRefId === undefined ? '' : ' AND ownerPrincipalRefId = ?';
		const ownerKind = ownerKindClauseOf({ ownerPrincipalKindList, exceptOwnerPrincipalKindList }, 'submissions.ownerPrincipalKind');
		const kindClause = ownerKind.clauseText ? ` AND jobRefId IN (SELECT submissions.jobRefId FROM submissions WHERE 1 = 1${ownerKind.clauseText})` : '';
		one(`SELECT coalesce(sum(usd), 0) AS spentUsd FROM judgeCalls WHERE startedAtMs >= ?${ownerClause}${kindClause}`, [sinceMs, ...(ownerPrincipalRefId === undefined ? [] : [ownerPrincipalRefId]), ...ownerKind.parameterList], (readError, oneRow) => (readError ? done(readError) : done('', oneRow.spentUsd)));
	};

	const jobSpendUsd = (jobRefId, done) => one('SELECT coalesce(sum(usd), 0) AS spentUsd FROM judgeCalls WHERE jobRefId = ?', [jobRefId], (readError, oneRow) => (readError ? done(readError) : done('', oneRow.spentUsd)));
	// ⟪rosettaLoginPolish #4⟫ the same sum, split for a person to read: billedUsd counts calls that have finished, each at its bill (or, lost at a restart or
	// unanswered, at the estimate it keeps), and never falls, because a finished row is never written again; inFlightUsd is what calls still out may cost at most,
	// held at their estimate until their bill corrects it, so it can fall. spentUsd, their sum, is what every ceiling counts, and is unchanged.
	const jobSpendSplitOf = (jobRefId, done) => one(`SELECT coalesce(sum(usd), 0) AS spentUsd, coalesce(sum(CASE WHEN callStatus = '${SPENDING_CALL_STATUS_IN_FLIGHT}' THEN 0 ELSE usd END), 0) AS billedUsd, coalesce(sum(CASE WHEN callStatus = '${SPENDING_CALL_STATUS_IN_FLIGHT}' THEN usd ELSE 0 END), 0) AS inFlightUsd, count(CASE WHEN callStatus = '${SPENDING_CALL_STATUS_IN_FLIGHT}' THEN 1 END) AS inFlightCallCount FROM judgeCalls WHERE jobRefId = ?`, [jobRefId], (readError, oneRow) => (readError ? done(readError) : done('', oneRow)));

	// written before the call goes. A process that dies now has owed the estimate, and says so.
	const addJudgeCall = ({ jobRefId, ownerPrincipalRefId, fieldIndex, hubName, estimateUsd, wireModel, promptHash }, done) => run(`INSERT INTO judgeCalls (jobRefId, ownerPrincipalRefId, fieldIndex, hubName, startedAtMs, callStatus, usd, wireModel, promptHash) VALUES (?, ?, ?, ?, ?, '${SPENDING_CALL_STATUS_IN_FLIGHT}', ?, ?, ?)`, [jobRefId, ownerPrincipalRefId, fieldIndex, hubName, nowMs(), estimateUsd, wireModel, promptHash === undefined ? null : promptHash], (writeError, runFacts) => (writeError ? done(writeError) : done('', runFacts.lastID)));

	const finishJudgeCall = ({ callRefId, callStatus, usd, inputTokens, outputTokens, faultName }, done) => run('UPDATE judgeCalls SET callStatus = ?, usd = ?, inputTokens = ?, outputTokens = ?, faultName = ?, finishedAtMs = ? WHERE callRefId = ?', [callStatus, usd, inputTokens === undefined ? null : inputTokens, outputTokens === undefined ? null : outputTokens, faultName === undefined ? null : faultName, nowMs(), callRefId], (writeError) => done(writeError));

	const judgeCallTotalsOf = (jobRefId, done) => all('SELECT callStatus, wireModel, count(*) AS callCount, coalesce(sum(usd), 0) AS usd, coalesce(sum(inputTokens), 0) AS inputTokens, coalesce(sum(outputTokens), 0) AS outputTokens FROM judgeCalls WHERE jobRefId = ? GROUP BY callStatus, wireModel', [jobRefId], done);

	const writeJudgment = ({ jobRefId, fieldIndex, hubName, unitStatus, promptHash, judgment }, done) => run('INSERT OR REPLACE INTO judgments (jobRefId, fieldIndex, hubName, unitStatus, promptHash, judgmentJson, finishedAtMs) VALUES (?, ?, ?, ?, ?, ?, ?)', [jobRefId, fieldIndex, hubName, unitStatus, promptHash === undefined ? null : promptHash, JSON.stringify(judgment), nowMs()], (writeError) => done(writeError));

	const readJudgmentList = (jobRefId, done) => all('SELECT fieldIndex, hubName, unitStatus, promptHash, judgmentJson FROM judgments WHERE jobRefId = ? ORDER BY fieldIndex, hubName', [jobRefId], (readError, rowList) => (readError ? done(readError) : done('', rowList.map((oneRow) => ({ ...oneRow, judgment: JSON.parse(oneRow.judgmentJson) })))));

	const writeJudgmentPrompt = ({ jobRefId, fieldIndex, hubName, systemPrompt, userPrompt }, done) => run('INSERT OR REPLACE INTO judgmentPrompts (jobRefId, fieldIndex, hubName, systemPrompt, userPrompt) VALUES (?, ?, ?, ?, ?)', [jobRefId, fieldIndex, hubName, systemPrompt, userPrompt], (writeError) => done(writeError));

	const readPromptList = (jobRefId, done) => all('SELECT fieldIndex, hubName, systemPrompt, userPrompt FROM judgmentPrompts WHERE jobRefId = ? ORDER BY fieldIndex, hubName', [jobRefId], done);

	const judgedUnitNameSet = (jobRefId, done) => all('SELECT fieldIndex, hubName FROM judgments WHERE jobRefId = ?', [jobRefId], (readError, rowList) => (readError ? done(readError) : done('', new Set(rowList.map(unitNameOf)))));

	// the shape judgeOne is handed in place of the forge's judgment-cache: same address plus the owner, first write wins, this file (design 4.6). THE OWNER IS IN THE ADDRESS because a hit costs nothing: shared between people, a free answer would tell one person that another had submitted that very text. answerWasCut rides beside the judgment, which the forge compares by content.
	const judgmentCacheFor = ({ ownerPrincipalRefId, onCutMarkRead, cutMarkForPut = () => false }) => ({
		getJudgment: ({ promptHash, model, rendererVersion }, done) => one('SELECT judgmentJson, generation, createdAtMs, fillingSpendCallListJson, answerWasCut FROM rosettaJudgmentCache WHERE ownerPrincipalRefId = ? AND promptHash = ? AND model = ? AND rendererVersion = ?', [ownerPrincipalRefId, promptHash, model, rendererVersion], (readError, oneRow) => {
			if (readError) {
				done(readError);
				return;
			}
			if (oneRow && onCutMarkRead) {
				onCutMarkRead(oneRow.answerWasCut === 1);
			}
			done('', oneRow ? { judgment: JSON.parse(oneRow.judgmentJson), generation: oneRow.generation, createdAt: oneRow.createdAtMs, ...(oneRow.fillingSpendCallListJson ? { fillingSpendCallList: JSON.parse(oneRow.fillingSpendCallListJson) } : {}) } : { judgment: null });
		}),
		putJudgment: ({ promptHash, model, rendererVersion, generation, judgment, fillingSpendCallList }, done) => run('INSERT OR IGNORE INTO rosettaJudgmentCache (ownerPrincipalRefId, promptHash, model, rendererVersion, judgmentJson, answerWasCut, generation, fillingSpendCallListJson, createdAtMs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [ownerPrincipalRefId, promptHash, model, rendererVersion, JSON.stringify(judgment), cutMarkForPut() ? 1 : 0, generation === undefined ? null : generation, fillingSpendCallList ? JSON.stringify(fillingSpendCallList) : null, nowMs()], (writeError, runFacts) => (writeError ? done(writeError) : done('', { alreadyPresent: runFacts.changes === 0 }))),
	});

	const appendForensicRecord = ({ jobRefId, pairName, generation, record }, done) => run('INSERT INTO rosettaForensics (jobRefId, pairName, generation, recordJson, createdAtMs) VALUES (?, ?, ?, ?, ?)', [jobRefId, pairName === undefined ? null : pairName, generation === undefined ? null : generation, JSON.stringify(record), nowMs()], (writeError) => done(writeError));

	// after a kill: a call that never answered keeps its estimate and is named; its unit is finished, not asked again, because the vendor may have billed it. So is a unit whose call was paid and whose judgment was never written, unless the answer reached the cache, where the replay is free. A job that was being cancelled is now cancelled.
	const reconcileAfterRestart = (done) => all(`SELECT callRefId, jobRefId, fieldIndex, hubName FROM judgeCalls WHERE callStatus = '${SPENDING_CALL_STATUS_IN_FLIGHT}'`, [], (readError, lostCallList) => {
		if (readError) {
			done(readError);
			return;
		}
		const finishUnitAsLost = ({ jobRefId, fieldIndex, hubName }, next) => run('INSERT OR IGNORE INTO judgments (jobRefId, fieldIndex, hubName, unitStatus, judgmentJson, finishedAtMs) VALUES (?, ?, ?, ?, ?, ?)', [jobRefId, fieldIndex, hubName, UNIT_STATUS_LOST_AT_RESTART, JSON.stringify({ notJudgedReason: UNIT_STATUS_LOST_AT_RESTART }), nowMs()], (insertError) => next(insertError));
		eachInTurn(lostCallList, (lostCall, next) => run(`UPDATE judgeCalls SET callStatus = '${CALL_STATUS_LOST_AT_RESTART}', finishedAtMs = ? WHERE callRefId = ?`, [nowMs(), lostCall.callRefId], (updateError) => (updateError ? next(updateError) : finishUnitAsLost(lostCall, next))), (lostError) => {
			if (lostError) {
				done(lostError);
				return;
			}
			all(`SELECT DISTINCT calls.jobRefId, calls.fieldIndex, calls.hubName FROM judgeCalls AS calls JOIN jobs ON jobs.jobRefId = calls.jobRefId WHERE jobs.status IN (${openStatusSqlList}) AND calls.callStatus IN ('answered', 'unansweredPriced')
				AND NOT EXISTS (SELECT 1 FROM judgments WHERE judgments.jobRefId = calls.jobRefId AND judgments.fieldIndex = calls.fieldIndex AND judgments.hubName = calls.hubName)
				AND NOT EXISTS (SELECT 1 FROM rosettaJudgmentCache AS cache WHERE cache.ownerPrincipalRefId IN (calls.ownerPrincipalRefId, calls.jobRefId) AND cache.promptHash = calls.promptHash)`, [], (paidError, paidUnitList) => {
				if (paidError) {
					done(paidError);
					return;
				}
				eachInTurn(paidUnitList, finishUnitAsLost, (paidUnitError) => {
					if (paidUnitError) {
						done(paidUnitError);
						return;
					}
					run("UPDATE jobs SET status = 'cancelled', finishedAtMs = ? WHERE status = 'cancelling'", [nowMs()], (cancelError) => (cancelError ? done(cancelError) : done('', { lostCallCount: lostCallList.length + paidUnitList.length })));
				});
			});
		});
	});

	// a submission, its judgments, its prompts and its bill go together, by name in the log (design 4.7), the text first. A cache row can hold a rationale, so it ages out on its own clock. An open job is never swept: a job's expiry is 30 days off when it is submitted, so this holds only for a job stuck that long, and that one should be seen. A kill between the writes of one job can leave half of it: a text with no job goes on its own date, and a job with no text goes once it is too old to be one still being written.
	const JOB_TABLE_LIST = ['submissions', 'judgments', 'judgmentPrompts', 'judgeCalls', 'rosettaForensics', 'jobs'];
	// ⟪rosettaMeanings review⟫ an anonymous job's judgment cache is keyed by its own jobRefId (rosettaJudgeEngine), so it goes with the job, on the job's clock
	const deleteJobRows = (jobRefId, deleted) => eachInTurn(JOB_TABLE_LIST, (tableName, nextTable) => run(`DELETE FROM ${tableName} WHERE jobRefId = ?`, [jobRefId], (deleteError) => nextTable(deleteError)), (jobDeleteError) => (jobDeleteError ? deleted(jobDeleteError) : run('DELETE FROM rosettaJudgmentCache WHERE ownerPrincipalRefId = ?', [jobRefId], (cacheDeleteError) => deleted(cacheDeleteError))));
	const sweepExpired = ({ cacheOldestKeptMs }, done) => all(`SELECT submissions.jobRefId FROM submissions JOIN jobs ON jobs.jobRefId = submissions.jobRefId WHERE submissions.expiresAtMs < ? AND jobs.status NOT IN (${openStatusSqlList})`, [nowMs()], (readError, expiredRowList) => {
		if (readError) {
			done(readError);
			return;
		}
		eachInTurn(expiredRowList, ({ jobRefId }, next) => deleteJobRows(jobRefId, (jobDeleteError) => {
			if (!jobDeleteError) {
				xLog.status(`rosettaJobStore: retention: deleted job ${jobRefId}`);
			}
			next(jobDeleteError);
		}), (sweepError) => {
			if (sweepError) {
				done(sweepError);
				return;
			}
			all(`SELECT jobRefId FROM submissions WHERE expiresAtMs < ? AND jobRefId NOT IN (SELECT jobRefId FROM jobs) UNION SELECT jobRefId FROM jobs WHERE submittedAtMs < ? AND jobRefId NOT IN (SELECT jobRefId FROM submissions)`, [nowMs(), nowMs() - HALF_WRITTEN_JOB_OLDEST_MS], (orphanError, orphanRowList) => {
				if (orphanError) {
					done(orphanError);
					return;
				}
				eachInTurn(orphanRowList, ({ jobRefId }, next) => deleteJobRows(jobRefId, (orphanDeleteError) => {
					if (!orphanDeleteError) {
						xLog.status(`rosettaJobStore: retention: deleted half a job, ${jobRefId}`);
					}
					next(orphanDeleteError);
				}), (orphanDeleteFault) => {
					if (orphanDeleteFault) {
						done(orphanDeleteFault);
						return;
					}
					run('DELETE FROM rosettaJudgmentCache WHERE createdAtMs < ?', [cacheOldestKeptMs], (cacheError) => (cacheError ? done(cacheError) : done('', expiredRowList.map((oneRow) => oneRow.jobRefId))));
				});
			});
		});
	});

	const addEmbeddingTokens = ({ jobRefId, estimatedTokens, newTextCount, cachedTextCount }, done) => run('UPDATE jobs SET embeddingTokens = embeddingTokens + ?, embeddingTextCount = embeddingTextCount + ?, embeddingCachedCount = embeddingCachedCount + ? WHERE jobRefId = ?', [estimatedTokens, newTextCount, cachedTextCount, jobRefId], (writeError) => done(writeError));

	const rowCounts = (done) => one('SELECT (SELECT count(*) FROM submissions) AS submissions, (SELECT count(*) FROM jobs) AS jobs, (SELECT count(*) FROM judgments) AS judgments, (SELECT count(*) FROM judgeCalls) AS judgeCalls, (SELECT count(*) FROM rosettaJudgmentCache) AS rosettaJudgmentCache, (SELECT count(*) FROM rosettaForensics) AS rosettaForensics, (SELECT count(*) FROM judgmentPrompts) AS judgmentPrompts', [], done);

	// A STORE FROM BEFORE. CREATE TABLE IF NOT EXISTS leaves an older table as it was, so each table is compared with what this code creates, built as a temp copy on the same handle. A missing column that sqlite can add (nullable or defaulted, not a key, in no UNIQUE) is added, named in the log. Any other refuses the judged step by name, and nothing is changed.
	const columnDefinitionOf = (columnRow) => `${columnRow.type}${columnRow.notnull ? ' NOT NULL' : ''}${columnRow.dflt_value === null ? '' : ` DEFAULT ${columnRow.dflt_value}`}`;
	const uniqueColumnNameSetOf = (schemaName, tableName, done) => all(`PRAGMA ${schemaName}.index_list(${tableName})`, [], (listError, indexRowList) => {
		if (listError) {
			done(listError);
			return;
		}
		const uniqueColumnNameSet = new Set();
		eachInTurn(indexRowList.filter((indexRow) => indexRow.unique), (indexRow, next) => all(`PRAGMA ${schemaName}.index_info(${indexRow.name})`, [], (infoError, infoRowList) => {
			(infoRowList || []).forEach((infoRow) => uniqueColumnNameSet.add(infoRow.name));
			next(infoError);
		}), (infoFault) => done(infoFault, uniqueColumnNameSet));
	});
	const bringTableUpToDate = (createStatement, done) => {
		const tableName = tableNameOfCreate(createStatement);
		const checkTableName = `${SCHEMA_CHECK_TABLE_PREFIX}${tableName}`;
		run(`CREATE TEMP TABLE ${checkTableName} ${createStatement.slice(TABLE_CREATE_PREFIX.length + tableName.length + 1)}`, [], (tempError) => {
			if (tempError) {
				done(`the shape of ${tableName} could not be built to compare: ${tempError}`);
				return;
			}
			all(`PRAGMA temp.table_info(${checkTableName})`, [], (neededError, neededColumnList) => all(`PRAGMA main.table_info(${tableName})`, [], (presentError, presentColumnList) => uniqueColumnNameSetOf('temp', checkTableName, (uniqueError, uniqueColumnNameSet) => run(`DROP TABLE temp.${checkTableName}`, [], (dropError) => {
				const readFault = neededError || presentError || uniqueError || dropError;
				if (readFault) {
					done(`the columns of ${tableName} could not be read: ${readFault}`);
					return;
				}
				const presentColumnNameSet = new Set(presentColumnList.map((columnRow) => columnRow.name));
				const missingColumnList = neededColumnList.filter((columnRow) => !presentColumnNameSet.has(columnRow.name));
				const unaddableColumnList = missingColumnList.filter((columnRow) => columnRow.pk || uniqueColumnNameSet.has(columnRow.name) || (columnRow.notnull && columnRow.dflt_value === null));
				if (unaddableColumnList.length) {
					done(`the store's ${tableName} table has no ${unaddableColumnList.map((columnRow) => `${tableName}.${columnRow.name}`).join(', ')}, which cannot be added in place; move ${tableName} aside and restart to have it made new`);
					return;
				}
				eachInTurn(missingColumnList, (columnRow, next) => run(`ALTER TABLE ${tableName} ADD COLUMN ${columnRow.name} ${columnDefinitionOf(columnRow)}`, [], (alterError) => {
					if (!alterError) {
						xLog.status(`rosettaJobStore: added column ${tableName}.${columnRow.name} (${columnDefinitionOf(columnRow)}) to a store from before`);
					}
					next(alterError ? `${tableName}.${columnRow.name} would not add: ${alterError}` : '');
				}), done);
			}))));
		});
	};

	const tableCreateList = CREATE_STATEMENT_LIST.filter((oneStatement) => oneStatement.startsWith(TABLE_CREATE_PREFIX));
	const indexCreateList = CREATE_STATEMENT_LIST.filter((oneStatement) => !oneStatement.startsWith(TABLE_CREATE_PREFIX));
	// a swept text must leave the file, not only its row: sqlite otherwise leaves the bytes in free pages until they are reused. Indexes come after the columns they may name.
	eachInTurn(['PRAGMA secure_delete = ON', ...tableCreateList], (oneStatement, next) => storeHandle.run(oneStatement, (runError) => next(runError ? runError.message : '')), (createError) => {
		if (createError) {
			callback(`rosettaJobStore: the tables would not take: ${createError}`);
			return;
		}
		eachInTurn(tableCreateList, bringTableUpToDate, (schemaError) => {
		if (schemaError) {
			callback(`rosettaJobStore: ${schemaError}`);
			return;
		}
		eachInTurn(indexCreateList, (oneStatement, next) => storeHandle.run(oneStatement, (runError) => next(runError ? runError.message : '')), (indexError) => {
		if (indexError) {
			callback(`rosettaJobStore: the indexes would not take: ${indexError}`);
			return;
		}
		callback('', { addJob, readJob, readSubmission, readJobList, setJobStatus, markJobRunning, requestCancel, reconcileAfterRestart, sumOpenEstimatesUsd, openJobCountOf, statusCountOf, jobCountSince, rollingSpendUsd, jobSpendUsd, jobSpendSplitOf, addJudgeCall, finishJudgeCall, judgeCallTotalsOf, writeJudgment, writeJudgmentPrompt, readJudgmentList, readPromptList, judgedUnitNameSet, judgmentCacheFor, appendForensicRecord, sweepExpired, addEmbeddingTokens, rowCounts });
		});
		});
	});
};

module.exports = { createRosettaJobStore, unitNameOf, OPEN_STATUS_LIST };
