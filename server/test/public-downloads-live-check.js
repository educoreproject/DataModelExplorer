'use strict';
// public-downloads-live-check.js — D1 of PLAN-publicDownloadsAndEditorRemoval-103026 against a RUNNING site, signed out:
// the downloads are public (TQ, 2026-10-30: "all public"). With no token, and again with a garbled token and with
// 'Bearer undefined', it asks for the manifest (every standard, unfiltered), one source zip and one graph zip (each
// checked against the manifest's sha256), and the publication listing and one of its files when the gold has published
// any. The twin: the same garbled token on a non-download route (forged-use-cases) must still be refused 401.
// Not a *.test.js: it needs a live site, so runServerSuite.sh does not run it.
//
//   node server/test/public-downloads-live-check.js --baseUrl=https://demo.educore.dev

const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();

const baseUrlArgument = process.argv.slice(2).find((argumentText) => argumentText.startsWith('--baseUrl='));
if (!baseUrlArgument) {
	console.error('public-downloads-live-check: --baseUrl is required');
	process.exit(2);
}
const baseUrl = baseUrlArgument.replace('--baseUrl=', '').replace(/\/$/, '');

let passed = 0;
let failed = 0;
const ok = (checkName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${checkName}${detailText ? ` (${detailText})` : ''}`); return; }
	failed++;
	console.log(`  FAIL: ${checkName}${detailText ? ` — ${detailText}` : ''}`);
};

const sha256Of = (contentBuffer) => crypto.createHash('sha256').update(contentBuffer).digest('hex');

// POSTs a JSON body; answers { statusCode, headerByName, bodyBuffer }
const postJson = ({ routePath, requestBody, authorizationText }, callback) => {
	const targetUrl = new URL(`${baseUrl}${routePath}`);
	const bodyText = JSON.stringify(requestBody);
	const headerByName = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyText) };
	if (authorizationText !== undefined) headerByName.Authorization = authorizationText;
	const transport = targetUrl.protocol === 'https:' ? https : http;
	const request = transport.request(targetUrl, { method: 'POST', headers: headerByName }, (response) => {
		const chunkList = [];
		response.on('data', (chunk) => chunkList.push(chunk));
		response.on('end', () => callback('', { statusCode: response.statusCode, headerByName: response.headers, bodyBuffer: Buffer.concat(chunkList) }));
	});
	request.on('error', (requestError) => callback(`${routePath}: ${requestError.message}`));
	request.end(bodyText);
};

const parsedFirstOf = (answer) => {
	const parsedBody = JSON.parse(answer.bodyBuffer.toString('utf8'));
	return Array.isArray(parsedBody) ? parsedBody[0] : null;
};
const isJsonAnswer = (answer) => /application\/json/.test(answer.headerByName['content-type'] || '');

const CALLER_LIST = Object.freeze([
	{ callerName: 'no token', authorizationText: undefined },
	{ callerName: 'a garbled token', authorizationText: 'Bearer not.a.jwt' },
	{ callerName: "'Bearer undefined'", authorizationText: 'Bearer undefined' },
]);

console.log(`\n=== D1: the downloads at ${baseUrl}, signed out ===\n`);

const taskList = new taskListPlus();

CALLER_LIST.forEach(({ callerName, authorizationText }) => {
	taskList.push((args, next) => postJson({ routePath: '/api/standard-downloads-manifest', requestBody: {}, authorizationText }, (requestError, answer) => {
		if (requestError) { next(requestError, args); return; }
		const manifest = answer.statusCode === 200 && isJsonAnswer(answer) ? parsedFirstOf(answer) : null;
		const entryList = (manifest && manifest.entryList) || [];
		const standardKeyList = [...new Set(entryList.map((oneEntry) => oneEntry.standardKey))];
		const familyList = [...new Set(entryList.map((oneEntry) => oneEntry.family))];
		const everyStandardHasBothFacets = standardKeyList.every((standardKey) => ['source', 'graph'].every((facetName) => entryList.some((oneEntry) => oneEntry.standardKey === standardKey && oneEntry.facet === facetName)));
		ok(`manifest with ${callerName}: 200, every standard listed with a source and a graph entry`, !!manifest && entryList.length > 0 && everyStandardHasBothFacets, `${answer.statusCode}; ${manifest ? manifest.graphName : 'no manifest'}: ${standardKeyList.length} standards, ${entryList.length} entries, families ${familyList.join(', ')}`);
		next('', { ...args, manifest: args.manifest || manifest });
	}));
});

['source', 'graph'].forEach((facetName) => CALLER_LIST.forEach(({ callerName, authorizationText }) => {
	taskList.push((args, next) => {
		const availableEntry = ((args.manifest && args.manifest.entryList) || []).find((oneEntry) => oneEntry.facet === facetName && oneEntry.available);
		if (!availableEntry) { ok(`a ${facetName} zip is available to download`, false, 'none in the manifest'); next('', args); return; }
		postJson({ routePath: '/api/standard-downloads-file', requestBody: { downloadId: availableEntry.downloadId }, authorizationText }, (requestError, answer) => {
			if (requestError) { next(requestError, args); return; }
			const receivedSha256 = sha256Of(answer.bodyBuffer);
			ok(`${facetName} zip ${availableEntry.downloadId} with ${callerName}: 200, bytes match the manifest's sha256`, answer.statusCode === 200 && receivedSha256 === availableEntry.sha256, `${answer.statusCode}; ${answer.bodyBuffer.length} bytes`);
			next('', args);
		});
	});
}));

CALLER_LIST.forEach(({ callerName, authorizationText }) => {
	taskList.push((args, next) => postJson({ routePath: '/api/standard-downloads-publications', requestBody: {}, authorizationText }, (requestError, answer) => {
		if (requestError) { next(requestError, args); return; }
		const answerText = answer.bodyBuffer.toString('utf8');
		if (answer.statusCode === 400 && /^publicationsAbsentForGolden/.test(answerText)) {
			ok(`publication listing with ${callerName}: answered (not refused for sign-in); this gold has published none`, true, answerText.slice(0, 80));
			next('', args);
			return;
		}
		const publication = answer.statusCode === 200 && isJsonAnswer(answer) ? parsedFirstOf(answer) : null;
		ok(`publication listing with ${callerName}: 200`, !!publication && Array.isArray(publication.entryList), `${answer.statusCode} ${answerText.slice(0, 120)}`);
		next('', { ...args, publication: args.publication || publication });
	}));
});

CALLER_LIST.forEach(({ callerName, authorizationText }) => {
	taskList.push((args, next) => {
		const publicationEntry = ((args.publication && args.publication.entryList) || [])[0];
		if (!publicationEntry) { console.log(`  NOTE: no publication file to fetch with ${callerName} (none published)`); next('', args); return; }
		postJson({ routePath: '/api/standard-downloads-publication-file', requestBody: { downloadId: publicationEntry.downloadId }, authorizationText }, (requestError, answer) => {
			if (requestError) { next(requestError, args); return; }
			ok(`publication file ${publicationEntry.downloadId} with ${callerName}: 200, bytes match the listing's sha256`, answer.statusCode === 200 && sha256Of(answer.bodyBuffer) === publicationEntry.sha256, `${answer.statusCode}; ${answer.bodyBuffer.length} bytes`);
			next('', args);
		});
	});
});

taskList.push((args, next) => postJson({ routePath: '/api/forged-use-cases', requestBody: { action: 'list' }, authorizationText: 'Bearer not.a.jwt' }, (requestError, answer) => {
	if (requestError) { next(requestError, args); return; }
	ok('RED TWIN: a garbled token is still refused 401 on a non-download route (forged-use-cases)', answer.statusCode === 401, `${answer.statusCode}`);
	next('', args);
}));

pipeRunner(taskList.getList(), { manifest: null, publication: null }, (pipeError) => {
	if (pipeError) ok('every request answered', false, pipeError);
	console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
	process.exit(failed === 0 ? 0 : 1);
});
