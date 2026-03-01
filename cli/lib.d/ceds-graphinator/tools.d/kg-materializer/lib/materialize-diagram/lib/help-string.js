#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} --view-spec=<path> - Generate graph visualization diagram`;

		const result = `
ceds2 -${switchName}: Generate a graph visualization specification

PURPOSE:
  Produce a visualization of the surfaced knowledge graph in Mermaid, Cytoscape.js,
  or Graphviz DOT format. Shows node types (Things) and their relationships with
  optional property annotations.

USAGE:
  ceds2 -materializeDiagram --view-spec=<path> [--output=<path>] [--diagram-format=<fmt>] [--center=<class>] [--show-properties] [--scope=<config>]

PARAMETERS:
  --view-spec=<path>          Path to surfacing view specification (Stage 3 output, required)
  --output=<path>             Output file path (default: ./ceds-kg-diagram; extension added per format)
  --diagram-format=<fmt>      Output format: mermaid | cytoscape | dot (default: mermaid)
  --center=<class>            Center the diagram on a specific Thing class
  --show-properties           Include property lists on edges (can be verbose)
  --scope=<config>            Limit to specific domains
  --json                      Output result metadata as JSON
  --format=<fmt>              Output format: json | text | table | markdown

EXAMPLES:
  ceds2 -materializeDiagram --view-spec=./surfacing-view.json --diagram-format=mermaid
  ceds2 -materializeDiagram --view-spec=./surfacing-view.json --diagram-format=cytoscape --output=./kg-viz.json
  ceds2 -materializeDiagram --view-spec=./surfacing-view.json --diagram-format=dot --center="Person"
  ceds2 -materializeDiagram --view-spec=./surfacing-view.json --diagram-format=mermaid --show-properties --json
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
