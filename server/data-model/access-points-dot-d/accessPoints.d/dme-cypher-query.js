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
	const getSchemaDescription = require('../../../lib/schema-provider')({
		neo4jDb,
	});

	const mcpConfig = getConfig('mcp-server') || {};
	const maxResultRecords = parseInt(mcpConfig.maxResultRecords, 10) || 100;

	// ================================================================================
	// SERVER-SIDE LIMIT ENFORCEMENT
	//
	// Puts a real LIMIT into the cypher before it runs: appends one when the query
	// has none; clamps an oversized trailing numeric LIMIT to the cap. The
	// post-execution truncation in the query stage remains as the second layer for
	// shapes this cannot see (LIMIT inside UNION arms, LIMIT $param).

	const enforceLimit = (cypherText) => {
		const trimmed = cypherText.replace(/;\s*$/, '').trimEnd();

		const trailingNumericLimit = trimmed.match(/\bLIMIT\s+(\d+)\s*$/i);
		if (trailingNumericLimit) {
			if (parseInt(trailingNumericLimit[1], 10) > maxResultRecords) {
				return trimmed.replace(
					/\bLIMIT\s+\d+\s*$/i,
					`LIMIT ${maxResultRecords}`,
				);
			}
			return trimmed;
		}

		if (/\bLIMIT\s+\$[a-zA-Z0-9_]+\s*$/i.test(trimmed)) {
			return trimmed;
		}

		return `${trimmed}\nLIMIT ${maxResultRecords}`;
	};

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

				next('', { ...args, query: enforceLimit(query), queryParams: params || {} });
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
