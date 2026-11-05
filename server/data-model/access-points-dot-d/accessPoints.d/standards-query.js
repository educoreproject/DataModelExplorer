#!/usr/bin/env node
'use strict';
// @concept: [[AccessPointPattern]]
// @concept: [[DataModelExplorer]]

// standards-query — the one door-independent entry to the standards query service (DESIGN-standardsQueryService-110326 section 1.8). Input { operationName, input, principal };
// output { httpStatus, bodyText, cachePolicy, retryAfterSeconds }. Every refusal is an ANSWER with a status, never a pipe error. It dispatches by the registry in
// lib/standards-query/standardsQueryOperations.json; no operation has code here. The core is built once, here, at startup, and proves the URI promise at every graph connection.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const path = require('path');
const { openForgeAdapter } = require('../../../lib/edc-resolver/forgeAdapter');
const { createStandardsQueryCore } = require('../../../lib/standards-query/standardsQueryCore');
const { createUsageCounter } = require('../../../lib/standards-query/usageCounts');
const registry = require('../../../lib/standards-query/standardsQueryOperations.json');
const { createRosettaRetrieval, rosettaFuseValuesOf } = require('../../../lib/standards-query/rosetta/rosettaRetrieval');
const { createStrangerVectorStore } = require('../../../lib/standards-query/rosetta/strangerVectorStore');
const { runCypherQuery } = require('../../../../cli/lib.d/data-model-explorer/lib/runCypherQuery');
const { checkGraphEmbeddingContract } = require('../../../../cli/lib.d/data-model-explorer/lib/graphEmbeddingContract');
const neo4jDriver = require('neo4j-driver');

const DME_SEARCH_MODULE_PATH = path.join(__dirname, '..', '..', '..', '..', 'cli', 'lib.d', 'data-model-explorer', 'dataModelExplorerSearch');
const LIMIT_CONFIG_SECTION_NAME = 'standards-query-limits';
const EDC_CONFIG_SECTION_NAME = 'edc-resolver';
const MCP_CONFIG_SECTION_NAME = 'mcp-server';
const ROSETTA_CONFIG_SECTION_NAME = 'rosetta-fuse';
const USAGE_FLUSH_MILLISECONDS = 5000;
const SWEEP_MILLISECONDS = 86400000;

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig } = process.global;
	const { neo4jDb, sqlDb } = passThroughParameters;
	const dmeSearchModule = require(DME_SEARCH_MODULE_PATH);
	const nowDate = () => new Date();

	// a second store handle beside the resolver's: the adapter is the ONE place the forge is required, and it is a read-only open
	const forgeAdapter = openForgeAdapter({ configValues: getConfig(EDC_CONFIG_SECTION_NAME) });
	const limitConfigValues = getConfig(LIMIT_CONFIG_SECTION_NAME);
	const usageCounter = createUsageCounter({ sqlDb, xLog, flushMilliseconds: USAGE_FLUSH_MILLISECONDS, nowDate, uriRowCap: Number(limitConfigValues.usageUriRowCap), uriRetentionDays: Number(limitConfigValues.usageUriRetentionDays) });

	let standardsQueryCore = null;

	// Rosetta retrieval needs its fuse, its own store, an embedder and the forge's pure modules; any one absent refuses that one operation by name and every other operation runs as before
	const withRosettaRetrieval = ({ dmeModuleConfig }, done) => {
		const fuseRead = rosettaFuseValuesOf(getConfig(ROSETTA_CONFIG_SECTION_NAME) || {});
		if (fuseRead.refusalText || forgeAdapter.refusalText || !dmeModuleConfig || !dmeModuleConfig.embedder) {
			xLog.error(`${moduleName}: rosetta retrieval is off: ${fuseRead.refusalText || forgeAdapter.refusalText || 'this instance has no embedder'}`);
			done({ fuseValues: fuseRead.fuseValues });
			return;
		}
		const { fuseValues } = fuseRead;
		createStrangerVectorStore({ storeFilePath: fuseValues.rosettaStoreFilePath, maxRows: fuseValues.strangerVectorCacheMaxRows, retentionDays: fuseValues.strangerVectorRetentionDays, nowDate, xLog }, (storeError, strangerVectorStore) => {
			if (storeError) {
				xLog.error(`${moduleName}: rosetta retrieval is off: ${storeError}`);
				done({ fuseValues });
				return;
			}
			// a store nobody submits to still ages out: sweep at start and daily
			const sweepAndLog = () => strangerVectorStore.sweepNow((sweepError) => (sweepError ? xLog.error(`${moduleName}: the rosetta sweep failed: ${sweepError}`) : undefined));
			sweepAndLog();
			setInterval(sweepAndLog, SWEEP_MILLISECONDS).unref();
			done({
				fuseValues,
				rosettaRetrieval: createRosettaRetrieval({ fuseValues, strangerVectorStore, embedder: dmeModuleConfig.embedder, forgeRetrievalModules: forgeAdapter.retrievalModules, runCypher: runCypherQuery, checkGraphEmbeddingContract, neo4jIntegerOf: neo4jDriver.int, nowDate, xLog }),
			});
		});
	};

	dmeSearchModule.loadModuleConfig((configError, dmeModuleConfig) => {
		if (configError) {
			xLog.error(`${moduleName}: the DME config could not be read: ${configError}`);
		}
		withRosettaRetrieval({ dmeModuleConfig: configError ? undefined : dmeModuleConfig }, ({ fuseValues, rosettaRetrieval }) => {
			standardsQueryCore = createStandardsQueryCore({
				registry,
				limitConfigValues,
				doorLimitValues: {
					sessionCapPerSub: Number((getConfig(MCP_CONFIG_SECTION_NAME) || {}).sessionCapPerSub),
					sessionIdleTtlSeconds: Number((getConfig(MCP_CONFIG_SECTION_NAME) || {}).sessionIdleTtlSeconds),
					edcPublicPathPrefix: (getConfig(EDC_CONFIG_SECTION_NAME) || {}).publicPathPrefix,
					sizeRefusalContactAddress: (getConfig(EDC_CONFIG_SECTION_NAME) || {}).sizeRefusalContactAddress,
					rosettaFuseValues: fuseValues,
				},
				goldenHandle: neo4jDb,
				forgeAdapter,
				dmeSearchModule,
				dmeModuleConfig: configError ? undefined : dmeModuleConfig,
				usageCounter,
				xLog,
				nowDate,
				rosettaRetrieval,
			});
		});
	});

	const serviceFunction = ({ operationName, input, principal }, callback) => {
		if (!standardsQueryCore) {
			callback('', { httpStatus: 503, bodyText: JSON.stringify({ answer: { refusedByName: operationName, refusalName: 'serviceNotConfigured', reason: 'the standards query service is still starting' } }), cachePolicy: 'noStore', retryAfterSeconds: 2, isRefusal: true });
			return;
		}
		standardsQueryCore.runOperation({ operationName, input, principal }, callback);
	};

	// ================================================================================
	// ACCESS POINT REGISTRATION

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);
	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
