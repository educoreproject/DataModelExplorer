'use strict';
// rosettaLiveHarness — what the live Rosetta and size gates share: the real golden, the real store and forge modules, a core built as the access point builds it, and an embedder that answers from the graph's own text nodes, so a gate is free, offline and deterministic. It is the embedder, and nothing else, that stands in; runs/P3/g31 measures the real one.
//   openHarness({ fuseOverrideValues, limitOverrideValues, embedder?, storeFilePath?, runCypher? }, done(err | '', { core, rosettaRetrieval, store, session, serviceFacts..., close })) ; answers 'noGraph' through done when no graph is reachable, for the caller to skip by name.

const fs = require('fs');
const os = require('os');
const path = require('path');
const neo4jDriver = require('neo4j-driver');

process.global = process.global || { xLog: { status() {}, error() {}, verbose() {}, result() {}, color: {} }, getConfig: () => ({}), rawConfig: {}, commandLineParameters: { switches: {}, values: {} } };

const configFileProcessor = require('qtools-config-file-processor');
const dmeSearchModule = require('../../../cli/lib.d/data-model-explorer/dataModelExplorerSearch');
const { runCypherQuery } = require('../../../cli/lib.d/data-model-explorer/lib/runCypherQuery');
const { checkGraphEmbeddingContract } = require('../../../cli/lib.d/data-model-explorer/lib/graphEmbeddingContract');
const { resolveContainerConnection } = require('../../data-model/lib/user-graph/container-connection-resolver');
const neo4jInstanceFactory = require('../../data-model/lib/neo4j-instance/neo4j-instance');
const { createGoldenGraphHandle, GOLDEN_RETRY_DELAY_MS_LIST } = require('../../data-model/lib/neo4j-instance/golden-graph-handle');
const { openForgeAdapter } = require('../../lib/edc-resolver/forgeAdapter');
const { createStandardsQueryCore } = require('../../lib/standards-query/standardsQueryCore');
const { createRosettaRetrieval, rosettaFuseValuesOf } = require('../../lib/standards-query/rosetta/rosettaRetrieval');
const { createStrangerVectorStore } = require('../../lib/standards-query/rosetta/strangerVectorStore');
const registry = require('../../lib/standards-query/standardsQueryOperations.json');

const CONFIG_DIR_PATH = path.join(__dirname, '..', '..', '..', '..', 'configs', 'instanceSpecific', 'qbook');
const MAIN_TREE_CONFIG_DIR_PATH = path.join(__dirname, '..', '..', '..', '..', 'configsStandardsQueryP3', 'instanceSpecific', 'qbook');
const GATE_WAIT_MILLISECONDS = 200;
const GATE_WAIT_LIMIT = 300;
const LIVE_LIMIT_VALUES = Object.freeze({ publicInstanceName: 'liveTest', usageUriRowCap: 1000, usageUriRetentionDays: 90, requestsPerMinute: 60, burstPerSecond: 20, inFlightMax: 20, maxQueryChars: 500, maxPatternChars: 200, dailyEmbeddingTokenCeiling: 2000000 });
const LIVE_FUSE_VALUES = Object.freeze({ retrievalMaxTokensPerRequest: 120000, retrievalDailyTokenCeiling: 2000000, retrievalInFlightMax: 1, maxFieldListLength: 200, maxFieldNameChars: 200, maxFieldDefinitionChars: 2000, maxFieldPathChars: 500, maxDocumentDepth: 32, maxRefExpansions: 1000, hitsPerText: 40, minScore: 0.3, poolCap: 40, indexWindowPerText: 5000, textsPerGraphQuery: 40, judgeUsdPerFieldEstimate: 0.053, strangerVectorCacheMaxRows: 200000, strangerVectorRetentionDays: 30 });

// the texts of the graph's own nodes become their own stored vectors. A text the graph does not hold is a fault of the fixture, said by name.
const graphTextEmbedderFor = ({ goldenHandle, callLog }) => ({
	batchSize: 20,
	embed: (textList, done) => {
		callLog.push(textList.length);
		goldenHandle.withReadSession((session, sessionDone) => runCypherQuery(session, 'UNWIND $textList AS oneText MATCH (t:DmeEmbedText { text: oneText }) WITH oneText, head(collect(t.textEmbedding)) AS vector RETURN oneText, vector', { textList }, (queryError, queryResult) => {
			if (queryError) {
				sessionDone(queryError);
				return;
			}
			const vectorByText = new Map(queryResult.records.map((oneRecord) => [oneRecord.get('oneText'), oneRecord.get('vector')]));
			const absentList = textList.filter((oneText) => !vectorByText.has(oneText));
			sessionDone(absentList.length ? `the graph holds no text node for ${absentList.length} of these texts, eg ${JSON.stringify(absentList[0]).slice(0, 80)}` : '', textList.map((oneText) => vectorByText.get(oneText)));
		}), done);
	},
});

const qbookConfigOf = () => {
	const dirPath = fs.existsSync(path.join(MAIN_TREE_CONFIG_DIR_PATH, 'startApiServer.ini')) ? MAIN_TREE_CONFIG_DIR_PATH : CONFIG_DIR_PATH;
	return configFileProcessor.getConfig('startApiServer.ini', dirPath, { resolve: true });
};

const openHarness = ({ fuseOverrideValues = {}, limitOverrideValues = {}, embedder, storeFilePath, runCypher = runCypherQuery } = {}, done) => {
	const edcConfigValues = qbookConfigOf()['edc-resolver'];
	dmeSearchModule.loadModuleConfig((configError, dmeModuleConfig) => {
		if (configError) {
			done(`config: ${configError}`);
			return;
		}
		const connection = resolveContainerConnection(dmeModuleConfig.goldenContainerName);
		if (connection.error) {
			done('noGraph');
			return;
		}
		const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'rosettaHarness-'));
		const rosettaStoreFilePath = storeFilePath || path.join(scratchDirPath, 'rosettaJobs.sqlite');
		const goldenHandle = createGoldenGraphHandle({ goldenContainerName: dmeModuleConfig.goldenContainerName, queryTimeoutMs: 30000, retryDelayMsList: GOLDEN_RETRY_DELAY_MS_LIST, resolveConnectionFresh: (containerName, callback) => callback('', resolveContainerConnection(containerName)), neo4jGen: neo4jInstanceFactory({ unused: true }) });
		const forgeAdapter = openForgeAdapter({ configValues: edcConfigValues });
		if (forgeAdapter.refusalText) {
			done(`forge: ${forgeAdapter.refusalText}`);
			return;
		}
		const fuseRead = rosettaFuseValuesOf({ ...LIVE_FUSE_VALUES, rosettaStoreFilePath, ...fuseOverrideValues });
		if (fuseRead.refusalText) {
			done(fuseRead.refusalText);
			return;
		}
		const embedCallLog = [];
		const nowDate = () => new Date();
		const xLog = { status() {}, error: (errorText) => errorLineList.push(String(errorText)), verbose() {} };
		const errorLineList = [];
		createStrangerVectorStore({ storeFilePath: rosettaStoreFilePath, maxRows: fuseRead.fuseValues.strangerVectorCacheMaxRows, retentionDays: fuseRead.fuseValues.strangerVectorRetentionDays, nowDate, xLog }, (storeError, strangerVectorStore) => {
			if (storeError) {
				done(storeError);
				return;
			}
			const usedEmbedder = embedder || graphTextEmbedderFor({ goldenHandle, callLog: embedCallLog });
			const rosettaRetrieval = createRosettaRetrieval({ fuseValues: fuseRead.fuseValues, strangerVectorStore, embedder: usedEmbedder, forgeRetrievalModules: forgeAdapter.retrievalModules, runCypher, checkGraphEmbeddingContract, neo4jIntegerOf: neo4jDriver.int, nowDate, xLog });
			const usageCountList = [];
			const core = createStandardsQueryCore({
				registry,
				limitConfigValues: { ...LIVE_LIMIT_VALUES, ...limitOverrideValues },
				doorLimitValues: { sessionCapPerSub: 10, sessionIdleTtlSeconds: 1800, edcPublicPathPrefix: '/edc/', rosettaFuseValues: fuseRead.fuseValues },
				goldenHandle,
				forgeAdapter,
				dmeSearchModule,
				dmeModuleConfig,
				usageCounter: { countAnswer: (oneCount) => usageCountList.push(oneCount), readCounts: (callback) => callback('', []) },
				xLog,
				nowDate,
				rosettaRetrieval,
			});
			let waitCount = 0;
			const waitForGate = () => {
				if (core.serviceState().isServing) {
					done('', { core, rosettaRetrieval, strangerVectorStore, goldenHandle, embedCallLog, usageCountList, errorLineList, rosettaStoreFilePath, usedEmbedder, dmeModuleConfig, close: (closed) => strangerVectorStore.close(() => { fs.rmSync(scratchDirPath, { recursive: true, force: true }); closed(); }) });
					return;
				}
				waitCount += 1;
				if (waitCount > GATE_WAIT_LIMIT) {
					done('noGraph');
					return;
				}
				setTimeout(waitForGate, GATE_WAIT_MILLISECONDS);
			};
			waitForGate();
		});
	});
};

// the hold-out subjects: a fixed sample of a standard's EXACT or CLOSE mappings to a hub, by a seeded hash of each pair. Agreement with the published layer, never truth (design 4.10).
const SUBJECTS_CYPHER = `MATCH (element:ForgedNode { _source: $standardName })-[match]->(card:HubReference { hubName: $hubName })
WHERE type(match) IN ['EXACT_MATCH', 'CLOSE_MATCH'] AND card.referenceTier = 'property' AND element.name IS NOT NULL
RETURN element.stableId AS stableId, element.name AS name, element.description AS definition, card.stableId AS cardStableId, type(match) AS matchType ORDER BY stableId, cardStableId`;

const holdOutSubjectsOf = ({ goldenHandle, standardName, hubName, subjectCount, sampleSeed }, done) => {
	const crypto = require('crypto');
	goldenHandle.withReadSession((session, sessionDone) => runCypherQuery(session, SUBJECTS_CYPHER, { standardName, hubName }, (queryError, queryResult) => {
		if (queryError) {
			sessionDone(queryError);
			return;
		}
		const rowList = queryResult.records.map((oneRecord) => oneRecord.toObject());
		const seenStableIdSet = new Set();
		const cardListByStableId = rowList.reduce((soFar, oneRow) => ({ ...soFar, [oneRow.stableId]: [...(soFar[oneRow.stableId] || []), oneRow.cardStableId] }), {});
		const sampledList = rowList
			.map((oneRow) => ({ ...oneRow, sampleOrder: crypto.createHash('sha256').update(`${sampleSeed}|${oneRow.stableId}`).digest('hex') }))
			.sort((left, right) => (left.sampleOrder < right.sampleOrder ? -1 : 1))
			.filter((oneRow) => (seenStableIdSet.has(oneRow.stableId) ? false : seenStableIdSet.add(oneRow.stableId)))
			.slice(0, subjectCount)
			.map((oneRow) => ({ stableId: oneRow.stableId, name: oneRow.name, ...(oneRow.definition ? { definition: oneRow.definition } : {}), trueCardStableIdList: cardListByStableId[oneRow.stableId] }));
		sessionDone('', { subjectList: sampledList, publishedPairCount: rowList.length, publishedSubjectCount: Object.keys(cardListByStableId).length });
	}), done);
};

module.exports = { openHarness, holdOutSubjectsOf, LIVE_FUSE_VALUES };
