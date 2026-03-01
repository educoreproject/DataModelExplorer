#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: 'classifyData',
			description: 'Compute structural metrics for all CEDS classes to support Thing/Connection/Detail classification',
			category: 'kg-classifier',
			parameters: {
				domain: { type: 'string', description: 'Filter to classes with this domain prefix', required: false },
				includeOptionSets: { type: 'boolean', description: 'Include OptionSet classes', required: false },
			},
			situationTemplates: [
				'When computing structural data to classify CEDS classes into Thing/Connection/Detail buckets',
				'When starting a classification session and needing precomputed metrics',
				'When analyzing which classes are hubs, junctions, or details',
			],
			examples: [
				{ description: 'Compute metrics for all classes', command: 'ceds2 -classifyData' },
				{ description: 'Compute metrics for K12 domain', command: 'ceds2 -classifyData --domain=K12' },
				{ description: 'Output as JSON', command: 'ceds2 -classifyData --json' },
			],
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
