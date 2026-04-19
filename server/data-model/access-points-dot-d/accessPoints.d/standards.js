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
	const mapper = dataMapping['standards'];

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
				next('standards mapper not loaded.', args);
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
		// PIPELINE STAGE 4: GRAPH STATS (list responses only)
		//
		// Fetch per-source label counts plus MAPS_TO counts to CEDS; mapper shapes them
		// into the heterogeneous graphStats object per standard and merges into the list.
		// Detail responses skip this — they already carry useCases, and a single-standard
		// detail fetch doesn't justify two whole-graph aggregation queries.

		taskList.push((args, next) => {
			const { transformType, result } = args;
			if (transformType === 'detail') {
				next('', args);
				return;
			}

			const labelsSpec = mapper.getCypher('graphStatsLabelsBySource');
			neo4jDb.runQuery(labelsSpec.cypher, labelsSpec.params, (labelsErr, labelsRecords) => {
				if (labelsErr) {
					xLog.error(`standards: graphStatsLabelsBySource failed: ${labelsErr}`);
					next('', args);
					return;
				}

				const mapsToSpec = mapper.getCypher('mapsToCountsBySource');
				neo4jDb.runQuery(mapsToSpec.cypher, mapsToSpec.params, (mapsToErr, mapsToRecords) => {
					if (mapsToErr) {
						xLog.error(`standards: mapsToCountsBySource failed: ${mapsToErr}`);
						next('', args);
						return;
					}

					const graphStatsBySource = mapper.shapeGraphStats(labelsRecords, mapsToRecords);
					const enriched = mapper.mergeGraphStats(result, graphStatsBySource);
					next('', { ...args, result: enriched });
				});
			});
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
