#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} "ClassName" - Propose a local node type name for a Thing class`;

		const result = `
ceds2 -${switchName}: Propose a local node type name for a Thing class

PURPOSE:
  Given a class classified as a Thing in Stage 1, propose a local node type
  name that matches the organization's vocabulary. Strips domain prefixes,
  simplifies compound names, and checks uploaded vocabulary for matches.

USAGE:
  ceds2 -thingNameSuggest "ClassName" [--classification=path] [--vocabulary=path] [--all-things] [--json]

PARAMETERS:
  "ClassName"               Thing class name (required unless --all-things)
  --classification=path     Path to Stage 1 classification artifact
  --vocabulary=path         Path to uploaded vocabulary (from -schemaUpload)
  --all-things              Run for ALL Thing classes in the classification
  --json                    Output as structured JSON
  --format=<fmt>            Output format: json, text, table, markdown

EXAMPLES:
  ceds2 -thingNameSuggest "Organization"
  ceds2 -thingNameSuggest "Organization" --vocabulary=./vocab.json --json
  ceds2 -thingNameSuggest --all-things --classification=./classification.json --json
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
