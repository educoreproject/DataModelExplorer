#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');

const moduleFunction =
	({ moduleName } = {}) =>
	({ dotD, employerModuleName, passThroughParameters } = {}) => {
		const { xLog, getConfig, commandLineParameters } = process.global;
		const { addToDispatchMap, actionSwitchesList, toolMetadataGenerator } = passThroughParameters;

		const switchName = 'search';

		const executeCommand = (args, callback) => {
			const commandLineParameters = process.global.commandLineParameters.switches?.multiCall
				? process.global.commandLineParameters[switchName]
				: process.global.commandLineParameters;

			if (commandLineParameters.switches.help) {
				const helpString = require('./lib/help-string')({ switchName, employerModuleName }).getResult();
				xLog.result(`\n${'='.repeat(80)}\n${helpString}\n${'='.repeat(80)}\n`);
				return callback('skipRestOfPipe', { success: true, helpShown: true });
			}

			if (commandLineParameters.switches.showToolSelectors || commandLineParameters.switches.showToolSelector) {
				const toolSelector = require('./lib/tool-selector')({ switchName, employerModuleName }).getResult();
				return callback('skipRestOfPipe', toolSelector);
			}

			const { cedsNeo4jDriver } = args;
			if (!cedsNeo4jDriver) {
				return callback(new Error('CEDS Neo4j connection not available'));
			}

			const neo4j = require('neo4j-driver');
			const { formatLabel } = require('../../../../lib/ceds-utils');
			const session = cedsNeo4jDriver.session();

			const searchText = commandLineParameters.fileList && commandLineParameters.fileList[0];
			if (!searchText) {
				session.close();
				return callback(null, 'Usage: ceds2 -search "natural language query"');
			}

			const limit = parseInt(
				(commandLineParameters.values && commandLineParameters.values.limit && commandLineParameters.values.limit[0]) || '15'
			);

			(async () => {
				try {
					// Generate embedding for search text
					let queryEmbedding;
					try {
						const cedsConfig = getConfig('ceds2') || {};
						const OPENAI_API_KEY = cedsConfig.openaiApiKey || process.env.OPENAI_API_KEY || '';
						const OpenAI = (await import('openai')).default;
						const openaiOptions = {};
						if (OPENAI_API_KEY) openaiOptions.apiKey = OPENAI_API_KEY;
						const openai = new OpenAI(openaiOptions);
						const response = await openai.embeddings.create({
							model: 'text-embedding-3-small',
							input: searchText,
						});
						queryEmbedding = response.data[0].embedding;
					} catch (embeddingErr) {
						await session.close();
						return callback(null, `Failed to generate search embedding: ${embeddingErr.message}\nMake sure openaiApiKey is set in ceds2.ini or OPENAI_API_KEY env var.`);
					}

					const result = await session.run(`
						CALL db.index.vector.queryNodes('ceds_vector_index', $limit, $embedding)
						YIELD node, score
						RETURN
							CASE
								WHEN 'Class' IN labels(node) AND 'ConceptScheme' IN labels(node) THEN 'OptionSet'
								WHEN 'Class' IN labels(node) THEN 'Class'
								WHEN 'Property' IN labels(node) THEN 'Property'
								WHEN 'NamedIndividual' IN labels(node) THEN 'EnumValue'
								ELSE 'Other'
							END AS nodeType,
							node.label AS label,
							node.notation AS notation,
							COALESCE(node.description, node.comment, node.definition, '') AS description,
							score
						ORDER BY score DESC
					`, { limit: neo4j.int(limit), embedding: queryEmbedding });

					if (result.records.length === 0) {
						callback(null, '\nNo results found. Vector index may not be populated yet.');
						return;
					}

					let output = `\n=== Semantic Search: "${searchText}" (${result.records.length} results) ===\n\n`;

					result.records.forEach((r, i) => {
						const type = r.get('nodeType');
						const label = formatLabel(r.get('label'));
						const score = r.get('score').toFixed(4);
						const desc = r.get('description');
						const truncDesc = desc && desc.length > 120 ? desc.substring(0, 117) + '...' : desc;

						output += `${(i + 1).toString().padStart(2)}. [${type.padEnd(9)}] ${label}  (score: ${score})\n`;
						if (truncDesc) output += `    ${truncDesc}\n`;
					});
					output += '\n';

					callback(null, output);
				} catch (err) {
					callback(err);
				} finally {
					await session.close();
				}
			})();
		};

		const helpString = require('./lib/help-string')({ switchName, employerModuleName }).getResult();
		const toolSelector = require('./lib/tool-selector')({ switchName, employerModuleName }).getResult();
		const listingString = require('./lib/help-string')({ switchName, employerModuleName }).getListing();

		const toolMetadata = toolMetadataGenerator().category('ontology-navigation').suppressNeobrainSync(true).build();

		addToDispatchMap(switchName, {
			moduleName, workingFunction: executeCommand, helpString, toolSelector,
			listing: listingString, toolModulePath: __filename, toolMetadata
		});

		actionSwitchesList.push(switchName);
		dotD.library.add(moduleName, executeCommand);
	};

module.exports = moduleFunction({ moduleName });
