#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[Neo4jAbstraction]]
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
	const mapper = dataMapping['get-nodes'];

	// ================================================================================
	// NODE TYPE TO QUERY ROUTING
	//
	// Given a nodeType from the identify query, determines which children/detail
	// query to run. No dispatch map with magic strings -- just a simple lookup.

	const childrenQueryMap = {
		'CedsClass': 'cedsClassChildren',
		'CedsProperty': 'cedsPropertyChildren',
		'SifObject': 'sifObjectChildren',
		'SifXmlElement': 'sifElementChildren',
	};

	const detailQueryMap = {
		'CedsProperty': 'cedsPropertyDetail',
		'CedsOptionValue': 'cedsOptionValueDetail',
		'SifXmlElement': 'sifLeafDetail',
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
		// PIPELINE STAGE 2: ROUTE REQUEST
		//
		// Three paths:
		//   model=ceds  -> cedsTopLevel query
		//   model=sif   -> sifTopLevel query
		//   model=ai    -> askMilo subprocess (handled in stage 3)
		//   nodeId=X    -> identify node, then children or detail

		taskList.push((args, next) => {
			const { xQuery } = args;
			const { model, nodeId, query } = xQuery;

			if (model === 'ai') {
				next('', { ...args, routeAction: 'ai', aiQuery: query || '' });
				return;
			}

			if (model === 'ceds') {
				next('', { ...args, routeAction: 'topLevel', queryName: 'cedsTopLevel' });
				return;
			}

			if (model === 'sif') {
				next('', { ...args, routeAction: 'topLevel', queryName: 'sifTopLevel' });
				return;
			}

			if (nodeId) {
				next('', { ...args, routeAction: 'nodeId' });
				return;
			}

			next('Missing required parameter: model or nodeId', args);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 3: EXECUTE TOP-LEVEL QUERY (if applicable)

		taskList.push((args, next) => {
			const { routeAction, queryName } = args;

			if (routeAction !== 'topLevel') {
				next('', args);
				return;
			}

			const querySpec = mapper.getCypher(queryName);

			const localCallback = (err, records) => {
				if (err) {
					next(`Neo4j query failed: ${err}`, args);
					return;
				}
				next('', { ...args, result: mapper.mapList(records) });
			};

			neo4jDb.runQuery(querySpec.cypher, querySpec.params, localCallback);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 4: IDENTIFY NODE (if nodeId route)

		taskList.push((args, next) => {
			const { routeAction, xQuery } = args;

			if (routeAction !== 'nodeId') {
				next('', args);
				return;
			}

			const identifySpec = mapper.getCypher('nodeIdentify', { nodeId: xQuery.nodeId });

			const localCallback = (err, records) => {
				if (err) {
					next(`Node identification failed: ${err}`, args);
					return;
				}

				if (!records || records.length === 0) {
					next('', { ...args, result: [] });
					return;
				}

				const { nodeType, standard } = records[0];
				next('', { ...args, identifiedNodeType: nodeType, identifiedStandard: standard });
			};

			neo4jDb.runQuery(identifySpec.cypher, identifySpec.params, localCallback);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 5: FETCH CHILDREN FOR IDENTIFIED NODE

		taskList.push((args, next) => {
			const { routeAction, identifiedNodeType, xQuery, result } = args;

			if (routeAction !== 'nodeId' || result) {
				next('', args);
				return;
			}

			const childrenQueryName = childrenQueryMap[identifiedNodeType];

			if (childrenQueryName) {
				const querySpec = mapper.getCypher(childrenQueryName, { nodeId: xQuery.nodeId });

				const localCallback = (err, records) => {
					if (err) {
						next(`Children query failed: ${err}`, args);
						return;
					}

					const children = mapper.mapList(records);

					if (children.length > 0) {
						next('', { ...args, result: children });
						return;
					}

					// No children found -- fall through to detail
					next('', { ...args, noChildren: true });
				};

				neo4jDb.runQuery(querySpec.cypher, querySpec.params, localCallback);
				return;
			}

			// No children query for this type -- go to detail
			next('', { ...args, noChildren: true });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 6: FETCH DETAIL FOR IDENTIFIED NODE (if no children)

		taskList.push((args, next) => {
			const { routeAction, identifiedNodeType, xQuery, result, noChildren } = args;

			if (routeAction !== 'nodeId' || result) {
				next('', args);
				return;
			}

			const detailQueryName = detailQueryMap[identifiedNodeType];

			if (!detailQueryName) {
				next('', { ...args, result: [] });
				return;
			}

			const querySpec = mapper.getCypher(detailQueryName, { nodeId: xQuery.nodeId });

			const localCallback = (err, records) => {
				if (err) {
					next(`Detail query failed: ${err}`, args);
					return;
				}

				const detailResult = mapper.mapDetail(records);

				// SIF leaf fallback: if leaf detail returns nothing, try non-leaf detail
				if (detailResult.length === 0 && identifiedNodeType === 'SifXmlElement') {
					const fallbackSpec = mapper.getCypher('sifNonLeafDetail', { nodeId: xQuery.nodeId });

					const fallbackCallback = (fallbackErr, fallbackRecords) => {
						if (fallbackErr) {
							next('', { ...args, result: [] });
							return;
						}
						next('', { ...args, result: mapper.mapDetail(fallbackRecords) });
					};

					neo4jDb.runQuery(fallbackSpec.cypher, fallbackSpec.params, fallbackCallback);
					return;
				}

				next('', { ...args, result: detailResult });
			};

			neo4jDb.runQuery(querySpec.cypher, querySpec.params, localCallback);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 7: AI SEARCH VIA ASKMILO (if model=ai)

		taskList.push((args, next) => {
			const { routeAction, aiQuery } = args;

			if (routeAction !== 'ai') {
				next('', args);
				return;
			}

			if (!aiQuery || !aiQuery.trim()) {
				next('Missing required parameter: query (for AI search)', args);
				return;
			}

			const { spawn } = require('child_process');

			const promptText = `Search for education data elements matching: "${aiQuery}"

SEARCH RESULT FILTERING — apply these defaults unless the user explicitly asks for enumeration values, code sets, or allowed values:

Suppress by default:
- CedsOptionValue nodes — leaf enumeration values that create ranking noise for conceptual queries
- CedsOptionSet nodes — enumeration containers; surface only when user asks "what are the valid values for X"
- SifCodeset nodes — same rationale as CedsOptionSet

Always surface by default:
- CedsClass — domain model classes (e.g., "K12 Student Enrollment")
- CedsProperty — individual data elements
- SifObject — top-level SIF objects (e.g., StudentPersonal)
- SifField — individual SIF data fields
- SifComplexType — shared SIF structural types

Trigger phrases that lift the suppression (user wants enumeration values):
"allowed values", "valid values", "code set", "codeset", "option set", "enumeration", "what values can X be", "list the values for", "what are the options for"

For each matching node return: cedsId (or xpath for SIF), label, nodeType (from labels), standard (CEDS or SIF), hasChildren (boolean), description.

Return ONLY a JSON array. No other text outside the array.`;

			const askMiloInput = JSON.stringify({
				switches: { json: true, noSave: true },
				values: {
					singleCallPromptName: ['DataModelExplorer'],
					expandModel: ['haiku'],
					maxTurns: ['30'],
				},
				fileList: [promptText],
			});

			const child = spawn('askMilo', [], {
				shell: true,
				env: process.env,
			});

			let stdout = '';
			let stderr = '';

			child.stdout.on('data', (chunk) => {
				stdout += chunk.toString();
			});

			child.stderr.on('data', (chunk) => {
				stderr += chunk.toString();
			});

			child.on('close', (exitCode) => {
				if (exitCode !== 0) {
					xLog.error(`askMilo exited with code ${exitCode}: ${stderr}`);
					next(`AI search failed (askMilo exit code ${exitCode})`, args);
					return;
				}

				// Parse the JSON wrapper from askMilo -json output
				let wrapper;
				try {
					wrapper = JSON.parse(stdout);
				} catch (parseErr) {
					xLog.error(`askMilo returned invalid JSON wrapper: ${parseErr}`);
					next('AI search returned invalid response format', args);
					return;
				}

				// Extract the response field and strip markdown code fences
				let jsonStr = wrapper.response || '';
				jsonStr = jsonStr.replace(/^[\s\S]*?```json?\s*/i, '').replace(/\s*```[\s\S]*$/i, '').trim();

				// If no code fences, try to find the JSON array directly
				if (!jsonStr.startsWith('[')) {
					const arrayStart = jsonStr.indexOf('[');
					if (arrayStart >= 0) {
						jsonStr = jsonStr.slice(arrayStart);
					}
				}

				let items;
				try {
					items = JSON.parse(jsonStr);
				} catch (jsonErr) {
					xLog.error(`askMilo response JSON parse failed: ${jsonErr}`);
					xLog.error(`askMilo raw response (first 300 chars): ${(wrapper.response || '').slice(0, 300)}`);
					next(`AI search failed: the AI could not complete the search. Try a simpler query.`, args);
					return;
				}

				// Normalize AI results into standard response format
				const result = items.map((item) => {
					// nodeType may come back as an array from askMilo (e.g., ["CedsProperty", "CEDS"])
					// Extract the first non-standard label as the nodeType
					let nodeType = item.nodeType || '';
					if (Array.isArray(nodeType)) {
						nodeType = nodeType.find((t) => !['CEDS', 'SIF'].includes(t)) || nodeType[0] || '';
					}

					return {
						id: item.cedsId || item.xpath || item.id || item.label,
						label: item.label || '',
						nodeType,
						standard: (item.standard || '').toLowerCase(),
						hasChildren: item.hasChildren || false,
						childCount: 0,
						description: item.description || '',
						path: item.cedsId || item.xpath || item.id || item.label,
					};
				});

				const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
				xLog.status(`[get-nodes] AI search ${elapsed}s, ${result.length} items — ${promptText.slice(0, 100)}`);

				next('', { ...args, result });
			});

			const startTime = Date.now();
			xLog.status(`[get-nodes] AI search starting: "${aiQuery}"`);

			child.stdin.write(askMiloInput);
			child.stdin.end();
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
