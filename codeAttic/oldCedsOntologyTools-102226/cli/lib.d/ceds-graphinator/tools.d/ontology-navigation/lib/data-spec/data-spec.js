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

		const switchName = 'dataSpec';

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

			const className = commandLineParameters.fileList && commandLineParameters.fileList[0];
			if (!className) {
				session.close();
				return callback(null, 'Usage: ceds2 -dataSpec "ClassName"');
			}

			const pattern = `(?i).*${regexEscape(className)}.*`;

			(async () => {
				try {
					const result = await session.run(`
						MATCH (c:Class)
						WHERE any(lbl IN coalesce(c.label, []) WHERE lbl =~ $pattern)
						WITH c LIMIT 1
						MATCH (p:Property)-[:domainIncludes]->(c)
						OPTIONAL MATCH (p)-[:rangeIncludes]->(range)
						OPTIONAL MATCH (enumVal:NamedIndividual)-[:inScheme]->(range)
						WHERE range:ConceptScheme
						WITH c, p, range,
							CASE
								WHEN range:ConceptScheme THEN 'OptionSet'
								WHEN range:Class THEN 'ClassRef'
								ELSE 'DataType'
							END AS rangeType,
							count(DISTINCT enumVal) AS valueCount
						RETURN c.label AS classLabel,
							p.label AS propLabel,
							p.description AS propDesc,
							range.label AS rangeLabel,
							range.uri AS rangeUri,
							rangeType,
							valueCount
						ORDER BY p.label
					`, { pattern });

					if (result.records.length === 0) {
						callback(null, `\nNo class or properties found matching "${className}".`);
						return;
					}

					const classLabel = formatLabel(result.records[0].get('classLabel'));
					let optionSetCount = 0;
					let classRefCount = 0;
					let dataTypeCount = 0;

					let output = `\n=== Data Specification: ${classLabel} ===\n`;
					output += `Properties: ${result.records.length}\n`;

					result.records.forEach(r => {
						const propLabel = formatLabel(r.get('propLabel'));
						let rangeLabel = formatLabel(r.get('rangeLabel'));
						if (!rangeLabel) {
							const uri = r.get('rangeUri') || '';
							rangeLabel = uri.replace(/^.*[#\/]/, '') || 'unknown';
						}
						const rangeType = r.get('rangeType');
						const valueCount = r.get('valueCount').toNumber ? r.get('valueCount').toNumber() : Number(r.get('valueCount'));

						output += `\n  ${propLabel}\n`;

						if (rangeType === 'OptionSet') {
							output += `    Type: ${rangeLabel} (OptionSet — ${valueCount} values)\n`;
							optionSetCount++;
						} else if (rangeType === 'ClassRef') {
							output += `    Type: ${rangeLabel} (ClassRef)\n`;
							output += `    A reference to another entity\n`;
							classRefCount++;
						} else {
							output += `    Type: ${rangeLabel} (DataType)\n`;
							dataTypeCount++;
						}
					});

					output += '\nSUMMARY:\n';
					output += `  Total properties:`.padEnd(30) + `${result.records.length}\n`;
					output += `  With option sets:`.padEnd(30) + `${optionSetCount}\n`;
					output += `  With class refs:`.padEnd(30) + `${classRefCount}\n`;
					output += `  With data types:`.padEnd(30) + `${dataTypeCount}\n`;
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
