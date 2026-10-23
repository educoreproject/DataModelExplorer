#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');

//START OF moduleFunction() ============================================================
const moduleFunction =
	({ moduleName } = {}) =>
	({ dotD, employerModuleName, passThroughParameters } = {}) => {
		const { xLog, getConfig, commandLineParameters } = process.global;

		const { addToDispatchMap, actionSwitchesList, toolMetadataGenerator } =
			passThroughParameters;

		const switchName = 'lookup';

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
			const { formatLabel, regexEscape } = require('../../../../lib/ceds-utils');
			const session = cedsNeo4jDriver.session();

			const searchTerm = commandLineParameters.fileList && commandLineParameters.fileList[0];
			if (!searchTerm) {
				session.close();
				return callback(null, 'Usage: ceds2 -lookup "search term"');
			}

			const limit = parseInt(
				(commandLineParameters.values && commandLineParameters.values.limit && commandLineParameters.values.limit[0]) || '20'
			);
			const pattern = `(?i).*${regexEscape(searchTerm)}.*`;

			(async () => {
				try {
					const result = await session.run(`
						MATCH (n)
						WHERE any(lbl IN coalesce(n.label, []) WHERE lbl =~ $pattern)
						   OR n.notation =~ $pattern
						   OR any(id IN coalesce(n.identifier, []) WHERE id =~ $pattern)
						WITH n,
							CASE
								WHEN 'Class' IN labels(n) AND 'ConceptScheme' IN labels(n) THEN 'OptionSet'
								WHEN 'Class' IN labels(n) THEN 'Class'
								WHEN 'Property' IN labels(n) THEN 'Property'
								WHEN 'NamedIndividual' IN labels(n) THEN 'EnumValue'
								ELSE 'Other'
							END AS nodeType
						RETURN nodeType,
							n.label AS label,
							n.notation AS notation,
							n.uri AS uri,
							CASE WHEN n.description IS NOT NULL AND n.description <> '' THEN n.description ELSE n.comment END AS description
						ORDER BY
							CASE nodeType WHEN 'Class' THEN 1 WHEN 'OptionSet' THEN 2 WHEN 'Property' THEN 3 WHEN 'EnumValue' THEN 4 ELSE 5 END,
							n.label
						LIMIT $limit
					`, { pattern, limit: neo4j.int(limit) });

					if (result.records.length === 0) {
						callback(null, `\nNo results for "${searchTerm}".`);
						return;
					}

					let output = `\n=== Lookup: "${searchTerm}" (${result.records.length} results) ===\n\n`;

					let currentType = '';
					result.records.forEach(r => {
						const type = r.get('nodeType');
						if (type !== currentType) {
							currentType = type;
							output += `--- ${type} ---\n`;
						}
						const label = formatLabel(r.get('label'));
						const notation = formatLabel(r.get('notation'));
						const desc = r.get('description') || '';
						const truncDesc = desc.length > 120 ? desc.substring(0, 117) + '...' : desc;

						output += `  ${label}\n`;
						if (notation && notation !== label) output += `    notation: ${notation}\n`;
						if (truncDesc) output += `    ${truncDesc}\n`;
						output += '\n';
					});

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

		const toolMetadata = toolMetadataGenerator()
			.category('ontology-navigation')
			.suppressNeobrainSync(true)
			.build();

		addToDispatchMap(switchName, {
			moduleName,
			workingFunction: executeCommand,
			helpString: helpString,
			toolSelector,
			listing: listingString,
			toolModulePath: __filename,
			toolMetadata
		});

		actionSwitchesList.push(switchName);
		dotD.library.add(moduleName, executeCommand);
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
