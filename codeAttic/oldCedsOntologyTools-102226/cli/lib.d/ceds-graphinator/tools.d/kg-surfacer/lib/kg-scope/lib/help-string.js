#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} - Show or set domain scope for knowledge graph surfacing`;

		const result = `
ceds2 -${switchName}: Show or set the domain scope for surfacing

PURPOSE:
  List available CEDS domains with class counts, or select which domains to
  include when surfacing the knowledge graph. Writes a scope configuration
  file that other surfacer tools consume.

USAGE:
  ceds2 -kgScope [options]

PARAMETERS:
  --set=DOMAINS          Comma-separated list of domains to include
                         (e.g., "Person,K12,Organization,Course")
  --output=PATH          Where to write scope config (default: ./scope-config.json)
  --classification=PATH  Path to Stage 1 artifact (enriches domain listing)
  --json                 Output as JSON
  --format=FMT           Output format: json, text, table, markdown

EXAMPLES:
  ceds2 -kgScope
  ceds2 -kgScope --json
  ceds2 -kgScope --set="Person,K12,Organization,Course" --output=./scope.json
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
