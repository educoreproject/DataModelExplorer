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

		const switchName = 'stats';

		const executeCommand = (args, callback) => {
			// multiCall namespace resolution
			const commandLineParameters = process.global.commandLineParameters.switches?.multiCall
				? process.global.commandLineParameters[switchName]
				: process.global.commandLineParameters;

			// Check for help request
			if (commandLineParameters.switches.help) {
				const helpString = require('./lib/help-string')({ switchName, employerModuleName }).getResult();
				xLog.result(`\n${'='.repeat(80)}\n${helpString}\n${'='.repeat(80)}\n`);
				return callback('skipRestOfPipe', { success: true, helpShown: true });
			}

			// Check for tool selector request
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
						MATCH (n)
						WITH labels(n) AS lbls, count(n) AS cnt
						WITH
							CASE
								WHEN 'Class' IN lbls AND 'ConceptScheme' IN lbls THEN 'OptionSet (Class+ConceptScheme)'
								WHEN 'Class' IN lbls THEN 'Class'
								WHEN 'Property' IN lbls THEN 'Property'
								WHEN 'NamedIndividual' IN lbls THEN 'NamedIndividual (enum value)'
								ELSE 'Other'
							END AS nodeType,
							cnt
						RETURN nodeType, sum(cnt) AS count
						ORDER BY count DESC
					`);

					const embeddedResult = await session.run(`
						MATCH (n) WHERE n.embedding IS NOT NULL
						RETURN count(n) AS embeddedCount
					`);

					const relResult = await session.run(`
						MATCH ()-[r]->()
						RETURN type(r) AS relType, count(r) AS count
						ORDER BY count DESC
					`);

					let output = '\n=== CEDS Ontology v13 Statistics ===\n\n';
					output += 'NODE TYPES:\n';
					result.records.forEach(r => {
						output += `  ${r.get('nodeType').padEnd(40)} ${r.get('count').toString()}\n`;
					});

					output += `\n  Vector embeddings:${' '.repeat(21)}${embeddedResult.records[0].get('embeddedCount').toString()}\n`;

					output += '\nRELATIONSHIP TYPES:\n';
					relResult.records.forEach(r => {
						output += `  ${r.get('relType').padEnd(40)} ${r.get('count').toString()}\n`;
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
