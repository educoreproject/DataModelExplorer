#!/usr/bin/env node
'use strict';

// schema-provider-roles.test.js — W-D-17 (campaign P1, 2026-10-06; V2-C33, V2-P12, V2-S44). The MCP getSchema text
// introspects labels and relationship types live, yet its prose named six roles (the graph holds twelve), offered
// 'CEDS, LIF, SIF' as the sources and 'SifField, LifProperty' as labels (none exist), and claimed HAS_PROPERTY /
// HAS_OPTION_SET / HAS_SUPPORT universally (SIF has none; HAS_SUPPORT starts only at a standard root). The role and source
// lines are now generated from the live graph, example labels come from db.labels(), and the structure text says what
// differs per standard. LIVE against the dev golden, READ session.
//
//   node server/lib/schema-provider-roles.test.js [pathToSchemaProvider]

const path = require('path');
process.global = { xLog: { status: () => {}, error: () => {}, verbose: () => {} } };
const schemaProvider = require(process.argv[2] || './schema-provider');
const { resolveContainerConnection } = require('../data-model/lib/user-graph/container-connection-resolver');
const { readGoldenContainerName } = require('../test/lib/goldenContainerName');
const neo4jGen = require('../data-model/lib/neo4j-instance/neo4j-instance')({ unused: true });

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ' — ' + detailText : ''}`);
};
console.log('\n=== W-D-17 schema-provider: roles, sources and labels from the live graph ===\n');

const connection = resolveContainerConnection(readGoldenContainerName());
neo4jGen.initDatabaseInstance({ neo4jBoltUri: connection.boltUri, neo4jUser: connection.user, neo4jPassword: connection.password, readOnly: true, queryTimeoutMs: 30000 }, (initError, neo4jDb) => {
	if (initError) { console.error(initError); process.exit(1); }
	neo4jDb.runQuery('MATCH (n:ForgedNode) WHERE n.role IS NOT NULL RETURN DISTINCT n.role AS role ORDER BY role', {}, (roleError, roleRows) => {
		neo4jDb.runQuery('MATCH (n:ForgedNode) WHERE n._source IS NOT NULL RETURN DISTINCT n._source AS source ORDER BY source', {}, (sourceError, sourceRows) => {
			schemaProvider({ neo4jDb })((schemaError, schemaText) => {
				ok('renders', !schemaError && typeof schemaText === 'string', schemaError);
				const roleLine = (schemaText || '').split('\n').find((lineText) => /\*\*`role` property\*\*/.test(lineText)) || '';
				const liveRoleList = (roleRows || []).map((oneRow) => oneRow.role);
				ok(`the role line lists exactly the ${liveRoleList.length} live roles`, liveRoleList.length > 0 && liveRoleList.every((roleName) => roleLine.includes(roleName)) && (roleLine.match(/\bDme[A-Za-z]+|\bHub[A-Za-z]+/g) || []).filter((roleName) => !liveRoleList.includes(roleName)).length === 0, roleLine.slice(0, 220));
				const sourceLine = (schemaText || '').split('\n').find((lineText) => /\*\*`_source` property\*\*/.test(lineText)) || '';
				const liveSourceList = (sourceRows || []).map((oneRow) => oneRow.source);
				ok('the _source line lists exactly the live _source values', liveSourceList.length > 0 && liveSourceList.every((sourceName) => sourceLine.includes(sourceName)) && !/\bLIF\b/.test(sourceLine), sourceLine.slice(0, 220));
				ok('no literal label or source the graph does not hold (LIF, SifField, LifProperty)', !/\bLIF\b|SifField|LifProperty/.test(schemaText || ''));
				ok('DmeProperty is no longer said to own HAS_SUPPORT', !/DmeProperty\*\*[^\n]*HAS_SUPPORT\)/.test(schemaText || '') && /HAS_SUPPORT[^\n]*standard root/.test(schemaText || ''));
				ok('the codeset example reaches SIF code sets (CONSTRAINED_BY, through instances)', /HAS_INSTANCE\]->\(\)-\[:HAS_OPTION_SET\|CONSTRAINED_BY\]/.test(schemaText || ''));
				ok('the Structural Edges section names REFERENCES_TYPE and REFERENCES_OBJECT', /## Structural Edges[^#]*REFERENCES_TYPE[^#]*REFERENCES_OBJECT/.test(schemaText || ''));
				neo4jDb.close();
				console.log(`\n=== W-D-17 — Results: ${passed} passed, ${failed} failed ===\n`);
				process.exit(failed > 0 ? 1 : 0);
			});
		});
	});
});
