#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[CypherQueryDispatch]]
// @concept: [[AccessPointPattern]]

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

	const { neo4jDb } = passThroughParameters;

	const validateReadOnly = require('../../../lib/cypher-validator');
	const getSchemaDescription = require('../../../lib/schema-provider');

	const mcpConfig = getConfig('mcp-server') || {};
	const maxResultRecords = parseInt(mcpConfig.maxResultRecords, 10) || 100;

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (queryData, callback) => {
		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 1: VALIDATE NEO4J AVAILABILITY

		taskList.push((args, next) => {
			if (!neo4jDb) {
				next('Neo4j database is not available. Check dataModelExplorerSearch configuration.', args);
				return;
			}
			next('', args);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: DISPATCH ON ACTION

		taskList.push((args, next) => {
			const { queryData } = args;
			const { action } = queryData;

			if (action === 'schema') {
				const schemaText = getSchemaDescription();
				next('skipRestOfPipe', { ...args, result: [{ schema: schemaText }] });
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
		// PIPELINE STAGE 3: EXECUTE CYPHER QUERY

		taskList.push((args, next) => {
			const { query, queryParams } = args;

			const localCallback = (err, records) => {
				if (err) {
					next(`Neo4j query failed: ${err}`, args);
					return;
				}

				let result = records;
				let truncated = false;

				if (records.length > maxResultRecords) {
					const totalAvailable = records.length;
					result = records.slice(0, maxResultRecords);
					result.push({
						_truncated: true,
						_totalAvailable: totalAvailable,
						_returnedCount: maxResultRecords,
					});
					truncated = true;
				}

				next('', { ...args, result });
			};

			neo4jDb.runQuery(query, queryParams, localCallback);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE EXECUTION

		const initialData = { queryData };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err && err !== 'skipRestOfPipe') {
				callback(err, []);
				return;
			}
			callback('', args.result || []);
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
