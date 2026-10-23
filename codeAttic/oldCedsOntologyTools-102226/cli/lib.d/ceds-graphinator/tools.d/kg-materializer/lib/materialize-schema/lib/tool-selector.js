#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: 'materializeSchema',
			description: 'Generate a KG schema definition with node types, relationship types, and property types',
			category: 'kg-materializer',
			priority: 85,
			capabilities: ['schema-generation', 'data-dictionary', 'type-definitions', 'graphql-schema'],
			parameters: {
				'view-spec': { type: 'string', description: 'Surfacing view spec path', required: true },
				output: { type: 'string', description: 'Output file path', required: false },
				'schema-format': { type: 'string', description: 'json|markdown|graphql', required: false },
			},
			situationTemplates: [
				'When generating documentation for the knowledge graph',
				'When creating a GraphQL API definition',
				'When producing a data dictionary for stakeholders',
			],
			examples: [
				{ description: 'Generate JSON schema', command: 'ceds2 -materializeSchema --view-spec=./surfacing-view.json --schema-format=json' },
				{ description: 'Markdown documentation', command: 'ceds2 -materializeSchema --view-spec=./surfacing-view.json --schema-format=markdown' },
			],
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
