#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

//START OF moduleFunction() ============================================================
const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: "stats",
			description: "Show CEDS ontology statistics - node counts, relationship counts, embedding stats",
			category: "ontology-navigation",
			parameters: {},
			situationTemplates: [
				"When needing an overview of the CEDS ontology",
				"When checking how many classes, properties, or option sets exist",
				"When verifying vector embeddings are populated"
			],
			examples: [
				{
					description: "Show ontology statistics",
					command: "ceds2 -stats"
				}
			]
		};

		const getResult = () => toolSelector;

		return { getResult };
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
