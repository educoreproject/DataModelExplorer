#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: 'surfaceExport',
			description: 'Export the surfacing view specification combining Stage 1-3 artifacts',
			category: 'kg-surfacer',
			parameters: {
				classification: { type: 'string', description: 'Stage 1 artifact', required: true },
				naming: { type: 'string', description: 'Stage 2 artifact', required: true },
				scope: { type: 'string', description: 'Scope config from kgScope', required: false },
				output: { type: 'string', description: 'Output file path', required: false },
				'validate-only': { type: 'boolean', description: 'Validate without writing', required: false },
			},
			situationTemplates: [
				'When Stage 3 is complete and ready to generate the view specification for materialization',
				'When combining classification and naming artifacts into a single export',
				'When validating artifacts before producing the surfacing view spec',
			],
			examples: [
				{ description: 'Export view spec', command: 'ceds2 -surfaceExport --classification=./classification.json --naming=./naming.json --output=./view-spec.json' },
				{ description: 'Validate only', command: 'ceds2 -surfaceExport --classification=./classification.json --naming=./naming.json --validate-only --json' },
			],
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
