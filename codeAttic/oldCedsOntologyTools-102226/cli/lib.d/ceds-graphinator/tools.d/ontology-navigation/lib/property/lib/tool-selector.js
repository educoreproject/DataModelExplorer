#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: "property",
			description: "Show CEDS property details - domain classes, range types, description",
			category: "ontology-navigation",
			parameters: {
				"name": { type: "string", description: "Property name to look up", required: true }
			},
			situationTemplates: [
				"When needing details about a specific CEDS property",
				"When checking which classes use a property"
			],
			examples: [
				{ description: "Show BirthDate property details", command: 'ceds2 -property "BirthDate"' }
			]
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
