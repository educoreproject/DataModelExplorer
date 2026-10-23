#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: 'classifyExport',
			description: 'Export a classification artifact as a validated JSON file',
			category: 'kg-classifier',
			parameters: {
				output: { type: 'string', description: 'Output file path', required: false },
				'validate-only': { type: 'boolean', description: 'Validate without writing', required: false },
			},
			situationTemplates: [
				'When a classification conversation is complete and the result needs to be saved',
				'When validating a classification artifact before using it in Stage 2',
			],
			examples: [
				{ description: 'Export classification to file', command: 'cat classification.json | ceds2 -classifyExport --output=./my-classification.json' },
				{ description: 'Validate only', command: 'cat classification.json | ceds2 -classifyExport --validate-only' },
			],
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
