'use strict';

// rosettaRetrieval — POST rosetta/retrieval and rosetta_retrieve: a submission in, pools per field per hub out (design 4.1 to 4.3, 4.9). Nothing is judged and the judge is never reached: this module cannot reach it. The fuse is separate from search's (design 4.2): its own token ceiling, its own in-flight count, and tripping it never touches search's vector leg, because search's counting embedder is not the one used here.
//
//   rosettaFuseValuesOf(configValues) → { fuseValues } | { refusalText }
//   createRosettaRetrieval({ fuseValues, strangerVectorStore, embedder, forgeRetrievalModules, runCypher, checkGraphEmbeddingContract, neo4jIntegerOf, nowDate, xLog })
//     → { runRetrieval({ session, serviceFacts, input, namedSubjectList, answerNoteValues }, done(err, { answer, retryAfterSeconds? })), retrieveCandidates(...), stats() }
//   retrieveCandidates({ session, serviceFacts, queryTextList: [name, definition?], target }, done(err, { refusal } | { candidateList, poolSize, admittedCount, cosineRankOneOutsidePool?, target, embeddingModelVersion, status })): hitsPerText, minScore and k are the fuse's values, read once
//
// WHERE A STRANGER'S TEXT GOES: to the embedding vendor, to become a vector, and into the answer it was sent for. Never to a log (an embedding failure logs the vendor's status, not its body), never to Neo4j (a vector goes, which is why the keyword leg is not fused: it would put the text in a query parameter), never to usageCounts (the hubs are counted, and no URI: a pool is what the service said, not what anyone asked). In the store: its sha256 and vector, with no text.

const crypto = require('crypto');
const { pipeRunner, taskListPlus } = new (require('qtools-asynchronous-pipe-plus'))();

const { createRetrievalDriver } = require('./retrieveCandidates');
const { parseFieldList } = require('./parsers/fieldListParser');
const { parseJsonSchema } = require('./parsers/jsonSchemaParser');
const { parseJsonLdContext } = require('./parsers/jsonLdContextParser');

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

// DATA: each submission form, the input that carries it, and what reads it. A new form is one row and one parser file.
const SUBMISSION_FORM_LIST = Object.freeze([
	{ inputName: 'fieldList', formatName: 'fieldList', parser: parseFieldList },
	{ inputName: 'jsonSchema', formatName: 'jsonSchema', parser: parseJsonSchema },
	{ inputName: 'jsonLdContext', formatName: 'jsonLdContext', parser: parseJsonLdContext },
]);

const INTEGER_SETTING_NAME_LIST = Object.freeze(['maxFieldListLength', 'maxFieldNameChars', 'maxFieldDefinitionChars', 'maxFieldPathChars', 'maxDocumentDepth', 'maxRefExpansions', 'retrievalMaxTokensPerRequest', 'retrievalDailyTokenCeiling', 'retrievalInFlightMax', 'hitsPerText', 'poolCap', 'indexWindowPerText', 'textsPerGraphQuery', 'strangerVectorCacheMaxRows', 'strangerVectorRetentionDays']);
const NUMBER_SETTING_NAME_LIST = Object.freeze(['minScore', 'judgeUsdPerFieldEstimate']);
const TEXT_SETTING_NAME_LIST = Object.freeze(['rosettaStoreFilePath']);

const rosettaFuseValuesOf = (configValues) => {
	const badIntegerList = INTEGER_SETTING_NAME_LIST.filter((settingName) => !/^[1-9][0-9]*$/.test(String(configValues[settingName])));
	const badNumberList = NUMBER_SETTING_NAME_LIST.filter((settingName) => !(Number(configValues[settingName]) > 0));
	const absentTextList = TEXT_SETTING_NAME_LIST.filter((settingName) => !configValues[settingName]);
	const faultList = [...badIntegerList, ...badNumberList, ...absentTextList];
	if (faultList.length > 0) {
		return { refusalText: `[rosetta-fuse] must give ${[...INTEGER_SETTING_NAME_LIST, ...NUMBER_SETTING_NAME_LIST, ...TEXT_SETTING_NAME_LIST].join(', ')}; absent or bad: ${faultList.join(', ')}` };
	}
	return {
		fuseValues: {
			...[...INTEGER_SETTING_NAME_LIST, ...NUMBER_SETTING_NAME_LIST].reduce((soFar, settingName) => ({ ...soFar, [settingName]: Number(configValues[settingName]) }), {}),
			...TEXT_SETTING_NAME_LIST.reduce((soFar, settingName) => ({ ...soFar, [settingName]: configValues[settingName] }), {}),
		},
	};
};

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

// one row per distinct text of a field: the same words as name and as definition are one text and one vote, as a forge text node serving two properties is
const fieldTextListOf = (oneField) => {
	const textRoleListByText = new Map();
	[['name', oneField.name], ['definition', oneField.definition]].filter(([, textValue]) => textValue).forEach(([textRole, textValue]) => textRoleListByText.set(textValue, [...(textRoleListByText.get(textValue) || []), textRole]));
	return [...textRoleListByText.entries()].map(([textValue, textRoleList]) => ({ textValue, textHash: textHashOf(textValue), textRoleList }));
};

const createRosettaRetrieval = ({ fuseValues, strangerVectorStore, embedder, forgeRetrievalModules, runCypher, checkGraphEmbeddingContract, neo4jIntegerOf, nowDate, xLog }) => {
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

	// THE SPEND. Every text is asked of the cache first; only what is new costs a call. The fuse is read before any call, and the day's tokens are charged before the call goes, so a request that fails still counted.
	const vectorsForTextRowList = ({ distinctTextRowList, embeddingModelVersion }, done) => {
		const textHashList = distinctTextRowList.map((oneRow) => oneRow.textHash);
		strangerVectorStore.readVectors({ textHashList, embeddingModelVersion }, (readError, cachedVectorByTextHash) => {
			if (readError) {
				done(`the rosetta store would not read: ${readError}`);
				return;
			}
			const newTextRowList = distinctTextRowList.filter((oneRow) => !cachedVectorByTextHash[oneRow.textHash]);
			const estimatedTokens = newTextRowList.reduce((soFar, oneRow) => soFar + tokenEstimateOf(oneRow.textValue), 0);
			if (estimatedTokens > fuseValues.retrievalMaxTokensPerRequest) {
				done('', { refusal: refusalOf('retrievalTokensPerRequestExceeded', `this submission's new text comes to about ${estimatedTokens} tokens; one request may spend ${fuseValues.retrievalMaxTokensPerRequest}. Send it in smaller submissions.`, { estimatedTokens, maxTokens: fuseValues.retrievalMaxTokensPerRequest }) });
				return;
			}
			strangerVectorStore.tokensSpentToday((spentError, tokensSpentToday) => {
				if (spentError) {
					done(`the rosetta store would not read: ${spentError}`);
					return;
				}
				if (estimatedTokens > 0 && tokensSpentToday + estimatedTokens > fuseValues.retrievalDailyTokenCeiling) {
					done('', { refusal: refusalOf('retrievalCeilingReached', `today's ceiling of ${fuseValues.retrievalDailyTokenCeiling} retrieval tokens would be passed, so this retrieval cannot run. It resets at midnight UTC. Text already submitted costs nothing and still answers.`, { dailyTokenCeiling: fuseValues.retrievalDailyTokenCeiling }) });
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
				strangerVectorStore.addTokensToday(estimatedTokens, (chargeError) => {
					if (chargeError) {
						done(`the rosetta store would not take the day's count: ${chargeError}`);
						return;
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
							done('', { refusal: refusalOf('embeddingFailed', 'the embedding vendor did not answer, so no pool could be made; nothing else was attempted') });
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
	const poolsForFieldVectorList = ({ session, serviceFacts, graphFacts, fieldVectorList, targetList }, done) => {
		const retrievalDriver = driverFor({ serviceFacts, graphFacts });
		const poolByTargetName = targetList.reduce((soFar, { targetName }) => ({ ...soFar, [targetName]: {} }), {});
		const sliceSize = Math.max(1, Math.floor(fuseValues.textsPerGraphQuery / 2));
		eachInTurn(targetList, ({ targetName, target }, nextTarget) => {
			eachInTurn(sliceListOf(fieldVectorList, sliceSize), (fieldSlice, nextSlice) => retrievalDriver.poolsForFieldSlice({ session, fieldSlice, target }, (poolError, poolByFieldRefId) => {
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

	const answerOf = ({ submissionForm, parsed, hubRowList, poolByTargetName, fieldVectorList, facts }) => ({
		submissionFormat: submissionForm.formatName,
		fieldCount: parsed.fieldList.length,
		hubList: hubRowList.map((oneHub) => oneHub.hubName),
		nothingJudgedNote: facts.nothingJudgedNote,
		retrievalSetting: { hitsPerText: fuseValues.hitsPerText, minCosine: fuseValues.minScore, poolCap: fuseValues.poolCap, tier: TIER_OFFERED },
		fieldList: parsed.fieldList.map((oneField, fieldIndex) => {
			const { fieldRefId } = fieldVectorList[fieldIndex];
			return {
				name: oneField.name,
				...(oneField.path === undefined ? {} : { path: oneField.path }),
				...(oneField.type === undefined ? {} : { type: oneField.type }),
				...(oneField.definitionAbsent ? { definitionAbsent: true } : {}),
				...(oneField.valueTierNotOffered ? { valueTierNotOffered: true } : {}),
				byHub: hubRowList.reduce((soFar, { hubName }) => ({ ...soFar, [hubName]: poolByTargetName[hubName][fieldRefId] }), {}),
			};
		}),
		poolCountByHub: hubRowList.reduce((soFar, { hubName }) => {
			const poolList = Object.values(poolByTargetName[hubName]);
			const nonEmptyCount = poolList.filter((onePool) => onePool.poolSize > 0).length;
			return { ...soFar, [hubName]: { fieldsWithCandidates: nonEmptyCount, emptyPools: poolList.length - nonEmptyCount } };
		}, {}),
		costEstimateByHub: hubRowList.reduce((soFar, { hubName }) => {
			const fieldsWithCandidates = Object.values(poolByTargetName[hubName]).filter((onePool) => onePool.poolSize > 0).length;
			return { ...soFar, [hubName]: { fieldsWithCandidates, usdEstimate: Number((fieldsWithCandidates * fuseValues.judgeUsdPerFieldEstimate).toFixed(2)) } };
		}, {}),
		costEstimateNote: facts.costEstimateNote,
		unresolvedRefList: parsed.unresolvedRefList,
		unresolvedContextList: parsed.unresolvedContextList,
		notWalkedList: parsed.notWalkedList,
	});

	const finished = (done) => (doneError, doneResult) => {
		inFlightCount -= 1;
		done(doneError, doneResult);
	};

	// THE ONE DOOR-INDEPENDENT RUN. Every cap here holds on MCP, which has no per-address limiter.
	const runRetrieval = ({ session, serviceFacts, input, namedSubjectList, answerNoteValues }, callback) => {
		if (inFlightCount >= fuseValues.retrievalInFlightMax) {
			callback('', { answer: refusalOf('busy', `${inFlightCount} retrievals are running, the most this instance runs at once; retry in ${BUSY_RETRY_SECONDS} seconds`), retryAfterSeconds: BUSY_RETRY_SECONDS });
			return;
		}
		inFlightCount += 1;
		const done = finished(callback);
		const taskList = new taskListPlus();
		const stopWith = (args, next, refusal) => next(SKIP_REST_OF_PIPE, { ...args, refusal });

		taskList.push((args, next) => {
			const formList = submissionFormOf(input);
			if (formList.length !== 1) {
				stopWith(args, next, refusalOf('noSubmission', `give exactly one of ${SUBMISSION_FORM_LIST.map((oneForm) => oneForm.inputName).join(', ')}; this request gives ${formList.length}`, { validValueList: SUBMISSION_FORM_LIST.map((oneForm) => oneForm.inputName) }));
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

		taskList.push((args, next) => withGraphFacts({ session, serviceFacts }, (factsError, graphFacts) => {
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
				stopWith(args, next, refusalOf('unknownHub', 'hubList must name at least one hub by name, or be left out for every hub', { validValueList: validHubNameList }));
				return;
			}
			const unknownHubList = (input.hubList || []).filter((hubName) => !validHubNameList.includes(hubName));
			if (unknownHubList.length > 0) {
				stopWith(args, next, refusalOf('unknownHub', `this graph has no hub ${unknownHubList.join(', ')}`, { validValueList: validHubNameList }));
				return;
			}
			const askedHubRowList = input.hubList ? hubRowList.filter((oneHub) => input.hubList.includes(oneHub.hubName)) : hubRowList;
			next('', { ...args, askedHubRowList });
		});

		taskList.push((args, next) => {
			const fieldTextRowList = args.parsed.fieldList.map((oneField, fieldIndex) => ({ fieldRefId: `field${fieldIndex}`, textRowList: fieldTextListOf(oneField) }));
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
			const targetList = args.askedHubRowList.map(({ hubName, sourceName }) => ({ targetName: hubName, target: { kind: 'hubCards', hubName, sourceName, tier: TIER_OFFERED } }));
			poolsForFieldVectorList({ session, serviceFacts, graphFacts: args.graphFacts, fieldVectorList: args.fieldVectorList, targetList }, (poolError, poolByTargetName) => next(poolError, { ...args, poolByTargetName }));
		});

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError && pipeError !== SKIP_REST_OF_PIPE) {
				done(pipeError);
				return;
			}
			if (args.refusal) {
				done('', { answer: args.refusal });
				return;
			}
			args.askedHubRowList.forEach(({ hubName }) => namedSubjectList.push({ subjectKind: 'hub', subjectText: hubName }));
			done('', { answer: answerOf({ submissionForm: args.submissionForm, parsed: args.parsed, hubRowList: args.askedHubRowList, poolByTargetName: args.poolByTargetName, fieldVectorList: args.fieldVectorList, facts: answerNoteValues }) });
		});
	};

	// the stage itself, for any caller: design 4.1's signature. target names a hub or a standard; a name the graph does not hold is refused with the valid list.
	const retrieveCandidates = ({ session, serviceFacts, queryTextList, target }, done) => {
		withGraphFacts({ session, serviceFacts }, (factsError, graphFacts) => {
			if (factsError) {
				done(factsError);
				return;
			}
			if (graphFacts.refusal) {
				done('', { refusal: graphFacts.refusal });
				return;
			}
			const targetRefusal = {
				hubCards: () => {
					if (target.tier !== TIER_OFFERED) {
						return refusalOf('tierNotOffered', `retrieval offers the ${TIER_OFFERED} tier; this asks for ${target.tier}`, { validValueList: [TIER_OFFERED] });
					}
					return graphFacts.hubRowList.some((oneHub) => oneHub.hubName === target.hubName) ? null : refusalOf('unknownHub', `this graph has no hub ${target.hubName}`, { validValueList: graphFacts.hubRowList.map((oneHub) => oneHub.hubName) });
				},
				standardElements: () => (serviceFacts.standardVersionByName[target.standardName] !== undefined ? null : refusalOf('unknownStandard', `this manifest has no standard ${target.standardName}`, { validValueList: Object.keys(serviceFacts.standardVersionByName).sort() })),
			}[target.kind]();
			if (targetRefusal) {
				done('', { refusal: targetRefusal });
				return;
			}
			const resolvedTarget = target.kind === 'hubCards' ? { ...target, sourceName: graphFacts.hubRowList.find((oneHub) => oneHub.hubName === target.hubName).sourceName } : target;
			const textRowList = fieldTextListOf({ name: queryTextList[0], definition: queryTextList[1] });
			vectorsForTextRowList({ distinctTextRowList: textRowList, embeddingModelVersion: graphFacts.embeddingModelVersion }, (vectorError, vectorRead) => {
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

	return { runRetrieval, retrieveCandidates, stats: () => ({ ...retrievalStats, inFlightCount }) };
};

module.exports = { createRosettaRetrieval, rosettaFuseValuesOf, SUBMISSION_FORM_LIST };
