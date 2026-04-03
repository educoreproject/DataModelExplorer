#!/usr/bin/env node
'use strict';
// @concept: [[EdMatrixReport]]
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

	const { neo4jDb, dataMapping } = passThroughParameters;
	const mapper = dataMapping['edmatrix-report'];

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (xQuery, callback) => {
		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 1: VALIDATE AVAILABILITY

		taskList.push((args, next) => {
			if (!neo4jDb) {
				next('Graph database is not available. Check dataModelExplorerSearch configuration.', args);
				return;
			}
			if (!mapper) {
				next('EdMatrix report mapper not loaded.', args);
				return;
			}
			next('', args);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: RESOLVE QUERY FROM xQuery

		taskList.push((args, next) => {
			const { xQuery } = args;
			const { action, org, standardName, categoryName } = xQuery;

			let queryName;
			let queryParams = {};

			if (action === 'organizations') {
				queryName = 'allOrganizations';
			} else if (action === 'categories') {
				queryName = 'allCategories';
			} else if (action === 'detail' && standardName) {
				queryName = 'standardWithRelationships';
				queryParams = { standardName };
			} else if (action === 'byCategory' && categoryName) {
				queryName = 'standardsByCategory';
				queryParams = { categoryName };
			} else if (org) {
				queryName = 'standardsByOrg';
				queryParams = { orgName: org };
			} else {
				queryName = 'allStandards';
			}

			const querySpec = mapper.getCypher(queryName, queryParams);

			if (!querySpec) {
				next(`Mapper returned no query for: ${queryName}`, args);
				return;
			}

			const transformType = (action === 'detail') ? 'detail' : 'list';

			next('', { ...args, querySpec, transformType });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 3: EXECUTE QUERY

		taskList.push((args, next) => {
			const { querySpec, transformType } = args;

			const localCallback = (err, records) => {
				if (err) {
					next('Graph database query failed. The database may be temporarily unavailable.', args);
					return;
				}

				const result = transformType === 'detail'
					? mapper.mapDetail(records)
					: mapper.mapList(records);

				next('', { ...args, result });
			};

			neo4jDb.runQuery(querySpec.cypher, querySpec.params, localCallback);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE EXECUTION

		const initialData = { xQuery };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
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
