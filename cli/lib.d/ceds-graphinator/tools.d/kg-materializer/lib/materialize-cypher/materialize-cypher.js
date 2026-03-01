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

		const switchName = 'materializeCypher';

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
				'./ceds-kg.cypher',
			);

			const mode =
				(commandLineParameters.values &&
					commandLineParameters.values.mode &&
					commandLineParameters.values.mode[0]) ||
				'schema';

			if (!['schema', 'template', 'demo'].includes(mode)) {
				const errorResult = {
					action: switchName,
					success: false,
					error: `Invalid mode "${mode}". Must be one of: schema, template, demo`,
				};
				return callback(null, formatOutput(errorResult, format));
			}

			const labelPrefix =
				(commandLineParameters.values &&
					commandLineParameters.values['label-prefix'] &&
					commandLineParameters.values['label-prefix'][0]) ||
				'KG_';

			const database =
				commandLineParameters.values &&
				commandLineParameters.values.database &&
				commandLineParameters.values.database[0];

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

			// -- Generate Cypher ----------------------------------------------------------

			const lines = [];
			const generatedAt = new Date().toISOString();

			lines.push(`// CEDS Knowledge Graph - ${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
			lines.push(`// Generated from surfacing view specification`);
			lines.push(`// Date: ${generatedAt}`);
			lines.push('');

			if (database) {
				lines.push(`:USE ${database}`);
				lines.push('');
			}

			const nodeTypeNames = Object.keys(nodeTypes);
			const relTypeNames = Object.keys(relationshipTypes);
			const nodeLabels = nodeTypeNames.map((name) => `${labelPrefix}${name}`);
			let constraintCount = 0;

			if (mode === 'schema' || mode === 'demo') {
				// Constraints
				lines.push('// Node type constraints');
				nodeTypeNames.forEach((typeName) => {
					const label = `${labelPrefix}${typeName}`;
					const constraintName = `${label.toLowerCase()}_uri`;
					lines.push(`CREATE CONSTRAINT ${constraintName} IF NOT EXISTS`);
					lines.push(`FOR (n:${label}) REQUIRE n.uri IS UNIQUE;`);
					lines.push('');
					constraintCount++;
				});

				// Meta-nodes for node types
				lines.push('// Node type creation (meta-nodes describing the schema)');
				nodeTypeNames.forEach((typeName) => {
					const nodeType = nodeTypes[typeName];
					const propNames = (nodeType.properties || []).map((p) => p.notation || p.label);
					lines.push(`CREATE (:${labelPrefix}NodeType {`);
					lines.push(`  name: '${typeName}',`);
					lines.push(`  label: '${labelPrefix}${typeName}',`);
					lines.push(`  cedsClass: '${nodeType.cedsClass || typeName}',`);
					lines.push(`  cedsUri: '${nodeType.cedsUri || ''}',`);
					lines.push(`  description: '${(nodeType.description || '').replace(/'/g, "\\'")}',`);
					lines.push(`  properties: [${propNames.map((n) => `'${n}'`).join(', ')}]`);
					lines.push('});');
					lines.push('');
				});

				// Meta-nodes for relationship types
				lines.push('// Relationship type creation (meta-relationships)');
				relTypeNames.forEach((relName) => {
					const rel = relationshipTypes[relName];
					const relPropNames = (rel.properties || []).map((p) => p.notation || p.label);
					lines.push(`CREATE (:${labelPrefix}RelationshipType {`);
					lines.push(`  name: '${relName}',`);
					lines.push(`  fromType: '${labelPrefix}${rel.from}',`);
					lines.push(`  toType: '${labelPrefix}${rel.to}',`);
					lines.push(`  cedsConnection: '${rel.cedsConnection || ''}',`);
					lines.push(`  properties: [${relPropNames.map((n) => `'${n}'`).join(', ')}]`);
					lines.push('});');
					lines.push('');
				});
			}

			if (mode === 'template') {
				// Parameterized templates
				lines.push('// Parameterized templates for instance creation');
				lines.push('// Replace $paramName tokens with actual values');
				lines.push('');

				nodeTypeNames.forEach((typeName) => {
					const nodeType = nodeTypes[typeName];
					const label = `${labelPrefix}${typeName}`;
					const props = nodeType.properties || [];
					lines.push(`// --- ${typeName} ---`);
					lines.push(`MERGE (n:${label} {uri: $${typeName.toLowerCase()}Uri})`);
					if (props.length > 0) {
						const setProps = props.map((p) => {
							const name = p.notation || p.label;
							return `n.${name} = $${name}`;
						});
						lines.push(`SET ${setProps.join(', ')};`);
					}
					lines.push('');
				});

				relTypeNames.forEach((relName) => {
					const rel = relationshipTypes[relName];
					const fromLabel = `${labelPrefix}${rel.from}`;
					const toLabel = `${labelPrefix}${rel.to}`;
					const relProps = rel.properties || [];
					lines.push(`// --- ${relName}: ${rel.from} -> ${rel.to} ---`);
					lines.push(`MATCH (a:${fromLabel} {uri: $fromUri})`);
					lines.push(`MATCH (b:${toLabel} {uri: $toUri})`);
					if (relProps.length > 0) {
						const propStr = relProps.map((p) => {
							const name = p.notation || p.label;
							return `${name}: $${name}`;
						}).join(', ');
						lines.push(`MERGE (a)-[:${relName} {${propStr}}]->(b);`);
					} else {
						lines.push(`MERGE (a)-[:${relName}]->(b);`);
					}
					lines.push('');
				});
			}

			if (mode === 'demo') {
				// Synthetic demo instances
				lines.push('// Demo instances');
				lines.push('');

				nodeTypeNames.forEach((typeName, idx) => {
					const label = `${labelPrefix}${typeName}`;
					const nodeType = nodeTypes[typeName];
					const props = (nodeType.properties || []).slice(0, 3);
					for (let i = 1; i <= 2; i++) {
						const propStr = props.map((p) => {
							const name = p.notation || p.label;
							return `${name}: 'Example ${name} ${i}'`;
						}).join(', ');
						lines.push(`CREATE (:${label} {uri: 'demo:${typeName.toLowerCase()}-${i}', ${propStr}});`);
					}
					lines.push('');
				});

				relTypeNames.forEach((relName) => {
					const rel = relationshipTypes[relName];
					const fromLabel = `${labelPrefix}${rel.from}`;
					const toLabel = `${labelPrefix}${rel.to}`;
					lines.push(`MATCH (a:${fromLabel} {uri: 'demo:${rel.from.toLowerCase()}-1'})`);
					lines.push(`MATCH (b:${toLabel} {uri: 'demo:${rel.to.toLowerCase()}-1'})`);
					lines.push(`CREATE (a)-[:${relName}]->(b);`);
					lines.push('');
				});
			}

			// -- Write output -------------------------------------------------------------

			const cypherText = lines.join('\n');
			const statementCount = (cypherText.match(/;/g) || []).length;

			try {
				fs.writeFileSync(outputPath, cypherText, 'utf8');
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
				statementCount,
				nodeLabels,
				relationshipTypes: relTypeNames,
				constraintCount,
			};

			const result = {
				action: switchName,
				success: true,
				data: resultData,
				formatText: (data) => {
					let output = `\n=== Cypher Generation Complete ===\n\n`;
					output += `  Mode:               ${data.mode}\n`;
					output += `  Output:             ${data.outputPath}\n`;
					output += `  Statements:         ${data.statementCount}\n`;
					output += `  Node labels:        ${data.nodeLabels.join(', ')}\n`;
					output += `  Relationship types: ${data.relationshipTypes.join(', ')}\n`;
					output += `  Constraints:        ${data.constraintCount}\n`;
					return output;
				},
			};

			callback(null, formatOutput(result, format));
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
