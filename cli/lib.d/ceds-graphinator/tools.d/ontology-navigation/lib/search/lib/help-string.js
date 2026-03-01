#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} "query" - Semantic vector search`;

		const result = `
ceds2 -${switchName}: Semantic vector search across CEDS ontology

PURPOSE:
  Use OpenAI embeddings to find ontology nodes semantically similar
  to a natural language query.

USAGE:
  ceds2 -search "natural language query" [--limit=N]

PARAMETERS:
  "query"       Natural language description of what you are looking for
  --limit=N     Max results (default: 15)

EXAMPLES:
  ceds2 -search "assessment scores for english language learners"
  ceds2 -search "student demographics" --limit=30

NOTES:
  Requires openaiApiKey in ceds2.ini or OPENAI_API_KEY environment variable.
  Requires the ceds_vector_index to be populated in Neo4j.
`;

		const getResult = () => result;
		const getListing = () => listingText;
		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
