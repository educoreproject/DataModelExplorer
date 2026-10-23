#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} - Show option sets shared across 3+ classes`;

		const result = `
ceds2 -${switchName}: Cross-domain vocabulary analysis

PURPOSE:
  Show option sets (enumerations) that are shared across 3 or more classes,
  revealing the most connected vocabularies in the ontology.

USAGE:
  ceds2 -shared

EXAMPLES:
  ceds2 -shared
`;

		const getResult = () => result;
		const getListing = () => listingText;
		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
