#!/usr/bin/env node
'use strict';
// @concept: [[PipelinePattern]]
// @concept: [[DependencyInjection]]
// @concept: [[SqliteAbstraction]]
// @concept: [[Neo4jAbstraction]]

/**
 * DATA LAYER INITIALIZATION PIPELINE
 * 
 * This module orchestrates the data layer startup through a sequential pipeline:
 * 1. Database abstraction layer initialization (configurable: SQLite, etc.)
 * 2. Database instance creation and file system setup
 * 3. External sync data system initialization (configurable connectors)
 * 4. Data mapping layer loading (queries and transformations)
 * 5. Access points loading (dynamically loaded data access functions)
 * 
 * ARCHITECTURE DECISIONS:
 * - Configuration-driven database type selection for deployment flexibility
 * - Layered abstraction: generators → instances → access points → endpoints
 * - File system management with automatic directory creation
 * - Comprehensive logging for startup diagnostics and debugging
 * - Uses qtSelectProperties() for precise dependency injection between stages
 */

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, ''); //this just seems to come in handy a lot

const qt = require('qtools-functional-library'); //also exposes qtLog(); qt.help({printOutput:true, queryString:'.*', sendJson:false});

const os = require('os');
const path = require('path');
const fs = require('fs');

const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================
const moduleFunction =
	({ moduleName } = {}) =>
	({ unused }, callback) => {
		// ======================================================================================
		// CONFIGURATION AND UTILITIES SETUP
		// 
		// EXPLANATION: Loads data layer configuration and utilities. Configuration determines
		// which database type and sync system to use, allowing the same code to work with
		// different storage backends and external data sources.
		// 
		// TO ADD NEW DATABASE TYPES: Add implementation in ./lib/ and configure databaseTypeName
		// TO ADD NEW SYNC SYSTEMS: Add implementation in ./lib/ and configure syncDataSourceName

		const { xLog, getConfig, rawConfig, commandLineParameters } =
			process.global;
		const {
			databaseFileName,
			databaseContainerDirPath,
			databaseTypeName,
			syncDataSourceName,
		} = getConfig(moduleName); //moduleName is closure
		

		const { pwHash, hashPassword, verifyPassword, validatePasswordStrength } = require('./lib/password-hash')();
		

		// ======================================================================================
		// DATA LAYER INITIALIZATION PIPELINE
		// 
		// EXPLANATION: Sequential pipeline builds data layer from bottom up. Each stage
		// depends on previous stages' outputs. Accumulates logging information for
		// startup diagnostics and passes components up the chain.
		// 
		// TO ADD NEW PIPELINE STAGES: Add new taskList.push() items before access points loading
		// TO DEBUG PIPELINE: Add xLog.debug(args, { label: 'Stage Name' }) at start of stages

		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 1: ABSTRACTION LAYER GENERATORS
		// 
		// EXPLANATION: Loads generator modules for database, sync data, and mapping layers.
		// These are factories that create actual instances based on configuration.
		// Database type and sync system are configurable for deployment flexibility.
		// 
		// OUTPUTS: sqlDbGen, syncDataGen, dataMapping
		// TO ADD NEW DATABASE TYPES: Create ./lib/{type}-instance.js and configure databaseTypeName
		// TO ADD NEW SYNC SYSTEMS: Create ./lib/{type}-instance.js and configure syncDataSourceName

		taskList.push((args, next) => {
			const { previousValue } = args;
			

			let sqlDbGen = require(`./lib/${databaseTypeName}`)({ getConfig }); //not visible to the rest of the system, hence, ./lib
			let syncDataGen = require(`./lib/${syncDataSourceName}`)({ getConfig }); //not visible to the rest of the system, hence, ./lib
			let dataMapping = require(`./data-mapping`)({ pwHash, hashPassword, verifyPassword, validatePasswordStrength });
			

			next('', { ...args, sqlDbGen, dataMapping, syncDataGen });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: DATABASE INSTANCE CREATION
		// 
		// EXPLANATION: Creates actual database instance with file system setup. Ensures
		// database directory exists and initializes database connection. The database
		// abstraction layer handles table creation, queries, and data operations.
		// 
		// INPUTS: sqlDbGen, databaseFileName, dataModelLogInfoList
		// OUTPUTS: sqlDb, dataModelLogInfoList (updated)
		// FILE SYSTEM: Creates databaseContainerDirPath if it doesn't exist

		taskList.push((args, next) => {
			const { sqlDbGen, databaseFileName, dataModelLogInfoList } = args;

			const localCallback = (databaseFilePath) => (err, sqlDb) => {
				dataModelLogInfoList.push(`Database File Path: ${databaseFilePath}`);
				next('', { ...args, sqlDb, dataModelLogInfoList });
			};

			const dbFileName = databaseFileName;
			const databaseFilePath = path.join(databaseContainerDirPath, dbFileName);
			fs.mkdirSync(databaseContainerDirPath, { recursive: true });

			sqlDbGen.initDatabaseInstance(
				databaseFilePath,
				localCallback(databaseFilePath),
			);
		});
		

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 3: SYNC DATA SYSTEM INITIALIZATION
		// 
		// EXPLANATION: Initializes external data synchronization system. This provides
		// access to remote data sources, APIs, or other external systems. The sync
		// system is configurable and can be swapped out for different deployments.
		// 
		// INPUTS: syncDataGen, dataModelLogInfoList
		// OUTPUTS: hxAccess, dataModelLogInfoList (updated with hxcLogInfoList)
		// TO CONFIGURE: Set syncDataSourceName in configuration to choose sync system type

		taskList.push((args, next) => {
			const { dataModelLogInfoList, syncDataGen } = args;
			

			const localCallback = (err, { hxcLogInfoList, hxAccess }) => {
				dataModelLogInfoList.push(...hxcLogInfoList);
				next(err, { ...args, dataModelLogInfoList, hxAccess });
			};

			syncDataGen.hxInit({}, localCallback);
		});
		

		// --------------------------------------------------------------------------------
		// [EXTERNAL DATA ACCESS PATTERN - COMMENTED OUT]
		// 
		// EXPLANATION: This commented section demonstrates the standard pattern for
		// accessing external data sources (APIs, web services, etc.) through the sync
		// system. This pattern has been used across many projects to integrate with
		// non-database data sources.
		// 
		// TO USE: Uncomment and modify endpointName for your external data source
		// PATTERN: hxAccess.hxGet({ endpointName: 'YourEndpoint' }, callback)
		// EXAMPLES: APIs, web services, file systems, message queues, etc.

// 		taskList.push((args, next) => {
// 			const { dataModelLogInfoList, hxAccess } = args;
// 			

// 			const localCallback = (err, result) => {
// 				console.log(
// 					`\n=-=============   result  ========================= [data-model.js.]\\n`,
// 				);

// 				console.dir(
// 					{ ['result']: result.length },
// 					{ showHidden: false, depth: 4, colors: true },
// 				);

// 				console.log(
// 					`\n=-=============   result  ========================= [data-model.js.]\\n`,
// 				);

// 				next(err, { ...args, result });
// 			};

// 			hxAccess.hxGet({ endpointName: 'WorkOrders' }, localCallback);
// 		});
		

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 3.5: NEO4J INSTANCE CREATION
		//
		// EXPLANATION: Creates Neo4j database connection for the Data Model Explorer.
		// Config comes from dataModelExplorerSearch.ini via getConfig.
		// Produces neo4jDb accessor with runQuery(cypher, params, callback).

		taskList.push((args, next) => {
			const { dataModelLogInfoList } = args;

			const dmeCfg = getConfig('dataModelExplorerSearch');

			if (!dmeCfg || !dmeCfg.goldenContainerName) {
				xLog.status('neo4j-instance: no dataModelExplorerSearch goldenContainerName found, skipping');
				next('', { ...args, neo4jDb: null });
				return;
			}

			// Single source of truth: derive the golden connection from the container NAME.
			const { resolveContainerConnection } = require('./lib/user-graph/container-connection-resolver');
			const conn = resolveContainerConnection(dmeCfg.goldenContainerName);
			if (conn.error) {
				xLog.error(`neo4j-instance: cannot resolve DME connection from goldenContainerName '${dmeCfg.goldenContainerName}': ${conn.error}`);
				next('', { ...args, neo4jDb: null });
				return;
			}
			// The golden DME connection is the hardened READ seam: sessions open in
			// READ mode and auto-commit transactions carry a wall-clock timeout
			// (dataModelExplorerSearch queryTimeoutMs, default 30s). Writes to the
			// golden graph go through runTransaction, which this does not affect.
			const neo4jConfig = {
				neo4jBoltUri: conn.boltUri,
				neo4jUser: conn.user,
				neo4jPassword: conn.password,
				readOnly: true,
				queryTimeoutMs: parseInt(dmeCfg.queryTimeoutMs, 10) || 30000,
			};

			const neo4jGen = require('./lib/neo4j-instance/neo4j-instance')({ unused: true });

			const localCallback = (err, neo4jDb) => {
				if (err) {
					xLog.error(`neo4j-instance initialization failed: ${err}`);
					next('', { ...args, neo4jDb: null });
					return;
				}
				dataModelLogInfoList.push(`Neo4j connected: ${neo4jConfig.neo4jBoltUri}`);
				next('', { ...args, neo4jDb, dataModelLogInfoList });
			};

			neo4jGen.initDatabaseInstance(neo4jConfig, localCallback);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 3.7: SLACK INSTANCE CREATION (DME/Slack Q&A bridge)
		//
		// EXPLANATION: Initializes the Slack driver when the instance carries a
		// dmeSlack config section (merged from dmeSlack.ini via startApiServer.ini
		// [_mergeBefore] on instances that have one). Instances without the config
		// boot Slack-free: slackAccess arrives null and the endpoints answer 503.
		// Credential values live only inside the driver — never in logs.

		taskList.push((args, next) => {
			const { dataModelLogInfoList } = args;

			const slackCfg = getConfig('dmeSlack');

			if (!slackCfg || !slackCfg.signingSecret || !slackCfg.botToken) {
				xLog.status(
					'slack-instance: no dmeSlack config found — Slack surface disabled',
				);
				next('', { ...args, slackAccess: null });
				return;
			}

			const slackGen = require('./lib/slack-instance/slack-instance')({
				unused: true,
			});

			const localCallback = (err, slackAccess) => {
				if (err) {
					xLog.error(`slack-instance initialization failed: ${err}`);
					next('', { ...args, slackAccess: null });
					return;
				}
				dataModelLogInfoList.push('Slack driver initialized (dmeSlack)');
				next('', { ...args, slackAccess, dataModelLogInfoList });
			};

			slackGen.initSlackInstance(slackCfg, localCallback);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 4: ACCESS POINTS LOADING
		// 
		// EXPLANATION: Loads all access point modules from accessPoints.d/ directory.
		// Access points are data layer functions that encapsulate business logic and
		// provide a clean interface between endpoints and the database/sync systems.
		// Uses dynamic loading to automatically discover and register data access functions.
		// 
		// INPUTS: sqlDb, hxAccess, dataMapping
		// OUTPUTS: accessPointsDotD
		// TO ADD ACCESS POINTS: Create new .js files in ./access-points-dot-d/accessPoints.d/

		taskList.push((args, next) => {
			const localCallback = (err, accessPointsDotD) => {
				if (err) {
					next(err, args); //next('skipRestOfPipe', args);
					return;
				}

				next('', { ...args, accessPointsDotD });
			};

			require('./access-points-dot-d')(
				args.qtSelectProperties(['sqlDb', 'hxAccess', 'syncData', 'dataMapping', 'neo4jDb', 'slackAccess']),
				localCallback,
			);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE EXECUTION
		// 
		// EXPLANATION: Executes the entire data layer initialization pipeline. Returns
		// the initialized access points and logging information to the calling module.
		// This provides the foundation that all other system components build upon.
		// 
		// RETURNS: accessPointsDotD (data access functions), dataModelLogInfoList (startup logs)

		const initialData = {
			databaseFileName,
			databaseContainerDirPath,
			databaseTypeName,
			dataModelLogInfoList: [],
		};
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			const { endpointsDotD, accessPointsDotD, dataModelLogInfoList, sqlDb, dataMapping, slackAccess } = args;
			// Multi-tenant (07): start the orphan-session reaper daemon — periodically
			// reclaim abandoned per-user containers + clone dirs (lease expired) and clear
			// their leases; the durable stateScript is untouched. Non-fatal if unavailable.
			if (!err && sqlDb && dataMapping) {
				try {
					require('./lib/user-graph/reaper').startReaperDaemon({ sqlDb, dataMapping });
				} catch (e) {
					if (process.global.xLog) process.global.xLog.error(`[reaper] start failed: ${e.message}`);
				}
			}
			// dmeMcpOAuth Phase 1.3: ensure the OAuth/OIDC persistence schema exists
			// (new tables + the users security columns). Idempotent; non-fatal.
			if (!err && sqlDb) {
				try {
					require('../lib/oauth-schema-init')({ sqlDb })((e, res) => {
						const xLog = process.global.xLog;
						if (e) {
							xLog && xLog.error(`[oauth-schema-init] failed: ${e.toString()}`);
							return;
						}
						xLog && xLog.status(`[oauth-schema-init] ${(res.logInfoList || []).join('; ')}`);
					});
				} catch (e) {
					if (process.global.xLog) process.global.xLog.error(`[oauth-schema-init] start failed: ${e.message}`);
				}
			}
			// dmeMcpOAuth Phase 2: expose sqlDb so startApiServer can hand it to the
			// Authorization Server mount (oauth-server needs the DB for the adapter,
			// audit log, GC, and the findAccount-by-sub lookup).
			callback(err, { accessPointsDotD, dataModelLogInfoList, slackAccess, sqlDb });
		});
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
