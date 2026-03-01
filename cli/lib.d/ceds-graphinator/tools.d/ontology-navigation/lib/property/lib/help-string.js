#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} "name" - Show property details`;

		const result = `
ceds2 -${switchName}: Show CEDS property details

PURPOSE:
  Show a property's description, domain classes, and range types.

USAGE:
  ceds2 -property "PropertyName"

EXAMPLES:
  ceds2 -property "BirthDate"
  ceds2 -property "assessment"
`;

		const getResult = () => result;
		const getListing = () => listingText;
		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
