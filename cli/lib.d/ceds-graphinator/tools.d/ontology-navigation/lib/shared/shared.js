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

		const switchName = 'shared';

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

			(async () => {
				try {
					const result = await session.run(`
						MATCH (p:Property)-[:rangeIncludes]->(os:ConceptScheme)
						MATCH (p)-[:domainIncludes]->(c:Class)
						WHERE NOT c:ConceptScheme
						WITH os, collect(DISTINCT c.label) AS classLabels, count(DISTINCT c) AS classCount
						WHERE classCount >= 3
						OPTIONAL MATCH (v:NamedIndividual)-[:inScheme]->(os)
						RETURN os.label AS optionSetLabel,
							classCount,
							size(collect(DISTINCT v)) AS valueCount,
							classLabels
						ORDER BY classCount DESC
						LIMIT 30
					`);

					if (result.records.length === 0) {
						callback(null, '\nNo option sets found shared across 3+ classes.');
						return;
					}

					let output = '\n=== Shared Vocabularies (Option Sets used by 3+ classes) ===\n';

					let maxClassCount = 0;
					result.records.forEach(r => {
						const osLabel = formatLabel(r.get('optionSetLabel'));
						const classCount = r.get('classCount').toNumber ? r.get('classCount').toNumber() : Number(r.get('classCount'));
						const valueCount = r.get('valueCount').toNumber ? r.get('valueCount').toNumber() : Number(r.get('valueCount'));
						const classLabels = r.get('classLabels').map(lbl => formatLabel(lbl));
						if (classCount > maxClassCount) maxClassCount = classCount;

						output += `\n  ${osLabel} (${classCount} classes, ${valueCount} values)\n`;
						output += `    Used by: ${classLabels.slice(0, 6).join(', ')}${classLabels.length > 6 ? ', ...' : ''}\n`;
					});

					const mostConnected = formatLabel(result.records[0].get('optionSetLabel'));
					output += '\nSUMMARY:\n';
					output += `  Option sets shared across 3+ classes: ${result.records.length}\n`;
					output += `  Most connected: ${mostConnected} (${maxClassCount} classes)\n`;
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
