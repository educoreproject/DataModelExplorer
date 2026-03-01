#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: 'detailNameSuggest',
			description: 'Propose a property group name for a Detail class and identify its parent Thing',
			category: 'kg-namer',
			parameters: {
				className: { type: 'string', description: 'Detail class name', required: false },
				classification: { type: 'string', description: 'Stage 1 artifact', required: false },
				vocabulary: { type: 'string', description: 'Uploaded vocabulary file', required: false },
				'all-details': { type: 'boolean', description: 'Run for all details', required: false }
			},
			situationTemplates: [
				'When naming a Detail class in Stage 2',
				'When identifying which Thing a Detail belongs to',
				'When batch naming all Detail classes from a classification artifact'
			],
			examples: [
				{ description: 'Suggest name for a single Detail', command: 'ceds2 -detailNameSuggest "Person Birth"' },
				{ description: 'Batch name all details', command: 'ceds2 -detailNameSuggest --all-details --classification=./classification.json --json' }
			]
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
