#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName, employerModuleName } = {}) => {
		const listingText = `${employerModuleName}: ceds2 -${switchName} --view-spec=<path> - Generate Cypher statements from surfacing view spec`;

		const result = `
ceds2 -${switchName}: Generate Cypher CREATE/MERGE statements for building the knowledge graph in Neo4j

PURPOSE:
  Produce Cypher statements that create the surfaced knowledge graph as a new
  graph layer in Neo4j. Uses a label prefix (default KG_) to keep the surfaced
  graph separate from the source ontology.

USAGE:
  ceds2 -materializeCypher --view-spec=<path> [--output=<path>] [--mode=<mode>] [--label-prefix=<prefix>] [--database=<name>]

PARAMETERS:
  --view-spec=<path>       Path to surfacing view specification (Stage 3 output, required)
  --output=<path>          Output file path (default: ./ceds-kg.cypher)
  --mode=<mode>            Output mode: schema | template | demo (default: schema)
                             schema   — constraints, node type meta-nodes, relationship type meta-nodes
                             template — parameterized Cypher templates for instance loading
                             demo     — small synthetic demo graph
  --label-prefix=<prefix>  Prefix for node labels in materialized graph (default: KG_)
  --database=<name>        Target Neo4j database name (adds :USE directive)
  --json                   Output result metadata as JSON
  --format=<fmt>           Output format: json | text | table | markdown

EXAMPLES:
  ceds2 -materializeCypher --view-spec=./surfacing-view.json --output=./ceds-kg.cypher
  ceds2 -materializeCypher --view-spec=./surfacing-view.json --mode=demo --label-prefix=DEMO_
  ceds2 -materializeCypher --view-spec=./surfacing-view.json --mode=template --database=cedskg --json
`;

		const getResult = () => result;
		const getListing = () => listingText;

		return { getResult, getListing };
	};

module.exports = moduleFunction({ moduleName });
