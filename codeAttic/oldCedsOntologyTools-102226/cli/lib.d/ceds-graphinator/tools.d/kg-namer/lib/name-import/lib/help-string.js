#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} "path" - Import and validate a naming artifact JSON file`;

		const result = `
ceds2 -${switchName}: Import and validate a naming mapping artifact JSON file

PURPOSE:
  Read a naming artifact from disk, validate its structure (namings with
  relationship, from, to), check class name references, and return the data.
  Used by Stage 3 (Surfacer) and Stage 4 (Materializer) to load Stage 2 output.

USAGE:
  ceds2 -nameImport "path/to/naming-artifact.json" [--summary-only] [--json]

PARAMETERS:
  "path"                    Path to naming artifact JSON file (required)
  --summary-only            Return summary counts only, not full data
  --json                    Output as structured JSON
  --format=<fmt>            Output format: json, text, table, markdown

EXAMPLES:
  ceds2 -nameImport naming-artifact.json --json
  ceds2 -nameImport naming-artifact.json --summary-only
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
