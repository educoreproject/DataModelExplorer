#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

//START OF moduleFunction() ============================================================
const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} - Show CEDS ontology statistics`;

		const result = `
ceds2 -${switchName}: Show CEDS ontology statistics

PURPOSE:
  Display counts of node types, relationship types, and vector embeddings
  in the CEDS ontology graph database.

USAGE:
  ceds2 -stats

EXAMPLES:
  ceds2 -stats

OUTPUT:
  Node type counts, relationship type counts, and embedding statistics.
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
