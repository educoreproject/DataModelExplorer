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

		const switchName = 'materializeDiagram';

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

			const diagramFormat =
				(commandLineParameters.values &&
					commandLineParameters.values['diagram-format'] &&
					commandLineParameters.values['diagram-format'][0]) ||
				'mermaid';

			if (!['mermaid', 'cytoscape', 'dot'].includes(diagramFormat)) {
				const errorResult = {
					action: switchName,
					success: false,
					error: `Invalid diagram-format "${diagramFormat}". Must be one of: mermaid, cytoscape, dot`,
				};
				return callback(null, formatOutput(errorResult, format));
			}

			const extensionMap = { mermaid: '.mmd', cytoscape: '.json', dot: '.dot' };
			const baseOutputPath =
				(commandLineParameters.values &&
					commandLineParameters.values.output &&
					commandLineParameters.values.output[0]) ||
				'./ceds-kg-diagram';
			const outputPath = path.resolve(baseOutputPath + extensionMap[diagramFormat]);

			const centerClass =
				commandLineParameters.values &&
				commandLineParameters.values.center &&
				commandLineParameters.values.center[0];

			const showProperties = !!commandLineParameters.switches['show-properties'] ||
				!!commandLineParameters.switches.showProperties;

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

			// -- Filter by center class if specified --------------------------------------

			let filteredNodeNames = Object.keys(nodeTypes);
			let filteredRelNames = Object.keys(relationshipTypes);

			if (centerClass) {
				// Keep only relationships involving the center class
				filteredRelNames = filteredRelNames.filter((relName) => {
					const rel = relationshipTypes[relName];
					return rel.from === centerClass || rel.to === centerClass;
				});
				// Keep only node types referenced by filtered relationships
				const referencedNodes = new Set();
				if (nodeTypes[centerClass]) referencedNodes.add(centerClass);
				filteredRelNames.forEach((relName) => {
					const rel = relationshipTypes[relName];
					referencedNodes.add(rel.from);
					referencedNodes.add(rel.to);
				});
				filteredNodeNames = filteredNodeNames.filter((name) => referencedNodes.has(name));
			}

			// -- Generate diagram ---------------------------------------------------------

			let diagramContent;

			if (diagramFormat === 'mermaid') {
				diagramContent = buildMermaid(filteredNodeNames, filteredRelNames, nodeTypes, relationshipTypes, showProperties);
			} else if (diagramFormat === 'cytoscape') {
				diagramContent = buildCytoscape(filteredNodeNames, filteredRelNames, nodeTypes, relationshipTypes);
			} else {
				diagramContent = buildDot(filteredNodeNames, filteredRelNames, nodeTypes, relationshipTypes, showProperties);
			}

			// -- Write output -------------------------------------------------------------

			try {
				fs.writeFileSync(outputPath, diagramContent, 'utf8');
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
				diagramFormat,
				nodeCount: filteredNodeNames.length,
				edgeCount: filteredRelNames.length,
				centered: centerClass || null,
			};

			const result = {
				action: switchName,
				success: true,
				data: resultData,
				formatText: (data) => {
					let output = `\n=== Diagram Generation Complete ===\n\n`;
					output += `  Format:    ${data.diagramFormat}\n`;
					output += `  Output:    ${data.outputPath}\n`;
					output += `  Nodes:     ${data.nodeCount}\n`;
					output += `  Edges:     ${data.edgeCount}\n`;
					if (data.centered) output += `  Centered:  ${data.centered}\n`;
					return output;
				},
			};

			callback(null, formatOutput(result, format));
		};

		// -- Diagram builders ---------------------------------------------------------

		const buildMermaid = (nodeNames, relNames, nodeTypes, relationshipTypes, showProperties) => {
			const lines = ['graph LR'];

			nodeNames.forEach((name) => {
				lines.push(`  ${name}((${name}))`);
			});
			lines.push('');

			relNames.forEach((relName) => {
				const rel = relationshipTypes[relName];
				let label = relName;
				if (showProperties && rel.properties && rel.properties.length > 0) {
					const propNames = rel.properties.map((p) => p.notation || p.label).join(', ');
					label = `${relName}\\n[${propNames}]`;
				}
				lines.push(`  ${rel.from} -->|${label}| ${rel.to}`);
			});

			return lines.join('\n');
		};

		const buildCytoscape = (nodeNames, relNames, nodeTypes, relationshipTypes) => {
			const nodes = nodeNames.map((name) => {
				const nt = nodeTypes[name];
				return {
					data: {
						id: name,
						label: name,
						domain: nt.domain || '',
						propertyCount: (nt.properties || []).length,
					},
				};
			});

			const edges = relNames.map((relName, idx) => {
				const rel = relationshipTypes[relName];
				return {
					data: {
						id: `e${idx + 1}`,
						source: rel.from,
						target: rel.to,
						label: relName,
						viaConnection: rel.cedsConnection || '',
					},
				};
			});

			const cytoscapeDoc = {
				elements: { nodes, edges },
				layout: {
					name: 'cose',
					nodeRepulsion: 8000,
					idealEdgeLength: 200,
				},
			};

			return JSON.stringify(cytoscapeDoc, null, 2);
		};

		const buildDot = (nodeNames, relNames, nodeTypes, relationshipTypes, showProperties) => {
			const lines = ['digraph CEDS_KG {', '  rankdir=LR;', '  node [shape=ellipse, style=filled, fillcolor=lightblue];', ''];

			nodeNames.forEach((name) => {
				lines.push(`  ${name} [label="${name}"];`);
			});
			lines.push('');

			relNames.forEach((relName) => {
				const rel = relationshipTypes[relName];
				let label = relName;
				if (showProperties && rel.properties && rel.properties.length > 0) {
					const propNames = rel.properties.map((p) => p.notation || p.label).join('\\n');
					label = `${relName}\\n${propNames}`;
				}
				lines.push(`  ${rel.from} -> ${rel.to} [label="${label}"];`);
			});

			lines.push('}');
			return lines.join('\n');
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
