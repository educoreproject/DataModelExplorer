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

		const switchName = 'kgScope';

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
			const { formatOutput, resolveFormat } = require('../../../../lib/output-formatter');
			const format = resolveFormat(commandLineParameters);

			const setDomains = commandLineParameters.values &&
				commandLineParameters.values.set &&
				commandLineParameters.values.set[0];
			const outputPath = (commandLineParameters.values &&
				commandLineParameters.values.output &&
				commandLineParameters.values.output[0]) || './scope-config.json';
			const classificationPath = commandLineParameters.values &&
				commandLineParameters.values.classification &&
				commandLineParameters.values.classification[0];

			const session = cedsNeo4jDriver.session();

			(async () => {
				try {
					// Query Neo4j for domain breakdown by class name prefix
					const domainQuery = `
						MATCH (c:Class)
						WHERE NOT c:ConceptScheme
						WITH c,
						  CASE
						    WHEN any(lbl IN COALESCE(c.label, []) WHERE lbl STARTS WITH 'K12 ') THEN 'K12'
						    WHEN any(lbl IN COALESCE(c.label, []) WHERE lbl STARTS WITH 'EL ') THEN 'EarlyLearning'
						    WHEN any(lbl IN COALESCE(c.label, []) WHERE lbl STARTS WITH 'PS ') THEN 'Postsecondary'
						    WHEN any(lbl IN COALESCE(c.label, []) WHERE lbl STARTS WITH 'AE ') THEN 'AdultEducation'
						    WHEN any(lbl IN COALESCE(c.label, []) WHERE lbl STARTS WITH 'Workforce ') THEN 'Workforce'
						    WHEN any(lbl IN COALESCE(c.label, []) WHERE lbl STARTS WITH 'Credential ') THEN 'Credential'
						    WHEN any(lbl IN COALESCE(c.label, []) WHERE lbl STARTS WITH 'Person ') THEN 'Person'
						    WHEN any(lbl IN COALESCE(c.label, []) WHERE lbl STARTS WITH 'Organization ') THEN 'Organization'
						    WHEN any(lbl IN COALESCE(c.label, []) WHERE lbl STARTS WITH 'Assessment ') THEN 'Assessment'
						    WHEN any(lbl IN COALESCE(c.label, []) WHERE lbl STARTS WITH 'Course ') THEN 'Course'
						    WHEN any(lbl IN COALESCE(c.label, []) WHERE lbl STARTS WITH 'Facility ') THEN 'Facility'
						    ELSE '(core/unscoped)'
						  END AS domain
						RETURN domain, count(c) AS classCount
						ORDER BY classCount DESC
					`;

					const queryResult = await session.run(domainQuery);

					const domains = queryResult.records.map((r) => ({
						domain: r.get('domain'),
						classCount: neo4j.isInt(r.get('classCount'))
							? r.get('classCount').toNumber()
							: r.get('classCount'),
					}));

					const totalClasses = domains.reduce((sum, d) => sum + d.classCount, 0);

					// If classification artifact is provided, cross-reference with Thing/Connection counts
					if (classificationPath) {
						try {
							const classification = JSON.parse(fs.readFileSync(classificationPath, 'utf8'));
							const classificationMap = classification.classifications || {};
							domains.forEach((d) => {
								const domainPrefix = d.domain === '(core/unscoped)' ? null : d.domain;
								let thingCount = 0;
								let connectionCount = 0;
								Object.entries(classificationMap).forEach(([cls, info]) => {
									const matchesDomain = domainPrefix
										? cls.toLowerCase().startsWith(domainPrefix.toLowerCase() + ' ')
										: !['K12', 'EL', 'PS', 'AE', 'Workforce', 'Credential', 'Person', 'Organization', 'Assessment', 'Course', 'Facility']
											.some((prefix) => cls.startsWith(prefix + ' '));
									if (matchesDomain) {
										if (info.bucket === 'thing') thingCount++;
										if (info.bucket === 'connection') connectionCount++;
									}
								});
								d.thingCount = thingCount;
								d.connectionCount = connectionCount;
							});
						} catch (err) {
							// Non-fatal: classification is optional for enrichment
							xLog.status(`Note: could not read classification artifact: ${err.message}`);
						}
					}

					// If --set is provided, write scope config
					if (setDomains) {
						const selectedDomains = setDomains.split(',').map((d) => d.trim());
						const scopeConfig = {
							metadata: {
								generatedAt: new Date().toISOString(),
								tool: 'kgScope',
							},
							includedDomains: selectedDomains,
							excludedDomains: domains
								.map((d) => d.domain)
								.filter((d) => !selectedDomains.includes(d)),
						};

						fs.writeFileSync(outputPath, JSON.stringify(scopeConfig, null, 2));

						const result = {
							action: 'kgScope',
							success: true,
							data: {
								domains,
								currentScope: selectedDomains,
								totalClasses,
								outputPath,
							},
							formatText: (data) => {
								let output = `\n=== Domain Scope Configuration ===\n\n`;
								output += `Scope written to: ${data.outputPath}\n`;
								output += `Included domains: ${data.currentScope.join(', ')}\n\n`;
								data.domains.forEach((d) => {
									const included = data.currentScope.includes(d.domain) ? '[X]' : '[ ]';
									output += `  ${included} ${d.domain.padEnd(25)} ${String(d.classCount).padStart(4)} classes\n`;
								});
								output += `\nTotal classes: ${data.totalClasses}\n`;
								return output;
							},
						};
						return callback(null, formatOutput(result, format));
					}

					// Default: list all domains
					const result = {
						action: 'kgScope',
						success: true,
						data: {
							domains,
							currentScope: null,
							totalClasses,
						},
						formatText: (data) => {
							let output = `\n=== CEDS Domain Summary ===\n\n`;
							data.domains.forEach((d) => {
								let line = `  ${d.domain.padEnd(25)} ${String(d.classCount).padStart(4)} classes`;
								if (d.thingCount !== undefined) {
									line += `  (${d.thingCount} Things, ${d.connectionCount} Connections)`;
								}
								output += line + '\n';
							});
							output += `\nTotal: ${data.totalClasses} classes\n`;
							output += `\nUse --set="Domain1,Domain2" --output=path to write scope config.\n`;
							return output;
						},
					};
					callback(null, formatOutput(result, format));
				} catch (err) {
					const result = {
						action: 'kgScope',
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
