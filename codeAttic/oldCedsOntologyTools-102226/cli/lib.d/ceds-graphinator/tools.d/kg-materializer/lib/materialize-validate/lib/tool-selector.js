#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: 'materializeValidate',
			description: 'Validate a materialized artifact against the CEDS source ontology',
			category: 'kg-materializer',
			priority: 70,
			capabilities: ['validation', 'consistency-check', 'ontology-verification'],
			parameters: {
				artifact: { type: 'string', description: 'Path to artifact to validate', required: true },
				'view-spec': { type: 'string', description: 'Surfacing view spec path', required: true },
				'artifact-type': { type: 'string', description: 'jsonld|cypher|schema|diagram', required: false },
			},
			situationTemplates: [
				'When checking a materialized JSON-LD file against CEDS before publishing',
				'When validating Cypher output before loading into Neo4j',
				'When verifying schema completeness',
			],
			examples: [
				{ description: 'Validate JSON-LD artifact', command: 'ceds2 -materializeValidate ceds-kg.jsonld --view-spec=./surfacing-view.json --json' },
			],
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
