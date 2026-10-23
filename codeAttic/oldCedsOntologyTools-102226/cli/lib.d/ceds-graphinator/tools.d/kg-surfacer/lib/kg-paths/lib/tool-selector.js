#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: 'kgPaths',
			description: 'List all surfaced paths from a Thing through the knowledge graph',
			category: 'kg-surfacer',
			parameters: {
				className: { type: 'string', description: 'Starting Thing class name', required: true },
				classification: { type: 'string', description: 'Stage 1 artifact path', required: true },
				naming: { type: 'string', description: 'Stage 2 artifact path', required: true },
				depth: { type: 'number', description: 'Maximum path depth', required: false },
				scope: { type: 'string', description: 'Scope config path from kgScope', required: false },
			},
			situationTemplates: [
				'When exploring all connections from a starting entity',
				'When understanding the navigability of the surfaced knowledge graph',
				'When planning queries against the materialized graph',
			],
			examples: [
				{ description: 'Paths from Person', command: 'ceds2 -kgPaths "Person" --classification=./classification.json --naming=./naming.json --json' },
				{ description: 'Deep paths with scope', command: 'ceds2 -kgPaths "Organization" --classification=./classification.json --naming=./naming.json --depth=3 --scope=./scope.json' },
			],
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
