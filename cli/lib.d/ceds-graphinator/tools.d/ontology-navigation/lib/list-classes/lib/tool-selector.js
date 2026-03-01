#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: "listClasses",
			description: "JSON list of all CEDS class names - for autocomplete and programmatic use",
			category: "ontology-navigation",
			parameters: {},
			situationTemplates: [
				"When needing a complete list of CEDS class names",
				"When building autocomplete for class selection"
			],
			examples: [
				{ description: "List all classes", command: "ceds2 -listClasses" }
			]
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
