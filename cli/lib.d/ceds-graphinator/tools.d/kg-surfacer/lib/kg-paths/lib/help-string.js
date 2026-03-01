#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} "ThingName" - List all surfaced paths from a Thing through the knowledge graph`;

		const result = `
ceds2 -${switchName}: List all surfaced paths from a given Thing

PURPOSE:
  Enumerate all paths through the surfaced knowledge graph starting from a
  Thing class. Follows chains of named relationships to show reachability.
  Answers: "Starting from Person, what can I reach and how?"

USAGE:
  ceds2 -kgPaths "ThingName" --classification=PATH --naming=PATH [options]

PARAMETERS:
  "ThingName"            Starting Thing class name (required)
  --classification=PATH  Path to Stage 1 classification artifact (required)
  --naming=PATH          Path to Stage 2 naming artifact (required)
  --depth=N              Maximum path length in hops (default: 2)
  --scope=PATH           Path to scope config from -kgScope (optional)
  --json                 Output as JSON
  --format=FMT           Output format: json, text, table, markdown

EXAMPLES:
  ceds2 -kgPaths "Person" --classification=./classification.json --naming=./naming.json
  ceds2 -kgPaths "Person" --classification=./classification.json --naming=./naming.json --depth=3 --json
  ceds2 -kgPaths "Organization" --classification=./classification.json --naming=./naming.json --scope=./scope.json
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
