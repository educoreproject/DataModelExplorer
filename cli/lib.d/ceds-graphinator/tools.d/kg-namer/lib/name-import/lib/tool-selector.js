#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: 'nameImport',
			description: 'Import and validate a naming mapping artifact JSON file',
			category: 'kg-namer',
			parameters: {
				file: { type: 'string', description: 'Path to naming artifact', required: true },
				'summary-only': { type: 'boolean', description: 'Return summary only', required: false }
			},
			situationTemplates: [
				'When starting Stage 3 and need to load Stage 2 naming output',
				'When validating a naming artifact before use'
			],
			examples: [
				{ description: 'Import naming artifact', command: 'ceds2 -nameImport naming-artifact.json --json' },
				{ description: 'Summary only', command: 'ceds2 -nameImport naming-artifact.json --summary-only' }
			]
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
