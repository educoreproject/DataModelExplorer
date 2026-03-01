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

		const switchName = 'materializeSchema';

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

			const schemaFormat =
				(commandLineParameters.values &&
					commandLineParameters.values['schema-format'] &&
					commandLineParameters.values['schema-format'][0]) ||
				'json';

			if (!['json', 'markdown', 'graphql'].includes(schemaFormat)) {
				const errorResult = {
					action: switchName,
					success: false,
					error: `Invalid schema-format "${schemaFormat}". Must be one of: json, markdown, graphql`,
				};
				return callback(null, formatOutput(errorResult, format));
			}

			const extensionMap = { json: '.json', markdown: '.md', graphql: '.graphql' };
			const baseOutputPath =
				(commandLineParameters.values &&
					commandLineParameters.values.output &&
					commandLineParameters.values.output[0]) ||
				'./ceds-kg-schema';
			const outputPath = path.resolve(baseOutputPath + extensionMap[schemaFormat]);

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

			// -- Optional Neo4j lookup for enum values -----------------------------------

			const { cedsNeo4jDriver } = args;

			const buildSchema = (enrichedEnums) => {
				const mergedEnums = { ...enums };
				// Merge any Neo4j-enriched enum values
				Object.keys(enrichedEnums).forEach((enumName) => {
					if (!mergedEnums[enumName]) {
						mergedEnums[enumName] = enrichedEnums[enumName];
					} else if (enrichedEnums[enumName].values && enrichedEnums[enumName].values.length > 0) {
						mergedEnums[enumName].values = enrichedEnums[enumName].values;
					}
				});

				if (schemaFormat === 'json') {
					return buildJsonSchema(nodeTypes, relationshipTypes, mergedEnums, viewSpec);
				} else if (schemaFormat === 'markdown') {
					return buildMarkdownSchema(nodeTypes, relationshipTypes, mergedEnums, viewSpec);
				} else {
					return buildGraphqlSchema(nodeTypes, relationshipTypes, mergedEnums);
				}
			};

			const buildJsonSchema = (nodeTypes, relationshipTypes, enums, viewSpec) => {
				const schema = {
					schemaVersion: '1.0',
					cedsVersion: (viewSpec.metadata && viewSpec.metadata.cedsVersion) || 'unknown',
					generatedAt: new Date().toISOString(),
					nodeTypes: {},
					relationshipTypes: {},
					enums: {},
				};

				Object.keys(nodeTypes).forEach((typeName) => {
					const nt = nodeTypes[typeName];
					const properties = {};
					(nt.properties || []).forEach((prop) => {
						const name = prop.notation || prop.label;
						properties[name] = {
							type: prop.dataType || 'string',
							cedsProperty: prop.label,
							required: !!prop.required,
						};
						if (prop.optionSet) {
							properties[name].optionSet = prop.optionSet;
						}
					});

					schema.nodeTypes[typeName] = {
						cedsClass: nt.cedsClass || typeName,
						cedsUri: nt.cedsUri || '',
						description: nt.description || '',
						properties,
						details: (nt.details || []).map((d) => d.className || d),
					};
				});

				Object.keys(relationshipTypes).forEach((relName) => {
					const rt = relationshipTypes[relName];
					const properties = {};
					(rt.properties || []).forEach((prop) => {
						const name = prop.notation || prop.label;
						properties[name] = {
							type: prop.dataType || 'string',
							cedsProperty: prop.label,
						};
						if (prop.category) properties[name].category = prop.category;
						if (prop.optionSet) properties[name].optionSet = prop.optionSet;
					});

					schema.relationshipTypes[relName] = {
						from: rt.from,
						to: rt.to,
						cedsConnection: rt.cedsConnection || '',
						properties,
					};
				});

				Object.keys(enums).forEach((enumName) => {
					const e = enums[enumName];
					schema.enums[enumName] = {
						cedsUri: e.cedsUri || '',
						values: (e.values || []).map((v) =>
							typeof v === 'string' ? v : (v.label || v.notation || String(v)),
						),
					};
				});

				return JSON.stringify(schema, null, 2);
			};

			const buildMarkdownSchema = (nodeTypes, relationshipTypes, enums, viewSpec) => {
				const lines = [];
				const cedsVersion = (viewSpec.metadata && viewSpec.metadata.cedsVersion) || 'unknown';

				lines.push(`# CEDS Knowledge Graph Schema`);
				lines.push('');
				lines.push(`**CEDS Version:** ${cedsVersion}`);
				lines.push(`**Generated:** ${new Date().toISOString()}`);
				lines.push('');

				// Node types
				lines.push('## Node Types');
				lines.push('');
				Object.keys(nodeTypes).forEach((typeName) => {
					const nt = nodeTypes[typeName];
					lines.push(`### ${typeName}`);
					lines.push('');
					if (nt.description) lines.push(`${nt.description}`);
					lines.push('');

					const props = nt.properties || [];
					if (props.length > 0) {
						lines.push('| Property | Type | CEDS Property | Required |');
						lines.push('| --- | --- | --- | --- |');
						props.forEach((prop) => {
							const name = prop.notation || prop.label;
							lines.push(`| ${name} | ${prop.dataType || 'string'} | ${prop.label} | ${prop.required ? 'yes' : 'no'} |`);
						});
						lines.push('');
					}
				});

				// Relationship types
				lines.push('## Relationship Types');
				lines.push('');
				Object.keys(relationshipTypes).forEach((relName) => {
					const rt = relationshipTypes[relName];
					lines.push(`### ${relName}`);
					lines.push('');
					lines.push(`**From:** ${rt.from} **To:** ${rt.to}`);
					if (rt.cedsConnection) lines.push(`**CEDS Connection:** ${rt.cedsConnection}`);
					lines.push('');

					const props = rt.properties || [];
					if (props.length > 0) {
						lines.push('| Property | Type | Category |');
						lines.push('| --- | --- | --- |');
						props.forEach((prop) => {
							const name = prop.notation || prop.label;
							lines.push(`| ${name} | ${prop.dataType || 'string'} | ${prop.category || ''} |`);
						});
						lines.push('');
					}
				});

				// Enums
				if (Object.keys(enums).length > 0) {
					lines.push('## Enumerations');
					lines.push('');
					Object.keys(enums).forEach((enumName) => {
						const e = enums[enumName];
						const values = (e.values || []).map((v) =>
							typeof v === 'string' ? v : (v.label || v.notation || String(v)),
						);
						lines.push(`### ${enumName}`);
						lines.push('');
						lines.push(`Values: ${values.join(', ')}`);
						lines.push('');
					});
				}

				return lines.join('\n');
			};

			const buildGraphqlSchema = (nodeTypes, relationshipTypes, enums) => {
				const lines = [];
				const typeMap = {
					string: 'String',
					date: 'String',
					boolean: 'Boolean',
					decimal: 'Float',
					integer: 'Int',
					optionSet: 'String',
					classRef: 'ID',
				};

				// Enums
				Object.keys(enums).forEach((enumName) => {
					const e = enums[enumName];
					const sanitizedName = enumName.replace(/\s+/g, '');
					lines.push(`enum ${sanitizedName} {`);
					(e.values || []).forEach((v) => {
						const val = typeof v === 'string' ? v : (v.notation || v.label || String(v));
						const sanitizedVal = val.replace(/[^a-zA-Z0-9_]/g, '_');
						lines.push(`  ${sanitizedVal}`);
					});
					lines.push('}');
					lines.push('');
				});

				// Node types
				Object.keys(nodeTypes).forEach((typeName) => {
					const nt = nodeTypes[typeName];
					lines.push(`type ${typeName} {`);
					lines.push(`  uri: ID!`);

					(nt.properties || []).forEach((prop) => {
						const name = (prop.notation || prop.label).replace(/\s+/g, '');
						const gqlType = typeMap[prop.dataType] || 'String';
						const required = prop.required ? '!' : '';
						lines.push(`  ${name}: ${gqlType}${required}`);
					});

					// Relationship fields
					Object.keys(relationshipTypes).forEach((relName) => {
						const rt = relationshipTypes[relName];
						if (rt.from === typeName) {
							const fieldName = relName.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
							lines.push(`  ${fieldName}: [${rt.to}]`);
						}
					});

					lines.push('}');
					lines.push('');
				});

				return lines.join('\n');
			};

			const finishAndWrite = (enrichedEnums) => {
				const schemaContent = buildSchema(enrichedEnums);

				try {
					fs.writeFileSync(outputPath, schemaContent, 'utf8');
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
					schemaFormat,
					nodeTypes: Object.keys(nodeTypes).length,
					relationshipTypes: Object.keys(relationshipTypes).length,
					enums: Object.keys(enums).length,
				};

				const result = {
					action: switchName,
					success: true,
					data: resultData,
					formatText: (data) => {
						let output = `\n=== Schema Generation Complete ===\n\n`;
						output += `  Format:             ${data.schemaFormat}\n`;
						output += `  Output:             ${data.outputPath}\n`;
						output += `  Node types:         ${data.nodeTypes}\n`;
						output += `  Relationship types: ${data.relationshipTypes}\n`;
						output += `  Enumerations:       ${data.enums}\n`;
						return output;
					},
				};

				callback(null, formatOutput(result, format));
			};

			// If Neo4j is available, try to enrich enum values
			if (cedsNeo4jDriver && Object.keys(enums).length > 0) {
				const session = cedsNeo4jDriver.session();

				(async () => {
					try {
						const enrichedEnums = {};
						for (const enumName of Object.keys(enums)) {
							const enumDef = enums[enumName];
							if (enumDef.cedsUri) {
								const result = await session.run(
									`MATCH (v:NamedIndividual)-[:inScheme]->(os:ConceptScheme)
									 WHERE os.uri = $optionSetUri
									 RETURN v.label AS label, v.notation AS notation,
									        COALESCE(v.description, v.definition, '') AS description
									 ORDER BY v.label`,
									{ optionSetUri: enumDef.cedsUri },
								);
								if (result.records.length > 0) {
									enrichedEnums[enumName] = {
										cedsUri: enumDef.cedsUri,
										values: result.records.map((r) => ({
											label: formatLabel(r.get('label')),
											notation: formatLabel(r.get('notation')),
											description: r.get('description') || '',
										})),
									};
								}
							}
						}
						finishAndWrite(enrichedEnums);
					} catch (neoError) {
						xLog.status(`Note: Neo4j enum lookup failed (${neoError.message}), proceeding with spec-only values`);
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
