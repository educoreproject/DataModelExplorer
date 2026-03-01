#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} --view-spec=<path> - Generate KG schema definition`;

		const result = `
ceds2 -${switchName}: Generate a knowledge graph schema definition

PURPOSE:
  Produce a clean, human-readable schema definition for the surfaced knowledge
  graph. This is the "data dictionary" of the KG — node types, properties,
  relationships, and data types.

USAGE:
  ceds2 -materializeSchema --view-spec=<path> [--output=<path>] [--schema-format=<fmt>]

PARAMETERS:
  --view-spec=<path>         Path to surfacing view specification (Stage 3 output, required)
  --output=<path>            Output file path (default: ./ceds-kg-schema; extension added per format)
  --schema-format=<fmt>      Output format: json | markdown | graphql (default: json)
  --json                     Output result metadata as JSON
  --format=<fmt>             Output format: json | text | table | markdown

EXAMPLES:
  ceds2 -materializeSchema --view-spec=./surfacing-view.json --schema-format=json
  ceds2 -materializeSchema --view-spec=./surfacing-view.json --schema-format=markdown --output=./ceds-kg-schema
  ceds2 -materializeSchema --view-spec=./surfacing-view.json --schema-format=graphql --json
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
