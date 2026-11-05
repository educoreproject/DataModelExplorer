'use strict';

// rosettaJobStore — what a judged job leaves in Rosetta's own store, <dataStores>/rosettaJobs.sqlite (design 4.6). It shares strangerVectorStore's handle, so one file has one writer. Nothing here reaches graphBuilderSupport.sqlite or the forge's forensic files: judgeOne writes where it is told, and judgmentCacheFor and appendForensicRecord are what it is told.
//
//   createRosettaJobStore({ storeHandle, nowMs, xLog }, callback) → callback('', jobStore)
//   jobStore: addJob, readJob, readSubmission, readJobList, setJobStatus, requestCancel, reconcileAfterRestart, sumOpenEstimatesUsd, openJobCountOf, statusCountOf, rollingSpendUsd, jobSpendUsd, addJudgeCall, finishJudgeCall, judgeCallTotalsOf, writeJudgment, readJudgmentList, judgedUnitNameSet, judgmentCacheFor, appendForensicRecord, sweepExpired, rowCounts
//
// MONEY LIVES IN ONE TABLE. judgeCalls holds a row for every call to the vendor, written BEFORE the call goes, at the estimate, and corrected to the bill when it answers. Every sum is read from that table, so a process that dies mid-call has already written down what it may owe, and no second counter can disagree with it. A row left inFlight by a kill becomes lostAtRestart and keeps its estimate.
// A UNIT is one field against one hub (fieldIndex, hubName). A judgments row means that unit is finished, whatever its outcome, and a finished unit is never asked again: that is the whole of "no field is paid for twice".

const CREATE_STATEMENT_LIST = Object.freeze([
	'CREATE TABLE IF NOT EXISTS submissions (jobRefId TEXT PRIMARY KEY, ownerPrincipalKind TEXT NOT NULL, ownerPrincipalRefId TEXT NOT NULL, formatName TEXT NOT NULL, byteSize INTEGER NOT NULL, fieldCount INTEGER NOT NULL, hubListJson TEXT NOT NULL, submittedJson TEXT NOT NULL, submissionNoteJson TEXT NOT NULL, expiresAtMs INTEGER NOT NULL)',
	'CREATE TABLE IF NOT EXISTS jobs (jobRefId TEXT PRIMARY KEY, queueOrder INTEGER NOT NULL, status TEXT NOT NULL, stopReasonName TEXT, stopReasonText TEXT, submittedAtMs INTEGER NOT NULL, startedAtMs INTEGER, finishedAtMs INTEGER, estimateUsd REAL NOT NULL, answeredFromJson TEXT NOT NULL, judgeFactsJson TEXT NOT NULL)',
	'CREATE INDEX IF NOT EXISTS jobsByStatus ON jobs (status, queueOrder)',
	'CREATE TABLE IF NOT EXISTS judgments (jobRefId TEXT NOT NULL, fieldIndex INTEGER NOT NULL, hubName TEXT NOT NULL, unitStatus TEXT NOT NULL, promptHash TEXT, judgmentJson TEXT NOT NULL, finishedAtMs INTEGER NOT NULL, PRIMARY KEY (jobRefId, fieldIndex, hubName))',
	'CREATE TABLE IF NOT EXISTS judgeCalls (callRefId INTEGER PRIMARY KEY AUTOINCREMENT, jobRefId TEXT NOT NULL, ownerPrincipalRefId TEXT NOT NULL, fieldIndex INTEGER NOT NULL, hubName TEXT NOT NULL, startedAtMs INTEGER NOT NULL, finishedAtMs INTEGER, callStatus TEXT NOT NULL, usd REAL NOT NULL, inputTokens INTEGER, outputTokens INTEGER, wireModel TEXT NOT NULL, faultName TEXT)',
	'CREATE INDEX IF NOT EXISTS judgeCallsByStart ON judgeCalls (startedAtMs)',
	'CREATE INDEX IF NOT EXISTS judgeCallsByJob ON judgeCalls (jobRefId)',
	'CREATE TABLE IF NOT EXISTS rosettaJudgmentCache (seq INTEGER PRIMARY KEY AUTOINCREMENT, promptHash TEXT NOT NULL, model TEXT NOT NULL, rendererVersion TEXT NOT NULL, judgmentJson TEXT NOT NULL, generation TEXT, fillingSpendCallListJson TEXT, createdAtMs INTEGER NOT NULL, UNIQUE (promptHash, model, rendererVersion))',
	'CREATE TABLE IF NOT EXISTS rosettaForensics (seq INTEGER PRIMARY KEY AUTOINCREMENT, jobRefId TEXT NOT NULL, pairName TEXT, generation TEXT, recordJson TEXT NOT NULL, createdAtMs INTEGER NOT NULL)',
	'CREATE INDEX IF NOT EXISTS rosettaForensicsByJob ON rosettaForensics (jobRefId)',
]);

const OPEN_STATUS_LIST = Object.freeze(['queued', 'running', 'cancelling']);
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

	const addJob = ({ jobRefId, ownerPrincipalKind, ownerPrincipalRefId, formatName, byteSize, fieldList, hubNameList, submissionNote, expiresAtMs, estimateUsd, answeredFrom, judgeFacts }, done) => {
		run('INSERT INTO submissions (jobRefId, ownerPrincipalKind, ownerPrincipalRefId, formatName, byteSize, fieldCount, hubListJson, submittedJson, submissionNoteJson, expiresAtMs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [jobRefId, ownerPrincipalKind, ownerPrincipalRefId, formatName, byteSize, fieldList.length, JSON.stringify(hubNameList), JSON.stringify(fieldList), JSON.stringify(submissionNote), expiresAtMs], (submissionError) => {
			if (submissionError) {
				done(submissionError);
				return;
			}
			run("INSERT INTO jobs (jobRefId, queueOrder, status, submittedAtMs, estimateUsd, answeredFromJson, judgeFactsJson) VALUES (?, (SELECT coalesce(max(queueOrder), 0) + 1 FROM jobs), 'queued', ?, ?, ?, ?)", [jobRefId, nowMs(), estimateUsd, JSON.stringify(answeredFrom), JSON.stringify(judgeFacts)], (jobError) => done(jobError));
		});
	};

	const readJob = (jobRefId, done) => one(`${JOB_READ_SQL} WHERE jobs.jobRefId = ?`, [jobRefId], (readError, jobRow) => (readError ? done(readError) : done('', jobOfRow(jobRow))));

	const readSubmission = (jobRefId, done) => one('SELECT submittedJson, submissionNoteJson FROM submissions WHERE jobRefId = ?', [jobRefId], (readError, oneRow) => (readError ? done(readError) : done('', oneRow ? { fieldList: JSON.parse(oneRow.submittedJson), submissionNote: JSON.parse(oneRow.submissionNoteJson) } : null)));

	const readJobList = ({ statusList }, done) => all(`${JOB_READ_SQL} WHERE jobs.status IN (${statusList.map(() => '?').join(',')}) ORDER BY jobs.queueOrder`, statusList, (readError, jobRowList) => (readError ? done(readError) : done('', jobRowList.map(jobOfRow))));

	const setJobStatus = ({ jobRefId, status, stopReasonName, stopReasonText, startedAtMs, finishedAtMs }, done) => run('UPDATE jobs SET status = ?, stopReasonName = coalesce(?, stopReasonName), stopReasonText = coalesce(?, stopReasonText), startedAtMs = coalesce(?, startedAtMs), finishedAtMs = coalesce(?, finishedAtMs) WHERE jobRefId = ?', [status, stopReasonName === undefined ? null : stopReasonName, stopReasonText === undefined ? null : stopReasonText, startedAtMs === undefined ? null : startedAtMs, finishedAtMs === undefined ? null : finishedAtMs, jobRefId], (writeError) => done(writeError));

	// a queued job ends here and now; a running one is told, and stops at its next boundary, so a call already sent is still recorded when it answers
	const requestCancel = (jobRefId, done) => run("UPDATE jobs SET status = CASE status WHEN 'queued' THEN 'cancelled' ELSE 'cancelling' END, finishedAtMs = CASE status WHEN 'queued' THEN ? ELSE finishedAtMs END, stopReasonName = 'cancelledByOwner' WHERE jobRefId = ? AND status IN ('queued', 'running')", [nowMs(), jobRefId], (writeError, runFacts) => (writeError ? done(writeError) : done('', runFacts.changes > 0)));

	const sumOpenEstimatesUsd = (done) => all(`SELECT jobs.jobRefId, jobs.estimateUsd, (SELECT coalesce(sum(judgeCalls.usd), 0) FROM judgeCalls WHERE judgeCalls.jobRefId = jobs.jobRefId) AS spentUsd FROM jobs WHERE jobs.status IN (${openStatusSqlList})`, [], (readError, rowList) => (readError ? done(readError) : done('', rowList.reduce((soFar, oneRow) => soFar + Math.max(0, oneRow.estimateUsd - oneRow.spentUsd), 0))));

	const openJobCountOf = (ownerPrincipalRefId, done) => one(`SELECT count(*) AS openCount FROM jobs JOIN submissions ON submissions.jobRefId = jobs.jobRefId WHERE submissions.ownerPrincipalRefId = ? AND jobs.status IN (${openStatusSqlList})`, [ownerPrincipalRefId], (readError, oneRow) => (readError ? done(readError) : done('', oneRow.openCount)));

	const statusCountOf = (statusList, done) => one(`SELECT count(*) AS statusCount FROM jobs WHERE status IN (${statusList.map(() => '?').join(',')})`, statusList, (readError, oneRow) => (readError ? done(readError) : done('', oneRow.statusCount)));

	const rollingSpendUsd = ({ sinceMs, ownerPrincipalRefId }, done) => {
		const ownerClause = ownerPrincipalRefId === undefined ? '' : ' AND ownerPrincipalRefId = ?';
		one(`SELECT coalesce(sum(usd), 0) AS spentUsd FROM judgeCalls WHERE startedAtMs >= ?${ownerClause}`, ownerPrincipalRefId === undefined ? [sinceMs] : [sinceMs, ownerPrincipalRefId], (readError, oneRow) => (readError ? done(readError) : done('', oneRow.spentUsd)));
	};

	const jobSpendUsd = (jobRefId, done) => one('SELECT coalesce(sum(usd), 0) AS spentUsd FROM judgeCalls WHERE jobRefId = ?', [jobRefId], (readError, oneRow) => (readError ? done(readError) : done('', oneRow.spentUsd)));

	// written before the call goes. A process that dies now has owed the estimate, and says so.
	const addJudgeCall = ({ jobRefId, ownerPrincipalRefId, fieldIndex, hubName, estimateUsd, wireModel }, done) => run(`INSERT INTO judgeCalls (jobRefId, ownerPrincipalRefId, fieldIndex, hubName, startedAtMs, callStatus, usd, wireModel) VALUES (?, ?, ?, ?, ?, '${SPENDING_CALL_STATUS_IN_FLIGHT}', ?, ?)`, [jobRefId, ownerPrincipalRefId, fieldIndex, hubName, nowMs(), estimateUsd, wireModel], (writeError, runFacts) => (writeError ? done(writeError) : done('', runFacts.lastID)));

	const finishJudgeCall = ({ callRefId, callStatus, usd, inputTokens, outputTokens, faultName }, done) => run('UPDATE judgeCalls SET callStatus = ?, usd = ?, inputTokens = ?, outputTokens = ?, faultName = ?, finishedAtMs = ? WHERE callRefId = ?', [callStatus, usd, inputTokens === undefined ? null : inputTokens, outputTokens === undefined ? null : outputTokens, faultName === undefined ? null : faultName, nowMs(), callRefId], (writeError) => done(writeError));

	const judgeCallTotalsOf = (jobRefId, done) => all('SELECT callStatus, wireModel, count(*) AS callCount, coalesce(sum(usd), 0) AS usd, coalesce(sum(inputTokens), 0) AS inputTokens, coalesce(sum(outputTokens), 0) AS outputTokens FROM judgeCalls WHERE jobRefId = ? GROUP BY callStatus, wireModel', [jobRefId], done);

	const writeJudgment = ({ jobRefId, fieldIndex, hubName, unitStatus, promptHash, judgment }, done) => run('INSERT OR REPLACE INTO judgments (jobRefId, fieldIndex, hubName, unitStatus, promptHash, judgmentJson, finishedAtMs) VALUES (?, ?, ?, ?, ?, ?, ?)', [jobRefId, fieldIndex, hubName, unitStatus, promptHash === undefined ? null : promptHash, JSON.stringify(judgment), nowMs()], (writeError) => done(writeError));

	const readJudgmentList = (jobRefId, done) => all('SELECT fieldIndex, hubName, unitStatus, promptHash, judgmentJson FROM judgments WHERE jobRefId = ? ORDER BY fieldIndex, hubName', [jobRefId], (readError, rowList) => (readError ? done(readError) : done('', rowList.map((oneRow) => ({ ...oneRow, judgment: JSON.parse(oneRow.judgmentJson) })))));

	const judgedUnitNameSet = (jobRefId, done) => all('SELECT fieldIndex, hubName FROM judgments WHERE jobRefId = ?', [jobRefId], (readError, rowList) => (readError ? done(readError) : done('', new Set(rowList.map(unitNameOf)))));

	// the shape judgeOne is handed in place of the forge's judgment-cache: same address, same first-write-wins, this file (design 4.6)
	const judgmentCacheFor = () => ({
		getJudgment: ({ promptHash, model, rendererVersion }, done) => one('SELECT judgmentJson, generation, createdAtMs, fillingSpendCallListJson FROM rosettaJudgmentCache WHERE promptHash = ? AND model = ? AND rendererVersion = ?', [promptHash, model, rendererVersion], (readError, oneRow) => {
			if (readError) {
				done(readError);
				return;
			}
			done('', oneRow ? { judgment: JSON.parse(oneRow.judgmentJson), generation: oneRow.generation, createdAt: oneRow.createdAtMs, ...(oneRow.fillingSpendCallListJson ? { fillingSpendCallList: JSON.parse(oneRow.fillingSpendCallListJson) } : {}) } : { judgment: null });
		}),
		putJudgment: ({ promptHash, model, rendererVersion, generation, judgment, fillingSpendCallList }, done) => run('INSERT OR IGNORE INTO rosettaJudgmentCache (promptHash, model, rendererVersion, judgmentJson, generation, fillingSpendCallListJson, createdAtMs) VALUES (?, ?, ?, ?, ?, ?, ?)', [promptHash, model, rendererVersion, JSON.stringify(judgment), generation === undefined ? null : generation, fillingSpendCallList ? JSON.stringify(fillingSpendCallList) : null, nowMs()], (writeError, runFacts) => (writeError ? done(writeError) : done('', { alreadyPresent: runFacts.changes === 0 }))),
	});

	const appendForensicRecord = ({ jobRefId, pairName, generation, record }, done) => run('INSERT INTO rosettaForensics (jobRefId, pairName, generation, recordJson, createdAtMs) VALUES (?, ?, ?, ?, ?)', [jobRefId, pairName === undefined ? null : pairName, generation === undefined ? null : generation, JSON.stringify(record), nowMs()], (writeError) => done(writeError));

	// after a kill: a call that never answered keeps its estimate and is named; its unit is finished, not asked again, because the vendor may have billed it. A job that was being cancelled is now cancelled.
	const reconcileAfterRestart = (done) => all(`SELECT callRefId, jobRefId, fieldIndex, hubName FROM judgeCalls WHERE callStatus = '${SPENDING_CALL_STATUS_IN_FLIGHT}'`, [], (readError, lostCallList) => {
		if (readError) {
			done(readError);
			return;
		}
		eachInTurn(lostCallList, ({ callRefId, jobRefId, fieldIndex, hubName }, next) => run(`UPDATE judgeCalls SET callStatus = '${CALL_STATUS_LOST_AT_RESTART}', finishedAtMs = ? WHERE callRefId = ?`, [nowMs(), callRefId], (updateError) => {
			if (updateError) {
				next(updateError);
				return;
			}
			run('INSERT OR IGNORE INTO judgments (jobRefId, fieldIndex, hubName, unitStatus, judgmentJson, finishedAtMs) VALUES (?, ?, ?, ?, ?, ?)', [jobRefId, fieldIndex, hubName, UNIT_STATUS_LOST_AT_RESTART, JSON.stringify({ notJudgedReason: UNIT_STATUS_LOST_AT_RESTART }), nowMs()], (insertError) => next(insertError));
		}), (lostError) => {
			if (lostError) {
				done(lostError);
				return;
			}
			run("UPDATE jobs SET status = 'cancelled', finishedAtMs = ? WHERE status = 'cancelling'", [nowMs()], (cancelError) => (cancelError ? done(cancelError) : done('', { lostCallCount: lostCallList.length })));
		});
	});

	// a submission, its judgments, its prompts and its bill go together, by name in the log (design 4.7). A cache row can hold a rationale, so it ages out on its own clock. An open job is never swept: a job's expiry is 30 days off when it is submitted, so this holds only for a job stuck that long, and that one should be seen.
	const sweepExpired = ({ cacheOldestKeptMs }, done) => all(`SELECT submissions.jobRefId FROM submissions JOIN jobs ON jobs.jobRefId = submissions.jobRefId WHERE submissions.expiresAtMs < ? AND jobs.status NOT IN (${openStatusSqlList})`, [nowMs()], (readError, expiredRowList) => {
		if (readError) {
			done(readError);
			return;
		}
		eachInTurn(expiredRowList, ({ jobRefId }, next) => eachInTurn(['judgments', 'judgeCalls', 'rosettaForensics', 'jobs', 'submissions'], (tableName, nextTable) => run(`DELETE FROM ${tableName} WHERE jobRefId = ?`, [jobRefId], (deleteError) => nextTable(deleteError)), (jobDeleteError) => {
			if (!jobDeleteError) {
				xLog.status(`rosettaJobStore: retention: deleted job ${jobRefId}`);
			}
			next(jobDeleteError);
		}), (sweepError) => {
			if (sweepError) {
				done(sweepError);
				return;
			}
			run('DELETE FROM rosettaJudgmentCache WHERE createdAtMs < ?', [cacheOldestKeptMs], (cacheError) => (cacheError ? done(cacheError) : done('', expiredRowList.map((oneRow) => oneRow.jobRefId))));
		});
	});

	const rowCounts = (done) => one('SELECT (SELECT count(*) FROM submissions) AS submissions, (SELECT count(*) FROM jobs) AS jobs, (SELECT count(*) FROM judgments) AS judgments, (SELECT count(*) FROM judgeCalls) AS judgeCalls, (SELECT count(*) FROM rosettaJudgmentCache) AS rosettaJudgmentCache, (SELECT count(*) FROM rosettaForensics) AS rosettaForensics', [], done);

	eachInTurn(CREATE_STATEMENT_LIST, (oneStatement, next) => storeHandle.run(oneStatement, (runError) => next(runError ? runError.message : '')), (createError) => {
		if (createError) {
			callback(`rosettaJobStore: the tables would not take: ${createError}`);
			return;
		}
		callback('', { addJob, readJob, readSubmission, readJobList, setJobStatus, requestCancel, reconcileAfterRestart, sumOpenEstimatesUsd, openJobCountOf, statusCountOf, rollingSpendUsd, jobSpendUsd, addJudgeCall, finishJudgeCall, judgeCallTotalsOf, writeJudgment, readJudgmentList, judgedUnitNameSet, judgmentCacheFor, appendForensicRecord, sweepExpired, rowCounts });
	});
};

module.exports = { createRosettaJobStore, unitNameOf, OPEN_STATUS_LIST };
