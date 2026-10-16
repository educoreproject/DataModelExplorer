// raterMappingSurveyTab.spec.mjs — revision 7 browser gates (WORKORDER-RATER7): the /admin tab is named Mapping Survey
// and its raters view carries a "Rating pages" strip. On a running site, with a main-site admin account:
//   B7.1 the toolbar button reads MAPPING SURVEY (and no button reads CEDS RATER); the URL key is still
//        ?tool=ceds-rater and the test id still admin-tool-ceds-rater; the raters view's heading says Mapping Survey
//   B7.2 the strip shows the rater sign-in URL for this site's origin; Copy puts exactly that URL on the clipboard
//   B7.3 each link opens in a new tab and lands where the devlog says: sign-in shows the rater sign-in form (what a
//        rater sees; the main login is memory-only, so the new tab is not logged in), instructions shows the page
//   B7.4 the old /rater/admin URL still goes through the main login into the tab, which reads MAPPING SURVEY
// It makes no raters and changes nothing in the rater store.
//
//   node html/tests/rater/raterMappingSurveyTab.spec.mjs --baseUrl=… --adminUserName=… --adminPasswordFile=<file holding it>
//        --playwrightCorePath=… --chromePath=… --evidenceDir=…

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'adminUserName', 'adminPasswordFile', 'playwrightCorePath', 'chromePath', 'evidenceDir'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`raterMappingSurveyTab: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const adminPassword = fs.readFileSync(argumentByName.adminPasswordFile, 'utf8').trim();
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
const siteOrigin = new URL(baseUrl).origin;
fs.mkdirSync(argumentByName.evidenceDir, { recursive: true });
const shotPath = (shotName) => path.join(argumentByName.evidenceDir, `${shotName}.png`);

const TAB_URL_PATTERN = /\/admin\/?\?tool=ceds-rater$/;
const TAB_BUTTON_SELECTOR = '[data-testid="admin-tool-ceds-rater"]';

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
// the button's source text, not its rendered text (Vuetify upper-cases every button label in CSS)
const buttonTextOf = async (page, selector) => (await page.locator(selector).textContent()).trim();
const toolbarButtonTextListOf = async (page) => (await page.locator('.v-toolbar .v-btn').allTextContents()).map((buttonText) => buttonText.trim());

// each rating page: its link's test id, its path, and what a signed-in admin sees when the new tab opens
const RATING_PAGE_EXPECTATION_LIST = [
	{ pageName: 'signIn', pagePath: '/rater', landedSelector: '[data-testid="rater-signin-name"]', landedText: 'the rater sign-in form' },
	{ pageName: 'instructions', pagePath: '/rater/instructions', landedSelector: '[data-testid="rater-instructions"]', landedText: 'the instructions page' },
];

const browser = await chromium.launch({ executablePath: argumentByName.chromePath, headless: true });

try {
	// ---------------------------------------------------------------- B7.1 the tab's name
	console.log('B7.1 the tab reads MAPPING SURVEY');
	const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	await adminContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: siteOrigin });
	const adminPage = await adminContext.newPage();
	await adminPage.goto(`${baseUrl}/login?redirect=${encodeURIComponent('/admin?tool=ceds-rater')}`);
	await mainLoginInBrowser(adminPage, argumentByName.adminUserName, adminPassword);
	await adminPage.waitForURL(TAB_URL_PATTERN, { timeout: 20000 });
	await adminPage.waitForSelector('[data-testid="rater-admin-table"]', { timeout: 20000 });
	check('/admin?tool=ceds-rater still opens the tab', (await adminPage.locator('[data-testid="rater-admin-panel"]').count()) === 1, adminPage.url());
	check('the tab button (test id unchanged) reads MAPPING SURVEY', (await buttonTextOf(adminPage, TAB_BUTTON_SELECTOR)) === 'MAPPING SURVEY', await buttonTextOf(adminPage, TAB_BUTTON_SELECTOR));
	const toolbarButtonTextList = await toolbarButtonTextListOf(adminPage);
	check('no toolbar button reads CEDS RATER', !toolbarButtonTextList.includes('CEDS RATER'), toolbarButtonTextList.join(' | '));
	const headingText = (await adminPage.locator('[data-testid="rater-admin-panel"] h1').first().textContent()).trim();
	check('the raters view heading says Mapping Survey', headingText.startsWith('Mapping Survey'), headingText);

	// ---------------------------------------------------------------- B7.2 the strip and its copy button
	console.log('B7.2 the Rating pages strip');
	check('the strip is in the raters view', (await adminPage.locator('[data-testid="rater-admin-panel"] [data-testid="rating-pages-strip"]').count()) === 1);
	const signInUrlText = (await adminPage.locator('[data-testid="rating-page-url-signIn"]').textContent()).trim();
	check(`the strip shows the sign-in URL for this origin (${siteOrigin}/rater)`, signInUrlText === `${siteOrigin}/rater`, signInUrlText);
	await adminPage.evaluate(() => navigator.clipboard.writeText('clipboard before copy'));
	await adminPage.click('[data-testid="rating-page-copy-signIn"]');
	await adminPage.waitForSelector('[data-testid="rating-page-copied"]', { timeout: 5000 });
	const clipboardText = await adminPage.evaluate(() => navigator.clipboard.readText());
	check('Copy puts exactly the sign-in URL on the clipboard', clipboardText === `${siteOrigin}/rater`, clipboardText);
	check('and says so', (await adminPage.locator('[data-testid="rating-page-copied"]').textContent()).trim() === 'Copied.');
	await adminPage.screenshot({ path: shotPath('70-mapping-survey-strip') });

	// ---------------------------------------------------------------- B7.3 each link
	console.log('B7.3 each link opens in a new tab and lands somewhere sensible');
	for (const expectation of RATING_PAGE_EXPECTATION_LIST) {
		const linkSelector = `[data-testid="rating-page-link-${expectation.pageName}"]`;
		const linkHref = await adminPage.getAttribute(linkSelector, 'href');
		const linkTarget = await adminPage.getAttribute(linkSelector, 'target');
		const linkRel = `${await adminPage.getAttribute(linkSelector, 'rel')}`;
		check(`the ${expectation.pageName} link points at ${expectation.pagePath} and opens a new tab`, linkHref === expectation.pagePath && linkTarget === '_blank' && linkRel.includes('noopener'), `${linkHref} ${linkTarget} ${linkRel}`);
		const [openedPage] = await Promise.all([adminContext.waitForEvent('page', { timeout: 10000 }), adminPage.click(linkSelector)]);
		await openedPage.waitForSelector(expectation.landedSelector, { timeout: 20000 }).catch(() => null);
		const landedUrl = new URL(openedPage.url());
		check(`it shows ${expectation.landedText} at ${expectation.pagePath}`, landedUrl.pathname.replace(/\/$/, '') === expectation.pagePath && (await openedPage.locator(expectation.landedSelector).count()) === 1, openedPage.url());
		await openedPage.screenshot({ path: shotPath(`71-mapping-survey-opened-${expectation.pageName}`) });
		await openedPage.close();
	}
	check('the admin page stays in the tab', TAB_URL_PATTERN.test(adminPage.url()), adminPage.url());

	// ---------------------------------------------------------------- B7.4 the old URL
	console.log('B7.4 the old /rater/admin URL still redirects');
	const redirectPage = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
	await redirectPage.goto(`${baseUrl}/rater/admin`);
	await redirectPage.waitForURL(/\/login/, { timeout: 20000 });
	await mainLoginInBrowser(redirectPage, argumentByName.adminUserName, adminPassword);
	await redirectPage.waitForURL(TAB_URL_PATTERN, { timeout: 20000 });
	await redirectPage.waitForSelector('[data-testid="rating-pages-strip"]', { timeout: 20000 });
	check('/rater/admin lands in the tab, which reads MAPPING SURVEY', (await buttonTextOf(redirectPage, TAB_BUTTON_SELECTOR)) === 'MAPPING SURVEY');
} catch (walkError) {
	check('the Mapping Survey walkthrough ran to the end', false, `${walkError && walkError.message}`);
} finally {
	await browser.close();
}

console.log(`\n=== raterMappingSurveyTab (revision 7 browser) — Results: ${passCount} passed, ${failCount} failed ===`);
process.exit(failCount === 0 ? 0 : 1);
