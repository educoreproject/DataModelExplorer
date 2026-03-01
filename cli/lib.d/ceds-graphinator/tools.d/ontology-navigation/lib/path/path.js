#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');

const moduleFunction =
	({ moduleName } = {}) =>
	({ dotD, employerModuleName, passThroughParameters } = {}) => {
		const { xLog, getConfig, commandLineParameters } = process.global;
		const { addToDispatchMap, actionSwitchesList, toolMetadataGenerator } = passThroughParameters;

		const switchName = 'path';

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

			const neo4j = require('neo4j-driver');
			const { formatLabel, regexEscape } = require('../../../../lib/ceds-utils');
			const session = cedsNeo4jDriver.session();

			const classA = commandLineParameters.fileList && commandLineParameters.fileList[0];
			const classB = commandLineParameters.fileList && commandLineParameters.fileList[1];
			if (!classA || !classB) {
				session.close();
				return callback(null, 'Usage: ceds2 -path "ClassA" "ClassB"');
			}

			const patternA = `(?i).*${regexEscape(classA)}.*`;
			const patternB = `(?i).*${regexEscape(classB)}.*`;

			(async () => {
				try {
					// Resolve the two class nodes first
					const resolveResult = await session.run(`
						MATCH (a:Class)
						WHERE any(lbl IN coalesce(a.label, []) WHERE lbl =~ $patternA)
						WITH a LIMIT 1
						MATCH (b:Class)
						WHERE any(lbl IN coalesce(b.label, []) WHERE lbl =~ $patternB)
						WITH a, b LIMIT 1
						RETURN a.label AS labelA, b.label AS labelB
					`, { patternA, patternB });

					if (resolveResult.records.length === 0) {
						callback(null, `\nNo classes found matching "${classA}" and/or "${classB}".`);
						return;
					}

					const labelA = formatLabel(resolveResult.records[0].get('labelA'));
					const labelB = formatLabel(resolveResult.records[0].get('labelB'));

					let output = `\n=== Path: ${labelA} <-> ${labelB} ===\n`;

					// Section 1: Direct connecting properties
					const directResult = await session.run(`
						MATCH (a:Class), (b:Class)
						WHERE any(lbl IN coalesce(a.label, []) WHERE lbl =~ $patternA)
						AND any(lbl IN coalesce(b.label, []) WHERE lbl =~ $patternB)
						WITH a, b LIMIT 1
						OPTIONAL MATCH (p1:Property)-[:domainIncludes]->(a)
						WHERE (p1)-[:rangeIncludes]->(b)
						WITH a, b, collect(DISTINCT p1.label) AS aToBProps
						OPTIONAL MATCH (p2:Property)-[:domainIncludes]->(b)
						WHERE (p2)-[:rangeIncludes]->(a)
						RETURN aToBProps, collect(DISTINCT p2.label) AS bToAProps
					`, { patternA, patternB });

					let hasDirectConnections = false;
					if (directResult.records.length > 0) {
						const aToBProps = directResult.records[0].get('aToBProps').filter(Boolean).map(formatLabel);
						const bToAProps = directResult.records[0].get('bToAProps').filter(Boolean).map(formatLabel);
						if (aToBProps.length > 0 || bToAProps.length > 0) {
							hasDirectConnections = true;
							output += '\nDIRECT CONNECTIONS:\n';
							aToBProps.forEach(p => { output += `  ${labelA} -[${p}]-> ${labelB}\n`; });
							bToAProps.forEach(p => { output += `  ${labelB} -[${p}]-> ${labelA}\n`; });
						}
					}

					// Section 2: Shared properties
					const sharedResult = await session.run(`
						MATCH (a:Class), (b:Class)
						WHERE any(lbl IN coalesce(a.label, []) WHERE lbl =~ $patternA)
						AND any(lbl IN coalesce(b.label, []) WHERE lbl =~ $patternB)
						WITH a, b LIMIT 1
						MATCH (p:Property)-[:domainIncludes]->(a)
						WHERE (p)-[:domainIncludes]->(b)
						RETURN p.label AS propLabel
						ORDER BY p.label
					`, { patternA, patternB });

					const hasSharedProps = sharedResult.records.length > 0;
					if (hasSharedProps) {
						const sharedProps = sharedResult.records.map(r => formatLabel(r.get('propLabel')));
						output += `\nSHARED PROPERTIES (both classes have these): ${sharedProps.length}\n`;
						sharedProps.forEach(p => { output += `  ${p}\n`; });
					}

					// Section 3: Semantic bridge paths
					const bridgeResult = await session.run(`
						MATCH (a:Class), (b:Class)
						WHERE any(lbl IN coalesce(a.label, []) WHERE lbl =~ $patternA)
						AND any(lbl IN coalesce(b.label, []) WHERE lbl =~ $patternB)
						WITH a, b LIMIT 1
						MATCH (a)<-[:domainIncludes]-(p1:Property)-[:rangeIncludes]->(mid)<-[:rangeIncludes]-(p2:Property)-[:domainIncludes]->(b)
						WHERE a <> b AND p1 <> p2
						RETURN p1.label AS propA, mid.label AS bridge, mid.uri AS bridgeUri, p2.label AS propB,
							labels(mid) AS bridgeLabels
						LIMIT 10
					`, { patternA, patternB });

					const hasBridges = bridgeResult.records.length > 0;
					if (hasBridges) {
						output += '\nSEMANTIC BRIDGES (connected through shared types):\n';
						bridgeResult.records.forEach(r => {
							const propA = formatLabel(r.get('propA'));
							let bridge = formatLabel(r.get('bridge'));
							if (!bridge) {
								const uri = r.get('bridgeUri') || '';
								bridge = uri.replace(/^.*[#\/]/, '') || uri;
							}
							const propB = formatLabel(r.get('propB'));
							const bridgeLabels = r.get('bridgeLabels') || [];
							const typeTag = bridgeLabels.includes('ConceptScheme') ? ' [OptionSet]' : '';
							output += `  ${labelA} <-[${propA}]-> ${bridge}${typeTag} <-[${propB}]-> ${labelB}\n`;
						});
					}

					if (!hasDirectConnections && !hasSharedProps && !hasBridges) {
						output += '\nNo path found between these two classes.\n';
						output += 'They have no direct connections, shared properties, or semantic bridges.\n';
					}

					output += '\n';
					callback(null, output);
				} catch (err) {
					callback(err);
				} finally {
					await session.close();
				}
			})();
		};

		const helpString = require('./lib/help-string')({ switchName, employerModuleName }).getResult();
		const toolSelector = require('./lib/tool-selector')({ switchName, employerModuleName }).getResult();
		const listingString = require('./lib/help-string')({ switchName, employerModuleName }).getListing();

		const toolMetadata = toolMetadataGenerator().category('ontology-navigation').suppressNeobrainSync(true).build();

		addToDispatchMap(switchName, {
			moduleName, workingFunction: executeCommand, helpString, toolSelector,
			listing: listingString, toolModulePath: __filename, toolMetadata
		});

		actionSwitchesList.push(switchName);
		dotD.library.add(moduleName, executeCommand);
	};

module.exports = moduleFunction({ moduleName });
