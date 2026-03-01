#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: "lookup",
			description: "Text search across all CEDS node types by name, label, or notation",
			category: "ontology-navigation",
			parameters: {
				"searchTerm": { type: "string", description: "Text to search for", required: true },
				"limit": { type: "number", description: "Max results (default: 20)", required: false }
			},
			situationTemplates: [
				"When searching for a CEDS class or property by name",
				"When looking up what exists in the ontology matching a keyword"
			],
			examples: [
				{ description: "Search for student-related items", command: 'ceds2 -lookup "student"' },
				{ description: "Search with limit", command: 'ceds2 -lookup "assessment" --limit=50' }
			]
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
