#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} - JSON list of all option set names`;

		const result = `
ceds2 -${switchName}: List all CEDS option set names as JSON

PURPOSE:
  Return a JSON array of all option set (ConceptScheme) names and notations.

USAGE:
  ceds2 -listOptionSets

OUTPUT:
  JSON array of {label, notation} objects.
`;

		const getResult = () => result;
		const getListing = () => listingText;
		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
