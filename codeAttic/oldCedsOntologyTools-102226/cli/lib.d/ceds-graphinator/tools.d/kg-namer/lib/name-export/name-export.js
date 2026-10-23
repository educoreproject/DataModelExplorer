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

		const switchName = 'nameExport';

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

			const outputPath = (commandLineParameters.values &&
				commandLineParameters.values.output &&
				commandLineParameters.values.output[0]) || './naming-artifact.json';

			const classificationPath = commandLineParameters.values &&
				commandLineParameters.values.classification &&
				commandLineParameters.values.classification[0];

			const validateOnly = commandLineParameters.switches['validate-only'] || commandLineParameters.switches.validateOnly;

			// Read naming artifact from stdin (passed via args.stdinData by the chassis)
			const stdinData = args.stdinData || args.stdinJson;
			if (!stdinData) {
				const result = {
					action: 'nameExport',
					success: false,
					error: 'Naming artifact JSON must be provided via stdin'
				};
				return callback(null, formatOutput(result, format));
			}

			let namingArtifact;
			try {
				namingArtifact = typeof stdinData === 'string' ? JSON.parse(stdinData) : stdinData;
			} catch (parseErr) {
				const result = {
					action: 'nameExport',
					success: false,
					error: `Invalid JSON in stdin: ${parseErr.message}`
				};
				return callback(null, formatOutput(result, format));
			}

			// Validate structure
			const validationErrors = [];
			const validationWarnings = [];

			if (!namingArtifact.metadata) {
				validationErrors.push('Missing required field: metadata');
			}
			if (!namingArtifact.namings) {
				validationErrors.push('Missing required field: namings');
			}

			// Validate each naming entry
			const namings = namingArtifact.namings || {};
			const namingEntries = Object.entries(namings);

			namingEntries.forEach(([className, entry]) => {
				if (!entry.relationship) {
					validationErrors.push(`${className}: missing 'relationship' field`);
				}
				if (entry.relationship && !/^[A-Z][A-Z0-9_]*$/.test(entry.relationship)) {
					validationWarnings.push(`${className}: relationship "${entry.relationship}" is not UPPER_SNAKE_CASE`);
				}
				if (!entry.from) {
					validationWarnings.push(`${className}: missing 'from' endpoint`);
				}
				if (!entry.to) {
					validationWarnings.push(`${className}: missing 'to' endpoint`);
				}
			});

			(async () => {
				// Validate class names against CEDS if Neo4j is available
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
								validationWarnings.push(`${className}: not found in CEDS ontology`);
							}
						});
					} catch (queryErr) {
						validationWarnings.push(`Could not validate against CEDS: ${queryErr.message}`);
					} finally {
						await session.close();
					}
				}

				// Cross-validate with Stage 1 classification artifact if provided
				if (classificationPath) {
					try {
						const classificationData = JSON.parse(fs.readFileSync(path.resolve(classificationPath), 'utf8'));
						const classifications = classificationData.classifications || {};

						namingEntries.forEach(([className]) => {
							const classInfo = classifications[className];
							if (!classInfo) {
								validationWarnings.push(`${className}: not found in classification artifact`);
							} else if (classInfo.bucket !== 'connection') {
								validationErrors.push(`${className}: classified as "${classInfo.bucket}" not "connection" in Stage 1`);
							}
						});
					} catch (readErr) {
						validationWarnings.push(`Could not read classification artifact: ${readErr.message}`);
					}
				}

				// Count by type
				const summary = {
					things: 0,
					connections: namingEntries.length,
					details: 0
				};

				// Write to disk unless validate-only
				if (validationErrors.length === 0 && !validateOnly) {
					try {
						// Ensure metadata has timestamp
						if (namingArtifact.metadata && !namingArtifact.metadata.namedAt) {
							namingArtifact.metadata.namedAt = new Date().toISOString();
						}
						fs.writeFileSync(path.resolve(outputPath), JSON.stringify(namingArtifact, null, 2), 'utf8');
					} catch (writeErr) {
						const result = {
							action: 'nameExport',
							success: false,
							error: `Failed to write file: ${writeErr.message}`
						};
						callback(null, formatOutput(result, format));
						return;
					}
				}

				// Build sample
				const sampleEntries = namingEntries.slice(0, 3);
				const sample = {
					connections: sampleEntries.map(([className, entry]) => ({
						className: className,
						localName: entry.relationship,
						from: entry.from,
						to: entry.to
					}))
				};

				const resultData = {
					outputPath: validateOnly ? '(validate-only, not written)' : path.resolve(outputPath),
					summary: summary,
					validationErrors: validationErrors,
					validationWarnings: validationWarnings,
					sample: sample
				};

				const result = {
					action: 'nameExport',
					success: validationErrors.length === 0,
					data: resultData,
					formatText: (data) => {
						let output = `\n=== Name Export ===\n`;
						if (data.validationErrors.length === 0) {
							output += `Output: ${data.outputPath}\n`;
						}
						output += `Summary: ${data.summary.connections} connections\n`;

						if (data.validationErrors.length > 0) {
							output += `\nVALIDATION ERRORS (${data.validationErrors.length}):\n`;
							data.validationErrors.forEach(e => { output += `  ERROR: ${e}\n`; });
						}
						if (data.validationWarnings.length > 0) {
							output += `\nWARNINGS (${data.validationWarnings.length}):\n`;
							data.validationWarnings.forEach(w => { output += `  WARN: ${w}\n`; });
						}

						if (data.sample.connections.length > 0) {
							output += '\nSAMPLE:\n';
							data.sample.connections.forEach(s => {
								output += `  ${s.className} -> ${s.from} -[${s.localName}]-> ${s.to}\n`;
							});
						}

						output += '\n';
						return output;
					}
				};

				if (validationErrors.length > 0) {
					result.error = `${validationErrors.length} validation error(s)`;
				}

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
