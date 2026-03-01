#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const fs = require('fs');
const path = require('path');

//START OF moduleFunction() ============================================================
const moduleFunction =
	({ moduleName } = {}) =>
	({ dotD, employerModuleName, passThroughParameters } = {}) => {
		const { xLog, getConfig, commandLineParameters } = process.global;

		const { addToDispatchMap, actionSwitchesList, toolMetadataGenerator } =
			passThroughParameters;

		const switchName = 'nameImport';

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
			const { formatOutput, resolveFormat } = require('../../../../lib/output-formatter');
			const { formatLabel } = require('../../../../lib/ceds-utils');
			const format = resolveFormat(commandLineParameters);

			const filePath = commandLineParameters.fileList && commandLineParameters.fileList[0];
			if (!filePath) {
				return callback(null, 'Usage: ceds2 -nameImport "path/to/naming-artifact.json"');
			}

			const summaryOnly = commandLineParameters.switches['summary-only'] || commandLineParameters.switches.summaryOnly;

			// Read and parse the naming artifact
			let namingArtifact;
			try {
				const rawData = fs.readFileSync(path.resolve(filePath), 'utf8');
				namingArtifact = JSON.parse(rawData);
			} catch (readErr) {
				const result = {
					action: 'nameImport',
					success: false,
					error: `Failed to read naming artifact: ${readErr.message}`
				};
				return callback(null, formatOutput(result, format));
			}

			// Validate structure
			const validationErrors = [];

			if (!namingArtifact.metadata) {
				validationErrors.push('Missing required field: metadata');
			}
			if (!namingArtifact.namings) {
				validationErrors.push('Missing required field: namings');
			}

			const namings = namingArtifact.namings || {};
			const namingEntries = Object.entries(namings);

			namingEntries.forEach(([className, entry]) => {
				if (!entry.relationship) {
					validationErrors.push(`${className}: missing 'relationship' field`);
				}
			});

			// Count entries
			const summary = {
				things: 0,
				connections: namingEntries.length,
				details: 0
			};

			(async () => {
				// Optionally validate class names against CEDS
				if (cedsNeo4jDriver && namingEntries.length > 0) {
					const session = cedsNeo4jDriver.session();
					try {
						const cedsResult = await session.run(
							'MATCH (c:Class) WHERE NOT c:ConceptScheme RETURN collect([lbl IN COALESCE(c.label, []) | lbl][0]) AS allClassLabels'
						);
						const allClassLabels = cedsResult.records[0].get('allClassLabels');

						namingEntries.forEach(([className]) => {
							const found = allClassLabels.some(lbl =>
								lbl && lbl.toLowerCase() === className.toLowerCase()
							);
							if (!found) {
								validationErrors.push(`${className}: not found in CEDS ontology`);
							}
						});
					} catch (queryErr) {
						// Non-fatal: add as warning data rather than failing
					} finally {
						await session.close();
					}
				}

				const resultData = {
					inputPath: path.resolve(filePath),
					valid: validationErrors.length === 0,
					validationErrors: validationErrors,
					summary: summary
				};

				if (!summaryOnly) {
					resultData.namings = namings;
				}

				const result = {
					action: 'nameImport',
					success: true,
					data: resultData,
					formatText: (data) => {
						let output = `\n=== Name Import ===\n`;
						output += `File: ${data.inputPath}\n`;
						output += `Valid: ${data.valid ? 'YES' : 'NO'}\n`;
						output += `Summary: ${data.summary.connections} connections\n`;

						if (data.validationErrors.length > 0) {
							output += `\nVALIDATION ERRORS (${data.validationErrors.length}):\n`;
							data.validationErrors.forEach(e => { output += `  ERROR: ${e}\n`; });
						}

						if (!summaryOnly && data.namings) {
							const entries = Object.entries(data.namings).slice(0, 10);
							output += '\nNAMINGS (first 10):\n';
							entries.forEach(([className, entry]) => {
								output += `  ${className} -> ${entry.from || '?'} -[${entry.relationship}]-> ${entry.to || '?'}\n`;
							});
							if (Object.keys(data.namings).length > 10) {
								output += `  ... and ${Object.keys(data.namings).length - 10} more\n`;
							}
						}

						output += '\n';
						return output;
					}
				};

				callback(null, formatOutput(result, format));
			})();
		};

		const helpString = require('./lib/help-string')({ switchName, employerModuleName }).getResult();
		const toolSelector = require('./lib/tool-selector')({ switchName, employerModuleName }).getResult();
		const listingString = require('./lib/help-string')({ switchName, employerModuleName }).getListing();

		const toolMetadata = toolMetadataGenerator()
			.category('kg-namer')
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
