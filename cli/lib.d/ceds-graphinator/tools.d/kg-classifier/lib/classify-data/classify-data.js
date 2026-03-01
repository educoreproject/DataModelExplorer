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

		const switchName = 'classifyData';

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
			const { formatLabel } = require('../../../../lib/ceds-utils');
			const { formatOutput, resolveFormat } = require('../../../../lib/output-formatter');

			const domainFilter =
				commandLineParameters.values &&
				commandLineParameters.values.domain &&
				commandLineParameters.values.domain[0];

			const includeOptionSets = !!(commandLineParameters.switches && commandLineParameters.switches.includeOptionSets);

			const format = resolveFormat(commandLineParameters);

			const session = cedsNeo4jDriver.session();

			(async () => {
				try {
					// ----------------------------------------------------------------
					// Query A: Basic class info + property count
					// ----------------------------------------------------------------
					const queryA = `
						MATCH (c:Class)
						${includeOptionSets ? '' : 'WHERE NOT c:ConceptScheme'}
						OPTIONAL MATCH (p:Property)-[:domainIncludes]->(c)
						RETURN c.label AS className, c.uri AS uri,
							   COALESCE(c.description, c.comment, '') AS cedsDescription,
							   count(DISTINCT p) AS propertyCount
						ORDER BY c.label
					`;
					const resultA = await session.run(queryA);

					// Build base metrics map keyed by URI
					const metricsMap = {};
					resultA.records.forEach((r) => {
						const uri = r.get('uri');
						const className = formatLabel(r.get('className'));
						const propertyCount =
							typeof r.get('propertyCount') === 'object'
								? r.get('propertyCount').toNumber()
								: Number(r.get('propertyCount'));

						metricsMap[uri] = {
							className,
							uri,
							cedsDescription: r.get('cedsDescription') || '',
							propertyCount,
							degree: 0,
							hubConnectivity: 0,
							temporalRatio: 0.0,
							subtreeDepth: 0,
							nameSignals: [],
							domainPrefix: '',
						};
					});

					// ----------------------------------------------------------------
					// Query B: Degree (class-to-class connections via properties)
					// ----------------------------------------------------------------
					const queryB = `
						MATCH (c:Class)
						${includeOptionSets ? '' : 'WHERE NOT c:ConceptScheme'}
						OPTIONAL MATCH (p:Property)-[:domainIncludes]->(c)
						OPTIONAL MATCH (p)-[:rangeIncludes]->(target:Class)
						WHERE NOT target:ConceptScheme AND target <> c
						WITH c, count(DISTINCT target) AS outDegree
						OPTIONAL MATCH (p2:Property)-[:rangeIncludes]->(c)
						OPTIONAL MATCH (p2)-[:domainIncludes]->(source:Class)
						WHERE NOT source:ConceptScheme AND source <> c
						RETURN c.uri AS uri, outDegree + count(DISTINCT source) AS degree
					`;
					const resultB = await session.run(queryB);
					resultB.records.forEach((r) => {
						const uri = r.get('uri');
						if (metricsMap[uri]) {
							const degree =
								typeof r.get('degree') === 'object'
									? r.get('degree').toNumber()
									: Number(r.get('degree'));
							metricsMap[uri].degree = degree;
						}
					});

					// ----------------------------------------------------------------
					// Query C: Hub connectivity
					// For each hub, find classes reachable within 2 property hops
					// ----------------------------------------------------------------
					const hubLabels = ['Person', 'Membership', 'Organization'];

					for (const hubLabel of hubLabels) {
						const queryC = `
							MATCH (hub:Class)
							WHERE any(lbl IN COALESCE(hub.label, []) WHERE lbl = $hubLabel)
							WITH hub
							MATCH (c:Class)
							${includeOptionSets ? '' : 'WHERE NOT c:ConceptScheme'}
							WITH hub, c
							WHERE c <> hub AND (
								EXISTS {
									MATCH (p:Property)-[:domainIncludes]->(hub)
									MATCH (p)-[:rangeIncludes]->(c)
								}
								OR EXISTS {
									MATCH (p:Property)-[:domainIncludes]->(c)
									MATCH (p)-[:rangeIncludes]->(hub)
								}
								OR EXISTS {
									MATCH (p1:Property)-[:domainIncludes]->(hub)
									MATCH (p1)-[:rangeIncludes]->(mid:Class)
									MATCH (p2:Property)-[:domainIncludes]->(mid)
									MATCH (p2)-[:rangeIncludes]->(c)
									WHERE mid <> c AND mid <> hub
								}
								OR EXISTS {
									MATCH (p1:Property)-[:domainIncludes]->(c)
									MATCH (p1)-[:rangeIncludes]->(mid:Class)
									MATCH (p2:Property)-[:domainIncludes]->(mid)
									MATCH (p2)-[:rangeIncludes]->(hub)
									WHERE mid <> c AND mid <> hub
								}
								OR EXISTS {
									MATCH (p1:Property)-[:rangeIncludes]->(hub)
									MATCH (p1)-[:domainIncludes]->(mid:Class)
									MATCH (p2:Property)-[:domainIncludes]->(mid)
									MATCH (p2)-[:rangeIncludes]->(c)
									WHERE mid <> c AND mid <> hub
								}
								OR EXISTS {
									MATCH (p1:Property)-[:rangeIncludes]->(c)
									MATCH (p1)-[:domainIncludes]->(mid:Class)
									MATCH (p2:Property)-[:domainIncludes]->(mid)
									MATCH (p2)-[:rangeIncludes]->(hub)
									WHERE mid <> c AND mid <> hub
								}
							)
							RETURN c.uri AS uri
						`;
						const resultC = await session.run(queryC, { hubLabel });
						resultC.records.forEach((r) => {
							const uri = r.get('uri');
							if (metricsMap[uri]) {
								metricsMap[uri].hubConnectivity += 1;
							}
						});

						// Also mark the hub itself as reachable from all 3 (itself counts)
						for (const entry of Object.values(metricsMap)) {
							if (entry.className === hubLabel) {
								entry.hubConnectivity += 1;
							}
						}
					}

					// ----------------------------------------------------------------
					// Query D: Temporal ratio
					// ----------------------------------------------------------------
					const queryD = `
						MATCH (c:Class)
						${includeOptionSets ? '' : 'WHERE NOT c:ConceptScheme'}
						OPTIONAL MATCH (p:Property)-[:domainIncludes]->(c)
						WITH c, count(p) AS totalProps,
							 size([p IN collect(p) WHERE
							   any(lbl IN COALESCE(p.label, []) WHERE
								 lbl =~ '(?i).*(date|time|year|month|day|duration|period|start|end|entry|exit|begin|expire).*'
							   )
							 ]) AS temporalProps
						RETURN c.uri AS uri,
							   CASE WHEN totalProps > 0 THEN toFloat(temporalProps) / totalProps ELSE 0.0 END AS temporalRatio
					`;
					const resultD = await session.run(queryD);
					resultD.records.forEach((r) => {
						const uri = r.get('uri');
						if (metricsMap[uri]) {
							metricsMap[uri].temporalRatio = parseFloat(Number(r.get('temporalRatio')).toFixed(2));
						}
					});

					// ----------------------------------------------------------------
					// Query E: Subtree depth
					// ----------------------------------------------------------------
					const queryE = `
						MATCH (c:Class)
						${includeOptionSets ? '' : 'WHERE NOT c:ConceptScheme'}
						OPTIONAL MATCH path = (descendant)-[:subClassOf*1..20]->(c)
						WITH c, COALESCE(max(length(path)), 0) AS subtreeDepth
						RETURN c.uri AS uri, subtreeDepth
					`;
					const resultE = await session.run(queryE);
					resultE.records.forEach((r) => {
						const uri = r.get('uri');
						if (metricsMap[uri]) {
							const depth =
								typeof r.get('subtreeDepth') === 'object'
									? r.get('subtreeDepth').toNumber()
									: Number(r.get('subtreeDepth'));
							metricsMap[uri].subtreeDepth = depth;
						}
					});

					// ----------------------------------------------------------------
					// Name signal extraction (JavaScript, not Cypher)
					// ----------------------------------------------------------------
					const entityNouns = [
						'Person', 'Organization', 'School', 'Course', 'Institution',
						'Assessment', 'Credential', 'Program', 'Facility', 'Staff',
						'Student', 'Teacher',
					];

					const verbHints = [
						'Enrollment', 'Employment', 'Assignment', 'Participation',
						'Registration', 'Certification', 'Authorization', 'Accreditation',
						'Placement', 'Referral', 'Transition',
					];

					const domainPrefixes = [
						'K12', 'EL', 'PS', 'AE', 'Workforce', 'Early', 'Adult', 'Postsecondary',
					];

					const allClassNames = Object.values(metricsMap).map((m) => m.className);

					for (const entry of Object.values(metricsMap)) {
						const name = entry.className;
						const signals = [];

						// entityNoun detection
						for (const noun of entityNouns) {
							if (name.includes(noun)) {
								signals.push('entityNoun');
								break;
							}
						}

						// verbHint detection
						for (const verb of verbHints) {
							if (name.includes(verb)) {
								signals.push(`verbHint:${verb}`);
								break;
							}
						}

						// domainPrefix detection
						let detectedPrefix = '';
						for (const prefix of domainPrefixes) {
							if (name.startsWith(prefix + ' ') || name.startsWith(prefix)) {
								detectedPrefix = prefix;
								signals.push(`domainPrefix:${prefix}`);
								break;
							}
						}
						entry.domainPrefix = detectedPrefix;

						// modifierPattern detection: name is "X Y" where X is another class name
						const words = name.split(' ');
						if (words.length >= 2) {
							const firstWord = words[0];
							if (allClassNames.includes(firstWord) && firstWord !== name) {
								signals.push('modifierPattern');
							}
						}

						entry.nameSignals = signals;
					}

					// ----------------------------------------------------------------
					// Apply domain filter if specified
					// ----------------------------------------------------------------
					let metricsArray = Object.values(metricsMap);

					if (domainFilter) {
						metricsArray = metricsArray.filter(
							(m) => m.domainPrefix.toLowerCase() === domainFilter.toLowerCase(),
						);
					}

					// Sort by className
					metricsArray.sort((a, b) => a.className.localeCompare(b.className));

					// ----------------------------------------------------------------
					// Build result
					// ----------------------------------------------------------------
					const result = {
						action: 'classifyData',
						success: true,
						data: {
							classCount: metricsArray.length,
							domain: domainFilter || null,
							metrics: metricsArray,
						},
						formatText: (data) => {
							let output = `\n=== CEDS Class Structural Metrics (${data.classCount} classes`;
							if (data.domain) output += `, domain: ${data.domain}`;
							output += `) ===\n\n`;

							data.metrics.forEach((m) => {
								output += `${m.className.toUpperCase()}\n`;
								output += `  degree: ${String(m.degree).padEnd(4)}|  hubConn: ${m.hubConnectivity}  |  temporal: ${m.temporalRatio.toFixed(2)}  |  depth: ${String(m.subtreeDepth).padEnd(4)}|  props: ${m.propertyCount}\n`;
								if (m.nameSignals.length > 0) {
									output += `  signals: ${m.nameSignals.join(', ')}\n`;
								}
								if (m.cedsDescription) {
									const truncDesc =
										m.cedsDescription.length > 120
											? m.cedsDescription.substring(0, 117) + '...'
											: m.cedsDescription;
									output += `  ${truncDesc}\n`;
								}
								output += '\n';
							});

							return output;
						},
					};

					callback(null, formatOutput(result, format));
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

		const toolMetadata = toolMetadataGenerator()
			.category('kg-classifier')
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
