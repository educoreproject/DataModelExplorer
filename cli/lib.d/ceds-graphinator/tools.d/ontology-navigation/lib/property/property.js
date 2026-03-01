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

		const switchName = 'property';

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
				return callback(null, 'Usage: ceds2 -property "PropertyName"');
			}

			const pattern = `(?i).*${regexEscape(name)}.*`;

			(async () => {
				try {
					const result = await session.run(`
						MATCH (p:Property)
						WHERE any(lbl IN coalesce(p.label, []) WHERE lbl =~ $pattern)
						   OR p.notation =~ $pattern
						WITH p LIMIT 5
						OPTIONAL MATCH (p)-[:domainIncludes]->(domain)
						OPTIONAL MATCH (p)-[:rangeIncludes]->(range)
						RETURN p.label AS label, p.notation AS notation, p.uri AS uri,
							COALESCE(p.description, '') AS description,
							p.textFormat AS textFormat,
							collect(DISTINCT {label: domain.label, uri: domain.uri}) AS domains,
							collect(DISTINCT {label: range.label, uri: range.uri, isOptionSet: range:ConceptScheme}) AS ranges
						ORDER BY p.label
					`, { pattern });

					if (result.records.length === 0) {
						callback(null, `\nNo property found matching "${name}".`);
						return;
					}

					let output = '';
					result.records.forEach(r => {
						const label = formatLabel(r.get('label'));
						output += `\n=== Property: ${label} ===\n`;
						output += `URI: ${r.get('uri')}\n`;
						if (r.get('notation')) output += `Notation: ${r.get('notation')}\n`;
						if (r.get('description')) output += `\n${r.get('description')}\n`;
						if (r.get('textFormat')) output += `\nFormat: ${r.get('textFormat')}\n`;

						const domains = r.get('domains').filter(d => d.label);
						if (domains.length > 0) {
							output += '\nUSED BY CLASSES:\n';
							domains.forEach(d => { output += `  ${formatLabel(d.label)}\n`; });
						}

						const ranges = r.get('ranges').filter(rng => rng.label);
						if (ranges.length > 0) {
							output += '\nRANGE:\n';
							ranges.forEach(rng => {
								const typeLabel = rng.isOptionSet ? ' [Option Set]' : '';
								output += `  ${formatLabel(rng.label)}${typeLabel}\n`;
							});
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

		const toolMetadata = toolMetadataGenerator().category('ontology-navigation').suppressNeobrainSync(true).build();

		addToDispatchMap(switchName, {
			moduleName, workingFunction: executeCommand, helpString, toolSelector,
			listing: listingString, toolModulePath: __filename, toolMetadata
		});

		actionSwitchesList.push(switchName);
		dotD.library.add(moduleName, executeCommand);
	};

module.exports = moduleFunction({ moduleName });
