#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} "term" - Text search across classes, properties, option sets`;

		const result = `
ceds2 -${switchName}: Text search across all CEDS node types

PURPOSE:
  Search classes, properties, and option sets by name/label/notation.

USAGE:
  ceds2 -lookup "search term" [--limit=N]

PARAMETERS:
  "search term"     Text to search for in labels, notations, identifiers
  --limit=N         Max results (default: 20)

EXAMPLES:
  ceds2 -lookup "student"
  ceds2 -lookup "assessment" --limit=50
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
