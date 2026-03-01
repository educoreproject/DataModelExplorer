#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: "explore",
			description: "Deep dive into a CEDS class - parents, children, properties, enum values",
			category: "ontology-navigation",
			parameters: {
				"className": { type: "string", description: "Class name to explore", required: true }
			},
			situationTemplates: [
				"When needing to understand a CEDS class in detail",
				"When exploring what properties a class has"
			],
			examples: [
				{ description: "Explore K12 Student class", command: 'ceds2 -explore "K12 Student"' }
			]
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
