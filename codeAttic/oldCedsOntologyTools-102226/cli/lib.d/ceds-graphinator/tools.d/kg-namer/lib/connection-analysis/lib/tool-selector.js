#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: 'connectionAnalysis',
			description: 'Analyze a Connection class to determine bridge endpoints, property character, and hub paths',
			category: 'kg-namer',
			parameters: {
				className: { type: 'string', description: 'Connection class name to analyze', required: true },
				classification: { type: 'string', description: 'Path to Stage 1 classification artifact', required: false }
			},
			situationTemplates: [
				'When analyzing what a junction class bridges between Thing classes',
				'When preparing to name a relationship in Stage 2',
				'When investigating the structure of a Connection class'
			],
			examples: [
				{ description: 'Analyze a Connection class', command: 'ceds2 -connectionAnalysis "K12 Student Enrollment"' },
				{ description: 'Analyze with classification context', command: 'ceds2 -connectionAnalysis "Staff Employment" --classification=./classification.json --json' }
			]
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
