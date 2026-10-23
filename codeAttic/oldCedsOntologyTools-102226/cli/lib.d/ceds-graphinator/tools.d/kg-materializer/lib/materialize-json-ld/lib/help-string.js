#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} --view-spec=<path> - Generate JSON-LD from surfacing view spec`;

		const result = `
ceds2 -${switchName}: Generate JSON-LD output from a surfacing view specification

PURPOSE:
  Produce JSON-LD context documents, schema definitions, and example instances
  from the surfaced CEDS knowledge graph. The education data community has been
  asking for JSON-LD representations of CEDS — this tool generates them.

USAGE:
  ceds2 -materializeJsonLd --view-spec=<path> [--output=<path>] [--mode=<mode>] [--base-uri=<uri>] [--compact]

PARAMETERS:
  --view-spec=<path>    Path to surfacing view specification (Stage 3 output, required)
  --output=<path>       Output file path (default: ./ceds-kg.jsonld)
  --mode=<mode>         Output mode: context | schema | full (default: context)
                          context — just @context mapping
                          schema  — context + type definitions
                          full    — context + schema + examples
  --base-uri=<uri>      Base URI for JSON-LD @context (default: https://ceds.ed.gov/element/)
  --compact             Compact JSON-LD output (single line)
  --json                Output result metadata as JSON
  --format=<fmt>        Output format: json | text | table | markdown

EXAMPLES:
  ceds2 -materializeJsonLd --view-spec=./surfacing-view.json --output=./ceds-kg.jsonld
  ceds2 -materializeJsonLd --view-spec=./surfacing-view.json --mode=full --json
  ceds2 -materializeJsonLd --view-spec=./surfacing-view.json --mode=context --output=./ceds-context.jsonld
  ceds2 -materializeJsonLd --view-spec=./surfacing-view.json --base-uri="https://example.org/ceds/"
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
