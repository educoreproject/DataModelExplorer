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

		const switchName = 'classifyImport';

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
			const { formatLabel } = require('../../../../lib/ceds-utils');
			const format = resolveFormat(commandLineParameters);

			const inputFile = commandLineParameters.fileList && commandLineParameters.fileList[0];
			if (!inputFile) {
				const errorResult = {
					action: 'classifyImport',
					success: false,
					error: 'No input file specified. Usage: ceds2 -classifyImport <path-to-artifact.json>',
				};
				return callback(null, formatOutput(errorResult, format));
			}

			const summaryOnly = !!(commandLineParameters.switches && commandLineParameters.switches['summary-only']);

			const bucketFilter =
				commandLineParameters.values &&
				commandLineParameters.values.bucket &&
				commandLineParameters.values.bucket[0];

			// ------------------------------------------------------------------
			// Read and parse the file
			// ------------------------------------------------------------------
			let artifact;
			const resolvedPath = path.resolve(inputFile);

			try {
				const rawContent = fs.readFileSync(resolvedPath, 'utf8');
				artifact = JSON.parse(rawContent);
			} catch (readErr) {
				const errorResult = {
					action: 'classifyImport',
					success: false,
					error: `Failed to read or parse file: ${readErr.message}`,
				};
				return callback(null, formatOutput(errorResult, format));
			}

			// ------------------------------------------------------------------
			// Structure validation
			// ------------------------------------------------------------------
			const validationErrors = [];
			const validationWarnings = [];

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
				const requiredEvidenceFields = ['degree', 'hubConnectivity', 'temporalRatio', 'subtreeDepth', 'propertyCount', 'nameSignals'];

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

					// Check evidence fields
					if (classification.evidence) {
						for (const field of requiredEvidenceFields) {
							if (classification.evidence[field] === undefined) {
								validationErrors.push(`Missing evidence.${field} for class "${className}"`);
							}
						}
					} else {
						validationErrors.push(`Missing evidence object for class "${className}"`);
					}

					// Warning: low confidence without explanation
					if (classification.confidence === 'low' && !classification.explanation) {
						validationWarnings.push(`Class "${className}" has low confidence but no explanation`);
					}
				}
			}

			// ------------------------------------------------------------------
			// Neo4j validation: check class names against CEDS ontology
			// ------------------------------------------------------------------
			const { cedsNeo4jDriver } = args;

			const finalize = (cedsClassNames) => {
				// Check artifact class names against CEDS
				if (cedsClassNames && artifact.classifications) {
					for (const className of Object.keys(artifact.classifications)) {
						if (!cedsClassNames.has(className)) {
							validationWarnings.push(`Class "${className}" in artifact not found in CEDS`);
						}
					}

					// Check for CEDS classes missing from artifact
					for (const cedsName of cedsClassNames) {
						if (!artifact.classifications[cedsName]) {
							validationWarnings.push(`CEDS class "${cedsName}" missing from artifact`);
						}
					}
				}

				// Compute summary
				const classifications = artifact.classifications || {};
				const summary = { things: 0, connections: 0, details: 0, unclassified: 0, total: 0 };

				for (const classification of Object.values(classifications)) {
					summary.total++;
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

				// Apply bucket filter if specified
				let filteredClassifications = classifications;
				if (bucketFilter) {
					filteredClassifications = {};
					for (const [className, classification] of Object.entries(classifications)) {
						if (classification.bucket === bucketFilter) {
							filteredClassifications[className] = classification;
						}
					}
				}

				const resultData = {
					inputPath: resolvedPath,
					valid: validationErrors.length === 0,
					validationErrors,
					validationWarnings,
					metadata: artifact.metadata || {},
					summary,
				};

				if (!summaryOnly) {
					resultData.classifications = filteredClassifications;
				}

				const result = {
					action: 'classifyImport',
					success: true,
					data: resultData,
					formatText: (data) => {
						let output = '\n=== Classification Import ===\n';
						output += `File: ${data.inputPath}\n`;
						output += `Status: ${data.valid ? 'VALID' : 'INVALID'} (${data.validationErrors.length} error(s), ${data.validationWarnings.length} warning(s))\n`;

						output += '\nSUMMARY:\n';
						output += `  Things:       ${String(data.summary.things).padStart(4)}\n`;
						output += `  Connections:  ${String(data.summary.connections).padStart(4)}\n`;
						output += `  Details:      ${String(data.summary.details).padStart(4)}\n`;
						output += `  Unclassified: ${String(data.summary.unclassified).padStart(4)}\n`;
						output += `  Total:        ${String(data.summary.total).padStart(4)}\n`;

						if (data.validationErrors.length > 0) {
							output += '\nERRORS:\n';
							data.validationErrors.forEach((e) => (output += `  - ${e}\n`));
						}

						if (data.validationWarnings.length > 0) {
							output += '\nWARNINGS:\n';
							data.validationWarnings.forEach((w) => (output += `  - ${w}\n`));
						}

						if (!summaryOnly && data.classifications) {
							const classEntries = Object.entries(data.classifications);
							if (bucketFilter) {
								output += `\n${bucketFilter.toUpperCase()} CLASSES (${classEntries.length}):\n`;
							}
							classEntries.forEach(([name, c]) => {
								output += `  ${name} [${c.bucket || 'unclassified'}] (${c.confidence || 'n/a'})\n`;
							});
						}

						return output;
					},
				};

				callback(null, formatOutput(result, format));
			};

			// If Neo4j is available, fetch class names for validation
			if (cedsNeo4jDriver) {
				const session = cedsNeo4jDriver.session();
				(async () => {
					try {
						const classResult = await session.run(`
							MATCH (c:Class)
							WHERE NOT c:ConceptScheme
							RETURN c.label AS label
						`);

						const cedsClassNames = new Set();
						classResult.records.forEach((r) => {
							const label = r.get('label');
							if (Array.isArray(label)) {
								label.forEach((l) => cedsClassNames.add(l));
							} else if (label) {
								cedsClassNames.add(label);
							}
						});

						finalize(cedsClassNames);
					} catch (err) {
						// If Neo4j validation fails, proceed without it
						finalize(null);
					} finally {
						await session.close();
					}
				})();
			} else {
				finalize(null);
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
