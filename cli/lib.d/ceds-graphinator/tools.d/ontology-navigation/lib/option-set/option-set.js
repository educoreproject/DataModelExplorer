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

		const switchName = 'optionSet';

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

			const name = commandLineParameters.fileList && commandLineParameters.fileList[0];
			if (!name) {
				session.close();
				return callback(null, 'Usage: ceds2 -optionSet "OptionSetName"');
			}

			const pattern = `(?i).*${regexEscape(name)}.*`;
			const limit = parseInt(
				(commandLineParameters.values && commandLineParameters.values.limit && commandLineParameters.values.limit[0]) || '100'
			);

			(async () => {
				try {
					const result = await session.run(`
						MATCH (cs:ConceptScheme)
						WHERE any(lbl IN coalesce(cs.label, []) WHERE lbl =~ $pattern)
						   OR cs.notation =~ $pattern
						WITH cs LIMIT 1
						OPTIONAL MATCH (v:NamedIndividual)-[:inScheme]->(cs)
						RETURN cs.label AS setLabel, cs.uri AS setUri,
							COALESCE(cs.description, cs.comment, '') AS setDescription,
							v.label AS valueLabel, v.notation AS valueNotation,
							COALESCE(v.description, v.definition, '') AS valueDescription
						ORDER BY v.label
						LIMIT $limit
					`, { pattern, limit: neo4j.int(limit) });

					if (result.records.length === 0) {
						callback(null, `\nNo option set found matching "${name}".`);
						return;
					}

					const setLabel = formatLabel(result.records[0].get('setLabel'));
					const setDesc = result.records[0].get('setDescription');

					let output = `\n=== Option Set: ${setLabel} ===\n`;
					if (setDesc) output += `${setDesc}\n`;
					output += `\nVALUES (${result.records.length}):\n`;

					result.records.forEach(r => {
						const label = formatLabel(r.get('valueLabel'));
						const notation = formatLabel(r.get('valueNotation'));
						const desc = r.get('valueDescription');
						if (label) {
							output += `  ${label}${notation && notation !== label ? ` (${notation})` : ''}\n`;
							if (desc) output += `    ${desc}\n`;
						}
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

		const toolMetadata = toolMetadataGenerator()
			.category('ontology-navigation')
			.suppressNeobrainSync(true)
			.build();

		addToDispatchMap(switchName, {
			moduleName, workingFunction: executeCommand, helpString, toolSelector,
			listing: listingString, toolModulePath: __filename, toolMetadata
		});

		actionSwitchesList.push(switchName);
		dotD.library.add(moduleName, executeCommand);
	};

module.exports = moduleFunction({ moduleName });
