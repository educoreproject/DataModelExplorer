#!/usr/bin/env node
'use strict';

// grep-live.test.js — lane GREP (2026-10-11), live on the graph dataModelExplorerSearch.ini points at. dme_grep finds an
// element by the SHAPE of its name, which neither search leg can: "every SIF element ending in RefId", "names like BrithDate".
//   (a) regex: totalRowCount is EXACT — equal to this test's own count over the same population (:ForgedNode, not :GraphMeta)
//       — every row's name matches, matchedNodeCountByStandard sums to the total, and SIF Fields (DmeInstance, which the
//       vector index does not hold) are among the matches
//   (b) caseSensitive 'true' changes the answer; a pattern nothing matches answers totalRowCount 0 with shortPageNote
//   (c) field description counts descriptions, again equal to this test's own count
//   (d) fuzzy: BrithDate ranks BirthDate first, every row at or above minimumSimilarity, best first; DateOfBirth does not
//       find BirthDate (spelling, not meaning)
//   (e) every input refusal is answered by name on stdout, exit 0, before the graph is read
//   (f) a pattern that backtracks without end on this data is stopped: grepTimeout, and the graph answers at once afterwards
//   (g) apocTextUnavailable: a twin that requires a function the graph does not load refuses fuzzy by name
//
//   node cli/lib.d/data-model-explorer/test/grep-live.test.js [pathToDataModelExplorerSearch.js]

const path = require('path');
const harness = require('./lib/liveGraphHarness')({ gateTitle: 'lane GREP dme_grep (regex and fuzzy name search)' });
const { assert, runQuery, runVerb, finish, taskListPlus, pipeRunner, dmeDirPath } = harness;
const cliFilePath = process.argv[2];

const CONTENT_POPULATION_TEXT = 'MATCH (node:ForgedNode) WHERE NOT node:GraphMeta';
const payloadSummaryOf = (payload) => JSON.stringify({ ...payload, resultList: (payload.resultList || []).slice(0, 3).map((oneRow) => [oneRow.name, oneRow.standard, oneRow.role, oneRow.similarityScore]), scoreUnitByField: undefined }).slice(0, 400);

const taskList = new taskListPlus();
taskList.push((args, next) => runQuery(`${CONTENT_POPULATION_TEXT} AND node._source = 'SIF260928' AND node.name =~ '(?i).*RefId' RETURN count(node) AS nodeCount, count(CASE WHEN node.role = 'DmeInstance' THEN 1 END) AS instanceCount`, {}, (err, rowList) => {
	const expectedRow = (rowList || [])[0] || {};
	runVerb(['-grep', '--pattern=RefId$', '--standard=SIF260928'], (verbErr, outcome) => {
		const payload = outcome.parsedStdout || {};
		const countSum = Object.values(payload.matchedNodeCountByStandard || {}).reduce((runningTotal, oneCount) => runningTotal + oneCount, 0);
		assert('(a) regex RefId$ on SIF260928: totalRowCount equals the test\'s own count over the same population', !err && expectedRow.nodeCount > 50 && payload.totalRowCount === expectedRow.nodeCount && payload.returnedRowCount === 50 && payload.truncatedRowCount === expectedRow.nodeCount - 50, `${err || ''} expected ${JSON.stringify(expectedRow)}; ${payloadSummaryOf(payload)}`);
		assert('(a) every row\'s name ends in RefId (any case), and matchedNodeCountByStandard sums to the total', (payload.resultList || []).length === 50 && payload.resultList.every((oneRow) => /refid$/i.test(oneRow.name) && JSON.stringify(oneRow.matchedFieldList) === '["name"]' && oneRow.standard === 'SIF260928') && countSum === payload.totalRowCount, payloadSummaryOf(payload));
		assert('(a) SIF Fields (DmeInstance) are among the matches: the population is every content node, not the vector index\'s', expectedRow.instanceCount > 0 && (payload.matchedNameSummaryList || []).length > 0 && payload.distinctMatchedNameCount > 0 && payload.scannedNodeCount > payload.totalRowCount, `${JSON.stringify(expectedRow)} ${payloadSummaryOf(payload)}`);
		next('', args);
	}, cliFilePath);
}));
taskList.push((args, next) => runVerb(['-grep', '--pattern=refid$', '--standard=SIF260928', '--caseSensitive=true'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	assert('(b) caseSensitive true: refid$ matches no SIF name (they spell RefId), answered as totalRowCount 0 with shortPageNote', payload.totalRowCount === 0 && payload.caseSensitive === true && Array.isArray(payload.resultList) && payload.resultList.length === 0 && typeof payload.shortPageNote === 'string', payloadSummaryOf(payload));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runQuery(`${CONTENT_POPULATION_TEXT} AND node.description IS NOT NULL WITH node, CASE WHEN node.description IS :: LIST<STRING> THEN node.description ELSE [node.description] END AS descriptionTextList WHERE any(descriptionText IN descriptionTextList WHERE descriptionText =~ '(?is).*transcript.*') RETURN count(node) AS nodeCount`, {}, (err, rowList) => {
	const expectedCount = ((rowList || [])[0] || {}).nodeCount;
	runVerb(['-grep', '--pattern=transcript', '--field=description'], (verbErr, outcome) => {
		const payload = outcome.parsedStdout || {};
		assert('(c) field description: totalRowCount equals the test\'s own count of descriptions holding "transcript"', !err && expectedCount > 0 && payload.totalRowCount === expectedCount && payload.field === 'description' && (payload.resultList || []).every((oneRow) => JSON.stringify(oneRow.matchedFieldList) === '["description"]'), `${err || ''} expected ${expectedCount}; ${payloadSummaryOf(payload)}`);
		next('', args);
	}, cliFilePath);
}));
taskList.push((args, next) => runVerb(['-grep', '--pattern=BrithDate', '--mode=fuzzy'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	const resultList = payload.resultList || [];
	const scoreList = resultList.map((oneRow) => oneRow.similarityScore);
	assert('(d) fuzzy BrithDate: BirthDate first, every row at or above minimumSimilarity, best first', resultList.length > 0 && resultList[0].name.toLowerCase() === 'birthdate' && scoreList.every((oneScore, scoreIndex) => oneScore >= payload.minimumSimilarity && (scoreIndex === 0 || oneScore <= scoreList[scoreIndex - 1])) && payload.similarityFunctionName === 'apoc.text.levenshteinSimilarity', payloadSummaryOf(payload));
	runVerb(['-grep', '--pattern=DateOfBirth', '--mode=fuzzy'], (meaningErr, meaningOutcome) => {
		const meaningPayload = meaningOutcome.parsedStdout || {};
		assert('(d) fuzzy DateOfBirth does not find BirthDate: it matches spelling, not meaning', Array.isArray(meaningPayload.resultList) && !meaningPayload.resultList.some((oneRow) => oneRow.name.toLowerCase() === 'birthdate'), payloadSummaryOf(meaningPayload));
		next('', args);
	}, cliFilePath);
}, cliFilePath));
[
	[['-grep', '--pattern='], 'emptyPattern'],
	[['-grep', '--pattern=(abc'], 'invalidRegex'],
	[['-grep', `--pattern=${'a'.repeat(201)}`], 'patternTooLong'],
	[['-grep', '--pattern=RefId', '--mode=sql'], 'invalidGrepMode'],
	[['-grep', '--pattern=RefId', '--field=title'], 'invalidGrepField'],
	[['-grep', '--pattern=RefId', '--caseSensitive=yes'], 'invalidCaseSensitive'],
	[['-grep', '--pattern=BrithDate', '--mode=fuzzy', '--field=description'], 'flagNotForGrepMode'],
	[['-grep', '--pattern=RefId', '--standard=SIF9'], 'unknownStandard'],
	[['-grep', 'RefId'], 'unknownFlag'],
].forEach(([argumentList, refusalName]) => taskList.push((args, next) => runVerb(argumentList, (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	assert(`(e) ${argumentList.join(' ').slice(0, 60)} -> refusal ${refusalName} on stdout, exit 0`, outcome.status === 0 && payload.refusedByName === 'grep' && payload.refusalName === refusalName && typeof payload.reason === 'string', JSON.stringify(payload).slice(0, 240));
	next('', args);
}, cliFilePath)));
taskList.push((args, next) => {
	const startedAt = Date.now();
	runVerb(['-grep', '--pattern=^(\\w+\\s?)*$'], (err, outcome) => {
		const elapsedMilliseconds = Date.now() - startedAt;
		const payload = outcome.parsedStdout || {};
		assert('(f) a pattern that backtracks without end on these names ends in grepTimeout, stating the limit', outcome.status === 0 && payload.refusalName === 'grepTimeout' && /10000 ms/.test(payload.reason || '') && elapsedMilliseconds < 30000, `${elapsedMilliseconds} ms ${JSON.stringify(payload).slice(0, 240)}`);
		const probeStartedAt = Date.now();
		runQuery('MATCH (node:ForgedNode) WHERE node.name = $name RETURN count(node) AS nodeCount', { name: 'BirthDate' }, (probeErr, rowList) => {
			assert('(f) and the graph answers at once afterwards (nothing left running in it)', !probeErr && ((rowList || [])[0] || {}).nodeCount > 0 && Date.now() - probeStartedAt < 5000, `${probeErr || ''} ${Date.now() - probeStartedAt} ms`);
			next('', args);
		});
	}, cliFilePath);
});
taskList.push((args, next) => {
	// the CLI module compiled in memory (test/lib/moduleTwin.js) requiring one function no graph loads; its search() runs the verb
	const { loadWithMutations } = require('./lib/moduleTwin');
	const twinSearchModule = loadWithMutations({
		modulePath: cliFilePath || path.join(dmeDirPath, 'dataModelExplorerSearch.js'),
		// the shebang line is not JavaScript once wrapped as a module, so the twin drops it
		mutationList: [{ find: '#!/usr/bin/env node\n', replace: '' }, { find: 'const GREP_FUZZY_FUNCTION_NAME_LIST = Object.freeze([GREP_FUZZY_SIMILARITY_FUNCTION_NAME, GREP_FUZZY_NORMALISER_FUNCTION_NAME]);', replace: "const GREP_FUZZY_FUNCTION_NAME_LIST = Object.freeze([GREP_FUZZY_SIMILARITY_FUNCTION_NAME, GREP_FUZZY_NORMALISER_FUNCTION_NAME, 'apoc.text.notLoadedByAnyGraph']);" }],
	});
	twinSearchModule.search('grep', { pattern: 'BrithDate', mode: 'fuzzy', field: 'name', caseSensitive: 'false' }, (err, payload) => {
		assert('(g) fuzzy on a graph lacking a function it needs: apocTextUnavailable by name (regex named as the way that still works)', !err && (payload || {}).refusalName === 'apocTextUnavailable' && /apoc\.text\.notLoadedByAnyGraph/.test(payload.reason || '') && JSON.stringify(payload.validValueList) === '["regex","fuzzy"]', `${err || ''} ${JSON.stringify(payload).slice(0, 240)}`);
		next('', args);
	});
});

pipeRunner(taskList.getList(), {}, (err) => finish(err));
