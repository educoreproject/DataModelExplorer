#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: "search",
			description: "Semantic vector search across CEDS ontology using OpenAI embeddings",
			category: "ontology-navigation",
			parameters: {
				"query": { type: "string", description: "Natural language search query", required: true },
				"limit": { type: "number", description: "Max results (default: 15)", required: false }
			},
			situationTemplates: [
				"When searching for CEDS concepts by meaning rather than exact name",
				"When exploring the ontology with natural language"
			],
			examples: [
				{ description: "Semantic search for ELL assessments", command: 'ceds2 -search "assessment scores for english language learners"' }
			]
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
