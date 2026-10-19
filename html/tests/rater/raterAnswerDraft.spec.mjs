// raterAnswerDraft.spec.mjs — revision 18 amendment browser gates (WORKORDER-RATER18 AMENDMENT, TQ 2026-10-19: "yes,
// save work"). An answer a rater has not saved yet (Best, Same, added cards, note) survives leaving the item, is marked
// "Not saved yet", and never lands on another item or another rater.
// Two temporary raters are made through the admin API on one survey and removed in `finally`.
//   D18.1 item 5: a Best, a Same, an added card and a note, not saved; back from the instructions page by its "Back to
//         rating" link, by the browser's Back, and after a reload of the tab, all four are there, marked "Not saved yet"
//   D18.2 another item shows none of it
//   D18.3 an answer put back to the saved one keeps no draft (and no mark)
//   D18.4 saving the item clears its draft; the saved answer then shows unmarked
//   D18.5 signing out clears every draft; signing in as another rater shows none
//   D18.6 with sessionStorage refusing every access the draft still survives the round trip, with no page error
//
//   node html/tests/rater/raterAnswerDraft.spec.mjs --baseUrl=… --adminUserName=… --adminPasswordFile=<file>
//        --surveyName=A --raterPrefix=rater18-draft --playwrightCorePath=… --chromePath=… --evidenceDir=…

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'adminUserName', 'adminPasswordFile', 'surveyName', 'raterPrefix', 'playwrightCorePath', 'chromePath', 'evidenceDir'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`raterAnswerDraft: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const adminPassword = fs.readFileSync(argumentByName.adminPasswordFile, 'utf8').trim();
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
const surveyName = argumentByName.surveyName;
const raterUserNameList = [`${argumentByName.raterPrefix}-1`, `${argumentByName.raterPrefix}-2`];
fs.mkdirSync(argumentByName.evidenceDir, { recursive: true });
const shotPath = (shotName) => path.join(argumentByName.evidenceDir, `${shotName}.png`);

const DRAFT_STORAGE_NAME = 'cedsRaterAnswerDrafts';
const UNSAVED_MARK_TEXT = 'Not saved yet';
const DRAFT_NOTE_TEXT = 'unsaved note RATER18 draft';
const SEARCH_QUERY_LIST = Object.freeze(['P001572', 'birth date', 'school year', 'grade level']);
const panelSelector = '[data-testid="rater-element-panel"]';

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

const waitForRaterItem = (targetPage, itemNumber) => targetPage.waitForFunction((expectedNumber) => {
	const crumb = document.querySelector('[data-testid="rater-item-crumb"]');
	return crumb && crumb.textContent.includes(`Item ${expectedNumber} of`) && document.querySelectorAll('[data-testid="rater-candidate-row"]').length > 0;
}, itemNumber, { timeout: 20000 });
const settle = (targetPage) => targetPage.waitForTimeout(300);
// what the screen shows as the answer, by CEDS tuple id
const readAnswerState = (targetPage) => targetPage.evaluate(() => {
	const rowList = Array.from(document.querySelectorAll('[data-testid="rater-candidate-row"]'));
	const tupleIdOf = (row) => row.getAttribute('data-ceds-tuple-id');
	const bestRow = rowList.find((row) => row.querySelector('[data-testid="rater-best-radio"]').checked);
	const otherChecked = Array.from(document.querySelectorAll('[data-testid^="rater-choice-"]')).find((radio) => radio.checked);
	const crumb = document.querySelector('[data-testid="rater-item-crumb"]');
	const unsavedMark = document.querySelector('[data-testid="rater-answer-unsaved"]');
	return {
		itemNumber: crumb ? Number((crumb.textContent.match(/Item (\d+) of/) || [])[1]) : null,
		best: bestRow ? tupleIdOf(bestRow) : otherChecked ? otherChecked.getAttribute('data-testid').replace('rater-choice-', '') : null,
		sameList: rowList.filter((row) => row.querySelector('[data-testid="rater-same-checkbox"]').checked).map(tupleIdOf).sort(),
		addedList: rowList.filter((row) => /Added by you/.test(row.textContent)).map(tupleIdOf).sort(),
		noteText: document.querySelector('[data-testid="rater-note"]').value,
		summaryText: document.querySelector('[data-testid="rater-answer-summary"]').textContent.replace(/\s+/g, ' ').trim(),
		unsavedMarkText: unsavedMark ? unsavedMark.textContent.trim() : '',
	};
});
const readDraftStorage = (targetPage) => targetPage.evaluate((storageName) => {
	try {
		return window.sessionStorage.getItem(storageName);
	} catch (storageError) {
		return `refused: ${storageError.name}`;
	}
}, DRAFT_STORAGE_NAME);
const sameAnswer = (answerA, answerB) => answerA.best === answerB.best && JSON.stringify(answerA.sameList) === JSON.stringify(answerB.sameList) && JSON.stringify(answerA.addedList) === JSON.stringify(answerB.addedList) && answerA.noteText === answerB.noteText;
const signIn = async (targetPage, raterUserName, raterPassword) => {
	await targetPage.goto(`${baseUrl}/rater`);
	await targetPage.fill('[data-testid="rater-signin-name"]', raterUserName);
	await targetPage.fill('[data-testid="rater-signin-password"]', raterPassword);
	await targetPage.click('[data-testid="rater-signin-submit"]');
	await targetPage.waitForFunction(() => document.querySelectorAll('[data-testid="rater-candidate-row"]').length > 0, null, { timeout: 20000 });
};
const openItem = async (targetPage, itemNumber) => {
	await targetPage.goto(`${baseUrl}/rater/rate?item=${itemNumber}`);
	await waitForRaterItem(targetPage, itemNumber);
	await settle(targetPage);
};
const roundTripByBackLink = async (targetPage, itemNumber) => {
	await targetPage.locator(`${panelSelector} details.rt-how`).evaluate((detailsElement) => { detailsElement.open = true; });
	await targetPage.click(`${panelSelector} [data-testid="rater-how-to-rate"]`);
	await targetPage.locator('[data-testid="rater-instructions"] h1').waitFor({ timeout: 20000 });
	await targetPage.click('.rt-ins-toc .rt-ins-back');
	await waitForRaterItem(targetPage, itemNumber);
	await settle(targetPage);
};
// a card added from the search drawer: walk a few searches until one result is not already listed
const addCardBySearch = async (targetPage) => {
	await targetPage.click('[data-testid="rater-open-search"]');
	const addableResult = targetPage.locator('[data-testid="rater-search-result"]', { has: targetPage.locator('[data-testid="rater-add-card"]') }).first();
	for (const queryText of SEARCH_QUERY_LIST) {
		await targetPage.fill('[data-testid="rater-search-input"]', queryText);
		await targetPage.click('[data-testid="rater-search-submit"]');
		await targetPage.waitForFunction(() => document.querySelector('[data-testid="rater-search-results"], [data-testid="rater-finder-empty"], [data-testid="rater-finder-error"]') && !document.querySelector('[aria-label="Searching"]'), null, { timeout: 20000 });
		if ((await addableResult.count()) > 0) {
			break;
		}
	}
	if ((await addableResult.count()) === 0) {
		throw new Error('no search gave a card that is not already in the list');
	}
	await addableResult.locator('[data-testid="rater-add-card"]').click();
	await targetPage.waitForTimeout(200);
	await targetPage.click('[data-testid="rater-finder-close"]');
	await targetPage.waitForTimeout(200);
};
// on the open item: an added card, Best on the first suggested card, Same on the second, a note
const makeFullDraft = async (targetPage) => {
	await addCardBySearch(targetPage);
	const suggestedRowList = targetPage.locator('[data-testid="rater-candidate-row"]').filter({ hasNotText: 'Added by you' });
	await suggestedRowList.nth(0).locator('[data-testid="rater-best-radio"]').check();
	await suggestedRowList.nth(1).locator('[data-testid="rater-same-checkbox"]').check();
	await targetPage.fill('[data-testid="rater-note"]', DRAFT_NOTE_TEXT);
	await settle(targetPage);
	return readAnswerState(targetPage);
};

const raterPasswordByName = {};
let adminToken = null;
try {
	const adminLogin = await apiPost('login', { username: argumentByName.adminUserName, password: adminPassword });
	adminToken = adminLogin.statusCode === 200 ? adminLogin.authtoken : null;
	if (!adminToken) {
		throw new Error(`admin login refused (${adminLogin.statusCode})`);
	}
	for (const raterUserName of raterUserNameList) {
		await apiPost('raterAdmin', { adminAction: 'remove', raterUserName }, adminToken);
		const added = firstOf((await apiPost('raterAdmin', { adminAction: 'add', raterUserName, whoText: 'Answer-draft test rater (temporary, lane RATER revision 18)', surveyName }, adminToken)).bodyJson);
		if (!added || !added.issuedPassword) {
			throw new Error(`could not make ${raterUserName}`);
		}
		raterPasswordByName[raterUserName] = added.issuedPassword;
	}
	const [firstRaterName, secondRaterName] = raterUserNameList;
	await signIn(page, firstRaterName, raterPasswordByName[firstRaterName]);

	// ---------------------------------------------------------------- D18.1 the draft survives leaving the item
	console.log('D18.1 a Best, a Same, an added card and a note on item 5, not saved');
	await openItem(page, 5);
	const draftAnswer = await makeFullDraft(page);
	check(`the draft has all four parts (best ${draftAnswer.best}, same ${draftAnswer.sameList.length}, added ${draftAnswer.addedList.length}, note)`, Boolean(draftAnswer.best) && draftAnswer.sameList.length === 1 && draftAnswer.addedList.length === 1 && draftAnswer.noteText === DRAFT_NOTE_TEXT);
	check(`while it is on screen the answer bar says "${UNSAVED_MARK_TEXT}" (${draftAnswer.unsavedMarkText || 'no mark'})`, draftAnswer.unsavedMarkText.includes(UNSAVED_MARK_TEXT));
	await roundTripByBackLink(page, 5);
	const afterBackLink = await readAnswerState(page);
	check(`back by "Back to rating": item ${afterBackLink.itemNumber}, the same four parts, marked "${afterBackLink.unsavedMarkText}"`, afterBackLink.itemNumber === 5 && sameAnswer(afterBackLink, draftAnswer) && afterBackLink.unsavedMarkText.includes(UNSAVED_MARK_TEXT), JSON.stringify(afterBackLink));
	await page.locator('[data-testid="rater-answer-bar"]').screenshot({ path: shotPath('185-draft-restored-answer-bar') });
	await page.screenshot({ path: shotPath('186-draft-restored-page') });
	await page.locator(`${panelSelector} details.rt-how`).evaluate((detailsElement) => { detailsElement.open = true; });
	await page.click(`${panelSelector} [data-testid="rater-how-to-rate"]`);
	await page.locator('[data-testid="rater-instructions"] h1').waitFor({ timeout: 20000 });
	await page.goBack();
	await waitForRaterItem(page, 5);
	await settle(page);
	const afterBrowserBack = await readAnswerState(page);
	check(`back by the browser's Back: the same four parts, marked (${afterBrowserBack.unsavedMarkText || 'no mark'})`, sameAnswer(afterBrowserBack, draftAnswer) && afterBrowserBack.unsavedMarkText.includes(UNSAVED_MARK_TEXT), JSON.stringify(afterBrowserBack));
	await page.reload();
	await waitForRaterItem(page, 5);
	await settle(page);
	const afterReload = await readAnswerState(page);
	check(`after a reload of the tab: the same four parts, marked (${afterReload.unsavedMarkText || 'no mark'})`, sameAnswer(afterReload, draftAnswer) && afterReload.unsavedMarkText.includes(UNSAVED_MARK_TEXT), JSON.stringify(afterReload));
	const storedText = await readDraftStorage(page);
	check(`the tab's sessionStorage holds it under "${DRAFT_STORAGE_NAME}", and localStorage holds nothing of it`, Boolean(storedText) && storedText.includes(DRAFT_NOTE_TEXT) && !(await page.evaluate((noteText) => JSON.stringify(Object.assign({}, window.localStorage)).includes(noteText), DRAFT_NOTE_TEXT)));

	// ---------------------------------------------------------------- D18.2 another item
	console.log('D18.2 another item shows none of it');
	await page.click('[data-testid="rater-previous"]');
	await waitForRaterItem(page, 4);
	await settle(page);
	const otherItem = await readAnswerState(page);
	check(`item 4: nothing chosen, no note, no added card, no mark (${otherItem.summaryText})`, otherItem.best === null && otherItem.noteText === '' && otherItem.addedList.length === 0 && otherItem.unsavedMarkText === '');

	// ---------------------------------------------------------------- D18.3 back to the saved answer keeps no draft
	console.log('D18.3 an answer put back to the saved one keeps no draft');
	await openItem(page, 3);
	await page.click('[data-testid="rater-choice-noMatch"]');
	await page.click('[data-testid="rater-save"]');
	await waitForRaterItem(page, 4);
	await openItem(page, 3);
	check(`item 3 saved as No match shows unmarked (${(await readAnswerState(page)).summaryText})`, (await readAnswerState(page)).best === 'noMatch' && (await readAnswerState(page)).unsavedMarkText === '');
	await page.click('[data-testid="rater-choice-unsure"]');
	await settle(page);
	check(`changed to Unsure it is marked (${(await readAnswerState(page)).unsavedMarkText || 'no mark'})`, (await readAnswerState(page)).unsavedMarkText.includes(UNSAVED_MARK_TEXT));
	await page.click('[data-testid="rater-choice-noMatch"]');
	await settle(page);
	const putBack = await readAnswerState(page);
	const storedAfterPutBack = JSON.parse((await readDraftStorage(page)) || '{}');
	const storedItemNumberList = Object.values(storedAfterPutBack).map((storedDraft) => storedDraft.itemNumber);
	check(`put back to No match: no mark, and no draft is kept for item 3 (stored drafts are for items ${JSON.stringify(storedItemNumberList)})`, putBack.unsavedMarkText === '' && JSON.stringify(storedItemNumberList) === '[5]');

	// ---------------------------------------------------------------- D18.4 saving clears the draft
	console.log('D18.4 saving the item clears its draft');
	await openItem(page, 5);
	check('item 5 opens with the draft again', sameAnswer(await readAnswerState(page), draftAnswer));
	await page.click('[data-testid="rater-save"]');
	await waitForRaterItem(page, 6);
	const storedAfterSave = JSON.parse((await readDraftStorage(page)) || '{}');
	check(`after Save and next no draft is stored (${JSON.stringify(Object.keys(storedAfterSave))})`, Object.keys(storedAfterSave).length === 0);
	await page.click('[data-testid="rater-previous"]');
	await waitForRaterItem(page, 5);
	await settle(page);
	const savedFive = await readAnswerState(page);
	check(`item 5 now shows the saved answer, unmarked (${savedFive.summaryText})`, sameAnswer(savedFive, draftAnswer) && savedFive.unsavedMarkText === '', JSON.stringify(savedFive));

	// ---------------------------------------------------------------- D18.5 sign-out clears; another rater sees none
	console.log('D18.5 signing out clears every draft; another rater sees none');
	await openItem(page, 7);
	await page.fill('[data-testid="rater-note"]', DRAFT_NOTE_TEXT);
	await settle(page);
	check('a note on item 7 is a stored draft', ((await readDraftStorage(page)) || '').includes(DRAFT_NOTE_TEXT));
	await page.goto(`${baseUrl}/rater/rate?item=7&set=undone&items=6-7`);
	await waitForRaterItem(page, 7);
	await settle(page);
	const undoneSeven = await readAnswerState(page);
	check(`item 7 opened from the left-undone list shows the same draft, marked (${undoneSeven.unsavedMarkText || 'no mark'})`, undoneSeven.noteText === DRAFT_NOTE_TEXT && undoneSeven.unsavedMarkText.includes(UNSAVED_MARK_TEXT));
	await page.click('[data-testid="rater-sign-out"]');
	await page.waitForURL(/\/rater\/?$/, { timeout: 20000 });
	check(`after Sign out no draft is stored (${await readDraftStorage(page)})`, !((await readDraftStorage(page)) || '').includes(DRAFT_NOTE_TEXT));
	await signIn(page, secondRaterName, raterPasswordByName[secondRaterName]);
	await openItem(page, 7);
	const secondRaterSeven = await readAnswerState(page);
	check(`${secondRaterName} on item 7: no note, nothing chosen, no mark`, secondRaterSeven.noteText === '' && secondRaterSeven.best === null && secondRaterSeven.unsavedMarkText === '');
	await page.click('[data-testid="rater-sign-out"]');
	await page.waitForURL(/\/rater\/?$/, { timeout: 20000 });
	await signIn(page, firstRaterName, raterPasswordByName[firstRaterName]);
	await openItem(page, 7);
	check(`${firstRaterName} back on item 7 after signing out: the draft is gone`, (await readAnswerState(page)).noteText === '');

	// ---------------------------------------------------------------- D18.6 storage refused
	console.log('D18.6 with sessionStorage refused the draft lives in the session');
	const refusedContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	await refusedContext.addInitScript(() => {
		Object.defineProperty(window, 'sessionStorage', { configurable: true, get: () => { throw new DOMException('storage refused for the test', 'SecurityError'); } });
	});
	const refusedPage = await refusedContext.newPage();
	const pageErrorList = [];
	refusedPage.on('pageerror', (pageError) => pageErrorList.push(`${pageError.message}`.split('\n')[0]));
	await signIn(refusedPage, secondRaterName, raterPasswordByName[secondRaterName]);
	check(`sessionStorage really is refused in this tab (${await readDraftStorage(refusedPage)})`, `${await readDraftStorage(refusedPage)}`.startsWith('refused'));
	await refusedPage.click('[data-testid="rater-previous"]').catch(() => {});
	await refusedPage.locator('[data-testid="rater-item-crumb"]').waitFor();
	const refusedItemNumber = (await readAnswerState(refusedPage)).itemNumber;
	await refusedPage.click('[data-testid="rater-choice-noMatch"]');
	await refusedPage.fill('[data-testid="rater-note"]', DRAFT_NOTE_TEXT);
	await settle(refusedPage);
	await roundTripByBackLink(refusedPage, refusedItemNumber);
	const refusedAfter = await readAnswerState(refusedPage);
	check(`item ${refusedItemNumber} after the round trip: No match and the note, marked (${refusedAfter.unsavedMarkText || 'no mark'})`, refusedAfter.best === 'noMatch' && refusedAfter.noteText === DRAFT_NOTE_TEXT && refusedAfter.unsavedMarkText.includes(UNSAVED_MARK_TEXT), JSON.stringify(refusedAfter));
	check(`no page error in that tab (${JSON.stringify(pageErrorList.slice(0, 2))})`, pageErrorList.length === 0);
	await refusedContext.close();
} catch (walkError) {
	check('the answer-draft walkthrough ran to the end', false, `${walkError && walkError.message}`.split('\n')[0]);
	await page.screenshot({ path: shotPath('188-answer-draft-failure') }).catch(() => {});
} finally {
	for (const raterUserName of Object.keys(raterPasswordByName)) {
		const removeResponse = await apiPost('raterAdmin', { adminAction: 'remove', raterUserName }, adminToken).catch((removeError) => ({ statusCode: `${removeError}` }));
		check(`the temporary rater ${raterUserName} is removed (${removeResponse.statusCode})`, removeResponse.statusCode === 200);
	}
	await browser.close();
}

console.log(`\n=== raterAnswerDraft (revision 18 amendment browser) — Results: ${passCount} passed, ${failCount} failed ===`);
process.exit(failCount === 0 ? 0 : 1);
