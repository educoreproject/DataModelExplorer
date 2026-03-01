#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: 'kgView',
			description: 'Show the knowledge graph interpretation of a class with surfaced named relationships',
			category: 'kg-surfacer',
			parameters: {
				className: { type: 'string', description: 'Thing class name (omit for overview)', required: false },
				classification: { type: 'string', description: 'Path to Stage 1 artifact', required: true },
				naming: { type: 'string', description: 'Path to Stage 2 artifact', required: true },
				'show-details': { type: 'boolean', description: 'Show attached Detail classes', required: false },
				depth: { type: 'number', description: 'Hops to show (1 or 2)', required: false },
			},
			situationTemplates: [
				'When viewing the knowledge graph around a specific entity',
				'When reviewing surfaced relationships before materialization',
				'When exploring what a Thing connects to in the collapsed view',
			],
			examples: [
				{ description: 'View Person relationships', command: 'ceds2 -kgView "Person" --classification=./classification.json --naming=./naming.json --json' },
				{ description: 'Overview of all Things', command: 'ceds2 -kgView --classification=./classification.json --naming=./naming.json' },
			],
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
