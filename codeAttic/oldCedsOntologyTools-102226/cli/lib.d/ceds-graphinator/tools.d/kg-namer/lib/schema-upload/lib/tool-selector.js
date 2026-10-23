#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: 'schemaUpload',
			description: 'Ingest a user data dictionary or schema to inform naming proposals',
			category: 'kg-namer',
			parameters: {
				file: { type: 'string', description: 'Path to schema/dictionary file', required: true },
				'format-type': { type: 'string', description: 'Force file format (json, csv, text)', required: false }
			},
			situationTemplates: [
				'When a user has an existing data dictionary they want to use for naming',
				'When an organization has established terminology to match against CEDS'
			],
			examples: [
				{ description: 'Upload a JSON data dictionary', command: 'ceds2 -schemaUpload ./our-data-dictionary.json' },
				{ description: 'Upload a CSV field list', command: 'ceds2 -schemaUpload ./field-list.csv --format-type=csv --json' }
			]
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
