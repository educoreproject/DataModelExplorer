#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: "listOptionSets",
			description: "JSON list of all CEDS option set names - for autocomplete and programmatic use",
			category: "ontology-navigation",
			parameters: {},
			situationTemplates: [
				"When needing a complete list of CEDS option sets",
				"When building autocomplete for option set selection"
			],
			examples: [
				{ description: "List all option sets", command: "ceds2 -listOptionSets" }
			]
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
