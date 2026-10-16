// raterFinderDrawer.spec.mjs — revision 10 browser gates (WORKORDER-RATER10): the finder moves into a drawer from the
// right, summoned from buttons that are always on screen. On a running site, with a main-site admin account:
//   D10.1 "Search all of CEDS" and "Browse CEDS" sit ABOVE the element panel and stay on screen after the candidate list
//         is scrolled to its bottom, at 1440×900 and 1280×720; the finder is not on the page until summoned
//   D10.2 each button opens the drawer on its own tab, focus inside it; the drawer is about half the viewport, on the
//         right, and the element panel stays fully visible beside it
//   D10.3 Esc, ✕ and a press outside the drawer each close it and return focus to the button that opened it
//   D10.4 a card's class name opens the drawer on Browse at that class; its tooltip says so, naming the class
//   D10.5 adding a card from the drawer says "Added to your candidates" and leaves the drawer open; the card is at the
//         top of the list, marked "Added by you"
//   D10.6 the quiet line at the foot of the list ("None of these fit? Search all of CEDS") opens the drawer on Search
//   D10.7 no "AI" wording on the page; below 1100px the drawer takes the whole viewport
//   D10.8 the admin preview has the same drawer: buttons, search answers, and no write call leaves the browser
// It makes one rater on --surveyName (prefix --raterPrefix), saves no answer, and removes the rater at the end.
//
//   node html/tests/rater/raterFinderDrawer.spec.mjs --baseUrl=… --adminUserName=… --adminPasswordFile=<file holding it>
//        --surveyName=A --raterPrefix=rater10-drawer --playwrightCorePath=… --chromePath=… --evidenceDir=…

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'adminUserName', 'adminPasswordFile', 'surveyName', 'raterPrefix', 'playwrightCorePath', 'chromePath', 'evidenceDir'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`raterFinderDrawer: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const adminPassword = fs.readFileSync(argumentByName.adminPasswordFile, 'utf8').trim();
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
const surveyName = argumentByName.surveyName;
const raterUserName = `${argumentByName.raterPrefix}-1`;
fs.mkdirSync(argumentByName.evidenceDir, { recursive: true });
const shotPath = (shotName) => path.join(argumentByName.evidenceDir, `${shotName}.png`);

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
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const DRAWER = '[data-testid="rater-finder-drawer"]';
const drawerIsShown = async () => page.locator(DRAWER).isVisible();
const focusedTestId = async () => page.evaluate(() => (document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.testid || document.activeElement.tagName.toLowerCase() : ''));
const waitForItem = async (itemNumber) => {
	await page.waitForFunction((expectedNumber) => {
		const crumb = document.querySelector('[data-testid="rater-item-crumb"]');
		return crumb && crumb.textContent.includes(`Item ${expectedNumber} of`) && document.querySelectorAll('[data-testid="rater-candidate-row"]').length > 0;
	}, itemNumber, { timeout: 20000 });
};
// where the openers, the element panel and the drawer are, in viewport pixels
const readLayout = async () =>
	page.evaluate(() => {
		const rectOf = (testId) => {
			const element = document.querySelector(`[data-testid="${testId}"]`);
			if (!element) {
				return null;
			}
			const rect = element.getBoundingClientRect();
			return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, isShown: rect.width > 0 && rect.height > 0 };
		};
		return { innerWidth: window.innerWidth, innerHeight: window.innerHeight, scrollY: window.scrollY, search: rectOf('rater-open-search'), browse: rectOf('rater-open-browse'), panel: rectOf('rater-element-panel'), drawer: rectOf('rater-finder-drawer') };
	});
const inViewport = (rect, layout) => !!rect && rect.isShown && rect.top >= 0 && rect.bottom <= layout.innerHeight && rect.left >= 0 && rect.right <= layout.innerWidth;
const scrollListToBottom = async () => {
	await page.evaluate(() => {
		const lastOther = Array.from(document.querySelectorAll('[data-testid^="rater-other-"]')).pop();
		lastOther.scrollIntoView({ block: 'end' });
		window.scrollBy(0, 400);
	});
	await page.waitForTimeout(300);
};
const openersCheck = async (sizeText) => {
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.waitForTimeout(200);
	const topLayout = await readLayout();
	check(`${sizeText}: both buttons on screen at the top, above the element panel`, inViewport(topLayout.search, topLayout) && inViewport(topLayout.browse, topLayout) && !!topLayout.panel && topLayout.search.bottom <= topLayout.panel.top && topLayout.browse.bottom <= topLayout.panel.top, JSON.stringify({ search: topLayout.search, panel: topLayout.panel && topLayout.panel.top }));
	await scrollListToBottom();
	const bottomLayout = await readLayout();
	const listBottom = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid^="rater-other-"]')).pop().getBoundingClientRect().bottom);
	check(`${sizeText}: list scrolled to its bottom (scrollY ${Math.round(bottomLayout.scrollY)}), both buttons still on screen`, bottomLayout.scrollY > 200 && listBottom <= bottomLayout.innerHeight && inViewport(bottomLayout.search, bottomLayout) && inViewport(bottomLayout.browse, bottomLayout), JSON.stringify({ search: bottomLayout.search, listBottom }));
	await page.screenshot({ path: shotPath(`D10-1-scrolled-${sizeText}`) });
	await page.evaluate(() => window.scrollTo(0, 0));
};

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
	const addResponse = await apiPost('raterAdmin', { adminAction: 'add', raterUserName, whoText: 'Finder drawer test rater (temporary, lane RATER revision 10)', surveyName }, adminToken);
	const added = firstOf(addResponse.bodyJson);
	if (addResponse.statusCode !== 200 || !added || !added.issuedPassword) {
		throw new Error(`could not make ${raterUserName}: ${addResponse.statusCode} ${addResponse.bodyText.slice(0, 200)}`);
	}
	raterWasMade = true;

	await page.goto(`${baseUrl}/rater`);
	await page.fill('[data-testid="rater-signin-name"]', raterUserName);
	await page.fill('[data-testid="rater-signin-password"]', added.issuedPassword);
	await page.click('[data-testid="rater-signin-submit"]');
	await waitForItem(1);

	// ---------------------------------------------------------------- D10.1 the buttons stay on screen
	console.log('D10.1 the buttons are always on screen');
	check('the finder is not on the page until summoned (drawer hidden, no "Find more candidates" below the list)', !(await drawerIsShown()) && !(await page.locator('[data-testid="rater-finder"]').isVisible()));
	await openersCheck('1440x900');
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.waitForTimeout(300);
	await openersCheck('1280x720');
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.waitForTimeout(300);

	// ---------------------------------------------------------------- D10.2 each button opens its own tab
	console.log('D10.2 the buttons open the drawer on their tab');
	await page.click('[data-testid="rater-open-search"]');
	await page.locator(DRAWER).waitFor({ state: 'visible', timeout: 5000 });
	await page.waitForTimeout(200);
	const searchLayout = await readLayout();
	check('Search all of CEDS opens the drawer on Search, focus in the search box', (await page.getAttribute('[data-testid="rater-tab-search"]', 'aria-selected')) === 'true' && (await focusedTestId()) === 'rater-search-input', await focusedTestId());
	check(`the drawer is on the right, about half the viewport (${Math.round(searchLayout.drawer.left)}–${Math.round(searchLayout.drawer.right)} of ${searchLayout.innerWidth})`, Math.abs(searchLayout.drawer.right - searchLayout.innerWidth) <= 1 && searchLayout.drawer.width >= 0.4 * searchLayout.innerWidth && searchLayout.drawer.width <= 0.6 * searchLayout.innerWidth);
	check(`the element panel stays fully visible, left of the drawer (panel right ${Math.round(searchLayout.panel.right)}, drawer left ${Math.round(searchLayout.drawer.left)})`, searchLayout.panel.right <= searchLayout.drawer.left && searchLayout.panel.left >= 0 && searchLayout.panel.top < searchLayout.innerHeight && searchLayout.panel.bottom > 0);
	const panelTopElement = await page.evaluate(() => {
		const nameRect = document.querySelector('[data-testid="rater-element-name"]').getBoundingClientRect();
		const topElement = document.elementFromPoint(nameRect.left + 4, nameRect.top + nameRect.height / 2);
		return topElement ? topElement.closest('[data-testid="rater-element-panel"]') !== null : false;
	});
	check('nothing covers the element name while the drawer is open', panelTopElement);
	await page.screenshot({ path: shotPath('D10-2-drawer-search-1440x900') });

	// ---------------------------------------------------------------- D10.3 closing returns focus
	console.log('D10.3 Esc, ✕ and outside press close it and return focus');
	await page.keyboard.press('Escape');
	await page.waitForTimeout(200);
	check('Esc closes the drawer; focus returns to "Search all of CEDS"', !(await drawerIsShown()) && (await focusedTestId()) === 'rater-open-search', await focusedTestId());
	await page.click('[data-testid="rater-open-browse"]');
	await page.locator('[data-testid="rater-browse-concept"]').first().waitFor({ timeout: 20000 });
	await page.waitForTimeout(200);
	check('Browse CEDS opens the drawer on Browse (the concepts), focus on the Browse tab', (await drawerIsShown()) && (await page.getAttribute('[data-testid="rater-tab-browse"]', 'aria-selected')) === 'true' && (await focusedTestId()) === 'rater-tab-browse', await focusedTestId());
	await page.screenshot({ path: shotPath('D10-3-drawer-browse') });
	await page.click('[data-testid="rater-finder-close"]');
	await page.waitForTimeout(200);
	check('✕ closes the drawer; focus returns to "Browse CEDS"', !(await drawerIsShown()) && (await focusedTestId()) === 'rater-open-browse', await focusedTestId());
	await page.click('[data-testid="rater-open-search"]');
	await page.locator(DRAWER).waitFor({ state: 'visible', timeout: 5000 });
	await page.click('[data-testid="rater-element-name"]');
	await page.waitForTimeout(200);
	check('a press outside (on the element) closes the drawer; focus returns to "Search all of CEDS"', !(await drawerIsShown()) && (await focusedTestId()) === 'rater-open-search', await focusedTestId());

	// ---------------------------------------------------------------- D10.4 a card's class name
	console.log("D10.4 a card's class name opens Browse at that class");
	const classButton = page.locator('[data-testid="rater-candidate-row"] [data-testid="rater-card-class"]').first();
	const className = (await classButton.innerText()).trim();
	await classButton.hover();
	const tooltipText = await page.locator('.v-tooltip .v-overlay__content').first().innerText({ timeout: 5000 }).catch(() => '');
	check(`the class name's tooltip says "${tooltipText.trim()}"`, tooltipText.trim() === `Click to browse every property of ${className} in a panel beside the list.`, tooltipText);
	await classButton.click();
	await page.locator('.rt-class-banner').waitFor({ timeout: 20000 });
	const bannerText = (await page.locator('.rt-class-banner').innerText()).trim();
	check(`the drawer opens on Browse at ${className}`, (await drawerIsShown()) && (await page.getAttribute('[data-testid="rater-tab-browse"]', 'aria-selected')) === 'true' && bannerText.startsWith(`${className}:`) && (await page.locator('[data-testid="rater-browse-property"]').count()) > 0, bannerText.slice(0, 80));
	await page.screenshot({ path: shotPath('D10-4-class-browse') });
	await page.keyboard.press('Escape');
	await page.waitForTimeout(200);

	// ---------------------------------------------------------------- D10.5 adding a card
	console.log('D10.5 adding a card leaves the drawer open');
	await page.click('[data-testid="rater-open-search"]');
	// the rater's seed decides which cards are already listed: walk a few searches until one result can be added
	const addableResult = page.locator('[data-testid="rater-search-result"]', { has: page.locator('[data-testid="rater-add-card"]') }).first();
	for (const queryText of ['P001572', 'birth date', 'school year', 'grade level']) {
		await page.fill('[data-testid="rater-search-input"]', queryText);
		await page.click('[data-testid="rater-search-submit"]');
		await page.waitForFunction(() => document.querySelector('[data-testid="rater-search-results"], [data-testid="rater-finder-empty"], [data-testid="rater-finder-error"]') && !document.querySelector('[aria-label="Searching"]'), null, { timeout: 20000 });
		if ((await addableResult.count()) > 0) {
			break;
		}
	}
	if ((await addableResult.count()) === 0) {
		throw new Error('no search gave a card that is not already in the list');
	}
	const addedTupleId = await addableResult.getAttribute('data-ceds-tuple-id');
	await addableResult.locator('[data-testid="rater-add-card"]').click();
	await page.waitForTimeout(200);
	const addedStatusText = (await page.locator('[data-testid="rater-finder-added"]').innerText().catch(() => '')).trim();
	check(`the drawer says "${addedStatusText.slice(0, 60)}…" and stays open`, addedStatusText.startsWith('Added to your candidates') && (await drawerIsShown()), addedStatusText);
	check('…and that result now says "✓ In your list"', /In your list/.test(await page.locator(`[data-testid="rater-search-result"][data-ceds-tuple-id="${addedTupleId}"]`).innerText()));
	await page.screenshot({ path: shotPath('D10-5-added-drawer-open') });
	await page.click('[data-testid="rater-finder-close"]');
	await page.waitForTimeout(200);
	const topRow = page.locator('[data-testid="rater-candidate-row"]').first();
	check('the added card is at the top of the list, marked "Added by you"', (await topRow.getAttribute('data-ceds-tuple-id')) === addedTupleId && /Added by you/.test(await topRow.innerText()));

	// ---------------------------------------------------------------- D10.6 the foot of the list
	console.log('D10.6 the foot line opens Search');
	const footText = (await page.locator('.rt-cand-foot').innerText()).trim();
	check(`the foot of the list says "${footText}"`, footText === 'None of these fit? Search all of CEDS');
	await scrollListToBottom();
	await page.click('[data-testid="rater-open-search-foot"]');
	await page.waitForTimeout(300);
	check('…and opens the drawer on Search', (await drawerIsShown()) && (await page.getAttribute('[data-testid="rater-tab-search"]', 'aria-selected')) === 'true' && (await focusedTestId()) === 'rater-search-input', await focusedTestId());
	await page.keyboard.press('Escape');
	await page.waitForTimeout(200);
	check('…and Esc returns focus to the foot line', (await focusedTestId()) === 'rater-open-search-foot', await focusedTestId());

	// ---------------------------------------------------------------- D10.7 wording, narrow viewport
	console.log('D10.7 no AI wording; narrow viewport');
	await page.click('[data-testid="rater-open-search"]');
	const pageText = await page.evaluate(() => document.body.innerText);
	check('no "AI" wording anywhere on the page (drawer open)', !/\bAI\b/.test(pageText));
	await page.keyboard.press('Escape');
	await page.setViewportSize({ width: 900, height: 800 });
	await page.waitForTimeout(300);
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.click('[data-testid="rater-open-browse"]');
	await page.waitForTimeout(300);
	const narrowLayout = await readLayout();
	check(`at 900px wide the drawer takes the whole viewport (${Math.round(narrowLayout.drawer.left)}–${Math.round(narrowLayout.drawer.right)})`, narrowLayout.drawer.left === 0 && Math.abs(narrowLayout.drawer.right - narrowLayout.innerWidth) <= 1);
	await page.screenshot({ path: shotPath('D10-7-narrow-drawer') });
	await page.keyboard.press('Escape');
	await page.setViewportSize({ width: 1440, height: 900 });

	// ---------------------------------------------------------------- D10.8 the admin preview
	console.log('D10.8 the admin preview has the drawer, read-only');
	const adminPage = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
	const watchedRequestList = [];
	adminPage.on('request', (request) => {
		if (!request.url().includes('/api/')) {
			return;
		}
		const routeName = new URL(request.url()).pathname.replace(/^.*\/api\//, '');
		const adminAction = routeName === 'raterAdmin' ? (JSON.parse(request.postData() || '{}') || {}).adminAction || null : null;
		watchedRequestList.push({ routeName, adminAction });
	});
	await adminPage.goto(`${baseUrl}/login?redirect=${encodeURIComponent('/admin?tool=ceds-rater')}`);
	await adminPage.getByLabel('User Name').fill(argumentByName.adminUserName);
	await adminPage.getByLabel('Password', { exact: true }).fill(adminPassword);
	await adminPage.getByRole('button', { name: 'Login' }).click();
	await adminPage.waitForURL(/\/admin\/?\?tool=ceds-rater$/, { timeout: 20000 });
	await adminPage.click(`[data-testid="rater-surveys-preview-${surveyName}"]`);
	await adminPage.waitForFunction(() => document.querySelectorAll('[data-testid="rater-candidate-row"]').length > 0, null, { timeout: 20000 });
	const previewRequestStart = watchedRequestList.length;
	check('the preview has both buttons above the element, and no finder until summoned', (await adminPage.locator('[data-testid="rater-open-search"]').isVisible()) && (await adminPage.locator('[data-testid="rater-open-browse"]').isVisible()) && !(await adminPage.locator(DRAWER).isVisible()));
	await adminPage.click('[data-testid="rater-open-search"]');
	await adminPage.fill('[data-testid="rater-search-input"]', 'P001572');
	await adminPage.click('[data-testid="rater-search-submit"]');
	await adminPage.locator('[data-testid="rater-search-result"]').first().waitFor({ timeout: 20000 }).catch(() => null);
	check('search answers in the preview drawer', (await adminPage.locator('[data-testid="rater-search-result"]').count()) > 0);
	const previewAddable = adminPage.locator('[data-testid="rater-search-result"] [data-testid="rater-add-card"]').first();
	if ((await previewAddable.count()) > 0) {
		await previewAddable.click();
		check('adding a card in the preview keeps the drawer open', await adminPage.locator(DRAWER).isVisible());
	}
	await adminPage.screenshot({ path: shotPath('D10-8-preview-drawer') });
	await adminPage.keyboard.press('Escape');
	await adminPage.click('[data-testid="rater-open-browse"]');
	await adminPage.locator('[data-testid="rater-browse-concept"]').first().waitFor({ timeout: 20000 }).catch(() => null);
	check('Browse answers in the preview drawer', (await adminPage.locator('[data-testid="rater-browse-concept"]').count()) > 0);
	check('Save stays disabled in the preview', await adminPage.locator('[data-testid="rater-save"]').isDisabled());
	const PREVIEW_READ_LIST = ['previewItem', 'previewSearch', 'previewBrowse'];
	const previewCallList = watchedRequestList.slice(previewRequestStart).filter((watched) => watched.routeName !== 'pageActivity');
	const nonPreviewCallList = previewCallList.filter((watched) => !(watched.routeName === 'raterAdmin' && PREVIEW_READ_LIST.includes(watched.adminAction)));
	check(`no write call left the preview: ${previewCallList.length} calls, all preview reads`, previewCallList.some((watched) => watched.adminAction === 'previewSearch') && nonPreviewCallList.length === 0, JSON.stringify(nonPreviewCallList.slice(0, 5)));
} catch (walkError) {
	check('the drawer walkthrough ran to the end', false, `${walkError && walkError.message}`.split('\n')[0]);
	await page.screenshot({ path: shotPath('D10-9-failure') }).catch(() => {});
} finally {
	if (raterWasMade) {
		const removeResponse = await apiPost('raterAdmin', { adminAction: 'remove', raterUserName }, adminToken);
		console.log(`  (cleanup: ${raterUserName} removed, status ${removeResponse.statusCode})`);
	}
	await browser.close();
}

console.log(`\n=== raterFinderDrawer (revision 10 browser) — Results: ${passCount} passed, ${failCount} failed ===`);
process.exit(failCount === 0 ? 0 : 1);
