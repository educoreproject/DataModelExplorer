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

		const switchName = 'surfaceExport';

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

			const fs = require('fs');
			const neo4j = require('neo4j-driver');
			const { formatLabel } = require('../../../../lib/ceds-utils');
			const { formatOutput, resolveFormat } = require('../../../../lib/output-formatter');
			const format = resolveFormat(commandLineParameters);

			const classificationPath = commandLineParameters.values &&
				commandLineParameters.values.classification &&
				commandLineParameters.values.classification[0];
			const namingPath = commandLineParameters.values &&
				commandLineParameters.values.naming &&
				commandLineParameters.values.naming[0];

			if (!classificationPath || !namingPath) {
				const result = {
					action: 'surfaceExport',
					success: false,
					error: 'Both --classification and --naming artifact paths are required',
				};
				return callback(null, formatOutput(result, format));
			}

			const scopePath = commandLineParameters.values &&
				commandLineParameters.values.scope &&
				commandLineParameters.values.scope[0];
			const outputPath = (commandLineParameters.values &&
				commandLineParameters.values.output &&
				commandLineParameters.values.output[0]) || './surfacing-view-spec.json';
			const validateOnly = commandLineParameters.switches && commandLineParameters.switches['validate-only'];

			let classification, naming, scopeConfig;
			try {
				classification = JSON.parse(fs.readFileSync(classificationPath, 'utf8'));
				naming = JSON.parse(fs.readFileSync(namingPath, 'utf8'));
				if (scopePath) {
					scopeConfig = JSON.parse(fs.readFileSync(scopePath, 'utf8'));
				}
			} catch (err) {
				const result = {
					action: 'surfaceExport',
					success: false,
					error: `Failed to read artifacts: ${err.message}`,
				};
				return callback(null, formatOutput(result, format));
			}

			const classificationMap = classification.classifications || {};
			const namingMap = naming.namings || {};
			const validationErrors = [];

			// Identify Things, Connections, Details
			const thingClasses = Object.keys(classificationMap).filter(
				(cls) => classificationMap[cls].bucket === 'thing'
			);
			const connectionClasses = Object.keys(classificationMap).filter(
				(cls) => classificationMap[cls].bucket === 'connection'
			);
			const detailClasses = Object.keys(classificationMap).filter(
				(cls) => classificationMap[cls].bucket === 'detail'
			);

			// Apply scope filtering if provided
			let includedThings = thingClasses;
			let scopeDomains = null;
			if (scopeConfig && scopeConfig.includedDomains) {
				scopeDomains = scopeConfig.includedDomains;
				includedThings = thingClasses.filter((t) =>
					scopeDomains.some((domain) =>
						t.toLowerCase().startsWith(domain.toLowerCase() + ' ') ||
						t.toLowerCase() === domain.toLowerCase()
					) || scopeDomains.includes('(core/unscoped)')
				);
			}

			// Validate naming entries reference known Things
			Object.entries(namingMap).forEach(([connectionName, n]) => {
				if (!thingClasses.includes(n.from)) {
					validationErrors.push(`Naming entry "${connectionName}": from="${n.from}" is not classified as a Thing`);
				}
				if (!thingClasses.includes(n.to)) {
					validationErrors.push(`Naming entry "${connectionName}": to="${n.to}" is not classified as a Thing`);
				}
				if (!connectionClasses.includes(connectionName)) {
					validationErrors.push(`Naming entry "${connectionName}" is not classified as a Connection`);
				}
			});

			// Check for Connections without naming entries
			connectionClasses.forEach((conn) => {
				if (!namingMap[conn]) {
					validationErrors.push(`Connection "${conn}" has no naming entry -- will not appear as a relationship`);
				}
			});

			// Detect domain prefix for a class name
			const detectDomain = (className) => {
				const domainPrefixes = ['K12', 'EL', 'PS', 'AE', 'Workforce', 'Credential', 'Person', 'Organization', 'Assessment', 'Course', 'Facility'];
				for (const prefix of domainPrefixes) {
					if (className.startsWith(prefix + ' ') || className === prefix) {
						return prefix;
					}
				}
				return '(core/unscoped)';
			};

			// Build nodeTypes from Things
			const nodeTypes = {};
			includedThings.forEach((thingName) => {
				const info = classificationMap[thingName];
				const details = detailClasses
					.filter((d) => d.toLowerCase().startsWith(thingName.toLowerCase() + ' '))
					.map((d) => ({
						className: d,
						propertyCount: classificationMap[d]?.evidence?.propertyCount || 0,
					}));

				nodeTypes[thingName] = {
					cedsClass: thingName,
					cedsUri: `ceds:${thingName.replace(/\s+/g, '')}`,
					description: info.explanation || '',
					domain: detectDomain(thingName),
					properties: [],
					details,
				};
			});

			// Build relationshipTypes from Naming entries
			const relationshipTypes = {};
			Object.entries(namingMap).forEach(([connectionName, n]) => {
				// Skip if endpoints are out of scope
				if (!includedThings.includes(n.from) || !includedThings.includes(n.to)) return;

				relationshipTypes[n.relationship] = {
					from: n.from,
					to: n.to,
					cedsConnection: connectionName,
					cedsUri: `ceds:${connectionName.replace(/\s+/g, '')}`,
					properties: (n.properties && n.properties.included || []).map((p) => ({
						label: p.label,
						notation: p.notation || '',
						cedsUri: '',
						dataType: 'string',
						category: p.category || 'substantive',
						optionSet: null,
					})),
				};
			});

			// Optionally enrich with Neo4j property details
			const enrichWithNeo4j = (cedsNeo4jDriver) => {
				if (!cedsNeo4jDriver) {
					return Promise.resolve();
				}

				const session = cedsNeo4jDriver.session();

				return (async () => {
					try {
						// Enrich nodeTypes with properties from Neo4j
						for (const thingName of includedThings) {
							const pattern = `(?i)^${thingName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
							const propResult = await session.run(`
								MATCH (c:Class)
								WHERE NOT c:ConceptScheme
								AND any(lbl IN COALESCE(c.label, []) WHERE lbl =~ $pattern)
								WITH c LIMIT 1
								MATCH (p:Property)-[:domainIncludes]->(c)
								OPTIONAL MATCH (p)-[:rangeIncludes]->(range)
								RETURN p.label AS propLabel, p.notation AS propNotation,
									p.uri AS propUri,
									range.label AS rangeLabel, range.uri AS rangeUri,
									range:ConceptScheme AS isOptionSet
								ORDER BY p.label
							`, { pattern });

							if (propResult.records.length > 0) {
								nodeTypes[thingName].properties = propResult.records.map((r) => {
									const isOptionSet = r.get('isOptionSet');
									const rangeLabel = formatLabel(r.get('rangeLabel'));
									return {
										label: formatLabel(r.get('propLabel')),
										notation: formatLabel(r.get('propNotation')),
										cedsUri: r.get('propUri') || '',
										dataType: isOptionSet ? 'optionSet' : 'string',
										optionSet: isOptionSet ? rangeLabel : null,
										required: false,
									};
								});
							}
						}
					} finally {
						await session.close();
					}
				})();
			};

			// Execute the enrichment and produce output
			enrichWithNeo4j(cedsNeo4jDriver)
				.then(() => {
					// Build the surfacing view spec
					const surfacingViewSpec = {
						metadata: {
							cedsVersion: classification.metadata?.cedsVersion || 'unknown',
							generatedAt: new Date().toISOString(),
							classificationSource: classificationPath,
							namingSource: namingPath,
							scope: scopeDomains || [],
						},
						nodeTypes,
						relationshipTypes,
						enums: {},
					};

					if (validateOnly) {
						const result = {
							action: 'surfaceExport',
							success: validationErrors.length === 0,
							data: {
								nodeTypes: Object.keys(nodeTypes).length,
								relationshipTypes: Object.keys(relationshipTypes).length,
								totalProperties: Object.values(nodeTypes).reduce(
									(sum, nt) => sum + nt.properties.length, 0
								),
								scope: scopeDomains || [],
								validationErrors,
							},
							formatText: (data) => {
								let output = `\n=== Surfacing View Validation ===\n\n`;
								output += `Node types:         ${data.nodeTypes}\n`;
								output += `Relationship types: ${data.relationshipTypes}\n`;
								output += `Total properties:   ${data.totalProperties}\n`;
								if (data.scope.length > 0) {
									output += `Scope:              ${data.scope.join(', ')}\n`;
								}
								if (data.validationErrors.length > 0) {
									output += `\nVALIDATION ERRORS (${data.validationErrors.length}):\n`;
									data.validationErrors.forEach((e) => {
										output += `  - ${e}\n`;
									});
								} else {
									output += `\nVALIDATION: PASSED\n`;
								}
								return output;
							},
						};
						return callback(null, formatOutput(result, format));
					}

					// Write the surfacing view spec
					try {
						fs.writeFileSync(outputPath, JSON.stringify(surfacingViewSpec, null, 2));
					} catch (writeErr) {
						const result = {
							action: 'surfaceExport',
							success: false,
							error: `Failed to write output: ${writeErr.message}`,
						};
						return callback(null, formatOutput(result, format));
					}

					const result = {
						action: 'surfaceExport',
						success: true,
						data: {
							outputPath,
							nodeTypes: Object.keys(nodeTypes).length,
							relationshipTypes: Object.keys(relationshipTypes).length,
							totalProperties: Object.values(nodeTypes).reduce(
								(sum, nt) => sum + nt.properties.length, 0
							),
							scope: scopeDomains || [],
							validationErrors,
						},
						formatText: (data) => {
							let output = `\n=== Surfacing View Specification Exported ===\n\n`;
							output += `Output:             ${data.outputPath}\n`;
							output += `Node types:         ${data.nodeTypes}\n`;
							output += `Relationship types: ${data.relationshipTypes}\n`;
							output += `Total properties:   ${data.totalProperties}\n`;
							if (data.scope.length > 0) {
								output += `Scope:              ${data.scope.join(', ')}\n`;
							}
							if (data.validationErrors.length > 0) {
								output += `\nWARNINGS (${data.validationErrors.length}):\n`;
								data.validationErrors.forEach((e) => {
									output += `  - ${e}\n`;
								});
							}
							return output;
						},
					};
					callback(null, formatOutput(result, format));
				})
				.catch((err) => {
					const result = {
						action: 'surfaceExport',
						success: false,
						error: err.message,
					};
					callback(null, formatOutput(result, format));
				});
		};

		const helpString = require('./lib/help-string')({ switchName, employerModuleName }).getResult();
		const toolSelector = require('./lib/tool-selector')({ switchName, employerModuleName }).getResult();
		const listingString = require('./lib/help-string')({ switchName, employerModuleName }).getListing();

		const toolMetadata = toolMetadataGenerator()
			.category('kg-surfacer')
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
