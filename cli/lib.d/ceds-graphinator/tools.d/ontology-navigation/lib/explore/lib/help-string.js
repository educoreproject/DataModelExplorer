#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} "ClassName" - Deep dive into a class`;

		const result = `
ceds2 -${switchName}: Deep dive into a CEDS class

PURPOSE:
  Show a class with its parent/child classes, properties, ranges,
  and enum values (if it is an option set).

USAGE:
  ceds2 -explore "ClassName"

EXAMPLES:
  ceds2 -explore "K12 Student"
  ceds2 -explore "Sex"
`;

		const getResult = () => result;
		const getListing = () => listingText;
		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
