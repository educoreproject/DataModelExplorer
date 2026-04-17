#!/usr/bin/env node
'use strict';

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;

	const { neo4jDb } = passThroughParameters;

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (xQuery, callback) => {
		const taskList = new taskListPlus();

		// STAGE 1: VALIDATE NEO4J
		taskList.push((args, next) => {
			if (!neo4jDb) {
				next('Neo4j database is not available.', args);
				return;
			}
			next('', args);
		});

		// STAGE 2: VALIDATE QUERY PARAM
		taskList.push((args, next) => {
			const { xQuery } = args;
			const q = (xQuery.q || '').trim();

			if (!q) {
				next('Missing required parameter: q', args);
				return;
			}

			next('', { ...args, searchTerm: q });
		});

		// STAGE 3: SEARCH ACROSS CEDS AND SIF NODES
		taskList.push((args, next) => {
			const { searchTerm } = args;

			const cypher = `
				MATCH (n)
				WHERE (n:CedsClass OR n:CedsProperty OR n:SifObject OR n:SifXmlElement)
				  AND (
				    toLower(n.label) CONTAINS toLower($searchTerm)
				    OR toLower(n.description) CONTAINS toLower($searchTerm)
				    OR toLower(n.cedsId) CONTAINS toLower($searchTerm)
				    OR toLower(n.xpath) CONTAINS toLower($searchTerm)
				  )
				RETURN
				  COALESCE(n.cedsId, n.xpath, n.label) AS id,
				  n.label AS label,
				  HEAD([l IN labels(n) WHERE l IN ['CedsClass','CedsProperty','SifObject','SifXmlElement']]) AS nodeType,
				  CASE
				    WHEN n:CedsClass OR n:CedsProperty THEN 'ceds'
				    WHEN n:SifObject OR n:SifXmlElement THEN 'sif'
				    ELSE 'unknown'
				  END AS standard,
				  n.description AS description,
				  COALESCE(n.cedsId, n.xpath, n.label) AS path,
				  EXISTS { (n)--() } AS hasChildren
				ORDER BY
				  CASE WHEN toLower(n.label) STARTS WITH toLower($searchTerm) THEN 0 ELSE 1 END,
				  n.label
				LIMIT 100
			`;

			const localCallback = (err, records) => {
				if (err) {
					next(`Search query failed: ${err}`, args);
					return;
				}

				const result = (records || []).map((rec) => ({
					id: rec.id || '',
					label: rec.label || '',
					nodeType: rec.nodeType || '',
					standard: rec.standard || '',
					description: rec.description || '',
					path: rec.path || '',
					hasChildren: rec.hasChildren || false,
					childCount: 0,
				}));

				next('', { ...args, result });
			};

			neo4jDb.runQuery(cypher, { searchTerm }, localCallback);
		});

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
