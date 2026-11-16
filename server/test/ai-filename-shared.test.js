'use strict';
// ai-filename-shared.test.js — WORKORDER-rosettaDownloadAll-111226 gate 1, the shared filename module. No server, no model.
// The Haiku filename call lived in html/pages/dm/explorer.vue (generateAiFilename). It is now one module, html/composables/useAiFilename.js, that the DME and
// Rosetta both call (TQ: duplication is "anathema"). The DME's behaviour must not change:
//   1. the prompt is the DME's own, byte for byte (its words and limit now in aiFilenameSettings.js);
//   2. generateAiFilename posts { prompt, model: 'haiku' } to /api/askmilo-utility with the auth headers asked for at call time, returns the answer's response,
//      and on a failed call returns null;
//   3. explorer.vue uses the module and keeps no copy: no utility URL, no prompt words, no axios call of its own;
//   4. askAiFilename (Rosetta's door) says why it failed: capped (the utility's daily limit, HTTP 429), failed, or unusable.
// AI_FILENAME_HTML_PATH=<another tree's html dir> runs the same gates there (the base, to watch them fail).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const htmlPath = process.env.AI_FILENAME_HTML_PATH || path.join(__dirname, '..', '..', 'html');
const moduleFilePath = path.join(htmlPath, 'composables', 'useAiFilename.js');
const settingsFilePath = path.join(htmlPath, 'composables', 'aiFilenameSettings.js');
// the DME prompt as explorer.vue wrote it at 674fb45, for a snippet
const DME_PROMPT_OF = (snippetText) => `Given this content, suggest a short camelCase filename (no extension, max 40 chars). Reply with ONLY the filename, nothing else.\n\n${snippetText}`;

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${String(detailText).slice(0, 600)}` : ''}`);
};
const finish = () => {
	console.log(`\nai-filename-shared: ${passedCount} passed, ${failedCount} failed`);
	process.exit(failedCount === 0 ? 0 : 1);
};

// ---- 3. explorer.vue uses the module (read as text: it is a Vue page)
const explorerText = fs.readFileSync(path.join(htmlPath, 'pages', 'dm', 'explorer.vue'), 'utf8');
console.log('- 3. the DME page uses the shared module');
ok('explorer.vue imports useAiFilename from the shared module', /import \{ useAiFilename \} from '@\/composables\/useAiFilename';/.test(explorerText));
ok('explorer.vue still hands generateAiFilename to its panel', /:generate-filename="generateAiFilename"/.test(explorerText) && /const \{ generateAiFilename \} = useAiFilename\(/.test(explorerText));
ok('explorer.vue keeps no copy: no utility URL, no prompt words, no axios', !/askmilo-utility/.test(explorerText) && !/suggest a short camelCase filename/.test(explorerText) && !/axios/.test(explorerText));
const downloadStoreFilePath = path.join(htmlPath, 'stores', 'rosettaDownloadAllStore.js');
ok('Rosetta names its zip through the same module', fs.existsSync(downloadStoreFilePath) && /import \{ askAiFilename \} from '@\/composables\/useAiFilename';/.test(fs.readFileSync(downloadStoreFilePath, 'utf8')));

if (!fs.existsSync(moduleFilePath) || !fs.existsSync(settingsFilePath)) {
	ok('the shared module and its settings exist', false, `${moduleFilePath} or ${settingsFilePath} is absent`);
	finish();
}

const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'aiFilenameShared-'));
const axiosDoublePath = path.join(scratchDirPath, 'axiosDouble.mjs');
fs.writeFileSync(axiosDoublePath, 'export default { post: (url, body, options) => globalThis.aiFilenameAxiosDouble.post(url, body, options) };\n');
const moduleText = fs.readFileSync(moduleFilePath, 'utf8');
const rewrittenModulePath = path.join(scratchDirPath, 'useAiFilename.mjs');
fs.writeFileSync(rewrittenModulePath, moduleText.replace("import axios from 'axios';", `import axios from '${pathToFileURL(axiosDoublePath).href}';`).replace("from './aiFilenameSettings.js';", `from '${pathToFileURL(settingsFilePath).href}';`));

globalThis.aiFilenameAxiosDouble = { requestList: [], scripted: null, post(url, body, options) { this.requestList.push({ url, body, options }); return this.scripted(); } };
const double = globalThis.aiFilenameAxiosDouble;

import(pathToFileURL(rewrittenModulePath).href).then(async (aiFilename) => {
	// ---- 1. the prompt
	console.log('- 1. the prompt is the DME\'s own');
	ok('aiFilenamePromptOf gives the DME prompt, byte for byte', aiFilename.aiFilenamePromptOf('some content') === DME_PROMPT_OF('some content'));

	// ---- 2. generateAiFilename, as the DME calls it
	console.log('- 2. generateAiFilename behaves as the DME\'s did');
	let headerAskCount = 0;
	const { generateAiFilename } = aiFilename.useAiFilename({ getAuthHeaders: () => { headerAskCount += 1; return { Authorization: 'Bearer dmeToken' }; }, warnLabel: 'explorer' });
	double.requestList = [];
	double.scripted = () => Promise.resolve({ data: { response: 'graphSessionNotes' } });
	const suggestedName = await generateAiFilename('snippet text');
	const [sentRequest] = double.requestList;
	ok('it posts to /api/askmilo-utility', double.requestList.length === 1 && sentRequest.url === '/api/askmilo-utility');
	ok('with { prompt, model: haiku } and nothing else', JSON.stringify(sentRequest.body) === JSON.stringify({ prompt: DME_PROMPT_OF('snippet text'), model: 'haiku' }), JSON.stringify(sentRequest.body));
	ok('with the auth headers asked for at call time', headerAskCount === 1 && JSON.stringify(sentRequest.options) === JSON.stringify({ headers: { Authorization: 'Bearer dmeToken' } }));
	ok('it returns the answer\'s response', suggestedName === 'graphSessionNotes');
	double.scripted = () => Promise.reject(new Error('Network Error'));
	const originalWarn = console.warn;
	const warnList = [];
	console.warn = (...argList) => warnList.push(argList);
	const failedName = await generateAiFilename('snippet text');
	console.warn = originalWarn;
	ok('a failed call returns null and warns under the page\'s label, as before', failedName === null && warnList.length === 1 && warnList[0][0] === '[explorer] AI filename generation failed:', JSON.stringify(warnList));

	// ---- 4. askAiFilename says why
	console.log('- 4. askAiFilename says why it failed');
	double.scripted = () => Promise.resolve({ data: { response: 'studentFields' } });
	ok('an answer is the suggested name', JSON.stringify(await aiFilename.askAiFilename({ snippetText: 'x', authHeaders: {} })) === JSON.stringify({ suggestedName: 'studentFields' }));
	double.scripted = () => Promise.reject({ response: { status: 429, data: 'Daily usage limit reached' }, message: 'Request failed with status code 429' });
	ok('the utility\'s daily limit is capped', (await aiFilename.askAiFilename({ snippetText: 'x', authHeaders: {} })).failureName === aiFilename.AI_FILENAME_FAILURE_NAME.capped);
	double.scripted = () => Promise.reject({ response: { status: 500, data: 'AI request failed' }, message: 'Request failed with status code 500' });
	ok('any other refusal is failed', (await aiFilename.askAiFilename({ snippetText: 'x', authHeaders: {} })).failureName === aiFilename.AI_FILENAME_FAILURE_NAME.failed);
	double.scripted = () => Promise.resolve({ data: {} });
	ok('an answer with no name is unusable', (await aiFilename.askAiFilename({ snippetText: 'x', authHeaders: {} })).failureName === aiFilename.AI_FILENAME_FAILURE_NAME.unusable);

	fs.rmSync(scratchDirPath, { recursive: true, force: true });
	finish();
}).catch((thrown) => {
	ok('the shared module loads and runs', false, thrown && thrown.stack);
	finish();
});
