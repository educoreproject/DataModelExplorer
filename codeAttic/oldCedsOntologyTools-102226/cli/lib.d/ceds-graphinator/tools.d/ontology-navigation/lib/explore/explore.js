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

		const switchName = 'explore';

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
				return callback(null, 'Usage: ceds2 -explore "ClassName"');
			}

			const pattern = `(?i).*${regexEscape(className)}.*`;

			(async () => {
				try {
					// Find the class
					const classResult = await session.run(`
						MATCH (c)
						WHERE (c:Class OR (c:Class AND c:ConceptScheme))
						AND (any(lbl IN coalesce(c.label, []) WHERE lbl =~ $pattern)
						     OR c.notation =~ $pattern)
						RETURN c.uri AS uri, c.label AS label, c.notation AS notation,
							COALESCE(c.description, c.comment) AS description,
							labels(c) AS nodeLabels
						LIMIT 5
					`, { pattern });

					if (classResult.records.length === 0) {
						callback(null, `\nNo class found matching "${className}".`);
						return;
					}

					const cls = classResult.records[0];
					const classUri = cls.get('uri');
					const classLabel = formatLabel(cls.get('label'));
					const isOptionSet = cls.get('nodeLabels').includes('ConceptScheme');

					let output = `\n=== ${isOptionSet ? 'Option Set' : 'Class'}: ${classLabel} ===\n`;
					output += `URI: ${classUri}\n`;
					if (cls.get('description')) {
						output += `\n${cls.get('description')}\n`;
					}

					// Get parent classes
					const parentResult = await session.run(`
						MATCH (c {uri: $uri})-[:subClassOf]->(parent)
						RETURN parent.label AS label, parent.uri AS uri
					`, { uri: classUri });

					if (parentResult.records.length > 0) {
						output += '\nPARENT CLASSES:\n';
						parentResult.records.forEach(r => {
							output += `  ${formatLabel(r.get('label'))}\n`;
						});
					}

					// Get child classes
					const childResult = await session.run(`
						MATCH (child)-[:subClassOf]->(c {uri: $uri})
						RETURN child.label AS label, child.uri AS uri
						ORDER BY child.label
						LIMIT 30
					`, { uri: classUri });

					if (childResult.records.length > 0) {
						output += `\nCHILD CLASSES (${childResult.records.length}):\n`;
						childResult.records.forEach(r => {
							output += `  ${formatLabel(r.get('label'))}\n`;
						});
					}

					// Get properties whose domain includes this class
					const propResult = await session.run(`
						MATCH (p:Property)-[:domainIncludes]->(c {uri: $uri})
						OPTIONAL MATCH (p)-[:rangeIncludes]->(range)
						RETURN p.label AS label, p.notation AS notation,
							COALESCE(p.description, '') AS description,
							collect(DISTINCT range.label) AS rangeLabels,
							collect(DISTINCT CASE WHEN range:ConceptScheme THEN range.uri ELSE null END) AS optionSetUris
						ORDER BY p.label
					`, { uri: classUri });

					if (propResult.records.length > 0) {
						output += `\nPROPERTIES (${propResult.records.length}):\n`;
						propResult.records.forEach(r => {
							const propLabel = formatLabel(r.get('label'));
							const desc = r.get('description');
							const ranges = r.get('rangeLabels').filter(Boolean).map(formatLabel);
							const truncDesc = desc && desc.length > 100 ? desc.substring(0, 97) + '...' : desc;

							output += `  ${propLabel}\n`;
							if (ranges.length > 0) output += `    range: ${ranges.join(', ')}\n`;
							if (truncDesc) output += `    ${truncDesc}\n`;
						});
					}

					// If it's an option set, show enum values
					if (isOptionSet) {
						const enumResult = await session.run(`
							MATCH (v:NamedIndividual)-[:inScheme]->(c {uri: $uri})
							RETURN v.label AS label, v.notation AS notation,
								COALESCE(v.description, v.definition, '') AS description
							ORDER BY v.label
							LIMIT 50
						`, { uri: classUri });

						if (enumResult.records.length > 0) {
							output += `\nENUM VALUES (${enumResult.records.length}):\n`;
							enumResult.records.forEach(r => {
								const label = formatLabel(r.get('label'));
								const desc = r.get('description');
								const truncDesc = desc && desc.length > 80 ? desc.substring(0, 77) + '...' : desc;
								output += `  ${label}\n`;
								if (truncDesc) output += `    ${truncDesc}\n`;
							});
						}
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

		const toolMetadata = toolMetadataGenerator()
			.category('ontology-navigation')
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
