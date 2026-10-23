#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} "ClassName" - Propose relationship name for a Connection class`;

		const result = `
ceds2 -${switchName}: Propose a relationship name, direction, and property list

PURPOSE:
  Given a Connection class, propose an UPPER_SNAKE_CASE relationship name,
  direction (from -> to), and which properties become relationship properties.

USAGE:
  ceds2 -nameSuggest "ClassName" [--classification=path] [--all-connections] [--json]

PARAMETERS:
  "ClassName"               Connection class name
  --classification=path     Path to Stage 1 classification artifact
  --all-connections         Run for ALL connection classes in the classification
  --json                    Output as structured JSON
  --format=<fmt>            Output format: json, text, table, markdown

EXAMPLES:
  ceds2 -nameSuggest "K12 Student Enrollment"
  ceds2 -nameSuggest "K12 Student Enrollment" --json
  ceds2 -nameSuggest --all-connections --classification=./classification.json --json
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
