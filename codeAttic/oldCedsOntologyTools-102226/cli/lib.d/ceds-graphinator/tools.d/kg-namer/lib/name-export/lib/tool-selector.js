#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: 'nameExport',
			description: 'Export a naming mapping artifact as a validated JSON file',
			category: 'kg-namer',
			parameters: {
				output: { type: 'string', description: 'Output file path', required: false },
				classification: { type: 'string', description: 'Stage 1 artifact for cross-validation', required: false },
				'validate-only': { type: 'boolean', description: 'Validate without writing', required: false }
			},
			situationTemplates: [
				'When Stage 2 naming conversation is complete and results need saving',
				'When exporting naming decisions as a validated JSON artifact'
			],
			examples: [
				{ description: 'Export naming artifact', command: 'cat naming.json | ceds2 -nameExport --output=./naming-artifact.json' },
				{ description: 'Validate only', command: 'cat naming.json | ceds2 -nameExport --validate-only --classification=./classification.json' }
			]
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
