// raterSurveys.spec.mjs — revision 5 browser gates for the admin screen's Surveys section (WORKORDER-RATER5) on a running
// site whose rater store starts EMPTY (local dev). Through the admin API it makes six raters: three on A (one finishes
// all 50, one saves one answer, one saves nothing), two on B, one on C. Then, as the admin in a browser:
//   B5.1 the cards render with the frozen counts by standard, each rater's progress and "finished", and the coverage
//        colours A green, B amber, C red
//   B5.2 View items opens survey C's 50 targets (standard, owner/name, definition; no candidates), and closes
//   B5.3 the hint names C; its button opens C's Assign form pre-filled with the next free rater-NN; Assign a person
//        issues the sign-in name and password once (Copy button; gone after a reload; the password signs in); the new
//        rater is on C's card at 0 of 50; the hint moves to B (A 3, B 2, C 2: the tie goes to the earlier survey)
//   B5.4 the move picker shows raters with saved answers disabled, with the server's refusal text
//   B5.5 a rater sees no Surveys section and no admin link, is sent back to rating from /rater/admin and stays signed in
// Every rater it made is removed in the finally block, even when a step fails (a failed run must not leave raters
// that break the next one).
//
//   node html/tests/rater/raterSurveys.spec.mjs --baseUrl=… --adminUserName=… --adminPasswordFile=<file holding it>
//        --raterPrefix=rater-sv --playwrightCorePath=… --chromePath=… --evidenceDir=…

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'adminUserName', 'adminPasswordFile', 'raterPrefix', 'playwrightCorePath', 'chromePath', 'evidenceDir'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`raterSurveys: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
if (/^rater-\d+$/.test(`${argumentByName.raterPrefix}-1`)) {
	console.error('raterSurveys: --raterPrefix must not make rater-NN names (they would move the next free name)');
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const adminPassword = fs.readFileSync(argumentByName.adminPasswordFile, 'utf8').trim();
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
const FIXTURE_SURVEY_BY_RATER = Object.fromEntries([['1', 'A'], ['2', 'A'], ['3', 'A'], ['4', 'B'], ['5', 'B'], ['6', 'C']].map(([suffixText, surveyName]) => [`${argumentByName.raterPrefix}-${suffixText}`, surveyName]));
const [finishedRater, progressRater, idleRater] = Object.keys(FIXTURE_SURVEY_BY_RATER);
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
const signIn = async (userName, password) => {
	const response = await apiPost('login', { username: userName, password });
	return response.statusCode === 200 ? response.authtoken : null;
};
const signInInBrowser = async (page, userName, password) => {
	await page.goto(`${baseUrl}/rater`);
	await page.fill('[data-testid="rater-signin-name"]', userName);
	await page.fill('[data-testid="rater-signin-password"]', password);
	await page.click('[data-testid="rater-signin-submit"]');
};
const cardOf = (page, surveyName) => page.locator(`[data-testid="rater-surveys-card-${surveyName}"]`);
const coverageColourListOf = (page) => page.$$eval('[data-testid^="rater-surveys-card-"]', (cardList) => cardList.map((card) => `${card.getAttribute('data-testid').slice(-1)}:${card.getAttribute('data-coverage-colour')}`));
const hintSurveyOf = (page) => page.getAttribute('[data-testid="rater-surveys-hint"]', 'data-next-survey');

const browser = await chromium.launch({ executablePath: argumentByName.chromePath, headless: true });
const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await adminContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl });
const page = await adminContext.newPage();
const passwordByRater = {};
const madeRaterNameList = [];
let adminToken = null;

try {
	// ---------------------------------------------------------------- fixture through the API
	adminToken = await signIn(argumentByName.adminUserName, adminPassword);
	check('the admin signs in through the API', !!adminToken);
	const startRaterList = (await apiPost('raterAdmin', { adminAction: 'list' }, adminToken)).bodyJson[0].raterList;
	check('precondition: the rater store starts empty', startRaterList.length === 0, startRaterList.map((rater) => rater.raterUserName).join(', '));
	for (const raterUserName of Object.keys(FIXTURE_SURVEY_BY_RATER)) {
		const addResponse = await apiPost('raterAdmin', { adminAction: 'add', raterUserName, whoText: `Surveys test ${raterUserName}`, surveyName: FIXTURE_SURVEY_BY_RATER[raterUserName] }, adminToken);
		if (addResponse.statusCode === 200) {
			madeRaterNameList.push(raterUserName);
			passwordByRater[raterUserName] = addResponse.bodyJson[0].issuedPassword;
		}
	}
	check('six raters made: A 3, B 2, C 1', madeRaterNameList.length === 6);
	const finishedToken = await signIn(finishedRater, passwordByRater[finishedRater]);
	const progressToken = await signIn(progressRater, passwordByRater[progressRater]);
	const saveCodeList = [];
	for (let itemNumber = 1; itemNumber <= 50; itemNumber++) {
		const item = (await apiPost('raterItemGet', { itemNumber }, finishedToken)).bodyJson[0];
		saveCodeList.push((await apiPost('raterAnswerSave', { elementStableId: item.element.elementStableId, answerKind: 'noMatch' }, finishedToken)).statusCode);
	}
	const finishCode = (await apiPost('raterFinish', {}, finishedToken)).statusCode;
	const progressItem = (await apiPost('raterItemGet', { itemNumber: 1 }, progressToken)).bodyJson[0];
	saveCodeList.push((await apiPost('raterAnswerSave', { elementStableId: progressItem.element.elementStableId, answerKind: 'unsure', note: 'surveys test' }, progressToken)).statusCode);
	check(`${finishedRater} answered 50 and finished; ${progressRater} answered 1`, saveCodeList.length === 51 && saveCodeList.every((statusCode) => statusCode === 200) && finishCode === 200, JSON.stringify(saveCodeList.filter((statusCode) => statusCode !== 200)));
	const apiSummary = (await apiPost('raterAdmin', { adminAction: 'surveys' }, adminToken)).bodyJson[0];

	// ---------------------------------------------------------------- B5.1 the cards
	console.log('B5.1 the cards');
	await signInInBrowser(page, argumentByName.adminUserName, adminPassword);
	await page.waitForURL(/\/rater\/admin\/?$/, { timeout: 20000 });
	await page.waitForSelector('[data-testid="rater-surveys-card-C"]', { timeout: 20000 });
	await page.waitForSelector(`[data-testid="rater-surveys-rater-${idleRater}"]`, { timeout: 20000 });
	for (const survey of apiSummary.surveyList) {
		const splitText = await page.locator(`[data-testid="rater-surveys-split-${survey.surveyName}"]`).innerText();
		const expectedSplitText = `50 items: ${survey.itemCountByStandardList.map((entry) => `${entry.standard} ${entry.itemCount}`).join(' · ')}`;
		check(`survey ${survey.surveyName}: "${splitText}"`, splitText === expectedSplitText && survey.itemCountByStandardList.reduce((soFar, entry) => soFar + entry.itemCount, 0) === 50, expectedSplitText);
	}
	check('coverage colours: A green (3), B amber (2), C red (1)', JSON.stringify(await coverageColourListOf(page)) === '["A:green","B:amber","C:red"]', JSON.stringify(await coverageColourListOf(page)));
	const coverageTextA = await page.locator('[data-testid="rater-surveys-coverage-A"]').innerText();
	check('the coverage marker reads "3 raters · preferred met" on A', /3 raters · preferred met/.test(coverageTextA), coverageTextA);
	const rowTextOf = async (raterUserName) => page.locator(`[data-testid="rater-surveys-rater-${raterUserName}"]`).innerText();
	const finishedRowText = await rowTextOf(finishedRater);
	const progressRowText = await rowTextOf(progressRater);
	const idleRowText = await rowTextOf(idleRater);
	check('A lists its raters with who-text: 50 of 50 finished, 1 of 50, 0 of 50', /50 of 50/.test(finishedRowText) && /finished/.test(finishedRowText) && finishedRowText.includes(`Surveys test ${finishedRater}`) && /1 of 50/.test(progressRowText) && !/finished/.test(progressRowText) && /0 of 50/.test(idleRowText), [finishedRowText, progressRowText, idleRowText].join(' | '));
	check('each rater is on its own survey\'s card', (await cardOf(page, 'B').locator('[data-testid^="rater-surveys-rater-"]').count()) === 2 && (await cardOf(page, 'C').locator('[data-testid^="rater-surveys-rater-"]').count()) === 1);
	await page.screenshot({ path: shotPath('70-surveys-cards'), fullPage: true });

	// ---------------------------------------------------------------- B5.2 View items
	console.log('B5.2 View items');
	const apiItemList = (await apiPost('raterAdmin', { adminAction: 'surveyItems', surveyName: 'C' }, adminToken)).bodyJson[0].itemList;
	await page.click('[data-testid="rater-surveys-view-C"]');
	await page.waitForSelector('[data-testid="rater-surveys-items"]', { timeout: 20000 });
	const itemTextList = await page.locator('[data-testid="rater-surveys-item"]').allInnerTexts();
	const firstItem = apiItemList[0];
	check(`View items opens survey C's ${itemTextList.length} targets in order, with standard, owner/name and definition`, itemTextList.length === 50 && itemTextList[0].includes(firstItem.standard) && itemTextList[0].includes(firstItem.ownerName ? `${firstItem.ownerName}/${firstItem.name}` : firstItem.name) && itemTextList[0].includes(firstItem.definition || firstItem.definitionAbsentReason || 'No definition'), itemTextList[0]);
	const dialogText = await page.locator('[data-testid="rater-surveys-items"]').innerText();
	check('the items dialog shows no candidates or CEDS cards', !/→|Best|No match in CEDS|cedsTupleId/.test(dialogText));
	await page.screenshot({ path: shotPath('71-surveys-items') });
	await page.click('[data-testid="rater-surveys-items-close"]');
	check('Close hides the items', (await page.locator('[data-testid="rater-surveys-items"]').count()) === 0);

	// ---------------------------------------------------------------- B5.3 the hint and Assign a person
	console.log('B5.3 the hint and Assign a person');
	check('the hint names survey C (fewest raters)', (await hintSurveyOf(page)) === 'C', await hintSurveyOf(page));
	await page.click('[data-testid="rater-surveys-hint-assign"]');
	await page.waitForSelector('[data-testid="rater-surveys-assign-form-C"]', { timeout: 10000 });
	const prefilledName = await page.inputValue('[data-testid="rater-surveys-assign-name"]');
	check('the hint opens C\'s Assign form with the next free name (rater-01)', prefilledName === 'rater-01' && prefilledName === apiSummary.nextRaterUserName, prefilledName);
	check('the Add button waits for "who they are"', await page.isDisabled('[data-testid="rater-surveys-assign-submit"]'));

	// B5.4 the move picker (on C's open form)
	console.log('B5.4 the move picker');
	const disabledOf = (raterUserName) => page.$eval(`[data-testid="rater-surveys-move-option-${raterUserName}"]`, (option) => ({ isDisabled: option.disabled, optionText: option.textContent }));
	const finishedOption = await disabledOf(finishedRater);
	const progressOption = await disabledOf(progressRater);
	const idleOption = await disabledOf(idleRater);
	check('raters with saved answers are shown disabled, with the server\'s refusal text; a rater without answers can be picked', finishedOption.isDisabled && /has 50 saved answers on survey A/.test(finishedOption.optionText) && progressOption.isDisabled && /has 1 saved answers/.test(progressOption.optionText) && !idleOption.isDisabled, JSON.stringify([finishedOption, progressOption, idleOption]));
	check('C\'s own rater is not offered as a move', (await page.locator(`[data-testid="rater-surveys-move-option-${argumentByName.raterPrefix}-6"]`).count()) === 0);
	await page.screenshot({ path: shotPath('72-surveys-assign-form') });

	await page.fill('[data-testid="rater-surveys-assign-who"]', 'Assigned through the Surveys section');
	madeRaterNameList.push('rater-01');
	await page.click('[data-testid="rater-surveys-assign-submit"]');
	await page.waitForSelector('[data-testid="rater-admin-issued"]', { timeout: 20000 });
	const issuedText = await page.locator('[data-testid="rater-admin-issued"]').innerText();
	const issuedPassword = await page.locator('[data-testid="rater-admin-issued-password"]').innerText();
	check('the sign-in name and password are shown, for survey C', issuedText.includes('rater-01') && /survey C/.test(issuedText) && /^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/.test(issuedPassword), issuedText);
	await page.click('[data-testid="rater-admin-issued-copy"]');
	await page.waitForSelector('[data-testid="rater-admin-issued-copied"]', { timeout: 5000 });
	const clipboardText = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
	check('Copy puts the name and password on the clipboard', clipboardText.includes('rater-01') && clipboardText.includes(issuedPassword), clipboardText);
	await page.waitForSelector('[data-testid="rater-surveys-rater-rater-01"]', { timeout: 20000 });
	const newRowText = await rowTextOf('rater-01');
	check('the new rater appears on C\'s card at 0 of 50', (await cardOf(page, 'C').locator('[data-testid="rater-surveys-rater-rater-01"]').count()) === 1 && /0 of 50/.test(newRowText) && newRowText.includes('Assigned through the Surveys section'), newRowText);
	check('the new rater is in the raters table too', (await page.locator('[data-testid="rater-admin-row-rater-01"]').count()) === 1);
	check('the hint moves to B (A 3, B 2, C 2; the tie goes to the earlier survey)', (await hintSurveyOf(page)) === 'B' && JSON.stringify(await coverageColourListOf(page)) === '["A:green","B:amber","C:amber"]', `${await hintSurveyOf(page)} ${JSON.stringify(await coverageColourListOf(page))}`);
	await page.screenshot({ path: shotPath('73-surveys-assigned'), fullPage: true });
	check('the issued password signs in', !!(await signIn('rater-01', issuedPassword)));
	await page.reload();
	await page.waitForSelector('[data-testid="rater-surveys-card-C"]', { timeout: 20000 });
	check('after a reload the password is not shown again', (await page.locator('[data-testid="rater-admin-issued"]').count()) === 0 && !(await page.content()).includes(issuedPassword));

	// ---------------------------------------------------------------- B5.5 raters have no way in
	console.log('B5.5 raters have no way in');
	const raterContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const raterPage = await raterContext.newPage();
	await signInInBrowser(raterPage, idleRater, passwordByRater[idleRater]);
	await raterPage.waitForURL(/\/rater\/(rate|done)/, { timeout: 20000 });
	await raterPage.waitForTimeout(1500);
	check('the rating page has no Surveys section and no admin link', (await raterPage.locator('[data-testid="rater-surveys"]').count()) === 0 && (await raterPage.locator('a[href*="/admin"]').count()) === 0);
	await raterPage.goto(`${baseUrl}/rater/admin`);
	await raterPage.waitForURL(/\/rater\/rate/, { timeout: 20000 });
	await raterPage.waitForTimeout(1500);
	check('a rater sent to /rater/admin is sent back to rating, sees no Surveys section, and is still signed in', (await raterPage.locator('[data-testid="rater-surveys"]').count()) === 0 && /\/rater\/rate/.test(raterPage.url()) && (await raterPage.locator('[data-testid="rater-signin-name"]').count()) === 0, raterPage.url());
	await raterContext.close();
} catch (walkError) {
	check('the surveys walkthrough ran to the end', false, `${walkError && walkError.message}`);
	await page.screenshot({ path: shotPath('79-surveys-failure') });
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

console.log(`\n=== raterSurveys (revision 5 browser) — Results: ${passCount} passed, ${failCount} failed ===`);
process.exit(failCount === 0 ? 0 : 1);
