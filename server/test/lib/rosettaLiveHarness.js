'use strict';
// rosettaLiveHarness — what the live Rosetta and size gates share: the real golden, the real store and forge modules, a core built as the access point builds it, and an embedder that answers from the graph's own text nodes, so a gate is free, offline and deterministic. It is the embedder, and nothing else, that stands in; runs/P3/g31 measures the real one.
//   openHarness({ fuseOverrideValues, limitOverrideValues, judgePromptVariant? (the fake-vendor judge's variant; derivedJudgeSlot unless named), embedder?, storeFilePath?, runCypher?, vendorPostOnce?, judgeConfigValues?, waitMilliseconds?, judgedOffAllowed? (a judged step that will not assemble is off and logged, as the access point leaves it), quietRunner? (handed over only once the runner is idle after start-up) }, done(err | '', { core, rosettaRetrieval, rosettaJudged, runner, store, session, serviceFacts..., close }))
//     vendorPostOnce: a fake vendor at the forge client's own network seam, so the real client, judge and store all run and nothing reaches Anthropic. judgeConfigValues: the real config instead, for a gate that spends. Neither: no judge, as demo has today. ; answers 'noGraph' through done when no graph is reachable, for the caller to skip by name.

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
const { assembleRosettaJudged } = require('../../lib/standards-query/rosetta/assembleRosettaJudged');
const registry = require('../../lib/standards-query/standardsQueryOperations.json');

const CONFIG_DIR_PATH = path.join(__dirname, '..', '..', '..', '..', 'configs', 'instanceSpecific', 'qbook');
const DIRECT_BLOCK_CONFIG_VALUES = Object.freeze({ directBlockMaxBytes: 536870912, directBlockTimeoutMilliseconds: 600000, directBlockSqliteCommandPath: '/usr/bin/sqlite3', sizeRefusalContactAddress: 'contact@harness.example' }); // the configs tree this reads may predate them; none of these gates reads a block
const GATE_WAIT_MILLISECONDS = 200;
const GATE_WAIT_LIMIT = 300;
const LIVE_LIMIT_VALUES = Object.freeze({ publicInstanceName: 'liveTest', usageUriRowCap: 1000, usageUriRetentionDays: 90, requestsPerMinute: 60, burstPerSecond: 20, inFlightMax: 20, maxQueryChars: 500, maxPatternChars: 200, dailyEmbeddingTokenCeiling: 2000000 });
const IDLE_POLL_MILLISECONDS = 20;
const LIVE_FUSE_VALUES = Object.freeze({ retrievalMaxTokensPerRequest: 120000, retrievalDailyTokenCeiling: 2000000, retrievalInFlightMax: 1, judgedDailyTokenCeiling: 2000000, maxUnresolvedListLength: 50, maxFieldListLength: 200, maxFieldNameChars: 200, maxFieldDefinitionChars: 2000, maxFieldPathChars: 500, maxDocumentDepth: 32, maxRefExpansions: 1000, hitsPerText: 40, minScore: 0.3, poolCap: 40, indexWindowPerText: 5000, textsPerGraphQuery: 40, judgeUsdPerFieldEstimate: 0.07, strangerVectorCacheMaxRows: 200000, strangerVectorRetentionDays: 30, judgedMaxFieldListLength: 50, maxRunningJobs: 1, maxQueuedJobs: 5, perPrincipalJobsOpen: 1, perJobCeilingUsd: 8, perPrincipalDailyUsd: 10, dailyJudgeCeilingUsd: 25, jobRetentionDays: 30, jobRunnerPollSeconds: 3600, judgeRetryWaitSecondsList: '1,1', judgedPoolCap: 20, hubTargetKind: 'hubHybrid', meaningScoringName: 'sum', hybridMeaningCount: 10, anonymousMaxFieldListLength: 25, anonymousJobsPerVisitorWindow: 3, anonymousVisitorWindowMinutes: 60, anonymousMaxRunningJobs: 2, anonymousMaxQueuedJobs: 5, anonymousDailyCeilingUsd: 10, judgeWorstCaseOverheadTokens: 1000, anonymousJobRetentionDays: 7, promptPageSize: 10, jobServiceMaxInFlight: 10, jobServiceBusyRetrySeconds: 2, anonymousJobsOpenPerVisitor: 2, anonymousPerVisitorDailyUsd: 4, anonymousJobServiceMaxInFlight: 6 });
const FAKE_PRICING_INI_TEXT = '[spendPrice_anthropicOpus5]\nprovider=anthropic\nmodel=claude-opus-5\ninputUsdPerMillionTokens=5\noutputUsdPerMillionTokens=25\npriceSource=gate fixture, the rate in spendPricing.ini\npriceAsOf=2026-11-05\n[spendPrice_voyage4Large]\nprovider=voyage\nmodel=voyage-4-large\ninputUsdPerMillionTokens=0.12\noutputUsdPerMillionTokens=0\npriceSource=gate fixture\npriceAsOf=2026-11-05\n';
const FAKE_VENDOR_INI_TEXT = '[anthropicAi]\napiKey=gateFixtureNotACredential\nmodel=claude-opus-5\nmaxTokens=2500\n';

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
	return configFileProcessor.getConfig('startApiServer.ini', CONFIG_DIR_PATH, { resolve: true });
};

const openHarness = ({ fuseOverrideValues = {}, limitOverrideValues = {}, doorOverrideValues = {}, embedder, storeFilePath, runCypher = runCypherQuery, vendorPostOnce, judgeConfigValues, judgePromptVariant = 'derivedJudgeSlot', waitMilliseconds, wrapJudgeModules, nowDate: suppliedNowDate, judgedOffAllowed, quietRunner } = {}, done) => {
	// ⟪rosettaMeanings⟫ EDUCORE_FORGE_CODE_PATH points the forge adapter at a forge worktree (a variant the shared checkout does not carry yet); unset, the config's checkout
	const edcConfigValues = { ...DIRECT_BLOCK_CONFIG_VALUES, ...qbookConfigOf()['edc-resolver'], ...(process.env.EDUCORE_FORGE_CODE_PATH ? { educoreForgeCodePath: process.env.EDUCORE_FORGE_CODE_PATH } : {}) };
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
		if (wrapJudgeModules) { // a gate can watch what the judge's modules make
			const realLoad = forgeAdapter.loadJudgeModules;
			forgeAdapter.loadJudgeModules = () => wrapJudgeModules(realLoad());
		}
		const fuseRead = rosettaFuseValuesOf({ ...LIVE_FUSE_VALUES, rosettaStoreFilePath, ...fuseOverrideValues });
		if (fuseRead.refusalText) {
			done(fuseRead.refusalText);
			return;
		}
		const embedCallLog = [];
		const nowDate = suppliedNowDate || (() => new Date());
		const logLineList = [];
		const xLog = { status: (statusText) => logLineList.push(String(statusText)), error: (errorText) => errorLineList.push(String(errorText)), verbose() {} };
		const errorLineList = [];
		createStrangerVectorStore({ storeFilePath: rosettaStoreFilePath, maxRows: fuseRead.fuseValues.strangerVectorCacheMaxRows, retentionDays: fuseRead.fuseValues.strangerVectorRetentionDays, nowDate, xLog }, (storeError, strangerVectorStore) => {
			if (storeError) {
				done(storeError);
				return;
			}
			const usedEmbedder = embedder || graphTextEmbedderFor({ goldenHandle, callLog: embedCallLog });
			const rosettaRetrieval = createRosettaRetrieval({ fuseValues: fuseRead.fuseValues, strangerVectorStore, embedder: usedEmbedder, forgeRetrievalModules: forgeAdapter.retrievalModules, runCypher, checkGraphEmbeddingContract, neo4jIntegerOf: neo4jDriver.int, nowDate, xLog });
			const usageCountList = [];
			if (vendorPostOnce) {
				fs.writeFileSync(path.join(scratchDirPath, 'fakeAnthropic.ini'), FAKE_VENDOR_INI_TEXT);
				fs.writeFileSync(path.join(scratchDirPath, 'fakePricing.ini'), FAKE_PRICING_INI_TEXT);
			}
			const usedJudgeConfigValues = judgeConfigValues || (vendorPostOnce ? { judgeProviderName: 'anthropic', judgeWireModel: 'claude-opus-5', judgeOutputTokenBudget: '2500', judgePromptVariant, anthropicConfigFilePath: path.join(scratchDirPath, 'fakeAnthropic.ini'), spendPricingFilePath: path.join(scratchDirPath, 'fakePricing.ini'), spendLedgerFilePath: path.join(scratchDirPath, 'ledger', 'rosettaSpendLedgerLifetime.jsonl') } : {});
			// ⟪rosettaMeanings review S2⟫ the visitor HMAC's secret, a fresh one per harness in its scratch directory (a gate can name another file in fuseOverrideValues)
			fs.writeFileSync(path.join(scratchDirPath, 'visitorSecret.txt'), require('crypto').randomBytes(32).toString('hex'), { mode: 0o600 });
			assembleRosettaJudged({ fuseConfigValues: { ...LIVE_FUSE_VALUES, anonymousVisitorSecretFilePath: path.join(scratchDirPath, 'visitorSecret.txt'), ...fuseOverrideValues }, judgeConfigValues: usedJudgeConfigValues, fuseValues: fuseRead.fuseValues, strangerVectorStore, rosettaRetrieval, forgeAdapter, goldenHandle, runCypher, nowDate, xLog, componentOverrides: vendorPostOnce ? { postOnce: vendorPostOnce } : undefined, ...(waitMilliseconds ? { waitMilliseconds } : {}) }, (assembleError, assembledJudged) => {
			if (assembleError && !judgedOffAllowed) {
				done(assembleError);
				return;
			}
			if (assembleError) {
				xLog.error(`rosettaLiveHarness: the rosetta judged step is off: ${assembleError}`);
			}
			const rosettaJudged = assembleError ? { startRunner: (unusedRunnerOptions, startedDone) => (startedDone ? startedDone('', null) : null) } : assembledJudged;
			const core = createStandardsQueryCore({
				registry,
				limitConfigValues: { ...LIVE_LIMIT_VALUES, ...limitOverrideValues },
				doorLimitValues: { sessionCapPerSub: 10, sessionIdleTtlSeconds: 1800, edcPublicPathPrefix: '/edc/', rosettaFuseValues: fuseRead.fuseValues, rosettaJudgedValues: rosettaJudged.judgedValues || {}, sizeRefusalContactAddress: edcConfigValues.sizeRefusalContactAddress, ...doorOverrideValues },
				goldenHandle,
				forgeAdapter,
				dmeSearchModule,
				dmeModuleConfig,
				usageCounter: { countAnswer: (oneCount) => usageCountList.push(oneCount), readCounts: (callback) => callback('', []) },
				xLog,
				nowDate,
				rosettaRetrieval,
				rosettaJobService: rosettaJudged.rosettaJobService,
			});
			let waitCount = 0;
			const waitForGate = () => {
				if (core.serviceState().isServing) {
					// a gate can stand in for the graph's facts, to change the manifest or lose the graph under a running job
					const factsHolder = { getServiceFacts: core.serviceFactsForGate };
					// quietRunner: handed over only once the runner's start-up reconcile has run AND its first tick has read the empty queue, for a gate that seeds open jobs and must not race that read (finding10 flaked 1 run in 3; handing over at start-up alone made it fail every time). Not the default: a gate that reopens a store with a job in it must be handed over while that job runs.
					const whenIdle = (runner, idleDone) => (!runner || runner.isIdle() ? idleDone() : setTimeout(() => whenIdle(runner, idleDone), IDLE_POLL_MILLISECONDS));
					const handOver = (startError, runner) => done(startError ? `the job runner would not start: ${startError}` : '', { setServiceFactsForRunner: (getServiceFacts) => { factsHolder.getServiceFacts = getServiceFacts; }, edcConfigValues, core, rosettaRetrieval, rosettaJudged, runner, forgeAdapter, scratchDirPath, logLineList, strangerVectorStore, goldenHandle, embedCallLog, usageCountList, errorLineList, rosettaStoreFilePath, usedEmbedder, dmeModuleConfig, close: (closed) => strangerVectorStore.close(() => { fs.rmSync(scratchDirPath, { recursive: true, force: true }); closed(); }) });
					if (quietRunner) {
						rosettaJudged.startRunner({ getServiceFacts: () => factsHolder.getServiceFacts(), runOperation: core.runOperation }, (startError, runner) => whenIdle(runner, () => handOver(startError, runner)));
						return;
					}
					handOver('', rosettaJudged.startRunner({ getServiceFacts: () => factsHolder.getServiceFacts(), runOperation: core.runOperation }));
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
