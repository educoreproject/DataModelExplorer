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

		const switchName = 'kgCollapse';

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
			const { resolveClass, buildPattern } = require('../../../../lib/common-queries');
			const format = resolveFormat(commandLineParameters);

			const connectionClassName = commandLineParameters.fileList && commandLineParameters.fileList[0];
			if (!connectionClassName) {
				const result = {
					action: 'kgCollapse',
					success: false,
					error: 'Connection class name is required. Usage: ceds2 -kgCollapse "Connection Class Name" --classification=PATH --naming=PATH',
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
					action: 'kgCollapse',
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
					action: 'kgCollapse',
					success: false,
					error: `Failed to read artifacts: ${err.message}`,
				};
				return callback(null, formatOutput(result, format));
			}

			const classificationMap = classification.classifications || {};
			const namingMap = naming.namings || {};

			// Verify the class is classified as a connection
			const classInfo = classificationMap[connectionClassName];
			if (!classInfo) {
				const result = {
					action: 'kgCollapse',
					success: false,
					error: `"${connectionClassName}" not found in classification artifact`,
				};
				return callback(null, formatOutput(result, format));
			}
			if (classInfo.bucket !== 'connection') {
				const result = {
					action: 'kgCollapse',
					success: false,
					error: `"${connectionClassName}" is classified as "${classInfo.bucket}", not "connection". Only Connection classes can be collapsed.`,
				};
				return callback(null, formatOutput(result, format));
			}

			// Get naming info for this connection
			const namingInfo = namingMap[connectionClassName];

			// Query Neo4j for the actual structure of this connection class
			const session = cedsNeo4jDriver.session();
			const pattern = buildPattern(connectionClassName);

			(async () => {
				try {
					// Find properties and edges of the Connection class
					const structureResult = await session.run(`
						MATCH (c:Class)
						WHERE NOT c:ConceptScheme
						AND any(lbl IN COALESCE(c.label, []) WHERE lbl =~ $pattern)
						WITH c LIMIT 1

						// Get properties owned by this class
						OPTIONAL MATCH (prop:Property)-[:domainIncludes]->(c)
						OPTIONAL MATCH (prop)-[:rangeIncludes]->(propRange)

						WITH c, collect(DISTINCT {
							label: prop.label,
							notation: prop.notation,
							rangeLabel: propRange.label,
							isOptionSet: propRange:ConceptScheme,
							isClassRef: propRange:Class AND NOT propRange:ConceptScheme
						}) AS properties

						// Get incoming edges (Properties where this class is the range)
						OPTIONAL MATCH (inProp:Property)-[:rangeIncludes]->(c)
						OPTIONAL MATCH (inProp)-[:domainIncludes]->(inSource:Class)
						WHERE NOT inSource:ConceptScheme

						WITH c, properties, collect(DISTINCT {
							from: inSource.label,
							viaProperty: inProp.label
						}) AS incomingEdges

						// Get outgoing edges (Properties where this class is the domain, pointing to other Classes)
						OPTIONAL MATCH (outProp:Property)-[:domainIncludes]->(c)
						OPTIONAL MATCH (outProp)-[:rangeIncludes]->(outTarget:Class)
						WHERE NOT outTarget:ConceptScheme

						RETURN c.label AS label,
							properties,
							incomingEdges,
							collect(DISTINCT {
								toLabel: outTarget.label,
								viaProperty: outProp.label
							}) AS outgoingEdges
					`, { pattern });

					if (structureResult.records.length === 0) {
						const result = {
							action: 'kgCollapse',
							success: false,
							error: `"${connectionClassName}" not found in Neo4j ontology`,
						};
						return callback(null, formatOutput(result, format));
					}

					const record = structureResult.records[0];
					const rawProperties = record.get('properties').filter((p) => p.label);
					const rawIncoming = record.get('incomingEdges').filter((e) => e.from);
					const rawOutgoing = record.get('outgoingEdges').filter((e) => e.toLabel);

					// Build before state
					const before = {
						node: connectionClassName,
						incomingEdges: rawIncoming.map((e) => ({
							from: formatLabel(e.from),
							viaProperty: formatLabel(e.viaProperty),
						})),
						outgoingEdges: rawOutgoing.map((e) => ({
							to: formatLabel(e.toLabel),
							viaProperty: formatLabel(e.viaProperty),
						})),
						properties: rawProperties.map((p) => ({
							label: formatLabel(p.label),
							notation: formatLabel(p.notation),
							rangeLabel: formatLabel(p.rangeLabel),
							isOptionSet: p.isOptionSet || false,
						})),
					};

					// Build after state from naming artifact
					const after = {};
					if (namingInfo) {
						after.edge = {
							name: namingInfo.relationship,
							from: namingInfo.from,
							to: namingInfo.to,
						};
						after.distributedProperties = (namingInfo.properties && namingInfo.properties.included || []).map((p) => ({
							label: p.label,
							disposition: 'relationship property',
							category: p.category || 'substantive',
						}));
						after.lostProperties = (namingInfo.properties && namingInfo.properties.excluded || []).map((p) => ({
							label: p.label,
							reason: p.reason || 'excluded during naming',
						}));
					} else {
						// No naming info -- derive from structure
						const bridgeEndpoints = [
							...rawIncoming.map((e) => formatLabel(e.from)),
							...rawOutgoing.map((e) => formatLabel(e.toLabel)),
						];
						const uniqueEndpoints = [...new Set(bridgeEndpoints)].filter(
							(ep) => classificationMap[ep] && classificationMap[ep].bucket === 'thing'
						);

						after.edge = {
							name: '(unnamed -- no naming artifact entry)',
							from: uniqueEndpoints[0] || '(unknown)',
							to: uniqueEndpoints[1] || uniqueEndpoints[0] || '(unknown)',
						};
						after.distributedProperties = rawProperties.map((p) => ({
							label: formatLabel(p.label),
							disposition: 'relationship property (inferred)',
						}));
						after.lostProperties = [];
					}

					// Detect conflicts: check if other Connections bridge the same pair of Things
					const conflicts = [];
					if (namingInfo) {
						Object.entries(namingMap).forEach(([otherConn, otherNaming]) => {
							if (otherConn === connectionClassName) return;
							if (
								(otherNaming.from === namingInfo.from && otherNaming.to === namingInfo.to) ||
								(otherNaming.from === namingInfo.to && otherNaming.to === namingInfo.from)
							) {
								conflicts.push({
									connectionClass: otherConn,
									relationship: otherNaming.relationship,
									from: otherNaming.from,
									to: otherNaming.to,
								});
							}
						});
					}
					after.conflicts = conflicts;

					const resultData = {
						connectionClass: connectionClassName,
						before,
						after,
					};

					const result = {
						action: 'kgCollapse',
						success: true,
						data: resultData,
						formatText: (data) => {
							let output = `\n=== Collapse Preview: ${data.connectionClass} ===\n\n`;

							output += `BEFORE (as node):\n`;
							data.before.incomingEdges.forEach((e) => {
								output += `  ${e.from} --[${e.viaProperty}]--> [${data.connectionClass}]\n`;
							});
							data.before.outgoingEdges.forEach((e) => {
								output += `  [${data.connectionClass}] --[${e.viaProperty}]--> ${e.to}\n`;
							});
							if (data.before.properties.length > 0) {
								const propNames = data.before.properties.map((p) => p.label).join(', ');
								output += `  Properties: ${propNames}\n`;
							}

							output += `\nAFTER (as edge):\n`;
							const propStr = data.after.distributedProperties.length > 0
								? ` {${data.after.distributedProperties.map((p) => p.label).join(', ')}}`
								: '';
							output += `  ${data.after.edge.from} -[${data.after.edge.name}${propStr}]-> ${data.after.edge.to}\n`;

							if (data.after.distributedProperties.length > 0) {
								output += `\nPROPERTY DISTRIBUTION:\n`;
								data.after.distributedProperties.forEach((p) => {
									output += `  ${p.label.padEnd(30)} -> ${p.disposition}\n`;
								});
							}

							if (data.after.lostProperties.length > 0) {
								output += `\nLOST PROPERTIES:\n`;
								data.after.lostProperties.forEach((p) => {
									output += `  ${p.label.padEnd(30)} -- ${p.reason}\n`;
								});
							}

							if (data.after.conflicts.length > 0) {
								output += `\nCONFLICTS (same endpoints):\n`;
								data.after.conflicts.forEach((c) => {
									output += `  ${c.connectionClass} -> ${c.relationship} (${c.from} -> ${c.to})\n`;
								});
							} else {
								output += `\nNO CONFLICTS\n`;
							}

							return output;
						},
					};

					callback(null, formatOutput(result, format));
				} catch (err) {
					const result = {
						action: 'kgCollapse',
						success: false,
						error: err.message,
					};
					callback(null, formatOutput(result, format));
				} finally {
					await session.close();
				}
			})();
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
