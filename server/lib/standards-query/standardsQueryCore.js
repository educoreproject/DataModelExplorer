'use strict';

// standardsQueryCore — one module answers every question about the standards; the Query API, MCP and later doors hold no query of their own (design, first page).
//
//   createStandardsQueryCore({ registry, limitConfigValues, doorLimitValues, goldenHandle, forgeAdapter, dmeSearchModule, dmeModuleConfig, usageCounter, xLog, nowDate, rosettaRetrieval?, rosettaJobService?, rosettaInterpreter? })
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
const { aboutDocumentFor } = require('./aboutDocument');
const { refusalWithSizeContact } = require('./sizeRefusalContact');
const { SUMMARY_SHAPER_BY_NAME } = require('./answerSummaries');

const moduleName = 'standardsQueryCore';
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;
const GOLDEN_NOT_READY_REFUSAL_NAME = 'goldenGraphNotReady';
const CHARACTERS_PER_TOKEN_ESTIMATE = 4;
const SEARCH_MODE_WITHOUT_VECTOR = 'keyword';
const BUSY_RETRY_SECONDS = 2;
const URI_KIND_ELEMENT = 'element';
const ROW_DETAIL_INPUT_NAME = 'rowDetail';
const ROW_DETAIL_SUMMARY = 'summary';
const NO_STORE_CACHE_POLICY = 'noStore';
const REQUIRED_LIMIT_NAME_LIST = Object.freeze(['requestsPerMinute', 'burstPerSecond', 'inFlightMax', 'maxQueryChars', 'maxPatternChars', 'dailyEmbeddingTokenCeiling', 'usageUriRowCap', 'usageUriRetentionDays']);

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

// an input declared as more than text arrives in a request body or a tool's arguments; each such type is one row here
const STRUCTURED_INPUT_TEST_BY_TYPE = Object.freeze({
	list: Array.isArray,
	object: (inputValue) => inputValue !== null && typeof inputValue === 'object' && !Array.isArray(inputValue),
});

const createStandardsQueryCore = ({ registry, limitConfigValues, doorLimitValues, goldenHandle, forgeAdapter, dmeSearchModule, dmeModuleConfig, usageCounter, xLog, nowDate, rosettaRetrieval, rosettaJobService, rosettaInterpreter }) => {
	const registryRowByOperationName = registry.operationList.reduce((soFar, registryRow) => ({ ...soFar, [registryRow.operationName]: registryRow }), {});
	// ⟪P7a⟫ a row's envelopeRule must name a detail input the row declares with an enum holding the lean value and a default: a registry that does not is a build fault, said at startup
	registry.operationList.filter((registryRow) => registryRow.envelopeRule).forEach((registryRow) => {
		const { detailInputName, leanDetailValue, leanAnsweredFromFieldNameList } = registryRow.envelopeRule;
		const detailField = registryRow.inputFieldList.find((oneField) => oneField.name === detailInputName);
		if (!detailField || detailField.defaultValue === undefined || !Array.isArray(detailField.enum) || !detailField.enum.includes(leanDetailValue) || !Array.isArray(leanAnsweredFromFieldNameList)) {
			throw new Error(`${moduleName}: ${registryRow.operationName}'s envelopeRule needs detail input '${detailInputName}' declared with an enum holding '${leanDetailValue}' and a defaultValue, and a leanAnsweredFromFieldNameList`);
		}
	});
	const refusalStatusByName = { ...registry.verbRefusalHttpStatusByName, ...registry.envelopeRefusalHttpStatusByName };
	const limits = limitNumbersOf(limitConfigValues);
	const setupRefusalText = limits.refusalText || (forgeAdapter.refusalText ? `${moduleName}: the URI store is not open: ${forgeAdapter.refusalText}` : (goldenHandle ? '' : `${moduleName}: this instance names no golden graph`));

	const inputCapByName = limits.limitNumberByName || {};

	let serviceFacts = null;
	let unavailableReason = setupRefusalText || 'the URI promise gate has not yet passed for this graph';
	let inFlightCount = 0;
	const scanCountByOperationName = {};
	// standards and graph are fully determined by the graph the gate proved and take seconds to read: one read per connection, however many ask at once
	let cachedAnswerByOperationName = {};
	let waiterListByOperationName = {};
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
		cachedAnswerByOperationName = {};
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
			xLog.status(`${moduleName}: URI promise proved for manifest ${serviceFacts.manifestLabel} (${serviceFacts.passport.manifestRefId}) on graph ${serviceFacts.passport.graphName}: ${serviceFacts.resolvedUriCount} URIs resolved`);
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

	// a refusal for size says who to write to for what the person needs
	const withSizeContact = (refusal) => refusalWithSizeContact({ registry, contactAddress: doorLimitValues.sizeRefusalContactAddress, refusal });
	const refusedAnswerFor = ({ operationName, refusal, retryAfterSeconds }) => ({
		httpStatus: refusalStatusByName[refusal.refusalName] === undefined ? 500 : refusalStatusByName[refusal.refusalName],
		bodyText: JSON.stringify({ answeredFrom: answeredFromFor(operationName), answer: withSizeContact(refusal) }),
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
		const structuredTestOf = (inputName) => STRUCTURED_INPUT_TEST_BY_TYPE[allFieldList.find((oneField) => oneField.name === inputName).type];
		const badStructuredName = Object.keys(input).find((inputName) => structuredTestOf(inputName) && !structuredTestOf(inputName)(input[inputName]));
		if (badStructuredName) {
			return refusalOf(operationName, 'invalidInput', `${badStructuredName} must be ${allFieldList.find((oneField) => oneField.name === badStructuredName).type === 'list' ? 'a list' : 'an object'}`);
		}
		const notTextName = Object.keys(input).find((inputName) => !structuredTestOf(inputName) && typeof input[inputName] !== 'string');
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
		// an input the core itself reads has no verb to refuse a bad value (rowDetail): an unknown value is refused by name, never read as the default
		const badOwnEnumField = allFieldList.find((oneField) => oneField.enum && !oneField.verbInputName && input[oneField.name] !== undefined && !oneField.enum.includes(input[oneField.name]));
		if (badOwnEnumField) {
			return refusalOf(operationName, 'invalidInput', `${badOwnEnumField.name} must be one of ${badOwnEnumField.enum.join(', ')}; got '${input[badOwnEnumField.name]}'`, { validValueList: badOwnEnumField.enum });
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
		const queryText = input[registryRow.embedsQueryTextFromInput];
		if (input[registryRow.searchModeInput] === SEARCH_MODE_WITHOUT_VECTOR || typeof queryText !== 'string') {
			return null;
		}
		const ceiling = inputCapByName.dailyEmbeddingTokenCeiling;
		if (embeddingTokensSpentToday() + estimatedTokensOf(queryText) > ceiling) {
			return refusalOf(operationName, 'embeddingCeilingReached', `today's ceiling of ${ceiling} embedding tokens is reached, so the vector leg cannot run; mode=${SEARCH_MODE_WITHOUT_VECTOR} keeps working`, { validValueList: [SEARCH_MODE_WITHOUT_VECTOR] });
		}
		return null;
	};

	// An answer hands out uris, so an input marked acceptsUri takes one back: an element uri of the version this manifest holds, or a declared spelling (ceds:P000033), becomes the stableId it names, by the forge's
	// own parser. Anything else stays as sent for the verb to read as it always has: a card uri already is a stableId, and an element uri of another version names nothing here, so it is nothingMatched as before.
	const stableIdOfUriInput = (inputText) => {
		const { edcUri } = forgeAdapter;
		const spelledStableId = edcUri.elementStableIdOfSpelling(inputText);
		if (spelledStableId !== inputText) {
			return spelledStableId;
		}
		if (!inputText.startsWith(edcUri.URI_SCHEME.baseIri) && !inputText.startsWith(`${edcUri.URI_SCHEME.curiePrefix}:`)) {
			return inputText;
		}
		const parsedUri = edcUri.parse(inputText);
		const { standardName, standardVersion, elementStableId, ...otherPartByName } = parsedUri.partByName || {};
		const namesOneElementHere = parsedUri.kind === URI_KIND_ELEMENT && Object.keys(otherPartByName).length === 0 && serviceFacts.standardVersionByName[standardName] === standardVersion;
		return namesOneElementHere ? elementStableId : inputText;
	};
	const withUriInputsResolved = ({ registryRow, input }) => registryRow.inputFieldList.filter((oneField) => oneField.acceptsUri && input[oneField.name] !== undefined).reduce((soFar, oneField) => ({ ...soFar, [oneField.name]: stableIdOfUriInput(input[oneField.name]) }), input);

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

	// the row's rowDetail field holds its default; the input was checked against its enum before this is read
	const rowDetailOf = ({ registryRow, input }) => {
		const rowDetailField = registryRow.inputFieldList.find((oneField) => oneField.name === ROW_DETAIL_INPUT_NAME);
		return rowDetailField ? (input[ROW_DETAIL_INPUT_NAME] || rowDetailField.defaultValue) : '';
	};
	// ⟪P7a⟫ a row with an envelopeRule takes a detail input that chooses the envelope's form (lean or audit); its default is the input field's own, declared in the registry.
	// A row without one has no detail and its envelope is as it always was.
	const detailOf = ({ registryRow, input }) => {
		if (!registryRow.envelopeRule) {
			return '';
		}
		const detailInputName = registryRow.envelopeRule.detailInputName;
		const detailField = registryRow.inputFieldList.find((oneField) => oneField.name === detailInputName); // checked at startup, above
		return input[detailInputName] === undefined ? detailField.defaultValue : input[detailInputName];
	};
	// the envelope: answeredFrom (in full, or the lean field list the row names, plus whatever the handler adds, such as Rosetta's using block), the answer, and the uriNote unless the row omits it
	const envelopeOf = ({ registryRow, operationName, detail, answer, answeredFromAddition, isSummary }) => {
		const envelopeRule = registryRow.envelopeRule;
		const answeredFromWhole = answeredFromFor(operationName);
		const answeredFrom = envelopeRule && detail === envelopeRule.leanDetailValue ? envelopeRule.leanAnsweredFromFieldNameList.reduce((soFar, fieldName) => ({ ...soFar, [fieldName]: answeredFromWhole[fieldName] }), {}) : answeredFromWhole;
		return {
			answeredFrom: { ...answeredFrom, ...answeredFromAddition },
			answer,
			...(envelopeRule && envelopeRule.omitsUriNote ? {} : { uriNote: isSummary ? registry.summaryUriNote : registry.uriNote }),
		};
	};
	// a summary names fewer URIs than the verb's answer did, and the usage counters count what a caller was told about
	const summaryAnswerOf = ({ registryRow, answer, namedUriList }) => {
		const summaryAnswer = SUMMARY_SHAPER_BY_NAME[registryRow.summaryShaperName]({ answer, summaryShape: registry.summaryShape });
		const summaryText = JSON.stringify(summaryAnswer);
		const retainedUriList = namedUriList.filter((oneUri) => summaryText.includes(oneUri));
		namedUriList.splice(0, namedUriList.length, ...retainedUriList);
		return summaryAnswer;
	};

	// one handler per kind of operation (DATA: the registry row names it). THE HANDLER INTERFACE: handler({ registryRow, input, pageNumber, rowDetail, detail, namedUriList, namedSubjectList, admitScan, principal }, done(errText, { answer, cachePolicy?, answeredFromAddition? })). detail is '' unless the row has an envelopeRule; answeredFromAddition joins the envelope's answeredFrom.
	// An answer carrying refusedByName is a refusal; anything else is the operation's answer. A new kind of operation is one line here and one registry row.
	const HANDLER_BY_NAME = Object.freeze({
		verb: ({ registryRow, input, pageNumber, namedUriList, admitScan }, done) => {
			const invocation = verbInvocationFor({ registryRow, input });
			if (invocation.refusal) {
				done('', { answer: invocation.refusal });
				return;
			}
			const verbFacts = {};
			const verbParams = {
				...invocation.params,
				...(registryRow.pageSize ? { pageNumber } : {}),
				...(admitScan ? { admitScan } : {}),
				...(registryRow.reportsMatchedStableIds ? { reportMatchedStableIdList: (matchedStableIdList) => { verbFacts.matchedStableIdList = matchedStableIdList; } } : {}),
				...(registryRow.reportsRowStableIds ? { reportRowStableIdList: (rowStableIdList) => { verbFacts.rowStableIdList = rowStableIdList; } } : {}),
			};
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
					const stepContext = { answer, session, facts: serviceFacts, registryRow, verbFacts, pageNumber, runCypher: runCypherQuery, storeReads, dmeSearchModule, namedUriList };
					runStepList({ registryRow, stepContext }, (stepError) => (stepError ? sessionDone(stepError) : sessionDone('', { answer })));
				});
			}, done);
		},
		pair: ({ registryRow, input, pageNumber, namedUriList, namedSubjectList, admitScan }, done) => {
			goldenHandle.withReadSession((session, sessionDone) => runPair({ session, facts: serviceFacts, input, pageNumber, pageSize: registryRow.pageSize, runCypher: runCypherQuery, storeReads, dmeSearchModule, namedUriList, namedSubjectList, admitScan }, (pairError, answer) => {
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
		// nothing here is judged: rosettaRetrieval has no way to reach a judge. An instance with no [rosetta-fuse] refuses this one operation by name; the others are untouched.
		rosettaRetrieval: ({ registryRow, input, principal, detail, namedSubjectList }, done) => {
			if (!rosettaRetrieval) {
				done('', { answer: refusalOf(registryRow.operationName, 'serviceNotConfigured', 'this instance has no [rosetta-fuse] settings, so retrieval is off here') });
				return;
			}
			rosettaRetrieval.runRetrieval({ withReadSession: goldenHandle.withReadSession, serviceFacts, input, principal, detail, namedSubjectList, answerNoteValues: registry.rosettaAnswerNote }, done);
		},
		// the judged step: a job, not a request. Its registry row names which of the four actions it is. The same shape on every door; none of them holds a rule of its own.
		rosettaJobs: ({ registryRow, input, principal, pageNumber, rowDetail, detail, namedSubjectList }, done) => {
			if (!rosettaJobService) {
				done('', { answer: refusalOf(registryRow.operationName, 'serviceNotConfigured', 'this instance has no judged step') });
				return;
			}
			rosettaJobService[registryRow.jobActionName]({ principal, input, serviceFacts, withReadSession: goldenHandle.withReadSession, answeredFrom: answeredFromFor(registryRow.operationName), pageNumber, pageSize: registryRow.pageSize, rowDetail, detail, namedSubjectList, answerNoteValues: registry.rosettaJudgedNote }, done);
		},
		// rung 3 of the Rosetta page's input ladder: free text to a field list, for the person to review. It reads no graph. rosettaInterpreter is { interpretText } when built, else { refusalText } saying why it is off.
		rosettaInterpret: ({ registryRow, input }, done) => {
			if (!rosettaInterpreter || !rosettaInterpreter.interpretText) {
				done('', { answer: refusalOf(registryRow.operationName, 'serviceNotConfigured', `this instance does not interpret free text: ${rosettaInterpreter ? rosettaInterpreter.refusalText : 'no interpreter was built'}`) });
				return;
			}
			rosettaInterpreter.interpretText({ pastedText: input.text, refusedByName: registryRow.operationName }, (interpretError, answer) => (interpretError ? done(interpretError) : done('', { answer, ...(answer.retryAfterSeconds ? { retryAfterSeconds: answer.retryAfterSeconds } : {}) })));
		},
		usage: (unusedContext, done) => usageCounter.readCounts((readError, countRowList) => (readError ? done(readError) : done('', { answer: { countRowList, rowUnit: 'one counter: (operationName, subjectKind, subjectText, utcDay) with how many times it was asked' } }))),
		openApiDocument: (unusedContext, done) => done('', { answer: openApiDocumentFor({ registry, manifestLabel: serviceFacts ? serviceFacts.manifestLabel : '', inputCapByName }) }),
		// what a signed-in administrator is told must not sit in a shared cache
		about: ({ registryRow, principal }, done) => {
			const { answer, listsGatedOperation } = aboutDocumentFor({ registry, inputCapByName, doorLimitValues, publicInstanceName: limitConfigValues.publicInstanceName, principal });
			done('', { answer, cachePolicy: listsGatedOperation ? NO_STORE_CACHE_POLICY : registryRow.cachePolicy });
		},
	});

	const errorAnswerFor = ({ operationName, errorText }) => {
		if (errorText === dmeSearchModule.SCAN_NOT_ADMITTED_TEXT) {
			return refusedAnswerFor({ operationName, retryAfterSeconds: BUSY_RETRY_SECONDS, refusal: refusalOf(operationName, 'busy', `as many ${operationName} searches that read the whole graph are running as this instance runs at once; retry in ${BUSY_RETRY_SECONDS} seconds, or ask by exact stableId, which needs no such search`) });
		}
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

	const subjectListFor = ({ registryRow, input }) => registryRow.usageSubjectInputNameList.filter((inputName) => input[inputName] !== undefined).map((inputName) => ({ subjectKind: 'standard', subjectText: input[inputName] }));

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
		const rowDetail = rowDetailOf({ registryRow, input: operationInput });
		const detail = detailOf({ registryRow, input: operationInput });
		const answerCacheName = `${operationName}\u0000${rowDetail}`; // standards has one form; graph has two, each kept once it is read
		const firstRefusal = registryRow.requiresUriPromise ? (manifestRefusalFor({ operationName, expectManifest }) || embeddingRefusalFor({ registryRow, operationName, input: operationInput })) : null;
		if (firstRefusal) {
			callback('', refusedAnswerFor({ operationName, refusal: firstRefusal }));
			return;
		}
		if (registryRow.cachesAnswerPerManifest && (cachedAnswerByOperationName[answerCacheName] || waiterListByOperationName[answerCacheName])) {
			if (principal.kind !== 'rosettaJob') {
				usageCounter.countAnswer({ operationName, subjectList: [], uriList: [] }); // these answers name no URI and take no subject
			}
			if (cachedAnswerByOperationName[answerCacheName]) {
				callback('', cachedAnswerByOperationName[answerCacheName]);
				return;
			}
			waiterListByOperationName[answerCacheName].push(callback);
			return;
		}
		// ⟪rosettaFreeInput, ROMANTIC_PARASOL 2026-11-10⟫ a row that holds its own in-flight cap (rosetta/interpret: a model call that can take minutes) is kept out of the core's
		// slots entirely, so however many such calls are open, every other operation still has all of its own
		const usesCoreSlot = !registryRow.holdsOwnInFlightCap;
		if (usesCoreSlot && inFlightCount >= inputCapByName.inFlightMax) {
			callback('', refusedAnswerFor({ operationName, retryAfterSeconds: BUSY_RETRY_SECONDS, refusal: refusalOf(operationName, 'busy', `${inFlightCount} queries are running, the most this instance runs at once; retry in ${BUSY_RETRY_SECONDS} seconds`) }));
			return;
		}
		inFlightCount += usesCoreSlot ? 1 : 0;
		// a scan has its own cap per operation, so one kind of slow question cannot hold every slot; only a call that actually scans counts, so an exact element never does
		let isHoldingScanSlot = false;
		const admitScan = registryRow.scanInFlightMax ? () => {
			if ((scanCountByOperationName[operationName] || 0) >= registryRow.scanInFlightMax) {
				return false;
			}
			scanCountByOperationName[operationName] = (scanCountByOperationName[operationName] || 0) + 1;
			isHoldingScanSlot = true;
			return true;
		} : undefined;
		const cacheInUseAtStart = cachedAnswerByOperationName;
		if (registryRow.cachesAnswerPerManifest) {
			waiterListByOperationName[answerCacheName] = [];
		}
		// the first asker and everyone who waited on it get one answer; it is kept only if it succeeded and the graph did not change while it ran
		const finishOperation = (finishedAnswer) => {
			const waiterList = waiterListByOperationName[answerCacheName] || [];
			delete waiterListByOperationName[answerCacheName];
			if (registryRow.cachesAnswerPerManifest && finishedAnswer.httpStatus === 200 && cacheInUseAtStart === cachedAnswerByOperationName) {
				cachedAnswerByOperationName[answerCacheName] = finishedAnswer;
			}
			[callback, ...waiterList].forEach((oneCallback) => oneCallback('', finishedAnswer));
		};
		const namedUriList = [];
		const namedSubjectList = [];
		const pageNumber = operationInput.page === undefined ? 1 : Number(operationInput.page);
		const { page: unusedPage, [ROW_DETAIL_INPUT_NAME]: unusedRowDetail, ...inputPastRowDetail } = operationInput;
		const unresolvedHandlerInput = registryRow.envelopeRule ? Object.keys(inputPastRowDetail).filter((inputName) => inputName !== registryRow.envelopeRule.detailInputName).reduce((soFar, inputName) => ({ ...soFar, [inputName]: inputPastRowDetail[inputName] }), {}) : inputPastRowDetail;
		const handlerInput = registryRow.requiresUriPromise ? withUriInputsResolved({ registryRow, input: unresolvedHandlerInput }) : unresolvedHandlerInput;
		HANDLER_BY_NAME[registryRow.coreHandlerName]({ registryRow, input: handlerInput, pageNumber, rowDetail, detail, namedUriList, namedSubjectList, admitScan, principal }, (handlerError, handlerResult) => {
			inFlightCount -= usesCoreSlot ? 1 : 0;
			if (isHoldingScanSlot) {
				scanCountByOperationName[operationName] -= 1;
			}
			if (handlerError) {
				finishOperation(errorAnswerFor({ operationName, errorText: String(handlerError) }));
				return;
			}
			if (handlerResult.answer.refusedByName) {
				finishOperation(refusedAnswerFor({ operationName, refusal: handlerResult.answer, retryAfterSeconds: handlerResult.retryAfterSeconds }));
				return;
			}
			const isSummary = rowDetail === ROW_DETAIL_SUMMARY;
			const answer = isSummary ? summaryAnswerOf({ registryRow, answer: handlerResult.answer, namedUriList }) : handlerResult.answer;
			if (registryRow.isCounted && principal.kind !== 'rosettaJob') {
				usageCounter.countAnswer({ operationName, subjectList: [...subjectListFor({ registryRow, input: operationInput }), ...namedSubjectList], uriList: namedUriList });
			}
			finishOperation({
				httpStatus: 200,
				bodyText: JSON.stringify(registryRow.bodyForm === 'envelope' ? envelopeOf({ registryRow, operationName, detail, answer, answeredFromAddition: handlerResult.answeredFromAddition, isSummary }) : answer),
				cachePolicy: handlerResult.cachePolicy || registryRow.cachePolicy,
			});
		});
	};

	return {
		runOperation,
		registryRowFor: (operationName) => registryRowByOperationName[operationName],
		serviceState: () => ({ isServing: serviceFacts !== null, unavailableReason, inFlightCount, embeddingTokensToday: embeddingTokensSpentToday() }),
		serviceFactsForGate: () => serviceFacts, // the proved facts, for a gate that calls the retrieval stage directly
	};
};

module.exports = { createStandardsQueryCore };
