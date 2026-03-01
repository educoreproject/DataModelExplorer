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

		const switchName = 'classifyExport';

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

			const { formatOutput, resolveFormat } = require('../../../../lib/output-formatter');
			const format = resolveFormat(commandLineParameters);

			const outputPath =
				(commandLineParameters.values &&
					commandLineParameters.values.output &&
					commandLineParameters.values.output[0]) ||
				'./classification-artifact.json';

			const validateOnly = !!(commandLineParameters.switches && commandLineParameters.switches['validate-only']);

			// Read artifact from stdin (passed via args.stdinData from chassis)
			const stdinData = args.stdinData || '';

			if (!stdinData || stdinData.trim().length === 0) {
				const errorResult = {
					action: 'classifyExport',
					success: false,
					error: 'No classification data received via stdin. Pipe the classification artifact JSON to this command.',
				};
				return callback(null, formatOutput(errorResult, format));
			}

			let artifact;
			try {
				artifact = JSON.parse(stdinData);
			} catch (parseErr) {
				const errorResult = {
					action: 'classifyExport',
					success: false,
					error: `Invalid JSON in stdin: ${parseErr.message}`,
				};
				return callback(null, formatOutput(errorResult, format));
			}

			// ------------------------------------------------------------------
			// Validation
			// ------------------------------------------------------------------
			const validationErrors = [];

			if (!artifact.metadata) {
				validationErrors.push('Missing required field: metadata');
			} else {
				if (!artifact.metadata.cedsVersion) validationErrors.push('Missing metadata.cedsVersion');
				if (!artifact.metadata.classifiedAt) validationErrors.push('Missing metadata.classifiedAt');
			}

			if (!artifact.classifications) {
				validationErrors.push('Missing required field: classifications');
			} else {
				const validBuckets = ['thing', 'connection', 'detail', null];
				const validConfidences = ['high', 'medium', 'low'];
				const validSources = ['algorithm', 'human', 'needsReview'];

				for (const [className, classification] of Object.entries(artifact.classifications)) {
					if (!validBuckets.includes(classification.bucket)) {
						validationErrors.push(`Invalid bucket "${classification.bucket}" for class "${className}"`);
					}
					if (classification.confidence && !validConfidences.includes(classification.confidence)) {
						validationErrors.push(`Invalid confidence "${classification.confidence}" for class "${className}"`);
					}
					if (classification.source && !validSources.includes(classification.source)) {
						validationErrors.push(`Invalid source "${classification.source}" for class "${className}"`);
					}
				}
			}

			// Optionally validate class names against Neo4j
			const { cedsNeo4jDriver } = args;

			const finalize = (classValidationErrors) => {
				const allErrors = validationErrors.concat(classValidationErrors || []);

				if (allErrors.length > 0 && !validateOnly) {
					// Still write if there are only warnings, but report errors
					// For now, errors are blocking
					const errorResult = {
						action: 'classifyExport',
						success: false,
						error: `Validation failed with ${allErrors.length} error(s)`,
						data: { validationErrors: allErrors },
					};
					return callback(null, formatOutput(errorResult, format));
				}

				// Compute summary
				const classifications = artifact.classifications || {};
				const summary = { things: 0, connections: 0, details: 0, unclassified: 0 };
				for (const classification of Object.values(classifications)) {
					switch (classification.bucket) {
						case 'thing':
							summary.things++;
							break;
						case 'connection':
							summary.connections++;
							break;
						case 'detail':
							summary.details++;
							break;
						default:
							summary.unclassified++;
							break;
					}
				}

				if (validateOnly) {
					const result = {
						action: 'classifyExport',
						success: true,
						data: {
							outputPath: null,
							classCount: Object.keys(classifications).length,
							summary,
							validationErrors: allErrors,
							validateOnly: true,
						},
						formatText: (data) => {
							let output = '\n=== Classification Validation ===\n';
							output += `Classes: ${data.classCount}  (${data.summary.things} Things, ${data.summary.connections} Connections, ${data.summary.details} Details, ${data.summary.unclassified} Unclassified)\n`;
							output += `Validation: ${allErrors.length === 0 ? 'PASSED' : 'FAILED'} (${allErrors.length} error(s))\n`;
							if (allErrors.length > 0) {
								output += '\nERRORS:\n';
								allErrors.forEach((e) => (output += `  - ${e}\n`));
							}
							return output;
						},
					};
					return callback(null, formatOutput(result, format));
				}

				// Write the artifact to disk
				try {
					const resolvedPath = path.resolve(outputPath);
					fs.writeFileSync(resolvedPath, JSON.stringify(artifact, null, 2), 'utf8');

					const result = {
						action: 'classifyExport',
						success: true,
						data: {
							outputPath: resolvedPath,
							classCount: Object.keys(classifications).length,
							summary,
							validationErrors: allErrors,
						},
						formatText: (data) => {
							let output = '\n=== Classification Exported ===\n';
							output += `Output: ${data.outputPath}\n`;
							output += `Classes: ${data.classCount}  (${data.summary.things} Things, ${data.summary.connections} Connections, ${data.summary.details} Details, ${data.summary.unclassified} Unclassified)\n`;
							output += `Validation: ${allErrors.length === 0 ? 'PASSED' : 'FAILED'} (${allErrors.length} error(s))\n`;
							if (allErrors.length > 0) {
								output += '\nERRORS:\n';
								allErrors.forEach((e) => (output += `  - ${e}\n`));
							}
							return output;
						},
					};
					callback(null, formatOutput(result, format));
				} catch (writeErr) {
					const errorResult = {
						action: 'classifyExport',
						success: false,
						error: `Failed to write file: ${writeErr.message}`,
					};
					callback(null, formatOutput(errorResult, format));
				}
			};

			// If Neo4j is available, validate class names
			if (cedsNeo4jDriver && artifact.classifications) {
				const session = cedsNeo4jDriver.session();
				(async () => {
					try {
						const classResult = await session.run(`
							MATCH (c:Class)
							WHERE NOT c:ConceptScheme
							RETURN collect(c.label) AS allClassLabels
						`);

						const rawLabels = classResult.records[0].get('allClassLabels');
						const cedsClassNames = new Set();
						rawLabels.forEach((lbl) => {
							if (Array.isArray(lbl)) {
								lbl.forEach((l) => cedsClassNames.add(l));
							} else if (lbl) {
								cedsClassNames.add(lbl);
							}
						});

						const classErrors = [];
						for (const className of Object.keys(artifact.classifications)) {
							if (!cedsClassNames.has(className)) {
								classErrors.push(`Class "${className}" not found in CEDS ontology`);
							}
						}

						finalize(classErrors);
					} catch (err) {
						// If class validation fails, proceed without it
						finalize([]);
					} finally {
						await session.close();
					}
				})();
			} else {
				finalize([]);
			}
		};

		const helpString = require('./lib/help-string')({ switchName, employerModuleName }).getResult();
		const toolSelector = require('./lib/tool-selector')({ switchName, employerModuleName }).getResult();
		const listingString = require('./lib/help-string')({ switchName, employerModuleName }).getListing();

		const toolMetadata = toolMetadataGenerator()
			.category('kg-classifier')
			.suppressNeobrainSync(true)
			.build();

		addToDispatchMap(switchName, {
			moduleName,
			workingFunction: executeCommand,
			helpString: helpString,
			toolSelector,
			listing: listingString,
			toolModulePath: __filename,
			toolMetadata,
		});

		actionSwitchesList.push(switchName);
		dotD.library.add(moduleName, executeCommand);
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
