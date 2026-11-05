'use strict';
// size-refusal-contact-live.test.js — a refusal for size tells a person who to write to (TQ, cardUriAnswers-110426): every size refusal of the query API, and the resolver's 413 for a block over its cap. The address is one config value:
// this gate sets its own, so an address typed into code or prose fails, and it also reads the source for the real one. A refusal given 413 in the registry and left out of the list fails. Skips the live part by name when no graph is reachable.

const fs = require('fs');
const path = require('path');
const http = require('http');
const { openHarness } = require('./lib/rosettaLiveHarness');
const registry = require('../lib/standards-query/standardsQueryOperations.json');

const anonymous = { kind: 'anonymous', userRefId: '', role: '' };
const CONFIGURED_ADDRESS = 'someone@gate.example';
const CAP_BYTES = 67108864;
const OVER_CAP_SCHEMA_BLOCK = 'fa44bccf2a36c7da27775d97f4de75e6f2b8867f7df4f1ea7ac0b874ec3853fa';

let failedCount = 0;
let passedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const allStatusByName = { ...registry.verbRefusalHttpStatusByName, ...registry.envelopeRefusalHttpStatusByName };
const statusTooLargeNameList = Object.keys(allStatusByName).filter((refusalName) => allStatusByName[refusalName] === 413);
ok('every refusal answered 413 is in the size refusal list', Array.isArray(registry.sizeRefusalNameList) && statusTooLargeNameList.every((refusalName) => registry.sizeRefusalNameList.includes(refusalName)), JSON.stringify(statusTooLargeNameList));
ok('every name in that list is a refusal the registry knows', (registry.sizeRefusalNameList || []).every((refusalName) => allStatusByName[refusalName] !== undefined));

const SOURCE_PATH_LIST = ['../lib/standards-query/standardsQueryOperations.json', '../lib/standards-query/standardsQueryCore.js', '../lib/standards-query/sizeRefusalContact.js', '../data-model/access-points-dot-d/accessPoints.d/edc-resolver.js'];
SOURCE_PATH_LIST.forEach((sourcePath) => {
	const fullPath = path.join(__dirname, sourcePath);
	ok(`${path.basename(sourcePath)} types no address`, fs.existsSync(fullPath) && !/[a-z0-9]@[a-z0-9-]+\.org/i.test(fs.readFileSync(fullPath, 'utf8')));
});

const bodyHasContact = (body) => body.contact === CONFIGURED_ADDRESS && body.reason.includes(CONFIGURED_ADDRESS);

openHarness({ limitOverrideValues: {}, doorOverrideValues: { sizeRefusalContactAddress: CONFIGURED_ADDRESS } }, (harnessError, harness) => {
	if (harnessError === 'noGraph') {
		console.log(`  SKIP: size-refusal-contact-live: no graph is reachable; ${passedCount} passed, ${failedCount} failed`);
		process.exit(failedCount === 0 ? 0 : 1);
	}
	if (harnessError) {
		console.log(`  FAIL: harness: ${harnessError}`);
		process.exit(1);
	}
	const ask = (operationName, input, done) => harness.core.runOperation({ operationName, input, principal: anonymous }, (unusedError, answered) => done(answered.httpStatus, JSON.parse(answered.bodyText).answer));
	const deepDocument = (depthCount) => (depthCount === 0 ? { type: 'string' } : { type: 'object', properties: { deeper: deepDocument(depthCount - 1) } });
	const CASE_LIST = [
		{ refusalName: 'inputTooLong', operationName: 'mappings', input: { element: 'x'.repeat(100000) } },
		{ refusalName: 'maxFieldListLength', operationName: 'rosettaRetrieval', input: { fieldList: Array.from({ length: 201 }, (unused, fieldIndex) => ({ name: `f${fieldIndex}` })) } },
		{ refusalName: 'fieldTextTooLong', operationName: 'rosettaRetrieval', input: { fieldList: [{ name: 'x'.repeat(100000) }] } },
		{ refusalName: 'depthExceeded', operationName: 'rosettaRetrieval', input: { jsonSchema: deepDocument(200) } },
	];
	const runCase = (caseIndex) => {
		if (caseIndex >= CASE_LIST.length) {
			runNotSize();
			return;
		}
		const oneCase = CASE_LIST[caseIndex];
		ask(oneCase.operationName, oneCase.input, (httpStatus, answer) => {
			ok(`${oneCase.refusalName}: the refusal says who to write to, from config`, answer.refusalName === oneCase.refusalName && bodyHasContact(answer), `${httpStatus} ${JSON.stringify(answer).slice(0, 240)}`);
			runCase(caseIndex + 1);
		});
	};
	const runNotSize = () => ask('mappings', { element: 'zzzNothingMatchesThisAnywhere', unknownThing: 'x' }, (httpStatus, answer) => {
		ok('a refusal that is not about size names no contact', answer.refusalName === 'unknownInput' && answer.contact === undefined, JSON.stringify(answer).slice(0, 200));
		runResolver();
	});
	const runResolver = () => {
		const resolverConfig = { ...harness.edcConfigValues, wholeBlockMaxBytes: CAP_BYTES, directBlockMaxBytes: CAP_BYTES, sizeRefusalContactAddress: CONFIGURED_ADDRESS };
		process.global = { ...process.global, xLog: { status() {}, verbose() {}, result() {}, error() {} }, getConfig: () => resolverConfig };
		const library = {};
		require('../data-model/access-points-dot-d/accessPoints.d/edc-resolver.js')({ dotD: { library: { add: (moduleName, serviceFunction) => { library.serviceFunction = serviceFunction; } } }, passThroughParameters: {} });
		library.serviceFunction({ edcRequestPath: `/schemaBlock/sha256/${OVER_CAP_SCHEMA_BLOCK}`, answerFormat: 'json', whenClientGone: () => {} }, (accessPointError, answered) => {
			const body = JSON.parse(answered.bodyText);
			ok('the resolver\'s 413 says who to write to, from config', answered.httpStatus === 413 && body.contact === CONFIGURED_ADDRESS && body.error.includes(CONFIGURED_ADDRESS), answered.bodyText.slice(0, 300));
			harness.close(() => {
				console.log(`size-refusal-contact-live: ${passedCount} passed, ${failedCount} failed`);
				process.exit(failedCount === 0 ? 0 : 1);
			});
		});
	};
	runCase(0);
});
