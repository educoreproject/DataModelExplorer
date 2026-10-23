#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: "compare",
			description: "Compare properties of two CEDS classes - shared vs unique with overlap stats",
			category: "ontology-navigation",
			parameters: {
				"classA": { type: "string", description: "First class name", required: true },
				"classB": { type: "string", description: "Second class name", required: true }
			},
			situationTemplates: [
				"When comparing what two CEDS classes have in common",
				"When analyzing overlap between related classes"
			],
			examples: [
				{ description: "Compare two student types", command: 'ceds2 -compare "K12 Student" "Postsecondary Student"' }
			]
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
