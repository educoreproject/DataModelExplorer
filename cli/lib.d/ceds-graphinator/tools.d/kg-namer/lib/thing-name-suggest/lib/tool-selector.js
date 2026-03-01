#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: 'thingNameSuggest',
			description: 'Propose a local node type name for a Thing class',
			category: 'kg-namer',
			parameters: {
				className: { type: 'string', description: 'Thing class name', required: false },
				classification: { type: 'string', description: 'Stage 1 artifact', required: false },
				vocabulary: { type: 'string', description: 'Uploaded vocabulary file', required: false },
				'all-things': { type: 'boolean', description: 'Run for all things', required: false }
			},
			situationTemplates: [
				'When naming a Thing class in Stage 2',
				'When batch naming all Thing classes from a classification artifact'
			],
			examples: [
				{ description: 'Suggest name for a single Thing', command: 'ceds2 -thingNameSuggest "Organization"' },
				{ description: 'Batch name all things', command: 'ceds2 -thingNameSuggest --all-things --classification=./classification.json --json' }
			]
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
