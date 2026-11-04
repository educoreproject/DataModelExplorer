'use strict';
// The registry loop of the MCP door (P2): the tool list is the registry's, a tool's text is the access point's bytes, a refusal is a tool error by name, and every input reaches the core
// as sent, so the core's refusal and not the SDK's answers it. getSchema and cypherQuery are as they were. The real server module and the real gate; a stub behind them.
//
// Run: node server/test/mcp-standards-tools.test.js

const assert = require('assert');
const { mountMcpForTest, postRpc, initializeSession } = require('./lib/mcpTestHarness');
const registry = require('../lib/standards-query/standardsQueryOperations.json');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();

let passCount = 0;
let failCount = 0;
const ok = (checkName, isPassing, detailText) => {
	passCount += isPassing ? 1 : 0;
	failCount += isPassing ? 0 : 1;
	console.log(`  ${isPassing ? 'PASS' : 'FAIL'}: ${checkName}${!isPassing && detailText ? ` — ${detailText}` : ''}`);
};

const coreCallList = [];
const accessPointsDotD = {
	'dme-cypher-query': ({ action }, done) => done('', action === 'schema' ? [{ schema: 'the schema text' }] : [{ rowFromCypher: true }]),
	'standards-query': (coreCall, done) => {
		coreCallList.push(coreCall);
		if (coreCall.input.q === 'accessPointFails') {
			done('a private failure text');
			return;
		}
		const isRefused = coreCall.input.q === 'refuseMe';
		done('', { httpStatus: isRefused ? 400 : 200, bodyText: isRefused ? '{"answer":{"refusedByName":"search","refusalName":"testRefusal"}}' : '{"answer":{"bytes":"exactly  these ü"}}', cachePolicy: 'noStore' });
	},
};

const callTool = (harness, toolName, toolArguments, done) => postRpc({ port: harness.port, sessionRefId: harness.sessionRefId, isLoopback: true, method: 'tools/call', params: { name: toolName, arguments: toolArguments } }, (rpcError, rpcResult) => done(rpcError, rpcResult && rpcResult.rpcMessage && rpcResult.rpcMessage.result));

const taskList = new taskListPlus();
taskList.push((args, next) => mountMcpForTest({ mcpConfigValues: { sessionCapPerSub: 10, sessionIdleTtlSeconds: 1800 }, accessPointsDotD }, (mountError, harness) => next(mountError, { ...args, harness })));
taskList.push((args, next) => initializeSession({ port: args.harness.port, isLoopback: true }, (initError, initResult) => {
	const instructionText = initResult.rpcMessage.result.instructions;
	ok('instructions: the old graph text is still there', /Use cypherQuery to execute read-only Cypher queries/.test(instructionText));
	ok('instructions: the shared refusal paragraph is there', /it is NOT "no such data"/.test(instructionText) && /refusedByName, refusalName and reason/.test(instructionText));
	ok('instructions: an internal name is translated', /dme_list_standards is standards_standards/.test(instructionText) && /dme_find_mappings is standards_mappings/.test(instructionText) && /dme_graph_retriever is standards_neighbourhood/.test(instructionText));
	ok('instructions: no internal tool without a counterpart is translated', !/dme_raw_cypher|dme_calculate|dme_history/.test(instructionText));
	next(initError, { ...args, harness: { ...args.harness, sessionRefId: initResult.sessionRefId } });
}));
taskList.push((args, next) => postRpc({ port: args.harness.port, sessionRefId: args.harness.sessionRefId, isLoopback: true, method: 'tools/list' }, (listError, listResult) => {
	const toolList = listResult.rpcMessage.result.tools;
	const toolByName = toolList.reduce((soFar, oneTool) => ({ ...soFar, [oneTool.name]: oneTool }), {});
	const expectedRowList = registry.operationList.filter((registryRow) => registryRow.doorList.includes('mcp'));
	ok('list: thirteen standards tools beside the two', expectedRowList.length === 13 && toolList.length === 15, `${toolList.length}`);
	ok('list: every mcp row is a tool under its registry name', expectedRowList.every((registryRow) => toolByName[registryRow.mcpToolName]));
	ok('list: usage is no tool', !toolList.some((oneTool) => /usage/i.test(oneTool.name)));
	ok('list: every description is the registry row', expectedRowList.every((registryRow) => toolByName[registryRow.mcpToolName].description === registryRow.description));
	ok('list: getSchema unchanged', toolByName.getSchema.description === 'Returns the knowledge graph schema: node labels, relationships, properties, and example Cypher queries.' && !toolByName.getSchema.inputSchema.required);
	ok('list: cypherQuery unchanged', toolByName.cypherQuery.description === 'Execute a read-only Cypher query against the education standards knowledge graph. Returns results as JSON.' && toolByName.cypherQuery.inputSchema.required.includes('query'));
	const searchSchema = toolByName.standards_search.inputSchema;
	ok('schema: required is published', JSON.stringify(searchSchema.required) === '["q"]', JSON.stringify(searchSchema));
	ok('schema: an enum is published', JSON.stringify(searchSchema.properties.mode.enum) === '["hybrid","keyword","vector"]');
	ok('schema: a positive integer is published', searchSchema.properties.page.type === 'integer' && searchSchema.properties.page.minimum === 1);
	const rowDetailSchemaOf = (toolName) => toolByName[toolName].inputSchema.properties.rowDetail;
	ok('schema: rowDetail is offered on the three that take it, with its values and default', ['standards_mappings', 'standards_element', 'standards_graph'].every((toolName) => JSON.stringify(rowDetailSchemaOf(toolName).enum) === '["summary","full"]' && rowDetailSchemaOf(toolName).default === 'summary'));
	ok('schema: rowDetail is on no other tool', expectedRowList.filter((registryRow) => !['mappings', 'element', 'graph'].includes(registryRow.operationName)).every((registryRow) => !rowDetailSchemaOf(registryRow.mcpToolName)));
	ok('schema: expectManifest is offered', searchSchema.properties.expectManifest && searchSchema.properties.expectManifest.description.length > 10);
	ok('schema: unknown fields are declared out', searchSchema.additionalProperties === false);
	ok('schema: a tool with no inputs of its own has an object schema', toolByName.standards_stats.inputSchema.type === 'object' && Object.keys(toolByName.standards_stats.inputSchema.properties).join() === 'expectManifest');
	ok('annotation: the tools say they only read', toolByName.standards_search.annotations.readOnlyHint === true);
	next(listError, args);
}));
taskList.push((args, next) => callTool(args.harness, 'standards_search', { q: 'birth', page: 2 }, (callError, toolResult) => {
	ok('call: the text is the body, byte for byte', toolResult.content.length === 1 && toolResult.content[0].text === '{"answer":{"bytes":"exactly  these ü"}}');
	ok('call: an answer is no error', !toolResult.isError);
	const coreCall = coreCallList[coreCallList.length - 1];
	ok('call: the operation is the row\'s', coreCall.operationName === 'search');
	ok('call: a number arrives as the text a URL would give', coreCall.input.page === '2' && coreCall.input.q === 'birth');
	ok('call: the loopback path is the anonymous principal', coreCall.principal.kind === 'anonymous');
	next(callError, args);
}));
taskList.push((args, next) => callTool(args.harness, 'standards_search', { q: 'refuseMe' }, (callError, toolResult) => {
	ok('refusal: a tool error', toolResult.isError === true);
	ok('refusal: the same bytes', toolResult.content[0].text === '{"answer":{"refusedByName":"search","refusalName":"testRefusal"}}');
	next(callError, args);
}));
// what the SDK would otherwise answer or drop on its own
taskList.push((args, next) => callTool(args.harness, 'standards_search', { q: 'x', mode: 'badMode', noSuchInput: 'y', caseSensitive: true }, (callError, toolResult) => {
	const { input } = coreCallList[coreCallList.length - 1];
	ok('input: a bad enum reaches the core', !toolResult.isError && input.mode === 'badMode');
	ok('input: an unknown field reaches the core', input.noSuchInput === 'y');
	ok('input: a boolean arrives as text', input.caseSensitive === 'true');
	next(callError, args);
}));
taskList.push((args, next) => callTool(args.harness, 'standards_search', { page: ['2'] }, (callError, toolResult) => {
	const { input } = coreCallList[coreCallList.length - 1];
	ok('input: a missing required input reaches the core', !toolResult.isError && input.q === undefined);
	ok('input: an array reaches the core as an array, for it to refuse', Array.isArray(input.page));
	next(callError, args);
}));
taskList.push((args, next) => callTool(args.harness, 'standards_search', { q: 'accessPointFails' }, (callError, toolResult) => {
	const bodyText = toolResult.content[0].text;
	ok('failure: refused by name as queryFailed', toolResult.isError === true && JSON.parse(bodyText).answer.refusalName === 'queryFailed');
	ok('failure: the private text stays private', !/private failure/.test(bodyText));
	next(callError, args);
}));
taskList.push((args, next) => callTool(args.harness, 'getSchema', {}, (callError, toolResult) => {
	ok('getSchema: answers as before', toolResult.content[0].text === 'the schema text');
	next(callError, args);
}));
taskList.push((args, next) => callTool(args.harness, 'cypherQuery', { query: 'RETURN 1' }, (callError, toolResult) => {
	ok('cypherQuery: answers as before', JSON.parse(toolResult.content[0].text)[0].rowFromCypher === true);
	next(callError, args);
}));
taskList.push((args, next) => initializeSession({ port: args.harness.port, bearerToken: 'userOne:grantOne' }, (initError, initResult) => {
	postRpc({ port: args.harness.port, sessionRefId: initResult.sessionRefId, bearerToken: 'userOne:grantOne', method: 'tools/call', params: { name: 'standards_stats', arguments: {} } }, (callError) => {
		const { principal } = coreCallList[coreCallList.length - 1];
		ok('oauth: the principal is the bearer\'s', principal.kind === 'oauthUser' && principal.userRefId === 'userOne' && principal.role === 'user');
		next(initError || callError, args);
	});
}));
// a restricted row on this door would be open to any OAuth user: it must not start
taskList.push((args, next) => {
	const { toolFactsFromRegistry } = require('../lib/mcp-server/standardsQueryTools');
	const restrictedRegistry = { ...registry, operationList: registry.operationList.map((registryRow) => (registryRow.operationName === 'usage' ? { ...registryRow, doorList: ['api', 'mcp'], mcpToolName: 'standards_usage' } : registryRow)) };
	assert.throws(() => toolFactsFromRegistry({ registry: restrictedRegistry, providerToolList: [] }), /usage/);
	ok('registry: a restricted row on the mcp door throws by name', true);
	next('', args);
});
pipeRunner(taskList.getList(), {}, (pipeError, args) => {
	if (pipeError) {
		ok('the run finished', false, String(pipeError));
	}
	args.harness.closeServer();
	console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===\n`);
	process.exit(failCount > 0 ? 1 : 0);
});
