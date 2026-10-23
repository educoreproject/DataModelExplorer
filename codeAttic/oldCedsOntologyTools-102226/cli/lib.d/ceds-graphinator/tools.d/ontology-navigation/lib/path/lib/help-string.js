#!/usr/bin/env node
'use strict';
process.noDeprecation = true;
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} "ClassA" "ClassB" - Find path between two classes`;

		const result = `
ceds2 -${switchName}: Find semantic path between two CEDS classes

PURPOSE:
  Discover direct connections, shared properties, and semantic bridges
  between two classes in the ontology.

USAGE:
  ceds2 -path "ClassA" "ClassB"

EXAMPLES:
  ceds2 -path "K12 Student" "Assessment"
  ceds2 -path "Organization" "Person"
`;

		const getResult = () => result;
		const getListing = () => listingText;
		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
