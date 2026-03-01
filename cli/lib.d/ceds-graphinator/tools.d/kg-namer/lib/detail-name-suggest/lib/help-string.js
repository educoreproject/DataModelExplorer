#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} "ClassName" - Propose a property group name for a Detail class`;

		const result = `
ceds2 -${switchName}: Propose a property group name for a Detail class

PURPOSE:
  Given a class classified as a Detail in Stage 1, propose a local property
  group name and identify which Thing it belongs to. Details become properties
  or sub-nodes attached to their parent Thing.

USAGE:
  ceds2 -detailNameSuggest "ClassName" [--classification=path] [--vocabulary=path] [--all-details] [--json]

PARAMETERS:
  "ClassName"               Detail class name (required unless --all-details)
  --classification=path     Path to Stage 1 classification artifact
  --vocabulary=path         Path to uploaded vocabulary (from -schemaUpload)
  --all-details             Run for ALL Detail classes in the classification
  --json                    Output as structured JSON
  --format=<fmt>            Output format: json, text, table, markdown

EXAMPLES:
  ceds2 -detailNameSuggest "Person Birth"
  ceds2 -detailNameSuggest "Person Birth" --vocabulary=./vocab.json --json
  ceds2 -detailNameSuggest --all-details --classification=./classification.json --json
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
