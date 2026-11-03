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
const LIMITS = { publicInstanceName: 'liveTest', requestsPerMinute: 60, burstPerSecond: 20, inFlightMax: 20, maxQueryChars: 500, maxPatternChars: 200, dailyEmbeddingTokenCeiling: 2000000 };

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
	const makeCore = (limitValues) => createStandardsQueryCore({ registry, limitConfigValues: limitValues, goldenHandle, forgeAdapter, dmeSearchModule, dmeModuleConfig, usageCounter: { countAnswer() {}, readCounts: (done) => done('', []) }, xLog: process.global.xLog, nowDate: () => new Date() });
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
	steps.push((next) => ask(core, 'mappings', { element: 'lif:Person/MilitaryLearningExperience/inline/dischargeDate' }, ({ httpStatus, body }) => {
		ok('mappings: 200', httpStatus === 200);
		ok('answeredFrom names the graph, the manifest and the instance', /^GOLD_/.test(body.answeredFrom.graphName) && body.answeredFrom.manifestRefId.length === 64 && body.answeredFrom.instance === 'liveTest');
		ok('every row carries its card and its element by URI', body.answer.mappingRowList.every((oneRow) => oneRow.uri && oneRow.fromUri && oneRow.uriKind === 'edc' && oneRow.resolvesHere === true));
		next();
	}));
	steps.push((next) => ask(core, 'element', { name: 'Birthdate', standard: 'CEDS' }, ({ body }) => {
		const ownEntry = body.answer.entryList.find((oneEntry) => oneEntry.uriKind === 'ownIri');
		ok('a CEDS element carries its own IRI, kind ownIri, resolvesHere false', ownEntry && ownEntry.uri === ownEntry.stableId && ownEntry.resolvesHere === false, JSON.stringify(body.answer.entryList.map((oneEntry) => [oneEntry.uriKind, oneEntry.uriAbsentReason])));
		next();
	}));
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
		const reconnectCore = createStandardsQueryCore({ registry, limitConfigValues: LIMITS, goldenHandle: reconnectingHandle, forgeAdapter, dmeSearchModule, dmeModuleConfig, usageCounter: { countAnswer() {}, readCounts: (done) => done('', []) }, xLog: process.global.xLog, nowDate: () => new Date() });
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
