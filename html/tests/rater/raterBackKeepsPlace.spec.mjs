// raterBackKeepsPlace.spec.mjs — revision 18 browser gates (WORKORDER-RATER18, TQ 2026-10-19: on the back link, "this
// is bad. Can you fix it?"; on the bullets, "do it"). A rater who opens How to rate from an item comes back to that
// item, and the "How to answer" box says TQ's own five sentences from the instructions page.
// One temporary rater is made through the admin API, saves No match on items 3 and 7, and is removed in `finally`.
//   R18.1 from item 3 and from item 7, by each way into the instructions page (the panel's How to rate, the app bar's
//         Instructions), every "Back to rating" (the page's two and the app bar's) lands on that item with its saved
//         answer shown; in "left undone" mode the set comes back too
//   R18.2 with no rating context the Back links go where they went before revision 18 (/rater/rate); a tampered query
//         (non-numeric item, item 0, item out of range, unknown key, unknown set, malformed items) does the same
//   R18.3 the box shows exactly TQ's five sentences, in order; every sentence of each appears in the instructions
//         page's own text; the old wording is on no rater page the walk opens and (with --bundleDir) in no build file
//   R18.4 at phone width the box does not make the page scroll sideways
//   OBSERVED (reported, not gated; the work order says report and STOP if lost): a Best picked and a note typed but not
//         saved, after the round trip
//
//   node html/tests/rater/raterBackKeepsPlace.spec.mjs --baseUrl=… --adminUserName=… --adminPasswordFile=<file>
//        --surveyName=A --raterPrefix=rater18-back --playwrightCorePath=… --chromePath=… --evidenceDir=…
//        [--bundleDir=<html/.output/public>]

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'adminUserName', 'adminPasswordFile', 'surveyName', 'raterPrefix', 'playwrightCorePath', 'chromePath', 'evidenceDir'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`raterBackKeepsPlace: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
if (argumentByName.bundleDir && !fs.existsSync(argumentByName.bundleDir)) {
	console.error(`raterBackKeepsPlace: --bundleDir '${argumentByName.bundleDir}' does not exist`);
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const adminPassword = fs.readFileSync(argumentByName.adminPasswordFile, 'utf8').trim();
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
const surveyName = argumentByName.surveyName;
const raterUserName = `${argumentByName.raterPrefix}-1`;
fs.mkdirSync(argumentByName.evidenceDir, { recursive: true });
const shotPath = (shotName) => path.join(argumentByName.evidenceDir, `${shotName}.png`);

// TQ's approved sentences (WORKORDER-RATER18 §2), word for word; each line as the box shows it
const HOW_TO_ANSWER_LINE_LIST = Object.freeze([
	'Best: the card that fits best. One per element.',
	'Same: optional. Any other card that is just as right.',
	'No match in CEDS: nothing in CEDS means the same thing. This is a real answer.',
	'Unsure: you cannot decide. Say why in the note.',
	'The class matters. Choose the class that matches what owns the element in its own standard.',
]);
const OLD_WORDING_PATTERN_LIST = Object.freeze([/Exactly one/, /often the right one/i, /same words under a different owner/i]);
const SAVED_ITEM_NUMBER_LIST = Object.freeze([3, 7]);
const PHONE_VIEWPORT = { width: 390, height: 844 };
const panelSelector = '[data-testid="rater-element-panel"]';
const BACK_LINK_WAY_LIST = Object.freeze([
	{ wayName: 'the page\'s first "Back to rating" (On this page)', selector: '.rt-ins-toc .rt-ins-back' },
	{ wayName: 'the page\'s last "Back to rating" (foot of the text)', selector: '[data-testid="rater-instructions"] .rt-ins-back' },
	{ wayName: 'the app bar\'s "Back to rating"', selector: '[data-testid="rater-link-rating"]' },
]);
const INTO_INSTRUCTIONS_WAY_LIST = Object.freeze([
	{ wayName: 'the panel\'s How to rate', selector: `${panelSelector} [data-testid="rater-how-to-rate"]`, opensBox: true },
	{ wayName: 'the app bar\'s Instructions', selector: '[data-testid="rater-link-instructions"]', opensBox: false },
]);

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
const placeOf = (pageUrl) => {
	const parsedUrl = new URL(pageUrl);
	return `${parsedUrl.pathname.replace(/\/$/, '')}${parsedUrl.search}`;
};

const browser = await chromium.launch({ executablePath: argumentByName.chromePath, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

const waitForRaterItem = (targetPage, itemNumber) => targetPage.waitForFunction((expectedNumber) => {
	const crumb = document.querySelector('[data-testid="rater-item-crumb"]');
	return crumb && crumb.textContent.includes(`Item ${expectedNumber} of`) && document.querySelectorAll('[data-testid="rater-candidate-row"]').length > 0;
}, itemNumber, { timeout: 20000 });
const readItemState = (targetPage) => targetPage.evaluate(() => {
	const crumb = document.querySelector('[data-testid="rater-item-crumb"]');
	const matched = crumb && crumb.textContent.match(/Item (\d+) of/);
	const summary = document.querySelector('[data-testid="rater-answer-summary"]');
	const noMatchRadio = document.querySelector('[data-testid="rater-choice-noMatch"]');
	const checkedBest = Array.from(document.querySelectorAll('[data-testid="rater-best-radio"]')).findIndex((radio) => radio.checked);
	const note = document.querySelector('[data-testid="rater-answer-bar"] textarea');
	return { itemNumber: matched ? Number(matched[1]) : null, summaryText: summary ? summary.textContent.replace(/\s+/g, ' ').trim() : '', noMatchChecked: Boolean(noMatchRadio && noMatchRadio.checked), checkedBestIndex: checkedBest, noteText: note ? note.value : null };
});
const openHowBox = (targetPage) => targetPage.locator(`${panelSelector} details.rt-how`).evaluate((detailsElement) => { detailsElement.open = true; });
const waitForInstructions = async (targetPage) => {
	await targetPage.waitForURL(/\/rater\/instructions\/?(\?.*)?$/, { timeout: 20000 });
	await targetPage.locator('[data-testid="rater-instructions"] h1').waitFor({ timeout: 20000 });
};
const backHrefList = (targetPage) => targetPage.evaluate((selectorList) => selectorList.map((selector) => {
	const link = document.querySelector(selector);
	return link ? link.getAttribute('href') : null;
}), BACK_LINK_WAY_LIST.map((backWay) => backWay.selector));

let raterWasMade = false;
let adminToken = null;
try {
	// ---------------------------------------------------------------- a rater with saved answers on items 3 and 7
	const adminLogin = await apiPost('login', { username: argumentByName.adminUserName, password: adminPassword });
	adminToken = adminLogin.statusCode === 200 ? adminLogin.authtoken : null;
	if (!adminToken) {
		throw new Error(`admin login refused (${adminLogin.statusCode})`);
	}
	await apiPost('raterAdmin', { adminAction: 'remove', raterUserName }, adminToken);
	const addResponse = await apiPost('raterAdmin', { adminAction: 'add', raterUserName, whoText: 'Back-keeps-place test rater (temporary, lane RATER revision 18)', surveyName }, adminToken);
	const added = firstOf(addResponse.bodyJson);
	if (addResponse.statusCode !== 200 || !added || !added.issuedPassword) {
		throw new Error(`could not make ${raterUserName}: ${addResponse.statusCode} ${addResponse.bodyText.slice(0, 200)}`);
	}
	raterWasMade = true;
	await page.goto(`${baseUrl}/rater`);
	await page.fill('[data-testid="rater-signin-name"]', raterUserName);
	await page.fill('[data-testid="rater-signin-password"]', added.issuedPassword);
	await page.click('[data-testid="rater-signin-submit"]');
	await waitForRaterItem(page, 1);
	const itemCount = await page.evaluate(() => Number((document.querySelector('[data-testid="rater-item-crumb"]').textContent.match(/of (\d+)/) || [])[1]));
	for (const itemNumber of SAVED_ITEM_NUMBER_LIST) {
		await page.goto(`${baseUrl}/rater/rate?item=${itemNumber}`);
		await waitForRaterItem(page, itemNumber);
		await page.click('[data-testid="rater-choice-noMatch"]');
		await page.click('[data-testid="rater-save"]');
		await waitForRaterItem(page, itemNumber + 1);
	}

	// ---------------------------------------------------------------- R18.1 the round trip keeps the place
	console.log('R18.1 from an item to the instructions page and back');
	for (const itemNumber of SAVED_ITEM_NUMBER_LIST) {
		for (const intoWay of INTO_INSTRUCTIONS_WAY_LIST) {
			for (const backWay of BACK_LINK_WAY_LIST) {
				await page.goto(`${baseUrl}/rater/rate?item=${itemNumber}`);
				await waitForRaterItem(page, itemNumber);
				if (intoWay.opensBox) {
					await openHowBox(page);
				}
				await page.click(intoWay.selector);
				await waitForInstructions(page);
				const instructionsPlace = placeOf(page.url());
				if (itemNumber === 3 && intoWay.opensBox && backWay === BACK_LINK_WAY_LIST[0]) {
					await page.screenshot({ path: shotPath('181-round-trip-2-instructions') });
				}
				await page.click(backWay.selector);
				await page.waitForFunction(() => document.querySelectorAll('[data-testid="rater-candidate-row"]').length > 0, null, { timeout: 20000 });
				await page.waitForTimeout(300);
				const itemState = await readItemState(page);
				check(`item ${itemNumber}, in by ${intoWay.wayName} (${instructionsPlace}), back by ${backWay.wayName} → item ${itemState.itemNumber} at ${placeOf(page.url())}, saved No match shown (${itemState.summaryText})`, itemState.itemNumber === itemNumber && placeOf(page.url()) === `/rater/rate?item=${itemNumber}` && itemState.noMatchChecked && /No match/.test(itemState.summaryText));
				if (itemNumber === 3 && intoWay.opensBox && backWay === BACK_LINK_WAY_LIST[0]) {
					await page.screenshot({ path: shotPath('182-round-trip-3-back-on-item-3') });
				}
			}
		}
	}
	await page.goto(`${baseUrl}/rater/rate?item=3`);
	await waitForRaterItem(page, 3);
	await openHowBox(page);
	await page.locator(`${panelSelector} [data-testid="rater-how-to-rate"]`).evaluate((link) => link.scrollIntoView({ block: 'center' }));
	await page.screenshot({ path: shotPath('180-round-trip-1-on-item-3') });

	console.log('R18.1 in "left undone" mode the set comes back too');
	const undonePlace = `/rater/rate?item=7&set=undone&items=3-7`;
	await page.goto(`${baseUrl}${undonePlace}`);
	await waitForRaterItem(page, 7);
	await openHowBox(page);
	await page.click(`${panelSelector} [data-testid="rater-how-to-rate"]`);
	await waitForInstructions(page);
	await page.click(BACK_LINK_WAY_LIST[1].selector);
	await waitForRaterItem(page, 7);
	check(`from ${undonePlace}, How to rate and Back to rating return to ${placeOf(page.url())}, with "Back to the list" shown`, placeOf(page.url()) === undonePlace && (await page.locator('[data-testid="rater-back-to-list"]').count()) === 1);

	console.log('R18.1 the instructions page opened fresh (a reload) with a good query still knows the place');
	await page.goto(`${baseUrl}/rater/instructions?item=7`);
	await page.locator('[data-testid="rater-instructions"] h1').waitFor({ timeout: 20000 });
	await page.waitForFunction(() => document.querySelector('.rt-ins-toc .rt-ins-back').getAttribute('href') !== '/rater/rate', null, { timeout: 10000 }).catch(() => {});
	await page.click(BACK_LINK_WAY_LIST[0].selector);
	await waitForRaterItem(page, 7).catch(() => {});
	check(`a reloaded /rater/instructions?item=7 sends Back to rating to ${placeOf(page.url())}`, placeOf(page.url()) === '/rater/rate?item=7');

	// ---------------------------------------------------------------- R18.2 no context and tampered queries
	console.log('R18.2 no context, or a tampered query, goes where it went before');
	const plainQueryList = ['', '?item=abc', '?item=0', `?item=${itemCount + 1}`, '?item=3&evil=1', '?item=3&set=other&items=3', '?item=3&set=undone&items=3-x', `?item=3&set=undone&items=3-${itemCount + 1}`, '?item=3&item=4', '?item=3.5', '?item=03'];
	for (const queryText of plainQueryList) {
		await page.goto(`${baseUrl}/rater/instructions${queryText}`);
		await page.locator('[data-testid="rater-instructions"] h1').waitFor({ timeout: 20000 });
		await page.waitForTimeout(400);
		const hrefList = await backHrefList(page);
		check(`/rater/instructions${queryText || ' (no query)'}: every Back to rating is /rater/rate (${JSON.stringify(hrefList)})`, hrefList.every((hrefText) => hrefText === '/rater/rate'));
	}
	await page.goto(`${baseUrl}/rater/instructions?item=999999`);
	await page.locator('[data-testid="rater-instructions"] h1').waitFor({ timeout: 20000 });
	await page.click(BACK_LINK_WAY_LIST[0].selector);
	await waitForRaterItem(page, 1);
	check(`a tampered query's Back lands where a bare one does (${placeOf(page.url())}, item ${(await readItemState(page)).itemNumber})`, placeOf(page.url()) === '/rater/rate' && (await readItemState(page)).itemNumber === 1);

	// ---------------------------------------------------------------- R18.3 the box's five sentences
	console.log('R18.3 How to answer is TQ\'s five sentences');
	await page.goto(`${baseUrl}/rater/rate?item=3`);
	await waitForRaterItem(page, 3);
	await openHowBox(page);
	const boxLineList = (await page.locator(`${panelSelector} details.rt-how li`).allInnerTexts()).map((lineText) => lineText.replace(/\s+/g, ' ').trim());
	check(`the box has exactly the five lines, in order (${JSON.stringify(boxLineList)})`, JSON.stringify(boxLineList) === JSON.stringify(HOW_TO_ANSWER_LINE_LIST));
	const boldList = (await page.locator(`${panelSelector} details.rt-how li b`).allInnerTexts()).map((boldText) => boldText.trim());
	check(`each line leads with its bold words (${JSON.stringify(boldList)})`, JSON.stringify(boldList) === JSON.stringify(['Best:', 'Same:', 'No match in CEDS:', 'Unsure:', 'The class matters.']));
	const ratingPageText = await page.locator('body').innerText();
	await page.locator(`${panelSelector} details.rt-how`).evaluate((detailsElement) => detailsElement.scrollIntoView({ block: 'center' }));
	await page.screenshot({ path: shotPath('183-box-desktop') });
	await page.click(`${panelSelector} [data-testid="rater-how-to-rate"]`);
	await waitForInstructions(page);
	const instructionsText = (await page.locator('[data-testid="rater-instructions"]').innerText()).replace(/\s+/g, ' ');
	HOW_TO_ANSWER_LINE_LIST.forEach((lineText) => {
		const sentenceList = lineText.match(/[^.:]+[.:]/g).map((sentenceText) => sentenceText.trim());
		const missingList = sentenceList.filter((sentenceText) => !instructionsText.toLowerCase().includes(sentenceText.toLowerCase()));
		check(`every sentence of "${lineText}" is in the instructions page's text`, missingList.length === 0, `missing ${JSON.stringify(missingList)}`);
	});
	await page.goto(`${baseUrl}/rater`);
	await page.waitForLoadState('networkidle');
	const signInText = await page.locator('body').innerText();
	OLD_WORDING_PATTERN_LIST.forEach((oldPattern) => {
		check(`${oldPattern} is on neither the rating screen, the instructions page nor the sign-in page`, ![ratingPageText, instructionsText, signInText].some((pageText) => oldPattern.test(pageText)));
	});

	// ---------------------------------------------------------------- R18.4 phone width, and the unsaved observation
	console.log(`R18.4 the box at ${PHONE_VIEWPORT.width}px`);
	const phonePage = await (await browser.newContext({ viewport: PHONE_VIEWPORT, isMobile: true, hasTouch: true })).newPage();
	await phonePage.goto(`${baseUrl}/rater`);
	await phonePage.fill('[data-testid="rater-signin-name"]', raterUserName);
	await phonePage.fill('[data-testid="rater-signin-password"]', added.issuedPassword);
	await phonePage.click('[data-testid="rater-signin-submit"]');
	await waitForRaterItem(phonePage, 1);
	await phonePage.goto(`${baseUrl}/rater/rate?item=3`);
	await waitForRaterItem(phonePage, 3);
	await openHowBox(phonePage);
	const phonePageWidth = await phonePage.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
	check(`the page does not scroll sideways (${phonePageWidth.scrollWidth} <= ${phonePageWidth.clientWidth})`, phonePageWidth.scrollWidth <= phonePageWidth.clientWidth);
	await phonePage.locator(`${panelSelector} details.rt-how`).evaluate((detailsElement) => detailsElement.scrollIntoView({ block: 'start' }));
	await phonePage.screenshot({ path: shotPath('184-box-phone') });

	console.log('OBSERVED a Best picked and a note typed on item 5, not saved, then How to rate and Back to rating');
	await page.goto(`${baseUrl}/rater/rate?item=5`);
	await waitForRaterItem(page, 5);
	await page.locator('[data-testid="rater-best-radio"]').first().check();
	await page.locator('[data-testid="rater-answer-bar"] textarea').fill('unsaved note RATER18');
	const beforeState = await readItemState(page);
	await openHowBox(page);
	await page.click(`${panelSelector} [data-testid="rater-how-to-rate"]`);
	await waitForInstructions(page);
	await page.click(BACK_LINK_WAY_LIST[0].selector);
	await page.waitForFunction(() => document.querySelectorAll('[data-testid="rater-candidate-row"]').length > 0, null, { timeout: 20000 });
	await page.waitForTimeout(300);
	const afterState = await readItemState(page);
	console.log(`  OBSERVED: before item ${beforeState.itemNumber}, Best row ${beforeState.checkedBestIndex}, note "${beforeState.noteText}"; after item ${afterState.itemNumber}, Best row ${afterState.checkedBestIndex}, note "${afterState.noteText}"`);
	await page.goto(`${baseUrl}/rater/rate?item=5`);
	await waitForRaterItem(page, 5);
	await page.locator('[data-testid="rater-best-radio"]').first().check();
	await page.locator('[data-testid="rater-answer-bar"] textarea').fill('unsaved note RATER18');
	await openHowBox(page);
	await page.click(`${panelSelector} [data-testid="rater-how-to-rate"]`);
	await waitForInstructions(page);
	await page.goBack();
	await waitForRaterItem(page, 5);
	await page.waitForTimeout(300);
	const afterBrowserBackState = await readItemState(page);
	console.log(`  OBSERVED: by the browser's Back instead: item ${afterBrowserBackState.itemNumber}, Best row ${afterBrowserBackState.checkedBestIndex}, note "${afterBrowserBackState.noteText}"`);
} catch (walkError) {
	check('the back-keeps-place walkthrough ran to the end', false, `${walkError && walkError.message}`.split('\n')[0]);
	await page.screenshot({ path: shotPath('189-back-keeps-place-failure') }).catch(() => {});
} finally {
	if (raterWasMade) {
		const removeResponse = await apiPost('raterAdmin', { adminAction: 'remove', raterUserName }, adminToken).catch((removeError) => ({ statusCode: `${removeError}` }));
		check(`the temporary rater ${raterUserName} is removed (${removeResponse.statusCode})`, removeResponse.statusCode === 200);
	}
	await browser.close();
}

// ---------------------------------------------------------------- R18.3 the built bundle
if (argumentByName.bundleDir) {
	const fileListOf = (dirPath) => fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? fileListOf(path.join(dirPath, entry.name)) : [path.join(dirPath, entry.name)]));
	const textFileList = fileListOf(argumentByName.bundleDir).filter((filePath) => /\.(js|mjs|html|json|css|txt)$/.test(filePath));
	OLD_WORDING_PATTERN_LIST.forEach((oldPattern) => {
		const leakFileList = textFileList.filter((filePath) => oldPattern.test(fs.readFileSync(filePath, 'utf8')));
		check(`${oldPattern} is in none of the build's ${textFileList.length} text files`, textFileList.length > 0 && leakFileList.length === 0, leakFileList.slice(0, 3).join(', '));
	});
}

console.log(`\n=== raterBackKeepsPlace (revision 18 browser) — Results: ${passCount} passed, ${failCount} failed ===`);
process.exit(failCount === 0 ? 0 : 1);
