// raterWalkthrough.spec.mjs — Phase 4 browser gates for the CEDS Rater UI (lane RATER, 2026-10-14), driven by Playwright
// against a running dev site (Nuxt on --baseUrl, API behind it). Browser-side code: async/await is the standard here.
//   T4.1 walkthrough: sign in; rate 3 items (Best + Same, No match, Unsure with note); add a card from Search and choose
//        it; browse Person → Person Identification and add a card; Previous back and change an answer; reload: persisted
//   T4.2 an invalid answer is refused and the message shows in the answer bar
//   T4.3 Same is disabled until a Best exists, and disabled on the Best card
//   T4.4 viewport: >= 3 cards fully visible at 1280×720 on opening, >= 5 at 1440×900 (screenshots)
//   T4.5 keyboard: Tab reaches every control kind, arrow keys move within the Best group, the focus ring shows
//   T4.6 no ranking leaks: no numbers on cards beyond the CEDS ID; no "found by" text anywhere
//
//   node html/tests/rater/raterWalkthrough.spec.mjs --baseUrl=http://localhost:7795 --raterUserName=… --password=…
//        --playwrightCorePath=<dir of playwright-core> --chromePath=<Chrome for Testing binary> --evidenceDir=<dir>
// The rater must be fresh (no saved answers) on a survey; the walkthrough leaves 5 saved answers behind.

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'raterUserName', 'password', 'playwrightCorePath', 'chromePath', 'evidenceDir'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`raterWalkthrough: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
fs.mkdirSync(argumentByName.evidenceDir, { recursive: true });

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
const shotPath = (shotName) => path.join(argumentByName.evidenceDir, `${shotName}.png`);

const browser = await chromium.launch({ executablePath: argumentByName.chromePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');

const waitForItem = async (itemNumber) => {
	await page.waitForURL(new RegExp(`/rater/rate\\?item=${itemNumber}$`), { timeout: 20000 });
	await page.waitForFunction((expectedNumber) => {
		const crumb = document.querySelector('[data-testid="rater-item-crumb"]');
		return crumb && crumb.textContent.includes(`Item ${expectedNumber} of`) && document.querySelectorAll('[data-testid="rater-candidate-row"]').length > 0;
	}, itemNumber, { timeout: 20000 });
};
const rowLocator = () => page.locator('[data-testid="rater-candidate-row"]');
const answerMessageText = async () => ((await page.locator('[data-testid="rater-answer-message"]').count()) ? page.locator('[data-testid="rater-answer-message"]').innerText() : '');
const fullyVisibleCardCount = async () =>
	page.evaluate(() => {
		const answerBarTop = document.querySelector('[data-testid="rater-answer-bar"]').getBoundingClientRect().top;
		return Array.from(document.querySelectorAll('[data-testid="rater-candidate-row"]')).filter((row) => {
			const rect = row.getBoundingClientRect();
			return rect.top >= 0 && rect.bottom <= Math.min(answerBarTop, window.innerHeight);
		}).length;
	});

try {
	// ---------------------------------------------------------------- T4.1 (1) sign in
	console.log('T4.1 walkthrough');
	await page.goto(`${baseUrl}/rater`);
	await page.fill('[data-testid="rater-signin-name"]', argumentByName.raterUserName);
	await page.fill('[data-testid="rater-signin-password"]', argumentByName.password);
	await page.screenshot({ path: shotPath('01-signin') });
	await page.click('[data-testid="rater-signin-submit"]');
	await waitForItem(1);
	check('sign in goes straight to item 1', true);

	// ---------------------------------------------------------------- T4.4 at 1440×900 on opening
	console.log('T4.4 viewport');
	const visibleAt1440 = await fullyVisibleCardCount();
	await page.screenshot({ path: shotPath('02-rating-1440x900') });
	check(`at 1440×900, at least 5 cards fully visible on opening (${visibleAt1440})`, visibleAt1440 >= 5);
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.reload();
	await waitForItem(1);
	const visibleAt1280 = await fullyVisibleCardCount();
	await page.screenshot({ path: shotPath('03-rating-1280x720') });
	check(`at 1280×720, at least 3 cards fully visible on opening (${visibleAt1280})`, visibleAt1280 >= 3);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.reload();
	await waitForItem(1);
	await page.evaluate(() => window.scrollTo(0, 700));
	await page.waitForTimeout(300);
	const stickyRead = await page.evaluate(() => ({
		headTop: document.querySelector('[data-testid="rater-column-heads"]').getBoundingClientRect().top,
		panelTop: document.querySelector('[data-testid="rater-element-panel"]').getBoundingClientRect().top,
		barBottom: document.querySelector('[data-testid="rater-answer-bar"]').getBoundingClientRect().bottom,
		innerHeight: window.innerHeight,
		scrolledBy: window.scrollY,
		listScrollBox: getComputedStyle(document.querySelector('[data-testid="rater-candidate-list"]')).overflowY,
	}));
	await page.screenshot({ path: shotPath('03b-scrolled-sticky-1440x900') });
	check(`the whole page scrolls (scrollY ${stickyRead.scrolledBy}; list overflow ${stickyRead.listScrollBox})`, stickyRead.scrolledBy >= 600 && stickyRead.listScrollBox === 'visible');
	check(`scrolled: the Best/Same column heads stay at the top (${Math.round(stickyRead.headTop)}px)`, stickyRead.headTop >= 0 && stickyRead.headTop < 80);
	check(`scrolled at >= 1100px: the element panel stays put (${Math.round(stickyRead.panelTop)}px)`, Math.abs(stickyRead.panelTop - 12) <= 2);
	check(`the answer bar stays at the bottom (${Math.round(stickyRead.barBottom)} of ${stickyRead.innerHeight})`, Math.abs(stickyRead.barBottom - stickyRead.innerHeight) <= 2);
	await page.evaluate(() => window.scrollTo(0, 0));

	// ---------------------------------------------------------------- T4.6 no ranking leaks
	console.log('T4.6 no ranking leaks');
	const leakList = await page.evaluate(() => {
		const leakTextList = [];
		document.querySelectorAll('[data-testid="rater-candidate-row"] article').forEach((article) => {
			const clone = article.cloneNode(true);
			clone.querySelectorAll('details, [data-testid="rater-card-ceds-id"]').forEach((removable) => removable.remove());
			// names of CEDS classes, properties and qualifiers are CEDS's own words (eg 'K12 School'); everything else must hold no digit
			clone.querySelectorAll('.rt-card-title > *').forEach((titlePart) => titlePart.remove());
			const remainingText = clone.innerText || clone.textContent;
			const definitionStripped = remainingText.replace(article.querySelector('.rt-card-definition')?.textContent || '', '');
			if (/\d/.test(definitionStripped)) {
				leakTextList.push(definitionStripped.trim().slice(0, 80));
			}
		});
		return leakTextList;
	});
	check('no number on any card beyond its CEDS ID (and CEDS’s own names and definitions)', leakList.length === 0, JSON.stringify(leakList.slice(0, 3)));
	// the tool's own words only: the standards' texts (element panel, CEDS cards) can say 'rank' or 'score' about data
	const pageText = await page.evaluate(() => {
		const clone = document.body.cloneNode(true);
		clone.querySelectorAll('[data-testid="rater-element-panel"], [data-testid="rater-candidate-row"] article, [data-testid="rater-search-result"], [data-testid="rater-browse-property"]').forEach((standardText) => standardText.remove());
		return clone.innerText || clone.textContent;
	});
	check('no "found by", score, rank, AI, mapping, gold or injected text in the tool’s own words on the rating page', !/found by|foundBy|score|rank|confidence|\bAI\b|judge|mapped|mapping|isMappedInGold|\bgold|inject/i.test(pageText), (pageText.match(/found by|foundBy|score|rank|confidence|\bAI\b|judge|mapped|mapping|isMappedInGold|\bgold|inject/i) || [])[0]);
	const idTextList = await page.locator('[data-testid="rater-card-ceds-id"]').allInnerTexts();
	check('every card shows a CEDS ID or "CEDS ID not listed"', idTextList.length > 0 && idTextList.every((idText) => /^CEDS ID (P\d{6}|not listed)$/.test(idText.trim())), JSON.stringify(idTextList.slice(0, 3)));

	// ---------------------------------------------------------------- T4.3 Same disabled until Best; disabled on Best
	console.log('T4.3 Same rules');
	const sameDisabledBefore = await page.$$eval('[data-testid="rater-same-checkbox"]', (boxList) => boxList.every((box) => box.disabled));
	check('before any Best, every Same checkbox is disabled', sameDisabledBefore);
	await rowLocator().nth(0).locator('[data-testid="rater-best-radio"]').check();
	const sameStateAfter = await page.$$eval('[data-testid="rater-same-checkbox"]', (boxList) => boxList.map((box) => box.disabled));
	check('after choosing card 1 as Best, its own Same is disabled', sameStateAfter[0] === true);
	check('…and every other card’s Same is enabled', sameStateAfter.slice(1).every((isDisabled) => isDisabled === false));

	// ---------------------------------------------------------------- T4.1 (2a) item 1: Best + Same
	await rowLocator().nth(2).locator('[data-testid="rater-same-checkbox"]').check();
	const summaryOne = await page.locator('[data-testid="rater-answer-summary"]').innerText();
	check('item 1: the summary reads Best … · Same …', /Best: .+ · Same: /.test(summaryOne), summaryOne);
	const itemOneBestTupleId = await rowLocator().nth(0).getAttribute('data-ceds-tuple-id');
	const itemOneSameTupleId = await rowLocator().nth(2).getAttribute('data-ceds-tuple-id');
	await page.screenshot({ path: shotPath('04-item1-best-and-same') });
	await page.click('[data-testid="rater-save"]');
	await waitForItem(2);
	check('item 1 saved (Best + Same); item 2 opens', true);

	// ---------------------------------------------------------------- T4.2 an invalid answer is refused in the answer bar
	console.log('T4.2 refusal in the answer bar');
	await page.click('[data-testid="rater-save"]');
	const nothingMessage = await answerMessageText();
	check('Save with nothing chosen is refused, message in the answer bar', /Choose a Best card, No match in CEDS, or Unsure/.test(nothingMessage), nothingMessage);
	await page.locator('[data-testid="rater-answer-bar"] [data-testid="rater-answer-message"]').waitFor();
	await page.screenshot({ path: shotPath('05-refused-nothing-chosen') });
	check('the URL did not move on', /item=2$/.test(page.url()));

	// ---------------------------------------------------------------- T4.1 (2b) item 2: No match
	await page.check('[data-testid="rater-choice-noMatch"]');
	await page.click('[data-testid="rater-save"]');
	await waitForItem(3);
	check('item 2 saved (No match); item 3 opens', true);

	// ---------------------------------------------------------------- T4.1 (2c) item 3: Unsure, first without a note (T4.2)
	await page.check('[data-testid="rater-choice-unsure"]');
	await page.click('[data-testid="rater-save"]');
	const unsureMessage = await answerMessageText();
	check('Unsure without a note is refused, message in the answer bar', /Unsure needs a note/.test(unsureMessage), unsureMessage);
	const noteHeight = await page.$eval('[data-testid="rater-note"]', (noteBox) => noteBox.getBoundingClientRect().height);
	check(`the note stays open for Unsure (${Math.round(noteHeight)}px)`, noteHeight >= 90);
	await page.screenshot({ path: shotPath('06-refused-unsure-without-note') });
	await page.fill('[data-testid="rater-note"]', "Two classes could fit and I can't tell which is meant.");
	await page.click('[data-testid="rater-save"]');
	await waitForItem(4);
	check('item 3 saved (Unsure with a note); item 4 opens', true);

	// ---------------------------------------------------------------- T4.1 (3) item 4: add a card from Search and choose it
	await page.fill('[data-testid="rater-search-input"]', 'P001572');
	await page.click('[data-testid="rater-search-submit"]');
	await page.locator('[data-testid="rater-search-result"]').first().waitFor({ timeout: 20000 });
	// the first P001572 card not already in this item's list (the sample decides which are)
	const searchResultList = page.locator('[data-testid="rater-search-result"]');
	let addablePosition = 0;
	while ((await searchResultList.nth(addablePosition).locator('[data-testid="rater-add-card"]').count()) === 0) {
		addablePosition += 1;
	}
	const studentIdResult = searchResultList.nth(addablePosition);
	const addedQualifierText = (await studentIdResult.locator('.rt-qualifier').allInnerTexts()).join(', ');
	await studentIdResult.locator('[data-testid="rater-add-card"]').click();
	await page.screenshot({ path: shotPath('07-search-added') });
	const firstRowText = await rowLocator().nth(0).innerText();
	check(`the searched card (Person Identifier ${addedQualifierText || 'no qualifier'}) joins the TOP of the list, marked "Added by you"`, /Added by you/.test(firstRowText) && /Person Identifier/.test(firstRowText) && firstRowText.includes(addedQualifierText), firstRowText.slice(0, 120));
	check('…and its result now says "✓ In your list"', /In your list/.test(await studentIdResult.innerText()));
	await rowLocator().nth(0).locator('[data-testid="rater-best-radio"]').check();
	await page.click('[data-testid="rater-save"]');
	await waitForItem(5);
	check('item 4 saved with the searched card as Best; item 5 opens', true);

	// ---------------------------------------------------------------- T4.1 (4) item 5: browse Person → Person Identification, add a card
	await page.click('[data-testid="rater-tab-browse"]');
	await page.locator('[data-testid="rater-browse-concept"]').first().waitFor({ timeout: 20000 });
	const conceptCount = await page.locator('[data-testid="rater-browse-concept"]').count();
	check(`Browse shows the 8 concepts (${conceptCount})`, conceptCount === 8);
	await page.locator('[data-testid="rater-browse-concept"]', { hasText: 'Person' }).first().click();
	await page.locator('[data-testid="rater-browse-class"]', { hasText: 'Person Identification' }).first().click();
	await page.locator('[data-testid="rater-browse-property"]').first().waitFor({ timeout: 20000 });
	await page.screenshot({ path: shotPath('08-browse-person-identification') });
	const browseCard = page.locator('[data-testid="rater-browse-property"]', { has: page.locator('[data-testid="rater-add-card"]') }).first();
	const browsePropertyText = (await browseCard.locator('.rt-property').innerText()).trim();
	await browseCard.locator('[data-testid="rater-add-card"]').click();
	const browseTopText = await rowLocator().nth(0).innerText();
	check(`the browsed card (${browsePropertyText}) joins the top of the list, marked "Added by you"`, /Added by you/.test(browseTopText) && browseTopText.includes(browsePropertyText), browseTopText.slice(0, 120));
	await rowLocator().nth(0).locator('[data-testid="rater-best-radio"]').check();
	await page.click('[data-testid="rater-save"]');
	await waitForItem(6);
	check('item 5 saved with the browsed card as Best; item 6 opens', true);

	// ---------------------------------------------------------------- Claim's honest empty state
	await page.click('[data-testid="rater-tab-browse"]');
	await page.locator('[data-testid="rater-browse-concept"]', { hasText: 'Claim' }).first().click();
	await page.getByText('CEDS’s own structure, not a fault').waitFor({ timeout: 20000 });
	check('Browse → Claim shows the honest empty state', true);

	// ---------------------------------------------------------------- T4.1 (5) Previous back and change an answer
	await page.click('[data-testid="rater-previous"]');
	await waitForItem(5);
	const itemFiveTopText = await rowLocator().nth(0).innerText();
	check('Previous → item 5 still holds its added card, as Your Best', /Added by you/.test(itemFiveTopText) && /Your Best/.test(itemFiveTopText), itemFiveTopText.slice(0, 120));
	await page.click('[data-testid="rater-previous"]');
	await waitForItem(4);
	await page.check('[data-testid="rater-choice-noMatch"]');
	await page.click('[data-testid="rater-save"]');
	await waitForItem(5);
	check('item 4 changed to No match and saved', true);

	// ---------------------------------------------------------------- T4.1 (6) reload and see it persisted
	await page.goto(`${baseUrl}/rater/rate?item=4`);
	await waitForItem(4);
	check('after a reload the rater is still signed in (item 4 opens)', true);
	check('item 4 shows the changed answer (No match) after the reload', await page.isChecked('[data-testid="rater-choice-noMatch"]'));
	check('…and the summary says so', /No match in CEDS/.test(await page.locator('[data-testid="rater-answer-summary"]').innerText()));
	await page.screenshot({ path: shotPath('09-reload-item4-changed') });
	await page.goto(`${baseUrl}/rater/rate?item=1`);
	await waitForItem(1);
	const persistedBest = await page.locator(`[data-ceds-tuple-id="${itemOneBestTupleId}"] [data-testid="rater-best-radio"]`).isChecked();
	const persistedSame = await page.locator(`[data-ceds-tuple-id="${itemOneSameTupleId}"] [data-testid="rater-same-checkbox"]`).isChecked();
	check('item 1 after a reload: the same Best and the same Same', persistedBest && persistedSame);
	await page.goto(`${baseUrl}/rater/rate?item=3`);
	await waitForItem(3);
	check("item 3 after a reload: Unsure, with its note exactly (apostrophe single)", (await page.isChecked('[data-testid="rater-choice-unsure"]')) && (await page.inputValue('[data-testid="rater-note"]')) === "Two classes could fit and I can't tell which is meant.");

	// ---------------------------------------------------------------- T4.5 keyboard
	console.log('T4.5 keyboard');
	await page.goto(`${baseUrl}/rater/rate?item=6`);
	await waitForItem(6);
	await page.focus('[data-testid="rater-sign-out"]');
	const reachedKindSet = new Set();
	for (let tabCount = 0; tabCount < 400 && reachedKindSet.size < 7; tabCount++) {
		await page.keyboard.press('Tab');
		const focusedKind = await page.evaluate(() => {
			const focused = document.activeElement;
			return focused ? focused.dataset.testid || focused.tagName.toLowerCase() : '';
		});
		['rater-best-radio', 'rater-card-class', 'summary', 'rater-tab-search', 'rater-search-input', 'rater-note', 'rater-save'].forEach((kindName) => {
			if (focusedKind === kindName) {
				reachedKindSet.add(kindName);
			}
		});
	}
	check(`Tab reaches the Best radio, the class link, More about, the finder tab and search box, the note and Save (${Array.from(reachedKindSet).join(', ')})`, reachedKindSet.size === 7);
	await rowLocator().nth(0).locator('[data-testid="rater-best-radio"]').focus();
	await page.keyboard.press('Space');
	await page.keyboard.press('ArrowDown');
	const checkedAfterArrow = await page.evaluate(() => Array.from(document.querySelectorAll('input[name="best"]')).findIndex((radio) => radio.checked));
	check(`ArrowDown moves the Best choice to the next card (now card ${checkedAfterArrow + 1})`, checkedAfterArrow === 1);
	await rowLocator().nth(1).locator('[data-testid="rater-same-checkbox"]').evaluate(() => {});
	const ringShown = await page.evaluate(() => {
		const focused = document.activeElement;
		const style = window.getComputedStyle(focused);
		return { outline: style.outlineStyle, outlineWidth: style.outlineWidth, shadow: style.boxShadow };
	});
	await page.screenshot({ path: shotPath('10-keyboard-focus-ring') });
	check(`the focus ring shows (outline ${ringShown.outline} ${ringShown.outlineWidth}, halo ${ringShown.shadow.slice(0, 40)})`, ringShown.outline === 'solid' && ringShown.outlineWidth === '3px' && /255, 171, 64/.test(ringShown.shadow));

	// ---------------------------------------------------------------- the Instructions page
	await page.goto(`${baseUrl}/rater/instructions`);
	await page.locator('[data-testid="rater-instructions"]').waitFor();
	const instructionsText = await page.locator('[data-testid="rater-instructions"]').innerText();
	check('Instructions: the four worked examples and the attribution line', ['A clear match', 'No match in CEDS', 'More than one acceptable answer', 'The same name under the wrong class'].every((headText) => instructionsText.includes(headText)) && instructionsText.includes('Drafted with Milo for tqii; tqii will revise.'));
	await page.screenshot({ path: shotPath('11-instructions'), fullPage: true });
} catch (walkError) {
	check('the walkthrough ran to the end', false, walkError.message.split('\n')[0]);
	await page.screenshot({ path: shotPath('99-failure') }).catch(() => {});
} finally {
	await browser.close();
	console.log(`\n=== raterWalkthrough (Phase 4) — Results: ${passCount} passed, ${failCount} failed ===`);
	process.exit(failCount === 0 ? 0 : 1);
}
