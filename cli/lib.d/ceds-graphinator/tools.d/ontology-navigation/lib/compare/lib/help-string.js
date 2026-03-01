#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} "ClassA" "ClassB" - Compare two classes`;

		const result = `
ceds2 -${switchName}: Compare properties of two CEDS classes

PURPOSE:
  Show shared vs unique properties between two classes, with overlap percentage.

USAGE:
  ceds2 -compare "ClassA" "ClassB"

EXAMPLES:
  ceds2 -compare "K12 Student" "Postsecondary Student"
  ceds2 -compare "Organization" "School"
`;

		const getResult = () => result;
		const getListing = () => listingText;
		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
