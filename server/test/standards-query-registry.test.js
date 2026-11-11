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
const { admitRequest } = require('../lib/standards-query/admitRequest');
const { openApiDocumentFor } = require('../lib/standards-query/openApiEmitter');
const { aboutDocumentFor } = require('../lib/standards-query/aboutDocument');
const { SUMMARY_SHAPER_BY_NAME } = require('../lib/standards-query/answerSummaries');

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
// P2's description edits (design section 3): the refusal sentence moved to the MCP server's instructions, every tool says what to do with uri, and no description names the CLI's tools or inputs
const mcpRowList = registry.operationList.filter((row) => row.doorList.includes('mcp'));
ok('descriptions: the refusal sentence is in one place', !mcpRowList.some((row) => /If the result is an object carrying refusedByName/.test(row.description)) && registry.mcpInstructionLineList.some((line) => /it is NOT "no such data"/.test(line)));
ok('descriptions: every tool says uri is permanent', mcpRowList.filter((row) => row.coreHandlerName !== 'rosettaJobs').every((row) => row.description.includes('Every element and card carries uri; quote it, it is permanent.')) && registry.operationList.find((row) => row.operationName === 'rosettaFetch').description.includes('Every card carries uri; quote it, it is permanent.'));
ok('descriptions: none names a dme_ tool', !mcpRowList.some((row) => /dme_/.test(row.description)));
ok('descriptions: none names a mode input the door does not take', !/searchMode keyword/.test(JSON.stringify(mcpRowList.map((row) => row.description))));
// P3 adds retrieval, and only retrieval: no route or tool of the judged step exists until it does
const registryText = JSON.stringify(registry.operationList.map(({ operationName, routeName, mcpToolName }) => ({ operationName, routeName, mcpToolName })));
ok('no Smith in the registry; the rosetta rows are retrieval and the four of the job', !/smith/i.test(JSON.stringify(registry)) && JSON.stringify(registry.operationList.filter((row) => row.doorList.includes('mcp') && /rosetta/i.test(JSON.stringify([row.operationName, row.routeName, row.mcpToolName]))).map((row) => row.mcpToolName)) === '["rosetta_retrieve","rosetta_submit","rosetta_status","rosetta_fetch","rosetta_cancel"]');
// ⟪rosettaFreeInput⟫ the free-text interpreter is the web page's rung 3: one route on the api door, no MCP tool
ok('rosetta/interpret is a web route alone: the api door, no MCP tool', JSON.stringify(registry.operationList.filter((row) => row.routeName === 'rosetta/interpret').map((row) => [row.doorList, row.mcpToolName])) === '[[["api"],null]]');
// ⟪rosettaMeanings R3, TQ Q86⟫ the job rows are open to a visitor the API door can name by address; on MCP each still needs an OAuth sign-in (mcpDoorRefusesLoopback)
ok('a job\'s rows admit a person or a visitor named by address, never an anonymous MCP caller: each names what the unnamed are told, and each refusal has a status', registry.operationList.filter((row) => row.coreHandlerName === 'rosettaJobs').every((row) => row.admission === 'judgedStepOpenToVisitors' && row.mcpDoorRefusesLoopback === true && row.refusalNameList.includes(row.anonymousRefusalName)));
ok('every row declares its method', registry.operationList.every((row) => ['GET', 'POST'].includes(row.httpMethod)));
ok('a POST row names a body limit, and it is the large-body list\'s for both spellings', registry.operationList.filter((row) => row.httpMethod === 'POST').every((row) => { const limitByPath = require('../lib/large-body-route-list.json').jsonBodyLimitByRoutePath; return row.bodyLimitText && limitByPath[`/api/${registry.routeBasePath}/${row.routeName}`] === row.bodyLimitText && limitByPath[`/api/${registry.routeBasePath}/${row.routeName}/`] === row.bodyLimitText; }));
ok('timing gate: a slow row and a slowWhen agree: about cannot call quick what the gate knows is slow', registry.operationList.every((row) => Boolean(row.aboutEntry && row.aboutEntry.slowWhen) === require('../lib/standards-query/standardsQueryTimingBounds.json').rowList.some((oneRow) => oneRow.operationName === row.operationName && oneRow.knownSlow)));
ok('usage is for admin and super alone', JSON.stringify(registry.operationList.find((row) => row.operationName === 'usage').permissionList) === '["admin","super"]');

// ---- 2. the OpenAPI document
const inputCapByName = { maxQueryChars: 500, maxPatternChars: 200 };
const openApiDocument = openApiDocumentFor({ registry, manifestLabel: 'testManifest', inputCapByName });
ok('openapi: version 3.1 and the manifest in info.version', openApiDocument.openapi === '3.1.0' && openApiDocument.info.version === 'v1+testManifest');
registry.operationList.forEach((row) => ok(`openapi: lists ${row.routeName}`, openApiDocument.paths[`/${row.routeName}`] !== undefined));
const refList = JSON.stringify(openApiDocument).match(/"#\/components\/schemas\/[A-Za-z]+"/g).map((refText) => refText.slice(1, -1).split('/').pop());
ok('openapi: every $ref resolves', refList.every((schemaName) => openApiDocument.components.schemas[schemaName] !== undefined));
ok('openapi: no undefined response status', Object.values(openApiDocument.paths).every((onePath) => !Object.keys(Object.values(onePath)[0].responses).includes('undefined')));
ok('openapi: mentions no smith', !/smith/i.test(JSON.stringify(openApiDocument)));
ok('openapi: each route is under the method its row declares', registry.operationList.every((row) => JSON.stringify(Object.keys(openApiDocument.paths[`/${row.routeName}`])) === JSON.stringify([row.httpMethod.toLowerCase()])));
const retrievalBodySchema = openApiDocument.paths['/rosetta/retrieval'].post.requestBody.content['application/json'].schema;
ok('openapi: retrieval documents its body, and each submission form', ['fieldList', 'jsonSchema', 'jsonLdContext', 'hubList', 'rowDetail', 'expectManifest'].every((inputName) => retrievalBodySchema.properties[inputName]) && retrievalBodySchema.properties.fieldList.type === 'array' && retrievalBodySchema.properties.fieldList.items.required[0] === 'name');
ok('openapi: retrieval documents maxFieldListLength as 413', /maxFieldListLength/.test(openApiDocument.paths['/rosetta/retrieval'].post.responses[413].description));
const searchPath = openApiDocument.paths['/search'].get;
ok('openapi: a capped input says its cap', searchPath.parameters.find((param) => param.name === 'q').schema.maxLength === 500);
ok('openapi: inputTooLong is documented as 413', /inputTooLong/.test(searchPath.responses[413].description));

// ---- 2b. rowDetail is documented everywhere it is taken (TQ, 2026-11-04: "Make sure it's well documented")
const ROW_DETAIL_OPERATION_NAME_LIST = ['mappings', 'element', 'graph', 'rosettaRetrieval', 'rosettaFetch'];
const rowDetailRowList = registry.operationList.filter((row) => row.inputFieldList.some((field) => field.name === 'rowDetail'));
ok('rowDetail: taken by exactly the operations ruled', JSON.stringify(rowDetailRowList.map((row) => row.operationName).sort()) === JSON.stringify([...ROW_DETAIL_OPERATION_NAME_LIST].sort()));
rowDetailRowList.forEach((row) => {
	const rowDetailField = row.inputFieldList.find((field) => field.name === 'rowDetail');
	ok(`rowDetail: ${row.operationName} declares its values and its default`, JSON.stringify(rowDetailField.enum) === '["summary","full"]' && rowDetailField.defaultValue === 'summary');
	ok(`rowDetail: ${row.operationName} names a shaper that exists`, typeof SUMMARY_SHAPER_BY_NAME[row.summaryShaperName] === 'function');
	ok(`rowDetail: the ${row.operationName} tool's description states it`, /rowDetail=full/.test(row.description) && row.inputFieldList.some((field) => field.name === 'rowDetail' && /leftOutOfSummary/.test(field.description)));
	const openApiOperation = openApiDocument.paths[`/${row.routeName}`][row.httpMethod.toLowerCase()];
	const openApiParameter = row.httpMethod === 'GET' ? openApiOperation.parameters.find((param) => param.name === 'rowDetail') : { schema: openApiOperation.requestBody.content['application/json'].schema.properties.rowDetail, description: openApiOperation.requestBody.content['application/json'].schema.properties.rowDetail.description };
	ok(`rowDetail: OpenAPI documents it on ${row.routeName}`, openApiParameter && JSON.stringify(openApiParameter.schema.enum) === '["summary","full"]' && openApiParameter.schema.default === 'summary' && /leftOutOfSummary/.test(openApiParameter.description));
});

// ---- 2c. about (G5): nothing can drift, by construction and by these
const ABOUT_LIMITS = { requestsPerMinute: 61, burstPerSecond: 23, inFlightMax: 29, maxQueryChars: 501, maxPatternChars: 201, dailyEmbeddingTokenCeiling: 2000003 };
const ABOUT_DOOR_LIMITS = { sessionCapPerSub: 11, sessionIdleTtlSeconds: 1801, edcPublicPathPrefix: '/edc/', rosettaFuseValues: { maxFieldListLength: 201, maxFieldNameChars: 202, maxFieldDefinitionChars: 2003, maxDocumentDepth: 33, retrievalInFlightMax: 2, retrievalMaxTokensPerRequest: 120007, retrievalDailyTokenCeiling: 2000009, strangerVectorRetentionDays: 31 } };
const aboutOf = (principal) => aboutDocumentFor({ registry, inputCapByName: ABOUT_LIMITS, doorLimitValues: ABOUT_DOOR_LIMITS, publicInstanceName: 'demo.educore.dev', principal });
const anonymousAbout = aboutOf({ kind: 'anonymous', role: '' });
const publicRowList = registry.operationList.filter((row) => row.permissionList.includes('public') && row.isListedInAbout !== false);
registry.operationList.forEach((row) => {
	ok(`about: ${row.operationName} has an entry`, row.aboutEntry && row.aboutEntry.forWhat && row.aboutEntry.exampleShows && row.aboutEntry.exampleInput && Array.isArray(row.aboutEntry.expectedAnswerFieldList));
	const exampleInputNameList = Object.keys((row.aboutEntry || {}).exampleInput || {});
	ok(`about: the example of ${row.operationName} uses only inputs it takes, and every required one`, exampleInputNameList.every((inputName) => row.inputFieldList.some((field) => field.name === inputName)) && row.inputFieldList.filter((field) => field.required).every((field) => exampleInputNameList.includes(field.name)));
});
ok('about: lists every public operation and nothing else', JSON.stringify(anonymousAbout.answer.operationList.map((entry) => entry.operation)) === JSON.stringify(publicRowList.map((row) => row.routeName)));
ok('about: no entry names an operation that does not exist', anonymousAbout.answer.operationList.every((entry) => registry.operationList.some((row) => row.routeName === entry.operation)));
ok('about: every input of every listed operation is described', publicRowList.every((row) => row.inputFieldList.every((field) => { const entry = anonymousAbout.answer.operationList.find((one) => one.operation === row.routeName); return anonymousAbout.answer.sharedInputDescriptionByName[field.name] === field.description || (entry.ownInputDescriptionByName || {})[field.name] === field.description; })));
ok('about: every input is named as required or optional, correctly', publicRowList.every((row) => { const entry = anonymousAbout.answer.operationList.find((one) => one.operation === row.routeName); return row.inputFieldList.every((field) => (field.required ? entry.requiredInputList : entry.optionalInputList).includes(field.name)); }));
ok('about: usage is hidden from the anonymous, a plain user and an OAuth administrator', [anonymousAbout, aboutOf({ kind: 'siteUser', role: 'user' }), aboutOf({ kind: 'oauthUser', role: 'admin' })].every((one) => !one.listsGatedOperation && !one.answer.operationList.some((entry) => entry.operation === 'usage')));
ok('about: usage is shown to a site administrator and marked as not shareable', aboutOf({ kind: 'siteUser', role: 'super' }).listsGatedOperation && aboutOf({ kind: 'siteUser', role: 'admin' }).answer.operationList.some((entry) => entry.operation === 'usage'));
ok('about: the limits are the config\'s, none typed', Object.values(ABOUT_LIMITS).every((limitNumber) => Object.values(anonymousAbout.answer.limitsInForce).includes(limitNumber)) && anonymousAbout.answer.limitsInForce.mcpSessionsPerAccount === 11 && anonymousAbout.answer.limitsInForce.mcpIdleSeconds === 1801);
// G3.9: retrieval's entry says plainly what it is
const retrievalEntry = anonymousAbout.answer.operationList.find((entry) => entry.operation === 'rosetta/retrieval');
ok('about: retrieval says it is a POST, shows the body and names its tool', retrievalEntry.method === 'POST' && retrievalEntry.exampleBody.fieldList.length > 0 && retrievalEntry.mcpTool === 'rosetta_retrieve' && new URL(retrievalEntry.exampleUrl).search === '');
ok('about: retrieval says nothing is judged and a pool is candidates, never an answer', /Nothing is judged/.test(retrievalEntry.whatThisDoesNot) && /candidates/.test(retrievalEntry.whatThisDoesNot) && /never an answer/.test(retrievalEntry.whatThisDoesNot));
ok('about: retrieval says where the text goes and how long, the number the config\'s', /Voyage receives each text/.test(retrievalEntry.whatHappensToYourText) && /stores no text/.test(retrievalEntry.whatHappensToYourText) && /opted out of training/.test(retrievalEntry.whatHappensToYourText) && retrievalEntry.whatHappensToYourText.includes(`for ${ABOUT_DOOR_LIMITS.rosettaFuseValues.strangerVectorRetentionDays} days`) && !retrievalEntry.whatHappensToYourText.includes('{'));
ok('about: retrieval\'s limits are the config\'s', anonymousAbout.answer.limitsInForce.retrieval.fieldsPerSubmission === ABOUT_DOOR_LIMITS.rosettaFuseValues.maxFieldListLength && anonymousAbout.answer.limitsInForce.retrieval.newTextTokensPerDay === ABOUT_DOOR_LIMITS.rosettaFuseValues.retrievalDailyTokenCeiling);
ok('about: quotes no price', !/costEstimate|usdEstimate|judgeUsd|\$[0-9]/i.test(JSON.stringify(anonymousAbout.answer)));
ok('about: names no price per field or per job, in any spelling, on any entry (P4: no public answer states one)', !/perJobCeiling|dailyJudgeCeiling|perPrincipalDaily|UsdPerField/.test(JSON.stringify(anonymousAbout.answer)));
ok('retrieval: its tool description and summary agree on how many fields stay readable', registry.operationList.find((row) => row.operationName === 'rosettaRetrieval').description.includes(`about ${registry.summaryShape.retrievalReadableFieldCount} fields`));
const unconfiguredAbout = aboutDocumentFor({ registry, inputCapByName: ABOUT_LIMITS, doorLimitValues: { sessionCapPerSub: NaN, sessionIdleTtlSeconds: NaN }, publicInstanceName: 'demo.educore.dev', principal: { kind: 'anonymous', role: '' } }).answer;
ok('about: an instance with no MCP limits or uri route says so, and no number or undefined stands in', /refuses new sessions/.test(unconfiguredAbout.limitsInForce.mcpSessions) && unconfiguredAbout.limitsInForce.mcpSessionsPerAccount === undefined && /refuses by name/.test(unconfiguredAbout.limitsInForce.retrieval) && !/undefined|NaN/.test(JSON.stringify(unconfiguredAbout)));
ok('about: the typed prose states no limit number the config owns', !/\b(60|20|500|200)\b/.test(JSON.stringify(registry.aboutText)));
const howToRead = anonymousAbout.answer.howToReadAnAnswer;
ok('about: names the four mappingStatusByHub values', JSON.stringify(Object.keys(howToRead.mappingStatusByHub).sort()) === '["judgedAbstained","mapped","neverOffered","notApplicable"]');
ok('about: names the three pair kinds', JSON.stringify(Object.keys(howToRead.pairStatus).sort()) === '["computedViaHub","declaredCorrespondence","notJudged"]');
ok('about: explains answeredFrom, uri, rowDetail, targetKind and a refusal', ['answeredFrom', 'uri', 'rowDetail', 'targetKind', 'refusal'].every((fieldName) => howToRead[fieldName]) && ['refusedByName', 'refusalName', 'reason', 'validValueList'].every((fieldName) => howToRead.refusal.includes(fieldName)));
ok('about: says a hub\'s silence and an abstention are different things', /neverOffered is silence and judgedAbstained is a decision/.test(howToRead.silenceIsNotAbstention));
ok('about: every example url is real and on the public route', anonymousAbout.answer.operationList.every((entry) => entry.exampleUrl.startsWith('https://demo.educore.dev/standards/v1/') && new URL(entry.exampleUrl).pathname.endsWith(`/${entry.operation}`)));
ok('about: says where the machine description is and what a uri resolves to', anonymousAbout.answer.whereToLookNext.machineDescription === 'https://demo.educore.dev/standards/v1/openapi.json' && anonymousAbout.answer.whereToLookNext.whatAUriResolvesTo.includes('https://demo.educore.dev/edc/'));
// ⟪P7b Addendum 1, TQ 2026-11-09⟫ w3id.org forwards https://w3id.org/EDUcore/ to production's /edc/ since its PR merged: the about document says so, and still tells a reader how to read a uri here
ok('about: a uri opened at w3id.org forwards to the production service; the stale "does not forward" is gone', /forwards to the production service/.test(anonymousAbout.answer.whereToLookNext.whatAUriResolvesTo) && !/does not forward/.test(JSON.stringify(anonymousAbout.answer)) && anonymousAbout.answer.whereToLookNext.whatAUriResolvesTo.includes('replace https://w3id.org/EDUcore/ with https://demo.educore.dev/edc/'), anonymousAbout.answer.whereToLookNext.whatAUriResolvesTo);
const aboutEnvelopeText = JSON.stringify({ answeredFrom: { graphName: 'GOLD_261030_useCases', manifestRefId: 'x'.repeat(64), manifestLabel: 'educore-2026-10-30', manifest: 'https://w3id.org/EDUcore/manifest/educore-2026-10-30', manifestByContent: `https://w3id.org/EDUcore/manifest/sha256/${'x'.repeat(64)}`, manifestStandardList: 'https://w3id.org/EDUcore/manifest/educore-2026-10-30/standards', builtAt: '2026-10-30T04:44:59.262Z', graphContractSha256: 'x'.repeat(64), structuralVersion: 'V.09', embeddingModelVersion: 'voyage-4-large', instance: 'demo.educore.dev', apiVersion: 'v1', operation: 'about' }, answer: anonymousAbout.answer, uriNote: registry.uriNote });
ok('about: under 17 KB, envelope and all (the job\'s four entries took it past the old 13 KB; REPORT-P4 has the measurement)', Buffer.byteLength(aboutEnvelopeText) < 17000, `${Buffer.byteLength(aboutEnvelopeText)}`);
const INTERNAL_NAME_PATTERN = /rosetta|smith|forge|golden|\bbb2\b|neo4j|cypher|\bdme\b|dme_|uriContract|jev\b|qtools|askMilo|Milo\b/i;
const aboutWithoutEnvelopeText = JSON.stringify(anonymousAbout.answer).replace(/rosetta\/retrieval|rosetta_retrieve|rosetta\/jobs\/(status|fetch|cancel)|rosetta\/jobs|rosetta_(submit|status|fetch|cancel)/g, 'publicName'); // the names a stranger is given, ruled by TQ; any other mention is internal
const internalNameMatch = aboutWithoutEnvelopeText.match(INTERNAL_NAME_PATTERN);
ok('about: a stranger meets no internal name', internalNameMatch === null, internalNameMatch && aboutWithoutEnvelopeText.slice(Math.max(0, internalNameMatch.index - 60), internalNameMatch.index + 40));
// ⟪rosettaFreeInput, ROMANTIC_PARASOL 2026-11-10⟫ a row marked isListedInAbout false is told to nobody: not a stranger, not an administrator
ok('about: rosetta/interpret is not in about, for a stranger or an administrator', ![anonymousAbout, aboutDocumentFor({ registry, inputCapByName, doorLimitValues: { edcPublicPathPrefix: '/edc/' }, publicInstanceName: 'demo.educore.dev', principal: { kind: 'siteUser', role: 'admin', userRefId: 'r' } })].some((oneAbout) => JSON.stringify(oneAbout.answer).includes('rosetta/interpret')));
ok('about: the bare root is its alias', JSON.stringify(registry.operationList.find((row) => row.operationName === 'about').aliasRouteNameList) === '[""]');
ok('mcp instructions: one line points at standards_about', registry.mcpInstructionLineList.some((line) => /standards_about/.test(line)));

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

// ---- 5b. a foreign-vocabulary row is its own IRI only where the forge refuses it; what the forge mints, mints
const { uriMinterFor } = require('../lib/standards-query/uriMinter');
const storeHolding = { prepare: () => ({ get: () => ({ isPresent: 1 }) }) };
const absoluteIri = 'https://w3id.org/CEDStandards/terms/P000033';
const edcUriOf = (mintFor) => ({ URI_SCHEME: { absoluteIriPrefixList: ['https://', 'http://'] }, parse: () => ({ kind: 'element' }), mint: mintFor });
const refusingMinter = uriMinterFor({ edcUri: edcUriOf(() => ({ error: 'the segment value "" is forbidden' })), storeHandle: storeHolding, manifestLabel: 'testLabel', standardVersionByName: { CEDS: '14.0.0.0' } });
const mintingMinter = uriMinterFor({ edcUri: edcUriOf(() => ({ uri: 'https://w3id.org/EDUcore/CEDS/14.0.0.0/minted' })), storeHandle: storeHolding, manifestLabel: 'testLabel', standardVersionByName: { CEDS: '14.0.0.0' } });
ok('uriMinter: where the forge refuses an absolute stableId, it is its own IRI', JSON.stringify(refusingMinter.uriForNode({ stableId: absoluteIri, standardName: 'CEDS' })) === JSON.stringify({ uri: absoluteIri, isOwnIri: true }));
ok('uriMinter: where the forge mints it, the row carries the minted URI', JSON.stringify(mintingMinter.uriForNode({ stableId: absoluteIri, standardName: 'CEDS' })) === JSON.stringify({ uri: 'https://w3id.org/EDUcore/CEDS/14.0.0.0/minted' }));
ok('uriMinter: a refused mint of a stableId that is not absolute stays absent, never own', refusingMinter.uriForNode({ stableId: 'ceds:x', standardName: 'CEDS' }).uri === undefined);

// ---- 5c. the status instance cap is named, not silent, whichever answer carries it
const { mappingStatusByHubFor, instanceCapNoteFor } = require('../lib/standards-query/answerSteps');
const stubRecordOf = (rowObject) => ({ toObject: () => rowObject });
const stubFacts = { decisionBlockHashListByStandard: {} };
const stubStoreReads = { abstainedHubNameSetFor: () => ({ hubNameSet: new Set() }) };
const statusOutcomeFor = (isInstanceListCut) => {
	let outcome;
	mappingStatusByHubFor({ session: {}, facts: stubFacts, storeReads: stubStoreReads, matchedNodeList: [{ stableId: 'a', standardName: 'LIF' }], hubList: [{ hubName: 'CEDS', hubSource: 'CEDS' }], runCypher: (unusedSession, cypherText, cypherParameters, done) => done('', { records: [stubRecordOf({ subjectStableId: 'a', standardName: 'LIF', mappedHubNameList: [], focusStableId: 'a', isInstanceListCut })] }) }, (statusError, mappingStatusByHub, statusFacts) => { outcome = { statusError, mappingStatusByHub, statusFacts }; });
	return outcome;
};
ok('status: an instance list under the cap reports no cut', statusOutcomeFor(false).statusFacts.instanceListCutCount === 0);
ok('status: an instance list past the cap is counted', statusOutcomeFor(true).statusFacts.instanceListCutCount === 1);
ok('status: the note names the cap', /more than 500 instances/.test(instanceCapNoteFor(1)));

// ---- 5d. the timing gate covers every route
const timingBounds = require('../lib/standards-query/standardsQueryTimingBounds.json');
const coveredOperationNameList = [...timingBounds.rowList.map((oneRow) => oneRow.operationName), ...timingBounds.exemptOperationList.map((oneRow) => oneRow.operationName)];
registry.operationList.forEach((row) => ok(`timing gate: ${row.operationName} has a row or a stated exemption`, coveredOperationNameList.includes(row.operationName)));
ok('timing gate: every row names a real operation', timingBounds.rowList.every((oneRow) => registry.operationList.some((row) => row.operationName === oneRow.operationName)));
ok('timing gate: a known-slow row states its bound', timingBounds.rowList.filter((oneRow) => oneRow.knownSlow).every((oneRow) => oneRow.warmBoundSeconds > 0 && oneRow.firstCallBoundSeconds > 0));
ok('timing gate: every exemption says why', timingBounds.exemptOperationList.every((oneRow) => oneRow.why && oneRow.why.length > 10));

// ---- 5e. a rosetta tool needs a person (design 4.8); the Query API does not

const retrievalRow = registry.operationList.find((row) => row.operationName === 'rosettaRetrieval');
const admissionOf = (door, credential) => { let admission; admitRequest({ door, credential, operationName: retrievalRow.operationName, registryRow: retrievalRow }, (unusedError, oneAdmission) => { admission = oneAdmission; }); return admission; };
ok('rosetta_retrieve: an MCP loopback caller is refused by name', admissionOf('mcp', { mode: 'loopback', sub: '' }).refusal.refusalName === 'loopbackNotAdmitted');
ok('rosetta_retrieve: an OAuth account of role public is refused by name', admissionOf('mcp', { sub: 'someRefId', role: 'public' }).refusal.refusalName === 'loopbackNotAdmitted');
ok('rosetta_retrieve: an OAuth account is admitted', admissionOf('mcp', { sub: 'someRefId', role: 'user' }).principal.kind === 'oauthUser');
ok('POST rosetta/retrieval: nobody needs a credential', admissionOf('api', undefined).principal.kind === 'anonymous');
ok('the other tools still admit the loopback', (() => { let admission; const searchRow = registry.operationList.find((row) => row.operationName === 'search'); admitRequest({ door: 'mcp', credential: { mode: 'loopback', sub: '' }, operationName: 'search', registryRow: searchRow }, (unusedError, oneAdmission) => { admission = oneAdmission; }); return admission.principal.kind === 'anonymous'; })());

// ---- 6. the header a client writes
const endpointText = fs.readFileSync(path.join(__dirname, '..', 'endpoints-dot-d', 'qtDotLib.d', 'standards-query.js'), 'utf8').split('\n').filter((oneLine) => !oneLine.trim().startsWith('//')).join('\n');
ok('endpoint: the limiter is keyed on req.ip', /requestLimiter\.admit\(xReq\.ip\)/.test(endpointText));
ok('endpoint: no code reads X-Forwarded-For', !/forwarded/i.test(endpointText));

console.log(`\nstandards-query-registry: ${passedCount} passed, ${failedCount} failed`);
process.exit(failedCount === 0 ? 0 : 1);
