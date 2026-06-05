#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[AccessPointPattern]]
// @concept: [[UserGraphSeam]]

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	// ================================================================================
	// INITIALIZATION AND DEPENDENCY INJECTION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;

	const { sqlDb, dataMapping } = passThroughParameters;

	const validateReadOnly = require('../../../lib/cypher-validator');
	const neo4jInstanceGen = require('../../lib/neo4j-instance/neo4j-instance')({
		unused: true,
	});
	const { readVersionRow } = require('../../lib/user-graph/user-graph');

	const mcpConfig = getConfig('mcp-server') || {};
	const maxResultRecords = parseInt(mcpConfig.maxResultRecords, 10) || 100;

	// ================================================================================
	// SERVICE FUNCTION
	//
	// Phase 5: the per-query user leg connects to the version's ALREADY-LIVE isolated
	// clone — it does NOT provision. The clone is materialized once at OPEN
	// (dme-user-graph-open -> getUserGraph -> setLive); this path resolves the live
	// graphConnection from the version's SQL row (server-side, scoped to userRefId),
	// connects per-request, runs the read-only query, and closes. If the version has no
	// live container, it returns an explicit "not open" error rather than cloning. Phase
	// 6 relaxes the read-only guard so askMilo can write to the isolated clone.

	const serviceFunction = (queryData, callback) => {
		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// STAGE 1: RESOLVE THE LIVE CLONE CONNECTION FROM SQL (scoped to userRefId)

		taskList.push((args, next) => {
			const { userRefId, versionRefId } = args.queryData;

			if (!userRefId || !versionRefId) {
				next('dme-user-cypher-query: an open versionRefId is required', args);
				return;
			}

			readVersionRow({ sqlDb, dataMapping, userRefId, versionRefId }, (err, row) => {
				if (err) { next(err, args); return; }
				if (!row) { next('Version not found or not owned by this user', args); return; }
				if (!row.liveBoltUri) {
					next('Version is not open — open it before querying', args);
					return;
				}
				next('', { ...args, versionRow: row });
			});
		});

		// --------------------------------------------------------------------------------
		// STAGE 2: OPEN A PER-REQUEST CONNECTION TO THE LIVE CLONE

		taskList.push((args, next) => {
			const { versionRow } = args;

			neo4jInstanceGen.initDatabaseInstance(
				{
					neo4jBoltUri: versionRow.liveBoltUri,
					neo4jUser: 'neo4j',
					neo4jPassword: versionRow.liveBoltPassword,
				},
				(err, userGraphDb) => {
					if (err) {
						next(`user graph connection failed: ${err}`, args);
						return;
					}
					next('', { ...args, userGraphDb });
				},
			);
		});

		// --------------------------------------------------------------------------------
		// STAGE 3: DISPATCH ON ACTION (read-only enforced this phase)

		taskList.push((args, next) => {
			const { queryData, userGraphDb } = args;
			const { action } = queryData;

			if (action === 'schema') {
				const getSchemaDescription = require('../../../lib/schema-provider')({
					neo4jDb: userGraphDb,
				});
				getSchemaDescription((err, schemaText) => {
					if (err) { next(err, args); return; }
					next('skipRestOfPipe', { ...args, result: [{ schema: schemaText }] });
				});
				return;
			}

			if (action === 'query') {
				const { query, params } = queryData;
				if (!query || typeof query !== 'string') {
					next('Query string is required', args);
					return;
				}
				const validation = validateReadOnly(query);
				if (!validation.valid) {
					next(validation.reason, args);
					return;
				}
				next('', { ...args, query, queryParams: params || {} });
				return;
			}

			next(`Unknown action: ${action}. Use "schema" or "query".`, args);
		});

		// --------------------------------------------------------------------------------
		// STAGE 4: EXECUTE CYPHER QUERY ON THE LIVE CLONE

		taskList.push((args, next) => {
			const { query, queryParams, userGraphDb } = args;

			const localCallback = (err, records) => {
				if (err) { next(`Neo4j query failed: ${err}`, args); return; }

				let result = records;
				if (records.length > maxResultRecords) {
					const totalAvailable = records.length;
					result = records.slice(0, maxResultRecords);
					result.push({
						_truncated: true,
						_totalAvailable: totalAvailable,
						_returnedCount: maxResultRecords,
					});
				}
				next('', { ...args, result });
			};

			userGraphDb.runQuery(query, queryParams, localCallback);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE EXECUTION + CLEANUP (close the per-request connection only —
		// the clone PERSISTS for the session; teardown happens at close, not per query).

		const initialData = { queryData };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			const { userGraphDb, versionRow, queryData: qd } = args;

			if (userGraphDb && typeof userGraphDb.close === 'function') {
				userGraphDb.close();
			}

			if (err && err !== 'skipRestOfPipe') {
				callback(err);
				return;
			}

			const identityMarker = versionRow
				? {
						userRefId: qd.userRefId,
						username: qd.username || '',
						versionRefId: qd.versionRefId,
						versionName: versionRow.versionName || '',
				  }
				: null;

			callback('', {
				result: args.result || [],
				identityMarker,
				containerName: versionRow ? versionRow.liveContainerName || null : null,
			});
		});
	};

	// ================================================================================
	// ACCESS POINT REGISTRATION

	const addEndpoint = ({ name, serviceFunction, dotD }) => {
		dotD.logList.push(name);
		dotD.library.add(name, serviceFunction);
	};

	const name = moduleName;
	addEndpoint({ name, serviceFunction, dotD });

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
