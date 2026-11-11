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
const VISITOR_SECRET_MIN_LENGTH = 32;
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
		// retention, from the store alone: it runs whatever else fails to assemble below, so no missing setting or file can suspend a deletion (re-verification N1)
		const sweepNow = (done) => jobStore.sweepExpired({ cacheOldestKeptMs: nowMs() - judgedValues.jobRetentionDays * MILLISECONDS_PER_DAY }, done);
		const logSweep = (sweepError) => (sweepError ? xLog.error(`assembleRosettaJudged: the retention sweep failed: ${sweepError}`) : undefined);
		const keepSweeping = () => setInterval(() => sweepNow(logSweep), SWEEP_MILLISECONDS).unref();
		// ⟪rosettaMeanings review S2⟫ the secret keying a visitor's HMAC, from the file the config names; absent or short, the judged step stays off by name (the reason names the file, never its content), and the store is still swept
		fs.readFile(judgedValues.anonymousVisitorSecretFilePath, 'utf8', (secretError, secretText) => {
		const visitorSecret = secretError ? '' : String(secretText).trim();
		if (visitorSecret.length < VISITOR_SECRET_MIN_LENGTH) {
			sweepNow((sweepError) => {
				logSweep(sweepError);
				keepSweeping();
				callback(`[rosetta-fuse] anonymousVisitorSecretFilePath ${judgedValues.anonymousVisitorSecretFilePath} ${secretError ? `would not read (${secretError.code})` : `holds fewer than ${VISITOR_SECRET_MIN_LENGTH} characters`}; put a random secret there (eg openssl rand -hex 32), mode 600. The store is still swept.`);
			});
			return;
		}
		// a judge that was configured and will not build leaves the step off, by name. The reason says what is wrong and never holds a credential: the client's own refusals name only the file. Nothing on this path may throw: it runs in a sqlite callback, and a throw there stops the API, every other operation with it.
		const buildEngine = (built) => {
			if (judgedValues.judgeAbsentReason) {
				built({ judgeAbsentReason: judgedValues.judgeAbsentReason });
				return;
			}
			fs.mkdir(path.dirname(judgedValues.spendLedgerFilePath), { recursive: true }, (mkdirError) => { // the forge's ledger will not create a home for itself, and this one is ours
				if (mkdirError) {
					built({ judgeAbsentReason: `the judge's spend ledger has no home at ${judgedValues.spendLedgerFilePath}: ${mkdirError.code}` });
					return;
				}
				const judgeModules = forgeAdapter.loadJudgeModules();
				if (judgeModules.error) {
					built({ judgeAbsentReason: judgeModules.error });
					return;
				}
				const engineMade = createRosettaJudgeEngine({ judgedValues, judgeModules, jobStore, componentOverrides, nowMs, waitMilliseconds, xLog });
				built(engineMade.refusalText ? { judgeAbsentReason: engineMade.refusalText } : { judgeEngine: engineMade });
			});
		};
		buildEngine(({ judgeEngine, judgeAbsentReason }) => {
		if (judgeAbsentReason) {
			xLog.status(`assembleRosettaJudged: the judged step refuses submissions here: ${judgeAbsentReason}`);
		}
		let runner = null;
		const rosettaJobService = createRosettaJobService({ jobStore, judgeEngine, judgeAbsentReason, judgedValues, visitorSecret, parserLimitValues: fuseValues, hubRowListFor: rosettaRetrieval.hubRowListFor, judgedTokensSpentToday: strangerVectorStore.judgedTokensSpentToday, tickRunner: () => (runner ? runner.tick() : undefined), nowMs });
		const startRunner = ({ getServiceFacts, runOperation }, startedDone) => {
			runner = createRosettaJobRunner({ jobStore, judgeEngine, judgeAbsentReason, judgedValues, rosettaRetrieval, withReadSession: goldenHandle.withReadSession, getServiceFacts, alreadyMappedFromFor: alreadyMappedFromVia(runOperation), spendLedgerWriter: spendLedgerWriterFor({ jobStore, judgeEngine, judgedValues, xLog }), runCypher, nowMs, xLog });
			runner.startUp((startError) => {
				if (startError) {
					xLog.error(`assembleRosettaJudged: the job runner would not start: ${startError}`);
				}
				sweepNow(logSweep);
				keepSweeping();
				if (startedDone) {
					startedDone(startError, runner);
				}
			});
			return runner;
		};
		callback('', { judgedValues, jobStore, judgeEngine, rosettaJobService, startRunner, sweepNow });
		});
	});
	});
};

module.exports = { assembleRosettaJudged, alreadyMappedFromVia };
