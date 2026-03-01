#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: 'materializeJsonLd',
			description: 'Generate JSON-LD output from the surfacing view specification (HIGH PRIORITY)',
			category: 'kg-materializer',
			priority: 99,
			capabilities: ['json-ld', 'linked-data', 'context-generation', 'schema-export'],
			parameters: {
				'view-spec': { type: 'string', description: 'Surfacing view spec path', required: true },
				output: { type: 'string', description: 'Output file path', required: false },
				mode: { type: 'string', description: 'context|schema|full', required: false },
				'base-uri': { type: 'string', description: 'Base URI for @context', required: false },
			},
			situationTemplates: [
				'When generating a JSON-LD representation of the surfaced CEDS knowledge graph',
				'When creating a JSON-LD context for CEDS data exchange',
				'When producing linked data output for the education community',
			],
			examples: [
				{ description: 'Generate JSON-LD context', command: 'ceds2 -materializeJsonLd --view-spec=./surfacing-view.json --output=./ceds-kg.jsonld' },
				{ description: 'Full output as JSON', command: 'ceds2 -materializeJsonLd --view-spec=./surfacing-view.json --mode=full --json' },
			],
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
