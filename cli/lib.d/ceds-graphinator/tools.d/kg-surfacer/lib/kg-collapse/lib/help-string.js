#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} "ConnectionClass" - Preview collapsing a Connection class into a named edge`;

		const result = `
ceds2 -${switchName}: Preview what happens when a Connection class is collapsed into a named edge

PURPOSE:
  Shows the before/after of collapsing a Connection (intermediary) class.
  The Connection node disappears and becomes a named edge between its bridge
  endpoints. Shows property distribution, lost properties, and edge conflicts.

USAGE:
  ceds2 -kgCollapse "ConnectionClassName" --classification=PATH --naming=PATH [options]

PARAMETERS:
  "ConnectionClassName"  Connection class name to collapse (required)
  --classification=PATH  Path to Stage 1 classification artifact (required)
  --naming=PATH          Path to Stage 2 naming artifact (required)
  --json                 Output as JSON
  --format=FMT           Output format: json, text, table, markdown

EXAMPLES:
  ceds2 -kgCollapse "K12 Student Enrollment" --classification=./classification.json --naming=./naming.json
  ceds2 -kgCollapse "K12 Student Enrollment" --classification=./classification.json --naming=./naming.json --json
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
