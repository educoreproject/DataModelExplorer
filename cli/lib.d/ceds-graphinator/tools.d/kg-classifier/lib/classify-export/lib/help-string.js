#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} - Export a classification artifact as a validated JSON file`;

		const result = `
ceds2 -${switchName}: Export a classification artifact as a validated JSON file

PURPOSE:
  Takes classification data from stdin (as constructed by Minor Milo during a
  classification conversation) and writes it to a JSON file. Validates the
  artifact structure and optionally checks class names against the CEDS ontology.

USAGE:
  echo '{"metadata": {...}, "classifications": {...}}' | ceds2 -classifyExport [--output=PATH] [--validate-only] [--json]

PARAMETERS:
  --output=PATH         Output file path (default: ./classification-artifact.json)
  --validate-only       Validate structure without writing to disk
  --json                Output as JSON
  --format=FORMAT       Output format: json, text, table, markdown

INPUT:
  Classification artifact JSON via stdin (see artifact schema in spec).

EXAMPLES:
  cat classification.json | ceds2 -classifyExport --output=./my-classification.json
  cat classification.json | ceds2 -classifyExport --validate-only
  cat classification.json | ceds2 -classifyExport --json
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
