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

		const switchName = 'thingNameSuggest';

		// Domain prefixes commonly found in CEDS class names
		const domainPrefixes = ['K12', 'EL', 'PS', 'AE'];

		// Common synonym dictionary for Thing classes
		const synonymDictionary = {
			'Person': ['Student', 'Learner', 'Participant', 'Individual'],
			'Organization': ['School', 'LEA', 'Institution', 'District', 'Agency'],
			'K12 School': ['School'],
			'K12 Lea': ['District', 'LEA'],
			'EL Child': ['Child', 'Learner'],
			'PS Student': ['Student', 'Learner'],
			'AE Provider': ['Provider', 'Agency'],
			'Course': ['Course', 'Class'],
			'Assessment': ['Assessment', 'Test', 'Exam'],
			'Program': ['Program'],
			'Facility': ['Facility', 'Building', 'Campus'],
			'Credential': ['Credential', 'Certificate'],
			'Competency': ['Competency', 'Standard', 'Skill']
		};

		/**
		 * stripDomainPrefix — Remove K12/EL/PS/AE prefix from a class name.
		 */
		const stripDomainPrefix = (className) => {
			const words = className.split(/\s+/);
			if (words.length > 1 && domainPrefixes.includes(words[0])) {
				return words.slice(1).join(' ');
			}
			return className;
		};

		/**
		 * buildThingSuggestion — Generate a name suggestion for a Thing class.
		 */
		const buildThingSuggestion = (className, classUri, classDescription, vocabulary) => {
			const stripped = stripDomainPrefix(className);

			// Check vocabulary match first
			let source = 'ceds-derived';
			let localName = stripped;
			let confidence = 'medium';
			let rationale = `Simplified from CEDS name "${className}"`;

			if (vocabulary && vocabulary.entityNames) {
				const vocabMatch = vocabulary.entityNames.find(term => {
					const termLower = term.toLowerCase().replace(/[_\s-]+/g, '');
					const strippedLower = stripped.toLowerCase().replace(/[_\s-]+/g, '');
					return termLower === strippedLower ||
						strippedLower.includes(termLower) ||
						termLower.includes(strippedLower);
				});
				if (vocabMatch) {
					localName = vocabMatch;
					source = 'vocabulary-match';
					confidence = 'high';
					rationale = `User vocabulary contains "${vocabMatch}" which maps to CEDS ${className}`;
				}
			}

			// Build alternatives
			const alternatives = [];

			// Add synonym-based alternatives
			const synonymKey = Object.keys(synonymDictionary).find(key =>
				key.toLowerCase() === className.toLowerCase() ||
				key.toLowerCase() === stripped.toLowerCase()
			);
			if (synonymKey) {
				synonymDictionary[synonymKey].forEach(syn => {
					if (syn !== localName) {
						alternatives.push({
							localName: syn,
							rationale: `Common synonym for ${className}`
						});
					}
				});
			}

			// Add the unchanged CEDS name as an option
			if (localName !== className) {
				alternatives.push({
					localName: className,
					rationale: 'Keep CEDS name unchanged'
				});
			}

			// Add stripped name if different from localName
			if (stripped !== localName && stripped !== className) {
				alternatives.push({
					localName: stripped,
					rationale: 'CEDS name with domain prefix removed'
				});
			}

			return {
				className: className,
				uri: classUri,
				suggestion: {
					localName: localName,
					confidence: confidence,
					source: source,
					rationale: rationale
				},
				alternatives: alternatives
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

			const allThings = commandLineParameters.switches['all-things'] || commandLineParameters.switches.allThings;
			const classificationPath = commandLineParameters.values &&
				commandLineParameters.values.classification &&
				commandLineParameters.values.classification[0];
			const vocabularyPath = commandLineParameters.values &&
				commandLineParameters.values.vocabulary &&
				commandLineParameters.values.vocabulary[0];

			const className = commandLineParameters.fileList && commandLineParameters.fileList[0];

			if (!className && !allThings) {
				return callback(null, 'Usage: ceds2 -thingNameSuggest "ClassName" [--all-things --classification=path]');
			}

			// Load vocabulary if provided
			let vocabulary = null;
			if (vocabularyPath) {
				try {
					vocabulary = JSON.parse(fs.readFileSync(path.resolve(vocabularyPath), 'utf8'));
				} catch (vocabErr) {
					// Non-fatal — proceed without vocabulary
				}
			}

			(async () => {
				const session = cedsNeo4jDriver.session();
				try {
					if (allThings && classificationPath) {
						// Batch mode
						let classification;
						try {
							classification = JSON.parse(fs.readFileSync(path.resolve(classificationPath), 'utf8'));
						} catch (readErr) {
							const result = {
								action: 'thingNameSuggest',
								success: false,
								error: `Failed to read classification artifact: ${readErr.message}`
							};
							callback(null, formatOutput(result, format));
							return;
						}

						const thingClasses = Object.entries(classification.classifications || {})
							.filter(([, info]) => info.bucket === 'thing')
							.map(([name]) => name);

						const suggestions = [];
						for (const thingClassName of thingClasses) {
							const classPattern = buildPattern(thingClassName);
							const classResult = await session.run(`
								MATCH (c:Class)
								WHERE NOT c:ConceptScheme
								AND (any(lbl IN COALESCE(c.label, []) WHERE lbl =~ $classPattern)
								     OR c.notation =~ $classPattern)
								RETURN c.label AS label, c.uri AS uri, COALESCE(c.description, c.comment, '') AS description
								LIMIT 1
							`, { classPattern });

							if (classResult.records.length > 0) {
								const rec = classResult.records[0];
								suggestions.push(buildThingSuggestion(
									formatLabel(rec.get('label')),
									rec.get('uri'),
									rec.get('description'),
									vocabulary
								));
							}
						}

						const result = {
							action: 'thingNameSuggest',
							success: true,
							data: {
								mode: 'batch',
								totalThings: thingClasses.length,
								suggestionsGenerated: suggestions.length,
								suggestions: suggestions
							},
							formatText: (data) => {
								let output = `\n=== Thing Name Suggestions (batch: ${data.suggestionsGenerated}/${data.totalThings} things) ===\n\n`;
								data.suggestions.forEach(s => {
									output += `${s.className} -> ${s.suggestion.localName} (${s.suggestion.confidence}, ${s.suggestion.source})\n`;
								});
								output += '\n';
								return output;
							}
						};
						callback(null, formatOutput(result, format));
					} else {
						// Single mode
						const classPattern = buildPattern(className);
						const classResult = await session.run(`
							MATCH (c:Class)
							WHERE NOT c:ConceptScheme
							AND (any(lbl IN COALESCE(c.label, []) WHERE lbl =~ $classPattern)
							     OR c.notation =~ $classPattern)
							RETURN c.label AS label, c.uri AS uri, COALESCE(c.description, c.comment, '') AS description
							LIMIT 1
						`, { classPattern });

						if (classResult.records.length === 0) {
							const result = {
								action: 'thingNameSuggest',
								success: false,
								error: `No class found matching "${className}"`
							};
							callback(null, formatOutput(result, format));
							return;
						}

						const rec = classResult.records[0];
						const suggestion = buildThingSuggestion(
							formatLabel(rec.get('label')),
							rec.get('uri'),
							rec.get('description'),
							vocabulary
						);

						const result = {
							action: 'thingNameSuggest',
							success: true,
							data: suggestion,
							formatText: (data) => {
								let output = `\n=== Thing Name Suggestion: ${data.className} ===\n\n`;
								output += `PROPOSED: ${data.className} -> ${data.suggestion.localName}\n`;
								output += `  Confidence: ${data.suggestion.confidence.toUpperCase()} (${data.suggestion.source})\n`;
								output += `  Rationale: ${data.suggestion.rationale}\n`;

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
