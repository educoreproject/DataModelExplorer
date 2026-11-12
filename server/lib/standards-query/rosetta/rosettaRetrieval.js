'use strict';

// rosettaRetrieval — POST rosetta/retrieval and rosetta_retrieve: a submission in, pools per field per hub out (design 4.1 to 4.3, 4.9). Nothing is judged and the judge is never reached: this module cannot reach it. The fuse is separate from search's (design 4.2): its own token ceiling, its own in-flight count, and tripping it never touches search's vector leg, because search's counting embedder is not the one used here.
//
//   rosettaFuseValuesOf(configValues) → { fuseValues } | { refusalText }
//   retrievalAnswerOf({ submissionForm, parsed, hubRowList, poolByTargetName, fieldVectorList, describedList, facts, fuseValues, detail }) → the answer (pure; detail lean | audit)
//   createRosettaRetrieval({ fuseValues, strangerVectorStore, embedder, forgeRetrievalModules, searchDescriber, runCypher, checkGraphEmbeddingContract, neo4jIntegerOf, nowDate, xLog })
//     searchDescriber (rosettaSearchDescriber) is required, off or on: a field sent with no definition gets its search description as a second text, and the runner reads it here too
//     → { runRetrieval({ withReadSession, serviceFacts, input, principal, detail, namedSubjectList, answerNoteValues }, done(err, { answer, retryAfterSeconds? })), retrieveCandidates(...), hubRowListFor({ withReadSession, serviceFacts }, done(err, hubRowList)), searchDescriber, stats() }
//   retrieveCandidates({ session, serviceFacts, queryTextList: [name, definition?, searchDescription?], target }, done(err, { refusal } | { candidateList, poolSize, admittedCount, cosineRankOneOutsidePool?, target, embeddingModelVersion, status })): hitsPerText, minScore and k are the fuse's values, read once
//
// WHERE A STRANGER'S TEXT GOES: to the embedding vendor, to become a vector, and into the answer it was sent for. Never to a log (an embedding failure logs the vendor's status, not its body), never to Neo4j (a vector goes, which is why the keyword leg is not fused: it would put the text in a query parameter), never to usageCounts (the hubs are counted, and no URI: a pool is what the service said, not what anyone asked). In the store: its sha256 and vector, with no text.

const crypto = require('crypto');
const { pipeRunner, taskListPlus } = new (require('qtools-asynchronous-pipe-plus'))();

const { createRetrievalDriver } = require('./retrieveCandidates');
const { parseFieldList } = require('./parsers/fieldListParser');
const { parseJsonSchema } = require('./parsers/jsonSchemaParser');
const { parseJsonLdContext } = require('./parsers/jsonLdContextParser');
const { DETAIL_LIST, DETAIL_AUDIT } = require('./rosettaAnswerDetail');
const { searchDescriptionFieldsOf, isBareField } = require('./rosettaSearchDescriber');
const { ANONYMOUS_PRINCIPAL_KIND } = require('../admitRequest');

const moduleName = 'rosettaRetrieval';
const OPERATION_NAME = 'rosettaRetrieval';
const BYTES_PER_TOKEN_ESTIMATE = 4;
const BUSY_RETRY_SECONDS = 5;
const SKIP_REST_OF_PIPE = 'skipRestOfPipe';
const HTTP_STATUS_IN_VENDOR_ERROR_PATTERN = /error (\d{3})/;
const TEXT_INDEX_LABEL = 'DmeEmbedText';
const TEXT_INDEX_PROPERTY_NAME = 'textEmbedding';
const SHOW_VECTOR_INDEXES_CYPHER = 'SHOW INDEXES YIELD name, type, entityType, labelsOrTypes, properties';
const HUB_LIST_CYPHER = 'MATCH (hub:HubDefinition) RETURN hub.hubName AS hubName, hub._source AS sourceName, hub.version AS hubVersion ORDER BY hubName';
const BASE_ROLE_BY_KIND_FROM_VOCABULARY = Object.freeze({ class: 'CLASS', property: 'PROPERTY', optionSet: 'OPTION_SET' });
const TIER_OFFERED = 'property';
const OMITTED_COUNT_NAME_LIST = Object.freeze(['unresolvedRefOmittedCount', 'unresolvedContextOmittedCount', 'notWalkedOmittedCount']);

// DATA: each submission form, the input that carries it, and what reads it. A new form is one row and one parser file.
const SUBMISSION_FORM_LIST = Object.freeze([
	{ inputName: 'fieldList', formatName: 'fieldList', parser: parseFieldList },
	{ inputName: 'jsonSchema', formatName: 'jsonSchema', parser: parseJsonSchema },
	{ inputName: 'jsonLdContext', formatName: 'jsonLdContext', parser: parseJsonLdContext },
]);

// ⟪P7b, TQ Q67b⟫ THE ANSWER, in fetch's words: a field is named as it was sent (requestName, requestPath, requestDefinition, requestType) and holds resultList, one
// item per hub naming its hub, each the pool as it was made. detail is fetch's (ROMANTIC_PARASOL Q-A, Q-C, 2026-11-09): lean (the default, declared in the registry)
// leaves the whole-answer counts out; audit gives them back, fieldCount and poolCountList, a list naming each hub. Pure: arguments in, answer out.
// ⟪rosettaSearchDescription⟫ a field sent with no description carries searchDescription (the model's sentence, by its model) or searchDescriptionAbsent (why there is none),
// added fields beside the person's own and never in them; the answer says once what a search description is (searchDescriptionNote)
const retrievalAnswerOf = ({ submissionForm, parsed, hubRowList, poolByTargetName, fieldVectorList, describedList, facts, fuseValues, detail }) => {
	if (!DETAIL_LIST.includes(detail)) {
		throw new Error(`${moduleName}: detail must be one of ${DETAIL_LIST.join(', ')} (got ${JSON.stringify(detail)}); the registry row declares the default`);
	}
	if (!Array.isArray(describedList) || describedList.length !== parsed.fieldList.length) {
		throw new Error(`${moduleName}: describedList must hold one entry per field (undefined for a field with a definition), as searchDescriber.describeFieldList answers; got ${Array.isArray(describedList) ? `${describedList.length} for ${parsed.fieldList.length} fields` : JSON.stringify(describedList)}`);
	}
	const isAudit = detail === DETAIL_AUDIT;
	return {
		submissionFormat: submissionForm.formatName,
		...(isAudit ? { fieldCount: parsed.fieldList.length } : {}),
		hubList: hubRowList.map((oneHub) => oneHub.hubName),
		nothingJudgedNote: facts.nothingJudgedNote,
		rankNote: facts.rankNote,
		...(parsed.fieldList.some(isBareField) ? { searchDescriptionNote: facts.searchDescriptionNote } : {}),
		retrievalSetting: { hitsPerText: fuseValues.hitsPerText, minCosine: fuseValues.minScore, poolCap: fuseValues.poolCap, tier: TIER_OFFERED },
		fieldList: parsed.fieldList.map((oneField, fieldIndex) => {
			const { fieldRefId } = fieldVectorList[fieldIndex];
			return {
				requestName: oneField.name,
				...(oneField.path === undefined ? {} : { requestPath: oneField.path }),
				...(oneField.definition === undefined ? {} : { requestDefinition: oneField.definition }),
				...(oneField.type === undefined ? {} : { requestType: oneField.type }),
				...(oneField.definitionAbsent ? { definitionAbsent: true } : {}),
				...searchDescriptionFieldsOf(describedList[fieldIndex]),
				...(oneField.valueTierNotOffered ? { valueTierNotOffered: true } : {}),
				// judgedViewLength is the judge's business (hubHybrid), never the answer's: the pool's shape is the same for every kind
				resultList: hubRowList.map(({ hubName }) => { const { judgedViewLength, ...onePool } = poolByTargetName[hubName][fieldRefId]; return { hub: hubName, ...onePool }; }),
			};
		}),
		...(isAudit ? {
			poolCountList: hubRowList.map(({ hubName }) => {
				const poolList = Object.values(poolByTargetName[hubName]);
				const nonEmptyCount = poolList.filter((onePool) => onePool.poolSize > 0).length;
				return { hub: hubName, fieldsWithCandidates: nonEmptyCount, emptyPools: poolList.length - nonEmptyCount };
			}),
		} : {}),
		unresolvedRefList: parsed.unresolvedRefList,
		unresolvedContextList: parsed.unresolvedContextList,
		notWalkedList: parsed.notWalkedList,
		...OMITTED_COUNT_NAME_LIST.reduce((soFar, countName) => (parsed[countName] ? { ...soFar, [countName]: parsed[countName] } : soFar), {}),
	};
};

const INTEGER_SETTING_NAME_LIST = Object.freeze(['hybridMeaningCount', 'judgedDailyTokenCeiling', 'maxUnresolvedListLength', 'maxFieldListLength', 'maxFieldNameChars', 'maxFieldDefinitionChars', 'maxFieldPathChars', 'maxDocumentDepth', 'maxRefExpansions', 'retrievalMaxTokensPerRequest', 'retrievalDailyTokenCeiling', 'retrievalInFlightMax', 'hitsPerText', 'poolCap', 'indexWindowPerText', 'textsPerGraphQuery', 'strangerVectorCacheMaxRows', 'strangerVectorRetentionDays']);
const NUMBER_SETTING_NAME_LIST = Object.freeze(['minScore', 'judgeUsdPerFieldEstimate']);
const TEXT_SETTING_NAME_LIST = Object.freeze(['rosettaStoreFilePath']);
// ⟪rosettaMeanings R5⟫ which pool runner reads a hub (retrieveCandidates' POOL_RUNNER_BY_KIND): hubCards votes through the hub elements' own texts rolled up to cards; hubMeanings searches the cards' own embeddings. One choice serves retrieval and the judge alike, so the API shows what the judge sees.
const HUB_TARGET_KIND_LIST = Object.freeze(['hubCards', 'hubMeanings', 'hubHybrid']);
// hubMeanings (and hubHybrid's meaning half) combine a card's cosines to a field's texts by a named scoring; hubHybrid adds hybridMeaningCount meanings past the judge's view (judgedPoolCap)
const MEANING_SCORING_NAME_LIST = Object.freeze(Object.keys(require('./retrieveCandidates').MEANING_SCORE_BY_NAME));

const rosettaFuseValuesOf = (configValues) => {
	const badIntegerList = INTEGER_SETTING_NAME_LIST.filter((settingName) => !/^[1-9][0-9]*$/.test(String(configValues[settingName])));
	const badNumberList = NUMBER_SETTING_NAME_LIST.filter((settingName) => !(Number(configValues[settingName]) > 0));
	const absentTextList = TEXT_SETTING_NAME_LIST.filter((settingName) => !configValues[settingName]);
	const badTargetKindList = HUB_TARGET_KIND_LIST.includes(configValues.hubTargetKind) ? [] : [`hubTargetKind (one of ${HUB_TARGET_KIND_LIST.join(', ')}; got ${JSON.stringify(configValues.hubTargetKind)})`];
	const badScoringList = MEANING_SCORING_NAME_LIST.includes(configValues.meaningScoringName) ? [] : [`meaningScoringName (one of ${MEANING_SCORING_NAME_LIST.join(', ')}; got ${JSON.stringify(configValues.meaningScoringName)})`];
	const badJudgedPoolCapList = /^[0-9]+$/.test(String(configValues.judgedPoolCap)) ? [] : ['judgedPoolCap (0 is the whole pool)'];
	const faultList = [...badIntegerList, ...badNumberList, ...absentTextList, ...badTargetKindList, ...badScoringList, ...badJudgedPoolCapList];
	if (faultList.length > 0) {
		return { refusalText: `[rosetta-fuse] must give ${[...INTEGER_SETTING_NAME_LIST, ...NUMBER_SETTING_NAME_LIST, ...TEXT_SETTING_NAME_LIST, 'hubTargetKind', 'meaningScoringName', 'judgedPoolCap'].join(', ')}; absent or bad: ${faultList.join(', ')}` };
	}
	return {
		fuseValues: {
			...[...INTEGER_SETTING_NAME_LIST, ...NUMBER_SETTING_NAME_LIST].reduce((soFar, settingName) => ({ ...soFar, [settingName]: Number(configValues[settingName]) }), {}),
			...TEXT_SETTING_NAME_LIST.reduce((soFar, settingName) => ({ ...soFar, [settingName]: configValues[settingName] }), {}),
			hubTargetKind: configValues.hubTargetKind,
			meaningScoringName: configValues.meaningScoringName,
			judgedPoolCap: Number(configValues.judgedPoolCap),
		},
	};
};

const { reasonOf } = require('./rosettaReasonWords');
const refusalOf = (refusalName, reason, extraFields = {}) => ({ refusedByName: OPERATION_NAME, refusalName, reason, ...extraFields });
const textHashOf = (textValue) => crypto.createHash('sha256').update(textValue).digest('hex');
const tokenEstimateOf = (textValue) => Math.ceil(Buffer.byteLength(textValue) / BYTES_PER_TOKEN_ESTIMATE);
const sliceListOf = (itemList, sliceSize) => {
	const sliceList = [];
	for (let startIndex = 0; startIndex < itemList.length; startIndex += sliceSize) {
		sliceList.push(itemList.slice(startIndex, startIndex + sliceSize));
	}
	return sliceList;
};
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

// one row per distinct text of a field: the same words as name and as definition are one text and one vote, as a forge text node serving two properties is.
// ⟪rosettaSearchDescription⟫ a field with no definition may carry a search description, the model's sentence: a text of its own role, so a card it reaches says so in admittedBy
const SEARCH_DESCRIPTION_TEXT_ROLE = 'searchDescription';
const fieldTextListOf = (oneField, searchDescriptionText) => {
	const textRoleListByText = new Map();
	[['name', oneField.name], ['definition', oneField.definition], [SEARCH_DESCRIPTION_TEXT_ROLE, searchDescriptionText]].filter(([, textValue]) => textValue).forEach(([textRole, textValue]) => textRoleListByText.set(textValue, [...(textRoleListByText.get(textValue) || []), textRole]));
	return [...textRoleListByText.entries()].map(([textValue, textRoleList]) => ({ textValue, textHash: textHashOf(textValue), textRoleList }));
};

const createRosettaRetrieval = ({ fuseValues, strangerVectorStore, embedder, forgeRetrievalModules, searchDescriber, runCypher, checkGraphEmbeddingContract, neo4jIntegerOf, nowDate, xLog }) => {
	if (!searchDescriber || typeof searchDescriber.describeFieldList !== 'function') {
		throw new Error(`${moduleName}: createRosettaRetrieval needs searchDescriber (rosettaSearchDescriber.buildRosettaSearchDescriber answers one, off or on)`);
	}
	const { candidateRetrievalLib, hubEdgeType, dmeRoles } = forgeRetrievalModules;
	const baseRoleByBaseKind = Object.keys(BASE_ROLE_BY_KIND_FROM_VOCABULARY).reduce((soFar, baseKind) => ({ ...soFar, [baseKind]: dmeRoles[BASE_ROLE_BY_KIND_FROM_VOCABULARY[baseKind]] }), {});
	const parserLimitValues = fuseValues;
	const retrievalStats = { textsEmbeddedTotal: 0, embedCallsTotal: 0, cachedTextsServedTotal: 0, estimatedTokensTotal: 0, lastRequest: null };
	let inFlightCount = 0;
	let graphFactsHolder = { forServiceFacts: null, graphFacts: null };

	// the graph's own answers to which index and which hubs: read once per proved graph, since the URI promise gate reruns on every connection and hands out new serviceFacts when it does
	const withGraphFacts = ({ session, serviceFacts }, done) => {
		if (graphFactsHolder.forServiceFacts === serviceFacts) {
			done('', graphFactsHolder.graphFacts);
			return;
		}
		checkGraphEmbeddingContract({ session, verbName: OPERATION_NAME }, (contractError, contractRead) => {
			if (contractError) {
				done(contractError);
				return;
			}
			if (contractRead.refusal) {
				done('', { refusal: contractRead.refusal });
				return;
			}
			runCypher(session, SHOW_VECTOR_INDEXES_CYPHER, {}, (indexError, indexResult) => {
				if (indexError) {
					done(`listing the graph's indexes failed: ${indexError}`);
					return;
				}
				const textIndexNameList = indexResult.records.filter((oneRecord) => oneRecord.get('type') === 'VECTOR' && (oneRecord.get('labelsOrTypes') || []).includes(TEXT_INDEX_LABEL) && (oneRecord.get('properties') || []).includes(TEXT_INDEX_PROPERTY_NAME)).map((oneRecord) => oneRecord.get('name'));
				if (textIndexNameList.length !== 1) {
					done(`this graph must hold exactly one vector index on :${TEXT_INDEX_LABEL}(${TEXT_INDEX_PROPERTY_NAME}); it holds ${textIndexNameList.length}`);
					return;
				}
				runCypher(session, HUB_LIST_CYPHER, {}, (hubError, hubResult) => {
					if (hubError) {
						done(`reading the hubs failed: ${hubError}`);
						return;
					}
					const graphFacts = { textIndexName: textIndexNameList[0], hubRowList: hubResult.records.map((oneRecord) => oneRecord.toObject()), embeddingModelVersion: serviceFacts.passport.embeddingModelVersion };
					graphFactsHolder = { forServiceFacts: serviceFacts, graphFacts };
					done('', graphFacts);
				});
			});
		});
	};

	// two counts, one for each door to the vendor: an open retrieval spending its ceiling must not stop a signed-in job, nor a job an open retrieval
	const TOKEN_ACCOUNT_BY_NAME = Object.freeze({
		retrieval: { dailyCeiling: fuseValues.retrievalDailyTokenCeiling, spentToday: strangerVectorStore.tokensSpentToday, addToday: strangerVectorStore.addTokensToday, ceilingRefusal: () => refusalOf('retrievalCeilingReached', reasonOf('retrievalTokensWouldPass', { dailyTokenCeiling: fuseValues.retrievalDailyTokenCeiling }), { dailyTokenCeiling: fuseValues.retrievalDailyTokenCeiling }) },
		judged: { dailyCeiling: fuseValues.judgedDailyTokenCeiling, spentToday: strangerVectorStore.judgedTokensSpentToday, addToday: strangerVectorStore.addJudgedTokensToday, ceilingRefusal: () => refusalOf('judgedTokenCeilingReached', reasonOf('judgedTokensWouldPass', { dailyTokenCeiling: fuseValues.judgedDailyTokenCeiling }), { dailyTokenCeiling: fuseValues.judgedDailyTokenCeiling }) },
	});

	// THE SPEND. Every text is asked of the cache first; only what is new costs a call. The fuse is read before any call, and the day's tokens are charged before the call goes, so a request that fails still counted.
	const vectorsForTextRowList = ({ distinctTextRowList, embeddingModelVersion, tokenAccountName = 'retrieval', onTokensCharged }, done) => {
		const tokenAccount = TOKEN_ACCOUNT_BY_NAME[tokenAccountName];
		const textHashList = distinctTextRowList.map((oneRow) => oneRow.textHash);
		strangerVectorStore.readVectors({ textHashList, embeddingModelVersion }, (readError, cachedVectorByTextHash) => {
			if (readError) {
				done(`the rosetta store would not read: ${readError}`);
				return;
			}
			const newTextRowList = distinctTextRowList.filter((oneRow) => !cachedVectorByTextHash[oneRow.textHash]);
			const estimatedTokens = newTextRowList.reduce((soFar, oneRow) => soFar + tokenEstimateOf(oneRow.textValue), 0);
			if (estimatedTokens > fuseValues.retrievalMaxTokensPerRequest) {
				done('', { refusal: refusalOf('retrievalTokensPerRequestExceeded', reasonOf('retrievalTokensPerRequestExceeded', { estimatedTokens, maxTokens: fuseValues.retrievalMaxTokensPerRequest }), { estimatedTokens, maxTokens: fuseValues.retrievalMaxTokensPerRequest }) });
				return;
			}
			tokenAccount.spentToday((spentError, tokensSpentToday) => {
				if (spentError) {
					done(`the rosetta store would not read: ${spentError}`);
					return;
				}
				if (estimatedTokens > 0 && tokensSpentToday + estimatedTokens > tokenAccount.dailyCeiling) {
					done('', { refusal: tokenAccount.ceilingRefusal() });
					return;
				}
				retrievalStats.cachedTextsServedTotal += distinctTextRowList.length - newTextRowList.length;
				retrievalStats.estimatedTokensTotal += estimatedTokens;
				const requestStats = { distinctTextCount: distinctTextRowList.length, newTextCount: newTextRowList.length, embedCallCount: 0, estimatedTokens };
				retrievalStats.lastRequest = requestStats;
				if (newTextRowList.length === 0) {
					done('', { vectorByTextHash: cachedVectorByTextHash });
					return;
				}
				tokenAccount.addToday(estimatedTokens, (chargeError) => {
					if (chargeError) {
						done(`the rosetta store would not take the day's count: ${chargeError}`);
						return;
					}
					if (onTokensCharged) {
						onTokensCharged({ estimatedTokens, newTextCount: newTextRowList.length, cachedTextCount: distinctTextRowList.length - newTextRowList.length });
					}
					const vectorByTextHash = { ...cachedVectorByTextHash };
					eachInTurn(sliceListOf(newTextRowList, embedder.batchSize), (textSlice, next) => {
						requestStats.embedCallCount += 1;
						retrievalStats.embedCallsTotal += 1;
						embedder.embed(textSlice.map((oneRow) => oneRow.textValue), (embedError, vectorList) => {
							if (embedError) {
								const statusMatch = String(embedError).match(HTTP_STATUS_IN_VENDOR_ERROR_PATTERN);
								xLog.error(`${moduleName}: the embedding call failed${statusMatch ? ` with status ${statusMatch[1]}` : ''}`); // never the vendor's body, which may repeat what it was sent
								next('embeddingFailed');
								return;
							}
							retrievalStats.textsEmbeddedTotal += textSlice.length;
							textSlice.forEach((oneRow, rowIndex) => { vectorByTextHash[oneRow.textHash] = vectorList[rowIndex]; });
							strangerVectorStore.writeVectors({ vectorRowList: textSlice.map((oneRow, rowIndex) => ({ textHash: oneRow.textHash, vector: vectorList[rowIndex] })), embeddingModelVersion }, (writeError) => next(writeError ? `the rosetta store would not write: ${writeError}` : ''));
						});
					}, (spendError) => {
						if (spendError === 'embeddingFailed') {
							done('', { refusal: refusalOf('embeddingFailed', reasonOf('embeddingFailed')) });
							return;
						}
						if (spendError) {
							done(spendError);
							return;
						}
						// the vector read back, so a first answer and a resubmission are the same bytes: the vendor's own vectors differ call to call, and the store keeps one form
						strangerVectorStore.readVectors({ textHashList, embeddingModelVersion }, (rereadError, storedVectorByTextHash) => (rereadError ? done(`the rosetta store would not read: ${rereadError}`) : done('', { vectorByTextHash: { ...vectorByTextHash, ...storedVectorByTextHash } })));
					});
				});
			});
		});
	};

	const driverFor = ({ serviceFacts, graphFacts }) => createRetrievalDriver({
		candidateRetrievalLib,
		neo4jIntegerOf,
		hubEdgeType,
		baseRoleByBaseKind,
		runCypher,
		uriMinter: serviceFacts.uriMinter,
		embeddingModelVersion: graphFacts.embeddingModelVersion,
		textIndexName: graphFacts.textIndexName,
		retrievalSettingValues: fuseValues,
	});

	// a slice of fields at a time: the handle's per-query time limit is on each query, a slice's card vectors leave memory with it, and the graph is not held for one long statement
	const poolsForFieldVectorList = ({ withReadSession, serviceFacts, graphFacts, fieldVectorList, targetList }, done) => {
		const retrievalDriver = driverFor({ serviceFacts, graphFacts });
		const poolByTargetName = targetList.reduce((soFar, { targetName }) => ({ ...soFar, [targetName]: {} }), {});
		const sliceSize = Math.max(1, Math.floor(fuseValues.textsPerGraphQuery / 2));
		eachInTurn(targetList, ({ targetName, target }, nextTarget) => {
			// a session of its own per slice: neo4j-driver's Session keeps every Result, records and all, in _results until it closes, so one session for a whole request held 1.5 GB at 200 fields (measured, runs/P3/heapProbeBefore.txt)
			eachInTurn(sliceListOf(fieldVectorList, sliceSize), (fieldSlice, nextSlice) => withReadSession((session, sessionDone) => retrievalDriver.poolsForFieldSlice({ session, fieldSlice, target }, sessionDone), (poolError, poolByFieldRefId) => {
				if (poolError) {
					nextSlice(poolError);
					return;
				}
				Object.assign(poolByTargetName[targetName], poolByFieldRefId);
				nextSlice('');
			}), nextTarget);
		}, (poolFault) => (poolFault ? done(poolFault) : done('', poolByTargetName)));
	};

	const submissionFormOf = (input) => SUBMISSION_FORM_LIST.filter((oneForm) => input[oneForm.inputName] !== undefined);

	// THE ONE DOOR-INDEPENDENT RUN. Every cap here holds on MCP, which has no per-address limiter.
	// ⟪rosettaSearchDescription review S4⟫ the slot is taken AFTER the search describer has answered: a model call never holds retrieval's slot (retrievalInFlightMax), and
	// the registry row holds its own cap (holdsOwnInFlightCap), so it never holds a core slot either. Parsing, the graph's facts and the hub check come first, so a
	// request refused by any of them spends nothing.
	const runRetrieval = ({ withReadSession, serviceFacts, input, principal, detail, namedSubjectList, answerNoteValues }, callback) => {
		if (!principal || typeof principal.kind !== 'string') {
			callback(`${moduleName}: runRetrieval needs the caller's principal, whose kind picks the search describer's pot`);
			return;
		}
		let holdsSlot = false;
		const done = (doneError, doneResult) => {
			if (holdsSlot) {
				inFlightCount -= 1;
			}
			callback(doneError, doneResult);
		};
		const taskList = new taskListPlus();
		const stopWith = (args, next, refusal) => next(SKIP_REST_OF_PIPE, { ...args, refusal });

		taskList.push((args, next) => {
			const formList = submissionFormOf(input);
			if (formList.length !== 1) {
				stopWith(args, next, refusalOf('noSubmission', reasonOf('submissionFormCount', { formNameListText: SUBMISSION_FORM_LIST.map((oneForm) => oneForm.inputName).join(', '), formCount: formList.length }), { validValueList: SUBMISSION_FORM_LIST.map((oneForm) => oneForm.inputName) }));
				return;
			}
			const [submissionForm] = formList;
			const parsed = submissionForm.parser({ submittedDocument: input[submissionForm.inputName], parserLimitValues });
			if (parsed.refusal) {
				const { refusalName, reason, ...extraFields } = parsed.refusal;
				stopWith(args, next, refusalOf(refusalName, reason, extraFields));
				return;
			}
			next('', { ...args, submissionForm, parsed });
		});

		taskList.push((args, next) => withReadSession((session, sessionDone) => withGraphFacts({ session, serviceFacts }, sessionDone), (factsError, graphFacts) => {
			if (factsError) {
				next(factsError, args);
				return;
			}
			if (graphFacts.refusal) {
				stopWith(args, next, refusalOf(graphFacts.refusal.refusalName, graphFacts.refusal.reason));
				return;
			}
			next('', { ...args, graphFacts });
		}));

		taskList.push((args, next) => {
			const { hubRowList } = args.graphFacts;
			const validHubNameList = hubRowList.map((oneHub) => oneHub.hubName);
			if (input.hubList !== undefined && (input.hubList.length === 0 || input.hubList.some((hubName) => typeof hubName !== 'string'))) {
				stopWith(args, next, refusalOf('unknownHub', reasonOf('hubListEmpty'), { validValueList: validHubNameList }));
				return;
			}
			const unknownHubList = (input.hubList || []).filter((hubName) => !validHubNameList.includes(hubName));
			if (unknownHubList.length > 0) {
				stopWith(args, next, refusalOf('unknownHub', reasonOf('hubNamedUnknown', { hubNameListText: unknownHubList.join(', ') }), { validValueList: validHubNameList }));
				return;
			}
			const askedHubRowList = input.hubList ? hubRowList.filter((oneHub) => input.hubList.includes(oneHub.hubName)) : hubRowList;
			next('', { ...args, askedHubRowList });
		});

		// ⟪rosettaSearchDescription⟫ every bare field described, each in a call of its own, from the caller's pot; it never fails the request, and a field it could not
		// describe says why. No slot is held while it runs.
		taskList.push((args, next) => searchDescriber.describeFieldList({ fieldList: args.parsed.fieldList, isAnonymous: principal.kind === ANONYMOUS_PRINCIPAL_KIND }, (describeError, described) => (describeError ? next(describeError, args) : next('', { ...args, describedList: described.describedList }))));

		taskList.push((args, next) => {
			if (inFlightCount >= fuseValues.retrievalInFlightMax) {
				next(SKIP_REST_OF_PIPE, { ...args, refusal: refusalOf('busy', reasonOf('retrievalBusy', { inFlightCount, retryAfterSeconds: BUSY_RETRY_SECONDS })), retryAfterSeconds: BUSY_RETRY_SECONDS });
				return;
			}
			inFlightCount += 1;
			holdsSlot = true;
			next('', args);
		});

		taskList.push((args, next) => {
			const searchDescriptionTextOf = (fieldIndex) => (args.describedList[fieldIndex] && args.describedList[fieldIndex].searchDescription ? args.describedList[fieldIndex].searchDescription.descriptionText : undefined);
			const fieldTextRowList = args.parsed.fieldList.map((oneField, fieldIndex) => ({ fieldRefId: `field${fieldIndex}`, textRowList: fieldTextListOf(oneField, searchDescriptionTextOf(fieldIndex)) }));
			const distinctTextRowByHash = new Map(fieldTextRowList.flatMap((oneRow) => oneRow.textRowList).map((oneRow) => [oneRow.textHash, oneRow]));
			vectorsForTextRowList({ distinctTextRowList: [...distinctTextRowByHash.values()], embeddingModelVersion: args.graphFacts.embeddingModelVersion }, (vectorError, vectorRead) => {
				if (vectorError) {
					next(vectorError, args);
					return;
				}
				if (vectorRead.refusal) {
					stopWith(args, next, vectorRead.refusal);
					return;
				}
				const fieldVectorList = fieldTextRowList.map(({ fieldRefId, textRowList }) => ({ fieldRefId, textList: textRowList.map(({ textHash, textRoleList }) => ({ textHash, textRoleList, vector: vectorRead.vectorByTextHash[textHash] })) }));
				next('', { ...args, fieldVectorList });
			});
		});

		taskList.push((args, next) => {
			const targetList = args.askedHubRowList.map(({ hubName, sourceName }) => ({ targetName: hubName, target: { kind: fuseValues.hubTargetKind, hubName, sourceName, tier: TIER_OFFERED } }));
			poolsForFieldVectorList({ withReadSession, serviceFacts, graphFacts: args.graphFacts, fieldVectorList: args.fieldVectorList, targetList }, (poolError, poolByTargetName) => next(poolError, { ...args, poolByTargetName }));
		});

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError && pipeError !== SKIP_REST_OF_PIPE) {
				done(pipeError);
				return;
			}
			if (args.refusal) {
				done('', { answer: args.refusal, ...(args.retryAfterSeconds ? { retryAfterSeconds: args.retryAfterSeconds } : {}) });
				return;
			}
			args.askedHubRowList.forEach(({ hubName }) => namedSubjectList.push({ subjectKind: 'hub', subjectText: hubName }));
			done('', { answer: retrievalAnswerOf({ submissionForm: args.submissionForm, parsed: args.parsed, hubRowList: args.askedHubRowList, poolByTargetName: args.poolByTargetName, fieldVectorList: args.fieldVectorList, describedList: args.describedList, facts: answerNoteValues, fuseValues, detail }) });
		});
	};

	// the stage itself, for any caller: design 4.1's signature. target names a hub or a standard; a name the graph does not hold is refused with the valid list.
	const retrieveCandidates = ({ session, serviceFacts, queryTextList, target, tokenAccountName, onTokensCharged }, done) => {
		withGraphFacts({ session, serviceFacts }, (factsError, graphFacts) => {
			if (factsError) {
				done(factsError);
				return;
			}
			if (graphFacts.refusal) {
				done('', { refusal: graphFacts.refusal });
				return;
			}
			const hubTargetRefusal = () => {
				if (target.tier !== TIER_OFFERED) {
					return refusalOf('tierNotOffered', reasonOf('tierNotOffered', { tierOffered: TIER_OFFERED, tierAsked: target.tier }), { validValueList: [TIER_OFFERED] });
				}
				return graphFacts.hubRowList.some((oneHub) => oneHub.hubName === target.hubName) ? null : refusalOf('unknownHub', reasonOf('hubNamedUnknown', { hubNameListText: target.hubName }), { validValueList: graphFacts.hubRowList.map((oneHub) => oneHub.hubName) });
			};
			const targetRefusal = {
				...HUB_TARGET_KIND_LIST.reduce((soFar, hubTargetKind) => ({ ...soFar, [hubTargetKind]: hubTargetRefusal }), {}),
				standardElements: () => (serviceFacts.standardVersionByName[target.standardName] !== undefined ? null : refusalOf('unknownStandard', reasonOf('standardNamedUnknown', { standardName: target.standardName }), { validValueList: Object.keys(serviceFacts.standardVersionByName).sort() })),
			}[target.kind]();
			if (targetRefusal) {
				done('', { refusal: targetRefusal });
				return;
			}
			const resolvedTarget = HUB_TARGET_KIND_LIST.includes(target.kind) ? { ...target, sourceName: graphFacts.hubRowList.find((oneHub) => oneHub.hubName === target.hubName).sourceName } : target;
			const textRowList = fieldTextListOf({ name: queryTextList[0], definition: queryTextList[1] }, queryTextList[2]);
			vectorsForTextRowList({ distinctTextRowList: textRowList, embeddingModelVersion: graphFacts.embeddingModelVersion, tokenAccountName, onTokensCharged }, (vectorError, vectorRead) => {
				if (vectorError) {
					done(vectorError);
					return;
				}
				if (vectorRead.refusal) {
					done('', { refusal: vectorRead.refusal });
					return;
				}
				const fieldVector = { fieldRefId: 'field0', textList: textRowList.map(({ textHash, textRoleList }) => ({ textHash, textRoleList, vector: vectorRead.vectorByTextHash[textHash] })) };
				driverFor({ serviceFacts, graphFacts }).poolsForFieldSlice({ session, fieldSlice: [fieldVector], target: resolvedTarget }, (poolError, poolByFieldRefId) => (poolError ? done(poolError) : done('', { ...poolByFieldRefId.field0, target: resolvedTarget, embeddingModelVersion: graphFacts.embeddingModelVersion })));
			});
		});
	};

	// the graph's hubs, for the judged step's submission, read the way retrieval reads them
	const hubRowListFor = ({ withReadSession, serviceFacts }, done) => withReadSession((session, sessionDone) => withGraphFacts({ session, serviceFacts }, sessionDone), (factsError, graphFacts) => {
		if (factsError) {
			done(factsError);
			return;
		}
		if (graphFacts.refusal) {
			done(`${graphFacts.refusal.refusalName}: ${graphFacts.refusal.reason}`);
			return;
		}
		done('', graphFacts.hubRowList);
	});

	return { runRetrieval, retrieveCandidates, hubRowListFor, searchDescriber, hubTargetKind: fuseValues.hubTargetKind, stats: () => ({ ...retrievalStats, inFlightCount }) };
};

module.exports = { createRosettaRetrieval, rosettaFuseValuesOf, retrievalAnswerOf, SUBMISSION_FORM_LIST, HUB_TARGET_KIND_LIST };
