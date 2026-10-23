#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: 'kgScope',
			description: 'Show or set domain scope for knowledge graph surfacing',
			category: 'kg-surfacer',
			parameters: {
				set: { type: 'string', description: 'Comma-separated domains to include', required: false },
				output: { type: 'string', description: 'Scope config output path', required: false },
				classification: { type: 'string', description: 'Path to Stage 1 artifact (optional enrichment)', required: false },
			},
			situationTemplates: [
				'When viewing available CEDS domains and their class counts',
				'When setting scope for a K-12 focused surfacing',
				'When scoping the knowledge graph to relevant domains before surfacing',
			],
			examples: [
				{ description: 'List all domains', command: 'ceds2 -kgScope --json' },
				{ description: 'Set scope for K-12', command: 'ceds2 -kgScope --set="Person,K12,Organization" --output=./scope.json' },
			],
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
