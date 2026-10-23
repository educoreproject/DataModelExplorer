#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: "dataSpec",
			description: "Full data specification for a CEDS class with resolved property types",
			category: "ontology-navigation",
			parameters: {
				"className": { type: "string", description: "Class name", required: true }
			},
			situationTemplates: [
				"When needing a complete data specification for a CEDS class",
				"When building a schema based on CEDS ontology"
			],
			examples: [
				{ description: "Full spec for K12 Student", command: 'ceds2 -dataSpec "K12 Student"' }
			]
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
