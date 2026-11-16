'use strict';

// rosettaGuardedModelCall — one forced-tool call to the cheap model, bounded before it goes. Shared by rosettaInterpreter (free text to fields) and rosettaSearchDescriber
// (a search description for a bare field): each keeps its own contract, prompt, settings and ledger recipes, and this holds what they would otherwise copy.
//
//   buildForgeModelParts({ forgeAdapter, wireModel, anthropicConfigFilePath, spendPricingFilePath, spendLedgerFilePath, ownerLabel }, callback({ forgeModelParts } | { refusalText }))
//     forgeModelParts: { forcedToolClient, spendPricer, spendRecordLib, spendLedgerLib }: the forge's own client, prices, spend record and ledger, as the judge uses them.
//     An unpriced model, a client with no callForcedTool, or a ledger with no home is refused here, at startup, naming ownerLabel ("the interpreter").
//   createGuardedModelCall({ guardValues, ledgerNaming, ownerName, forcedToolClient, spendPricer, spendRecordLib, spendLedgerLib, nowMs })
//     guardValues: { maxInFlight, dailyCeilingUsd, maxAttempts, spendLedgerFilePath }; ledgerNaming: { recipeName, unansweredRecipeName, bridgeName, pairName, storeDirName }
//     → { callGuarded({ systemPrompt, userPrompt, tool, maxTokens, worstCaseInputTokens }, done(errText, outcome)), inFlightState() }
//     outcome: { guardRefusalName: 'busy', inFlightCount } | { guardRefusalName: 'spendCeiling' } | { called, usd, elapsedMs }; beside an error, { failedStepName } (GUARD_STEP_NAME)
//     called is the forced-tool client's answer: { toolInput, stopReason, spendCallList, attempts, model }; toolInput null is a cut or toolless answer, never read.
//
// SPEND IS BOUNDED BEFORE ANY CALL: at most maxInFlight calls at once for this owner (busy), held apart from the core's query slots; and the day's spend for this owner's
// recipes, read from the ledger, plus the worst case of every call in flight and of this one, may not pass dailyCeilingUsd (spendCeiling). The ledger is read, so every
// process that writes it is counted and a restart forgets nothing. A failure the vendor may still have billed is ledgered at its worst case; a 4xx is not.
// The ledger line is built by the forge's spend record and ledger and never holds the prompt: its stamp is a hash of a fresh id.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();
const modelCallSettings = require('./rosettaModelCallSettings.json');

const PROVIDER_NAME_ANTHROPIC = 'anthropic';
const UNBILLED_VENDOR_ERROR_PATTERN = new RegExp(modelCallSettings.unbilledVendorErrorPattern);
const GUARD_REFUSAL_BUSY = 'busy';
const GUARD_REFUSAL_SPEND_CEILING = 'spendCeiling';
// which step failed, beside an error: the describer names a spend it cannot read apart from a vendor that did not answer (review N2); the interpreter reads only the error
const GUARD_STEP_NAME = Object.freeze({ ledgerRead: 'ledgerRead', modelCall: 'modelCall', ledgerWrite: 'ledgerWrite' });
const GUARD_VALUE_NAME_LIST = Object.freeze(['maxInFlight', 'dailyCeilingUsd', 'maxAttempts', 'spendLedgerFilePath']);
const LEDGER_NAMING_NAME_LIST = Object.freeze(['recipeName', 'unansweredRecipeName', 'bridgeName', 'pairName', 'storeDirName']);

const utcDayTextOf = (anyMs) => new Date(anyMs).toISOString().slice(0, 10);

const createGuardedModelCall = ({ guardValues, ledgerNaming, ownerName, forcedToolClient, spendPricer, spendRecordLib, spendLedgerLib, nowMs }) => {
	const absentNameList = [...GUARD_VALUE_NAME_LIST.filter((valueName) => guardValues[valueName] === undefined), ...LEDGER_NAMING_NAME_LIST.filter((namingName) => typeof ledgerNaming[namingName] !== 'string')];
	if (absentNameList.length > 0) {
		throw new Error(`rosettaGuardedModelCall: ${ownerName} gave no ${absentNameList.join(', ')}`);
	}
	const ownRecipeNameList = Object.freeze([ledgerNaming.recipeName, ledgerNaming.unansweredRecipeName]);
	let inFlightCount = 0;
	let reservedUsd = 0; // the worst case of every call in flight, counted against the day's ceiling until its real spend is ledgered

	// today's spend under this owner's recipes, read from the ledger. No ledger file yet is no spend yet.
	const spentTodayUsd = (done) => fs.readFile(guardValues.spendLedgerFilePath, 'utf8', (readError, ledgerText) => {
		if (readError) {
			done(readError.code === 'ENOENT' ? '' : `${ownerName}: the spend ledger would not read: ${readError.code}`, 0);
			return;
		}
		const todayText = utcDayTextOf(nowMs());
		const lineList = ledgerText.split('\n').filter((lineText) => lineText.trim() !== '' && lineText.includes(todayText));
		const parsedLineList = lineList.map((lineText) => {
			try { // a parse guard, not control flow: a line that is not JSON makes the day's spend unknown, which refuses below
				return JSON.parse(lineText);
			} catch (parseError) {
				return null;
			}
		});
		if (parsedLineList.includes(null)) {
			done(`${ownerName}: the spend ledger holds a line that is not JSON, so today's spend is unknown`);
			return;
		}
		done('', parsedLineList.filter((oneLine) => ownRecipeNameList.includes(oneLine.recipeName) && String(oneLine.buildStartedAtIso).startsWith(todayText)).reduce((soFar, oneLine) => soFar + oneLine.usd, 0));
	});

	const writeLedger = ({ recipeName, spendCallList, latencyMs }, done) => {
		const recordMade = spendRecordLib.judgeSpendRecordFor({ judgeName: PROVIDER_NAME_ANTHROPIC, judgeModel: forcedToolClient.wireModel, spendCallList, latencyMs, cacheHit: false, isDebugClient: false, spendPricer });
		if (recordMade.error) {
			done(`${ownerName}: the spend would not price: ${recordMade.error}`);
			return;
		}
		const judgeSpend = { asked: spendCallList.length, servedFromCache: 0, abstained: 0, ...spendRecordLib.judgeSpendTotalsWith({ judgeSpend: spendRecordLib.JUDGE_SPEND_TOTAL_SEED, spendRecord: recordMade.spendRecord }) };
		const ledgerMade = spendLedgerLib.spendLedgerFor({
			recipeName,
			buildRunStamp: crypto.createHash('sha256').update(crypto.randomBytes(16)).digest('hex').slice(0, 16),
			buildStartedAtIso: new Date(nowMs()).toISOString(),
			storeDirPath: ledgerNaming.storeDirName,
			bridgeSpendList: [{ bridgeName: ledgerNaming.bridgeName, pairKey: ledgerNaming.pairName, judgeSpend }],
			embeddingSpendRecordList: [],
			spendPricer,
		});
		if (ledgerMade.error) {
			done(`${ownerName}: the spend would not ledger: ${ledgerMade.error}`);
			return;
		}
		spendLedgerLib.appendLifetimeSpendLedger({ lifetimeLedgerFilePath: guardValues.spendLedgerFilePath, spendLedger: ledgerMade.spendLedger }, (appendError) => done(appendError ? `${ownerName}: the spend would not ledger: ${appendError}` : '', recordMade.spendRecord.usd));
	};

	const callGuarded = ({ systemPrompt, userPrompt, tool, maxTokens, worstCaseInputTokens }, done) => {
		if (inFlightCount >= guardValues.maxInFlight) {
			done('', { guardRefusalName: GUARD_REFUSAL_BUSY, inFlightCount });
			return;
		}
		const worstCaseCall = { provider: PROVIDER_NAME_ANTHROPIC, model: forcedToolClient.wireModel, inputTokens: worstCaseInputTokens, outputTokens: maxTokens };
		const worstCasePrice = spendPricer.usdFor(worstCaseCall);
		if (worstCasePrice.error) {
			done(`${ownerName}: judgeModelUnpriced: ${worstCasePrice.error}`);
			return;
		}
		// every attempt the client may bill, at its worst case (review N5)
		const reservedForCallUsd = worstCasePrice.usd * guardValues.maxAttempts;
		// held from here, before the ledger is read, so two calls that arrive together cannot both pass the ceiling
		inFlightCount += 1;
		reservedUsd += reservedForCallUsd;
		const finishWith = (finishError, finishOutcome) => {
			inFlightCount -= 1;
			reservedUsd -= reservedForCallUsd;
			done(finishError, finishOutcome);
		};
		const startedAtMs = nowMs();
		const taskList = new taskListPlus();

		taskList.push((args, next) => spentTodayUsd((readError, spentUsd) => {
			if (readError) {
				next(readError, { ...args, failedStepName: GUARD_STEP_NAME.ledgerRead });
				return;
			}
			if (spentUsd + reservedUsd > guardValues.dailyCeilingUsd) { // reservedUsd already holds this call's worst case
				next('skipRestOfPipe', { ...args, guardRefusalName: GUARD_REFUSAL_SPEND_CEILING });
				return;
			}
			next('', args);
		}));

		taskList.push((args, next) => forcedToolClient.callForcedTool({ systemPrompt, userPrompt, tool, maxTokens, maxRetries: guardValues.maxAttempts }, (callError, called) => {
			if (!callError) {
				next('', { ...args, called });
				return;
			}
			const failedArgs = { ...args, failedStepName: GUARD_STEP_NAME.modelCall };
			if (UNBILLED_VENDOR_ERROR_PATTERN.test(String(callError))) {
				next(`${ownerName}: the model call failed: ${callError}`, failedArgs);
				return;
			}
			writeLedger({ recipeName: ledgerNaming.unansweredRecipeName, spendCallList: Array.from({ length: guardValues.maxAttempts }, () => worstCaseCall), latencyMs: nowMs() - startedAtMs }, (ledgerError) => next(`${ownerName}: the model call failed: ${callError}${ledgerError ? `; and ${ledgerError}` : ''}`, failedArgs));
		}));

		taskList.push((args, next) => writeLedger({ recipeName: ledgerNaming.recipeName, spendCallList: args.called.spendCallList, latencyMs: nowMs() - startedAtMs }, (ledgerError, usd) => next(ledgerError, { ...args, usd, ...(ledgerError ? { failedStepName: GUARD_STEP_NAME.ledgerWrite } : {}) })));

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError === 'skipRestOfPipe') {
				finishWith('', { guardRefusalName: args.guardRefusalName });
				return;
			}
			if (pipeError) {
				finishWith(pipeError, { failedStepName: args.failedStepName });
				return;
			}
			finishWith('', { called: args.called, usd: args.usd, elapsedMs: nowMs() - startedAtMs });
		});
	};

	return { callGuarded, inFlightState: () => ({ inFlightCount, reservedUsd }) };
};

// ================================================================================
// ASSEMBLY: the forge's own client, prices, spend record and ledger

const buildForgeModelParts = ({ forgeAdapter, wireModel, anthropicConfigFilePath, spendPricingFilePath, spendLedgerFilePath, ownerLabel }, callback) => {
	if (forgeAdapter.refusalText) {
		callback({ refusalText: `the forge is not open: ${forgeAdapter.refusalText}` });
		return;
	}
	const judgeModules = forgeAdapter.loadJudgeModules();
	if (judgeModules.error) {
		callback({ refusalText: judgeModules.error });
		return;
	}
	if (!judgeModules.spendRecordLib || typeof judgeModules.spendRecordLib.judgeSpendRecordFor !== 'function') {
		callback({ refusalText: `the forge adapter gives no spendRecordLib, which ${ownerLabel} ledgers its spend with` });
		return;
	}
	const pricing = judgeModules.loadSpendPricing({ pricingFilePath: spendPricingFilePath });
	if (pricing.error) {
		callback({ refusalText: `${ownerLabel}'s prices would not read: ${pricing.error.message || pricing.error}` });
		return;
	}
	const made = judgeModules.createLlmClient({ configFilePath: anthropicConfigFilePath, wireModel });
	if (made.error) {
		callback({ refusalText: made.error });
		return;
	}
	const forcedToolClient = made.judgeClient;
	if (typeof forcedToolClient.callForcedTool !== 'function') {
		callback({ refusalText: `the forge's llmClient has no callForcedTool (it arrives with educoreForge feat/llmForcedTool); ${ownerLabel} is off` });
		return;
	}
	const priceRead = pricing.spendPricer.priceRowFor({ provider: PROVIDER_NAME_ANTHROPIC, model: forcedToolClient.wireModel });
	if (priceRead.error) {
		callback({ refusalText: `${ownerLabel}'s model ${forcedToolClient.wireModel} is refused as unpriced: ${priceRead.error.message || priceRead.error}` });
		return;
	}
	// the ledger will not create a home for itself; the judge makes the same directory
	fs.mkdir(path.dirname(spendLedgerFilePath), { recursive: true }, (mkdirError) => {
		if (mkdirError) {
			callback({ refusalText: `${ownerLabel}'s spend ledger has no home at ${spendLedgerFilePath}: ${mkdirError.code}` });
			return;
		}
		callback({ forgeModelParts: { forcedToolClient, spendPricer: pricing.spendPricer, spendRecordLib: judgeModules.spendRecordLib, spendLedgerLib: judgeModules.spendLedgerLib, judgeModules } });
	});
};

module.exports = { createGuardedModelCall, buildForgeModelParts, PROVIDER_NAME_ANTHROPIC, GUARD_REFUSAL_BUSY, GUARD_REFUSAL_SPEND_CEILING, GUARD_STEP_NAME };
