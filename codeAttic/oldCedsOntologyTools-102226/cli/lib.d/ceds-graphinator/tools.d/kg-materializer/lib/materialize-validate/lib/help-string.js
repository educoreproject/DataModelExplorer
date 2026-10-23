#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} <artifact> --view-spec=<path> - Validate artifact against CEDS ontology`;

		const result = `
ceds2 -${switchName}: Validate a materialized artifact against the CEDS source ontology

PURPOSE:
  Check that all node types, relationship types, and properties in a materialized
  artifact trace back to real CEDS classes and properties. Reports errors (fatal)
  and warnings (non-fatal).

USAGE:
  ceds2 -materializeValidate <artifact-path> --view-spec=<path> [--artifact-type=<type>]

PARAMETERS:
  <artifact-path>             Path to the materialized artifact to validate (required)
  --view-spec=<path>          Path to surfacing view specification (required)
  --artifact-type=<type>      Type: jsonld | cypher | schema | diagram (default: auto-detect)
  --json                      Output result as JSON
  --format=<fmt>              Output format: json | text | table | markdown

VALIDATIONS PERFORMED:
  1. All node types trace back to CEDS classes
  2. All relationship types trace back to Connection classes
  3. All properties trace back to CEDS properties
  4. Property type assignments are correct
  5. No orphan references

EXAMPLES:
  ceds2 -materializeValidate ceds-kg.jsonld --view-spec=./surfacing-view.json
  ceds2 -materializeValidate ceds-kg.cypher --view-spec=./surfacing-view.json --artifact-type=cypher --json
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
