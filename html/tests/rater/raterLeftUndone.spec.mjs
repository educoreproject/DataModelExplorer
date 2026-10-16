// raterLeftUndone.spec.mjs — revision 14 browser gates (WORKORDER-RATER14): "12 answered out of 50", and a list of
// what is left undone. On a running site, with a main-site admin account:
//   U14.1 the toolbar reads "N answered out of 50", on screen at 1440×900 and 1280×720, and counts a save at once
//   U14.2 Save and next on item 50 with items unanswered lands on /rater/done, which says how many are left and lists
//         exactly those items (item number, standard, element name), each a link that opens it in "left undone" mode
//   U14.3 in that mode Previous and Next walk only the listed items, in item order, and "Back to the list (N left)" shows
//   U14.4 Save and next goes to the next listed item still unanswered (after this one, then from the top); items that
//         were on the list stay on the walk once answered; saving the last one returns to the page, now Finish and send
//   U14.5 leaving the mode (opening an item by number) gives back normal 1..50 navigation; an unknown set is refused
//         by name
//   U14.6 with no gaps, Save and next on item 50 goes to Finish and send, as before
//   U14.7 the admin preview shows "0 answered out of 50", no list link, no set walk, and stays read-only
// It makes one rater on --surveyName (prefix --raterPrefix), saves through the API and the page, and removes the rater.
//
//   node html/tests/rater/raterLeftUndone.spec.mjs --baseUrl=… --adminUserName=… --adminPasswordFile=<file holding it>
//        --surveyName=A --raterPrefix=rater14-undone --playwrightCorePath=… --chromePath=… --evidenceDir=…

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'adminUserName', 'adminPasswordFile', 'surveyName', 'raterPrefix', 'playwrightCorePath', 'chromePath', 'evidenceDir'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`raterLeftUndone: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const adminPassword = fs.readFileSync(argumentByName.adminPasswordFile, 'utf8').trim();
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
const surveyName = argumentByName.surveyName;
const raterUserName = `${argumentByName.raterPrefix}-1`;
fs.mkdirSync(argumentByName.evidenceDir, { recursive: true });
const shotPath = (shotName) => path.join(argumentByName.evidenceDir, `${shotName}.png`);

// the items left unanswered before item 50 (50 itself is saved on the page, U14.2)
const GAP_ITEM_NUMBER_LIST = Object.freeze([5, 12, 30]);
const ITEM_COUNT = 50;

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

const apiPost = async (routeName, requestBody, authtoken) => {
	const response = await fetch(`${baseUrl}/api/${routeName}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authtoken ? { Authorization: `Bearer ${authtoken}` } : {}) }, body: JSON.stringify(requestBody) });
	const bodyText = await response.text();
	return { statusCode: response.status, bodyText, bodyJson: /^\s*[[{]/.test(bodyText) ? JSON.parse(bodyText) : null, authtoken: response.headers.get('authtoken') };
};
const firstOf = (bodyJson) => (Array.isArray(bodyJson) ? bodyJson[0] : bodyJson);

const browser = await chromium.launch({ executablePath: argumentByName.chromePath, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

const waitForItem = async (targetPage, itemNumber) => {
	await targetPage.waitForFunction((expectedNumber) => {
		const crumb = document.querySelector('[data-testid="rater-item-crumb"]');
		return crumb && crumb.textContent.includes(`Item ${expectedNumber} of`) && document.querySelectorAll('[data-testid="rater-candidate-row"]').length > 0;
	}, itemNumber, { timeout: 20000 });
};
const textOf = async (testId) => ((await page.locator(`[data-testid="${testId}"]`).count()) > 0 ? (await page.locator(`[data-testid="${testId}"]`).innerText()).trim() : '');
const queryOfPage = () => Object.fromEntries(new URL(page.url()).searchParams.entries());
const isUndoneUrl = (itemNumber, itemsText) => {
	const query = queryOfPage();
	return new URL(page.url()).pathname.replace(/\/$/, '') === '/rater/rate' && query.item === `${itemNumber}` && query.set === 'undone' && query.items === itemsText;
};
const saveNoMatchOnPage = async () => {
	await page.click('[data-testid="rater-choice-noMatch"]');
	await page.click('[data-testid="rater-save"]');
};
const progressTextOnScreen = async () =>
	page.evaluate(() => {
		window.scrollTo(0, 0);
		const element = document.querySelector('[data-testid="rater-progress-text"]');
		const rect = element ? element.getBoundingClientRect() : null;
		return !!rect && rect.width > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight && rect.left >= 0 && rect.right <= window.innerWidth;
	});

let raterWasMade = false;
let adminToken = null;
try {
	// ---------------------------------------------------------------- set up: one rater, through the admin API
	const adminLogin = await apiPost('login', { username: argumentByName.adminUserName, password: adminPassword });
	adminToken = adminLogin.statusCode === 200 ? adminLogin.authtoken : null;
	if (!adminToken) {
		throw new Error(`admin login refused (${adminLogin.statusCode})`);
	}
	await apiPost('raterAdmin', { adminAction: 'remove', raterUserName }, adminToken);
	const addResponse = await apiPost('raterAdmin', { adminAction: 'add', raterUserName, whoText: 'Left-undone test rater (temporary, lane RATER revision 14)', surveyName }, adminToken);
	const added = firstOf(addResponse.bodyJson);
	if (addResponse.statusCode !== 200 || !added || !added.issuedPassword) {
		throw new Error(`could not make ${raterUserName}: ${addResponse.statusCode} ${addResponse.bodyText.slice(0, 200)}`);
	}
	raterWasMade = true;
	const raterLogin = await apiPost('login', { username: raterUserName, password: added.issuedPassword });
	const raterToken = raterLogin.statusCode === 200 ? raterLogin.authtoken : null;
	if (!raterToken) {
		throw new Error(`rater login refused (${raterLogin.statusCode})`);
	}

	await page.goto(`${baseUrl}/rater`);
	await page.fill('[data-testid="rater-signin-name"]', raterUserName);
	await page.fill('[data-testid="rater-signin-password"]', added.issuedPassword);
	await page.click('[data-testid="rater-signin-submit"]');
	await waitForItem(page, 1);

	// ---------------------------------------------------------------- U14.1 the count
	console.log('U14.1 "N answered out of 50"');
	check('the toolbar reads "0 answered out of 50" before any save', (await textOf('rater-progress-text')) === `0 answered out of ${ITEM_COUNT}`, await textOf('rater-progress-text'));
	check('…and keeps the bar beside it', (await page.locator('.rt-progress').count()) === 1);
	check('the count is on screen at 1440×900', await progressTextOnScreen());
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.waitForTimeout(300);
	check('the count is on screen at 1280×720', await progressTextOnScreen());
	await page.screenshot({ path: shotPath('U14-1-count-1280x720') });
	await page.setViewportSize({ width: 1440, height: 900 });
	await saveNoMatchOnPage();
	await waitForItem(page, 2);
	check('after one save on the page it reads "1 answered out of 50"', (await textOf('rater-progress-text')) === `1 answered out of ${ITEM_COUNT}`, await textOf('rater-progress-text'));
	check('outside the mode there is no "Back to the list" link', (await page.locator('[data-testid="rater-back-to-list"]').count()) === 0);

	// the rest through the API: items 2..49 but the gaps; item 50 is left for the page
	const itemByNumber = {};
	for (let itemNumber = 2; itemNumber <= ITEM_COUNT; itemNumber++) {
		const item = firstOf((await apiPost('raterItemGet', { itemNumber }, raterToken)).bodyJson);
		itemByNumber[itemNumber] = item;
		if (itemNumber < ITEM_COUNT && !GAP_ITEM_NUMBER_LIST.includes(itemNumber)) {
			await apiPost('raterAnswerSave', { elementStableId: item.element.elementStableId, answerKind: 'noMatch' }, raterToken);
		}
	}
	const afterApiProgress = firstOf((await apiPost('raterProgress', {}, raterToken)).bodyJson);
	check(`set up: ${ITEM_COUNT - GAP_ITEM_NUMBER_LIST.length - 1} saved, items ${GAP_ITEM_NUMBER_LIST.join(', ')} and 50 not`, afterApiProgress.savedCount === ITEM_COUNT - GAP_ITEM_NUMBER_LIST.length - 1, JSON.stringify(afterApiProgress.savedCount));

	// ---------------------------------------------------------------- U14.2 Save on item 50 with gaps → the list
	console.log('U14.2 Save and next on item 50 with gaps lands on the list');
	await page.goto(`${baseUrl}/rater/rate?item=${ITEM_COUNT}`);
	await waitForItem(page, ITEM_COUNT);
	check('item 50 reads "46 answered out of 50"', (await textOf('rater-progress-text')) === `46 answered out of ${ITEM_COUNT}`, await textOf('rater-progress-text'));
	await saveNoMatchOnPage();
	await page.waitForURL(/\/rater\/done\/?$/, { timeout: 20000 });
	await page.locator('[data-testid="rater-left-undone-list"]').waitFor({ timeout: 20000 });
	const itemsText = GAP_ITEM_NUMBER_LIST.join('-');
	check('the page says how many are left', (await page.locator('#doneHead').innerText()).trim() === `${GAP_ITEM_NUMBER_LIST.length} left undone`, await page.locator('#doneHead').innerText());
	check('…and "47 answered out of 50"', (await textOf('rater-left-undone-count')).startsWith(`47 answered out of ${ITEM_COUNT}.`), await textOf('rater-left-undone-count'));
	const listedRowList = await page.$$eval('[data-testid="rater-left-undone-list"] a', (linkList) => linkList.map((link) => ({ testId: link.dataset.testid, href: link.getAttribute('href'), number: link.querySelector('.rt-undone-number').textContent.trim(), standard: link.querySelector('.rt-undone-standard').textContent.trim(), name: link.querySelector('.rt-undone-name').textContent.trim() })));
	check(`the list is exactly items ${GAP_ITEM_NUMBER_LIST.join(', ')}, in order`, JSON.stringify(listedRowList.map((listedRow) => listedRow.number)) === JSON.stringify(GAP_ITEM_NUMBER_LIST.map((itemNumber) => `Item ${itemNumber}`)), JSON.stringify(listedRowList.map((listedRow) => listedRow.number)));
	check('each row names the standard and the element of that item', listedRowList.length === GAP_ITEM_NUMBER_LIST.length && GAP_ITEM_NUMBER_LIST.every((itemNumber, position) => listedRowList[position].standard === itemByNumber[itemNumber].element.standard && listedRowList[position].name === itemByNumber[itemNumber].element.name), JSON.stringify(listedRowList.map((listedRow) => [listedRow.standard, listedRow.name])));
	check('each row links to its item in "left undone" mode', GAP_ITEM_NUMBER_LIST.every((itemNumber, position) => listedRowList[position] && listedRowList[position].href === `/rater/rate?item=${itemNumber}&set=undone&items=${itemsText}`), JSON.stringify(listedRowList.map((listedRow) => listedRow.href)));
	check('Finish and send is not offered while items are left', (await page.locator('[data-testid="rater-finish"]').count()) === 0);
	await page.screenshot({ path: shotPath('U14-2-left-undone-list') });

	// ---------------------------------------------------------------- U14.3 Previous / Next on the set
	console.log('U14.3 Previous and Next walk only the listed items');
	await page.click('[data-testid="rater-left-undone-item-12"]');
	await waitForItem(page, 12);
	check('the link opens item 12 in "left undone" mode', isUndoneUrl(12, itemsText), page.url());
	check('"Back to the list (3 left)" shows', (await textOf('rater-back-to-list')) === 'Back to the list (3 left)', await textOf('rater-back-to-list'));
	await page.screenshot({ path: shotPath('U14-3-undone-mode-item-12') });
	await page.click('[data-testid="rater-previous"]');
	await waitForItem(page, 5);
	check('Previous from 12 goes to 5 (not 11)', isUndoneUrl(5, itemsText), page.url());
	check('Previous is disabled on the first listed item', await page.locator('[data-testid="rater-previous"]').isDisabled());
	await page.click('[data-testid="rater-next-in-set"]');
	await waitForItem(page, 12);
	await page.click('[data-testid="rater-next-in-set"]');
	await waitForItem(page, 30);
	check('Next walks 5 → 12 → 30 (not 6, not 13)', isUndoneUrl(30, itemsText), page.url());
	check('Next is disabled on the last listed item', await page.locator('[data-testid="rater-next-in-set"]').isDisabled());

	// ---------------------------------------------------------------- U14.5 leaving the mode; an unknown set
	console.log('U14.5 leaving the mode, and an unknown set');
	await page.goto(`${baseUrl}/rater/rate?item=13`);
	await waitForItem(page, 13);
	check('opening an item by number leaves the mode: no back link, no set Next', (await page.locator('[data-testid="rater-back-to-list"]').count()) === 0 && (await page.locator('[data-testid="rater-next-in-set"]').count()) === 0);
	await page.click('[data-testid="rater-previous"]');
	await waitForItem(page, 12);
	check('…and Previous from 13 is 12, by item number, with no set in the URL', new URL(page.url()).searchParams.get('set') === null && queryOfPage().item === '12', page.url());
	await page.goto(`${baseUrl}/rater/rate?item=12&set=bogus&items=${itemsText}`);
	await page.locator('[data-testid="rater-set-refused"]').waitFor({ timeout: 20000 });
	check('an unknown set is refused by name, not read as 1..50', (await textOf('rater-set-refused')).includes('set="bogus"') && (await page.locator('[data-testid="rater-item-crumb"]').count()) === 0, await textOf('rater-set-refused'));
	await page.goto(`${baseUrl}/rater/rate?item=12&set=undone&items=5-x`);
	await page.locator('[data-testid="rater-set-refused"]').waitFor({ timeout: 20000 });
	check('a malformed item list is refused by name', (await textOf('rater-set-refused')).includes('items="5-x"'), await textOf('rater-set-refused'));

	// ---------------------------------------------------------------- U14.4 Save and next on the set
	console.log('U14.4 Save and next goes to the next listed item still unanswered');
	await page.goto(`${baseUrl}/rater/rate?item=30&set=undone&items=${itemsText}`);
	await waitForItem(page, 30);
	await saveNoMatchOnPage();
	await waitForItem(page, 5);
	check('saving 30 (the last listed) goes back to the top of the list: 5', isUndoneUrl(5, itemsText), page.url());
	check('the count and the link follow: "48 answered out of 50", "(2 left)"', (await textOf('rater-progress-text')) === `48 answered out of ${ITEM_COUNT}` && (await textOf('rater-back-to-list')) === 'Back to the list (2 left)', `${await textOf('rater-progress-text')} / ${await textOf('rater-back-to-list')}`);
	await saveNoMatchOnPage();
	await waitForItem(page, 12);
	check('saving 5 goes to 12, the next one still unanswered', isUndoneUrl(12, itemsText), page.url());
	await page.click('[data-testid="rater-previous"]');
	await waitForItem(page, 5);
	check('Previous from 12 still reaches 5, answered but on the list', isUndoneUrl(5, itemsText), page.url());
	await page.click('[data-testid="rater-next-in-set"]');
	await waitForItem(page, 12);
	await page.click('[data-testid="rater-next-in-set"]');
	await waitForItem(page, 30);
	check('Next from 12 still reaches 30, answered but on the list', isUndoneUrl(30, itemsText), page.url());
	await page.click('[data-testid="rater-previous"]');
	await waitForItem(page, 12);
	check('"Back to the list (1 left)" on the last one', (await textOf('rater-back-to-list')) === 'Back to the list (1 left)', await textOf('rater-back-to-list'));
	await saveNoMatchOnPage();
	await page.waitForURL(/\/rater\/done\/?$/, { timeout: 20000 });
	await page.locator('[data-testid="rater-finish"]').waitFor({ timeout: 20000 });
	check('saving the last listed item returns to the page, now Finish and send ("All 50 rated", no list)', (await page.locator('#doneHead').innerText()).trim() === `All ${ITEM_COUNT} rated` && (await page.locator('[data-testid="rater-left-undone-list"]').count()) === 0, await page.locator('#doneHead').innerText());
	await page.screenshot({ path: shotPath('U14-4-finish-after-the-list') });

	// ---------------------------------------------------------------- U14.6 no gaps: Save on 50 → Finish, as before
	console.log('U14.6 with no gaps, Save and next on item 50 goes to Finish');
	await page.goto(`${baseUrl}/rater/rate?item=49`);
	await waitForItem(page, 49);
	await saveNoMatchOnPage();
	await waitForItem(page, ITEM_COUNT);
	check('Save on 49 with no gaps goes to 50', queryOfPage().item === `${ITEM_COUNT}` && new URL(page.url()).searchParams.get('set') === null, page.url());
	check('the count reads "50 answered out of 50"', (await textOf('rater-progress-text')) === `${ITEM_COUNT} answered out of ${ITEM_COUNT}`, await textOf('rater-progress-text'));
	await saveNoMatchOnPage();
	await page.waitForURL(/\/rater\/done\/?$/, { timeout: 20000 });
	await page.locator('[data-testid="rater-finish"]').waitFor({ timeout: 20000 });
	check('Save on 50 with no gaps goes to Finish and send', (await page.locator('#doneHead').innerText()).trim() === `All ${ITEM_COUNT} rated` && (await page.locator('[data-testid="rater-review"]').count()) === 1);

	// ---------------------------------------------------------------- U14.7 the admin preview
	console.log('U14.7 the admin preview: the count, no list, read-only');
	const adminPage = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
	const watchedRequestList = [];
	adminPage.on('request', (request) => {
		if (request.url().includes('/api/')) {
			const routeName = new URL(request.url()).pathname.replace(/^.*\/api\//, '');
			watchedRequestList.push({ routeName, adminAction: routeName === 'raterAdmin' ? (JSON.parse(request.postData() || '{}') || {}).adminAction || null : null });
		}
	});
	await adminPage.goto(`${baseUrl}/login?redirect=${encodeURIComponent('/admin?tool=ceds-rater')}`);
	await adminPage.getByLabel('User Name').fill(argumentByName.adminUserName);
	await adminPage.getByLabel('Password', { exact: true }).fill(adminPassword);
	await adminPage.getByRole('button', { name: 'Login' }).click();
	await adminPage.waitForURL(/\/admin\/?\?tool=ceds-rater$/, { timeout: 20000 });
	await adminPage.click(`[data-testid="rater-surveys-preview-${surveyName}"]`);
	await waitForItem(adminPage, 1);
	const previewRequestStart = watchedRequestList.length;
	const previewProgressText = (await adminPage.locator('[data-testid="rater-progress-text"]').innerText()).trim();
	check('the preview reads "0 answered out of 50"', previewProgressText === `0 answered out of ${ITEM_COUNT}`, previewProgressText);
	check('the preview has no list link and no set Next', (await adminPage.locator('[data-testid="rater-back-to-list"]').count()) === 0 && (await adminPage.locator('[data-testid="rater-next-in-set"]').count()) === 0);
	await adminPage.click('[data-testid="rater-preview-next"]');
	await waitForItem(adminPage, 2);
	check('Next in the preview is item 2, in the preview, not the list page', adminPage.url().includes('/admin') && !adminPage.url().includes('/rater/done') && new URL(adminPage.url()).searchParams.get('item') === '2', adminPage.url());
	check('Save stays disabled in the preview', await adminPage.locator('[data-testid="rater-save"]').isDisabled());
	await adminPage.screenshot({ path: shotPath('U14-7-preview-count') });
	const previewCallList = watchedRequestList.slice(previewRequestStart).filter((watched) => watched.routeName !== 'pageActivity');
	const nonPreviewCallList = previewCallList.filter((watched) => !(watched.routeName === 'raterAdmin' && watched.adminAction === 'previewItem'));
	check(`no write call left the preview: ${previewCallList.length} calls, all preview reads`, previewCallList.length > 0 && nonPreviewCallList.length === 0, JSON.stringify(nonPreviewCallList.slice(0, 5)));
} catch (walkError) {
	check('the left-undone walkthrough ran to the end', false, `${walkError && walkError.message}`.split('\n')[0]);
	await page.screenshot({ path: shotPath('U14-9-failure') }).catch(() => {});
} finally {
	if (raterWasMade) {
		const removeResponse = await apiPost('raterAdmin', { adminAction: 'remove', raterUserName }, adminToken);
		console.log(`  (cleanup: ${raterUserName} removed, status ${removeResponse.statusCode})`);
	}
	await browser.close();
}

console.log(`\n=== raterLeftUndone (revision 14 browser) — Results: ${passCount} passed, ${failCount} failed ===`);
process.exit(failCount === 0 ? 0 : 1);
