#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: 'materializeCypher',
			description: 'Generate Cypher statements for building the knowledge graph in Neo4j',
			category: 'kg-materializer',
			priority: 90,
			capabilities: ['cypher-generation', 'neo4j-schema', 'graph-creation', 'template-generation'],
			parameters: {
				'view-spec': { type: 'string', description: 'Surfacing view spec path', required: true },
				output: { type: 'string', description: 'Output file path', required: false },
				mode: { type: 'string', description: 'schema|template|demo', required: false },
				'label-prefix': { type: 'string', description: 'Node label prefix', required: false },
			},
			situationTemplates: [
				'When creating the knowledge graph in Neo4j',
				'When generating Cypher templates for instance data loading',
				'When building a demo graph for presentations',
			],
			examples: [
				{ description: 'Generate schema Cypher', command: 'ceds2 -materializeCypher --view-spec=./surfacing-view.json --output=./ceds-kg.cypher' },
				{ description: 'Demo mode as JSON', command: 'ceds2 -materializeCypher --view-spec=./surfacing-view.json --mode=demo --json' },
			],
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
