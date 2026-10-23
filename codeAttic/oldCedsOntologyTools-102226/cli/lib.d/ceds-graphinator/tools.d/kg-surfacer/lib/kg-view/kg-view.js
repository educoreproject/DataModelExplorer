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

		const switchName = 'kgView';

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
			if (!cedsNeo4jDriver) {
				return callback(new Error('CEDS Neo4j connection not available'));
			}

			const fs = require('fs');
			const neo4j = require('neo4j-driver');
			const { formatLabel, regexEscape } = require('../../../../lib/ceds-utils');
			const { formatOutput, resolveFormat } = require('../../../../lib/output-formatter');
			const { resolveClass, buildPattern, classProperties } = require('../../../../lib/common-queries');
			const format = resolveFormat(commandLineParameters);

			const classificationPath = commandLineParameters.values &&
				commandLineParameters.values.classification &&
				commandLineParameters.values.classification[0];
			const namingPath = commandLineParameters.values &&
				commandLineParameters.values.naming &&
				commandLineParameters.values.naming[0];

			if (!classificationPath || !namingPath) {
				const result = {
					action: 'kgView',
					success: false,
					error: 'Both --classification and --naming artifact paths are required',
				};
				return callback(null, formatOutput(result, format));
			}

			let classification, naming;
			try {
				classification = JSON.parse(fs.readFileSync(classificationPath, 'utf8'));
				naming = JSON.parse(fs.readFileSync(namingPath, 'utf8'));
			} catch (err) {
				const result = {
					action: 'kgView',
					success: false,
					error: `Failed to read artifacts: ${err.message}`,
				};
				return callback(null, formatOutput(result, format));
			}

			const thingClassName = commandLineParameters.fileList && commandLineParameters.fileList[0];
			const showDetails = commandLineParameters.switches && commandLineParameters.switches['show-details'];
			const showProperties = !(commandLineParameters.switches && commandLineParameters.switches['hide-properties']);
			const depth = parseInt(
				(commandLineParameters.values && commandLineParameters.values.depth && commandLineParameters.values.depth[0]) || '1'
			);

			// Build lookup maps from artifacts
			const classificationMap = classification.classifications || {};
			const namingMap = naming.namings || {};

			// Identify all Thing classes
			const thingClasses = Object.keys(classificationMap).filter(
				(cls) => classificationMap[cls].bucket === 'thing'
			);
			const connectionClasses = Object.keys(classificationMap).filter(
				(cls) => classificationMap[cls].bucket === 'connection'
			);
			const detailClasses = Object.keys(classificationMap).filter(
				(cls) => classificationMap[cls].bucket === 'detail'
			);

			// If no class name given, show overview of all Things
			if (!thingClassName) {
				const overview = thingClasses.map((thingName) => {
					const relationships = Object.values(namingMap).filter(
						(n) => n.from === thingName || n.to === thingName
					);
					const details = detailClasses.filter((d) =>
						d.toLowerCase().startsWith(thingName.toLowerCase())
					);
					return {
						thing: thingName,
						relationshipCount: relationships.length,
						detailCount: details.length,
					};
				}).sort((a, b) => b.relationshipCount - a.relationshipCount);

				const result = {
					action: 'kgView',
					success: true,
					data: {
						overview: true,
						things: overview,
						totalThings: thingClasses.length,
						totalConnections: connectionClasses.length,
						totalDetails: detailClasses.length,
					},
					formatText: (data) => {
						let output = `\n=== Knowledge Graph Overview ===\n\n`;
						output += `Things: ${data.totalThings}  |  Connections: ${data.totalConnections}  |  Details: ${data.totalDetails}\n\n`;
						data.things.forEach((t) => {
							output += `  ${t.thing.padEnd(35)} ${String(t.relationshipCount).padStart(3)} relationships, ${String(t.detailCount).padStart(3)} details\n`;
						});
						return output;
					},
				};
				return callback(null, formatOutput(result, format));
			}

			// Find the matching Thing
			const matchedThing = thingClasses.find(
				(t) => t.toLowerCase() === thingClassName.toLowerCase()
			);
			if (!matchedThing) {
				const result = {
					action: 'kgView',
					success: false,
					error: `"${thingClassName}" is not classified as a Thing. Known Things: ${thingClasses.slice(0, 10).join(', ')}${thingClasses.length > 10 ? '...' : ''}`,
				};
				return callback(null, formatOutput(result, format));
			}

			// Build relationships from naming artifact
			const relationships = Object.entries(namingMap)
				.filter(([, n]) => n.from === matchedThing || n.to === matchedThing)
				.map(([connectionName, n]) => {
					const direction = n.from === matchedThing ? 'outgoing' : 'incoming';
					const target = direction === 'outgoing' ? n.to : n.from;
					return {
						name: n.relationship,
						target,
						viaConnection: connectionName,
						direction,
						properties: (n.properties && n.properties.included) || [],
					};
				})
				.sort((a, b) => a.name.localeCompare(b.name));

			// Build details list
			const details = detailClasses
				.filter((d) => d.toLowerCase().startsWith(matchedThing.toLowerCase() + ' '))
				.map((d) => ({
					className: d,
					propertyCount: classificationMap[d]?.evidence?.propertyCount || 0,
				}));

			// For depth > 1, follow relationships to adjacent Things and collect their relationships
			const depthRelationships = [];
			if (depth > 1) {
				const visited = new Set([matchedThing]);
				let frontier = relationships.map((r) => r.target).filter((t) => !visited.has(t));
				frontier = [...new Set(frontier)];

				for (let d = 2; d <= depth; d++) {
					const nextFrontier = [];
					frontier.forEach((thingName) => {
						if (visited.has(thingName)) return;
						visited.add(thingName);
						const rels = Object.entries(namingMap)
							.filter(([, n]) => n.from === thingName || n.to === thingName)
							.map(([connectionName, n]) => {
								const direction = n.from === thingName ? 'outgoing' : 'incoming';
								const target = direction === 'outgoing' ? n.to : n.from;
								return {
									name: n.relationship,
									source: thingName,
									target,
									viaConnection: connectionName,
									direction,
									depth: d,
								};
							});
						depthRelationships.push(...rels);
						rels.forEach((r) => {
							if (!visited.has(r.target)) nextFrontier.push(r.target);
						});
					});
					frontier = [...new Set(nextFrontier)];
				}
			}

			const uniqueTargets = [...new Set(relationships.map((r) => r.target))];

			const resultData = {
				thing: matchedThing,
				relationships,
				details: showDetails ? details : undefined,
				summary: {
					relationshipCount: relationships.length,
					detailCount: details.length,
					uniqueTargets: uniqueTargets.length,
				},
			};

			if (depthRelationships.length > 0) {
				resultData.deeperRelationships = depthRelationships;
			}

			const result = {
				action: 'kgView',
				success: true,
				data: resultData,
				formatText: (data) => {
					let output = `\n=== Knowledge Graph View: ${data.thing} ===\n\n`;

					output += `RELATIONSHIPS:\n`;
					if (data.relationships.length === 0) {
						output += `  (none)\n`;
					} else {
						data.relationships.forEach((r) => {
							const arrow = r.direction === 'outgoing'
								? `${data.thing} -[${r.name}]-> ${r.target}`
								: `${r.target} -[${r.name}]-> ${data.thing}`;
							output += `  ${arrow}  (via ${r.viaConnection})\n`;
							if (showProperties && r.properties.length > 0) {
								const propLabels = r.properties.map((p) => p.label).join(', ');
								output += `    Properties: ${propLabels}\n`;
							}
						});
					}

					if (data.details && data.details.length > 0) {
						output += `\nDETAILS (attached to ${data.thing}):\n`;
						data.details.forEach((d) => {
							output += `  ${d.className} (${d.propertyCount} properties)\n`;
						});
					}

					if (data.deeperRelationships && data.deeperRelationships.length > 0) {
						output += `\nDEEPER RELATIONSHIPS:\n`;
						data.deeperRelationships.forEach((r) => {
							const arrow = r.direction === 'outgoing'
								? `${r.source} -[${r.name}]-> ${r.target}`
								: `${r.target} -[${r.name}]-> ${r.source}`;
							output += `  [depth ${r.depth}] ${arrow}\n`;
						});
					}

					output += `\nSUMMARY: ${data.summary.relationshipCount} relationships to ${data.summary.uniqueTargets} distinct Things, ${data.summary.detailCount} Details\n`;
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
