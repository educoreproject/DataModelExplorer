// raterPreview.spec.mjs — revision 8 browser gates (WORKORDER-RATER8): from the Mapping Survey tab the admin previews
// the raters' real rating page, read-only. On a running site, with a main-site admin account:
//   B8.1 each survey card's "Preview survey S" link opens /admin?tool=ceds-rater&view=preview&survey=S&item=1 in the
//        tab: the banner "Preview: nothing is saved", item 1 of 50, the element and its candidate cards
//   B8.2 read-only: Save is disabled, there is no finish link; the answer controls work on the page
//   B8.3 Next walks items 1..50 (Next disabled at 50), Previous walks back; an item's card order is the same each visit
//   B8.4 the finder works in preview: a CEDS ID search and Browse answer
//   B8.5 no write request leaves the browser in preview: every /api call while previewing is a raterAdmin preview read
//   B8.6 "Back to Mapping Survey" returns to the raters view (/admin?tool=ceds-rater)
//   B8.7 View items: each row links to its preview; item 5's link opens item 5, the element the list shows
//   B8.8 the raters' sign-in and instructions pages say Mapping Survey (browser tab title and app bar)
// It makes no raters and writes nothing to the rater store.
//
//   node html/tests/rater/raterPreview.spec.mjs --baseUrl=… --adminUserName=… --adminPasswordFile=<file holding it>
//        --surveyName=A --playwrightCorePath=… --chromePath=… --evidenceDir=…

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'adminUserName', 'adminPasswordFile', 'surveyName', 'playwrightCorePath', 'chromePath', 'evidenceDir'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`raterPreview: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const adminPassword = fs.readFileSync(argumentByName.adminPasswordFile, 'utf8').trim();
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
const surveyName = argumentByName.surveyName;
fs.mkdirSync(argumentByName.evidenceDir, { recursive: true });
const shotPath = (shotName) => path.join(argumentByName.evidenceDir, `${shotName}.png`);

const TAB_URL_PATTERN = /\/admin\/?\?tool=ceds-rater$/;
const SURVEY_ITEM_COUNT = 50;
const PREVIEW_ADMIN_ACTION_LIST = ['previewItem', 'previewSearch', 'previewBrowse'];
const previewUrlPatternOf = (itemNumber) => new RegExp(`/admin/?\\?tool=ceds-rater&view=preview&survey=${surveyName}&item=${itemNumber}$`);

let passCount = 0;
let failCount = 0;
const check = (testName, condition, detailText) => {
	if (condition) {
		passCount++;
		console.log(`  PASS: ${testName}`);
		return;
	}
	failCount++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const mainLoginInBrowser = async (page, userName, password) => {
	await page.getByLabel('User Name').fill(userName);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Login' }).click();
};

const browser = await chromium.launch({ executablePath: argumentByName.chromePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// every /api request the page sends while previewing: its route and, for raterAdmin, its adminAction
let isWatchingRequests = false;
const watchedRequestList = [];
page.on('request', (request) => {
	if (!isWatchingRequests || !request.url().includes('/api/')) {
		return;
	}
	const routeName = new URL(request.url()).pathname.replace(/^.*\/api\//, '');
	let adminAction = null;
	if (routeName === 'raterAdmin') {
		adminAction = (JSON.parse(request.postData() || '{}') || {}).adminAction || null;
	}
	watchedRequestList.push({ routeName, adminAction, method: request.method() });
});

const crumbText = async () => (await page.locator('[data-testid="rater-item-crumb"]').innerText()).trim();
const waitForPreviewItem = async (itemNumber) => {
	await page.waitForURL(previewUrlPatternOf(itemNumber), { timeout: 20000 });
	await page.waitForFunction((expectedNumber) => {
		const crumb = document.querySelector('[data-testid="rater-item-crumb"]');
		return crumb && crumb.textContent.includes(`Item ${expectedNumber} of`) && document.querySelectorAll('[data-testid="rater-candidate-row"]').length > 0;
	}, itemNumber, { timeout: 20000 });
};
const cardOrderText = async () => JSON.stringify(await page.locator('[data-testid="rater-candidate-row"] [data-testid="rater-card-ceds-id"]').allInnerTexts()) + JSON.stringify(await page.locator('[data-testid="rater-candidate-row"]').allInnerTexts());

try {
	// ---------------------------------------------------------------- B8.1 the card's preview link
	console.log('B8.1 Preview survey opens item 1 in the tab');
	await page.goto(`${baseUrl}/login?redirect=${encodeURIComponent('/admin?tool=ceds-rater')}`);
	await mainLoginInBrowser(page, argumentByName.adminUserName, adminPassword);
	await page.waitForURL(TAB_URL_PATTERN, { timeout: 20000 });
	const cardLinkSelector = `[data-testid="rater-surveys-preview-${surveyName}"]`;
	await page.waitForSelector(cardLinkSelector, { timeout: 20000 });
	const cardLinkHref = await page.getAttribute(cardLinkSelector, 'href');
	check(`survey ${surveyName}'s card has a "Preview survey ${surveyName}" link to item 1`, (await page.locator(cardLinkSelector).innerText()).trim() === `Preview survey ${surveyName}` && previewUrlPatternOf(1).test(cardLinkHref), cardLinkHref);
	isWatchingRequests = true;
	await page.click(cardLinkSelector);
	await waitForPreviewItem(1);
	const bannerText = (await page.locator('[data-testid="rater-preview-banner"]').innerText()).trim();
	check('the banner says "Preview: nothing is saved" and names the shuffle', bannerText.startsWith('Preview: nothing is saved.') && /fixed preview order/.test(bannerText), bannerText);
	check(`it shows item 1 of ${SURVEY_ITEM_COUNT} of survey ${surveyName}`, (await crumbText()).includes(`Item 1 of ${SURVEY_ITEM_COUNT}`) && (await page.locator('.rt-crumb-survey').innerText()).includes(`Survey ${surveyName}`), await crumbText());
	const firstElementName = (await page.locator('[data-testid="rater-element-name"]').innerText()).trim();
	check('the element panel and the candidate cards are there (the raters\' own components)', firstElementName.length > 0 && (await page.locator('[data-testid="rater-candidate-row"]').count()) > 0 && (await page.locator('[data-testid="rater-finder"]').count()) === 1, firstElementName);
	check('the Mapping Survey tab is still the selected tool', (await page.locator('[data-testid="ceds-rater-tool"]').count()) === 1);
	await page.screenshot({ path: shotPath('80-preview-item-1') });

	// ---------------------------------------------------------------- B8.2 read-only
	console.log('B8.2 read-only');
	check('Save is disabled', await page.locator('[data-testid="rater-save"]').isDisabled());
	check('there is no "review or finish" link', (await page.locator('.rt-done-link').count()) === 0);
	await page.locator('[data-testid="rater-candidate-row"]').nth(0).locator('[data-testid="rater-best-radio"]').check();
	await page.fill('[data-testid="rater-note"]', 'Trying the page out.');
	check('the answer controls work on the page (a Best is chosen, the summary says so)', (await page.locator('[data-testid="rater-answer-summary"]').innerText()).includes('Best:'));
	await page.locator('[data-testid="rater-save"]').click({ force: true, timeout: 3000 }).catch(() => null);
	check('a forced click on Save does nothing (still item 1, no message)', previewUrlPatternOf(1).test(page.url()) && (await page.locator('[data-testid="rater-answer-message"]').count()) === 0, page.url());

	// ---------------------------------------------------------------- B8.3 walk the survey
	console.log(`B8.3 Next walks 1..${SURVEY_ITEM_COUNT}, Previous walks back`);
	const item2OrderList = [];
	let walkBrokeAt = null;
	for (let itemNumber = 2; itemNumber <= SURVEY_ITEM_COUNT; itemNumber++) {
		await page.click('[data-testid="rater-preview-next"]');
		const arrived = await waitForPreviewItem(itemNumber).then(() => true).catch(() => false);
		if (!arrived) {
			walkBrokeAt = itemNumber;
			break;
		}
		if (itemNumber === 2) {
			item2OrderList.push(await cardOrderText());
		}
	}
	check(`Next reaches every item, 2 to ${SURVEY_ITEM_COUNT}, in order`, walkBrokeAt === null, `stopped at ${walkBrokeAt}`);
	check(`at item ${SURVEY_ITEM_COUNT} Next is disabled`, await page.locator('[data-testid="rater-preview-next"]').isDisabled());
	await page.click('[data-testid="rater-previous"]');
	await waitForPreviewItem(SURVEY_ITEM_COUNT - 1);
	check(`Previous goes back to item ${SURVEY_ITEM_COUNT - 1}`, (await crumbText()).includes(`Item ${SURVEY_ITEM_COUNT - 1} of`));
	await page.goBack();
	await waitForPreviewItem(SURVEY_ITEM_COUNT);
	check(`the browser Back button returns to item ${SURVEY_ITEM_COUNT}`, (await crumbText()).includes(`Item ${SURVEY_ITEM_COUNT} of`));

	// ---------------------------------------------------------------- B8.7 View items links (also re-visits item 2)
	console.log('B8.6 Back to Mapping Survey; B8.7 View items links');
	await page.click('[data-testid="rater-preview-back"]');
	await page.waitForURL(TAB_URL_PATTERN, { timeout: 20000 });
	await page.waitForSelector('[data-testid="rater-admin-table"]', { timeout: 20000 });
	check('Back to Mapping Survey returns to the raters view (/admin?tool=ceds-rater, no preview parameters)', TAB_URL_PATTERN.test(page.url()) && (await page.locator('[data-testid="rater-preview"]').count()) === 0, page.url());
	await page.click(`[data-testid="rater-surveys-view-${surveyName}"]`);
	await page.waitForSelector('[data-testid="rater-surveys-item"]', { timeout: 20000 });
	const itemRowCount = await page.locator('[data-testid="rater-surveys-item"]').count();
	const previewLinkCount = await page.locator('[data-testid^="rater-surveys-item-preview-"]').count();
	check(`every one of the ${itemRowCount} View items rows has a Preview link`, itemRowCount === SURVEY_ITEM_COUNT && previewLinkCount === SURVEY_ITEM_COUNT, `${previewLinkCount} links`);
	const listedItem5Text = (await page.locator('[data-testid="rater-surveys-item"]').nth(4).locator('b').innerText()).trim();
	await page.click('[data-testid="rater-surveys-item-preview-5"]');
	await waitForPreviewItem(5);
	const shownItem5Name = (await page.locator('[data-testid="rater-element-name"]').innerText()).trim();
	check(`item 5's link opens preview item 5, the element the list shows (${listedItem5Text})`, listedItem5Text.endsWith(shownItem5Name) && (await page.locator('[data-testid="rater-surveys-items"]').count()) === 0, `${listedItem5Text} vs ${shownItem5Name}`);
	await page.screenshot({ path: shotPath('81-preview-item-5-from-view-items') });
	for (let itemNumber = 4; itemNumber >= 2; itemNumber--) {
		await page.click('[data-testid="rater-previous"]');
		await waitForPreviewItem(itemNumber);
	}
	item2OrderList.push(await cardOrderText());
	check("item 2's cards are in the same order on a second visit", item2OrderList.length === 2 && item2OrderList[0] === item2OrderList[1]);

	// ---------------------------------------------------------------- B8.4 search and browse
	console.log('B8.4 the finder works in preview');
	await page.fill('[data-testid="rater-search-input"]', 'P001572');
	await page.click('[data-testid="rater-search-submit"]');
	await page.locator('[data-testid="rater-search-result"]').first().waitFor({ timeout: 20000 }).catch(() => null);
	check('a CEDS ID search (P001572) shows result cards', (await page.locator('[data-testid="rater-search-result"]').count()) > 0, (await page.locator('[data-testid="rater-finder-error"]').count()) ? await page.locator('[data-testid="rater-finder-error"]').innerText() : '');
	const addButton = page.locator('[data-testid="rater-search-result"] [data-testid="rater-add-card"]').first();
	if ((await addButton.count()) > 0 && (await addButton.isEnabled())) {
		const rowCountBefore = await page.locator('[data-testid="rater-candidate-row"]').count();
		await addButton.click();
		check('+ Add to candidates works on the page', (await page.locator('[data-testid="rater-candidate-row"]').count()) === rowCountBefore + 1);
	}
	await page.click('[data-testid="rater-tab-browse"]');
	await page.locator('[data-testid="rater-browse-concept"]').first().waitFor({ timeout: 20000 }).catch(() => null);
	check('Browse shows the CEDS concepts', (await page.locator('[data-testid="rater-browse-concept"]').count()) > 0);
	await page.screenshot({ path: shotPath('82-preview-finder') });

	// ---------------------------------------------------------------- B8.5 what left the browser
	console.log('B8.5 no write request left the browser');
	isWatchingRequests = false;
	// every /api/rater* route but raterAdmin is a rater endpoint; the site's own page-visit log (pageActivity, sent on
	// every route change of the main site) is not the rater store and is left out
	const raterRouteRequestList = watchedRequestList.filter((watched) => watched.routeName.startsWith('rater') && watched.routeName !== 'raterAdmin');
	const otherRouteNameList = Array.from(new Set(watchedRequestList.filter((watched) => !watched.routeName.startsWith('rater')).map((watched) => watched.routeName)));
	check(`no other API route was called but the site's page-visit log (${otherRouteNameList.join(', ') || 'none'})`, otherRouteNameList.every((routeName) => routeName === 'pageActivity'), otherRouteNameList.join(', '));
	const previewReadList = watchedRequestList.filter((watched) => watched.routeName === 'raterAdmin' && PREVIEW_ADMIN_ACTION_LIST.includes(watched.adminAction));
	// the raters view, shown between Back and View items, reads its own list (list, surveys, surveyItems)
	const RATERS_VIEW_READ_LIST = ['list', 'surveys', 'surveyItems'];
	const otherAdminList = watchedRequestList.filter((watched) => watched.routeName === 'raterAdmin' && !PREVIEW_ADMIN_ACTION_LIST.includes(watched.adminAction) && !RATERS_VIEW_READ_LIST.includes(watched.adminAction));
	check(`the preview made ${previewReadList.length} preview reads (items, a search, browses)`, previewReadList.some((watched) => watched.adminAction === 'previewItem') && previewReadList.some((watched) => watched.adminAction === 'previewSearch') && previewReadList.some((watched) => watched.adminAction === 'previewBrowse'));
	check('no call to any rater endpoint (raterAnswerSave, raterFinish, raterItemGet, …)', raterRouteRequestList.length === 0, JSON.stringify(raterRouteRequestList.slice(0, 5)));
	check('no raterAdmin call other than the preview reads and the raters view\'s own reads', otherAdminList.length === 0, JSON.stringify(otherAdminList.slice(0, 5)));

	// ---------------------------------------------------------------- B8.8 the raters' pages say Mapping Survey
	console.log("B8.8 the raters' pages say Mapping Survey");
	const raterPage = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
	for (const [pagePath, expectedTitle] of [['/rater', 'Mapping Survey: sign in'], ['/rater/instructions', 'Mapping Survey: instructions']]) {
		await raterPage.goto(`${baseUrl}${pagePath}`);
		await raterPage.locator('[data-testid="rater-area-label"]').waitFor({ timeout: 20000 });
		await raterPage.waitForFunction((titleText) => document.title === titleText, expectedTitle, { timeout: 10000 }).catch(() => null);
		const areaLabelText = (await raterPage.locator('[data-testid="rater-area-label"]').innerText()).trim();
		check(`${pagePath}: the browser tab says '${expectedTitle}' and the app bar 'Mapping Survey'`, (await raterPage.title()) === expectedTitle && areaLabelText === 'Mapping Survey', `${await raterPage.title()} / ${areaLabelText}`);
	}
	await raterPage.screenshot({ path: shotPath('83-mapping-survey-instructions') });
} catch (walkError) {
	check('the preview walkthrough ran to the end', false, `${walkError && walkError.message}`.split('\n')[0]);
	await page.screenshot({ path: shotPath('89-preview-failure') }).catch(() => {});
} finally {
	await browser.close();
}

console.log(`\n=== raterPreview (revision 8 browser) — Results: ${passCount} passed, ${failCount} failed ===`);
process.exit(failCount === 0 ? 0 : 1);
