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

		const switchName = 'kgPaths';

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
			const { formatOutput, resolveFormat } = require('../../../../lib/output-formatter');
			const format = resolveFormat(commandLineParameters);

			const startingThingName = commandLineParameters.fileList && commandLineParameters.fileList[0];
			if (!startingThingName) {
				const result = {
					action: 'kgPaths',
					success: false,
					error: 'Starting Thing class name is required. Usage: ceds2 -kgPaths "ThingName" --classification=PATH --naming=PATH',
				};
				return callback(null, formatOutput(result, format));
			}

			const classificationPath = commandLineParameters.values &&
				commandLineParameters.values.classification &&
				commandLineParameters.values.classification[0];
			const namingPath = commandLineParameters.values &&
				commandLineParameters.values.naming &&
				commandLineParameters.values.naming[0];

			if (!classificationPath || !namingPath) {
				const result = {
					action: 'kgPaths',
					success: false,
					error: 'Both --classification and --naming artifact paths are required',
				};
				return callback(null, formatOutput(result, format));
			}

			const maxDepth = parseInt(
				(commandLineParameters.values && commandLineParameters.values.depth && commandLineParameters.values.depth[0]) || '2'
			);

			// Optional scope config
			const scopePath = commandLineParameters.values &&
				commandLineParameters.values.scope &&
				commandLineParameters.values.scope[0];

			let classification, naming, scopeConfig;
			try {
				classification = JSON.parse(fs.readFileSync(classificationPath, 'utf8'));
				naming = JSON.parse(fs.readFileSync(namingPath, 'utf8'));
				if (scopePath) {
					scopeConfig = JSON.parse(fs.readFileSync(scopePath, 'utf8'));
				}
			} catch (err) {
				const result = {
					action: 'kgPaths',
					success: false,
					error: `Failed to read artifacts: ${err.message}`,
				};
				return callback(null, formatOutput(result, format));
			}

			const classificationMap = classification.classifications || {};
			const namingMap = naming.namings || {};

			// Build list of Things, optionally filtered by scope
			const thingClasses = Object.keys(classificationMap).filter(
				(cls) => classificationMap[cls].bucket === 'thing'
			);

			let includedThings = thingClasses;
			if (scopeConfig && scopeConfig.includedDomains) {
				const includedDomains = scopeConfig.includedDomains;
				includedThings = thingClasses.filter((t) => {
					// Match if any included domain is a prefix of the class name, or if class is in core/unscoped
					return includedDomains.some((domain) =>
						t.toLowerCase().startsWith(domain.toLowerCase() + ' ') ||
						t.toLowerCase() === domain.toLowerCase()
					) || includedDomains.includes('(core/unscoped)');
				});
			}

			// Verify starting Thing
			const matchedStart = includedThings.find(
				(t) => t.toLowerCase() === startingThingName.toLowerCase()
			);
			if (!matchedStart) {
				const result = {
					action: 'kgPaths',
					success: false,
					error: `"${startingThingName}" is not a known Thing class${scopeConfig ? ' within current scope' : ''}. Known Things: ${includedThings.slice(0, 10).join(', ')}${includedThings.length > 10 ? '...' : ''}`,
				};
				return callback(null, formatOutput(result, format));
			}

			// Build adjacency map from naming artifact:
			// For each naming entry, the "from" Thing has an outgoing edge to the "to" Thing
			const adjacencyMap = {};
			Object.entries(namingMap).forEach(([connectionName, n]) => {
				if (!includedThings.includes(n.from) || !includedThings.includes(n.to)) return;

				if (!adjacencyMap[n.from]) adjacencyMap[n.from] = [];
				adjacencyMap[n.from].push({
					relationship: n.relationship,
					target: n.to,
					viaConnection: connectionName,
					direction: 'outgoing',
				});

				// Also record incoming direction for the target
				if (!adjacencyMap[n.to]) adjacencyMap[n.to] = [];
				adjacencyMap[n.to].push({
					relationship: n.relationship,
					target: n.from,
					viaConnection: connectionName,
					direction: 'incoming',
				});
			});

			// BFS to enumerate paths up to maxDepth
			const allPaths = [];
			const queue = [{ current: matchedStart, path: [matchedStart], viaConnections: [], depth: 0 }];

			while (queue.length > 0) {
				const { current, path, viaConnections, depth } = queue.shift();
				if (depth >= maxDepth) continue;

				const neighbors = adjacencyMap[current] || [];
				neighbors.forEach((edge) => {
					// Avoid cycles in the path
					if (path.includes(edge.target)) return;

					const newPath = [...path, edge.relationship, edge.target];
					const newViaConnections = [...viaConnections, edge.viaConnection];
					const newDepth = depth + 1;

					allPaths.push({
						path: newPath,
						viaConnections: newViaConnections,
						depth: newDepth,
					});

					// Continue BFS from the target
					queue.push({
						current: edge.target,
						path: [...path, edge.target],
						viaConnections: newViaConnections,
						depth: newDepth,
					});
				});
			}

			// Collect reachable Things
			const reachableThings = [...new Set(
				allPaths.map((p) => p.path[p.path.length - 1])
			)].sort();

			const resultData = {
				startingThing: matchedStart,
				maxDepth,
				paths: allPaths,
				pathCount: allPaths.length,
				reachableThings,
			};

			const result = {
				action: 'kgPaths',
				success: true,
				data: resultData,
				formatText: (data) => {
					let output = `\n=== Surfaced Paths from ${data.startingThing} (depth ${data.maxDepth}) ===\n\n`;

					for (let d = 1; d <= data.maxDepth; d++) {
						const depthPaths = data.paths.filter((p) => p.depth === d);
						if (depthPaths.length === 0) continue;

						output += `DEPTH ${d}:\n`;
						depthPaths.forEach((p) => {
							// Format path as Thing -[REL]-> Thing -[REL]-> Thing
							const segments = [];
							for (let i = 0; i < p.path.length; i++) {
								if (i % 2 === 0) {
									segments.push(p.path[i]);
								} else {
									segments.push(`-[${p.path[i]}]->`);
								}
							}
							output += `  ${segments.join(' ')}\n`;
						});
						output += '\n';
					}

					output += `SUMMARY: ${data.pathCount} paths, ${data.reachableThings.length} reachable Things\n`;
					output += `Reachable: ${data.reachableThings.join(', ')}\n`;
					return output;
				},
			};

			callback(null, formatOutput(result, format));
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
