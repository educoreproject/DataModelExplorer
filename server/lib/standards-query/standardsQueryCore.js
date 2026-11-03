'use strict';

// standardsQueryCore — one module answers every question about the standards; the Query API, MCP and later doors hold no query of their own (design, first page).
//
//   createStandardsQueryCore({ registry, limitConfigValues, goldenHandle, forgeAdapter, dmeSearchModule, dmeModuleConfig, usageCounter, xLog, nowDate })
//     → { runOperation({ operationName, input, principal }, callback('', { httpStatus, bodyText, cachePolicy, retryAfterSeconds })), registryRowFor, serviceState }
//
// An operation runs IN PROCESS on the golden handle's READ session: no spawned node, docker inspect or new driver per call (design 1.6). Query logic stays in the DME CLI module;
// what is added here (URIs, the tri-state, the passport) is added after the verb answers, so the verb's own fields stay byte-identical to the CLI's (G1.1). A refusal is an answer
// with a status, never a callback error: this function calls back with an error only if the registry itself is broken.

const crypto = require('crypto');
const path = require('path');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();

const { runCypherQuery } = require(path.join(__dirname, '..', '..', '..', 'cli', 'lib.d', 'data-model-explorer', 'lib', 'runCypherQuery'));
const { STEP_BY_NAME, MAPPING_STATUS_UNAVAILABLE_PREFIX } = require('./answerSteps');
const { runPair } = require('./pairOperation');
const { runUriPromiseGate } = require('./uriPromiseGate');
const { openApiDocumentFor } = require('./openApiEmitter');

const moduleName = 'standardsQueryCore';
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;
const GOLDEN_NOT_READY_REFUSAL_NAME = 'goldenGraphNotReady';
const CHARACTERS_PER_TOKEN_ESTIMATE = 4;
const VECTOR_MODE_DEFAULT_NAME = 'hybrid';
const SEARCH_MODE_WITHOUT_VECTOR = 'keyword';
const BUSY_RETRY_SECONDS = 2;
const REQUIRED_LIMIT_NAME_LIST = Object.freeze(['inFlightMax', 'maxQueryChars', 'maxPatternChars', 'dailyEmbeddingTokenCeiling']);

const limitNumbersOf = (limitConfigValues) => {
	const faultList = REQUIRED_LIMIT_NAME_LIST.filter((limitName) => !POSITIVE_INTEGER_PATTERN.test(String(limitConfigValues[limitName])));
	if (faultList.length > 0 || !limitConfigValues.publicInstanceName) {
		return { refusalText: `${moduleName}: [standards-query-limits] must give publicInstanceName and positive integers ${REQUIRED_LIMIT_NAME_LIST.join(', ')}; absent or bad: ${[...faultList, ...(limitConfigValues.publicInstanceName ? [] : ['publicInstanceName'])].join(', ')}` };
	}
	return { limitNumberByName: REQUIRED_LIMIT_NAME_LIST.reduce((soFar, limitName) => ({ ...soFar, [limitName]: Number(limitConfigValues[limitName]) }), {}) };
};

// the store reads a step needs. THE try IS THE BOUNDARY, as forgeAdapter's attemptForgeCall is: better-sqlite3 throws, and a thrown read must not reach the event loop.
const storeReadsFor = (storeHandle) => {
	const abstentionStatement = storeHandle.prepare('SELECT interpretationEntryJson FROM derivedAssertions INDEXED BY derivedAssertionsBySubject WHERE decisionBlockHash = ? AND subjectStableId = ? AND assertionRecordJson IS NULL');
	const anyAbstentionStatement = storeHandle.prepare('SELECT interpretationEntryJson FROM derivedAssertions WHERE decisionBlockHash = ? AND assertionRecordJson IS NULL LIMIT 1');
	const hubNamesFromRows = (rowList, hubNameSet) => rowList.forEach((oneRow) => hubNameSet.add(JSON.parse(oneRow.interpretationEntryJson).hubName));
	const attemptStoreRead = (storeRead) => {
		const hubNameSet = new Set();
		try {
			storeRead(hubNameSet);
			return { hubNameSet };
		} catch (storeException) {
			return { error: storeException.message };
		}
	};
	return {
		abstainedHubNameSetFor: ({ subjectRowList, decisionBlockHashListByStandard }) => attemptStoreRead((hubNameSet) => subjectRowList.forEach(({ subjectStableId, standardName }) => (decisionBlockHashListByStandard[standardName] || []).forEach((decisionBlockHash) => hubNamesFromRows(abstentionStatement.all(decisionBlockHash, subjectStableId), hubNameSet)))),
		abstainedHubNameSetOfStandards: ({ sourceList, decisionBlockHashListByStandard }) => attemptStoreRead((hubNameSet) => sourceList.forEach((sourceName) => (decisionBlockHashListByStandard[sourceName] || []).forEach((decisionBlockHash) => hubNamesFromRows(anyAbstentionStatement.all(decisionBlockHash), hubNameSet)))),
	};
};

const createStandardsQueryCore = ({ registry, limitConfigValues, goldenHandle, forgeAdapter, dmeSearchModule, dmeModuleConfig, usageCounter, xLog, nowDate }) => {
	const registryRowByOperationName = registry.operationList.reduce((soFar, registryRow) => ({ ...soFar, [registryRow.operationName]: registryRow }), {});
	const refusalStatusByName = { ...registry.verbRefusalHttpStatusByName, ...registry.envelopeRefusalHttpStatusByName };
	const limits = limitNumbersOf(limitConfigValues);
	const setupRefusalText = limits.refusalText || (forgeAdapter.refusalText ? `${moduleName}: the URI store is not open: ${forgeAdapter.refusalText}` : (goldenHandle ? '' : `${moduleName}: this instance names no golden graph`));

	const inputCapByName = limits.limitNumberByName || {};

	let serviceFacts = null;
	let unavailableReason = setupRefusalText || 'the URI promise gate has not yet passed for this graph';
	let inFlightCount = 0;
	let embeddingTokenDayText = '';
	let embeddingTokensToday = 0;

	// ================================================================================
	// EMBEDDING: the DME's own client, its calls counted against the day's ceiling. The verbs' query cache serves a repeat, which then costs and counts nothing.
	const utcDayText = () => nowDate().toISOString().slice(0, 10);
	const embeddingTokensSpentToday = () => {
		if (embeddingTokenDayText !== utcDayText()) {
			embeddingTokenDayText = utcDayText();
			embeddingTokensToday = 0;
		}
		return embeddingTokensToday;
	};
	const estimatedTokensOf = (queryText) => Math.ceil(queryText.length / CHARACTERS_PER_TOKEN_ESTIMATE);
	const countingEmbedder = dmeModuleConfig && dmeModuleConfig.embedder ? {
		...dmeModuleConfig.embedder,
		embed: (textList, callback) => {
			embeddingTokensToday = embeddingTokensSpentToday() + textList.reduce((soFar, oneText) => soFar + estimatedTokensOf(oneText), 0);
			dmeModuleConfig.embedder.embed(textList, callback);
		},
	} : undefined;
	const verbConfig = { ...dmeModuleConfig, embedder: countingEmbedder };

	// ================================================================================
	// THE GATE

	const storeOpen = setupRefusalText ? {} : forgeAdapter.openStoreReadHandle();
	const storeHandle = storeOpen.storeHandle;
	const storeReads = storeHandle ? storeReadsFor(storeHandle) : null;

	const runGateNow = () => {
		serviceFacts = null;
		if (storeOpen.error) {
			unavailableReason = storeOpen.error;
			xLog.error(`${moduleName}: ${unavailableReason}`);
			return;
		}
		goldenHandle.withReadSession((session, sessionDone) => runUriPromiseGate({ session, forgeAdapter, storeHandle }, sessionDone), (gateError, gateResult) => {
			if (gateError) {
				unavailableReason = `the URI promise gate could not run: ${gateError}`;
				xLog.error(`${moduleName}: ${unavailableReason}`);
				return;
			}
			if (gateResult.unavailableReason) {
				unavailableReason = gateResult.unavailableReason;
				xLog.error(`${moduleName}: refusing every standards query: ${unavailableReason}`);
				return;
			}
			serviceFacts = gateResult.serviceFacts;
			unavailableReason = '';
			xLog.status(`${moduleName}: URI promise proved for manifest ${serviceFacts.manifestLabel} (${serviceFacts.passport.manifestRefId}) on graph ${serviceFacts.passport.graphName}: ${serviceFacts.resolvedUriCount} URIs resolved, ${serviceFacts.ownIriSampleCount} own-IRI elements held by the store`);
		});
	};

	if (setupRefusalText) {
		xLog.error(`${moduleName}: ${setupRefusalText}`);
	} else {
		goldenHandle.whenEveryConnected(runGateNow);
	}

	// ================================================================================
	// ANSWERS

	const answeredFromFor = (operationName) => {
		if (!serviceFacts) {
			return undefined;
		}
		const { passport, manifestLabel, manifestUri, manifestByContentUri, uriMinter } = serviceFacts;
		return {
			graphName: passport.graphName,
			manifestRefId: passport.manifestRefId,
			manifestLabel,
			manifest: manifestUri,
			manifestByContent: manifestByContentUri,
			manifestStandardList: uriMinter.standardListUri(),
			builtAt: passport.builtAt,
			graphContractSha256: passport.graphContractSha256,
			structuralVersion: passport.structuralVersion,
			embeddingModelVersion: passport.embeddingModelVersion,
			instance: limitConfigValues.publicInstanceName,
			apiVersion: registry.apiVersion,
			operation: operationName,
		};
	};

	const refusedAnswerFor = ({ operationName, refusal, retryAfterSeconds }) => ({
		httpStatus: refusalStatusByName[refusal.refusalName] === undefined ? 500 : refusalStatusByName[refusal.refusalName],
		bodyText: JSON.stringify({ answeredFrom: answeredFromFor(operationName), answer: refusal }),
		cachePolicy: 'noStore',
		...(retryAfterSeconds ? { retryAfterSeconds } : {}),
		isRefusal: true,
	});

	const refusalOf = (operationName, refusalName, reason, extraFields = {}) => ({ refusedByName: operationName, refusalName, reason, ...extraFields });

	// the checks every operation shares; the first that fails is the answer
	const inputRefusalFor = ({ registryRow, operationName, input }) => {
		const allFieldList = [...registryRow.inputFieldList, ...(registryRow.requiresUriPromise ? registry.sharedInputFieldList : [])];
		const unknownNameList = Object.keys(input).filter((inputName) => !allFieldList.some((oneField) => oneField.name === inputName));
		if (unknownNameList.length > 0) {
			return refusalOf(operationName, 'unknownInput', `${operationName} does not take ${unknownNameList.join(', ')}; it takes: ${allFieldList.map((oneField) => oneField.name).join(', ') || 'nothing'}`, { validValueList: allFieldList.map((oneField) => oneField.name) });
		}
		const notTextName = Object.keys(input).find((inputName) => typeof input[inputName] !== 'string');
		if (notTextName) {
			return refusalOf(operationName, 'invalidInput', `${notTextName} was given more than once or in a form that is not text`);
		}
		const tooLongField = allFieldList.find((oneField) => oneField.maxLengthConfigName && input[oneField.name] !== undefined && input[oneField.name].length > inputCapByName[oneField.maxLengthConfigName]);
		if (tooLongField) {
			return refusalOf(operationName, 'inputTooLong', `${tooLongField.name} is ${input[tooLongField.name].length} characters; the cap is ${inputCapByName[tooLongField.maxLengthConfigName]}`, { fieldName: tooLongField.name, maxLength: inputCapByName[tooLongField.maxLengthConfigName] });
		}
		const badIntegerField = allFieldList.find((oneField) => oneField.type === 'positiveInteger' && input[oneField.name] !== undefined && (!POSITIVE_INTEGER_PATTERN.test(input[oneField.name]) || (oneField.maximum && Number(input[oneField.name]) > oneField.maximum)));
		if (badIntegerField) {
			return refusalOf(operationName, badIntegerField.name === 'page' ? 'invalidPage' : 'invalidLimit', `${badIntegerField.name} must be a positive integer${badIntegerField.maximum ? ` of at most ${badIntegerField.maximum}` : ''}; got '${input[badIntegerField.name]}'`);
		}
		const bothGivenList = (registryRow.mutuallyExclusiveInputNameList || []).filter((inputName) => input[inputName] !== undefined);
		if (bothGivenList.length > 1) {
			return refusalOf(operationName, 'invalidInput', `give one of ${bothGivenList.join(', ')}, not both`);
		}
		return null;
	};

	const manifestRefusalFor = ({ operationName, expectManifest }) => {
		const { passport, manifestLabel } = serviceFacts;
		if (expectManifest === undefined || expectManifest === manifestLabel || expectManifest === `sha256:${passport.manifestRefId}`) {
			return null;
		}
		return refusalOf(operationName, 'manifestMismatch', `this instance answers from manifest ${manifestLabel} (sha256:${passport.manifestRefId}); the request expected ${expectManifest}`, { expectedManifest: expectManifest, answeringManifestLabel: manifestLabel, answeringManifestRefId: passport.manifestRefId });
	};

	const embeddingRefusalFor = ({ registryRow, operationName, input }) => {
		if (!registryRow.embedsQueryTextFromInput) {
			return null;
		}
		const searchMode = input[registryRow.searchModeInput] === undefined ? VECTOR_MODE_DEFAULT_NAME : input[registryRow.searchModeInput];
		const queryText = input[registryRow.embedsQueryTextFromInput];
		if (searchMode === SEARCH_MODE_WITHOUT_VECTOR || typeof queryText !== 'string') {
			return null;
		}
		const ceiling = inputCapByName.dailyEmbeddingTokenCeiling;
		if (embeddingTokensSpentToday() + estimatedTokensOf(queryText) > ceiling) {
			return refusalOf(operationName, 'embeddingCeilingReached', `today's ceiling of ${ceiling} embedding tokens is reached, so the vector leg cannot run; mode=${SEARCH_MODE_WITHOUT_VECTOR} keeps working`, { validValueList: [SEARCH_MODE_WITHOUT_VECTOR] });
		}
		return null;
	};

	// the verb's input, through the CLI's own reader: its defaults and its refusals are the verb's, not a second copy
	const verbInvocationFor = ({ registryRow, input }) => {
		const { VERB_INPUT_CONTRACT } = dmeSearchModule;
		const verbRow = VERB_INPUT_CONTRACT[registryRow.cliVerb];
		const flagValueByName = {};
		const positionalValueByName = {};
		registryRow.inputFieldList.filter((oneField) => oneField.verbInputName && input[oneField.name] !== undefined).forEach((oneField) => {
			(verbRow.positionalList.includes(oneField.verbInputName) ? positionalValueByName : flagValueByName)[oneField.verbInputName] = input[oneField.name];
		});
		return dmeSearchModule.resolveVerbInvocation({
			switchNameList: [registryRow.cliVerb],
			flagValueByName,
			positionalArgumentList: verbRow.positionalList.map((positionalName) => positionalValueByName[positionalName]).filter((oneValue) => oneValue !== undefined),
		});
	};

	const runStepList = ({ registryRow, stepContext }, callback) => {
		const stepNameList = registryRow.answerStepList;
		const runNext = (stepIndex) => {
			if (stepIndex >= stepNameList.length) {
				callback('');
				return;
			}
			STEP_BY_NAME[stepNameList[stepIndex]](stepContext, (stepError) => {
				if (stepError) {
					callback(stepError);
					return;
				}
				runNext(stepIndex + 1);
			});
		};
		runNext(0);
	};

	// one handler per kind of operation (DATA: the registry row names it). A handler answers done(errText, { answer } ).
	const HANDLER_BY_NAME = Object.freeze({
		verb: ({ registryRow, input, pageNumber, namedUriList }, done) => {
			const invocation = verbInvocationFor({ registryRow, input });
			if (invocation.refusal) {
				done('', { answer: invocation.refusal });
				return;
			}
			const verbParams = { ...invocation.params, ...(registryRow.pageSize ? { pageNumber } : {}) };
			goldenHandle.withReadSession((session, sessionDone) => {
				const queryHandler = dmeSearchModule.QUERY_HANDLER_BY_QUERY_TYPE[invocation.queryType];
				queryHandler(session, verbParams, verbConfig, (verbError, answer) => {
					if (verbError) {
						sessionDone(verbError);
						return;
					}
					if (answer.refusedByName) {
						sessionDone('', { answer });
						return;
					}
					const stepContext = { answer, session, facts: serviceFacts, registryRow, verbParams, pageNumber, runCypher: runCypherQuery, storeReads, dmeSearchModule, namedUriList };
					runStepList({ registryRow, stepContext }, (stepError) => (stepError ? sessionDone(stepError) : sessionDone('', { answer })));
				});
			}, done);
		},
		pair: ({ registryRow, input, pageNumber, namedUriList }, done) => {
			goldenHandle.withReadSession((session, sessionDone) => runPair({ session, facts: serviceFacts, input, pageNumber, pageSize: registryRow.pageSize, runCypher: runCypherQuery, storeReads, dmeSearchModule, namedUriList }, (pairError, answer) => {
				if (pairError) {
					sessionDone(pairError);
					return;
				}
				if (answer.refusedByName) {
					sessionDone('', { answer });
					return;
				}
				runStepList({ registryRow, stepContext: { answer, facts: serviceFacts, registryRow, namedUriList } }, (stepError) => (stepError ? sessionDone(stepError) : sessionDone('', { answer })));
			}), done);
		},
		usage: (unusedContext, done) => usageCounter.readCounts((readError, countRowList) => (readError ? done(readError) : done('', { answer: { countRowList, rowUnit: 'one counter: (operationName, subjectKind, subjectText, utcDay) with how many times it was asked' } }))),
		openApiDocument: (unusedContext, done) => done('', { answer: openApiDocumentFor({ registry, manifestLabel: serviceFacts ? serviceFacts.manifestLabel : '', inputCapByName }) }),
	});

	const errorAnswerFor = ({ operationName, errorText }) => {
		if (errorText.startsWith(GOLDEN_NOT_READY_REFUSAL_NAME)) {
			return refusedAnswerFor({ operationName, retryAfterSeconds: BUSY_RETRY_SECONDS, refusal: refusalOf(operationName, GOLDEN_NOT_READY_REFUSAL_NAME, errorText) });
		}
		if (errorText.startsWith(MAPPING_STATUS_UNAVAILABLE_PREFIX)) {
			return refusedAnswerFor({ operationName, refusal: refusalOf(operationName, MAPPING_STATUS_UNAVAILABLE_PREFIX, 'the store that tells a judged abstention from a value never offered cannot be read, so this answer is refused rather than given as an empty list') });
		}
		const errorRefId = crypto.randomBytes(6).toString('hex');
		xLog.error(`${moduleName}: ${operationName} failed (${errorRefId}): ${errorText}`);
		return refusedAnswerFor({ operationName, refusal: refusalOf(operationName, 'queryFailed', `the query failed (${errorRefId})`) });
	};

	const subjectListFor = ({ registryRow, input }) => {
		const namedStandardList = registryRow.usageSubjectInputNameList.filter((inputName) => input[inputName] !== undefined).map((inputName) => input[inputName]);
		return [
			...namedStandardList.map((subjectText) => ({ subjectKind: 'standard', subjectText })),
			...(registryRow.countsPairSubject && namedStandardList.length === 2 ? [{ subjectKind: 'pair', subjectText: namedStandardList.slice().sort().join(' | ') }] : []),
		];
	};

	const runOperation = ({ operationName, input, principal }, callback) => {
		const registryRow = registryRowByOperationName[operationName];
		if (!registryRow) {
			callback('', refusedAnswerFor({ operationName, refusal: refusalOf(operationName, 'unknownOperation', `there is no operation ${operationName}`, { validValueList: Object.keys(registryRowByOperationName) }) }));
			return;
		}
		if (registryRow.requiresUriPromise && !serviceFacts) {
			const refusalName = setupRefusalText && limits.refusalText ? 'serviceNotConfigured' : 'uriPromiseUnavailable';
			callback('', refusedAnswerFor({ operationName, refusal: refusalOf(operationName, refusalName, unavailableReason) }));
			return;
		}
		const inputRefusal = inputRefusalFor({ registryRow, operationName, input });
		if (inputRefusal) {
			callback('', refusedAnswerFor({ operationName, refusal: inputRefusal }));
			return;
		}
		const { expectManifest, ...operationInput } = input;
		const firstRefusal = registryRow.requiresUriPromise ? (manifestRefusalFor({ operationName, expectManifest }) || embeddingRefusalFor({ registryRow, operationName, input: operationInput })) : null;
		if (firstRefusal) {
			callback('', refusedAnswerFor({ operationName, refusal: firstRefusal }));
			return;
		}
		if (inFlightCount >= inputCapByName.inFlightMax) {
			callback('', refusedAnswerFor({ operationName, retryAfterSeconds: BUSY_RETRY_SECONDS, refusal: refusalOf(operationName, 'busy', `${inFlightCount} queries are running, the most this instance runs at once; retry in ${BUSY_RETRY_SECONDS} seconds`) }));
			return;
		}
		inFlightCount += 1;
		const namedUriList = [];
		const pageNumber = operationInput.page === undefined ? 1 : Number(operationInput.page);
		const { page: unusedPage, ...handlerInput } = operationInput;
		HANDLER_BY_NAME[registryRow.coreHandlerName]({ registryRow, input: handlerInput, pageNumber, namedUriList, principal }, (handlerError, handlerResult) => {
			inFlightCount -= 1;
			if (handlerError) {
				callback('', errorAnswerFor({ operationName, errorText: String(handlerError) }));
				return;
			}
			const { answer } = handlerResult;
			if (answer.refusedByName) {
				callback('', refusedAnswerFor({ operationName, refusal: answer }));
				return;
			}
			if (registryRow.isCounted && principal.kind !== 'smithJob') {
				usageCounter.countAnswer({ operationName, subjectList: subjectListFor({ registryRow, input: operationInput }), uriList: namedUriList });
			}
			callback('', {
				httpStatus: 200,
				bodyText: JSON.stringify(registryRow.bodyForm === 'envelope' ? { answeredFrom: answeredFromFor(operationName), answer, uriNote: registry.uriNote } : answer),
				cachePolicy: registryRow.cachePolicy,
			});
		});
	};

	return {
		runOperation,
		registryRowFor: (operationName) => registryRowByOperationName[operationName],
		serviceState: () => ({ isServing: serviceFacts !== null, unavailableReason, inFlightCount, embeddingTokensToday: embeddingTokensSpentToday() }),
	};
};

module.exports = { createStandardsQueryCore };
