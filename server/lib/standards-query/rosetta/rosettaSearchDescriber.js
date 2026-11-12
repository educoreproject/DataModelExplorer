'use strict';

// rosettaSearchDescriber — a field sent with no description gets a SEARCH DESCRIPTION: one sentence a cheap model writes from the field's name (and path), which retrieval
// embeds as the field's second text (WORKORDER-rosettaSearchDescription-111226, TQ Q104 option 1). One text alone gives every card at most one vote, so the rank falls to
// cosine, and a person's everyday words ("classes a student takes") rarely sit near a standard's own ("course section").
//
//   rosettaSearchDescriberValuesOf({ judgeConfigValues, fuseConfigValues }) → { describerValues } | { isOff: true } | { refusalText }. Its keys are [rosetta-judge]'s searchDescriber…;
//     the vendor, credential, prices and ledger are the judge's and the interpreter's; the cache's retention is [rosetta-fuse]'s jobRetentionDays, as for job text.
//   buildRosettaSearchDescriber({ judgeConfigValues, fuseConfigValues, storeHandle, forgeAdapter, nowMs, xLog }, callback({ searchDescriber }))
//     ALWAYS answers a describer. Off, or not buildable, it is one that names why for every bare field (describerOff, describerNotConfigured), and retrieval goes on as before.
//     The cache's retention sweep is armed FIRST, whatever the switch says, so sentences already kept still age out when the describer is turned off (review S2).
//   createRosettaSearchDescriber({ describerValues, forgeModelParts, identifierScanList, searchDescriptionCache, nowMs, xLog }) → searchDescriber
//   searchDescriber.describeFieldList({ fieldList, isAnonymous }, done('', { describedList })): describedList[i] is undefined for a field that has a description, else
//     { searchDescription: { descriptionText, writtenByModel } } or { searchDescriptionAbsent: absentName, searchDescriptionAbsentReason: words }. It never errs: a failure is a name.
//     isAnonymous (required, true or false) picks the pot that pays: a visitor who is not signed in, or a signed-in person and their judged jobs (review S3).
//   searchDescriptionFieldsOf(described) → the fields an answer adds for one field (none, the description, or its absence named): the one place their shape is made.
//
// WHAT THE DESCRIPTION IS NOT. It is never the person's: never their definition, never in their field list, never where requestDefinition goes. The judge SEES it (TQ
// Q110, reversing the order's first ruling), but only as its own subject line saying a model wrote it (rosettaJudgeEngine, judgedSettings.searchDescriptionSubjectPrefix),
// never as the field's description; and a judgment made with it says so (judgedWithSearchDescription).
//
// ONE FIELD, ONE CALL (review S1). A sentence is cached for every visitor who sends the same name and path, so it must depend on that name and path alone: each field is
// described in a call of its own, never beside another visitor-chosen field that could shape it. A request's calls run searchDescriberCallsAtOnce at a time, inside its pot's
// own in-flight cap; a call past the cap names describerBusy for its field.
// BOUNDED BEFORE EACH CALL (rosettaGuardedModelCall): its pot's in-flight cap (never the core's query slots, never the interpreter's), its pot's daily USD ceiling read from
// the ledger under its own recipes plus the worst case of every call in flight, and an output budget for one field. A sentence holding a hub identifier (the judge's own
// per-hub scan, rosettaJudgeEngine.hubIdentifierScanFor) is dropped and named. Names, paths, sentences and the vendor's error text never reach a log line or the ledger.

const crypto = require('crypto');
const describerSettings = require('./rosettaSearchDescriberSettings.json');
const { reasonOf } = require('./rosettaReasonWords');
const { createGuardedModelCall, buildForgeModelParts, PROVIDER_NAME_ANTHROPIC, GUARD_REFUSAL_BUSY, GUARD_REFUSAL_SPEND_CEILING, GUARD_STEP_NAME } = require('./rosettaGuardedModelCall');
const { createSearchDescriptionCache, descriptionRefIdOf } = require('./searchDescriptionCache');
const { judgedSettings, hubIdentifierScanFor, surfacesOfPart } = require('./rosettaJudgeEngine');

const MODULE_NAME = 'rosettaSearchDescriber';
const MILLISECONDS_PER_DAY = 86400000;
const STOP_REASON_MAX_TOKENS = 'max_tokens';
const ONLY_FIELD_NUMBER = 1;
const IS_ON_TEXT_BY_VALUE = Object.freeze({ true: true, false: false });
const INTEGER_SETTING_NAME_LIST = Object.freeze(['searchDescriberOutputTokenBudget', 'searchDescriberMaxFieldsPerRequest', 'searchDescriberMaxDescriptionChars', 'searchDescriberMaxAttempts', 'searchDescriberMaxInFlight', 'searchDescriberCallsAtOnce']);
const POSITIVE_NUMBER_SETTING_NAME_LIST = Object.freeze(['searchDescriberDailyCeilingUsd', 'searchDescriberAnonymousDailyCeilingUsd']);
const TEXT_SETTING_NAME_LIST = Object.freeze(['judgeProviderName', 'searchDescriberWireModel', 'anthropicConfigFilePath', 'spendPricingFilePath', 'spendLedgerFilePath']);
const RETENTION_SETTING_NAME = 'jobRetentionDays';
// DATA: the two pots, by whether the caller is anonymous: the ceiling's setting and the ledger recipes that ceiling reads
const POT_BY_IS_ANONYMOUS = Object.freeze({
	true: Object.freeze({ potName: 'anonymous', dailyCeilingSettingName: 'searchDescriberAnonymousDailyCeilingUsd' }),
	false: Object.freeze({ potName: 'signedIn', dailyCeilingSettingName: 'searchDescriberDailyCeilingUsd' }),
});
const SURFACE_PART_NAME = 'searchDescription';
const HAS_LETTER_PATTERN = /\p{L}/u;
const HTTP_STATUS_IN_VENDOR_ERROR_PATTERN = /\((\d{3})\)/;
// the field goes to the model as JSON with its angle brackets escaped, so no name can close the prompt's <field_list> block
const ANGLE_BRACKET_PATTERN = /[<>]/g;
const escapedAngleOf = (angleText) => (angleText === '<' ? '\\u003c' : '\\u003e');

// THE PROMPT VERSION is a hash of the prompt itself: changing a word of the prompt or the tool is a new version, and the cache never serves a sentence an older prompt wrote
const PROMPT_VERSION = `${describerSettings.promptVersionPrefix}${crypto.createHash('sha256').update(JSON.stringify([describerSettings.systemPromptLineList, describerSettings.userPromptTemplate, describerSettings.tool])).digest('hex').slice(0, describerSettings.promptVersionHashLength)}`;

const absentOf = (absentName, valueBySlotName) => ({ searchDescriptionAbsent: absentName, searchDescriptionAbsentReason: reasonOf(absentName, valueBySlotName) });
const isBareField = (oneField) => !oneField.definition;
const refuseUnlessCallerKindGiven = (isAnonymous) => {
	if (typeof isAnonymous !== 'boolean') {
		throw new Error(`${MODULE_NAME}: describeFieldList needs isAnonymous, true or false, to know which pot pays; it was given ${JSON.stringify(isAnonymous)}`);
	}
};

const searchDescriptionFieldsOf = (described) => {
	if (described === undefined) {
		return {};
	}
	if (described.searchDescription) {
		return { searchDescription: { descriptionText: described.searchDescription.descriptionText, writtenByModel: described.searchDescription.writtenByModel } };
	}
	return { searchDescriptionAbsent: described.searchDescriptionAbsent, searchDescriptionAbsentReason: described.searchDescriptionAbsentReason };
};

// the cache's retention, read alone: the sweep needs it even when the describer is off
const cacheRetentionDaysOf = (fuseConfigValues) => (/^[1-9][0-9]*$/.test(String(fuseConfigValues[RETENTION_SETTING_NAME])) ? { cacheRetentionDays: Number(fuseConfigValues[RETENTION_SETTING_NAME]) } : { refusalText: `[rosetta-fuse] ${RETENTION_SETTING_NAME} keeps the search describer's cache as long as job text; it is ${JSON.stringify(fuseConfigValues[RETENTION_SETTING_NAME])}` });

const rosettaSearchDescriberValuesOf = ({ judgeConfigValues, fuseConfigValues }) => {
	const isOnText = String(judgeConfigValues.searchDescriberIsOn);
	if (!(isOnText in IS_ON_TEXT_BY_VALUE)) {
		return { refusalText: `[rosetta-judge] searchDescriberIsOn must be true or false; it is ${JSON.stringify(judgeConfigValues.searchDescriberIsOn)}` };
	}
	if (!IS_ON_TEXT_BY_VALUE[isOnText]) {
		return { isOff: true };
	}
	const badSettingList = [
		...INTEGER_SETTING_NAME_LIST.filter((settingName) => !/^[1-9][0-9]*$/.test(String(judgeConfigValues[settingName]))),
		...POSITIVE_NUMBER_SETTING_NAME_LIST.filter((settingName) => !/^[0-9]+(\.[0-9]+)?$/.test(String(judgeConfigValues[settingName])) || !(Number(judgeConfigValues[settingName]) > 0)),
		...TEXT_SETTING_NAME_LIST.filter((settingName) => typeof judgeConfigValues[settingName] !== 'string' || judgeConfigValues[settingName].trim() === ''),
	];
	if (badSettingList.length > 0) {
		return { refusalText: `[rosetta-judge] must give positive integers ${INTEGER_SETTING_NAME_LIST.join(', ')}, positive numbers ${POSITIVE_NUMBER_SETTING_NAME_LIST.join(', ')} and texts ${TEXT_SETTING_NAME_LIST.join(', ')}; absent or bad: ${badSettingList.join(', ')}` };
	}
	const retentionRead = cacheRetentionDaysOf(fuseConfigValues);
	if (retentionRead.refusalText) {
		return { refusalText: retentionRead.refusalText };
	}
	if (judgeConfigValues.judgeProviderName !== PROVIDER_NAME_ANTHROPIC) {
		return { refusalText: `[rosetta-judge] judgeProviderName is '${judgeConfigValues.judgeProviderName}'; the search describer calls ${PROVIDER_NAME_ANTHROPIC}` };
	}
	if (Number(judgeConfigValues.searchDescriberCallsAtOnce) > Number(judgeConfigValues.searchDescriberMaxInFlight)) {
		return { refusalText: `[rosetta-judge] searchDescriberCallsAtOnce (${judgeConfigValues.searchDescriberCallsAtOnce}) may not pass searchDescriberMaxInFlight (${judgeConfigValues.searchDescriberMaxInFlight}): one request would always find itself busy` };
	}
	return {
		describerValues: {
			...[...INTEGER_SETTING_NAME_LIST, ...POSITIVE_NUMBER_SETTING_NAME_LIST].reduce((soFar, settingName) => ({ ...soFar, [settingName]: Number(judgeConfigValues[settingName]) }), {}),
			...TEXT_SETTING_NAME_LIST.reduce((soFar, settingName) => ({ ...soFar, [settingName]: judgeConfigValues[settingName] }), {}),
			cacheRetentionDays: retentionRead.cacheRetentionDays,
		},
	};
};

// THE ANSWER'S CHECK: one sentence of letters within the length cap, for field number 1. Anything else is not used.
const checkedDescriptionOf = ({ toolInput, maxDescriptionChars }) => {
	const offeredList = toolInput && Array.isArray(toolInput.descriptionList) ? toolInput.descriptionList : [];
	const offered = offeredList.find((oneOffered) => oneOffered && typeof oneOffered === 'object' && oneOffered.fieldNumber === ONLY_FIELD_NUMBER && typeof oneOffered.searchDescription === 'string');
	if (!offered) {
		return '';
	}
	const descriptionText = offered.searchDescription.replace(/\s+/g, ' ').trim();
	return descriptionText !== '' && descriptionText.length <= maxDescriptionChars && HAS_LETTER_PATTERN.test(descriptionText) ? descriptionText : '';
};

// the prompt for one field: its name and path alone, so the sentence depends on nothing else (review S1)
const userPromptOf = ({ fieldName, fieldPath }) => describerSettings.userPromptTemplate.replace(describerSettings.fieldListJsonPlaceholder, () => JSON.stringify([{ fieldNumber: ONLY_FIELD_NUMBER, name: fieldName, ...(fieldPath === undefined ? {} : { path: fieldPath }) }]).replace(ANGLE_BRACKET_PATTERN, escapedAngleOf));

// the first hub whose identifier scan finds an identifier in the sentence, or null
const identifierHitIn = ({ identifierScanList, descriptionText }) => {
	const surfaceByName = surfacesOfPart({ partName: SURFACE_PART_NAME, partText: descriptionText });
	return identifierScanList.map((identifierScan) => identifierScan.firstHitIn(surfaceByName)).find(Boolean) || null;
};

// a describer that answers the same absence for every bare field: off, or not built
const searchDescriberAbsentOf = (absentName) => ({
	describeFieldList: ({ fieldList, isAnonymous }, done) => {
		refuseUnlessCallerKindGiven(isAnonymous);
		done('', { describedList: fieldList.map((oneField) => (isBareField(oneField) ? absentOf(absentName) : undefined)) });
	},
	describerFacts: { absentName },
});

// at most callsAtOnce of the items at a time; done() when every one has finished. Each workOnOne never errs.
const eachAtMostAtOnce = ({ itemList, callsAtOnce, workOnOne }, done) => {
	let nextIndex = 0;
	let finishedCount = 0;
	if (itemList.length === 0) {
		done();
		return;
	}
	const startNext = () => {
		if (nextIndex >= itemList.length) {
			return;
		}
		const oneItem = itemList[nextIndex];
		nextIndex += 1;
		workOnOne(oneItem, () => {
			finishedCount += 1;
			if (finishedCount === itemList.length) {
				done();
				return;
			}
			startNext();
		});
	};
	Array.from({ length: Math.min(callsAtOnce, itemList.length) }).forEach(startNext);
};

const createRosettaSearchDescriber = ({ describerValues, forgeModelParts, identifierScanList, searchDescriptionCache, nowMs, xLog }) => {
	const { forcedToolClient, spendPricer, spendRecordLib, spendLedgerLib } = forgeModelParts;
	const writtenByModel = forcedToolClient.wireModel;
	const systemPrompt = describerSettings.systemPromptLineList.join('\n');
	// one guard per pot: its own ceiling, its own recipes, its own in-flight cap, so a crowd of visitors can never make a signed-in person's request busy or broke
	const guardOfIsAnonymous = Object.keys(POT_BY_IS_ANONYMOUS).reduce((soFar, isAnonymousText) => {
		const { potName, dailyCeilingSettingName } = POT_BY_IS_ANONYMOUS[isAnonymousText];
		return {
			...soFar,
			[isAnonymousText]: createGuardedModelCall({
				guardValues: { maxInFlight: describerValues.searchDescriberMaxInFlight, dailyCeilingUsd: describerValues[dailyCeilingSettingName], maxAttempts: describerValues.searchDescriberMaxAttempts, spendLedgerFilePath: describerValues.spendLedgerFilePath },
				ledgerNaming: { recipeName: describerSettings.ledgerRecipeNameByPot[potName], unansweredRecipeName: describerSettings.ledgerUnansweredRecipeNameByPot[potName], bridgeName: describerSettings.ledgerBridgeName, pairName: describerSettings.ledgerPairName, storeDirName: describerSettings.ledgerStoreDirName },
				ownerName: `${MODULE_NAME} (${potName})`,
				forcedToolClient,
				spendPricer,
				spendRecordLib,
				spendLedgerLib,
				nowMs,
			}),
		};
	}, {});
	// each failure of the guard, the call or the answer, by the absence it names
	const GUARD_ABSENT_NAME_BY_REFUSAL = Object.freeze({ [GUARD_REFUSAL_BUSY]: 'describerBusy', [GUARD_REFUSAL_SPEND_CEILING]: 'describerSpendCeiling' });
	const FAILED_STEP_ABSENT_NAME_BY_STEP = Object.freeze({ [GUARD_STEP_NAME.ledgerRead]: 'describerSpendUnknown', [GUARD_STEP_NAME.modelCall]: 'describerVendorFailed', [GUARD_STEP_NAME.ledgerWrite]: 'describerSpendUnknown' });

	// one field, one call: answers its described entry and the sentence to cache, if any
	const describeOne = ({ askRow, guardedModelCall }, done) => guardedModelCall.callGuarded({
		systemPrompt,
		userPrompt: userPromptOf(askRow),
		tool: describerSettings.tool,
		maxTokens: describerValues.searchDescriberOutputTokenBudget,
		worstCaseInputTokens: describerSettings.promptOverheadTokens + Buffer.byteLength(userPromptOf(askRow)), // bytes, an upper bound on tokens (review N4)
	}, (callError, outcome) => {
		if (callError) {
			const statusMatch = String(callError).match(HTTP_STATUS_IN_VENDOR_ERROR_PATTERN);
			const failedStepName = outcome && outcome.failedStepName;
			// the step and the vendor's status, never the vendor's words, which may repeat what it was sent (review N7)
			xLog.error(`${MODULE_NAME}: a field was not described: ${failedStepName || 'unknown step'} failed${statusMatch ? ` with status ${statusMatch[1]}` : ''}`);
			done({ described: absentOf(FAILED_STEP_ABSENT_NAME_BY_STEP[failedStepName] || 'describerVendorFailed') });
			return;
		}
		if (outcome.guardRefusalName) {
			done({ described: absentOf(GUARD_ABSENT_NAME_BY_REFUSAL[outcome.guardRefusalName]) });
			return;
		}
		const { called, usd, elapsedMs } = outcome;
		if (called.toolInput === null) {
			xLog.error(`${MODULE_NAME}: no description read (stopReason ${called.stopReason}); ${usd.toFixed(6)} USD spent`);
			done({ described: absentOf(called.stopReason === STOP_REASON_MAX_TOKENS ? 'describerAnswerCut' : 'describerAnswerUnusable') });
			return;
		}
		const descriptionText = checkedDescriptionOf({ toolInput: called.toolInput, maxDescriptionChars: describerValues.searchDescriberMaxDescriptionChars });
		if (!descriptionText) {
			done({ described: absentOf('describerAnswerUnusable') });
			return;
		}
		if (identifierHitIn({ identifierScanList, descriptionText })) {
			done({ described: absentOf('identifierInSearchDescription') });
			return;
		}
		xLog.status(`${MODULE_NAME}: one field described, ${usd.toFixed(6)} USD, ${elapsedMs} ms`);
		done({ described: { searchDescription: { descriptionText, writtenByModel } }, keptRow: { descriptionRefId: askRow.descriptionRefId, descriptionText } });
	});

	const describeFieldList = ({ fieldList, isAnonymous }, done) => {
		refuseUnlessCallerKindGiven(isAnonymous);
		const guardedModelCall = guardOfIsAnonymous[String(isAnonymous)];
		const describedList = fieldList.map(() => undefined);
		// each distinct (name, path) once: two fields of one name and path get one sentence and one cache row
		const askRowByRefId = new Map();
		fieldList.forEach((oneField, fieldIndex) => {
			if (!isBareField(oneField)) {
				return;
			}
			const descriptionRefId = descriptionRefIdOf({ wireModel: writtenByModel, promptVersion: PROMPT_VERSION, fieldName: oneField.name, fieldPath: oneField.path });
			const askRow = askRowByRefId.get(descriptionRefId) || { descriptionRefId, fieldName: oneField.name, fieldPath: oneField.path, fieldIndexList: [] };
			askRow.fieldIndexList.push(fieldIndex);
			askRowByRefId.set(descriptionRefId, askRow);
		});
		const setFor = (askRow, described) => askRow.fieldIndexList.forEach((fieldIndex) => { describedList[fieldIndex] = described; });
		const finish = () => done('', { describedList });
		const askRowList = [...askRowByRefId.values()];
		if (askRowList.length === 0) {
			finish();
			return;
		}
		searchDescriptionCache.readDescriptions({ descriptionRefIdList: askRowList.map((askRow) => askRow.descriptionRefId) }, (readError, descriptionTextByRefId) => {
			if (readError) {
				xLog.error(`${MODULE_NAME}: ${readError}`);
				askRowList.forEach((askRow) => setFor(askRow, absentOf('describerStoreUnreadable')));
				finish();
				return;
			}
			askRowList.filter((askRow) => descriptionTextByRefId[askRow.descriptionRefId] !== undefined).forEach((askRow) => setFor(askRow, { searchDescription: { descriptionText: descriptionTextByRefId[askRow.descriptionRefId], writtenByModel } }));
			const missRowList = askRowList.filter((askRow) => descriptionTextByRefId[askRow.descriptionRefId] === undefined);
			missRowList.slice(describerValues.searchDescriberMaxFieldsPerRequest).forEach((askRow) => setFor(askRow, absentOf('describerFieldLimitReached', { maxFieldCount: describerValues.searchDescriberMaxFieldsPerRequest })));
			const keptRowList = [];
			eachAtMostAtOnce({ itemList: missRowList.slice(0, describerValues.searchDescriberMaxFieldsPerRequest), callsAtOnce: describerValues.searchDescriberCallsAtOnce, workOnOne: (askRow, oneDone) => describeOne({ askRow, guardedModelCall }, ({ described, keptRow }) => {
				setFor(askRow, described);
				if (keptRow) {
					keptRowList.push(keptRow);
				}
				oneDone();
			}) }, () => searchDescriptionCache.writeDescriptions({ descriptionRowList: keptRowList }, (writeError) => {
				if (writeError) {
					xLog.error(`${MODULE_NAME}: ${writeError}`); // the sentences are still used; only the next request pays again
				}
				finish();
			}));
		});
	};

	return { describeFieldList, describerFacts: { provider: PROVIDER_NAME_ANTHROPIC, model: writtenByModel, promptVersion: PROMPT_VERSION }, inFlightStateOf: (isAnonymous) => guardOfIsAnonymous[String(isAnonymous)].inFlightState() };
};

// ================================================================================
// ASSEMBLY

const buildRosettaSearchDescriber = ({ judgeConfigValues, fuseConfigValues, storeHandle, forgeAdapter, nowMs, xLog }, callback) => {
	const notConfigured = (refusalText) => {
		xLog.error(`${MODULE_NAME}: off, every bare field says describerNotConfigured: ${refusalText}`);
		callback({ searchDescriber: searchDescriberAbsentOf('describerNotConfigured') });
	};
	// RETENTION FIRST (review S2): the cache is opened and swept now and daily whatever the switch says, so a sentence kept while the describer was on still goes on its day
	const retentionRead = cacheRetentionDaysOf(fuseConfigValues || {});
	if (retentionRead.refusalText) {
		notConfigured(`${retentionRead.refusalText}; the cache is not swept here, and rosettaJobStore's sweep is its only one`);
		return;
	}
	createSearchDescriptionCache({ storeHandle, retentionDays: retentionRead.cacheRetentionDays, nowMs }, (cacheError, searchDescriptionCache) => {
		if (cacheError) {
			notConfigured(cacheError);
			return;
		}
		const sweepAndLog = () => searchDescriptionCache.sweepExpired((sweepError) => (sweepError ? xLog.error(`${MODULE_NAME}: ${sweepError}`) : undefined));
		sweepAndLog();
		setInterval(sweepAndLog, MILLISECONDS_PER_DAY).unref();
		const valuesRead = rosettaSearchDescriberValuesOf({ judgeConfigValues: judgeConfigValues || {}, fuseConfigValues: fuseConfigValues || {} });
		if (valuesRead.refusalText) {
			notConfigured(valuesRead.refusalText);
			return;
		}
		if (valuesRead.isOff) {
			xLog.status(`${MODULE_NAME}: off by [rosetta-judge] searchDescriberIsOn; its cache is still swept`);
			callback({ searchDescriber: searchDescriberAbsentOf('describerOff') });
			return;
		}
		const { describerValues } = valuesRead;
		buildForgeModelParts({ forgeAdapter, wireModel: describerValues.searchDescriberWireModel, anthropicConfigFilePath: describerValues.anthropicConfigFilePath, spendPricingFilePath: describerValues.spendPricingFilePath, spendLedgerFilePath: describerValues.spendLedgerFilePath, ownerLabel: 'the search describer' }, (partsBuilt) => {
			if (partsBuilt.refusalText) {
				notConfigured(partsBuilt.refusalText);
				return;
			}
			const { forgeModelParts } = partsBuilt;
			const scanReadList = Object.keys(judgedSettings.hubRowByName).map((hubName) => hubIdentifierScanFor({ judgeModules: forgeModelParts.judgeModules, hubName }));
			const scanRefusal = scanReadList.find((scanRead) => scanRead.refusalText);
			if (scanRefusal) {
				notConfigured(`a hub's identifier scan would not build: ${scanRefusal.refusalText}`);
				return;
			}
			callback({ searchDescriber: createRosettaSearchDescriber({ describerValues, forgeModelParts, identifierScanList: scanReadList.map((scanRead) => scanRead.identifierScan), searchDescriptionCache, nowMs, xLog }) });
		});
	});
};

module.exports = { buildRosettaSearchDescriber, createRosettaSearchDescriber, rosettaSearchDescriberValuesOf, searchDescriberAbsentOf, searchDescriptionFieldsOf, searchDescriptionAbsentOf: absentOf, checkedDescriptionOf, userPromptOf, isBareField, PROMPT_VERSION };
