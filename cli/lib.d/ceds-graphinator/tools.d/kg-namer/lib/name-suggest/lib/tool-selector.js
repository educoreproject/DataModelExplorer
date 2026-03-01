#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: 'nameSuggest',
			description: 'Propose a relationship name, direction, and property list for a Connection class',
			category: 'kg-namer',
			parameters: {
				className: { type: 'string', description: 'Connection class name', required: true },
				classification: { type: 'string', description: 'Path to Stage 1 artifact', required: false },
				'all-connections': { type: 'boolean', description: 'Run for all connections', required: false }
			},
			situationTemplates: [
				'When naming a relationship in Stage 2',
				'When proposing what a Connection class should be called as a relationship',
				'When batch naming all Connection classes from a classification artifact'
			],
			examples: [
				{ description: 'Suggest name for a single Connection', command: 'ceds2 -nameSuggest "K12 Student Enrollment"' },
				{ description: 'Batch name all connections', command: 'ceds2 -nameSuggest --all-connections --classification=./classification.json --json' }
			]
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
