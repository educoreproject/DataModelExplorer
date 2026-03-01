#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const fs = require('fs');
const path = require('path');

//START OF moduleFunction() ============================================================
const moduleFunction =
	({ moduleName } = {}) =>
	({ dotD, employerModuleName, passThroughParameters } = {}) => {
		const { xLog, getConfig, commandLineParameters } = process.global;

		const { addToDispatchMap, actionSwitchesList, toolMetadataGenerator } =
			passThroughParameters;

		const switchName = 'detailNameSuggest';

		// Common grouping name dictionary for Detail classes
		const groupNameDictionary = {
			'Birth': 'Demographics',
			'Address': 'ContactInfo',
			'Telephone': 'ContactInfo',
			'Email': 'ContactInfo',
			'Calendar': 'Schedule',
			'Calendar Day': 'Schedule',
			'Status': 'StatusHistory',
			'Identity': 'Identification',
			'Identifier': 'Identification',
			'Demographic': 'Demographics',
			'Language': 'LanguageInfo',
			'Military': 'MilitaryInfo',
			'Disability': 'DisabilityInfo',
			'Health': 'HealthInfo',
			'Financial': 'FinancialInfo',
			'Contact': 'ContactInfo',
			'Performance': 'PerformanceData',
			'Achievement': 'AchievementData',
			'Score': 'ScoreData',
			'Response': 'ResponseData',
			'Session': 'SessionData'
		};

		/**
		 * deriveGroupName — Propose a group name for a Detail class.
		 */
		const deriveGroupName = (className, vocabulary) => {
			// Strip parent entity prefix (e.g., "Person Birth" -> "Birth", "Organization Calendar" -> "Calendar")
			const words = className.split(/\s+/);
			const domainPrefixes = ['K12', 'EL', 'PS', 'AE'];

			// Remove domain prefix if present
			let contentWords = [...words];
			if (contentWords.length > 1 && domainPrefixes.includes(contentWords[0])) {
				contentWords = contentWords.slice(1);
			}

			// Try to find a match in the dictionary using suffixes
			for (let startIdx = 0; startIdx < contentWords.length; startIdx++) {
				const suffix = contentWords.slice(startIdx).join(' ');
				if (groupNameDictionary[suffix]) {
					return {
						localName: groupNameDictionary[suffix],
						source: 'dictionary',
						confidence: 'high',
						rationale: `"${suffix}" commonly grouped as ${groupNameDictionary[suffix]}`
					};
				}
			}

			// Check vocabulary match
			if (vocabulary && vocabulary.fieldNames) {
				const vocabMatch = vocabulary.fieldNames.find(term => {
					const termLower = term.toLowerCase().replace(/[_\s-]+/g, '');
					const classLower = className.toLowerCase().replace(/[_\s-]+/g, '');
					return classLower.includes(termLower) || termLower.includes(classLower);
				});
				if (vocabMatch) {
					return {
						localName: vocabMatch,
						source: 'vocabulary-match',
						confidence: 'medium',
						rationale: `User vocabulary term "${vocabMatch}" matches this Detail`
					};
				}
			}

			// Fallback: use the last meaningful word(s) as PascalCase
			const lastWord = contentWords.length > 1 ? contentWords.slice(-1).join('') : contentWords[0];
			const fallbackName = lastWord + 'Info';
			return {
				localName: fallbackName,
				source: 'name-parsing',
				confidence: 'low',
				rationale: `Derived from class name suffix "${lastWord}"`
			};
		};

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

			const { formatLabel } = require('../../../../lib/ceds-utils');
			const { buildPattern } = require('../../../../lib/common-queries');
			const { formatOutput, resolveFormat } = require('../../../../lib/output-formatter');
			const format = resolveFormat(commandLineParameters);

			const allDetails = commandLineParameters.switches['all-details'] || commandLineParameters.switches.allDetails;
			const classificationPath = commandLineParameters.values &&
				commandLineParameters.values.classification &&
				commandLineParameters.values.classification[0];
			const vocabularyPath = commandLineParameters.values &&
				commandLineParameters.values.vocabulary &&
				commandLineParameters.values.vocabulary[0];

			const className = commandLineParameters.fileList && commandLineParameters.fileList[0];

			if (!className && !allDetails) {
				return callback(null, 'Usage: ceds2 -detailNameSuggest "ClassName" [--all-details --classification=path]');
			}

			// Load vocabulary if provided
			let vocabulary = null;
			if (vocabularyPath) {
				try {
					vocabulary = JSON.parse(fs.readFileSync(path.resolve(vocabularyPath), 'utf8'));
				} catch (vocabErr) {
					// Non-fatal
				}
			}

			/**
			 * processDetail — Analyze a single Detail class and produce a suggestion.
			 */
			const processDetail = async (session, targetClassName) => {
				const classPattern = buildPattern(targetClassName);

				// Query A: Find parent Thing
				const parentResult = await session.run(`
					MATCH (c:Class)
					WHERE NOT c:ConceptScheme
					AND (any(lbl IN COALESCE(c.label, []) WHERE lbl =~ $classPattern)
					     OR c.notation =~ $classPattern)
					WITH c LIMIT 1
					OPTIONAL MATCH (p:Property)-[:rangeIncludes]->(c)
					OPTIONAL MATCH (p)-[:domainIncludes]->(parent:Class)
					WHERE NOT parent:ConceptScheme
					RETURN c.label AS className, c.uri AS uri,
					       collect(DISTINCT {className: parent.label, uri: parent.uri}) AS parentCandidates
				`, { classPattern });

				if (parentResult.records.length === 0) {
					return null;
				}

				const rec = parentResult.records[0];
				const resolvedClassName = formatLabel(rec.get('className'));
				const classUri = rec.get('uri');
				const parentCandidates = rec.get('parentCandidates')
					.filter(p => p.className)
					.map(p => formatLabel(p.className));

				const parentThing = parentCandidates.length > 0 ? parentCandidates[0] : '(unknown)';

				// Query B: Detail's own properties
				const propResult = await session.run(`
					MATCH (c:Class)
					WHERE NOT c:ConceptScheme
					AND (any(lbl IN COALESCE(c.label, []) WHERE lbl =~ $classPattern)
					     OR c.notation =~ $classPattern)
					WITH c LIMIT 1
					MATCH (p:Property)-[:domainIncludes]->(c)
					RETURN p.label AS propLabel, p.notation AS propNotation
					ORDER BY p.label
				`, { classPattern });

				const properties = propResult.records.map(r => ({
					label: formatLabel(r.get('propLabel')),
					notation: formatLabel(r.get('propNotation'))
				}));

				// Derive group name
				const nameResult = deriveGroupName(resolvedClassName, vocabulary);

				// Build alternatives
				const alternatives = [];
				// Add a more literal alternative
				const literalName = resolvedClassName.replace(/\s+/g, '');
				if (literalName !== nameResult.localName) {
					alternatives.push({
						localName: literalName,
						rationale: 'Direct PascalCase from CEDS name'
					});
				}

				return {
					className: resolvedClassName,
					uri: classUri,
					suggestion: {
						localName: nameResult.localName,
						parentThing: parentThing,
						confidence: nameResult.confidence,
						source: nameResult.source,
						rationale: nameResult.rationale
					},
					properties: properties,
					alternatives: alternatives
				};
			};

			(async () => {
				const session = cedsNeo4jDriver.session();
				try {
					if (allDetails && classificationPath) {
						// Batch mode
						let classification;
						try {
							classification = JSON.parse(fs.readFileSync(path.resolve(classificationPath), 'utf8'));
						} catch (readErr) {
							const result = {
								action: 'detailNameSuggest',
								success: false,
								error: `Failed to read classification artifact: ${readErr.message}`
							};
							callback(null, formatOutput(result, format));
							return;
						}

						const detailClasses = Object.entries(classification.classifications || {})
							.filter(([, info]) => info.bucket === 'detail')
							.map(([name]) => name);

						const suggestions = [];
						for (const detailClassName of detailClasses) {
							const suggestion = await processDetail(session, detailClassName);
							if (suggestion) {
								suggestions.push(suggestion);
							}
						}

						const result = {
							action: 'detailNameSuggest',
							success: true,
							data: {
								mode: 'batch',
								totalDetails: detailClasses.length,
								suggestionsGenerated: suggestions.length,
								suggestions: suggestions
							},
							formatText: (data) => {
								let output = `\n=== Detail Name Suggestions (batch: ${data.suggestionsGenerated}/${data.totalDetails} details) ===\n\n`;
								data.suggestions.forEach(s => {
									output += `${s.className} -> ${s.suggestion.localName} (attached to ${s.suggestion.parentThing}, ${s.suggestion.confidence})\n`;
								});
								output += '\n';
								return output;
							}
						};
						callback(null, formatOutput(result, format));
					} else {
						// Single mode
						const suggestion = await processDetail(session, className);

						if (!suggestion) {
							const result = {
								action: 'detailNameSuggest',
								success: false,
								error: `No class found matching "${className}"`
							};
							callback(null, formatOutput(result, format));
							return;
						}

						const result = {
							action: 'detailNameSuggest',
							success: true,
							data: suggestion,
							formatText: (data) => {
								let output = `\n=== Detail Name Suggestion: ${data.className} ===\n\n`;
								output += `PROPOSED: ${data.className} -> ${data.suggestion.localName} (attached to ${data.suggestion.parentThing})\n`;
								output += `  Confidence: ${data.suggestion.confidence.toUpperCase()} (${data.suggestion.source})\n`;
								output += `  Rationale: ${data.suggestion.rationale}\n`;

								if (data.properties.length > 0) {
									output += `  Properties: ${data.properties.map(p => p.label).join(', ')}\n`;
								}

								if (data.alternatives.length > 0) {
									output += '\nALTERNATIVES:\n';
									data.alternatives.forEach(a => {
										output += `  - ${a.localName} (${a.rationale})\n`;
									});
								}

								output += '\n';
								return output;
							}
						};
						callback(null, formatOutput(result, format));
					}
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
