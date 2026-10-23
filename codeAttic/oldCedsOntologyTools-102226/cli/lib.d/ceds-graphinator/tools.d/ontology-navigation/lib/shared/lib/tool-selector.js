#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: "shared",
			description: "Cross-domain vocabulary analysis - option sets shared across 3+ classes",
			category: "ontology-navigation",
			parameters: {},
			situationTemplates: [
				"When finding which enumerations bridge multiple CEDS domains",
				"When analyzing vocabulary reuse across the ontology"
			],
			examples: [
				{ description: "Show shared vocabularies", command: "ceds2 -shared" }
			]
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
