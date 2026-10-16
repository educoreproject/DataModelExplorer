// raterPropertyLabels.spec.mjs — revision 11 browser gates (WORKORDER-RATER11): two labels on a CEDS card. Driven
// through the admin preview (the raters' own rating screen, read-only), so it makes no raters and writes nothing:
//   P11.1 a card's details control reads "More about this property"; no card says "More about this element"
//   P11.2 a candidate card whose property definition is empty reads "Property: (none in CEDS)", the parenthesis in
//         italic and the label not, with no show-all control (one card's definition is blanked on the wire); cards
//         with a definition carry no notice
//   P11.3 a Finder search result whose property definition is empty reads the same way (one result blanked on the wire)
//
//   node html/tests/rater/raterPropertyLabels.spec.mjs --baseUrl=… --adminUserName=… --adminPasswordFile=<file>
//        --surveyName=B --itemNumber=45 --playwrightCorePath=… --chromePath=… --evidenceDir=…
// itemNumber must name an item with at least one option-set card (B 45 has several).

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'adminUserName', 'adminPasswordFile', 'surveyName', 'itemNumber', 'playwrightCorePath', 'chromePath', 'evidenceDir'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`raterPropertyLabels: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
const targetItemNumber = Number(argumentByName.itemNumber);
if (!Number.isInteger(targetItemNumber) || targetItemNumber < 1 || targetItemNumber > 50) {
	console.error(`raterPropertyLabels: --itemNumber must be 1..50, got '${argumentByName.itemNumber}'`);
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const adminPassword = fs.readFileSync(argumentByName.adminPasswordFile, 'utf8').trim();
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
const surveyName = argumentByName.surveyName;
fs.mkdirSync(argumentByName.evidenceDir, { recursive: true });
const shotPath = (shotName) => path.join(argumentByName.evidenceDir, `${shotName}.png`);

const TAB_URL_PATTERN = /\/admin\/?\?tool=ceds-rater$/;
const MORE_SUMMARY_TEXT = 'More about this property';
const ABSENT_PROPERTY_NOTICE = '(none in CEDS)';
const previewUrlPatternOf = (itemNumber) => new RegExp(`/admin/?\\?tool=ceds-rater&view=preview&survey=${surveyName}&item=${itemNumber}$`);

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
const normalizedText = (rawText) => `${rawText || ''}`.replace(/\s+/g, ' ').trim();
const answerOf = (bodyJson) => (Array.isArray(bodyJson) ? bodyJson[0] : bodyJson);

const browser = await chromium.launch({ executablePath: argumentByName.chromePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// blank the first card's definition in the named preview answer, on the wire: the live data has no empty definition
const blankedCardByAdminAction = {};
await page.route('**/api/raterAdmin', async (route) => {
	const requestBody = JSON.parse(route.request().postData() || '{}') || {};
	if (!['previewItem', 'previewSearch'].includes(requestBody.adminAction)) {
		await route.continue();
		return;
	}
	const fetchedResponse = await route.fetch();
	const bodyJson = await fetchedResponse.json();
	const answer = answerOf(bodyJson);
	if (answer && Array.isArray(answer.cardList) && answer.cardList.length > 0) {
		answer.cardList[0].definition = '';
		blankedCardByAdminAction[requestBody.adminAction] = answer.cardList[0];
	}
	await route.fulfill({ response: fetchedResponse, json: bodyJson });
});

// one property line as the browser draws it: its text, the notice's text and style, the label's style, its toggle
const readPropertyLine = (cardLocator) => cardLocator.evaluate((cardElement) => {
	const lineElement = cardElement.querySelector('[data-testid="rater-card-element-definition"]');
	const noticeElement = lineElement && lineElement.querySelector('[data-testid="rater-card-property-absent"]');
	const labelElement = lineElement && lineElement.querySelector('b');
	return {
		lineText: lineElement ? lineElement.textContent.replace(/\s+/g, ' ').trim() : null,
		noticeText: noticeElement ? noticeElement.textContent.trim() : null,
		noticeFontStyle: noticeElement ? getComputedStyle(noticeElement).fontStyle : null,
		labelFontStyle: labelElement ? getComputedStyle(labelElement).fontStyle : null,
		toggleCount: cardElement.querySelectorAll('[data-testid="rater-definition-toggle"]').length,
	};
});
const propertyLineIsAbsentNotice = (propertyLine) => propertyLine.lineText === `Property: ${ABSENT_PROPERTY_NOTICE}` && propertyLine.noticeText === ABSENT_PROPERTY_NOTICE && propertyLine.noticeFontStyle === 'italic' && propertyLine.labelFontStyle === 'normal' && propertyLine.toggleCount === 0;

try {
	// ---------------------------------------------------------------- open the preview at item N
	console.log(`P11.0 open survey ${surveyName} item ${targetItemNumber} in the preview`);
	await page.goto(`${baseUrl}/login?redirect=${encodeURIComponent('/admin?tool=ceds-rater')}`);
	await page.getByLabel('User Name').fill(argumentByName.adminUserName);
	await page.getByLabel('Password', { exact: true }).fill(adminPassword);
	await page.getByRole('button', { name: 'Login' }).click();
	await page.waitForURL(TAB_URL_PATTERN, { timeout: 20000 });
	await page.click(`[data-testid="rater-surveys-view-${surveyName}"]`);
	await page.click(`[data-testid="rater-surveys-item-preview-${targetItemNumber}"]`);
	await page.waitForURL(previewUrlPatternOf(targetItemNumber), { timeout: 20000 });
	await page.waitForFunction(() => document.querySelectorAll('[data-testid="rater-candidate-row"]').length > 0, null, { timeout: 20000 });
	const blankedItemCard = blankedCardByAdminAction.previewItem;
	check(`item ${targetItemNumber}'s first card had its definition blanked on the wire`, Boolean(blankedItemCard));

	// ---------------------------------------------------------------- P11.1 the details control
	console.log('P11.1 the details control names the property');
	const summaryTextList = await page.locator('[data-testid="rater-candidate-row"] details summary').allInnerTexts();
	check(`item ${targetItemNumber} has cards with a details control (${summaryTextList.length})`, summaryTextList.length > 0);
	check(`every details control reads "${MORE_SUMMARY_TEXT}"`, summaryTextList.length > 0 && summaryTextList.every((summaryText) => summaryText.trim() === MORE_SUMMARY_TEXT), JSON.stringify([...new Set(summaryTextList)]));
	check('no card on the page says "More about this element"', !(await page.locator('[data-testid="rater-candidate-list"]').innerText()).includes('More about this element'));

	// ---------------------------------------------------------------- P11.2 an empty property definition on a card
	console.log('P11.2 an empty property definition reads Property: (none in CEDS), the parenthesis italic');
	const blankedRowLocator = page.locator(`[data-testid="rater-candidate-row"][data-ceds-tuple-id="${blankedItemCard.cedsTupleId}"]`);
	const blankedRowLine = await readPropertyLine(blankedRowLocator);
	check(`the blanked card (${blankedItemCard.className} → ${blankedItemCard.propertyName}) reads "Property: ${ABSENT_PROPERTY_NOTICE}", the parenthesis italic, the label not, no show-all control`, propertyLineIsAbsentNotice(blankedRowLine), JSON.stringify(blankedRowLine));
	await blankedRowLocator.screenshot({ path: shotPath('110-property-absent-card') });
	const otherNoticeCount = await page.locator(`[data-testid="rater-candidate-row"]:not([data-ceds-tuple-id="${blankedItemCard.cedsTupleId}"]) [data-testid="rater-card-property-absent"]`).count();
	check('cards with a property definition carry no notice', otherNoticeCount === 0, `${otherNoticeCount} notices`);
	const classLineText = normalizedText(await blankedRowLocator.locator('[data-testid="rater-card-class-definition"]').innerText());
	check('the class line keeps its own text (the class definition, or its notice)', classLineText === normalizedText(`Class: ${blankedItemCard.classDefinition || 'No class definition in CEDS.'}`), classLineText.slice(0, 80));

	// ---------------------------------------------------------------- P11.3 the same in the Finder's search results
	console.log('P11.3 a search result with an empty property definition reads the same way');
	await page.click('[data-testid="rater-open-search"]');
	await page.fill('[data-testid="rater-search-input"]', 'credits earned');
	await page.locator('[data-testid="rater-search-mode-words"]').check({ force: true });
	await page.click('[data-testid="rater-search-submit"]');
	await page.locator('[data-testid="rater-search-result"]').first().waitFor({ timeout: 20000 });
	const blankedSearchCard = blankedCardByAdminAction.previewSearch;
	check('the first search result had its definition blanked on the wire', Boolean(blankedSearchCard));
	const resultLocator = page.locator('[data-testid="rater-search-result"]').filter({ hasText: blankedSearchCard.className }).filter({ hasText: blankedSearchCard.propertyName }).first();
	const resultLine = await readPropertyLine(resultLocator);
	check(`the blanked result (${blankedSearchCard.className} → ${blankedSearchCard.propertyName}) reads "Property: ${ABSENT_PROPERTY_NOTICE}", italic, no control`, propertyLineIsAbsentNotice(resultLine), JSON.stringify(resultLine));
	await resultLocator.screenshot({ path: shotPath('111-property-absent-search-result') });
} catch (walkError) {
	check('the property-labels walkthrough ran to the end', false, `${walkError && walkError.message}`.split('\n')[0]);
	await page.screenshot({ path: shotPath('119-property-labels-failure') }).catch(() => {});
} finally {
	await browser.close();
}

console.log(`\n=== raterPropertyLabels (revision 11 browser) — Results: ${passCount} passed, ${failCount} failed ===`);
process.exit(failCount === 0 ? 0 : 1);
