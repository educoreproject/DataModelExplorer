// companionPage.spec.mjs — the compiled companion page /explore/companion/jedx-dictionary (SPEC-companionPages-102826,
// Phase 4; G4.1 itself is TQ's own check) in a real browser against a running site (API and Nuxt dev) whose database
// holds the seeded jedx-dictionary page:
//   U1 as a user: the title, and the stamps (golden name, compile date, every source's file name and document date)
//   U2 the seven panels of the jedxDictionary registry entry, in order
//   U3 the Linkage panel's figures are the compile's countSummary, and every featured close match is found in the compile
//      (none listed as missing); a featured element whose HR Open property is shared shows the sharing elements
//   U4 the dictionary search narrows the table
//   U5 the Arkansas panel shows the sheet's own group label and column headers
//   U6 no administration panel for a user
//   S1 with the compile answer made not current (the response altered in the browser, the server untouched), the
//      out-of-date notice names the stale stamp and the reason; with the real answer there is no notice
//   A1 as an admin-role user (--adminUserName, role admin or super): the administration panel, with the upload form,
//      a source history group per role and part, and the compile history
// Screenshots go to --evidenceDir. Each role logs in fresh (the login lives in memory).
//
//   node html/tests/companion/companionPage.spec.mjs --baseUrl=… --userName=… --passwordFile=… --adminUserName=…
//        --adminPasswordFile=… --playwrightCorePath=… --chromePath=… --evidenceDir=…

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'userName', 'passwordFile', 'adminUserName', 'adminPasswordFile', 'playwrightCorePath', 'chromePath', 'evidenceDir'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`companionPage: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
fs.mkdirSync(argumentByName.evidenceDir, { recursive: true });
const shotPath = (shotName) => path.join(argumentByName.evidenceDir, `${shotName}.png`);

const PAGE_PATH = '/explore/companion/jedx-dictionary';
const COMPILE_ROUTE_PATTERN = '**/api/companion-compile-current';
const PANEL_TEST_ID_LIST = ['dictionary', 'linkage', 'arkansas', 'guide', 'objectModel', 'notLinked', 'askDme'].map((panelName) => `companion-panel-${panelName}`);
const STALE_REASON_TEXT = 'browser test: the recompile is made to fail';

let passed = 0;
let failed = 0;
const check = (checkName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${checkName}`); return; }
	failed++;
	console.log(`  FAIL: ${checkName}${detailText ? ` (${detailText})` : ''}`);
};

// logs in fresh and lands on the page; routeHandler, when given, sees the compile request
const openPageAs = async (browser, { userName, passwordFile, routeHandler }) => {
	const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
	const page = await browserContext.newPage();
	const compileAnswerList = [];
	page.on('response', async (response) => {
		if (response.url().endsWith('/api/companion-compile-current') && response.status() === 200) compileAnswerList.push((await response.json())[0]);
	});
	if (routeHandler) await page.route(COMPILE_ROUTE_PATTERN, routeHandler);
	await page.goto(`${baseUrl}/login?redirect=${encodeURIComponent(PAGE_PATH)}`);
	await page.getByLabel('User Name').fill(userName);
	await page.getByLabel('Password', { exact: true }).fill(fs.readFileSync(passwordFile, 'utf8').trim());
	await page.getByRole('button', { name: 'Login' }).click();
	await page.waitForSelector('[data-testid="companion-stamps"]', { timeout: 60000 });
	await page.waitForTimeout(1500);
	return { browserContext, page, compileAnswerList };
};

const browser = await chromium.launch({ executablePath: argumentByName.chromePath });
try {
	console.log('USER');
	const asUser = await openPageAs(browser, { userName: argumentByName.userName, passwordFile: argumentByName.passwordFile });
	const { page } = asUser;
	const compileAnswer = asUser.compileAnswerList[0];
	check('U1 the page title', (await page.locator('[data-testid="companion-title"]').innerText()) === 'One dictionary, four lenses');
	check('U1 the golden is named', (await page.locator('[data-testid="companion-stamp-golden"]').innerText()) === compileAnswer.compileRecord.graphName, compileAnswer.compileRecord.graphName);
	const sourceStampText = await page.locator('[data-testid="companion-stamp-sources"]').innerText();
	const unstampedSourceList = compileAnswer.payload.sourceList.filter((sourceRecord) => !sourceStampText.includes(sourceRecord.fileName) || !sourceStampText.includes(`dated ${sourceRecord.documentDate}`));
	check(`U1 every source (${compileAnswer.payload.sourceList.length}) shows its file name and document date`, unstampedSourceList.length === 0, unstampedSourceList.map((sourceRecord) => sourceRecord.fileName).join('; '));
	check('U1 a current compile shows no out-of-date notice', compileAnswer.isCurrent === true && (await page.locator('[data-testid="companion-out-of-date"]').count()) === 0);

	const shownPanelTestIdList = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="companion-panel-"]')].map((panelElement) => panelElement.dataset.testid));
	check('U2 the seven panels, in order', JSON.stringify(shownPanelTestIdList) === JSON.stringify(PANEL_TEST_ID_LIST), shownPanelTestIdList.join(' '));

	const countSummary = compileAnswer.payload.countSummary;
	const linkageCountText = await page.locator('[data-testid="linkage-count"]').innerText();
	const countFigureList = [countSummary.elementCount, countSummary.resolvedCount, countSummary.distinctPropertyCount, countSummary.matchedElementCount, ...Object.values(countSummary.matchedElementCountByHub), ...Object.values(countSummary.matchCountByKind)];
	check(`U3 the linkage figures are the compile's (${countFigureList.join(', ')})`, countFigureList.every((countFigure) => new RegExp(`\\b${countFigure}\\b`).test(linkageCountText)), linkageCountText);
	const featuredCount = await page.locator('[data-testid^="linkage-featured-"]').count();
	check('U3 six to eight featured matches', featuredCount >= 6 && featuredCount <= 8, String(featuredCount));
	check('U3 no featured match is missing from the compile', (await page.locator('[data-testid="linkage-featured-missing"]').count()) === 0);
	check('U3 shared HR Open properties show the sharing elements', (await page.locator('[data-testid="linkage-shared"]').count()) >= 1);

	await page.locator('[data-testid="dictionary-search"] input').fill('Date of Hire');
	await page.waitForTimeout(500);
	const searchedCountText = await page.locator('[data-testid="dictionary-count"]').innerText();
	check('U4 the dictionary search narrows the table', /^\d+ of 422 elements$/.test(searchedCountText) && !searchedCountText.startsWith('422') && (await page.locator('[data-testid="dictionary-row-VIII:30"]').count()) === 1, searchedCountText);
	await page.locator('[data-testid="dictionary-search"] input').fill('');

	const groupedColumn = compileAnswer.payload.arkansasPilot.programColumnList.find((programColumn) => programColumn.groupLabel);
	const arkansasText = await page.locator('[data-testid="companion-panel-arkansas"]').innerText();
	check(`U5 the sheet's group label '${groupedColumn.groupLabel}' and its headers are shown`, arkansasText.includes(groupedColumn.groupLabel) && arkansasText.includes(compileAnswer.payload.arkansasPilot.programColumnList[0].programName.split('\n')[0].trim()));
	check('U6 no administration panel for a user', (await page.locator('[data-testid="companion-admin"]').count()) === 0);
	await page.evaluate(() => document.querySelector('[data-testid="companion-page"]').scrollIntoView());
	await page.screenshot({ path: shotPath('companionPages-G4.1-user') });
	await page.locator('[data-testid="companion-panel-linkage"]').screenshot({ path: shotPath('companionPages-G4.1-user-linkage') });
	await asUser.browserContext.close();

	console.log('STALE (the compile answer altered in the browser)');
	const asUserStale = await openPageAs(browser, {
		userName: argumentByName.userName,
		passwordFile: argumentByName.passwordFile,
		routeHandler: async (route) => {
			const realResponse = await route.fetch();
			const answerList = await realResponse.json();
			answerList[0] = { ...answerList[0], isCurrent: false, staleStampList: [{ stampName: 'sourceSetSha256', compileValue: 'a', liveValue: 'b' }], recompileErrorText: STALE_REASON_TEXT };
			await route.fulfill({ response: realResponse, json: answerList });
		},
	});
	const staleNoticeText = (await asUserStale.page.locator('[data-testid="companion-out-of-date"]').count()) ? await asUserStale.page.locator('[data-testid="companion-out-of-date"]').innerText() : '';
	check('S1 the out-of-date notice names the stale stamp and the reason', staleNoticeText.includes('out of date') && staleNoticeText.includes('source documents') && staleNoticeText.includes(STALE_REASON_TEXT), staleNoticeText);
	await asUserStale.page.locator('[data-testid="companion-stamps"]').screenshot({ path: shotPath('companionPages-G4.1-outOfDateNotice') });
	await asUserStale.browserContext.close();

	console.log('ADMIN');
	const asAdmin = await openPageAs(browser, { userName: argumentByName.adminUserName, passwordFile: argumentByName.adminPasswordFile });
	await asAdmin.page.waitForSelector('[data-testid="companion-admin"]', { timeout: 15000 }).catch(() => {});
	await asAdmin.page.waitForTimeout(1500);
	check('A1 the administration panel is shown', (await asAdmin.page.locator('[data-testid="companion-admin"]').count()) === 1);
	check('A1 with the upload form', (await asAdmin.page.locator('[data-testid="admin-upload-form"]').count()) === 1);
	const historyGroupCount = await asAdmin.page.locator('[data-testid^="admin-history-"][data-testid$="-whole"], [data-testid^="admin-history-dictionary-"]').count();
	const currentPartCount = new Set(asAdmin.compileAnswerList[0].payload.sourceList.map((sourceRecord) => `${sourceRecord.sourceRole}\t${sourceRecord.sourcePart}`)).size;
	check(`A1 a source history group for each of the ${currentPartCount} roles and parts`, historyGroupCount === currentPartCount, String(historyGroupCount));
	check('A1 the compile history lists compiles', (await asAdmin.page.locator('[data-testid="admin-compile-history"] tbody tr').count()) >= 1);
	await asAdmin.page.locator('[data-testid="companion-admin"]').scrollIntoViewIfNeeded();
	await asAdmin.page.screenshot({ path: shotPath('companionPages-G4.1-admin') });
	await asAdmin.page.locator('[data-testid="companion-admin"]').screenshot({ path: shotPath('companionPages-G4.1-admin-panel') });
	await asAdmin.browserContext.close();
} finally {
	await browser.close();
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
