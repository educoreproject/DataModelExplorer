#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: 'classifyImport',
			description: 'Import and validate a classification artifact JSON file',
			category: 'kg-classifier',
			parameters: {
				file: { type: 'string', description: 'Path to classification artifact JSON', required: true },
				'summary-only': { type: 'boolean', description: 'Return summary only', required: false },
				bucket: { type: 'string', description: 'Filter to specific bucket: thing, connection, detail', required: false },
			},
			situationTemplates: [
				'When starting Stage 2 and needing to load the Stage 1 classification',
				'When reviewing a previously exported classification',
				'When validating an artifact before proceeding to the next pipeline stage',
			],
			examples: [
				{ description: 'Import and validate a classification', command: 'ceds2 -classifyImport classification-artifact.json' },
				{ description: 'Import with bucket filter as JSON', command: 'ceds2 -classifyImport classification-artifact.json --bucket=connection --json' },
				{ description: 'Summary only', command: 'ceds2 -classifyImport classification-artifact.json --summary-only' },
			],
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
