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

		const switchName = 'schemaUpload';

		/**
		 * detectFormat — Auto-detect file format from extension and content.
		 */
		const detectFormat = (filePath, content) => {
			const ext = path.extname(filePath).toLowerCase();
			if (ext === '.json') return 'json';
			if (ext === '.csv') return 'csv';
			if (ext === '.txt') return 'text';

			// Try JSON parse
			try {
				JSON.parse(content);
				return 'json';
			} catch (e) {
				// Not JSON
			}

			// Check for CSV-like content (commas in most lines)
			const lines = content.split('\n').filter(l => l.trim());
			const commaLines = lines.filter(l => l.includes(','));
			if (commaLines.length > lines.length * 0.5) return 'csv';

			return 'text';
		};

		/**
		 * parseJsonSchema — Extract vocabulary from JSON format.
		 */
		const parseJsonSchema = (data) => {
			const vocabulary = { entityNames: [], relationshipNames: [], fieldNames: [] };

			const extractNames = (arr) => {
				if (!Array.isArray(arr)) return [];
				return arr.map(item => {
					if (typeof item === 'string') return item;
					if (item && item.name) return item.name;
					return null;
				}).filter(Boolean);
			};

			// Support various key names
			const entityKeys = ['entities', 'entity', 'nodes', 'tables', 'classes'];
			const relKeys = ['relationships', 'relationship', 'relations', 'edges', 'links'];
			const fieldKeys = ['fields', 'field', 'properties', 'columns', 'attributes'];

			entityKeys.forEach(key => {
				if (data[key]) vocabulary.entityNames.push(...extractNames(data[key]));
			});
			relKeys.forEach(key => {
				if (data[key]) vocabulary.relationshipNames.push(...extractNames(data[key]));
			});
			fieldKeys.forEach(key => {
				if (data[key]) vocabulary.fieldNames.push(...extractNames(data[key]));
			});

			return vocabulary;
		};

		/**
		 * parseCsvSchema — Extract vocabulary from CSV format.
		 */
		const parseCsvSchema = (content) => {
			const vocabulary = { entityNames: [], relationshipNames: [], fieldNames: [] };
			const lines = content.split('\n').filter(l => l.trim());

			// Skip header if present
			const startIdx = (lines[0] && /^type/i.test(lines[0].trim())) ? 1 : 0;

			for (let i = startIdx; i < lines.length; i++) {
				const parts = lines[i].split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
				if (parts.length < 2) continue;

				const typePart = parts[0].toLowerCase();
				const namePart = parts[1];

				if (/entity|table|node|class/i.test(typePart)) {
					vocabulary.entityNames.push(namePart);
				} else if (/relationship|relation|edge|link/i.test(typePart)) {
					vocabulary.relationshipNames.push(namePart);
				} else if (/field|property|column|attribute/i.test(typePart)) {
					vocabulary.fieldNames.push(namePart);
				} else {
					// Default to field if type is unclear
					vocabulary.fieldNames.push(namePart);
				}
			}

			return vocabulary;
		};

		/**
		 * parseTextSchema — Extract vocabulary from plain text format.
		 */
		const parseTextSchema = (content) => {
			const vocabulary = { entityNames: [], relationshipNames: [], fieldNames: [] };
			const lines = content.split('\n').filter(l => l.trim());

			lines.forEach(line => {
				const trimmed = line.trim();
				if (trimmed.startsWith('entity:')) {
					vocabulary.entityNames.push(trimmed.replace(/^entity:\s*/, ''));
				} else if (trimmed.startsWith('relationship:')) {
					vocabulary.relationshipNames.push(trimmed.replace(/^relationship:\s*/, ''));
				} else if (trimmed.startsWith('field:')) {
					vocabulary.fieldNames.push(trimmed.replace(/^field:\s*/, ''));
				} else {
					// No prefix: add to fields as default
					vocabulary.fieldNames.push(trimmed);
				}
			});

			return vocabulary;
		};

		/**
		 * fuzzyMatch — Case-insensitive partial match between user term and CEDS label.
		 */
		const fuzzyMatch = (userTerm, cedsLabel) => {
			const userLower = userTerm.toLowerCase().replace(/[_\s-]+/g, '');
			const cedsLower = cedsLabel.toLowerCase().replace(/[_\s-]+/g, '');
			return cedsLower.includes(userLower) || userLower.includes(cedsLower);
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
			const { formatOutput, resolveFormat } = require('../../../../lib/output-formatter');
			const format = resolveFormat(commandLineParameters);

			const filePath = commandLineParameters.fileList && commandLineParameters.fileList[0];
			if (!filePath) {
				return callback(null, 'Usage: ceds2 -schemaUpload "path/to/schema-file"');
			}

			const forcedFormat = commandLineParameters.values &&
				commandLineParameters.values['format-type'] &&
				commandLineParameters.values['format-type'][0];

			// Read the file
			let content;
			try {
				content = fs.readFileSync(path.resolve(filePath), 'utf8');
			} catch (readErr) {
				const result = {
					action: 'schemaUpload',
					success: false,
					error: `Failed to read file: ${readErr.message}`
				};
				return callback(null, formatOutput(result, format));
			}

			// Detect or force format
			const detectedFormat = forcedFormat || detectFormat(filePath, content);

			// Parse vocabulary
			let vocabulary;
			try {
				switch (detectedFormat) {
					case 'json':
						vocabulary = parseJsonSchema(JSON.parse(content));
						break;
					case 'csv':
						vocabulary = parseCsvSchema(content);
						break;
					case 'text':
					default:
						vocabulary = parseTextSchema(content);
						break;
				}
			} catch (parseErr) {
				const result = {
					action: 'schemaUpload',
					success: false,
					error: `Failed to parse ${detectedFormat} file: ${parseErr.message}`
				};
				return callback(null, formatOutput(result, format));
			}

			const termCount = vocabulary.entityNames.length +
				vocabulary.relationshipNames.length +
				vocabulary.fieldNames.length;

			(async () => {
				let matchPotential = {
					cedsClassesWithMatch: 0,
					cedsClassesWithoutMatch: 0,
					unmatchedUserTerms: []
				};

				// Calculate match potential if Neo4j is available
				if (cedsNeo4jDriver) {
					const session = cedsNeo4jDriver.session();
					try {
						const cedsResult = await session.run(
							'MATCH (c:Class) WHERE NOT c:ConceptScheme RETURN c.label AS label, c.uri AS uri'
						);

						const allTerms = [...vocabulary.entityNames, ...vocabulary.relationshipNames, ...vocabulary.fieldNames];
						let matchedClasses = 0;
						let unmatchedClasses = 0;

						cedsResult.records.forEach(r => {
							const cedsLabel = r.get('label');
							const labelStr = Array.isArray(cedsLabel) ? cedsLabel[0] : cedsLabel;
							if (!labelStr) return;

							const hasMatch = allTerms.some(term => fuzzyMatch(term, labelStr));
							if (hasMatch) matchedClasses++;
							else unmatchedClasses++;
						});

						// Find user terms that have no CEDS match
						const cedsLabels = cedsResult.records.map(r => {
							const lbl = r.get('label');
							return Array.isArray(lbl) ? lbl[0] : lbl;
						}).filter(Boolean);

						const unmatchedUserTerms = allTerms.filter(term =>
							!cedsLabels.some(lbl => fuzzyMatch(term, lbl))
						);

						matchPotential = {
							cedsClassesWithMatch: matchedClasses,
							cedsClassesWithoutMatch: unmatchedClasses,
							unmatchedUserTerms: unmatchedUserTerms
						};
					} catch (queryErr) {
						// Non-fatal
					} finally {
						await session.close();
					}
				}

				const resultData = {
					inputPath: path.resolve(filePath),
					format: detectedFormat,
					vocabulary: vocabulary,
					termCount: termCount,
					matchPotential: matchPotential
				};

				const result = {
					action: 'schemaUpload',
					success: true,
					data: resultData,
					formatText: (data) => {
						let output = `\n=== Schema Upload ===\n`;
						output += `File: ${data.inputPath} (${data.format} format)\n`;
						output += `Vocabulary: ${data.vocabulary.entityNames.length} entity names, ${data.vocabulary.relationshipNames.length} relationship names, ${data.vocabulary.fieldNames.length} field names\n`;

						output += '\nMATCH POTENTIAL:\n';
						output += `  ${data.matchPotential.cedsClassesWithMatch} CEDS classes have vocabulary matches\n`;
						output += `  ${data.matchPotential.cedsClassesWithoutMatch} CEDS classes have no match (will use CEDS-derived names)\n`;
						if (data.matchPotential.unmatchedUserTerms.length > 0) {
							output += `  ${data.matchPotential.unmatchedUserTerms.length} user terms have no CEDS match: ${data.matchPotential.unmatchedUserTerms.join(', ')}\n`;
						}

						output += '\n';
						return output;
					}
				};

				callback(null, formatOutput(result, format));
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
