#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} "path" - Ingest a user data dictionary to inform naming`;

		const result = `
ceds2 -${switchName}: Ingest a user's existing data dictionary or schema

PURPOSE:
  Accepts a schema file (JSON, CSV, or plain text) containing the organization's
  existing entity, relationship, and field names. Produces a vocabulary mapping
  that nameSuggest, thingNameSuggest, and detailNameSuggest can use to propose
  names matching the organization's terminology.

USAGE:
  ceds2 -schemaUpload "path/to/schema" [--format-type=json|csv|text] [--json]

PARAMETERS:
  "path"                    Path to the schema/dictionary file (required)
  --format-type=<fmt>       Force parse format: json, csv, text (default: auto-detect)
  --json                    Output as structured JSON
  --format=<fmt>            Output format: json, text, table, markdown

SUPPORTED FORMATS:
  JSON:  { "entities": [...], "relationships": [...], "fields": [...] }
  CSV:   Columns: type, name, description
  Text:  One name per line, optionally prefixed with entity:/relationship:/field:

EXAMPLES:
  ceds2 -schemaUpload ./our-data-dictionary.json
  ceds2 -schemaUpload ./field-list.csv --format-type=csv --json
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
