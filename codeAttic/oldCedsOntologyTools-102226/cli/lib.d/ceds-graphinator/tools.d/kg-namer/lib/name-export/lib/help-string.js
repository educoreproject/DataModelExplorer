#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} --output=path - Export naming artifact as validated JSON`;

		const result = `
ceds2 -${switchName}: Export a naming mapping artifact as a validated JSON file

PURPOSE:
  Takes accumulated naming decisions (via stdin JSON) and writes a validated
  naming artifact. Checks class names against CEDS and optionally cross-validates
  against a Stage 1 classification artifact.

USAGE:
  echo '{"metadata":{...},"namings":{...}}' | ceds2 -nameExport [--output=path] [--classification=path] [--validate-only] [--json]

PARAMETERS:
  stdin                     Naming artifact JSON (required)
  --output=path             Output file path (default: ./naming-artifact.json)
  --classification=path     Path to Stage 1 artifact for cross-validation
  --validate-only           Validate without writing to disk
  --json                    Output as structured JSON
  --format=<fmt>            Output format: json, text, table, markdown

EXAMPLES:
  cat naming.json | ceds2 -nameExport --output=./naming-artifact.json
  cat naming.json | ceds2 -nameExport --validate-only --classification=./classification.json
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
