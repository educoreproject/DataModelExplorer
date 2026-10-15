// raterAdminTab.spec.mjs — revision 6 browser gates (WORKORDER-RATER6): the rater admin lives in the main /admin page as
// the CEDS Rater tab, signed in with the main site's login. On a running site whose rater store holds no rater-NN names:
//   B6.1 an admin logs in on the main site, opens /admin and chooses CEDS Rater: the Surveys cards, the raters table and
//        the downloads render (JSON downloads); Assign a person works; Results opens from the button and Back returns
//   B6.2 /rater/admin and /rater/admin/results redirect into the tab (through the main login when not logged in), the
//        second one to the Results view
//   B6.3 an admin signing in at /rater lands in the tab, already logged in on the main site (no second sign-in)
//   B6.4 a rater: rating works and shows no admin link; logged in on the main site, /admin shows no CEDS Rater tab, and
//        /admin?tool=ceds-rater refuses with a notice and makes no /api/raterAdmin call
//   B6.5 an unknown ?tool= and an unknown CEDS Rater view are refused by name, not quietly replaced
// The main login lives in memory only (loginStore), so each context logs in once and moves by clicking; page.goto is
// used only before a login (it lands on /login with the redirect). Every rater it made is removed in the finally block.
//
//   node html/tests/rater/raterAdminTab.spec.mjs --baseUrl=… --adminUserName=… --adminPasswordFile=<file holding it>
//        --raterPrefix=rater-tab --playwrightCorePath=… --chromePath=… --evidenceDir=…

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'adminUserName', 'adminPasswordFile', 'raterPrefix', 'playwrightCorePath', 'chromePath', 'evidenceDir'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`raterAdminTab: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
if (/^rater-\d+$/.test(`${argumentByName.raterPrefix}-1`)) {
	console.error('raterAdminTab: --raterPrefix must not make rater-NN names (they would move the next free name)');
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const adminPassword = fs.readFileSync(argumentByName.adminPasswordFile, 'utf8').trim();
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
const fixtureRaterUserName = `${argumentByName.raterPrefix}-1`;
fs.mkdirSync(argumentByName.evidenceDir, { recursive: true });
const shotPath = (shotName) => path.join(argumentByName.evidenceDir, `${shotName}.png`);

const TAB_URL_PATTERN = /\/admin\/?\?tool=ceds-rater$/;
const RESULTS_URL_PATTERN = /\/admin\/?\?tool=ceds-rater&view=results$/;

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
const signIn = async (userName, password) => {
	const response = await apiPost('login', { username: userName, password });
	return response.statusCode === 200 ? response.authtoken : null;
};
// the main site's /login form (no test ids there; its labels are stable)
const mainLoginInBrowser = async (page, userName, password) => {
	await page.getByLabel('User Name').fill(userName);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Login' }).click();
};
const openWithMainLogin = async (page, targetPath, userName, password) => {
	await page.goto(`${baseUrl}/login?redirect=${encodeURIComponent(targetPath)}`);
	await mainLoginInBrowser(page, userName, password);
};
const raterSignInInBrowser = async (page, userName, password) => {
	await page.goto(`${baseUrl}/rater`);
	await page.fill('[data-testid="rater-signin-name"]', userName);
	await page.fill('[data-testid="rater-signin-password"]', password);
	await page.click('[data-testid="rater-signin-submit"]');
};
// every /api/raterAdmin call a page makes, so a refusal can be shown to make none
const raterAdminCallListOf = (page) => {
	const callList = [];
	page.on('request', (request) => request.url().includes('/api/raterAdmin') && callList.push(request.url()));
	return callList;
};

const browser = await chromium.launch({ executablePath: argumentByName.chromePath, headless: true });
const madeRaterNameList = [];
let adminToken = null;

try {
	adminToken = await signIn(argumentByName.adminUserName, adminPassword);
	check('the admin signs in through the API', !!adminToken);
	const listBefore = (await apiPost('raterAdmin', { adminAction: 'list' }, adminToken)).bodyJson[0].raterList.map((rater) => rater.raterUserName);
	check('precondition: no rater-NN names and no raters with this prefix', !listBefore.some((raterUserName) => /^rater-\d+$/.test(raterUserName) || raterUserName.startsWith(argumentByName.raterPrefix)), listBefore.join(', '));
	const fixtureAnswer = (await apiPost('raterAdmin', { adminAction: 'add', raterUserName: fixtureRaterUserName, whoText: 'Admin tab test rater', surveyName: 'A' }, adminToken)).bodyJson[0];
	madeRaterNameList.push(fixtureRaterUserName);
	check('a fixture rater is made on A', !!fixtureAnswer.issuedPassword, JSON.stringify(fixtureAnswer).slice(0, 120));

	// ---------------------------------------------------------------- B6.1 the tab in /admin
	console.log('B6.1 the CEDS Rater tab in /admin');
	const adminPage = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
	await openWithMainLogin(adminPage, '/admin', argumentByName.adminUserName, adminPassword);
	await adminPage.waitForURL(/\/admin\/?$/, { timeout: 20000 });
	await adminPage.waitForSelector('[data-testid="admin-tool-ceds-rater"]', { timeout: 20000 });
	check('the admin toolbar has a CEDS Rater tab', (await adminPage.locator('[data-testid="admin-tool-ceds-rater"]').count()) === 1);
	await adminPage.click('[data-testid="admin-tool-ceds-rater"]');
	await adminPage.waitForURL(TAB_URL_PATTERN, { timeout: 20000 });
	await adminPage.waitForSelector('[data-testid="rater-surveys-card-C"]', { timeout: 20000 });
	await adminPage.waitForSelector(`[data-testid="rater-admin-row-${fixtureRaterUserName}"]`, { timeout: 20000 });
	check('choosing it puts ?tool=ceds-rater in the URL', TAB_URL_PATTERN.test(adminPage.url()), adminPage.url());
	check('the gold line shows the CEDS copy in use', /GOLD_/.test(await adminPage.locator('[data-testid="rater-admin-gold"]').innerText()));
	check('the Surveys cards render (A, B, C)', (await adminPage.locator('[data-testid^="rater-surveys-card-"]').count()) === 3);
	check('the raters table renders with the fixture rater', (await adminPage.locator(`[data-testid="rater-admin-row-${fixtureRaterUserName}"]`).count()) === 1);
	check('the downloads render', (await adminPage.locator('[data-testid="rater-admin-download-json"]').count()) === 1 && (await adminPage.locator('[data-testid="rater-admin-download-csv"]').count()) === 1);
	const [jsonDownload] = await Promise.all([adminPage.waitForEvent('download', { timeout: 20000 }), adminPage.click('[data-testid="rater-admin-download-json"]')]);
	check('Download JSON downloads the answers file, signed with the main login', /^cedsRaterAnswers-.*\.json$/.test(jsonDownload.suggestedFilename()), jsonDownload.suggestedFilename());
	await adminPage.screenshot({ path: shotPath('90-admin-tab'), fullPage: true });

	// Assign a person on the hinted survey
	const hintSurveyName = await adminPage.getAttribute('[data-testid="rater-surveys-hint"]', 'data-next-survey');
	await adminPage.click('[data-testid="rater-surveys-hint-assign"]');
	await adminPage.waitForSelector(`[data-testid="rater-surveys-assign-form-${hintSurveyName}"]`, { timeout: 10000 });
	const assignedName = await adminPage.inputValue('[data-testid="rater-surveys-assign-name"]');
	await adminPage.fill('[data-testid="rater-surveys-assign-who"]', 'Assigned in the /admin tab');
	madeRaterNameList.push(assignedName);
	await adminPage.click('[data-testid="rater-surveys-assign-submit"]');
	await adminPage.waitForSelector('[data-testid="rater-admin-issued"]', { timeout: 20000 });
	await adminPage.waitForSelector(`[data-testid="rater-surveys-rater-${assignedName}"]`, { timeout: 20000 });
	const issuedText = await adminPage.locator('[data-testid="rater-admin-issued"]').innerText();
	const issuedPassword = (await adminPage.locator('[data-testid="rater-admin-issued-password"]').innerText()).trim();
	check(`Assign a person issues ${assignedName} on survey ${hintSurveyName} and shows the password once`, issuedText.includes(assignedName) && issuedText.includes(`survey ${hintSurveyName}`) && issuedPassword.length >= 16, issuedText);
	check('the assigned rater is on its card and in the raters table', (await adminPage.locator(`[data-testid="rater-surveys-card-${hintSurveyName}"] [data-testid="rater-surveys-rater-${assignedName}"]`).count()) === 1 && (await adminPage.locator(`[data-testid="rater-admin-row-${assignedName}"]`).count()) === 1);
	check('the issued password signs in', !!(await signIn(assignedName, issuedPassword)));

	// Results is a button inside the tab, with a way back
	await adminPage.click('[data-testid="rater-admin-results-link"]');
	await adminPage.waitForURL(RESULTS_URL_PATTERN, { timeout: 20000 });
	await adminPage.waitForSelector('[data-testid="rater-results-target"]', { timeout: 30000 });
	check('Results opens inside the tab (view=results), the table listing 150 targets', (await adminPage.locator('[data-testid="rater-results-target"]').count()) === 150 && (await adminPage.locator('[data-testid="ceds-rater-tool"] [data-testid="rater-results-panel"]').count()) === 1);
	check('the CEDS Rater tab stays selected while Results shows', await adminPage.isDisabled('[data-testid="admin-tool-ceds-rater"]'));
	await adminPage.screenshot({ path: shotPath('91-admin-tab-results') });
	await adminPage.click('[data-testid="rater-results-back"]');
	await adminPage.waitForURL(TAB_URL_PATTERN, { timeout: 20000 });
	await adminPage.waitForSelector(`[data-testid="rater-admin-row-${assignedName}"]`, { timeout: 20000 });
	check('Back to raters returns to the raters view', (await adminPage.locator('[data-testid="rater-results-panel"]').count()) === 0 && (await adminPage.locator('[data-testid="rater-admin-table"]').count()) === 1);
	await adminPage.goBack();
	await adminPage.waitForURL(RESULTS_URL_PATTERN, { timeout: 20000 });
	await adminPage.waitForSelector('[data-testid="rater-results-panel"]', { timeout: 20000 });
	check('the browser Back button returns to Results (the view is in the URL)', (await adminPage.locator('[data-testid="rater-results-panel"]').count()) === 1);

	// ---------------------------------------------------------------- B6.5 unknown names refused (same page, by clicking a link the app follows)
	console.log('B6.5 unknown tool and view');
	await adminPage.evaluate(() => window.history.pushState({}, '', '/admin?tool=no-such-tool'));
	await adminPage.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
	await adminPage.waitForSelector('[data-testid="admin-tool-unknown"]', { timeout: 10000 });
	check('an unknown ?tool= is refused by name', (await adminPage.locator('[data-testid="admin-tool-unknown"]').innerText()).includes("'no-such-tool'"));
	await adminPage.evaluate(() => window.history.pushState({}, '', '/admin?tool=ceds-rater&view=no-such-view'));
	await adminPage.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
	await adminPage.waitForSelector('[data-testid="ceds-rater-view-unknown"]', { timeout: 10000 });
	check('an unknown CEDS Rater view is refused by name', (await adminPage.locator('[data-testid="ceds-rater-view-unknown"]').innerText()).includes("'no-such-view'"));

	// ---------------------------------------------------------------- B6.2 the old URLs redirect
	console.log('B6.2 the old URLs redirect into the tab');
	const redirectPage = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
	await redirectPage.goto(`${baseUrl}/rater/admin`);
	await redirectPage.waitForURL(/\/login/, { timeout: 20000 });
	check('/rater/admin, not logged in, goes through the main login with the tab as its redirect', decodeURIComponent(redirectPage.url()).includes('redirect=/admin?tool=ceds-rater'), redirectPage.url());
	await mainLoginInBrowser(redirectPage, argumentByName.adminUserName, adminPassword);
	await redirectPage.waitForURL(TAB_URL_PATTERN, { timeout: 20000 });
	await redirectPage.waitForSelector('[data-testid="rater-admin-table"]', { timeout: 20000 });
	check('and lands in the CEDS Rater tab', (await redirectPage.locator('[data-testid="rater-admin-panel"]').count()) === 1);
	const resultsRedirectPage = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
	await resultsRedirectPage.goto(`${baseUrl}/rater/admin/results`);
	await resultsRedirectPage.waitForURL(/\/login/, { timeout: 20000 });
	await mainLoginInBrowser(resultsRedirectPage, argumentByName.adminUserName, adminPassword);
	await resultsRedirectPage.waitForURL(RESULTS_URL_PATTERN, { timeout: 20000 });
	await resultsRedirectPage.waitForSelector('[data-testid="rater-results-panel"]', { timeout: 20000 });
	check('/rater/admin/results lands in the tab\'s Results view', (await resultsRedirectPage.locator('[data-testid="rater-results-panel"]').count()) === 1);

	// ---------------------------------------------------------------- B6.3 an admin signing in at /rater
	console.log('B6.3 an admin signing in at /rater');
	const raterSignInAdminPage = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
	await raterSignInAdminPage.goto(`${baseUrl}/rater`);
	await raterSignInAdminPage.fill('[data-testid="rater-signin-name"]', argumentByName.adminUserName);
	await raterSignInAdminPage.fill('[data-testid="rater-signin-password"]', adminPassword);
	await raterSignInAdminPage.click('[data-testid="rater-signin-submit"]');
	await raterSignInAdminPage.waitForURL(TAB_URL_PATTERN, { timeout: 20000 });
	await raterSignInAdminPage.waitForSelector('[data-testid="rater-admin-table"]', { timeout: 20000 });
	check('lands in the CEDS Rater tab, logged in on the main site (no /login on the way)', (await raterSignInAdminPage.locator('[data-testid="rater-admin-panel"]').count()) === 1 && (await raterSignInAdminPage.locator('[data-testid="admin-tool-ceds-rater"]').count()) === 1, raterSignInAdminPage.url());
	const keptRaterSession = await raterSignInAdminPage.evaluate(() => window.sessionStorage.getItem('cedsRaterSession'));
	check('no rater session is kept for the admin', keptRaterSession === null, `${keptRaterSession}`.slice(0, 60));

	// ---------------------------------------------------------------- B6.4 raters
	console.log('B6.4 raters never see it');
	const raterContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const raterPage = await raterContext.newPage();
	await raterSignInInBrowser(raterPage, fixtureRaterUserName, fixtureAnswer.issuedPassword);
	await raterPage.waitForURL(/\/rater\/(rate|done)/, { timeout: 20000 });
	await raterPage.waitForSelector('[data-testid="rater-sign-out"]', { timeout: 20000 });
	check('the rater stays on the rating flow, with no admin link', /\/rater\/rate/.test(raterPage.url()) && (await raterPage.locator('a[href*="/admin"]').count()) === 0, raterPage.url());
	const raterMainPage = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
	const raterAdminCallList = raterAdminCallListOf(raterMainPage);
	await openWithMainLogin(raterMainPage, '/admin', fixtureRaterUserName, fixtureAnswer.issuedPassword);
	await raterMainPage.waitForURL(/\/admin\/?$/, { timeout: 20000 });
	await raterMainPage.waitForTimeout(1500);
	check('a rater logged in on the main site sees no CEDS Rater tab in /admin', (await raterMainPage.locator('[data-testid="admin-tool-ceds-rater"]').count()) === 0);
	const raterTabPage = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
	const raterTabCallList = raterAdminCallListOf(raterTabPage);
	await openWithMainLogin(raterTabPage, '/admin?tool=ceds-rater', fixtureRaterUserName, fixtureAnswer.issuedPassword);
	await raterTabPage.waitForURL(TAB_URL_PATTERN, { timeout: 20000 });
	await raterTabPage.waitForSelector('[data-testid="ceds-rater-not-admin"]', { timeout: 20000 });
	await raterTabPage.waitForTimeout(1500);
	check('/admin?tool=ceds-rater refuses a rater with a notice and no rater data', (await raterTabPage.locator('[data-testid="rater-admin-panel"]').count()) === 0 && (await raterTabPage.locator('[data-testid="rater-surveys"]').count()) === 0);
	check('and makes no /api/raterAdmin call', raterAdminCallList.length === 0 && raterTabCallList.length === 0, JSON.stringify([...raterAdminCallList, ...raterTabCallList]));
	await raterTabPage.screenshot({ path: shotPath('92-admin-tab-rater-refused') });
	const raterTokenCall = await apiPost('raterAdmin', { adminAction: 'list' }, await signIn(fixtureRaterUserName, fixtureAnswer.issuedPassword));
	check('a rater token asking /api/raterAdmin is refused', raterTokenCall.statusCode === 401, `${raterTokenCall.statusCode}`);
} catch (walkError) {
	check('the admin tab walkthrough ran to the end', false, `${walkError && walkError.message}`);
} finally {
	if (adminToken) {
		for (const raterUserName of madeRaterNameList) {
			await apiPost('raterAdmin', { adminAction: 'remove', raterUserName }, adminToken);
		}
		const listAfter = (await apiPost('raterAdmin', { adminAction: 'list' }, adminToken)).bodyJson[0].raterList.map((rater) => rater.raterUserName);
		check(`cleanup: the ${madeRaterNameList.length} raters this run made are removed`, !madeRaterNameList.some((raterUserName) => listAfter.includes(raterUserName)), listAfter.join(', '));
	}
	await browser.close();
}

console.log(`\n=== raterAdminTab (revision 6 browser) — Results: ${passCount} passed, ${failCount} failed ===`);
process.exit(failCount === 0 ? 0 : 1);
