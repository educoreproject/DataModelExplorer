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

		const switchName = 'compare';

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
				return callback(null, 'Usage: ceds2 -compare "ClassA" "ClassB"');
			}

			const patternA = `(?i).*${regexEscape(classA)}.*`;
			const patternB = `(?i).*${regexEscape(classB)}.*`;

			(async () => {
				try {
					// Resolve the two class nodes
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

					// Query 1: Shared properties
					const sharedResult = await session.run(`
						MATCH (a:Class), (b:Class)
						WHERE any(lbl IN coalesce(a.label, []) WHERE lbl =~ $patternA)
						AND any(lbl IN coalesce(b.label, []) WHERE lbl =~ $patternB)
						WITH a, b LIMIT 1
						MATCH (p:Property)-[:domainIncludes]->(a)
						WHERE (p)-[:domainIncludes]->(b)
						OPTIONAL MATCH (p)-[:rangeIncludes]->(range)
						RETURN p.label AS propLabel, collect(DISTINCT range.label) AS rangeLabels
						ORDER BY p.label
					`, { patternA, patternB });

					const sharedProps = sharedResult.records.map(r => ({
						label: formatLabel(r.get('propLabel')),
						ranges: r.get('rangeLabels').filter(Boolean).map(formatLabel),
					}));

					// Query 2: Unique to A
					const uniqueAResult = await session.run(`
						MATCH (a:Class), (b:Class)
						WHERE any(lbl IN coalesce(a.label, []) WHERE lbl =~ $patternA)
						AND any(lbl IN coalesce(b.label, []) WHERE lbl =~ $patternB)
						WITH a, b LIMIT 1
						MATCH (p:Property)-[:domainIncludes]->(a)
						WHERE NOT (p)-[:domainIncludes]->(b)
						OPTIONAL MATCH (p)-[:rangeIncludes]->(range)
						RETURN p.label AS propLabel, collect(DISTINCT range.label) AS rangeLabels
						ORDER BY p.label
					`, { patternA, patternB });

					const uniqueAProps = uniqueAResult.records.map(r => ({
						label: formatLabel(r.get('propLabel')),
						ranges: r.get('rangeLabels').filter(Boolean).map(formatLabel),
					}));

					// Query 3: Unique to B
					const uniqueBResult = await session.run(`
						MATCH (a:Class), (b:Class)
						WHERE any(lbl IN coalesce(a.label, []) WHERE lbl =~ $patternA)
						AND any(lbl IN coalesce(b.label, []) WHERE lbl =~ $patternB)
						With a, b LIMIT 1
						MATCH (p:Property)-[:domainIncludes]->(b)
						WHERE NOT (p)-[:domainIncludes]->(a)
						OPTIONAL MATCH (p)-[:rangeIncludes]->(range)
						RETURN p.label AS propLabel, collect(DISTINCT range.label) AS rangeLabels
						ORDER BY p.label
					`, { patternA, patternB });

					const uniqueBProps = uniqueBResult.records.map(r => ({
						label: formatLabel(r.get('propLabel')),
						ranges: r.get('rangeLabels').filter(Boolean).map(formatLabel),
					}));

					// Output
					let output = `\n=== Compare: ${labelA} vs. ${labelB} ===\n`;

					output += `\nSHARED PROPERTIES (both classes have these): ${sharedProps.length}\n`;
					sharedProps.forEach(p => {
						const rangeStr = p.ranges.length > 0 ? ` -> [${p.ranges.join(', ')}]` : '';
						output += `  ${p.label}${rangeStr}\n`;
					});

					output += `\nUNIQUE TO ${labelA}: ${uniqueAProps.length}\n`;
					uniqueAProps.forEach(p => {
						const rangeStr = p.ranges.length > 0 ? ` -> [${p.ranges.join(', ')}]` : '';
						output += `  ${p.label}${rangeStr}\n`;
					});

					output += `\nUNIQUE TO ${labelB}: ${uniqueBProps.length}\n`;
					uniqueBProps.forEach(p => {
						const rangeStr = p.ranges.length > 0 ? ` -> [${p.ranges.join(', ')}]` : '';
						output += `  ${p.label}${rangeStr}\n`;
					});

					const totalA = sharedProps.length + uniqueAProps.length;
					const totalB = sharedProps.length + uniqueBProps.length;
					const overlapPct = totalA + totalB > 0
						? ((sharedProps.length * 2 / (totalA + totalB)) * 100).toFixed(1)
						: '0.0';

					output += '\nSUMMARY:\n';
					output += `  ${labelA}:`.padEnd(40) + `${totalA} properties (${sharedProps.length} shared + ${uniqueAProps.length} unique)\n`;
					output += `  ${labelB}:`.padEnd(40) + `${totalB} properties (${sharedProps.length} shared + ${uniqueBProps.length} unique)\n`;
					output += `  Overlap:`.padEnd(40) + `${overlapPct}%\n`;
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
