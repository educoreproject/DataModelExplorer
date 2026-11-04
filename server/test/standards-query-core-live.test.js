'use strict';
// standards-query-core-live.test.js — the core in process on the real golden and the real store, with no HTTP (standardsQueryService-110326). The session seam: a verb on the golden handle's
// READ session answers what the CLI's own path (search, its own driver) answers, and because both run in this one process they share one query embedding, which is the only way to compare
// a vector leg at all: Voyage does not return the same vector twice (measured: two CLI runs of one query differ in the third decimal of vectorScore).
//   Also: the passport and the URIs in the envelope; expectManifest; inputTooLong; the embedding ceiling; a write refused on the seam; G1.1 for the vector questions.
// Needs the local golden and the qbook config. Run: node server/test/standards-query-core-live.test.js [outFile]

const fs = require('fs');
const path = require('path');
const os = require('os');

const outFilePath = process.argv[2];
process.global = { xLog: { status() {}, error() {}, verbose() {}, result() {}, color: {} }, getConfig: () => ({}), rawConfig: {}, commandLineParameters: { switches: {}, values: {} } };

const configFileProcessor = require('qtools-config-file-processor');
const dmeSearchModule = require('../../cli/lib.d/data-model-explorer/dataModelExplorerSearch');
const { resolveContainerConnection } = require('../data-model/lib/user-graph/container-connection-resolver');
const neo4jInstanceFactory = require('../data-model/lib/neo4j-instance/neo4j-instance');
const { createGoldenGraphHandle, GOLDEN_RETRY_DELAY_MS_LIST } = require('../data-model/lib/neo4j-instance/golden-graph-handle');
const { openForgeAdapter } = require('../lib/edc-resolver/forgeAdapter');
const { createStandardsQueryCore } = require('../lib/standards-query/standardsQueryCore');
const { stripCoreAdditions } = require('../lib/standards-query/answerSteps');
const registry = require('../lib/standards-query/standardsQueryOperations.json');

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const configDirPath = path.join(__dirname, '..', '..', '..', 'configs', 'instanceSpecific', 'qbook');
const allConfig = configFileProcessor.getConfig('startApiServer.ini', configDirPath, { resolve: true });
const edcConfigValues = allConfig['edc-resolver'];
const LIMITS = { publicInstanceName: 'liveTest', usageUriRowCap: 1000, usageUriRetentionDays: 90, requestsPerMinute: 60, burstPerSecond: 20, inFlightMax: 20, maxQueryChars: 500, maxPatternChars: 200, dailyEmbeddingTokenCeiling: 2000000 };

const VECTOR_QUESTION_LIST = [
	{ operationName: 'search', input: { q: 'date of birth' }, cliVerb: 'search', params: { query: 'date of birth', searchMode: 'hybrid' } },
	{ operationName: 'search', input: { q: 'date of birth', mode: 'vector' }, cliVerb: 'search', params: { query: 'date of birth', searchMode: 'vector' } },
	{ operationName: 'search', input: { q: 'student birth date', standard: 'SIF260928' }, cliVerb: 'search', params: { query: 'student birth date', standard: 'SIF260928', searchMode: 'hybrid' } },
	{ operationName: 'search', input: { q: 'first name', standard: 'CEDS' }, cliVerb: 'search', params: { query: 'first name', standard: 'CEDS', searchMode: 'hybrid' } },
	{ operationName: 'search', input: { q: 'credential', standard: 'CTDL' }, cliVerb: 'search', params: { query: 'credential', standard: 'CTDL', searchMode: 'hybrid' } },
	{ operationName: 'search', input: { q: 'competency', standard: 'MedBiquitous' }, cliVerb: 'search', params: { query: 'competency', standard: 'MedBiquitous', searchMode: 'hybrid' } },
	{ operationName: 'neighbourhood', input: { q: 'student birth date', limit: '3' }, cliVerb: 'graphRetriever', params: { query: 'student birth date', limit: '3', searchMode: 'hybrid' } },
	{ operationName: 'neighbourhood', input: { q: 'language code', mode: 'vector', limit: '2' }, cliVerb: 'graphRetriever', params: { query: 'language code', limit: '2', searchMode: 'vector' } },
];

const neo4jGen = neo4jInstanceFactory({ unused: true });
const resolveConnectionFresh = (containerName, callback) => callback('', resolveContainerConnection(containerName));

dmeSearchModule.loadModuleConfig((configError, dmeModuleConfig) => {
	if (configError) { console.log(`  FAIL: config: ${configError}`); process.exit(1); }
	const goldenHandle = createGoldenGraphHandle({ goldenContainerName: dmeModuleConfig.goldenContainerName, queryTimeoutMs: 30000, retryDelayMsList: GOLDEN_RETRY_DELAY_MS_LIST, resolveConnectionFresh, neo4jGen });
	const forgeAdapter = openForgeAdapter({ configValues: edcConfigValues });
	ok('the forge adapter opens', !forgeAdapter.refusalText, forgeAdapter.refusalText);
	const makeCore = (limitValues) => createStandardsQueryCore({ registry, limitConfigValues: limitValues, doorLimitValues: { sessionCapPerSub: 10, sessionIdleTtlSeconds: 1800, edcPublicPathPrefix: '/edc/' }, goldenHandle, forgeAdapter, dmeSearchModule, dmeModuleConfig, usageCounter: { countAnswer() {}, readCounts: (done) => done('', [{ operationName: 'stubbedCounter' }]) }, xLog: process.global.xLog, nowDate: () => new Date() });
	const core = makeCore(LIMITS);
	const ceilingCore = makeCore({ ...LIMITS, dailyEmbeddingTokenCeiling: 1 });
	const ask = (whichCore, operationName, input, done) => whichCore.runOperation({ operationName, input, principal: { kind: 'anonymous' } }, (unusedError, answer) => done({ ...answer, body: JSON.parse(answer.bodyText) }));
	const rowFor = (operationName) => registry.operationList.find((row) => row.operationName === operationName);

	const steps = [];
	const results = [];
	steps.push((next) => {
		const waitForGate = () => (core.serviceState().isServing && ceilingCore.serviceState().isServing ? next() : setTimeout(waitForGate, 200));
		waitForGate();
	});
	VECTOR_QUESTION_LIST.forEach((question) => steps.push((next) => {
		dmeSearchModule.search(question.cliVerb, question.params, (cliError, cliAnswer) => {
			ask(core, question.operationName, question.input, ({ body }) => {
				const strippedText = JSON.stringify(stripCoreAdditions(body.answer, rowFor(question.operationName)));
				const cliText = JSON.stringify(cliAnswer);
				const isSame = strippedText === cliText;
				results.push({ question: question.input, operationName: question.operationName, isSame });
				ok(`vector question, same embedding: ${question.operationName} ${JSON.stringify(question.input)} equals the CLI path byte for byte`, isSame, `${strippedText.length} / ${cliText.length}`);
				next();
			});
		});
	}));
	steps.push((next) => ask(core, 'mappings', { element: 'lif:Person/MilitaryLearningExperience/inline/dischargeDate', rowDetail: 'full' }, ({ httpStatus, body }) => {
		ok('mappings: 200', httpStatus === 200);
		ok('answeredFrom names the graph, the manifest and the instance', /^GOLD_/.test(body.answeredFrom.graphName) && body.answeredFrom.manifestRefId.length === 64 && body.answeredFrom.instance === 'liveTest');
		ok('every row carries its card and its element by URI', body.answer.mappingRowList.every((oneRow) => oneRow.uri && oneRow.fromUri && oneRow.uriKind === 'edc' && oneRow.resolvesHere === true));
		next();
	}));
	// P2.1: the default form, and a uri handed back. The answer that holds a uri is the one that says what it may be asked with
	const LIF_DISCHARGE = 'lif:Person/MilitaryLearningExperience/inline/dischargeDate';
	steps.push((next) => ask(core, 'mappings', { element: LIF_DISCHARGE }, ({ httpStatus, body, bodyText }) => {
		ok('summary: mappings answers in summary form unless asked', httpStatus === 200 && body.answer.rowDetail === 'summary' && !body.answer.mappingRowList && body.answer.ownMappingRowList.length > 0);
		ok('summary: it says what it left out and how to ask', /rowDetail=full/.test(body.answer.leftOutOfSummary.howToAsk));
		ok('summary: the envelope is the same envelope', body.answeredFrom.operation === 'mappings' && typeof body.uriNote === 'string');
		const elementUri = body.answer.matchedElementList[0].uri;
		ask(core, 'mappings', { element: elementUri }, (handedBack) => {
			ok('uri input: an element uri handed back to mappings answers the same bytes as its stableId', handedBack.bodyText === bodyText, `${handedBack.httpStatus}`);
			ask(core, 'pair', { element: elementUri, standard: 'CTDLQData' }, (pairAnswer) => {
				ok('uri input: an element uri handed to pair answers', pairAnswer.httpStatus === 200 && pairAnswer.body.answer.pairStatus === 'notJudged', `${pairAnswer.httpStatus}`);
				next();
			});
		});
	}));
	steps.push((next) => ask(core, 'element', { stableId: 'https://w3id.org/CEDStandards/terms/P000033' }, ({ bodyText }) => {
		const spellingList = ['ceds:P000033', 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:P000033', 'edc:CEDS/14.0.0.0/ceds:P000033'];
		const answerList = [];
		spellingList.forEach((spelling) => ask(core, 'element', { stableId: spelling }, (oneAnswer) => {
			answerList.push(oneAnswer);
			if (answerList.length === spellingList.length) {
				ok('uri input: ceds:, the uri and the edc: form of a CEDS term each answer what its stableId answers', answerList.every((one) => one.bodyText === bodyText), answerList.map((one) => one.httpStatus).join(','));
				next();
			}
		}));
	}));
	steps.push((next) => ask(core, 'mappings', { element: 'https://w3id.org/EDUcore/LIF/9.9/lif:Person/MilitaryLearningExperience/inline/dischargeDate' }, ({ httpStatus, body }) => {
		ok('uri input: an element uri of a version this manifest does not hold is not answered from the one it does', httpStatus === 404 && body.answer.refusalName === 'nothingMatched', `${httpStatus}`);
		next();
	}));
	steps.push((next) => ask(core, 'mappings', { element: LIF_DISCHARGE, rowDetail: 'brief' }, ({ httpStatus, body }) => {
		ok('rowDetail: an unknown value is refused by name, not read as the default', httpStatus === 400 && body.answer.refusalName === 'invalidInput' && JSON.stringify(body.answer.validValueList) === '["summary","full"]', `${httpStatus}`);
		next();
	}));
	steps.push((next) => ask(core, 'graph', {}, (summaryAnswer) => ask(core, 'graph', { rowDetail: 'full' }, (fullAnswer) => ask(core, 'graph', {}, (summaryAgain) => {
		ok('graph: each form is kept apart: the summary, then the whole, then the summary again', summaryAnswer.body.answer.rowDetail === 'summary' && fullAnswer.body.answer.rowDetail === undefined && Array.isArray(fullAnswer.body.answer.blocks) && summaryAgain.bodyText === summaryAnswer.bodyText);
		next();
	}))));
	// G5: every worked example in about answers as its entry says. An admin's about holds usage too, so every row is run.
	steps.push((next) => core.runOperation({ operationName: 'about', input: {}, principal: { kind: 'siteUser', role: 'admin', userRefId: 'liveTest' } }, (unusedError, aboutAnswer) => {
		const aboutBody = JSON.parse(aboutAnswer.bodyText).answer;
		ok('about: an administrator is told usage, and it is not cached for anyone else', aboutBody.operationList.some((entry) => entry.operation === 'usage') && aboutAnswer.cachePolicy === 'noStore');
		const remainingEntryList = [...aboutBody.operationList];
		const runNextExample = () => {
			const oneEntry = remainingEntryList.shift();
			if (!oneEntry) {
				next();
				return;
			}
			const registryRow = registry.operationList.find((row) => row.routeName === oneEntry.operation);
			const exampleInput = Object.fromEntries(new URL(oneEntry.exampleUrl).searchParams.entries());
			core.runOperation({ operationName: registryRow.operationName, input: exampleInput, principal: { kind: 'siteUser', role: 'admin', userRefId: 'liveTest' } }, (exampleError, exampleAnswer) => {
				const exampleBody = JSON.parse(exampleAnswer.bodyText);
				const exampleObject = registryRow.bodyForm === 'envelope' ? exampleBody.answer : exampleBody;
				const absentFieldList = registryRow.aboutEntry.expectedAnswerFieldList.filter((fieldName) => exampleObject[fieldName] === undefined || (Array.isArray(exampleObject[fieldName]) && exampleObject[fieldName].length === 0));
				ok(`about: the worked example of ${oneEntry.operation} answers 200 with what its entry says`, exampleAnswer.httpStatus === 200 && absentFieldList.length === 0, `${exampleAnswer.httpStatus} ${absentFieldList.join(', ')}`);
				runNextExample();
			});
		};
		runNextExample();
	}));
	steps.push((next) => ask(core, 'element', { stableId: 'https://w3id.org/CEDStandards/terms/P000033', rowDetail: 'full' }, ({ body }) => {
		const cedsEntry = body.answer.entryList[0];
		ok('a CEDS element carries its edc URI, by the declared prefix, and resolves here', cedsEntry.uri === 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:P000033' && cedsEntry.uriKind === 'edc' && cedsEntry.resolvesHere === true, JSON.stringify([cedsEntry.uri, cedsEntry.uriKind, cedsEntry.uriAbsentReason]));
		next();
	}));
	steps.push((next) => ask(core, 'element', { stableId: 'http://www.w3.org/2002/07/owl#Class', rowDetail: 'full' }, ({ body }) => {
		const foreignEntry = body.answer.entryList[0];
		ok('a foreign-vocabulary row carries its own IRI, kind ownIri, resolvesHere false', foreignEntry.uri === foreignEntry.stableId && foreignEntry.uriKind === 'ownIri' && foreignEntry.resolvesHere === false, JSON.stringify([foreignEntry.uri, foreignEntry.uriKind, foreignEntry.uriAbsentReason]));
		next();
	}));
	steps.push((next) => {
		const answerList = [];
		['First Name', 'Last Name', 'Middle Name'].forEach((elementText) => ask(core, 'mappings', { element: elementText }, ({ httpStatus, body }) => {
			answerList.push({ httpStatus, refusalName: body.answer.refusalName });
			if (answerList.length < 3) return;
			ok('mappings: three name searches at once, the third refused 503 busy by name (the cap of 2 on scans)', answerList.filter((one) => one.httpStatus === 200).length === 2 && answerList.filter((one) => one.httpStatus === 503 && one.refusalName === 'busy').length === 1, JSON.stringify(answerList));
			next();
		}));
		setImmediate(() => ask(core, 'mappings', { element: 'lif:Person/MilitaryLearningExperience/inline/dischargeDate' }, ({ httpStatus }) => {
			ok('mappings: an exact element during those searches is answered: it never counts against the cap', httpStatus === 200, `${httpStatus}`);
		}));

	});
	steps.push((next) => {
		const answerList = [];
		['a/first/slashed/miss', 'a/second/slashed/miss', 'a/third/slashed/miss'].forEach((elementText) => ask(core, 'mappings', { element: elementText }, ({ httpStatus, body }) => {
			answerList.push({ httpStatus, refusalName: body.answer.refusalName });
			if (answerList.length < 3) return;
			ok('mappings: a slash that is no stableId scans, so it counts: of three at once, one is refused busy', answerList.filter((one) => one.refusalName === 'busy').length === 1 && answerList.filter((one) => one.refusalName === 'nothingMatched').length === 2, JSON.stringify(answerList));
			next();
		}));
	});
	steps.push((next) => ask(core, 'stats', { expectManifest: 'sha256:0000' }, ({ httpStatus, body }) => {
		ok('expectManifest differing: 409 manifestMismatch naming both', httpStatus === 409 && body.answer.refusalName === 'manifestMismatch' && body.answer.answeringManifestRefId.length === 64);
		next();
	}));
	steps.push((next) => ask(core, 'search', { q: 'x'.repeat(501) }, ({ httpStatus, body }) => {
		ok('a 501-character query: 413 inputTooLong naming the field', httpStatus === 413 && body.answer.refusalName === 'inputTooLong' && body.answer.fieldName === 'q');
		next();
	}));
	steps.push((next) => ask(core, 'search', { q: 'x', wrongName: 'y' }, ({ httpStatus, body }) => {
		ok('an input the operation does not take: 400 unknownInput', httpStatus === 400 && body.answer.refusalName === 'unknownInput');
		next();
	}));
	steps.push((next) => ask(core, 'neighbourhood', { q: 'x', limit: '26' }, ({ httpStatus, body }) => {
		ok('a limit over the maximum: 400 invalidLimit', httpStatus === 400 && body.answer.refusalName === 'invalidLimit');
		next();
	}));
	steps.push((next) => ask(ceilingCore, 'search', { q: 'date of birth' }, ({ httpStatus, body }) => {
		ok('ceiling 1: the vector leg refuses by name, 429 embeddingCeilingReached', httpStatus === 429 && body.answer.refusalName === 'embeddingCeilingReached');
		next();
	}));
	steps.push((next) => ask(ceilingCore, 'search', { q: 'date of birth', mode: 'keyword' }, ({ httpStatus }) => {
		ok('ceiling 1: mode=keyword keeps working', httpStatus === 200);
		next();
	}));
	steps.push((next) => goldenHandle.withReadSession((session, sessionDone) => session.run('CREATE (n:StandardsQuerySeamProbe) RETURN n', {}).then(() => sessionDone('wrote'), (writeError) => sessionDone('', writeError.message)), (seamError, refusalText) => {
		ok('the seam is READ: a write is refused by Neo4j itself', !seamError && /read|Writing in read access mode/i.test(refusalText), `${seamError} ${refusalText}`);
		next();
	}));

	// the gate at a RECONNECT: the same container name comes back holding a golden whose manifest the store does not publish, and then the right one again
	steps.push((next) => {
		const { PASSPORT_CYPHER } = require('../../cli/lib.d/data-model-explorer/lib/passportReader');
		const connectionListenerList = [];
		let isForeignGolden = false;
		let sessionCount = 0;
		const foreignManifestRefId = 'f'.repeat(64);
		const reconnectingHandle = {
			whenEveryConnected: (listener) => { connectionListenerList.push(listener); setImmediate(listener); },
			withReadSession: (consumer, callback) => { sessionCount += 1; goldenHandle.withReadSession((session, sessionDone) => consumer({
				run: (cypherText, cypherParameters, transactionConfig) => session.run(cypherText, cypherParameters, transactionConfig).then((queryResult) => {
					if (cypherText !== PASSPORT_CYPHER || !isForeignGolden) return queryResult;
					return { records: queryResult.records.map((oneRecord) => ({ get: (fieldName) => ({ ...oneRecord.get(fieldName), manifestRefId: foreignManifestRefId }) })) };
				}),
			}, sessionDone), callback); },
		};
		const reconnectCore = createStandardsQueryCore({ registry, limitConfigValues: LIMITS, doorLimitValues: { sessionCapPerSub: 10, sessionIdleTtlSeconds: 1800, edcPublicPathPrefix: '/edc/' }, goldenHandle: reconnectingHandle, forgeAdapter, dmeSearchModule, dmeModuleConfig, usageCounter: { countAnswer() {}, readCounts: (done) => done('', [{ operationName: 'stubbedCounter' }]) }, xLog: process.global.xLog, nowDate: () => new Date() });
		const waitForCacheProof = (done) => {
			const sessionCountBefore = sessionCount;
			let answeredCount = 0;
			const bodyTextList = [];
			for (let askIndex = 0; askIndex < 5; askIndex += 1) {
				reconnectCore.runOperation({ operationName: 'standards', input: {}, principal: { kind: 'anonymous' } }, (unusedError, answer) => {
					bodyTextList.push(answer.bodyText);
					answeredCount += 1;
					if (answeredCount < 5) return;
					ok('standards: five askers at once, one read of the graph, one answer', sessionCount === sessionCountBefore + 1 && new Set(bodyTextList).size === 1, `${sessionCount - sessionCountBefore} reads`);
					ask(reconnectCore, 'standards', {}, ({ httpStatus }) => {
						ok('standards: a later asker reads no graph at all', httpStatus === 200 && sessionCount === sessionCountBefore + 1, `${sessionCount - sessionCountBefore} reads`);
						ask(reconnectCore, 'standards', { expectManifest: 'other' }, ({ httpStatus: mismatchStatus }) => {
							ok('standards: expectManifest is still checked in front of the kept answer', mismatchStatus === 409);
							done();
						});
					});
				});
			}
		};
		const waitForState = (isWanted, done) => (isWanted(reconnectCore.serviceState()) ? done() : setTimeout(() => waitForState(isWanted, done), 100));
		waitForState((state) => state.isServing, () => {
			ok('reconnect: serving after the first connection', true);
			waitForCacheProof(() => {
			isForeignGolden = true;
			connectionListenerList.forEach((listener) => listener());
			waitForState((state) => !state.isServing && /is not published/.test(state.unavailableReason), () => ask(reconnectCore, 'stats', {}, ({ httpStatus, body }) => {
				ok('reconnect: a golden whose manifest the store lacks: every route 503 uriPromiseUnavailable, naming the manifest', httpStatus === 503 && body.answer.refusalName === 'uriPromiseUnavailable' && body.answer.reason.includes(foreignManifestRefId));
				isForeignGolden = false;
				connectionListenerList.forEach((listener) => listener());
				waitForState((state) => state.isServing, () => ask(reconnectCore, 'stats', {}, ({ httpStatus: laterStatus }) => {
					ok('reconnect: the right golden back: serving again, no restart', laterStatus === 200);
					const sessionCountAfterReconnect = sessionCount;
					ask(reconnectCore, 'standards', {}, ({ httpStatus: rereadStatus }) => {
						ok('standards: a reconnect drops the kept answer: read again once', rereadStatus === 200 && sessionCount === sessionCountAfterReconnect + 1);
						next();
					});
				}));
			}));
			});
		});
	});

	const runNext = (stepIndex) => {
		if (stepIndex >= steps.length) {
			if (outFilePath) fs.writeFileSync(outFilePath, JSON.stringify({ host: os.hostname(), vectorQuestionCount: results.length, identicalCount: results.filter((one) => one.isSame).length, results }, null, 1));
			console.log(`\nstandards-query-core-live: ${passedCount} passed, ${failedCount} failed`);
			goldenHandle.close();
			process.exit(failedCount === 0 ? 0 : 1);
		}
		steps[stepIndex](() => runNext(stepIndex + 1));
	};
	runNext(0);
});
