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

		const switchName = 'materializeJsonLd';

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

			const outputPath = path.resolve(
				(commandLineParameters.values &&
					commandLineParameters.values.output &&
					commandLineParameters.values.output[0]) ||
				'./ceds-kg.jsonld',
			);

			const mode =
				(commandLineParameters.values &&
					commandLineParameters.values.mode &&
					commandLineParameters.values.mode[0]) ||
				'context';

			if (!['context', 'schema', 'full'].includes(mode)) {
				const errorResult = {
					action: switchName,
					success: false,
					error: `Invalid mode "${mode}". Must be one of: context, schema, full`,
				};
				return callback(null, formatOutput(errorResult, format));
			}

			const baseUri =
				(commandLineParameters.values &&
					commandLineParameters.values['base-uri'] &&
					commandLineParameters.values['base-uri'][0]) ||
				'https://ceds.ed.gov/element/';

			const compact = !!commandLineParameters.switches.compact;

			// -- Load surfacing view spec -------------------------------------------------

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

			const nodeTypes = viewSpec.nodeTypes || {};
			const relationshipTypes = viewSpec.relationshipTypes || {};
			const enums = viewSpec.enums || {};

			// -- Optional Neo4j lookup for property datatypes ----------------------------

			const { cedsNeo4jDriver } = args;

			const buildJsonLd = (propertyTypeMap) => {
				// Build @context
				const context = {
					'@vocab': baseUri,
					ceds: baseUri,
					xsd: 'http://www.w3.org/2001/XMLSchema#',
				};

				// Map node types into context
				const nodeTypeNames = Object.keys(nodeTypes);
				nodeTypeNames.forEach((typeName) => {
					const nodeType = nodeTypes[typeName];
					context[typeName] = `ceds:${typeName}`;

					// Map properties
					const properties = nodeType.properties || [];
					properties.forEach((prop) => {
						const camelName = prop.notation || prop.label;
						if (context[camelName]) return; // already mapped

						const xsdType = mapDataTypeToXsd(prop.dataType, prop.optionSet, propertyTypeMap[prop.label]);
						if (xsdType === '@id' || xsdType === '@vocab') {
							context[camelName] = {
								'@id': `ceds:${prop.label.replace(/\s+/g, '')}`,
								'@type': xsdType,
							};
						} else {
							context[camelName] = {
								'@id': `ceds:${prop.label.replace(/\s+/g, '')}`,
								'@type': xsdType,
							};
						}
					});
				});

				// Map relationship names into context
				Object.keys(relationshipTypes).forEach((relName) => {
					const rel = relationshipTypes[relName];
					const relProperties = rel.properties || [];
					relProperties.forEach((prop) => {
						const camelName = prop.notation || prop.label;
						if (context[camelName]) return;

						const xsdType = mapDataTypeToXsd(prop.dataType, prop.optionSet, propertyTypeMap[prop.label]);
						context[camelName] = {
							'@id': `ceds:${prop.label.replace(/\s+/g, '')}`,
							'@type': xsdType,
						};
					});
				});

				const jsonLdDoc = { '@context': context };

				// Schema mode: add @graph with type definitions
				if (mode === 'schema' || mode === 'full') {
					const graphEntries = [];

					nodeTypeNames.forEach((typeName) => {
						const nodeType = nodeTypes[typeName];
						const properties = (nodeType.properties || []).map((prop) => ({
							'@id': `ceds:${prop.label.replace(/\s+/g, '')}`,
							range: mapDataTypeToXsd(prop.dataType, prop.optionSet, propertyTypeMap[prop.label]),
						}));

						const relationships = [];
						Object.keys(relationshipTypes).forEach((relName) => {
							const rel = relationshipTypes[relName];
							if (rel.from === typeName) {
								relationships.push({
									'@id': `ceds:${relName}`,
									target: `ceds:${rel.to}Type`,
									properties: (rel.properties || []).map((p) => p.notation || p.label),
								});
							}
						});

						const entry = {
							'@id': `ceds:${typeName}Type`,
							'@type': 'rdfs:Class',
							'rdfs:label': typeName,
							'rdfs:comment': nodeType.description || '',
							properties,
						};
						if (relationships.length > 0) {
							entry.relationships = relationships;
						}
						graphEntries.push(entry);
					});

					jsonLdDoc['@graph'] = graphEntries;
				}

				// Full mode: add example instances
				if (mode === 'full') {
					if (!jsonLdDoc['@graph']) jsonLdDoc['@graph'] = [];

					nodeTypeNames.forEach((typeName) => {
						const nodeType = nodeTypes[typeName];
						const example = {
							'@id': `ceds:example-${typeName.toLowerCase()}-1`,
							'@type': typeName,
						};
						(nodeType.properties || []).slice(0, 3).forEach((prop) => {
							const camelName = prop.notation || prop.label;
							example[camelName] = `<example ${prop.label}>`;
						});
						jsonLdDoc['@graph'].push(example);
					});
				}

				return jsonLdDoc;
			};

			const mapDataTypeToXsd = (dataType, optionSetName, neoTypeInfo) => {
				if (dataType === 'classRef') return '@id';
				if (dataType === 'optionSet') return '@vocab';
				if (neoTypeInfo && neoTypeInfo.isOptionSet) return '@vocab';
				if (neoTypeInfo && neoTypeInfo.isClassRef) return '@id';

				const typeMap = {
					string: 'xsd:string',
					date: 'xsd:date',
					boolean: 'xsd:boolean',
					decimal: 'xsd:decimal',
					integer: 'xsd:integer',
				};
				return typeMap[dataType] || 'xsd:string';
			};

			const finishAndWrite = (propertyTypeMap) => {
				const jsonLdDoc = buildJsonLd(propertyTypeMap);

				// Count terms for metadata
				const contextTerms = Object.keys(jsonLdDoc['@context']).length;
				const nodeTypeCount = Object.keys(nodeTypes).length;
				const relTypeCount = Object.keys(relationshipTypes).length;

				// Write the file
				try {
					const jsonStr = compact
						? JSON.stringify(jsonLdDoc)
						: JSON.stringify(jsonLdDoc, null, 2);
					fs.writeFileSync(outputPath, jsonStr, 'utf8');
				} catch (writeError) {
					const errorResult = {
						action: switchName,
						success: false,
						error: `Failed to write output: ${writeError.message}`,
					};
					return callback(null, formatOutput(errorResult, format));
				}

				const resultData = {
					outputPath,
					mode,
					nodeTypes: nodeTypeCount,
					relationshipTypes: relTypeCount,
					contextTerms,
					baseUri,
				};

				const result = {
					action: switchName,
					success: true,
					data: resultData,
					formatText: (data) => {
						let output = `\n=== JSON-LD Generation Complete ===\n\n`;
						output += `  Mode:               ${data.mode}\n`;
						output += `  Output:             ${data.outputPath}\n`;
						output += `  Base URI:           ${data.baseUri}\n`;
						output += `  Node types:         ${data.nodeTypes}\n`;
						output += `  Relationship types: ${data.relationshipTypes}\n`;
						output += `  Context terms:      ${data.contextTerms}\n`;
						return output;
					},
				};

				callback(null, formatOutput(result, format));
			};

			// If Neo4j is available, enrich property type info; otherwise proceed without
			if (cedsNeo4jDriver) {
				const session = cedsNeo4jDriver.session();

				// Collect all property labels for bulk lookup
				const allPropertyLabels = new Set();
				Object.values(nodeTypes).forEach((nt) => {
					(nt.properties || []).forEach((p) => allPropertyLabels.add(p.label));
				});
				Object.values(relationshipTypes).forEach((rt) => {
					(rt.properties || []).forEach((p) => allPropertyLabels.add(p.label));
				});

				(async () => {
					try {
						const propertyTypeMap = {};
						if (allPropertyLabels.size > 0) {
							const result = await session.run(
								`MATCH (p:Property)
								 WHERE any(lbl IN COALESCE(p.label, []) WHERE lbl IN $propertyLabels)
								 OPTIONAL MATCH (p)-[:rangeIncludes]->(range)
								 RETURN p.label AS propLabel,
								        range.uri AS rangeUri,
								        range:ConceptScheme AS isOptionSet,
								        range:Class AS isClassRef,
								        p.textFormat AS textFormat`,
								{ propertyLabels: Array.from(allPropertyLabels) },
							);
							result.records.forEach((r) => {
								const label = formatLabel(r.get('propLabel'));
								propertyTypeMap[label] = {
									rangeUri: r.get('rangeUri'),
									isOptionSet: r.get('isOptionSet'),
									isClassRef: r.get('isClassRef'),
									textFormat: r.get('textFormat'),
								};
							});
						}
						finishAndWrite(propertyTypeMap);
					} catch (neoError) {
						xLog.status(`Note: Neo4j property lookup failed (${neoError.message}), proceeding with spec-only types`);
						finishAndWrite({});
					} finally {
						await session.close();
					}
				})();
			} else {
				finishAndWrite({});
			}
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
