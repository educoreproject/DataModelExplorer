#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: "path",
			description: "Find semantic path between two CEDS classes - direct connections, shared props, bridges",
			category: "ontology-navigation",
			parameters: {
				"classA": { type: "string", description: "First class name", required: true },
				"classB": { type: "string", description: "Second class name", required: true }
			},
			situationTemplates: [
				"When exploring how two CEDS classes relate to each other",
				"When finding semantic connections between ontology concepts"
			],
			examples: [
				{ description: "Find path between student and assessment", command: 'ceds2 -path "K12 Student" "Assessment"' }
			]
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
