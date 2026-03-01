#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: "optionSet",
			description: "List all values in a CEDS option set (enumeration/ConceptScheme)",
			category: "ontology-navigation",
			parameters: {
				"name": { type: "string", description: "Option set name", required: true },
				"limit": { type: "number", description: "Max values (default: 100)", required: false }
			},
			situationTemplates: [
				"When needing to see valid values for a CEDS enumeration",
				"When exploring what options are available for a coded field"
			],
			examples: [
				{ description: "List Sex option set values", command: 'ceds2 -optionSet "Sex"' }
			]
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
