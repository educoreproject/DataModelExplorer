#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} - Compute structural metrics for CEDS classes`;

		const result = `
ceds2 -${switchName}: Compute structural metrics for all CEDS classes

PURPOSE:
  Compute degree, hub connectivity, temporal ratio, subtree depth, property count,
  and name signals for every CEDS class (excluding OptionSets by default).
  Output is used by Minor Milo for Thing/Connection/Detail classification.

USAGE:
  ceds2 -classifyData [--domain=X] [--json] [--includeOptionSets] [--format=FORMAT]

PARAMETERS:
  --domain=X            Filter to classes with this domain prefix (K12, EL, PS, AE, etc.)
  --includeOptionSets   Include OptionSet classes (normally excluded)
  --json                Output as JSON (default for this tool)
  --format=FORMAT       Output format: json, text, table, markdown

EXAMPLES:
  ceds2 -classifyData
  ceds2 -classifyData --json
  ceds2 -classifyData --domain=K12
  ceds2 -classifyData --domain=K12 --json
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
