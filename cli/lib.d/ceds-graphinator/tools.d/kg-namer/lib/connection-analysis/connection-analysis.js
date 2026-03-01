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

		const switchName = 'connectionAnalysis';

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
			const { resolveClass, buildPattern } = require('../../../../lib/common-queries');
			const { formatOutput, resolveFormat } = require('../../../../lib/output-formatter');
			const format = resolveFormat(commandLineParameters);
			const session = cedsNeo4jDriver.session();

			const className = commandLineParameters.fileList && commandLineParameters.fileList[0];
			if (!className) {
				session.close();
				return callback(null, 'Usage: ceds2 -connectionAnalysis "ClassName"');
			}

			const classPattern = buildPattern(className);

			// Temporal label pattern for property categorization
			const temporalPattern = /(?:date|time|year|month|day|duration|period|start|end|entry|exit|begin|expire)/i;
			const statusPattern = /(?:status|type|code|indicator|flag|category|level)/i;

			(async () => {
				try {
					// Query A: Find bridge endpoints
					const bridgeResult = await session.run(`
						MATCH (c:Class)
						WHERE NOT c:ConceptScheme
						AND (any(lbl IN COALESCE(c.label, []) WHERE lbl =~ $classPattern)
						     OR c.notation =~ $classPattern)
						WITH c LIMIT 1

						// Properties FROM other classes whose range is this connection
						OPTIONAL MATCH (p1:Property)-[:rangeIncludes]->(c)
						OPTIONAL MATCH (p1)-[:domainIncludes]->(source:Class)
						WHERE NOT source:ConceptScheme

						WITH c, collect(DISTINCT {className: source.label, uri: source.uri, viaProperty: p1.label, direction: 'incoming'}) AS fromEndpoints

						// Properties OF this connection whose range is another class
						OPTIONAL MATCH (p2:Property)-[:domainIncludes]->(c)
						OPTIONAL MATCH (p2)-[:rangeIncludes]->(target:Class)
						WHERE NOT target:ConceptScheme AND target <> c

						RETURN c.label AS className, c.uri AS uri,
						       fromEndpoints,
						       collect(DISTINCT {className: target.label, uri: target.uri, viaProperty: p2.label, direction: 'outgoing'}) AS toEndpoints
					`, { classPattern });

					if (bridgeResult.records.length === 0) {
						const result = {
							action: 'connectionAnalysis',
							success: false,
							error: `No class found matching "${className}"`
						};
						callback(null, formatOutput(result, format));
						return;
					}

					const record = bridgeResult.records[0];
					const resolvedClassName = formatLabel(record.get('className'));
					const classUri = record.get('uri');

					// Filter out null entries from optional matches
					const fromEndpoints = record.get('fromEndpoints')
						.filter(ep => ep.className)
						.map(ep => ({
							className: formatLabel(ep.className),
							uri: ep.uri,
							viaProperty: formatLabel(ep.viaProperty),
							direction: ep.direction
						}));

					const toEndpoints = record.get('toEndpoints')
						.filter(ep => ep.className)
						.map(ep => ({
							className: formatLabel(ep.className),
							uri: ep.uri,
							viaProperty: formatLabel(ep.viaProperty),
							direction: ep.direction
						}));

					// Query B: Properties with categorization
					const propResult = await session.run(`
						MATCH (c:Class)
						WHERE NOT c:ConceptScheme
						AND (any(lbl IN COALESCE(c.label, []) WHERE lbl =~ $classPattern)
						     OR c.notation =~ $classPattern)
						WITH c LIMIT 1
						MATCH (p:Property)-[:domainIncludes]->(c)
						OPTIONAL MATCH (p)-[:rangeIncludes]->(range)
						RETURN p.label AS propLabel, p.notation AS propNotation,
						       range.label AS rangeLabel, range.uri AS rangeUri,
						       range:ConceptScheme AS isOptionSet,
						       range:Class AS isClassRef
						ORDER BY p.label
					`, { classPattern });

					// Categorize properties
					const propertyCategories = { temporal: [], status: [], substantive: [], reference: [] };
					propResult.records.forEach(r => {
						const propLabel = formatLabel(r.get('propLabel'));
						const propNotation = formatLabel(r.get('propNotation'));
						const rangeLabel = formatLabel(r.get('rangeLabel'));
						const isOptionSet = r.get('isOptionSet');
						const isClassRef = r.get('isClassRef');

						const entry = { label: propLabel, notation: propNotation };

						if (isClassRef && !isOptionSet) {
							entry.targetClass = rangeLabel;
							propertyCategories.reference.push(entry);
						} else if (temporalPattern.test(propLabel)) {
							propertyCategories.temporal.push(entry);
						} else if (statusPattern.test(propLabel) && isOptionSet) {
							entry.optionSet = rangeLabel;
							propertyCategories.status.push(entry);
						} else {
							if (isOptionSet) entry.optionSet = rangeLabel;
							propertyCategories.substantive.push(entry);
						}
					});

					// Query C: Hub path
					const hubResult = await session.run(`
						MATCH (c:Class)
						WHERE NOT c:ConceptScheme
						AND (any(lbl IN COALESCE(c.label, []) WHERE lbl =~ $classPattern)
						     OR c.notation =~ $classPattern)
						WITH c LIMIT 1
						OPTIONAL MATCH (person:Class) WHERE any(lbl IN COALESCE(person.label, []) WHERE lbl = 'Person')
						OPTIONAL MATCH (org:Class) WHERE any(lbl IN COALESCE(org.label, []) WHERE lbl = 'Organization')
						OPTIONAL MATCH pPath = shortestPath((person)-[:subClassOf|domainIncludes|rangeIncludes*..6]-(c))
						OPTIONAL MATCH oPath = shortestPath((org)-[:subClassOf|domainIncludes|rangeIncludes*..6]-(c))
						RETURN [n IN nodes(pPath) | n.label] AS personPath,
						       [n IN nodes(oPath) | n.label] AS orgPath
					`, { classPattern });

					let hubPath = [];
					if (hubResult.records.length > 0) {
						const personPath = (hubResult.records[0].get('personPath') || []).map(formatLabel);
						const orgPath = (hubResult.records[0].get('orgPath') || []).map(formatLabel);
						if (personPath.length > 0 && orgPath.length > 0) {
							hubPath = personPath;
						} else if (personPath.length > 0) {
							hubPath = personPath;
						} else if (orgPath.length > 0) {
							hubPath = orgPath;
						}
					}

					// Name parsing
					const nameParsing = parseConnectionName(resolvedClassName);

					const totalProperties = propResult.records.length;
					const temporalCount = propertyCategories.temporal.length;
					const temporalRatio = totalProperties > 0 ? Math.round((temporalCount / totalProperties) * 100) / 100 : 0;

					const resultData = {
						className: resolvedClassName,
						uri: classUri,
						bridgeEndpoints: {
							from: fromEndpoints,
							to: toEndpoints
						},
						hubPath: hubPath,
						propertyCategories: propertyCategories,
						nameParsing: nameParsing,
						propertyCount: totalProperties,
						temporalRatio: temporalRatio
					};

					const result = {
						action: 'connectionAnalysis',
						success: true,
						data: resultData,
						formatText: (data) => {
							let output = `\n=== Connection Analysis: ${data.className} ===\n`;
							output += `URI: ${data.uri}\n`;

							output += '\nBRIDGES:\n';
							if (data.bridgeEndpoints.from.length > 0) {
								data.bridgeEndpoints.from.forEach(ep => {
									output += `  ${ep.className} --[${ep.viaProperty}]--> ${data.className}\n`;
								});
							}
							if (data.bridgeEndpoints.to.length > 0) {
								data.bridgeEndpoints.to.forEach(ep => {
									output += `  ${data.className} --[${ep.viaProperty}]--> ${ep.className}\n`;
								});
							}
							if (data.bridgeEndpoints.from.length === 0 && data.bridgeEndpoints.to.length === 0) {
								output += '  (no bridge endpoints found)\n';
							}

							if (data.hubPath.length > 0) {
								output += `\nHUB PATH:\n  ${data.hubPath.join(' -> ')}\n`;
							}

							output += `\nPROPERTIES (${data.propertyCount} total):\n`;
							if (data.propertyCategories.temporal.length > 0) {
								output += `  Temporal (${data.propertyCategories.temporal.length}):  ${data.propertyCategories.temporal.map(p => p.label).join(', ')}\n`;
							}
							if (data.propertyCategories.status.length > 0) {
								output += `  Status (${data.propertyCategories.status.length}):    ${data.propertyCategories.status.map(p => `${p.label}${p.optionSet ? ' [OptionSet]' : ''}`).join(', ')}\n`;
							}
							if (data.propertyCategories.substantive.length > 0) {
								output += `  Substantive (${data.propertyCategories.substantive.length}): ${data.propertyCategories.substantive.map(p => `${p.label}${p.optionSet ? ' [OptionSet]' : ''}`).join(', ')}\n`;
							}
							if (data.propertyCategories.reference.length > 0) {
								output += `  Reference (${data.propertyCategories.reference.length}): ${data.propertyCategories.reference.map(p => `${p.label} -> ${p.targetClass}`).join(', ')}\n`;
							}

							output += '\nNAME PARSING:\n';
							output += `  Verb hint: ${data.nameParsing.verbHint || '(none)'} -> ${data.nameParsing.suggestedVerb || '(none)'}\n`;
							output += `  Entity hints: ${data.nameParsing.entityHints.join(', ') || '(none)'}\n`;
							if (data.nameParsing.domainPrefix) {
								output += `  Domain: ${data.nameParsing.domainPrefix}\n`;
							}

							output += '\n';
							return output;
						}
					};

					callback(null, formatOutput(result, format));
				} catch (err) {
					callback(err);
				} finally {
					await session.close();
				}
			})();
		};

		/**
		 * parseConnectionName — Extract verb hints and entity references from a Connection class name.
		 */
		const parseConnectionName = (className) => {
			const verbHintDictionary = {
				'Enrollment': 'ENROLLED_IN',
				'Employment': 'EMPLOYED_BY',
				'Assignment': 'ASSIGNED_TO',
				'Participation': 'PARTICIPATES_IN',
				'Registration': 'REGISTERED_AT',
				'Certification': 'CERTIFIED_BY',
				'Authorization': 'AUTHORIZED_BY',
				'Accreditation': 'ACCREDITED_BY',
				'Placement': 'PLACED_AT',
				'Referral': 'REFERRED_TO',
				'Transition': 'TRANSITIONED_TO',
				'Membership': 'MEMBER_OF'
			};

			const domainPrefixes = ['K12', 'EL', 'PS', 'AE'];
			const words = className.split(/\s+/);
			let domainPrefix = '';
			const entityHints = [];
			let verbHint = '';
			let suggestedVerb = '';

			// Check for domain prefix
			if (words.length > 0 && domainPrefixes.includes(words[0])) {
				domainPrefix = words[0];
			}

			// Look for verb hint in each word
			for (const word of words) {
				if (verbHintDictionary[word]) {
					verbHint = word;
					suggestedVerb = verbHintDictionary[word];
				} else if (!domainPrefixes.includes(word)) {
					entityHints.push(word);
				}
			}

			// Fallback: if no verb hint found, use last word or HAS_ prefix
			if (!suggestedVerb) {
				const nameAsSnake = className.replace(/\s+/g, '_').toUpperCase();
				suggestedVerb = `HAS_${nameAsSnake}`;
			}

			return {
				verbHint: verbHint,
				entityHints: entityHints,
				domainPrefix: domainPrefix,
				suggestedVerb: suggestedVerb
			};
		};

		const helpString = require('./lib/help-string')({ switchName, employerModuleName }).getResult();
		const toolSelector = require('./lib/tool-selector')({ switchName, employerModuleName }).getResult();
		const listingString = require('./lib/help-string')({ switchName, employerModuleName }).getListing();

		const toolMetadata = toolMetadataGenerator()
			.category('kg-namer')
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
