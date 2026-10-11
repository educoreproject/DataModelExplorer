#!/usr/bin/env node
'use strict';

// provider-standard-tools.test.js — W-D-19 (campaign P1, 2026-10-06; V2-C25, supervisor ruling 3). provider.json carried
// 15 per-standard tools (usecase_/lif_/clr_graph_*) for standards this graph does not hold: askMilo saw 26 tools, a
// third of them answering an absent standard (the *_stats verbs with a silent zero). A per-standard tool may exist only
// for a standard in the live inventory. LIVE: reads the _source list and holds every non-dme tool's standard prefix to it.
//
//   node cli/lib.d/data-model-explorer/test/provider-standard-tools.test.js [pathToProvider.json]

const path = require('path');
const fs = require('fs');
const harness = require('./lib/liveGraphHarness')({ gateTitle: 'W-D-19 provider.json exposes per-standard tools only for live standards' });
const { assert, runQuery, finish } = harness;
const providerFilePath = process.argv[2] || path.join(harness.dmeDirPath, 'provider.json');
const providerToolList = JSON.parse(fs.readFileSync(providerFilePath, 'utf8')).tools;

runQuery('MATCH (n:ForgedNode) WHERE n._source IS NOT NULL RETURN DISTINCT toLower(n._source) AS lowerSource', {}, (err, rowList) => {
	if (err) { finish(err); return; }
	const liveLowerSourceList = rowList.map((oneRow) => oneRow.lowerSource);
	const perStandardToolList = providerToolList.filter((oneTool) => !/dataModelExplorerSearch\.js /.test(oneTool.cli.command));
	const absentStandardToolList = perStandardToolList.filter((oneTool) => {
		const standardPrefix = oneTool.definition.name.split('_')[0].toLowerCase();
		return !liveLowerSourceList.some((lowerSource) => lowerSource.startsWith(standardPrefix));
	});
	assert(`no per-standard tool for a standard the graph does not hold (${perStandardToolList.length} per-standard tool(s); live: ${liveLowerSourceList.length} sources)`, absentStandardToolList.length === 0, absentStandardToolList.map((oneTool) => oneTool.definition.name).join(', '));
	finish();
});
