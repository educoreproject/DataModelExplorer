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
//   U7 each Ask DME link is /dm/explorer?prefillPrompt=… (fills, never sends)
//   T1 one tab per panel, in order, the first open by default; choosing a tab puts it in ?tab= and opens it
//   T2 a page opened with ?tab=linkage opens the Linkage tab; ?tab=noSuchTab names the missing tab and opens none
//   S1 with the compile answer made not current (the response altered in the browser, the server untouched), the
//      out-of-date notice names the stale stamp and the reason; with the real answer there is no notice
//   A1 as an admin-role user (--adminUserName, role admin or super): the administration panel, with the upload form,
//      a source history group per role and part, and the compile history
//   A2 an edit with the sort order emptied is refused by the server by name; nothing is saved (an empty field is sent as
//      null, never as Number('') = 0)
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
// opens one tab of the page and waits for its panel to be shown
const openTabOf = async (page, tabName) => {
	await page.locator(`[data-testid="companion-tab-${tabName}"]`).click();
	await page.locator(`[data-testid="companion-${tabName === 'admin' ? 'admin' : `panel-${tabName}`}"]`).waitFor({ state: 'visible', timeout: 15000 });
	await page.waitForTimeout(800); // the window's slide transition, after which the other tabs' panels are hidden
};
const visibleOf = async (page, testId) => page.locator(`[data-testid="${testId}"]`).isVisible();
const STALE_REASON_TEXT = 'browser test: the recompile is made to fail';

let passed = 0;
let failed = 0;
const check = (checkName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${checkName}`); return; }
	failed++;
	console.log(`  FAIL: ${checkName}${detailText ? ` (${detailText})` : ''}`);
};

// logs in fresh and lands on the page; routeHandler, when given, sees the compile request
const openPageAs = async (browser, { userName, passwordFile, routeHandler, pageQueryText = '' }) => {
	const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
	const page = await browserContext.newPage();
	const compileAnswerList = [];
	page.on('response', async (response) => {
		if (response.url().endsWith('/api/companion-compile-current') && response.status() === 200) compileAnswerList.push((await response.json())[0]);
	});
	if (routeHandler) await page.route(COMPILE_ROUTE_PATTERN, routeHandler);
	await page.goto(`${baseUrl}/login?redirect=${encodeURIComponent(`${PAGE_PATH}${pageQueryText}`)}`);
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

	const tabTestIdList = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="companion-tab-"]')].map((tabElement) => tabElement.dataset.testid));
	check('T1 one tab per panel, in order', JSON.stringify(tabTestIdList) === JSON.stringify(PANEL_TEST_ID_LIST.map((testId) => testId.replace('companion-panel-', 'companion-tab-'))), tabTestIdList.join(' '));
	check('T1 the first tab is open by default and the others are not', (await visibleOf(page, 'companion-panel-dictionary')) && !(await visibleOf(page, 'companion-panel-linkage')));
	await openTabOf(page, 'linkage');
	check('T1 choosing a tab puts it in ?tab= and opens only it', new URL(page.url()).searchParams.get('tab') === 'linkage' && (await visibleOf(page, 'companion-panel-linkage')) && !(await visibleOf(page, 'companion-panel-dictionary')), page.url());

	const countSummary = compileAnswer.payload.countSummary;
	const linkageCountText = await page.locator('[data-testid="linkage-count"]').innerText();
	const countFigureList = [countSummary.elementCount, countSummary.resolvedCount, countSummary.distinctPropertyCount, countSummary.matchedElementCount, ...Object.values(countSummary.matchedElementCountByHub), ...Object.values(countSummary.matchCountByKind)];
	check(`U3 the linkage figures are the compile's (${countFigureList.join(', ')})`, countFigureList.every((countFigure) => new RegExp(`\\b${countFigure}\\b`).test(linkageCountText)), linkageCountText);
	const featuredCount = await page.locator('[data-testid^="linkage-featured-"]').count();
	check('U3 six to eight featured matches', featuredCount >= 6 && featuredCount <= 8, String(featuredCount));
	check('U3 no featured match is missing from the compile', (await page.locator('[data-testid="linkage-featured-missing"]').count()) === 0);
	check('U3 shared HR Open properties show the sharing elements', (await page.locator('[data-testid="linkage-shared"]').count()) >= 1);

	await openTabOf(page, 'dictionary');
	await page.locator('[data-testid="dictionary-search"] input').fill('Date of Hire');
	await page.waitForTimeout(500);
	const searchedCountText = await page.locator('[data-testid="dictionary-count"]').innerText();
	check('U4 the dictionary search narrows the table', /^\d+ of 422 elements$/.test(searchedCountText) && !searchedCountText.startsWith('422') && (await page.locator('[data-testid="dictionary-row-VIII:30"]').count()) === 1, searchedCountText);
	await page.locator('[data-testid="dictionary-search"] input').fill('');

	const groupedColumn = compileAnswer.payload.arkansasPilot.programColumnList.find((programColumn) => programColumn.groupLabel);
	await openTabOf(page, 'arkansas');
	const arkansasText = await page.locator('[data-testid="companion-panel-arkansas"]').innerText();
	check(`U5 the sheet's group label '${groupedColumn.groupLabel}' and its headers are shown`, arkansasText.includes(groupedColumn.groupLabel) && arkansasText.includes(compileAnswer.payload.arkansasPilot.programColumnList[0].programName.split('\n')[0].trim()));
	check('U6 no administration panel or tab for a user', (await page.locator('[data-testid="companion-admin"]').count()) === 0 && (await page.locator('[data-testid="companion-tab-admin"]').count()) === 0);
	await openTabOf(page, 'askDme');
	const askDmeHrefList = await page.locator('[data-testid^="ask-dme-"] a').evaluateAll((linkList) => linkList.map((linkElement) => linkElement.getAttribute('href')));
	check('U7 each Ask DME link opens the DME with its prompt to fill in (?prefillPrompt=), never ?prompt=', askDmeHrefList.length >= 1 && askDmeHrefList.every((hrefText) => hrefText.startsWith('/dm/explorer?prefillPrompt=') && !/[?&]prompt=/.test(hrefText)), askDmeHrefList.join(' '));
	await page.locator('[data-testid="companion-panel-askDme"]').screenshot({ path: shotPath('companionPages-G4.1-user-askDme') });
	await page.evaluate(() => document.querySelector('[data-testid="companion-page"]').scrollIntoView());
	await page.screenshot({ path: shotPath('companionPages-G4.1-user') });
	await openTabOf(page, 'linkage');
	await page.locator('[data-testid="companion-panel-linkage"]').screenshot({ path: shotPath('companionPages-G4.1-user-linkage') });
	await asUser.browserContext.close();

	console.log('DEEP LINKS (?tab=)');
	const asUserLinked = await openPageAs(browser, { userName: argumentByName.userName, passwordFile: argumentByName.passwordFile, pageQueryText: '?tab=linkage' });
	check('T2 ?tab=linkage opens the Linkage tab', (await visibleOf(asUserLinked.page, 'companion-panel-linkage')) && !(await visibleOf(asUserLinked.page, 'companion-panel-dictionary')));
	await asUserLinked.browserContext.close();
	const asUserMislinked = await openPageAs(browser, { userName: argumentByName.userName, passwordFile: argumentByName.passwordFile, pageQueryText: '?tab=noSuchTab' });
	const unknownTabText = (await asUserMislinked.page.locator('[data-testid="companion-unknown-tab"]').count()) ? await asUserMislinked.page.locator('[data-testid="companion-unknown-tab"]').innerText() : '';
	check('T2 ?tab=noSuchTab names the missing tab and opens no panel', unknownTabText.includes('noSuchTab') && !(await visibleOf(asUserMislinked.page, 'companion-panel-dictionary')), unknownTabText);
	await asUserMislinked.browserContext.close();

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
	await asAdmin.page.waitForSelector('[data-testid="companion-tab-admin"]', { timeout: 15000 }).catch(() => {});
	if (await asAdmin.page.locator('[data-testid="companion-tab-admin"]').count()) await openTabOf(asAdmin.page, 'admin');
	await asAdmin.page.waitForTimeout(1500);
	check('A1 the Administration tab opens the administration panel', (await asAdmin.page.locator('[data-testid="companion-admin"]').count()) === 1);
	check('A1 with the upload form', (await asAdmin.page.locator('[data-testid="admin-upload-form"]').count()) === 1);
	const historyGroupCount = await asAdmin.page.locator('[data-testid^="admin-history-"][data-testid$="-whole"], [data-testid^="admin-history-dictionary-"]').count();
	const currentPartCount = new Set(asAdmin.compileAnswerList[0].payload.sourceList.map((sourceRecord) => `${sourceRecord.sourceRole}\t${sourceRecord.sourcePart}`)).size;
	check(`A1 a source history group for each of the ${currentPartCount} roles and parts`, historyGroupCount === currentPartCount, String(historyGroupCount));
	check('A1 the compile history lists compiles', (await asAdmin.page.locator('[data-testid="admin-compile-history"] tbody tr').count()) >= 1);
	await asAdmin.page.locator('[data-testid="admin-edit-page"]').click();
	await asAdmin.page.locator('[data-testid="admin-page-sort-order"] input').fill('');
	await asAdmin.page.locator('[data-testid="admin-page-save"]').click();
	await asAdmin.page.waitForSelector('[data-testid="admin-page-error"], [data-testid="admin-page-saved"]', { timeout: 15000 });
	const sortOrderErrorText = (await asAdmin.page.locator('[data-testid="admin-page-error"]').count()) ? await asAdmin.page.locator('[data-testid="admin-page-error"]').innerText() : '';
	check('A2 an edit with an empty sort order is refused by name, not saved as 0', /sortOrder must be an integer \(got null\)/.test(sortOrderErrorText) && (await asAdmin.page.locator('[data-testid="admin-page-saved"]').count()) === 0, sortOrderErrorText);
	await asAdmin.page.getByRole('button', { name: 'Cancel' }).click();
	await asAdmin.page.locator('[data-testid="companion-admin"]').scrollIntoViewIfNeeded();
	await asAdmin.page.screenshot({ path: shotPath('companionPages-G4.1-admin') });
	await asAdmin.page.locator('[data-testid="companion-admin"]').screenshot({ path: shotPath('companionPages-G4.1-admin-panel') });
	await asAdmin.browserContext.close();
} finally {
	await browser.close();
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
