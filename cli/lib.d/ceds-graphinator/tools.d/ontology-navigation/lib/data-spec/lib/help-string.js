#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} "ClassName" - Full data specification`;

		const result = `
ceds2 -${switchName}: Full data specification for a CEDS class

PURPOSE:
  Show every property with its resolved type (DataType, OptionSet, ClassRef)
  and value counts for option sets.

USAGE:
  ceds2 -dataSpec "ClassName"

EXAMPLES:
  ceds2 -dataSpec "K12 Student"
  ceds2 -dataSpec "Organization"
`;

		const getResult = () => result;
		const getListing = () => listingText;
		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
