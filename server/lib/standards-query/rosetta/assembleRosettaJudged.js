'use strict';

// assembleRosettaJudged — the judged step's parts, put together once: the access point and the live gates build it through this one function, so a gate runs what production runs.
//
//   assembleRosettaJudged({ fuseConfigValues, judgeConfigValues, fuseValues, strangerVectorStore, rosettaRetrieval, forgeAdapter, goldenHandle, runCypher, nowDate, xLog, componentOverrides?, waitMilliseconds? }, callback)
//     → callback('', { judgedValues, jobStore, judgeEngine, rosettaJobService, startRunner({ getServiceFacts, runOperation }) → runner })
//   No judge configured is not an error: rosettaJobService refuses every submission judgeNotConfigured, and status and fetch still answer for jobs already held. An absent or bad fuse value is an error, and the step stays off.
//   The runner starts after the core exists, because the core proves the graph and answers the report's alreadyMappedFrom.

const fs = require('fs');
const path = require('path');
const { createRosettaJobStore } = require('./rosettaJobStore');
const { createRosettaJudgeEngine, rosettaJudgedValuesOf } = require('./rosettaJudgeEngine');
const { createRosettaJobRunner, spendLedgerWriterFor } = require('./rosettaJobRunner');
const { createRosettaJobService } = require('./rosettaJobService');
const { judgedSettings } = require('./rosettaJudgeEngine');

const MILLISECONDS_PER_DAY = 86400000;
const SWEEP_MILLISECONDS = MILLISECONDS_PER_DAY;
const ROSETTA_JOB_PRINCIPAL = Object.freeze({ kind: 'rosettaJob', userRefId: '', role: '' });
const MAPPINGS_OPERATION_NAME = 'mappings';
const INCOMING_DIRECTION_NAME = 'incoming';

// who already maps to the proposed card, for the report only. A busy or failed lookup says so: an empty list would read as nobody.
const alreadyMappedFromVia = (runOperation) => ({ cardUri }, done) => runOperation({ operationName: MAPPINGS_OPERATION_NAME, input: { element: cardUri, rowDetail: 'full' }, principal: ROSETTA_JOB_PRINCIPAL }, (unusedError, mappingAnswer) => {
	if (!mappingAnswer || mappingAnswer.httpStatus !== 200) {
		done({ isUnavailable: true, httpStatus: mappingAnswer ? mappingAnswer.httpStatus : 0 });
		return;
	}
	const { mappingRowList } = JSON.parse(mappingAnswer.bodyText).answer;
	const seenStandardNameSet = new Set();
	done(mappingRowList.filter((oneRow) => oneRow.direction === INCOMING_DIRECTION_NAME).filter((oneRow) => (seenStandardNameSet.has(oneRow.fromSource) ? false : seenStandardNameSet.add(oneRow.fromSource))).slice(0, judgedSettings.alreadyMappedFromLength).map((oneRow) => ({ standardName: oneRow.fromSource, name: oneRow.fromName, uri: oneRow.fromUri })));
});

const assembleRosettaJudged = ({ fuseConfigValues, judgeConfigValues, fuseValues, strangerVectorStore, rosettaRetrieval, forgeAdapter, goldenHandle, runCypher, nowDate, xLog, componentOverrides, waitMilliseconds = (waitLength, afterWait) => setTimeout(afterWait, waitLength) }, callback) => {
	const judgedRead = rosettaJudgedValuesOf({ fuseConfigValues, judgeConfigValues });
	if (judgedRead.refusalText) {
		callback(judgedRead.refusalText);
		return;
	}
	const { judgedValues } = judgedRead;
	const nowMs = () => nowDate().getTime();
	createRosettaJobStore({ storeHandle: strangerVectorStore.storeHandle, nowMs, xLog }, (storeError, jobStore) => {
		if (storeError) {
			callback(storeError);
			return;
		}
		// a judge that was configured and will not build leaves the step off, by name. The reason says what is wrong and never holds a credential: the client's own refusals name only the file.
		const buildEngine = () => {
			if (judgedValues.judgeAbsentReason) {
				return { judgeAbsentReason: judgedValues.judgeAbsentReason };
			}
			fs.mkdirSync(path.dirname(judgedValues.spendLedgerFilePath), { recursive: true }); // the forge's ledger will not create a home for itself, and this one is ours
			const judgeModules = forgeAdapter.loadJudgeModules();
			if (judgeModules.error) {
				return { judgeAbsentReason: judgeModules.error };
			}
			const engineMade = createRosettaJudgeEngine({ judgedValues, judgeModules, jobStore, componentOverrides, nowMs, waitMilliseconds, xLog });
			return engineMade.refusalText ? { judgeAbsentReason: engineMade.refusalText } : { judgeEngine: engineMade };
		};
		const { judgeEngine, judgeAbsentReason } = buildEngine();
		if (judgeAbsentReason) {
			xLog.status(`assembleRosettaJudged: the judged step refuses submissions here: ${judgeAbsentReason}`);
		}
		let runner = null;
		const rosettaJobService = createRosettaJobService({ jobStore, judgeEngine, judgeAbsentReason, judgedValues, parserLimitValues: fuseValues, hubRowListFor: rosettaRetrieval.hubRowListFor, tickRunner: () => (runner ? runner.tick() : undefined), nowMs });
		const sweepNow = (done) => jobStore.sweepExpired({ cacheOldestKeptMs: nowMs() - judgedValues.jobRetentionDays * MILLISECONDS_PER_DAY }, done);
		const startRunner = ({ getServiceFacts, runOperation }, startedDone) => {
			runner = createRosettaJobRunner({ jobStore, judgeEngine, judgeAbsentReason, judgedValues, rosettaRetrieval, withReadSession: goldenHandle.withReadSession, getServiceFacts, alreadyMappedFromFor: alreadyMappedFromVia(runOperation), spendLedgerWriter: spendLedgerWriterFor({ jobStore, judgeEngine, judgedValues, xLog }), runCypher, nowMs, xLog });
			runner.startUp((startError) => {
				if (startError) {
					xLog.error(`assembleRosettaJudged: the job runner would not start: ${startError}`);
				}
				const logSweep = (sweepError) => (sweepError ? xLog.error(`assembleRosettaJudged: the retention sweep failed: ${sweepError}`) : undefined);
				sweepNow(logSweep);
				setInterval(() => sweepNow(logSweep), SWEEP_MILLISECONDS).unref();
				if (startedDone) {
					startedDone(startError, runner);
				}
			});
			return runner;
		};
		callback('', { judgedValues, jobStore, judgeEngine, rosettaJobService, startRunner, sweepNow });
	});
};

module.exports = { assembleRosettaJudged, alreadyMappedFromVia };
