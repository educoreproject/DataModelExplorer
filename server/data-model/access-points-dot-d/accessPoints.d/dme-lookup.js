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

	const { neo4jDb, dataMapping } = passThroughParameters;
	const mapper = dataMapping['dme-lookup'];

	// ================================================================================
	// QUERY DISPATCH MAP
	//
	// Maps (level, standard, nodeType) combinations to mapper query names
	// and result transformation functions.

	const queryDispatch = {
		'standards': { queryName: 'standards', transform: 'list' },
		'sif:topLevel': { queryName: 'sifTopLevel', transform: 'list' },
		'ceds:topLevel': { queryName: 'cedsTopLevel', transform: 'list' },
		'sif:children:SifObject': { queryName: 'sifObjectChildren', transform: 'list' },
		'sif:children:SifXmlElement': { queryName: 'sifElementChildren', transform: 'list' },
		'ceds:children:CedsClass': { queryName: 'cedsClassChildren', transform: 'list' },
		'ceds:children:CedsProperty': { queryName: 'cedsPropertyChildren', transform: 'list' },
		'sif:detail:SifXmlElement': { queryName: 'sifLeafDetail', transform: 'detail' },
		'sif:detail:SifXmlElement:nonLeaf': { queryName: 'sifNonLeafDetail', transform: 'detail' },
		'ceds:detail:CedsProperty': { queryName: 'cedsPropertyDetail', transform: 'detail' },
		'ceds:detail:CedsOptionValue': { queryName: 'cedsOptionValueDetail', transform: 'detail' },
		// Name-based lookups (used by AI search results where IDs are unreliable)
		'ceds:search:CedsProperty': { queryName: 'cedsPropertyByName', transform: 'detail' },
		'ceds:search:CedsClass': { queryName: 'cedsClassByName', transform: 'detail' },
		'sif:search:SifField': { queryName: 'sifFieldByName', transform: 'detail' },
		'sif:search:SifObject': { queryName: 'sifFieldByName', transform: 'detail' },
	};

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (xQuery, callback) => {
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
		// PIPELINE STAGE 2: RESOLVE QUERY FROM DISPATCH MAP

		taskList.push((args, next) => {
			const { xQuery } = args;
			const { level, standard, nodeType, nodeId } = xQuery;

			let dispatchKey;

			if (level === 'standards') {
				dispatchKey = 'standards';
			} else if (level === 'topLevel') {
				dispatchKey = `${standard}:topLevel`;
			} else if (level === 'children') {
				dispatchKey = `${standard}:children:${nodeType}`;
			} else if (level === 'detail') {
				dispatchKey = `${standard}:detail:${nodeType}`;
			} else if (level === 'search') {
				dispatchKey = `${standard}:search:${nodeType}`;
			} else {
				next(`Unknown level: ${level}`, args);
				return;
			}

			const dispatch = queryDispatch[dispatchKey];

			if (!dispatch) {
				next(`No query dispatch for key: ${dispatchKey}`, args);
				return;
			}

			const querySpec = mapper.getCypher(dispatch.queryName, { nodeId });

			if (!querySpec) {
				next(`Mapper returned no query for: ${dispatch.queryName}`, args);
				return;
			}

			next('', { ...args, querySpec, dispatch });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 3: EXECUTE QUERY OR RETURN HARDCODED DATA

		taskList.push((args, next) => {
			const { querySpec, dispatch } = args;

			if (querySpec.hardcoded) {
				next('', { ...args, result: querySpec.hardcoded });
				return;
			}

			const localCallback = (err, records) => {
				if (err) {
					next(`Neo4j query failed: ${err}`, args);
					return;
				}

				const result =
					dispatch.transform === 'detail'
						? mapper.mapDetail(records)
						: mapper.mapList(records);

				next('', { ...args, result });
			};

			neo4jDb.runQuery(querySpec.cypher, querySpec.params, localCallback);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 4: HANDLE SIF LEAF VS NON-LEAF DETAIL

		taskList.push((args, next) => {
			const { xQuery, result, dispatch } = args;

			if (
				xQuery.level === 'detail' &&
				xQuery.standard === 'sif' &&
				xQuery.nodeType === 'SifXmlElement' &&
				result.length === 0
			) {
				const fallbackSpec = mapper.getCypher('sifNonLeafDetail', { nodeId: xQuery.nodeId });

				const localCallback = (err, records) => {
					if (err) {
						next('', { ...args, result: [] });
						return;
					}
					const fallbackResult = mapper.mapDetail(records);
					next('', { ...args, result: fallbackResult });
				};

				neo4jDb.runQuery(fallbackSpec.cypher, fallbackSpec.params, localCallback);
				return;
			}

			next('', args);
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
