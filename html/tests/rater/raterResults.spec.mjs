// raterResults.spec.mjs — revision 4 browser gates for the admin Results page (WORKORDER-RATER4) on a running site.
// It makes two raters on one survey through the admin API and saves answers so that one target is split (two Best
// answers) and one card is ticked Same, then, as the admin in a browser:
//   B4.1 the Results page renders from the admin screen's Results link, all targets listed, the split target first
//   B4.2 the standard filter and the survey filter each narrow the list to that standard / survey only
//   B4.3 the sort: Alphabetical orders by target label; Disagreement first puts the split target on top again
//   B4.4 the summary CSV downloads, with the header row and the split target's rows
//   B4.5 a rater sees no link to the Results page, and a rater sent to /rater/admin/results meets the main site's login,
//        never the results
// Revision 6: Results is a view of the CEDS Rater tab of /admin (/admin?tool=ceds-rater&view=results), opened by the
// Results button and left by Back to raters; an admin signing in at /rater lands in the tab.
// With --cleanup=yes it removes both raters afterwards.
//
//   node html/tests/rater/raterResults.spec.mjs --baseUrl=… --adminUserName=… --adminPasswordFile=<file holding it>
//        --surveyName=A --raterPrefix=rater-res --playwrightCorePath=… --chromePath=… --evidenceDir=… [--cleanup=yes]

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'adminUserName', 'adminPasswordFile', 'surveyName', 'raterPrefix', 'playwrightCorePath', 'chromePath', 'evidenceDir'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`raterResults: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const adminPassword = fs.readFileSync(argumentByName.adminPasswordFile, 'utf8').trim();
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
const surveyName = argumentByName.surveyName;
const raterNameList = [`${argumentByName.raterPrefix}-1`, `${argumentByName.raterPrefix}-2`];
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
const shownTargetIdList = (page) => page.$$eval('[data-testid="rater-results-target"]', (blockList) => blockList.map((block) => block.getAttribute('data-target-stable-id')));
const shownLabelList = (page) => page.$$eval('[data-testid="rater-results-target"] .rt-results-target-cell', (cellList) => cellList.map((cell) => cell.firstChild.textContent.trim()));

const browser = await chromium.launch({ executablePath: argumentByName.chromePath, headless: true });
const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await adminContext.newPage();
const passwordByRater = {};

try {
	// ---------------------------------------------------------------- answers to show
	const adminToken = await signIn(argumentByName.adminUserName, adminPassword);
	check('the admin signs in through the API', !!adminToken);
	for (const raterUserName of raterNameList) {
		const addResponse = await apiPost('raterAdmin', { adminAction: 'add', raterUserName, whoText: 'Results page browser test', surveyName }, adminToken);
		passwordByRater[raterUserName] = addResponse.bodyJson && addResponse.bodyJson[0].issuedPassword;
	}
	const tokenList = await Promise.all(raterNameList.map((raterUserName) => signIn(raterUserName, passwordByRater[raterUserName])));
	check(`two raters made on survey ${surveyName} and signed in`, tokenList.every(Boolean));
	const firstItem = (await apiPost('raterItemGet', { itemNumber: 1 }, tokenList[0])).bodyJson[0];
	const splitStableId = firstItem.element.elementStableId;
	const sortedCardList = firstItem.cardList.slice().sort((cardA, cardB) => (cardA.cedsTupleId < cardB.cedsTupleId ? -1 : 1));
	const saveCodeList = [
		(await apiPost('raterAnswerSave', { elementStableId: splitStableId, answerKind: 'cards', bestCedsTupleId: sortedCardList[0].cedsTupleId, sameCedsTupleIdList: [sortedCardList[2].cedsTupleId] }, tokenList[0])).statusCode,
		(await apiPost('raterAnswerSave', { elementStableId: splitStableId, answerKind: 'noMatch' }, tokenList[1])).statusCode,
	];
	check('two different answers saved on one target (a split)', saveCodeList.every((statusCode) => statusCode === 200), JSON.stringify(saveCodeList));

	// ---------------------------------------------------------------- B4.1 renders from the admin screen
	console.log('B4.1 the Results page renders');
	await signInInBrowser(page, argumentByName.adminUserName, adminPassword);
	await page.waitForURL(/\/admin\/?\?tool=ceds-rater$/, { timeout: 20000 });
	await page.click('[data-testid="rater-admin-results-link"]');
	await page.waitForURL(/\/admin\/?\?tool=ceds-rater&view=results$/, { timeout: 20000 });
	await page.waitForSelector('[data-testid="rater-results-target"]', { timeout: 20000 });
	const allTargetIdList = await shownTargetIdList(page);
	check(`all targets listed (${allTargetIdList.length})`, allTargetIdList.length === 150);
	check('the split target is first (disagreement first)', allTargetIdList[0] === splitStableId, allTargetIdList[0]);
	const firstBlockText = await page.locator('[data-testid="rater-results-target"]').first().innerText();
	check('its block shows 2 of 2, the chosen card, No match and a Same-only card (Best 0, Same 1)', /2 of 2/.test(firstBlockText) && /No match in CEDS/.test(firstBlockText) && firstBlockText.includes(sortedCardList[0].propertyName) && firstBlockText.includes(sortedCardList[2].propertyName), firstBlockText.slice(0, 300));
	check('no rater name on the page', !raterNameList.some((raterUserName) => firstBlockText.includes(raterUserName)) && !(await page.locator('[data-testid="rater-results-table"]').innerText()).includes(argumentByName.raterPrefix));
	await page.screenshot({ path: shotPath('50-results-default') });

	// ---------------------------------------------------------------- B4.2 filters
	console.log('B4.2 filters');
	const standardNameList = await page.$$eval('[data-testid="rater-results-standard"] option', (optionList) => optionList.map((option) => option.value).filter((optionValue) => optionValue !== 'all'));
	const pickedStandard = standardNameList[1];
	await page.selectOption('[data-testid="rater-results-standard"]', pickedStandard);
	const standardLabelList = await shownLabelList(page);
	check(`standard filter ${pickedStandard}: only its targets (${standardLabelList.length})`, standardLabelList.length > 0 && standardLabelList.length < 150 && standardLabelList.every((labelText) => labelText.startsWith(`${pickedStandard} ·`)), standardLabelList.slice(0, 3).join(' | '));
	await page.selectOption('[data-testid="rater-results-survey"]', 'B');
	const bothLabelList = await shownLabelList(page);
	check('standard + survey B: only that standard on survey B', bothLabelList.length > 0 && bothLabelList.every((labelText) => labelText.startsWith(`${pickedStandard} · B ·`)), bothLabelList.slice(0, 3).join(' | '));
	await page.screenshot({ path: shotPath('51-results-filtered') });
	await page.selectOption('[data-testid="rater-results-standard"]', 'all');
	await page.selectOption('[data-testid="rater-results-survey"]', surveyName);
	const surveyLabelList = await shownLabelList(page);
	check(`survey filter ${surveyName} alone: 50 targets, all on survey ${surveyName}`, surveyLabelList.length === 50 && surveyLabelList.every((labelText) => labelText.split(' · ')[1] === surveyName), `${surveyLabelList.length}`);
	await page.selectOption('[data-testid="rater-results-survey"]', 'all');

	// ---------------------------------------------------------------- B4.3 sort
	console.log('B4.3 sort');
	await page.selectOption('[data-testid="rater-results-sort"]', 'alphabetical');
	const alphabeticalLabelList = await shownLabelList(page);
	const expectedLabelList = alphabeticalLabelList.slice().sort((labelA, labelB) => labelA.localeCompare(labelB));
	check('Alphabetical orders the targets by label', JSON.stringify(alphabeticalLabelList) === JSON.stringify(expectedLabelList) && alphabeticalLabelList.length === 150);
	await page.selectOption('[data-testid="rater-results-sort"]', 'disagreement');
	check('Disagreement first puts the split target back on top', (await shownTargetIdList(page))[0] === splitStableId);

	// ---------------------------------------------------------------- B4.4 CSV download
	console.log('B4.4 summary CSV');
	const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('[data-testid="rater-results-download"]')]);
	const csvPath = path.join(argumentByName.evidenceDir, download.suggestedFilename());
	await download.saveAs(csvPath);
	const csvText = fs.readFileSync(csvPath, 'utf8');
	check('the summary CSV downloads with its header and the split target\'s rows', /^cedsRaterResults-.*\.csv$/.test(download.suggestedFilename()) && csvText.startsWith('standard,survey,targetStableId,targetName,answered,assigned,candidateTupleId,candidateTitle,added,best,same\n') && csvText.split('\n').filter((lineText) => lineText.includes(splitStableId)).length === 3, download.suggestedFilename());
	check('no rater name in the CSV', !csvText.includes(argumentByName.raterPrefix));
	fs.rmSync(csvPath);

	// ---------------------------------------------------------------- B4.5 raters cannot reach it
	console.log('B4.5 raters have no way in');
	const raterContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const raterPage = await raterContext.newPage();
	await signInInBrowser(raterPage, raterNameList[1], passwordByRater[raterNameList[1]]);
	await raterPage.waitForURL(/\/rater\/(rate|done)/, { timeout: 20000 });
	await raterPage.waitForTimeout(1500);
	const raterLinkCount = await raterPage.locator('a[href*="/admin"]').count();
	check('the rating page has no link to admin or results', raterLinkCount === 0, `${raterLinkCount}`);
	await raterPage.goto(`${baseUrl}/rater/admin/results`);
	await raterPage.waitForURL(/\/login/, { timeout: 20000 });
	await raterPage.waitForTimeout(1500);
	check('a rater sent to /rater/admin/results meets the main site\'s login, with no results table', (await raterPage.locator('[data-testid="rater-results-table"]').count()) === 0, raterPage.url());
	const raterApiResponse = await apiPost('raterAdmin', { adminAction: 'results', resultsFormat: 'json' }, tokenList[1]);
	check('a rater token asking the results API is refused', raterApiResponse.statusCode === 401, `${raterApiResponse.statusCode}`);
	await raterContext.close();

	if (argumentByName.cleanup === 'yes') {
		for (const raterUserName of raterNameList) {
			await apiPost('raterAdmin', { adminAction: 'remove', raterUserName }, adminToken);
		}
		const listAfter = (await apiPost('raterAdmin', { adminAction: 'list' }, adminToken)).bodyJson[0].raterList.map((rater) => rater.raterUserName);
		check('cleanup: both test raters removed', !raterNameList.some((raterUserName) => listAfter.includes(raterUserName)), listAfter.join(', '));
	}
} catch (walkError) {
	check('the results walkthrough ran to the end', false, `${walkError && walkError.message}`);
	await page.screenshot({ path: shotPath('59-results-failure') });
} finally {
	await browser.close();
}

console.log(`\n=== raterResults (revision 4 browser) — Results: ${passCount} passed, ${failCount} failed ===`);
process.exit(failCount === 0 ? 0 : 1);
