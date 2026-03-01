#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: "listProperties",
			description: "JSON list of all CEDS property names - for autocomplete and programmatic use",
			category: "ontology-navigation",
			parameters: {},
			situationTemplates: [
				"When needing a complete list of CEDS property names",
				"When building autocomplete for property selection"
			],
			examples: [
				{ description: "List all properties", command: "ceds2 -listProperties" }
			]
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
