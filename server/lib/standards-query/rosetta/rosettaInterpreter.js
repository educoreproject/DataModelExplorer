'use strict';

// rosettaInterpreter — rung 3 of the Rosetta page's input ladder (WORKORDER-rosettaFreeInput-111026): a person's free text, turned by a cheap model into [{ name, definition }].
// The page shows the result for review and never goes on by itself. Rungs 1 and 2 (JSON, name/description lines) run in the browser, html/stores/rosettaFreeText.js.
//
//   rosettaInterpreterValuesOf(judgeConfigValues) → { interpreterValues } | { refusalText }. [rosetta-judge] holds the interpreter's keys beside the judge's, and shares its credential, price and ledger files.
//   buildRosettaInterpreter({ judgeConfigValues, forgeAdapter, nowMs, xLog }, callback({ rosettaInterpreter } | { refusalText })). The forge's client, prices, spend record and ledger; an unpriced model is refused here, at startup.
//   createRosettaInterpreter({ interpreterValues, forcedToolClient, spendPricer, spendRecordLib, spendLedgerLib, nowMs, xLog }) → { interpretText, interpreterFacts }
//   interpretText({ pastedText, refusedByName }, done(errText, answer)) → answer is { fieldList, droppedFieldCount, unusedLineCount, inputLineCount, interpretedBy }
//     or a refusal { refusedByName, refusalName, reason, retryAfterSeconds? }
//
// THE FORCED-TOOL CLIENT INTERFACE (the seam the tests stub): forcedToolClient.callForcedTool({ systemPrompt, userPrompt, tool, maxTokens, maxRetries }, done(errText, { toolInput, stopReason, spendCallList, attempts, model }))
//   and forcedToolClient.wireModel. toolInput is null when the answer was cut at max_tokens or carried no call of the tool: a partial answer is never read.
//
// RESTRUCTURE, NEVER INVENT, CHECKED HERE AND NOT TRUSTED, AND NOTHING THE MODEL WROTE IS RETURNED. The text and each offered name and definition are split into words
// (runs of letters and digits, each NFKC-normalised and case-folded). An offered name or definition must be a run of consecutive words of the text, starting and ending on
// word boundaries. What is returned is the SPAN OF THE PERSON'S OWN TEXT those words cover, from the first word's first character to the last word's last, its inner
// whitespace collapsed to single spaces: never the model's string. So a sign, a symbol, markup or an invisible character the model adds cannot reach the answer, and a
// fragment of a word cannot pass as a name. A field whose name is not such a run is dropped and counted, as is one whose definition has words that are not; a definition
// with no words at all ("", "...") is left off and the name kept. An exact repeat of a kept field is dropped and counted. If none survives, the answer is noFieldsFound.
// What the check cannot see: whether the text was DIVIDED well. A span of the text given as the wrong field's definition passes; the review step is what catches that.
//
// SPEND IS BOUNDED BEFORE ANY CALL: at most interpreterMaxInFlight interpretations at once on this instance (interpretBusy), held apart from the core's query slots; and the
// day's spend read from the ledger, plus the worst case of every call in flight and of this one, may not pass interpreterDailyCeilingUsd (interpretSpendCeiling). The output
// budget is sized from the input, so a small text that goes wrong costs little; a cut answer is refused and its spend ledgered.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();
const interpreterSettings = require('./rosettaInterpreterSettings.json');

const PROVIDER_NAME_ANTHROPIC = 'anthropic';
const STOP_REASON_MAX_TOKENS = 'max_tokens';
const INTEGER_SETTING_NAME_LIST = Object.freeze(['interpreterOutputTokenBudget', 'interpreterOutputTokenFloor', 'interpreterOutputTokensPerLine', 'interpreterMaxInputChars', 'interpreterMaxInputLines', 'interpreterMaxLineChars', 'interpreterMaxAttempts', 'interpreterMaxInFlight']);
const POSITIVE_NUMBER_SETTING_NAME_LIST = Object.freeze(['interpreterOutputTokensPerInputChar', 'interpreterDailyCeilingUsd']);
const TEXT_SETTING_NAME_LIST = Object.freeze(['judgeProviderName', 'interpreterWireModel', 'anthropicConfigFilePath', 'spendPricingFilePath', 'spendLedgerFilePath']);
const WORD_PATTERN = /[\p{L}\p{N}]+/gu;
const LINE_BREAK_PATTERN = /\r\n|\r|\n/;
const BUSY_RETRY_SECONDS = 5;
// the prompt's own words, around the text, in tokens: an upper bound, so the worst-case estimate is never under the bill
const PROMPT_OVERHEAD_TOKENS = 1000;
const UNBILLED_VENDOR_ERROR_PATTERN = new RegExp(interpreterSettings.unbilledVendorErrorPattern);
const PROMPT_MARKER_PATTERN = new RegExp(interpreterSettings.promptMarkerPattern, 'gi');
const LEDGER_RECIPE_NAME_LIST = Object.freeze([interpreterSettings.ledgerRecipeName, interpreterSettings.ledgerUnansweredRecipeName]);

const rosettaInterpreterValuesOf = (judgeConfigValues) => {
	const badSettingList = [
		...INTEGER_SETTING_NAME_LIST.filter((settingName) => !/^[1-9][0-9]*$/.test(String(judgeConfigValues[settingName]))),
		...POSITIVE_NUMBER_SETTING_NAME_LIST.filter((settingName) => !/^[0-9]+(\.[0-9]+)?$/.test(String(judgeConfigValues[settingName])) || !(Number(judgeConfigValues[settingName]) > 0)),
		...TEXT_SETTING_NAME_LIST.filter((settingName) => typeof judgeConfigValues[settingName] !== 'string' || judgeConfigValues[settingName].trim() === ''),
	];
	if (badSettingList.length > 0) {
		return { refusalText: `[rosetta-judge] must give positive integers ${INTEGER_SETTING_NAME_LIST.join(', ')}, positive numbers ${POSITIVE_NUMBER_SETTING_NAME_LIST.join(', ')} and texts ${TEXT_SETTING_NAME_LIST.join(', ')}; absent or bad: ${badSettingList.join(', ')}` };
	}
	if (judgeConfigValues.judgeProviderName !== PROVIDER_NAME_ANTHROPIC) {
		return { refusalText: `[rosetta-judge] judgeProviderName is '${judgeConfigValues.judgeProviderName}'; the interpreter calls ${PROVIDER_NAME_ANTHROPIC}` };
	}
	return {
		interpreterValues: {
			...[...INTEGER_SETTING_NAME_LIST, ...POSITIVE_NUMBER_SETTING_NAME_LIST].reduce((soFar, settingName) => ({ ...soFar, [settingName]: Number(judgeConfigValues[settingName]) }), {}),
			...TEXT_SETTING_NAME_LIST.reduce((soFar, settingName) => ({ ...soFar, [settingName]: judgeConfigValues[settingName] }), {}),
		},
	};
};

// ================================================================================
// THE CHECK: pure, so a test drives it with no model at all

const foldedWordOf = (wordText) => wordText.normalize('NFKC').toLowerCase();
// the text's words, each with where it stands in the text as typed
const positionedWordListOf = (anyText) => [...String(anyText).matchAll(WORD_PATTERN)].map((wordMatch) => ({ foldedWord: foldedWordOf(wordMatch[0]), startIndex: wordMatch.index, endIndex: wordMatch.index + wordMatch[0].length }));
// an offered string's words; it is normalised first, so a model's full-width or ligature spelling splits as the text's own would
const offeredWordListOf = (offeredText) => (String(offeredText).normalize('NFKC').match(WORD_PATTERN) || []).map(foldedWordOf);
const nonBlankLineListOf = (pastedText) => String(pastedText).split(LINE_BREAK_PATTERN).filter((lineText) => lineText.trim() !== '');

const fieldCheckFor = (pastedText) => {
	const pastedWordList = positionedWordListOf(pastedText);
	// punctuation at either end of the offered string is kept only where the TEXT has those same characters right beside the span ("born." keeps the text's full stop;
	// "-100" gains no minus the text does not hold). Never a character of the model's: the characters added are read from the text.
	const textTrailingCharsOf = ({ spanEndIndex, offeredText }) => {
		const offeredTrailText = (String(offeredText).normalize('NFKC').match(/[^\p{L}\p{N}\s]+$/u) || [''])[0];
		const textTrailText = String(pastedText).slice(spanEndIndex, spanEndIndex + offeredTrailText.length);
		return textTrailText === offeredTrailText ? textTrailText : '';
	};
	const textLeadingCharsOf = ({ spanStartIndex, offeredText }) => {
		const offeredLeadText = (String(offeredText).normalize('NFKC').match(/^[^\p{L}\p{N}\s]+/u) || [''])[0];
		const textLeadText = String(pastedText).slice(Math.max(0, spanStartIndex - offeredLeadText.length), spanStartIndex);
		return textLeadText === offeredLeadText ? textLeadText : '';
	};
	// the first run of the text's words equal to the offered string's words, as the span of the text it covers; '' when there is none
	const spanOf = (offeredText) => {
		const offeredWordList = offeredWordListOf(offeredText);
		const lastStartIndex = pastedWordList.length - offeredWordList.length;
		for (let startIndex = 0; startIndex <= lastStartIndex; startIndex += 1) {
			if (offeredWordList.every((offeredWord, wordOffset) => pastedWordList[startIndex + wordOffset].foldedWord === offeredWord)) {
				const spanStartIndex = pastedWordList[startIndex].startIndex;
				const spanEndIndex = pastedWordList[startIndex + offeredWordList.length - 1].endIndex;
				const spanText = `${textLeadingCharsOf({ spanStartIndex, offeredText })}${String(pastedText).slice(spanStartIndex, spanEndIndex)}${textTrailingCharsOf({ spanEndIndex, offeredText })}`;
				return spanText.replace(/\s+/g, ' ');
			}
		}
		return '';
	};
	// { field } (the text's spans) or { failureName }
	const readingOf = (offeredField) => {
		if (offeredField === null || typeof offeredField !== 'object' || Array.isArray(offeredField)) {
			return { failureName: 'notAField' };
		}
		const nameWordList = typeof offeredField.name === 'string' ? offeredWordListOf(offeredField.name) : [];
		if (nameWordList.length === 0) {
			return { failureName: 'nameAbsent' };
		}
		const nameSpan = spanOf(offeredField.name);
		if (!nameSpan) {
			return { failureName: 'nameNotInText' };
		}
		if (offeredField.definition === undefined) {
			return { field: { name: nameSpan } };
		}
		if (typeof offeredField.definition !== 'string') {
			return { failureName: 'definitionNotText' };
		}
		const definitionWordList = offeredWordListOf(offeredField.definition);
		if (definitionWordList.length === 0) {
			return { field: { name: nameSpan } };
		}
		const definitionSpan = spanOf(offeredField.definition);
		return definitionSpan ? { field: { name: nameSpan, definition: definitionSpan } } : { failureName: 'definitionNotInText' };
	};
	return { readingOf, spanOf };
};

// a non-blank line of the text is used when a kept field's name or definition overlaps its words as a run (a definition may wrap across lines, or a line may hold a whole definition and more)
const unusedLineCountOf = ({ pastedText, keptFieldList }) => {
	const wordRunOf = (anyText) => ` ${offeredWordListOf(anyText).join(' ')} `;
	const keptWordRunList = keptFieldList.flatMap((oneField) => [oneField.name, ...(oneField.definition ? [oneField.definition] : [])]).map(wordRunOf);
	const isUsed = (lineText) => {
		const lineWordRun = wordRunOf(lineText);
		return lineWordRun.trim() !== '' && keptWordRunList.some((keptWordRun) => keptWordRun.includes(lineWordRun) || lineWordRun.includes(keptWordRun));
	};
	return nonBlankLineListOf(pastedText).filter((lineText) => !isUsed(lineText)).length;
};

const checkedFieldsOf = ({ pastedText, toolInput }) => {
	const offeredFieldList = toolInput && Array.isArray(toolInput.fieldList) ? toolInput.fieldList : [];
	const { readingOf } = fieldCheckFor(pastedText);
	const keptFieldList = [];
	const keptFieldTextSet = new Set();
	const droppedFailureList = [];
	offeredFieldList.map(readingOf).forEach(({ field, failureName }) => {
		if (failureName) {
			droppedFailureList.push(failureName);
			return;
		}
		const fieldText = JSON.stringify([field.name, field.definition]);
		if (keptFieldTextSet.has(fieldText)) {
			droppedFailureList.push('duplicate');
			return;
		}
		keptFieldTextSet.add(fieldText);
		keptFieldList.push(field);
	});
	return { keptFieldList, droppedFieldCount: droppedFailureList.length, droppedFailureList, offeredCount: offeredFieldList.length };
};

// the output budget, from the input: the answer echoes the text as JSON, and a thinking model bills its thinking as output too. Never more than the configured budget.
const outputTokenBudgetFor = ({ interpreterValues, pastedText }) => Math.min(interpreterValues.interpreterOutputTokenBudget, Math.ceil(interpreterValues.interpreterOutputTokenFloor + interpreterValues.interpreterOutputTokensPerLine * nonBlankLineListOf(pastedText).length + interpreterValues.interpreterOutputTokensPerInputChar * pastedText.length));

// ================================================================================
// THE INTERPRETER

const createRosettaInterpreter = ({ interpreterValues, forcedToolClient, spendPricer, spendRecordLib, spendLedgerLib, nowMs, xLog }) => {
	const systemPrompt = interpreterSettings.systemPromptLineList.join('\n');
	const interpretedBy = { provider: PROVIDER_NAME_ANTHROPIC, model: forcedToolClient.wireModel };
	const refusalOf = (refusedByName, refusalName, reason, extraFields = {}) => ({ refusedByName, refusalName, reason, ...extraFields });
	let inFlightCount = 0;
	let reservedUsd = 0; // the worst case of every call in flight, counted against the day's ceiling until its real spend is ledgered

	// the size caps, in characters, in lines and in one line's characters; an empty text is refused before anything is sent
	const inputRefusalFor = ({ pastedText, refusedByName }) => {
		if (typeof pastedText !== 'string' || pastedText.trim() === '') {
			return refusalOf(refusedByName, 'noSubmission', 'there is no text to interpret');
		}
		if (pastedText.length > interpreterValues.interpreterMaxInputChars) {
			return refusalOf(refusedByName, 'inputTooLong', `the text is ${pastedText.length} characters; the AI reads at most ${interpreterValues.interpreterMaxInputChars}`, { fieldName: 'text', maxLength: interpreterValues.interpreterMaxInputChars });
		}
		const lineList = nonBlankLineListOf(pastedText); // a trailing newline or a blank line is no line of fields; the character cap bounds them
		if (lineList.length > interpreterValues.interpreterMaxInputLines) {
			return refusalOf(refusedByName, 'inputTooLong', `the text is ${lineList.length} lines; the AI reads at most ${interpreterValues.interpreterMaxInputLines}`, { fieldName: 'text', maxLineCount: interpreterValues.interpreterMaxInputLines });
		}
		const longLineIndex = lineList.findIndex((lineText) => lineText.length > interpreterValues.interpreterMaxLineChars);
		if (longLineIndex !== -1) {
			return refusalOf(refusedByName, 'inputTooLong', `line ${longLineIndex + 1} is ${lineList[longLineIndex].length} characters; the AI reads lines of at most ${interpreterValues.interpreterMaxLineChars}`, { fieldName: 'text', maxLineChars: interpreterValues.interpreterMaxLineChars });
		}
		return null;
	};

	const utcDayTextOf = (anyMs) => new Date(anyMs).toISOString().slice(0, 10);
	// today's interpret spend, read from the ledger: every process that writes it is counted, and a restart forgets nothing. No ledger file yet is no spend yet.
	const spentTodayUsd = (done) => fs.readFile(interpreterValues.spendLedgerFilePath, 'utf8', (readError, ledgerText) => {
		if (readError) {
			done(readError.code === 'ENOENT' ? '' : `rosettaInterpreter: the spend ledger would not read: ${readError.code}`, 0);
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
			done('rosettaInterpreter: the spend ledger holds a line that is not JSON, so today\'s spend is unknown');
			return;
		}
		done('', parsedLineList.filter((oneLine) => LEDGER_RECIPE_NAME_LIST.includes(oneLine.recipeName) && String(oneLine.buildStartedAtIso).startsWith(todayText)).reduce((soFar, oneLine) => soFar + oneLine.usd, 0));
	});

	// one line in the lifetime ledger the judge writes to, built by the forge's own spend record and totals. The pasted text never reaches it: the stamp is a hash of a fresh id.
	const writeLedger = ({ recipeName, spendCallList, latencyMs }, done) => {
		const recordMade = spendRecordLib.judgeSpendRecordFor({ judgeName: PROVIDER_NAME_ANTHROPIC, judgeModel: forcedToolClient.wireModel, spendCallList, latencyMs, cacheHit: false, isDebugClient: false, spendPricer });
		if (recordMade.error) {
			done(`rosettaInterpreter: the spend would not price: ${recordMade.error}`);
			return;
		}
		const judgeSpend = { asked: spendCallList.length, servedFromCache: 0, abstained: 0, ...spendRecordLib.judgeSpendTotalsWith({ judgeSpend: spendRecordLib.JUDGE_SPEND_TOTAL_SEED, spendRecord: recordMade.spendRecord }) };
		const ledgerMade = spendLedgerLib.spendLedgerFor({
			recipeName,
			buildRunStamp: crypto.createHash('sha256').update(crypto.randomBytes(16)).digest('hex').slice(0, 16),
			buildStartedAtIso: new Date(nowMs()).toISOString(),
			storeDirPath: interpreterSettings.ledgerStoreDirName,
			bridgeSpendList: [{ bridgeName: interpreterSettings.ledgerBridgeName, pairKey: interpreterSettings.ledgerPairName, judgeSpend }],
			embeddingSpendRecordList: [],
			spendPricer,
		});
		if (ledgerMade.error) {
			done(`rosettaInterpreter: the spend would not ledger: ${ledgerMade.error}`);
			return;
		}
		spendLedgerLib.appendLifetimeSpendLedger({ lifetimeLedgerFilePath: interpreterValues.spendLedgerFilePath, spendLedger: ledgerMade.spendLedger }, (appendError) => done(appendError ? `rosettaInterpreter: the spend would not ledger: ${appendError}` : '', recordMade.spendRecord.usd));
	};

	const interpretText = ({ pastedText, refusedByName }, done) => {
		const inputRefusal = inputRefusalFor({ pastedText, refusedByName });
		if (inputRefusal) {
			done('', inputRefusal);
			return;
		}
		if (inFlightCount >= interpreterValues.interpreterMaxInFlight) {
			done('', refusalOf(refusedByName, 'interpretBusy', `${inFlightCount} interpretations are running, the most this service runs at once; retry in ${BUSY_RETRY_SECONDS} seconds`, { retryAfterSeconds: BUSY_RETRY_SECONDS }));
			return;
		}
		const maxTokens = outputTokenBudgetFor({ interpreterValues, pastedText });
		const worstCaseCall = { provider: PROVIDER_NAME_ANTHROPIC, model: forcedToolClient.wireModel, inputTokens: pastedText.length + PROMPT_OVERHEAD_TOKENS, outputTokens: maxTokens };
		const worstCasePrice = spendPricer.usdFor(worstCaseCall);
		if (worstCasePrice.error) {
			done(`rosettaInterpreter: judgeModelUnpriced: ${worstCasePrice.error}`);
			return;
		}
		// held from here, before the ledger is read, so two calls that arrive together cannot both pass the ceiling
		inFlightCount += 1;
		reservedUsd += worstCasePrice.usd;
		const finishWith = (finishError, finishAnswer) => {
			inFlightCount -= 1;
			reservedUsd -= worstCasePrice.usd;
			done(finishError, finishAnswer);
		};
		const startedAtMs = nowMs();
		const taskList = new taskListPlus();
		const stopWith = (args, next, refusal) => next('skipRestOfPipe', { ...args, refusal });

		taskList.push((args, next) => spentTodayUsd((readError, spentUsd) => {
			if (readError) {
				next(readError, args);
				return;
			}
			const committedUsd = spentUsd + reservedUsd; // reservedUsd already holds this call's worst case
			if (committedUsd > interpreterValues.interpreterDailyCeilingUsd) {
				stopWith(args, next, refusalOf(refusedByName, 'interpretSpendCeiling', `today's spend on interpreting free text has reached the ceiling of ${interpreterValues.interpreterDailyCeilingUsd} USD; it opens again at 00:00 UTC. JSON and plain name/description lines still work: they need no AI`));
				return;
			}
			next('', args);
		}));

		taskList.push((args, next) => forcedToolClient.callForcedTool({
			systemPrompt,
			userPrompt: interpreterSettings.userPromptTemplate.replace(interpreterSettings.pastedTextPlaceholder, () => pastedText.replace(PROMPT_MARKER_PATTERN, interpreterSettings.promptMarkerReplacement)),
			tool: interpreterSettings.tool,
			maxTokens,
			maxRetries: interpreterValues.interpreterMaxAttempts,
		}, (callError, called) => {
			if (!callError) {
				next('', { ...args, called });
				return;
			}
			// a failure the vendor may still have billed is ledgered at its worst case, so the ceiling counts it; then the call fails
			if (UNBILLED_VENDOR_ERROR_PATTERN.test(String(callError))) {
				next(`rosettaInterpreter: the model call failed: ${callError}`, args);
				return;
			}
			writeLedger({ recipeName: interpreterSettings.ledgerUnansweredRecipeName, spendCallList: Array.from({ length: interpreterValues.interpreterMaxAttempts }, () => worstCaseCall), latencyMs: nowMs() - startedAtMs }, (ledgerError) => next(`rosettaInterpreter: the model call failed: ${callError}${ledgerError ? `; and ${ledgerError}` : ''}`, args));
		}));

		taskList.push((args, next) => writeLedger({ recipeName: interpreterSettings.ledgerRecipeName, spendCallList: args.called.spendCallList, latencyMs: nowMs() - startedAtMs }, (ledgerError, usd) => next(ledgerError, { ...args, usd })));

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError === 'skipRestOfPipe') {
				finishWith('', args.refusal);
				return;
			}
			if (pipeError) {
				finishWith(pipeError);
				return;
			}
			const { called, usd } = args;
			const elapsedMs = nowMs() - startedAtMs;
			if (called.toolInput === null) {
				xLog.error(`rosettaInterpreter: no fields read (stopReason ${called.stopReason}, budget ${maxTokens}); ${usd.toFixed(6)} USD spent`);
				const wasCut = called.stopReason === STOP_REASON_MAX_TOKENS;
				finishWith('', refusalOf(refusedByName, 'noFieldsFound', wasCut ? 'the AI\'s answer was cut off before it finished, so none of it is used; send a shorter text, or fewer fields at a time' : 'the AI did not answer with a list of fields'));
				return;
			}
			const { keptFieldList, droppedFieldCount, droppedFailureList, offeredCount } = checkedFieldsOf({ pastedText, toolInput: called.toolInput });
			xLog.status(`rosettaInterpreter: ${offeredCount} offered, ${keptFieldList.length} kept, ${droppedFieldCount} dropped (${droppedFailureList.join(', ') || 'none'}), budget ${maxTokens}, ${usd.toFixed(6)} USD, ${elapsedMs} ms`);
			if (keptFieldList.length === 0) {
				finishWith('', refusalOf(refusedByName, 'noFieldsFound', offeredCount === 0 ? 'the AI found no fields in the text' : `the AI offered ${offeredCount} fields, and none of them was in your text word for word, so none is used`, { droppedFieldCount }));
				return;
			}
			finishWith('', {
				fieldList: keptFieldList,
				droppedFieldCount,
				unusedLineCount: unusedLineCountOf({ pastedText, keptFieldList }),
				inputLineCount: nonBlankLineListOf(pastedText).length,
				interpretedBy,
			});
		});
	};

	return { interpretText, interpreterFacts: { ...interpretedBy, maxInputChars: interpreterValues.interpreterMaxInputChars, maxInputLines: interpreterValues.interpreterMaxInputLines }, inFlightState: () => ({ inFlightCount, reservedUsd }) };
};

// ================================================================================
// ASSEMBLY: the forge's own client, prices, spend record and ledger, as the judge uses them

const buildRosettaInterpreter = ({ judgeConfigValues, forgeAdapter, nowMs, xLog }, callback) => {
	const valuesRead = rosettaInterpreterValuesOf(judgeConfigValues || {});
	if (valuesRead.refusalText) {
		callback({ refusalText: valuesRead.refusalText });
		return;
	}
	const { interpreterValues } = valuesRead;
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
		callback({ refusalText: 'the forge adapter gives no spendRecordLib, which the interpreter ledgers its spend with' });
		return;
	}
	const pricing = judgeModules.loadSpendPricing({ pricingFilePath: interpreterValues.spendPricingFilePath });
	if (pricing.error) {
		callback({ refusalText: `the interpreter's prices would not read: ${pricing.error.message || pricing.error}` });
		return;
	}
	const made = judgeModules.createLlmClient({ configFilePath: interpreterValues.anthropicConfigFilePath, wireModel: interpreterValues.interpreterWireModel });
	if (made.error) {
		callback({ refusalText: made.error });
		return;
	}
	const forcedToolClient = made.judgeClient;
	if (typeof forcedToolClient.callForcedTool !== 'function') {
		callback({ refusalText: 'the forge\'s llmClient has no callForcedTool (it arrives with educoreForge feat/llmForcedTool); the interpreter is off' });
		return;
	}
	const priceRead = pricing.spendPricer.priceRowFor({ provider: PROVIDER_NAME_ANTHROPIC, model: forcedToolClient.wireModel });
	if (priceRead.error) {
		callback({ refusalText: `the interpreter's model ${forcedToolClient.wireModel} is refused as unpriced: ${priceRead.error.message || priceRead.error}` });
		return;
	}
	// the ledger will not create a home for itself; the judge makes the same directory
	fs.mkdir(path.dirname(interpreterValues.spendLedgerFilePath), { recursive: true }, (mkdirError) => {
		if (mkdirError) {
			callback({ refusalText: `the interpreter's spend ledger has no home at ${interpreterValues.spendLedgerFilePath}: ${mkdirError.code}` });
			return;
		}
		callback({ rosettaInterpreter: createRosettaInterpreter({ interpreterValues, forcedToolClient, spendPricer: pricing.spendPricer, spendRecordLib: judgeModules.spendRecordLib, spendLedgerLib: judgeModules.spendLedgerLib, nowMs, xLog }) });
	});
};

module.exports = { buildRosettaInterpreter, createRosettaInterpreter, rosettaInterpreterValuesOf, fieldCheckFor, checkedFieldsOf, unusedLineCountOf, outputTokenBudgetFor };
