#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} - Export the surfacing view specification combining Stage 1-3 artifacts`;

		const result = `
ceds2 -${switchName}: Export the surfacing view specification as a JSON file

PURPOSE:
  Combines Stage 1 classification, Stage 2 naming, and Stage 3 surfacing
  decisions (scope, collapse, property selection) into a single comprehensive
  surfacing view specification. This is the input to Stage 4 (Materializer).

USAGE:
  ceds2 -surfaceExport --classification=PATH --naming=PATH [options]

PARAMETERS:
  --classification=PATH  Path to Stage 1 classification artifact (required)
  --naming=PATH          Path to Stage 2 naming artifact (required)
  --scope=PATH           Path to scope config from -kgScope (optional)
  --output=PATH          Output file path (default: ./surfacing-view-spec.json)
  --validate-only        Validate inputs without writing output
  --json                 Output as JSON
  --format=FMT           Output format: json, text, table, markdown

EXAMPLES:
  ceds2 -surfaceExport --classification=./classification.json --naming=./naming.json --output=./surfacing-view.json
  ceds2 -surfaceExport --classification=./classification.json --naming=./naming.json --scope=./scope.json --json
  ceds2 -surfaceExport --classification=./classification.json --naming=./naming.json --validate-only
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
