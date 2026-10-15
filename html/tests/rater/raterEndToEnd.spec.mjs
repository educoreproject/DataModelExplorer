// raterEndToEnd.spec.mjs — Phase 5 gates for the CEDS Rater (lane RATER, 2026-10-14) on a running site (local dev, or
// demo for T6.2): the admin screen makes two raters on one survey; rater 1 rates all 50 through the API and finishes;
// rater 2 rates 5; then the download and the admin table are read.
//   T5.1 the download holds 55 answers, each with history; rater 1 is finished (locked), rater 2 is not
//   T5.2 the admin table shows rater 1 at 50/50 locked and rater 2 at 5/50
//   (the Done page's Thank you for rater 1 is screenshotted on the way)
// With --cleanup it then removes both raters through the admin screen's own API and checks they are gone.
//
//   node html/tests/rater/raterEndToEnd.spec.mjs --baseUrl=… --adminUserName=… --adminPasswordFile=<file holding it>
//        --surveyName=A --raterPrefix=rater-e2e --playwrightCorePath=… --chromePath=… --evidenceDir=… [--cleanup=yes]

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'adminUserName', 'adminPasswordFile', 'surveyName', 'raterPrefix', 'playwrightCorePath', 'chromePath', 'evidenceDir'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`raterEndToEnd: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const adminPassword = fs.readFileSync(argumentByName.adminPasswordFile, 'utf8').trim();
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
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

const browser = await chromium.launch({ executablePath: argumentByName.chromePath, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

try {
	// ---------------------------------------------------------------- the admin screen makes two raters
	console.log('admin screen: two raters on one survey');
	await page.goto(`${baseUrl}/rater`);
	await page.fill('[data-testid="rater-signin-name"]', argumentByName.adminUserName);
	await page.fill('[data-testid="rater-signin-password"]', adminPassword);
	await page.click('[data-testid="rater-signin-submit"]');
	// revision 6: an admin signing in at /rater lands in the CEDS Rater tab of /admin, logged in on the main site
	await page.waitForURL(/\/admin\/?\?tool=ceds-rater$/, { timeout: 20000 });
	await page.locator('[data-testid="rater-admin-table"]').waitFor();
	const issuedPasswordByName = {};
	for (const raterUserName of raterNameList) {
		await page.fill('[data-testid="rater-admin-new-name"]', raterUserName);
		await page.fill('[data-testid="rater-admin-new-who"]', `End-to-end test rater (temporary, lane RATER)`);
		await page.check(`[data-testid="rater-admin-new-survey-${argumentByName.surveyName}"]`);
		await page.click('[data-testid="rater-admin-add"]');
		await page.locator(`[data-testid="rater-admin-row-${raterUserName}"]`).waitFor({ timeout: 20000 });
		issuedPasswordByName[raterUserName] = (await page.locator('[data-testid="rater-admin-issued-password"]').innerText()).trim();
		check(`the admin screen adds ${raterUserName} and shows an issued password once`, issuedPasswordByName[raterUserName].length >= 16);
	}
	await page.screenshot({ path: shotPath('20-admin-two-raters-added') });

	// ---------------------------------------------------------------- rater 1 rates all 50, rater 2 rates 5 (API)
	console.log('rating through the API');
	const tokenByName = {};
	for (const raterUserName of raterNameList) {
		tokenByName[raterUserName] = await signIn(raterUserName, issuedPasswordByName[raterUserName]);
		check(`${raterUserName} signs in with the issued password`, !!tokenByName[raterUserName]);
	}
	const answerKindCycleList = ['cards', 'noMatch', 'unsure'];
	const rateItems = async (raterUserName, itemCountToRate) => {
		let savedCount = 0;
		for (let itemNumber = 1; itemNumber <= itemCountToRate; itemNumber++) {
			const itemResponse = await apiPost('raterItemGet', { itemNumber }, tokenByName[raterUserName]);
			const item = itemResponse.bodyJson[0];
			const answerKind = answerKindCycleList[itemNumber % answerKindCycleList.length];
			const answerSubmission = {
				elementStableId: item.element.elementStableId,
				answerKind,
				bestCedsTupleId: answerKind === 'cards' ? item.cardList[0].cedsTupleId : null,
				sameCedsTupleIdList: answerKind === 'cards' && itemNumber % 2 === 0 ? [item.cardList[1].cedsTupleId] : [],
				note: answerKind === 'unsure' ? `End-to-end note for item ${itemNumber}: can't decide.` : '',
				searchesTyped: [],
				secondsOnItem: 30,
			};
			const saveResponse = await apiPost('raterAnswerSave', answerSubmission, tokenByName[raterUserName]);
			savedCount += saveResponse.statusCode === 200 ? 1 : 0;
		}
		return savedCount;
	};
	check('rater 1 saves all 50', (await rateItems(raterNameList[0], 50)) === 50);
	const finishResponse = await apiPost('raterFinish', {}, tokenByName[raterNameList[0]]);
	check('rater 1 finishes (Finish and send)', finishResponse.statusCode === 200 && !!finishResponse.bodyJson[0].finishedAt, finishResponse.bodyText.slice(0, 120));
	check('rater 2 saves 5', (await rateItems(raterNameList[1], 5)) === 5);

	// the rater's own Done page after finishing
	const raterPage = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
	await raterPage.goto(`${baseUrl}/rater`);
	await raterPage.fill('[data-testid="rater-signin-name"]', raterNameList[0]);
	await raterPage.fill('[data-testid="rater-signin-password"]', issuedPasswordByName[raterNameList[0]]);
	await raterPage.click('[data-testid="rater-signin-submit"]');
	await raterPage.locator('[data-testid="rater-thank-you"]').waitFor({ timeout: 20000 });
	await raterPage.screenshot({ path: shotPath('21-done-thank-you') });
	check('rater 1 signing in after Finish lands on Thank you', true);

	// ---------------------------------------------------------------- T5.1 download
	console.log('T5.1 download');
	const adminToken = await signIn(argumentByName.adminUserName, adminPassword);
	const downloadResponse = await apiPost('raterAdmin', { adminAction: 'download', downloadFormat: 'json' }, adminToken);
	const downloadDocument = JSON.parse(downloadResponse.bodyJson[0].contentText);
	fs.writeFileSync(path.join(argumentByName.evidenceDir, '22-download-sample.json'), JSON.stringify({ ...downloadDocument, answerList: downloadDocument.answerList.slice(0, 3) }, null, '\t'));
	const testAnswerList = downloadDocument.answerList.filter((record) => raterNameList.includes(record.raterName));
	check(`the download holds 55 answers for the two raters (${testAnswerList.length})`, testAnswerList.length === 55);
	check('every one carries history', testAnswerList.every((record) => Array.isArray(record.history) && record.history.length >= 1));
	check('every chosen card carries foundBy', testAnswerList.every((record) => record.cards.every((card) => !!card.foundBy)));
	const raterRecordByName = Object.fromEntries(downloadDocument.raterList.map((rater) => [rater.raterName, rater]));
	check('rater 1 is finished (locked), rater 2 is not', !!raterRecordByName[raterNameList[0]].finishedAt && !raterRecordByName[raterNameList[1]].finishedAt);
	const lockedSaveResponse = await apiPost('raterAnswerSave', { elementStableId: testAnswerList.find((record) => record.raterName === raterNameList[0]).elementStableId, answerKind: 'noMatch' }, tokenByName[raterNameList[0]]);
	check('rater 1 is locked: a further save is refused (answersLocked)', lockedSaveResponse.statusCode === 400 && /^answersLocked/.test(lockedSaveResponse.bodyText));
	const csvResponse = await apiPost('raterAdmin', { adminAction: 'download', downloadFormat: 'csv' }, adminToken);
	check('the CSV download counts the same answers', csvResponse.bodyJson[0].recordCount === downloadDocument.answerList.length);

	// ---------------------------------------------------------------- T5.2 the admin table
	console.log('T5.2 admin table');
	// the main login lives in memory, so the table is re-read in the app (Results, then Back), not by a page reload
	await page.click('[data-testid="rater-admin-results-link"]');
	await page.locator('[data-testid="rater-results-panel"]').waitFor({ timeout: 20000 });
	await page.click('[data-testid="rater-results-back"]');
	await page.locator(`[data-testid="rater-admin-row-${raterNameList[1]}"]`).waitFor({ timeout: 20000 });
	const firstRowText = await page.locator(`[data-testid="rater-admin-row-${raterNameList[0]}"]`).innerText();
	const secondRowText = await page.locator(`[data-testid="rater-admin-row-${raterNameList[1]}"]`).innerText();
	await page.screenshot({ path: shotPath('23-admin-progress-50-locked-and-5') });
	check(`rater 1's row: 50 / 50 and locked (${firstRowText.replace(/\s+/g, ' ').slice(0, 120)})`, /50 \/ 50/.test(firstRowText) && /Locked/.test(firstRowText));
	check(`rater 2's row: 5 / 50 and not yet (${secondRowText.replace(/\s+/g, ' ').slice(0, 120)})`, /\b5 \/ 50/.test(secondRowText) && /not yet/.test(secondRowText));

	// ---------------------------------------------------------------- cleanup
	if (argumentByName.cleanup === 'yes') {
		console.log('cleanup');
		for (const raterUserName of raterNameList) {
			const removeResponse = await apiPost('raterAdmin', { adminAction: 'remove', raterUserName }, adminToken);
			check(`${raterUserName} removed`, removeResponse.statusCode === 200, removeResponse.bodyText.slice(0, 120));
		}
		const listResponse = await apiPost('raterAdmin', { adminAction: 'list' }, adminToken);
		check('neither rater is left in the store', !listResponse.bodyJson[0].raterList.some((rater) => raterNameList.includes(rater.raterUserName)));
		check('neither rater can sign in', !(await signIn(raterNameList[0], issuedPasswordByName[raterNameList[0]])) && !(await signIn(raterNameList[1], issuedPasswordByName[raterNameList[1]])));
	}
} catch (runError) {
	check('the end-to-end run reached its end', false, runError.message.split('\n')[0]);
	await page.screenshot({ path: shotPath('29-e2e-failure') }).catch(() => {});
} finally {
	await browser.close();
	console.log(`\n=== raterEndToEnd (Phase 5) — Results: ${passCount} passed, ${failCount} failed ===`);
	process.exit(failCount === 0 ? 0 : 1);
}
