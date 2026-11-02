// dmeExplorerPrefill.spec.mjs — the Data Model Explorer's ?prefillPrompt= entry (SPEC-companionPages-102826, Phase 4,
// the Ask DME links) in a real browser against a running site (API and Nuxt dev):
//   P1 /dm/explorer?prefillPrompt=<text> fills the prompt input with exactly that text
//   P2 it never sends it: once the explorer's WebSocket is connected, no prompt frame leaves the page in the wait
//      that follows, and no answer is started
//   P3 the query is removed from the address, so a later visit to that address does not refill the input
//   P4 control: /dm/explorer with no query leaves the input empty
// Each case logs in fresh (the login lives in memory), landing on the case's address through /login?redirect=.
//
//   node html/tests/companion/dmeExplorerPrefill.spec.mjs --baseUrl=… --userName=… --passwordFile=<file holding it>
//        --playwrightCorePath=… --chromePath=…

import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'userName', 'passwordFile', 'playwrightCorePath', 'chromePath'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`dmeExplorerPrefill: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const userPassword = fs.readFileSync(argumentByName.passwordFile, 'utf8').trim();
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');

const PREFILL_PROMPT_TEXT = 'Show the JEDx WorkerType object, its fields, and their CEDS and CTDL equivalents — a prefill test, "quoted" & 100% plain.';
const QUIET_WAIT_MS = 8000;

let passed = 0;
let failed = 0;
const check = (checkName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${checkName}`); return; }
	failed++;
	console.log(`  FAIL: ${checkName}${detailText ? ` (${detailText})` : ''}`);
};

const explorerStoreStateOf = (page) => page.evaluate(() => {
	const explorerState = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia.state.value.explorerStore;
	return { connected: explorerState.connected, loading: explorerState.loading, responseCount: explorerState.responses.length };
});

// logs in fresh and lands on targetPath; answers the page, its sent WebSocket frames and the prompt input
const openExplorerAt = async (browser, targetPath) => {
	const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
	const page = await browserContext.newPage();
	const sentFrameList = [];
	page.on('websocket', (webSocket) => webSocket.on('framesent', (frameEvent) => sentFrameList.push(String(frameEvent.payload))));
	await page.goto(`${baseUrl}/login?redirect=${encodeURIComponent(targetPath)}`);
	await page.getByLabel('User Name').fill(argumentByName.userName);
	await page.getByLabel('Password', { exact: true }).fill(userPassword);
	await page.getByRole('button', { name: 'Login' }).click();
	await page.waitForURL(/\/dm\/explorer/, { timeout: 30000 });
	await page.waitForFunction(() => {
		const explorerState = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$pinia.state.value.explorerStore;
		return explorerState && explorerState.connected;
	}, null, { timeout: 30000 });
	const promptInput = page.locator('.input-field textarea').first();
	return { browserContext, page, sentFrameList, promptInput };
};

const browser = await chromium.launch({ executablePath: argumentByName.chromePath });
try {
	console.log('P1-P3 /dm/explorer?prefillPrompt=…');
	const prefilled = await openExplorerAt(browser, `/dm/explorer?prefillPrompt=${encodeURIComponent(PREFILL_PROMPT_TEXT)}`);
	await prefilled.page.waitForTimeout(QUIET_WAIT_MS);
	const prefilledText = await prefilled.promptInput.inputValue();
	check('P1 the input holds exactly the prefill text', prefilledText === PREFILL_PROMPT_TEXT, JSON.stringify(prefilledText));
	const promptFrameList = prefilled.sentFrameList.filter((frameText) => /"type"\s*:\s*"prompt"/.test(frameText));
	check(`P2 no prompt frame was sent in ${QUIET_WAIT_MS / 1000} s after connecting`, promptFrameList.length === 0, `${promptFrameList.length} sent`);
	const storeState = await explorerStoreStateOf(prefilled.page);
	check('P2 no answer was started (no response, not loading)', storeState.responseCount === 0 && !storeState.loading, JSON.stringify(storeState));
	check('P3 the prefillPrompt query is gone from the address', !new URL(prefilled.page.url()).searchParams.has('prefillPrompt'), prefilled.page.url());
	await prefilled.browserContext.close();

	console.log('P4 /dm/explorer (control)');
	const plain = await openExplorerAt(browser, '/dm/explorer');
	await plain.page.waitForTimeout(2000);
	check('P4 the input is empty', (await plain.promptInput.inputValue()) === '');
	await plain.browserContext.close();
} finally {
	await browser.close();
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
