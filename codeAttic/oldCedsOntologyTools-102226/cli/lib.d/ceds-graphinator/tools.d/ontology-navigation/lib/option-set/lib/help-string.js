#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} "name" - List all values in an option set`;

		const result = `
ceds2 -${switchName}: List option set values

PURPOSE:
  Show all enumeration values within a CEDS option set (ConceptScheme).

USAGE:
  ceds2 -optionSet "OptionSetName" [--limit=N]

EXAMPLES:
  ceds2 -optionSet "Sex"
  ceds2 -optionSet "Race" --limit=200
`;

		const getResult = () => result;
		const getListing = () => listingText;
		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
