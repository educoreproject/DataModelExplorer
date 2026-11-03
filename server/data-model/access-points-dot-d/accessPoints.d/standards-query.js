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

const DME_SEARCH_MODULE_PATH = path.join(__dirname, '..', '..', '..', '..', 'cli', 'lib.d', 'data-model-explorer', 'dataModelExplorerSearch');
const LIMIT_CONFIG_SECTION_NAME = 'standards-query-limits';
const EDC_CONFIG_SECTION_NAME = 'edc-resolver';
const USAGE_FLUSH_MILLISECONDS = 5000;

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig } = process.global;
	const { neo4jDb, sqlDb } = passThroughParameters;
	const dmeSearchModule = require(DME_SEARCH_MODULE_PATH);
	const nowDate = () => new Date();

	// a second store handle beside the resolver's: the adapter is the ONE place the forge is required, and it is a read-only open
	const forgeAdapter = openForgeAdapter({ configValues: getConfig(EDC_CONFIG_SECTION_NAME) });
	const usageCounter = createUsageCounter({ sqlDb, xLog, flushMilliseconds: USAGE_FLUSH_MILLISECONDS, nowDate });

	let standardsQueryCore = null;
	dmeSearchModule.loadModuleConfig((configError, dmeModuleConfig) => {
		if (configError) {
			xLog.error(`${moduleName}: the DME config could not be read: ${configError}`);
		}
		standardsQueryCore = createStandardsQueryCore({
			registry,
			limitConfigValues: getConfig(LIMIT_CONFIG_SECTION_NAME),
			goldenHandle: neo4jDb,
			forgeAdapter,
			dmeSearchModule,
			dmeModuleConfig: configError ? undefined : dmeModuleConfig,
			usageCounter,
			xLog,
			nowDate,
		});
	});

	const serviceFunction = ({ operationName, input, principal }, callback) => standardsQueryCore.runOperation({ operationName, input, principal }, callback);

	// ================================================================================
	// ACCESS POINT REGISTRATION

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);
	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
