#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} "ClassName" - Analyze Connection class bridge endpoints and properties`;

		const result = `
ceds2 -${switchName}: Analyze a Connection class structure

PURPOSE:
  Determine what a Connection class bridges, its directionality, property
  character, and hub path. Used before naming a relationship in Stage 2.

USAGE:
  ceds2 -connectionAnalysis "ClassName" [--classification=path] [--json]

PARAMETERS:
  "ClassName"               Connection class name to analyze
  --classification=path     Path to Stage 1 classification artifact (optional)
  --json                    Output as structured JSON
  --format=<fmt>            Output format: json, text, table, markdown

EXAMPLES:
  ceds2 -connectionAnalysis "K12 Student Enrollment"
  ceds2 -connectionAnalysis "K12 Student Enrollment" --json
  ceds2 -connectionAnalysis "Staff Employment" --classification=./classification-artifact.json
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
