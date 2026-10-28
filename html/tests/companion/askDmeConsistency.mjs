// askDmeConsistency.mjs — runs each candidate Ask DME prompt (SPEC-companionPages-102826, the Ask DME panel; DEV-122
// acceptance: "the baked-in prompt returns consistent output across repeated runs in DME") N times through the real DME
// explorer, exactly as a visitor's link does: a fresh login landing on /dm/explorer?prefillPrompt=<prompt>, the prompt
// checked in the input, then Submit, then the answer read when the explorer says it is done. Each run is a new browser
// context, so a new DME session with no earlier conversation. It writes every answer, and a summary, to --evidenceDir.
// This is a measuring instrument, not a gate: whether the answers agree is judged by reading them (the DEVLOG says how).
//
//   node html/tests/companion/askDmeConsistency.mjs --baseUrl=… --userName=… --passwordFile=… --playwrightCorePath=…
//        --chromePath=… --evidenceDir=… --promptFile=<JSON [{ jedxObjectName, promptText }]> --runCount=5

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'userName', 'passwordFile', 'playwrightCorePath', 'chromePath', 'evidenceDir', 'promptFile', 'runCount'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`askDmeConsistency: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
const runCount = Number(argumentByName.runCount);
if (!Number.isInteger(runCount) || runCount < 1) {
	console.error(`askDmeConsistency: --runCount '${argumentByName.runCount}' must be a positive integer`);
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const userPassword = fs.readFileSync(argumentByName.passwordFile, 'utf8').trim();
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
const promptList = JSON.parse(fs.readFileSync(argumentByName.promptFile, 'utf8'));
fs.mkdirSync(argumentByName.evidenceDir, { recursive: true });

const ANSWER_TIMEOUT_MS = 15 * 60 * 1000;

const explorerStateOf = (page) => page.evaluate(() => {
	const explorerState = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia.state.value.explorerStore;
	const lastResponse = explorerState.responses[explorerState.responses.length - 1];
	return { loading: explorerState.loading, responseCount: explorerState.responses.length, prompt: lastResponse ? lastResponse.prompt : '', stdout: lastResponse ? lastResponse.stdout : '', stderrLength: lastResponse ? lastResponse.stderr.length : 0 };
});

const runOnce = async (browser, { jedxObjectName, promptText }, runNumber) => {
	const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
	const page = await browserContext.newPage();
	const startedAt = Date.now();
	try {
		await page.goto(`${baseUrl}/login?redirect=${encodeURIComponent(`/dm/explorer?prefillPrompt=${encodeURIComponent(promptText)}`)}`);
		await page.getByLabel('User Name').fill(argumentByName.userName);
		await page.getByLabel('Password', { exact: true }).fill(userPassword);
		await page.getByRole('button', { name: 'Login' }).click();
		await page.waitForURL(/\/dm\/explorer/, { timeout: 30000 });
		await page.waitForFunction(() => document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$pinia.state.value.explorerStore?.connected, null, { timeout: 30000 });
		await page.waitForTimeout(1500);
		const inputText = await page.locator('.input-field textarea').first().inputValue();
		if (inputText !== promptText) throw new Error(`the input did not hold the prompt: ${JSON.stringify(inputText).slice(0, 200)}`);
		await page.getByRole('button', { name: 'Submit' }).click();
		await page.waitForFunction(() => {
			const explorerState = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia.state.value.explorerStore;
			return explorerState.responses.length > 0 && !explorerState.loading;
		}, null, { timeout: ANSWER_TIMEOUT_MS, polling: 2000 });
		const explorerState = await explorerStateOf(page);
		return { jedxObjectName, runNumber, durationMs: Date.now() - startedAt, promptSent: explorerState.prompt, answerText: explorerState.stdout, stderrLength: explorerState.stderrLength, errorText: '' };
	} catch (error) {
		return { jedxObjectName, runNumber, durationMs: Date.now() - startedAt, promptSent: '', answerText: '', stderrLength: 0, errorText: error.message };
	} finally {
		await browserContext.close();
	}
};

const browser = await chromium.launch({ executablePath: argumentByName.chromePath });
const summaryList = [];
try {
	for (const candidatePrompt of promptList) {
		for (let runNumber = 1; runNumber <= runCount; runNumber++) {
			const runResult = await runOnce(browser, candidatePrompt, runNumber);
			const answerFileName = `${candidatePrompt.jedxObjectName}-run${runNumber}.md`;
			fs.writeFileSync(path.join(argumentByName.evidenceDir, answerFileName), `# ${candidatePrompt.jedxObjectName}, run ${runNumber}\n\nPrompt: ${candidatePrompt.promptText}\n\nDuration: ${runResult.durationMs} ms${runResult.errorText ? `\n\nERROR: ${runResult.errorText}` : ''}\n\n---\n\n${runResult.answerText}\n`);
			summaryList.push({ ...runResult, answerFileName, answerLength: runResult.answerText.length, answerText: undefined });
			console.log(`${new Date().toISOString()} ${candidatePrompt.jedxObjectName} run ${runNumber}: ${runResult.errorText ? `ERROR ${runResult.errorText}` : `${runResult.answerText.length} chars in ${runResult.durationMs} ms`}`);
			fs.writeFileSync(path.join(argumentByName.evidenceDir, 'summary.json'), JSON.stringify(summaryList, null, '\t'));
		}
	}
} finally {
	await browser.close();
}
console.log('askDmeConsistency: done');
