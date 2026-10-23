#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} - JSON list of all property names`;

		const result = `
ceds2 -${switchName}: List all CEDS property names as JSON

PURPOSE:
  Return a JSON array of all property names (for autocomplete).

USAGE:
  ceds2 -listProperties

OUTPUT:
  JSON array of {label, notation} objects.
`;

		const getResult = () => result;
		const getListing = () => listingText;
		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
