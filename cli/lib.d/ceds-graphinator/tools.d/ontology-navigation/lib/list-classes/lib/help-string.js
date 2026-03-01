#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} - JSON list of all class names`;

		const result = `
ceds2 -${switchName}: List all CEDS class names as JSON

PURPOSE:
  Return a JSON array of all class names and notations (for autocomplete).

USAGE:
  ceds2 -listClasses

OUTPUT:
  JSON array of {label, notation} objects.
`;

		const getResult = () => result;
		const getListing = () => listingText;
		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
