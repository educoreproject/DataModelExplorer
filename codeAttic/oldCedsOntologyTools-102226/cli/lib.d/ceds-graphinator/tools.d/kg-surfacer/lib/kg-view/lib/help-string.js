#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} "ThingName" - Show the knowledge graph interpretation with surfaced named relationships`;

		const result = `
ceds2 -${switchName}: Show the knowledge graph interpretation of a class

PURPOSE:
  Show surfaced relationships -- Thing nodes, named edges, properties, and
  directions -- derived from Stage 1 classification and Stage 2 naming artifacts.
  When called without a class name, shows an overview of all Things.

USAGE:
  ceds2 -kgView [ThingName] --classification=PATH --naming=PATH [options]

PARAMETERS:
  "ThingName"            Thing class name (omit for overview of all Things)
  --classification=PATH  Path to Stage 1 classification artifact (required)
  --naming=PATH          Path to Stage 2 naming artifact (required)
  --show-details         Also show Detail classes attached to this Thing
  --hide-properties      Suppress relationship property listing
  --depth=N              How many hops to show (default: 1)
  --json                 Output as JSON
  --format=FMT           Output format: json, text, table, markdown

EXAMPLES:
  ceds2 -kgView "Person" --classification=./classification.json --naming=./naming.json
  ceds2 -kgView --classification=./classification.json --naming=./naming.json
  ceds2 -kgView "Person" --classification=./classification.json --naming=./naming.json --show-details --depth=2 --json
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
