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

		const switchName = 'materializeValidate';

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

			const fs = require('fs');
			const path = require('path');
			const neo4j = require('neo4j-driver');
			const { formatLabel } = require('../../../../lib/ceds-utils');
			const { formatOutput, resolveFormat } = require('../../../../lib/output-formatter');
			const format = resolveFormat(commandLineParameters);

			// -- Read parameters ----------------------------------------------------------

			const artifactPath = commandLineParameters.fileList && commandLineParameters.fileList[0];
			if (!artifactPath) {
				const errorResult = {
					action: switchName,
					success: false,
					error: 'Missing required artifact path. Usage: ceds2 -materializeValidate <artifact-path> --view-spec=<path>',
				};
				return callback(null, formatOutput(errorResult, format));
			}

			const resolvedArtifactPath = path.resolve(artifactPath);
			if (!fs.existsSync(resolvedArtifactPath)) {
				const errorResult = {
					action: switchName,
					success: false,
					error: `Artifact file not found: ${resolvedArtifactPath}`,
				};
				return callback(null, formatOutput(errorResult, format));
			}

			const viewSpecPath =
				commandLineParameters.values &&
				commandLineParameters.values['view-spec'] &&
				commandLineParameters.values['view-spec'][0];

			if (!viewSpecPath) {
				const errorResult = {
					action: switchName,
					success: false,
					error: 'Missing required parameter --view-spec=<path>',
				};
				return callback(null, formatOutput(errorResult, format));
			}

			const resolvedViewSpecPath = path.resolve(viewSpecPath);
			if (!fs.existsSync(resolvedViewSpecPath)) {
				const errorResult = {
					action: switchName,
					success: false,
					error: `View spec file not found: ${resolvedViewSpecPath}`,
				};
				return callback(null, formatOutput(errorResult, format));
			}

			// Auto-detect or read artifact type
			let artifactType =
				commandLineParameters.values &&
				commandLineParameters.values['artifact-type'] &&
				commandLineParameters.values['artifact-type'][0];

			if (!artifactType) {
				const ext = path.extname(resolvedArtifactPath).toLowerCase();
				const detectMap = {
					'.jsonld': 'jsonld',
					'.json': 'jsonld',
					'.cypher': 'cypher',
					'.cql': 'cypher',
					'.graphql': 'schema',
					'.md': 'schema',
					'.mmd': 'diagram',
					'.dot': 'diagram',
				};
				artifactType = detectMap[ext] || 'jsonld';
			}

			// -- Load files ---------------------------------------------------------------

			let viewSpec;
			try {
				viewSpec = JSON.parse(fs.readFileSync(resolvedViewSpecPath, 'utf8'));
			} catch (parseError) {
				const errorResult = {
					action: switchName,
					success: false,
					error: `Failed to parse view spec: ${parseError.message}`,
				};
				return callback(null, formatOutput(errorResult, format));
			}

			let artifactContent;
			try {
				artifactContent = fs.readFileSync(resolvedArtifactPath, 'utf8');
			} catch (readError) {
				const errorResult = {
					action: switchName,
					success: false,
					error: `Failed to read artifact: ${readError.message}`,
				};
				return callback(null, formatOutput(errorResult, format));
			}

			const nodeTypes = viewSpec.nodeTypes || {};
			const relationshipTypes = viewSpec.relationshipTypes || {};

			// -- Collect names from view spec for validation ----------------------------

			const classNames = Object.keys(nodeTypes).map((name) => {
				return (nodeTypes[name].cedsClass || name);
			});

			const propertyNames = new Set();
			Object.values(nodeTypes).forEach((nt) => {
				(nt.properties || []).forEach((p) => propertyNames.add(p.label));
			});
			Object.values(relationshipTypes).forEach((rt) => {
				(rt.properties || []).forEach((p) => propertyNames.add(p.label));
			});

			const optionSetNames = new Set();
			Object.values(nodeTypes).forEach((nt) => {
				(nt.properties || []).forEach((p) => {
					if (p.optionSet) optionSetNames.add(p.optionSet);
				});
			});
			Object.values(relationshipTypes).forEach((rt) => {
				(rt.properties || []).forEach((p) => {
					if (p.optionSet) optionSetNames.add(p.optionSet);
				});
			});

			// -- Neo4j validation ---------------------------------------------------------

			const { cedsNeo4jDriver } = args;

			if (!cedsNeo4jDriver) {
				const errorResult = {
					action: switchName,
					success: false,
					error: 'CEDS Neo4j connection is required for validation',
				};
				return callback(null, formatOutput(errorResult, format));
			}

			const session = cedsNeo4jDriver.session();

			(async () => {
				const errors = [];
				const warnings = [];

				try {
					// 1. Validate class existence
					if (classNames.length > 0) {
						const classResult = await session.run(
							`MATCH (c:Class)
							 WHERE NOT c:ConceptScheme
							 AND any(lbl IN COALESCE(c.label, []) WHERE lbl IN $classNames)
							 RETURN c.label AS label, c.uri AS uri`,
							{ classNames },
						);
						const foundClasses = new Set();
						classResult.records.forEach((r) => {
							const label = formatLabel(r.get('label'));
							foundClasses.add(label);
						});

						classNames.forEach((className) => {
							if (!foundClasses.has(className)) {
								errors.push({
									type: 'MISSING_CLASS',
									message: `Class "${className}" not found in CEDS ontology`,
									location: `nodeTypes.${className}`,
								});
							}
						});
					}

					// 2. Validate property existence
					if (propertyNames.size > 0) {
						const propResult = await session.run(
							`MATCH (p:Property)
							 WHERE any(lbl IN COALESCE(p.label, []) WHERE lbl IN $propertyNames)
							 RETURN p.label AS label, p.uri AS uri`,
							{ propertyNames: Array.from(propertyNames) },
						);
						const foundProperties = new Set();
						propResult.records.forEach((r) => {
							const label = formatLabel(r.get('label'));
							foundProperties.add(label);
						});

						propertyNames.forEach((propName) => {
							if (!foundProperties.has(propName)) {
								warnings.push({
									type: 'UNMAPPED_PROPERTY',
									message: `Property "${propName}" has no CEDS source`,
									location: propName,
								});
							}
						});
					}

					// 3. Validate option set existence
					if (optionSetNames.size > 0) {
						const osResult = await session.run(
							`MATCH (os:ConceptScheme)
							 WHERE any(lbl IN COALESCE(os.label, []) WHERE lbl IN $optionSetNames)
							 RETURN os.label AS label`,
							{ optionSetNames: Array.from(optionSetNames) },
						);
						const foundOptionSets = new Set();
						osResult.records.forEach((r) => {
							const label = formatLabel(r.get('label'));
							foundOptionSets.add(label);
						});

						optionSetNames.forEach((osName) => {
							if (!foundOptionSets.has(osName)) {
								warnings.push({
									type: 'MISSING_OPTION_SET',
									message: `Option set "${osName}" not found in CEDS ontology`,
									location: osName,
								});
							}
						});
					}

					// 4. Cross-check: relationship endpoints reference valid node types
					Object.keys(relationshipTypes).forEach((relName) => {
						const rel = relationshipTypes[relName];
						if (!nodeTypes[rel.from]) {
							errors.push({
								type: 'ORPHAN_RELATIONSHIP_SOURCE',
								message: `Relationship "${relName}" references unknown source node type "${rel.from}"`,
								location: `relationshipTypes.${relName}.from`,
							});
						}
						if (!nodeTypes[rel.to]) {
							errors.push({
								type: 'ORPHAN_RELATIONSHIP_TARGET',
								message: `Relationship "${relName}" references unknown target node type "${rel.to}"`,
								location: `relationshipTypes.${relName}.to`,
							});
						}
					});
				} catch (neoError) {
					errors.push({
						type: 'NEO4J_ERROR',
						message: `Neo4j validation query failed: ${neoError.message}`,
						location: 'neo4j',
					});
				} finally {
					await session.close();
				}

				const isValid = errors.length === 0;

				const resultData = {
					artifactPath: resolvedArtifactPath,
					artifactType,
					valid: isValid,
					errors,
					warnings,
					summary: {
						nodeTypesChecked: classNames.length,
						relationshipTypesChecked: Object.keys(relationshipTypes).length,
						propertiesChecked: propertyNames.size,
						errorsFound: errors.length,
						warningsFound: warnings.length,
					},
				};

				const result = {
					action: switchName,
					success: true,
					data: resultData,
					formatText: (data) => {
						let output = `\n=== Validation Report ===\n\n`;
						output += `  Artifact:            ${data.artifactPath}\n`;
						output += `  Type:                ${data.artifactType}\n`;
						output += `  Valid:               ${data.valid ? 'YES' : 'NO'}\n\n`;

						output += `  Checked:\n`;
						output += `    Node types:        ${data.summary.nodeTypesChecked}\n`;
						output += `    Relationship types: ${data.summary.relationshipTypesChecked}\n`;
						output += `    Properties:        ${data.summary.propertiesChecked}\n\n`;

						if (data.errors.length > 0) {
							output += `  ERRORS (${data.errors.length}):\n`;
							data.errors.forEach((e) => {
								output += `    [${e.type}] ${e.message}\n`;
								output += `      at: ${e.location}\n`;
							});
							output += '\n';
						}

						if (data.warnings.length > 0) {
							output += `  WARNINGS (${data.warnings.length}):\n`;
							data.warnings.forEach((w) => {
								output += `    [${w.type}] ${w.message}\n`;
								output += `      at: ${w.location}\n`;
							});
							output += '\n';
						}

						if (data.errors.length === 0 && data.warnings.length === 0) {
							output += '  All checks passed.\n';
						}

						return output;
					},
				};

				callback(null, formatOutput(result, format));
			})();
		};

		const helpString = require('./lib/help-string')({ switchName, employerModuleName }).getResult();
		const toolSelector = require('./lib/tool-selector')({ switchName, employerModuleName }).getResult();
		const listingString = require('./lib/help-string')({ switchName, employerModuleName }).getListing();

		const toolMetadata = toolMetadataGenerator()
			.category('kg-materializer')
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
