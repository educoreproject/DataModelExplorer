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
	const { getUserGraph, releaseUserGraph } = require('../../lib/user-graph/user-graph');

	const mcpConfig = getConfig('mcp-server') || {};
	const maxResultRecords = parseInt(mcpConfig.maxResultRecords, 10) || 100;

	// ================================================================================
	// SERVICE FUNCTION
	//
	// Phase 3: the user leg now runs THROUGH the seam (doc 03). It acquires a
	// UserGraphHandle via getUserGraph, opens a per-request connection from
	// handle.graphConnection (NOT the injected global neo4jDb — the seam's connection
	// is the load-bearing one), runs the read-only query there, then closes the
	// connection and releases the handle. At the stub, handle.graphConnection is the
	// standard DME connection, so results match Standard mode; Phase 5 swaps in a real
	// per-user isolated clone with zero change here. The handle's identityMarker is
	// returned alongside the result so the endpoint can surface it (no secret leaves).

	const serviceFunction = (queryData, callback) => {
		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// STAGE 1: ACQUIRE THE USER GRAPH VIA THE SEAM

		taskList.push((args, next) => {
			const { userRefId, versionRefId, username } = args.queryData;

			getUserGraph(
				{ userRefId, versionRefId, username, sqlDb, dataMapping },
				(err, handle) => {
					if (err) {
						next(`getUserGraph failed: ${err}`, args);
						return;
					}
					next('', { ...args, handle });
				},
			);
		});

		// --------------------------------------------------------------------------------
		// STAGE 2: OPEN A PER-REQUEST CONNECTION FROM handle.graphConnection

		taskList.push((args, next) => {
			const { graphConnection } = args.handle;

			const perRequestConfig = {
				neo4jBoltUri: graphConnection.boltUri,
				neo4jUser: graphConnection.user,
				neo4jPassword: graphConnection.password,
			};

			neo4jInstanceGen.initDatabaseInstance(
				perRequestConfig,
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
					if (err) {
						next(err, args);
						return;
					}
					next('skipRestOfPipe', {
						...args,
						result: [{ schema: schemaText }],
					});
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
		// STAGE 4: EXECUTE CYPHER QUERY ON THE USER GRAPH CONNECTION

		taskList.push((args, next) => {
			const { query, queryParams, userGraphDb } = args;

			const localCallback = (err, records) => {
				if (err) {
					next(`Neo4j query failed: ${err}`, args);
					return;
				}

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
		// PIPELINE EXECUTION + GUARANTEED CLEANUP (close connection, release handle)

		const initialData = { queryData };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			const { userGraphDb, handle } = args;

			// Always close the per-request connection and release the seam handle,
			// on success or error. At the stub releaseUserGraph just frees the lock.
			if (userGraphDb && typeof userGraphDb.close === 'function') {
				userGraphDb.close();
			}
			if (handle) {
				releaseUserGraph(handle, () => {});
			}

			if (err && err !== 'skipRestOfPipe') {
				callback(err);
				return;
			}

			callback('', {
				result: args.result || [],
				identityMarker: handle ? handle.identityMarker : null,
				containerName: handle ? handle.containerName : null,
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
