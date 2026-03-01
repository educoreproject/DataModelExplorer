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

		const switchName = 'nameSuggest';

		// Verb hint dictionary — maps noun forms found in CEDS class names to UPPER_SNAKE_CASE verbs
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

		// Temporal/status label patterns for property categorization
		const temporalPattern = /(?:date|time|year|month|day|duration|period|start|end|entry|exit|begin|expire)/i;
		const statusPattern = /(?:status|type|code|indicator|flag|category|level)/i;

		/**
		 * runConnectionAnalysis — Execute connectionAnalysis internally for a single class.
		 * Returns the structured analysis data.
		 */
		const runConnectionAnalysis = async (session, classPattern, formatLabel) => {
			// Bridge endpoints query
			const bridgeResult = await session.run(`
				MATCH (c:Class)
				WHERE NOT c:ConceptScheme
				AND (any(lbl IN COALESCE(c.label, []) WHERE lbl =~ $classPattern)
				     OR c.notation =~ $classPattern)
				WITH c LIMIT 1

				OPTIONAL MATCH (p1:Property)-[:rangeIncludes]->(c)
				OPTIONAL MATCH (p1)-[:domainIncludes]->(source:Class)
				WHERE NOT source:ConceptScheme

				WITH c, collect(DISTINCT {className: source.label, uri: source.uri, viaProperty: p1.label, direction: 'incoming'}) AS fromEndpoints

				OPTIONAL MATCH (p2:Property)-[:domainIncludes]->(c)
				OPTIONAL MATCH (p2)-[:rangeIncludes]->(target:Class)
				WHERE NOT target:ConceptScheme AND target <> c

				RETURN c.label AS className, c.uri AS uri,
				       fromEndpoints,
				       collect(DISTINCT {className: target.label, uri: target.uri, viaProperty: p2.label, direction: 'outgoing'}) AS toEndpoints
			`, { classPattern });

			if (bridgeResult.records.length === 0) {
				return null;
			}

			const record = bridgeResult.records[0];
			const resolvedClassName = formatLabel(record.get('className'));
			const classUri = record.get('uri');

			const fromEndpoints = record.get('fromEndpoints')
				.filter(ep => ep.className)
				.map(ep => ({
					className: formatLabel(ep.className),
					viaProperty: formatLabel(ep.viaProperty),
					direction: ep.direction
				}));

			const toEndpoints = record.get('toEndpoints')
				.filter(ep => ep.className)
				.map(ep => ({
					className: formatLabel(ep.className),
					viaProperty: formatLabel(ep.viaProperty),
					direction: ep.direction
				}));

			// Property query
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
			const included = [];
			const optional = [];
			const excluded = [];

			propResult.records.forEach(r => {
				const propLabel = formatLabel(r.get('propLabel'));
				const propNotation = formatLabel(r.get('propNotation'));
				const rangeLabel = formatLabel(r.get('rangeLabel'));
				const isOptionSet = r.get('isOptionSet');
				const isClassRef = r.get('isClassRef');

				if (isClassRef && !isOptionSet) {
					excluded.push({ label: propLabel, category: 'reference', reason: `Becomes the target node (${rangeLabel}), not a relationship property` });
				} else if (temporalPattern.test(propLabel)) {
					included.push({ label: propLabel, category: 'temporal' });
				} else if (statusPattern.test(propLabel) && isOptionSet) {
					included.push({ label: propLabel, category: 'status' });
				} else {
					optional.push({ label: propLabel, category: 'substantive' });
				}
			});

			return {
				className: resolvedClassName,
				uri: classUri,
				fromEndpoints,
				toEndpoints,
				properties: { included, optional, excluded }
			};
		};

		/**
		 * buildSuggestion — Given analysis data, propose a relationship name.
		 */
		const buildSuggestion = (analysisData) => {
			const { className, fromEndpoints, toEndpoints, properties } = analysisData;

			// Parse verb hint
			const words = className.split(/\s+/);
			let verbHint = '';
			let suggestedRelationship = '';
			for (const word of words) {
				if (verbHintDictionary[word]) {
					verbHint = word;
					suggestedRelationship = verbHintDictionary[word];
					break;
				}
			}

			// Fallback
			if (!suggestedRelationship) {
				suggestedRelationship = `HAS_${className.replace(/\s+/g, '_').toUpperCase()}`;
			}

			// Determine from/to
			const fromClass = fromEndpoints.length > 0 ? fromEndpoints[0].className : '(unknown)';
			const toClass = toEndpoints.length > 0 ? toEndpoints[0].className : '(unknown)';

			// Confidence
			const hasVerbHint = !!verbHint;
			const hasClearBridge = fromEndpoints.length > 0 && toEndpoints.length > 0;
			let confidence = 'low';
			if (hasVerbHint && hasClearBridge) confidence = 'high';
			else if (hasVerbHint || hasClearBridge) confidence = 'medium';

			// Generate alternatives
			const alternatives = generateAlternatives(className, suggestedRelationship);

			return {
				className: className,
				suggestion: {
					relationship: suggestedRelationship,
					from: fromClass,
					to: toClass,
					confidence: confidence,
					verbHintSource: verbHint || null,
					properties: properties
				},
				alternatives: alternatives
			};
		};

		/**
		 * generateAlternatives — Propose alternative relationship names.
		 */
		const generateAlternatives = (className, primarySuggestion) => {
			const alternatives = [];
			const words = className.split(/\s+/);
			const domainPrefixes = ['K12', 'EL', 'PS', 'AE'];
			const contentWords = words.filter(w => !domainPrefixes.includes(w));

			// If it has a domain prefix, suggest without it
			if (words.length > contentWords.length) {
				const withoutPrefix = contentWords.join('_').toUpperCase();
				const alt = `HAS_${withoutPrefix}`;
				if (alt !== primarySuggestion) {
					alternatives.push({ relationship: alt, rationale: 'Without domain prefix' });
				}
			}

			return alternatives;
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

			const neo4j = require('neo4j-driver');
			const { formatLabel, regexEscape } = require('../../../../lib/ceds-utils');
			const { buildPattern } = require('../../../../lib/common-queries');
			const { formatOutput, resolveFormat } = require('../../../../lib/output-formatter');
			const format = resolveFormat(commandLineParameters);

			const allConnections = commandLineParameters.switches['all-connections'] || commandLineParameters.switches.allConnections;
			const classificationPath = commandLineParameters.values &&
				commandLineParameters.values.classification &&
				commandLineParameters.values.classification[0];

			const className = commandLineParameters.fileList && commandLineParameters.fileList[0];

			if (!className && !allConnections) {
				return callback(null, 'Usage: ceds2 -nameSuggest "ClassName" [--all-connections --classification=path]');
			}

			(async () => {
				const session = cedsNeo4jDriver.session();
				try {
					if (allConnections && classificationPath) {
						// Batch mode: process all connections from classification artifact
						let classification;
						try {
							const rawData = fs.readFileSync(path.resolve(classificationPath), 'utf8');
							classification = JSON.parse(rawData);
						} catch (readErr) {
							const result = {
								action: 'nameSuggest',
								success: false,
								error: `Failed to read classification artifact: ${readErr.message}`
							};
							callback(null, formatOutput(result, format));
							return;
						}

						const connectionClasses = Object.entries(classification.classifications || {})
							.filter(([, info]) => info.bucket === 'connection')
							.map(([name]) => name);

						const suggestions = [];
						for (const connClassName of connectionClasses) {
							const classPattern = buildPattern(connClassName);
							const analysisData = await runConnectionAnalysis(session, classPattern, formatLabel);
							if (analysisData) {
								suggestions.push(buildSuggestion(analysisData));
							}
						}

						const result = {
							action: 'nameSuggest',
							success: true,
							data: {
								mode: 'batch',
								totalConnections: connectionClasses.length,
								suggestionsGenerated: suggestions.length,
								suggestions: suggestions
							},
							formatText: (data) => {
								let output = `\n=== Name Suggestions (batch: ${data.suggestionsGenerated}/${data.totalConnections} connections) ===\n\n`;
								data.suggestions.forEach(s => {
									output += `${s.className}: ${s.suggestion.from} -[${s.suggestion.relationship}]-> ${s.suggestion.to} (${s.suggestion.confidence})\n`;
								});
								output += '\n';
								return output;
							}
						};
						callback(null, formatOutput(result, format));
					} else {
						// Single mode
						const classPattern = buildPattern(className);
						const analysisData = await runConnectionAnalysis(session, classPattern, formatLabel);

						if (!analysisData) {
							const result = {
								action: 'nameSuggest',
								success: false,
								error: `No class found matching "${className}"`
							};
							callback(null, formatOutput(result, format));
							return;
						}

						const suggestion = buildSuggestion(analysisData);

						const result = {
							action: 'nameSuggest',
							success: true,
							data: suggestion,
							formatText: (data) => {
								let output = `\n=== Name Suggestion: ${data.className} ===\n\n`;
								output += `PROPOSED: ${data.suggestion.from} -[${data.suggestion.relationship}]-> ${data.suggestion.to}\n`;
								output += `  Confidence: ${data.suggestion.confidence.toUpperCase()}`;
								if (data.suggestion.verbHintSource) {
									output += ` (verb hint "${data.suggestion.verbHintSource}")`;
								}
								output += '\n';

								output += '\nPROPERTIES ON RELATIONSHIP:\n';
								if (data.suggestion.properties.included.length > 0) {
									output += '  Included:\n';
									data.suggestion.properties.included.forEach(p => {
										output += `    ${p.label} (${p.category})\n`;
									});
								}
								if (data.suggestion.properties.optional.length > 0) {
									output += '  Optional (practitioner decides):\n';
									data.suggestion.properties.optional.forEach(p => {
										output += `    ${p.label} (${p.category})\n`;
									});
								}
								if (data.suggestion.properties.excluded.length > 0) {
									output += '  Excluded:\n';
									data.suggestion.properties.excluded.forEach(p => {
										output += `    ${p.label} (${p.category} -> ${p.reason})\n`;
									});
								}

								if (data.alternatives.length > 0) {
									output += '\nALTERNATIVES:\n';
									data.alternatives.forEach(a => {
										output += `  - ${a.relationship} (${a.rationale})\n`;
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
