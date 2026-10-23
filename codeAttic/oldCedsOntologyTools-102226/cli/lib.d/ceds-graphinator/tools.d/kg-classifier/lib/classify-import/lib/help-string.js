#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} <file> - Import and validate a classification artifact`;

		const result = `
ceds2 -${switchName}: Import and validate a classification artifact JSON file

PURPOSE:
  Reads a classification artifact JSON file, validates its structure, checks
  class names against the CEDS ontology, and returns the classification data.
  Used by Stage 2 (Namer) and Stage 3 (Surfacer) to load Stage 1 output.

USAGE:
  ceds2 -classifyImport <path-to-artifact.json> [--summary-only] [--bucket=BUCKET] [--json]

PARAMETERS:
  <file>                Path to the classification artifact JSON file (required)
  --summary-only        Return only summary counts, not full classifications
  --bucket=BUCKET       Filter to a specific bucket: thing, connection, detail
  --json                Output as JSON
  --format=FORMAT       Output format: json, text, table, markdown

VALIDATION:
  - JSON structure conforms to artifact schema
  - Every className exists in the CEDS ontology (when Neo4j is available)
  - Valid bucket values (thing, connection, detail, or null)
  - Required evidence fields present

EXAMPLES:
  ceds2 -classifyImport classification-artifact.json
  ceds2 -classifyImport classification-artifact.json --json
  ceds2 -classifyImport classification-artifact.json --summary-only
  ceds2 -classifyImport classification-artifact.json --bucket=connection --json
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
