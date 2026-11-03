'use strict';
// standards-query-registry.test.js — what can be proved of the standards query service without a graph or a server (standardsQueryService-110326, G1.8 and the parts G1.5 can show alone):
//   1. the registry: every row complete, a description on every row (G1.8), every refusal a verb can give has an HTTP status, no smith_ or rosetta name.
//   2. the OpenAPI document: lists every registry route, every $ref resolves, every refusal is documented.
//   3. admitRequest: anonymous, a site user by user.role never by noToken, a role of public is nobody, an unknown door is refused.
//   4. the limiter: the 61st request in a minute refused with Retry-After, keyed by what it is given, a burst bound, room again after the minute.
//   5. stripCoreAdditions: removes exactly what a row declares.
//   6. the endpoint source: no reading of X-Forwarded-For.
// Run: node server/test/standards-query-registry.test.js

const fs = require('fs');
const path = require('path');

process.global = { xLog: { status() {}, error() {}, verbose() {}, result() {} }, getConfig: () => ({}), rawConfig: {}, commandLineParameters: { switches: {}, values: {} } };

const registry = require('../lib/standards-query/standardsQueryOperations.json');
const { openApiDocumentFor } = require('../lib/standards-query/openApiEmitter');
const { admitRequest } = require('../lib/standards-query/admitRequest');
const { createRequestLimiter } = require('../lib/standards-query/requestLimiter');
const { stripCoreAdditions, STEP_BY_NAME } = require('../lib/standards-query/answerSteps');
const { VERB_PAYLOAD_CONTRACT, VERB_INPUT_CONTRACT } = require('../../cli/lib.d/data-model-explorer/lib/toolPayloadContract');

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

// ---- 1. the registry
const statusByName = { ...registry.verbRefusalHttpStatusByName, ...registry.envelopeRefusalHttpStatusByName };
const REQUIRED_ROW_FIELD_LIST = ['operationName', 'routeName', 'inputFieldList', 'doorList', 'admission', 'permissionList', 'description', 'refusalNameList', 'answerStepList', 'uriFieldRuleList', 'coreAddedFieldList', 'coreHandlerName', 'cachePolicy', 'bodyForm'];
registry.operationList.forEach((row) => {
	const absentList = REQUIRED_ROW_FIELD_LIST.filter((fieldName) => row[fieldName] === undefined);
	ok(`row ${row.operationName}: complete`, absentList.length === 0, absentList.join(', '));
	ok(`row ${row.operationName}: has a description (G1.8)`, typeof row.description === 'string' && row.description.trim().length > 20);
	ok(`row ${row.operationName}: its cache policy is declared`, registry.cacheControlByPolicy[row.cachePolicy] !== undefined);
	const unknownStepList = row.answerStepList.filter((stepName) => !STEP_BY_NAME[stepName]);
	ok(`row ${row.operationName}: every answer step exists`, unknownStepList.length === 0, unknownStepList.join(', '));
	if (row.cliVerb) {
		ok(`row ${row.operationName}: its verb exists`, VERB_INPUT_CONTRACT[row.cliVerb] !== undefined);
		const undeclaredList = VERB_PAYLOAD_CONTRACT[row.cliVerb].refusalNameList.filter((refusalName) => statusByName[refusalName] === undefined);
		ok(`row ${row.operationName}: every refusal its verb can give has an HTTP status`, undeclaredList.length === 0, undeclaredList.join(', '));
		const unlistedList = VERB_PAYLOAD_CONTRACT[row.cliVerb].refusalNameList.filter((refusalName) => refusalName !== 'unknownFlag' && !row.refusalNameList.includes(refusalName));
		ok(`row ${row.operationName}: lists every refusal its verb can give`, unlistedList.length === 0, unlistedList.join(', '));
		const badInputList = row.inputFieldList.filter((field) => field.verbInputName && !VERB_INPUT_CONTRACT[row.cliVerb].positionalList.concat(VERB_INPUT_CONTRACT[row.cliVerb].flagList).includes(field.verbInputName));
		ok(`row ${row.operationName}: every verb input is one the verb takes`, badInputList.length === 0, badInputList.map((field) => field.name).join(', '));
	}
	const undeclaredRefusalList = row.refusalNameList.filter((refusalName) => statusByName[refusalName] === undefined);
	ok(`row ${row.operationName}: every listed refusal has an HTTP status`, undeclaredRefusalList.length === 0, undeclaredRefusalList.join(', '));
});
const twelveOperationList = ['search', 'grep', 'element', 'mappings', 'pair', 'codesets', 'unmapped', 'stats', 'standards', 'graph', 'neighbourhood', 'guide'];
ok('the twelve core operations are on both doors', twelveOperationList.every((operationName) => { const row = registry.operationList.find((one) => one.operationName === operationName); return row && row.doorList.includes('api') && row.doorList.includes('mcp') && row.mcpToolName === `standards_${operationName}`; }));
const registryText = JSON.stringify(registry.operationList.map(({ operationName, routeName, mcpToolName }) => ({ operationName, routeName, mcpToolName })));
ok('nothing Smith or rosetta is in the registry', !/smith|rosetta/i.test(registryText) && !/smith_/i.test(JSON.stringify(registry)));
ok('usage is for admin and super alone', JSON.stringify(registry.operationList.find((row) => row.operationName === 'usage').permissionList) === '["admin","super"]');

// ---- 2. the OpenAPI document
const inputCapByName = { maxQueryChars: 500, maxPatternChars: 200 };
const openApiDocument = openApiDocumentFor({ registry, manifestLabel: 'testManifest', inputCapByName });
ok('openapi: version 3.1 and the manifest in info.version', openApiDocument.openapi === '3.1.0' && openApiDocument.info.version === 'v1+testManifest');
registry.operationList.forEach((row) => ok(`openapi: lists ${row.routeName}`, openApiDocument.paths[`/${row.routeName}`] !== undefined));
const refList = JSON.stringify(openApiDocument).match(/"#\/components\/schemas\/[A-Za-z]+"/g).map((refText) => refText.slice(1, -1).split('/').pop());
ok('openapi: every $ref resolves', refList.every((schemaName) => openApiDocument.components.schemas[schemaName] !== undefined));
ok('openapi: no undefined response status', Object.values(openApiDocument.paths).every((onePath) => !Object.keys(onePath.get.responses).includes('undefined')));
ok('openapi: mentions no smith or rosetta', !/smith|rosetta/i.test(JSON.stringify(openApiDocument)));
const searchPath = openApiDocument.paths['/search'].get;
ok('openapi: a capped input says its cap', searchPath.parameters.find((param) => param.name === 'q').schema.maxLength === 500);
ok('openapi: inputTooLong is documented as 413', /inputTooLong/.test(searchPath.responses[413].description));

// ---- 3. admitRequest
const publicRow = { admission: 'public' };
const admitted = (door, credential, row = publicRow) => { let outcome; admitRequest({ door, credential, operationName: 'test', registryRow: row }, (admitError, result) => { outcome = admitError ? { admitError } : result; }); return outcome; };
ok('admit: no credential is anonymous', admitted('api', undefined).principal.kind === 'anonymous');
ok('admit: the no-token claims are anonymous', admitted('api', { noToken: true, user: { role: 'public' } }).principal.kind === 'anonymous');
ok('admit: a login token carrying noToken and a real role is a site user', admitted('api', { noToken: true, user: { role: 'admin', refId: 'u1' } }).principal.kind === 'siteUser');
ok('admit: the site user is named by refId', admitted('api', { user: { role: 'user', refId: 'u2' } }).principal.userRefId === 'u2');
ok('admit: an OAuth bearer is an oauth user', admitted('mcp', { sub: 'u3', role: 'user' }).principal.kind === 'oauthUser');
ok('admit: an unknown door is an error by name', /unknown door/.test(admitted('slack', {}).admitError));
ok('admit: signedIn refuses the anonymous by name', admitted('api', undefined, { admission: 'signedIn' }).refusal.refusalName === 'signedInRequired');
ok('admit: signedIn takes a site user', admitted('api', { user: { role: 'user', refId: 'u4' } }, { admission: 'signedIn' }).principal.kind === 'siteUser');

// ---- 4. the limiter
let clockMs = 1000000;
const limiter = createRequestLimiter({ requestsPerMinute: 60, burstPerSecond: 20, nowMs: () => clockMs });
const verdictList = [];
for (let requestIndex = 0; requestIndex < 61; requestIndex += 1) { clockMs += 200; verdictList.push(limiter.admit('192.0.2.1')); }
ok('limiter: the first 60 in a minute pass', verdictList.slice(0, 60).every((verdict) => verdict.isAdmitted));
ok('limiter: the 61st is refused with a Retry-After', verdictList[60].isAdmitted === false && verdictList[60].retryAfterSeconds >= 1, JSON.stringify(verdictList[60]));
ok('limiter: another address is untouched', limiter.admit('192.0.2.2').isAdmitted === true);
clockMs += 61000;
ok('limiter: room again after the minute', limiter.admit('192.0.2.1').isAdmitted === true);
const burstLimiter = createRequestLimiter({ requestsPerMinute: 60, burstPerSecond: 20, nowMs: () => clockMs });
const burstVerdictList = [];
for (let requestIndex = 0; requestIndex < 21; requestIndex += 1) { burstVerdictList.push(burstLimiter.admit('192.0.2.3')); }
ok('limiter: the 21st inside a second is refused', burstVerdictList[20].isAdmitted === false && burstVerdictList[19].isAdmitted === true);
let threwByName = '';
try { createRequestLimiter({ requestsPerMinute: 0, burstPerSecond: 20, nowMs: Date.now }); } catch (limitError) { threwByName = limitError.message; }
ok('limiter: an absent limit is refused by name, never defaulted', /requestsPerMinute/.test(threwByName));

// ---- 5. stripCoreAdditions
const declaredRow = { uriFieldRuleList: [{ pathText: 'rowList[]', stableIdField: 'stableId', standardField: 'standard', addFieldName: 'uri' }, { pathText: 'rowList[].edgeList[]', stableIdField: 'targetStableId', standardField: 'targetSource', addFieldName: 'targetUri' }], coreAddedFieldList: [{ pathText: '', fieldName: 'searchScope' }, { pathText: 'rowList[]', fieldName: 'cardUri' }] };
const addedAnswer = { searchScope: {}, standardElementListByName: {}, pageNumber: 1, pageSize: 20, rowList: [{ stableId: 'a', node: { uri: 'kept' }, uri: 'x', uriKind: 'edc', resolvesHere: true, cardUri: 'y', cardUriKind: 'edc', cardResolvesHere: true, edgeList: [{ targetStableId: 'b', targetUriAbsentReason: 'r' }, { targetStableId: 'c', targetUri: 'z', targetUriKind: 'ownIri', targetResolvesHere: false }] }] };
ok('strip: removes what the row declares, with its companions, and nothing else', JSON.stringify(stripCoreAdditions(addedAnswer, declaredRow)) === JSON.stringify({ rowList: [{ stableId: 'a', node: { uri: 'kept' }, edgeList: [{ targetStableId: 'b' }, { targetStableId: 'c' }] }] }), JSON.stringify(addedAnswer));

// ---- 6. the header a client writes
const endpointText = fs.readFileSync(path.join(__dirname, '..', 'endpoints-dot-d', 'qtDotLib.d', 'standards-query.js'), 'utf8').split('\n').filter((oneLine) => !oneLine.trim().startsWith('//')).join('\n');
ok('endpoint: the limiter is keyed on req.ip', /requestLimiter\.admit\(xReq\.ip\)/.test(endpointText));
ok('endpoint: no code reads X-Forwarded-For', !/forwarded/i.test(endpointText));

console.log(`\nstandards-query-registry: ${passedCount} passed, ${failedCount} failed`);
process.exit(failedCount === 0 ? 0 : 1);
