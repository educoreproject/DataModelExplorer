// raterGroupLeadDefinition.spec.mjs — revision 15 browser gates (WORKORDER-RATER15): a property group states its
// property definition once, in the frame's lead, and the cards inside it repeat only their class. Driven through the
// admin preview (the raters' own rating screen, read-only), so it makes no raters and writes nothing. On a running site:
//   G15.1 on item N every frame holds ONE "Property: <definition>" line, after the lead and before its first card,
//         its text the group's definition, led by a bold label, in the cards' definition style
//   G15.2 every card inside a frame shows its title and "Class: <class definition>" and no Property line (nor its
//         toggle); radios, the CEDS ID and "More about this property" are still on the card
//   G15.3 every card outside a frame (a singleton) shows both lines, as before
//   G15.4 a long group definition is clamped to two lines in the lead with "Show the whole definition", which opens it
//         ("Show less") and clamps it again; a short one has no control
//   G15.5 a group whose definition is empty reads "Property: (none in CEDS)" in the lead, the parenthesis italic, no
//         control (every card of the item's first group has its definition blanked on the wire)
//   G15.6 the Finder's search results are not grouped: each result still shows both lines
// Raters' own pages, added cards and the preview-against-rater comparison are raterPropertyGroups' (B12.1, B12.4, B12.5).
//
//   node html/tests/rater/raterGroupLeadDefinition.spec.mjs --baseUrl=… --adminUserName=… --adminPasswordFile=<file>
//        --surveyName=B --itemNumber=46 --playwrightCorePath=… --chromePath=… --evidenceDir=…
// itemNumber must name an item with a group whose definition is long and a group whose definition is short (B 46, SIF
// CourseCreditsAttempted: Credits Attempted Cumulative ×3 is long, Number of Credits Earned ×7 is short).

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'adminUserName', 'adminPasswordFile', 'surveyName', 'itemNumber', 'playwrightCorePath', 'chromePath', 'evidenceDir'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`raterGroupLeadDefinition: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
const targetItemNumber = Number(argumentByName.itemNumber);
if (!Number.isInteger(targetItemNumber) || targetItemNumber < 2 || targetItemNumber > 50) {
	console.error(`raterGroupLeadDefinition: --itemNumber must be 2..50, got '${argumentByName.itemNumber}'`);
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const adminPassword = fs.readFileSync(argumentByName.adminPasswordFile, 'utf8').trim();
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
const surveyName = argumentByName.surveyName;
fs.mkdirSync(argumentByName.evidenceDir, { recursive: true });
const shotPath = (shotName) => path.join(argumentByName.evidenceDir, `${shotName}.png`);

const TAB_URL_PATTERN = /\/admin\/?\?tool=ceds-rater$/;
const LONG_DEFINITION_LENGTH = 200; // the definition line's own threshold (DefinitionLine.vue)
const ABSENT_CLASS_NOTICE = 'No class definition in CEDS.';
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
const classLineOf = (card) => normalizedText(`Class: ${card.classDefinition || ABSENT_CLASS_NOTICE}`);
const propertyLineOf = (card) => normalizedText(`Property: ${card.definition || ABSENT_PROPERTY_NOTICE}`);
const answerOf = (bodyJson) => (Array.isArray(bodyJson) ? bodyJson[0] : bodyJson);
// the property identity as the server makes it (card-property-identity.js): P-id plus sorted qualifiers, class ignored
const propertyIdentityOf = (card) => [card.cedsId].concat(card.qualifierNameList.slice().sort()).join('|');
// the payload's runs of two or more cards of one property, in order: [cardList]
const groupCardListListOf = (cardList) => cardList.reduce((soFar, card) => {
	const lastRun = soFar[soFar.length - 1];
	if (lastRun && propertyIdentityOf(lastRun[0]) === propertyIdentityOf(card)) {
		lastRun.push(card);
		return soFar;
	}
	return soFar.concat([[card]]);
}, []).filter((runCardList) => runCardList.length > 1);

const browser = await chromium.launch({ executablePath: argumentByName.chromePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const payloadByItemNumber = {};
const searchPayloadList = [];
page.on('response', async (response) => {
	if (!response.url().includes('/api/raterAdmin')) {
		return;
	}
	const requestBody = JSON.parse(response.request().postData() || '{}') || {};
	const bodyJson = await response.json().catch(() => null);
	if (!bodyJson) {
		return;
	}
	if (requestBody.adminAction === 'previewItem') {
		payloadByItemNumber[requestBody.itemNumber] = answerOf(bodyJson);
	}
	if (requestBody.adminAction === 'previewSearch') {
		searchPayloadList.push(answerOf(bodyJson));
	}
});

const waitForPreviewItem = async (itemNumber) => {
	await page.waitForURL(previewUrlPatternOf(itemNumber), { timeout: 20000 });
	await page.waitForFunction((expectedNumber) => {
		const crumb = document.querySelector('[data-testid="rater-item-crumb"]');
		return crumb && crumb.textContent.includes(`Item ${expectedNumber} of`) && document.querySelectorAll('[data-testid="rater-candidate-row"]').length > 0;
	}, itemNumber, { timeout: 20000 });
};

// the list as the browser draws it: each frame's lead and definition lines, each card's lines and where it sits
const readGroupLayout = () => page.evaluate(() => {
	const styleOf = (element) => {
		const computed = getComputedStyle(element);
		return { color: computed.color, fontSize: computed.fontSize, fontWeight: computed.fontWeight, fontStyle: computed.fontStyle };
	};
	const textOf = (element) => (element ? element.textContent.replace(/\s+/g, ' ').trim() : null);
	const follows = (laterElement, earlierElement) => Boolean(laterElement && earlierElement && (earlierElement.compareDocumentPosition(laterElement) & Node.DOCUMENT_POSITION_FOLLOWING));
	const list = document.querySelector('[data-testid="rater-candidate-list"]');
	const frameElementList = Array.from(list.querySelectorAll('[data-testid="rater-property-group"]'));
	const frameList = frameElementList.map((frame) => {
		const lead = frame.querySelector('[data-testid="rater-property-group-lead"]');
		const definitionList = Array.from(frame.querySelectorAll('[data-testid="rater-property-group-definition"]'));
		const firstRow = frame.querySelector('[data-testid="rater-candidate-row"]');
		const labelElement = definitionList[0] && definitionList[0].querySelector('b');
		return {
			tupleIdList: Array.from(frame.querySelectorAll('[data-testid="rater-candidate-row"]')).map((row) => row.getAttribute('data-ceds-tuple-id')),
			leadText: textOf(lead),
			definitionCount: definitionList.length,
			definitionText: textOf(definitionList[0]),
			definitionAfterLead: follows(definitionList[0], lead),
			definitionBeforeFirstCard: follows(firstRow, definitionList[0]),
			definitionInsideCard: Boolean(definitionList[0] && definitionList[0].closest('article')),
			definitionStyle: definitionList[0] ? styleOf(definitionList[0]) : null,
			labelWeight: labelElement ? getComputedStyle(labelElement).fontWeight : '',
		};
	});
	const rowList = Array.from(list.querySelectorAll('[data-testid="rater-candidate-row"]')).map((row) => {
		const article = row.querySelector('article');
		const classElement = article.querySelector('[data-testid="rater-card-class-definition"]');
		return {
			cedsTupleId: row.getAttribute('data-ceds-tuple-id'),
			frameIndex: frameElementList.indexOf(row.closest('[data-testid="rater-property-group"]')),
			hasTitle: Boolean(article.querySelector('.rt-card-title')),
			classText: textOf(classElement),
			classAfterTitle: follows(classElement, article.querySelector('.rt-card-title')),
			propertyText: textOf(article.querySelector('[data-testid="rater-card-element-definition"]')),
			propertyToggleCount: article.querySelectorAll('[data-testid="rater-definition-toggle"]').length,
			hasBestRadio: Boolean(row.querySelector('[data-testid="rater-best-radio"]')),
			hasSameCheckbox: Boolean(row.querySelector('[data-testid="rater-same-checkbox"]')),
			hasCedsId: Boolean(article.querySelector('[data-testid="rater-card-ceds-id"]')),
			moreSummaryText: textOf(article.querySelector('details summary')),
			classStyle: classElement ? styleOf(classElement) : null,
		};
	});
	return { frameList, rowList };
});

// the clamp state of one frame's definition line
const readLeadClampState = (frameLocator) => frameLocator.evaluate((frame) => {
	const definitionElement = frame.querySelector('[data-testid="rater-property-group-definition"]');
	const toggleElement = frame.querySelector('[data-testid="rater-property-group-definition-toggle"]');
	if (!definitionElement) {
		return { isPresent: false };
	}
	const lineHeight = parseFloat(getComputedStyle(definitionElement).lineHeight);
	return {
		isPresent: true,
		isClamped: definitionElement.scrollHeight > definitionElement.clientHeight + 2,
		lineCount: Math.round(definitionElement.clientHeight / lineHeight),
		toggleText: toggleElement ? toggleElement.textContent.trim() : null,
		toggleExpanded: toggleElement ? toggleElement.getAttribute('aria-expanded') : null,
	};
});

try {
	// ---------------------------------------------------------------- open the preview at item N
	console.log(`G15.0 open survey ${surveyName} item ${targetItemNumber} in the preview`);
	await page.goto(`${baseUrl}/login?redirect=${encodeURIComponent('/admin?tool=ceds-rater')}`);
	await page.getByLabel('User Name').fill(argumentByName.adminUserName);
	await page.getByLabel('Password', { exact: true }).fill(adminPassword);
	await page.getByRole('button', { name: 'Login' }).click();
	await page.waitForURL(TAB_URL_PATTERN, { timeout: 20000 });
	await page.click(`[data-testid="rater-surveys-view-${surveyName}"]`);
	await page.click(`[data-testid="rater-surveys-item-preview-${targetItemNumber}"]`);
	await waitForPreviewItem(targetItemNumber);
	const itemPayload = payloadByItemNumber[targetItemNumber];
	const groupCardListList = groupCardListListOf(itemPayload.cardList);
	check(`item ${targetItemNumber}'s payload was read and has groups (${itemPayload.cardList.length} cards, ${groupCardListList.length} groups)`, itemPayload.cardList.length > 0 && groupCardListList.length > 0);
	const cardByTupleId = Object.fromEntries(itemPayload.cardList.map((card) => [card.cedsTupleId, card]));
	const groupLayout = await readGroupLayout();
	await page.locator('[data-testid="rater-property-group"]').first().scrollIntoViewIfNeeded();
	await page.screenshot({ path: shotPath('150-group-lead-definition') });

	// ---------------------------------------------------------------- G15.1 one definition per frame, in the lead
	console.log('G15.1 each frame states its property definition once, under the lead');
	check(`one frame per group (${groupLayout.frameList.length} frames, ${groupCardListList.length} groups)`, groupLayout.frameList.length === groupCardListList.length);
	const leadProblemList = groupCardListList.map((runCardList, runIndex) => {
		const frame = groupLayout.frameList[runIndex];
		if (!frame) {
			return `no frame for ${runCardList[0].propertyName}`;
		}
		if (frame.definitionCount !== 1) {
			return `${runCardList[0].propertyName}: ${frame.definitionCount} definition lines in the frame`;
		}
		if (frame.definitionText !== propertyLineOf(runCardList[0])) {
			return `${runCardList[0].propertyName}: '${(frame.definitionText || '').slice(0, 60)}' ≠ '${propertyLineOf(runCardList[0]).slice(0, 60)}'`;
		}
		if (!frame.definitionAfterLead || !frame.definitionBeforeFirstCard || frame.definitionInsideCard) {
			return `${runCardList[0].propertyName}: the definition is not between the lead and the first card`;
		}
		return '';
	}).filter(Boolean);
	check('each frame has exactly one "Property: <definition>" line, after its lead and before its first card, the text the group\'s', leadProblemList.length === 0, leadProblemList.slice(0, 3).join(' | '));
	check('each lead definition is led by a bold "Property:"', groupLayout.frameList.length > 0 && groupLayout.frameList.every((frame) => Number(frame.labelWeight) >= 600), groupLayout.frameList.map((frame) => frame.labelWeight).join(','));
	const cardClassStyle = (groupLayout.rowList.find((row) => row.classStyle) || {}).classStyle;
	check('the lead definition reads in the cards\' definition style (colour, size, weight, style)', groupLayout.frameList.length > 0 && groupLayout.frameList.every((frame) => JSON.stringify(frame.definitionStyle) === JSON.stringify(cardClassStyle)), JSON.stringify([groupLayout.frameList[0] && groupLayout.frameList[0].definitionStyle, cardClassStyle]));

	// ---------------------------------------------------------------- G15.2 grouped cards: class only
	console.log('G15.2 a card inside a frame shows its class and no Property line');
	const groupedRowList = groupLayout.rowList.filter((row) => row.frameIndex !== -1);
	const groupedProblemList = groupedRowList.map((row) => {
		const card = cardByTupleId[row.cedsTupleId];
		if (row.propertyText !== null || row.propertyToggleCount !== 0) {
			return `${card.className}: has a Property line '${(row.propertyText || '').slice(0, 40)}'`;
		}
		if (!row.hasTitle || row.classText !== classLineOf(card) || !row.classAfterTitle) {
			return `${card.className}: class line '${(row.classText || '').slice(0, 40)}'`;
		}
		return '';
	}).filter(Boolean);
	check(`all ${groupedRowList.length} grouped cards: title, then "Class: <class definition>", and no Property line`, groupedRowList.length > 0 && groupedProblemList.length === 0, groupedProblemList.slice(0, 3).join(' | '));
	check('the grouped cards keep their Best radio, Same checkbox and CEDS ID', groupedRowList.every((row) => row.hasBestRadio && row.hasSameCheckbox && row.hasCedsId));
	const optionSetRowList = groupedRowList.filter((row) => cardByTupleId[row.cedsTupleId].optionSetName);
	check(`grouped cards with an option set (${optionSetRowList.length}) keep "More about this property"`, optionSetRowList.every((row) => row.moreSummaryText === 'More about this property'));

	// ---------------------------------------------------------------- G15.3 singletons: both lines
	console.log('G15.3 a card outside a frame shows both lines');
	const singletonRowList = groupLayout.rowList.filter((row) => row.frameIndex === -1);
	const singletonProblemList = singletonRowList.filter((row) => {
		const card = cardByTupleId[row.cedsTupleId];
		return row.classText !== classLineOf(card) || row.propertyText !== propertyLineOf(card);
	});
	check(`all ${singletonRowList.length} singletons show "Class: …" and "Property: …"`, singletonRowList.length > 0 && singletonProblemList.length === 0, JSON.stringify(singletonProblemList.slice(0, 2).map((row) => row.propertyText)));

	// ---------------------------------------------------------------- G15.4 the lead's clamp and control
	console.log('G15.4 a long group definition: two lines and a more/less control in the lead');
	const longRunIndex = groupCardListList.findIndex((runCardList) => (runCardList[0].definition || '').length > LONG_DEFINITION_LENGTH);
	const shortRunIndex = groupCardListList.findIndex((runCardList) => (runCardList[0].definition || '').length > 0 && (runCardList[0].definition || '').length <= LONG_DEFINITION_LENGTH);
	check(`item ${targetItemNumber} has a group with a long definition and one with a short one`, longRunIndex !== -1 && shortRunIndex !== -1);
	const longFrameLocator = page.locator('[data-testid="rater-property-group"]').nth(longRunIndex);
	const closedState = await readLeadClampState(longFrameLocator);
	check(`closed: ${groupCardListList[longRunIndex][0].propertyName}'s definition shows two lines with "Show the whole definition"`, closedState.isPresent && closedState.isClamped && closedState.lineCount === 2 && closedState.toggleText === 'Show the whole definition' && closedState.toggleExpanded === 'false', JSON.stringify(closedState));
	await longFrameLocator.locator('[data-testid="rater-property-group-definition-toggle"]').click({ timeout: 5000 }).catch(() => null);
	const openState = await readLeadClampState(longFrameLocator);
	check('open: the whole definition shows; the control says "Show less"', openState.isPresent && !openState.isClamped && openState.lineCount > 2 && openState.toggleText === 'Show less' && openState.toggleExpanded === 'true', JSON.stringify(openState));
	await longFrameLocator.screenshot({ path: shotPath('151-group-lead-definition-open') });
	await longFrameLocator.locator('[data-testid="rater-property-group-definition-toggle"]').click({ timeout: 5000 }).catch(() => null);
	const reclosedState = await readLeadClampState(longFrameLocator);
	check('"Show less" clamps it to two lines again', reclosedState.isPresent && reclosedState.isClamped && reclosedState.lineCount === 2, JSON.stringify(reclosedState));
	const shortState = await readLeadClampState(page.locator('[data-testid="rater-property-group"]').nth(shortRunIndex));
	check(`a short group definition (${groupCardListList[shortRunIndex][0].propertyName}) shows whole, with no control`, shortState.isPresent && !shortState.isClamped && shortState.toggleText === null, JSON.stringify(shortState));

	// ---------------------------------------------------------------- G15.5 an empty group definition
	console.log('G15.5 an empty group definition reads Property: (none in CEDS) in the lead');
	let blankedRunCardList = [];
	await page.route('**/api/raterAdmin', async (route) => {
		const requestBody = JSON.parse(route.request().postData() || '{}') || {};
		if (requestBody.adminAction !== 'previewItem' || Number(requestBody.itemNumber) !== targetItemNumber) {
			await route.continue();
			return;
		}
		const fetchedResponse = await route.fetch();
		const bodyJson = await fetchedResponse.json();
		blankedRunCardList = groupCardListListOf(answerOf(bodyJson).cardList)[0];
		blankedRunCardList.forEach((card) => {
			card.definition = '';
		});
		await route.fulfill({ response: fetchedResponse, json: bodyJson });
	});
	await page.click('[data-testid="rater-previous"]');
	await waitForPreviewItem(targetItemNumber - 1);
	await page.click('[data-testid="rater-preview-next"]');
	await waitForPreviewItem(targetItemNumber);
	await page.unroute('**/api/raterAdmin');
	check(`the first group (${blankedRunCardList.length} cards) had its definitions blanked on the wire`, blankedRunCardList.length > 1);
	const blankedRead = await page.locator('[data-testid="rater-property-group"]').first().evaluate((frame) => {
		const definitionElement = frame.querySelector('[data-testid="rater-property-group-definition"]');
		const noticeElement = definitionElement && definitionElement.querySelector('[data-testid="rater-property-group-property-absent"]');
		const labelElement = definitionElement && definitionElement.querySelector('b');
		return {
			lineText: definitionElement ? definitionElement.textContent.replace(/\s+/g, ' ').trim() : null,
			noticeText: noticeElement ? noticeElement.textContent.trim() : null,
			noticeFontStyle: noticeElement ? getComputedStyle(noticeElement).fontStyle : null,
			labelFontStyle: labelElement ? getComputedStyle(labelElement).fontStyle : null,
			toggleCount: frame.querySelectorAll('[data-testid="rater-property-group-definition-toggle"]').length,
			cardPropertyLineCount: frame.querySelectorAll('[data-testid="rater-card-element-definition"]').length,
		};
	});
	check(`the blanked group's lead reads "Property: ${ABSENT_PROPERTY_NOTICE}", the parenthesis italic, the label not, no control, and its cards still have no Property line`, blankedRead.lineText === `Property: ${ABSENT_PROPERTY_NOTICE}` && blankedRead.noticeText === ABSENT_PROPERTY_NOTICE && blankedRead.noticeFontStyle === 'italic' && blankedRead.labelFontStyle === 'normal' && blankedRead.toggleCount === 0 && blankedRead.cardPropertyLineCount === 0, JSON.stringify(blankedRead));
	await page.locator('[data-testid="rater-property-group"]').first().screenshot({ path: shotPath('152-group-lead-property-absent') });

	// ---------------------------------------------------------------- G15.6 Finder results are not grouped
	console.log('G15.6 search results still show both lines');
	await page.click('[data-testid="rater-open-search"]');
	await page.fill('[data-testid="rater-search-input"]', groupCardListList[0][0].cedsId);
	await page.click('[data-testid="rater-search-submit"]');
	await page.locator('[data-testid="rater-search-result"]').first().waitFor({ timeout: 20000 });
	const searchCardList = (searchPayloadList[searchPayloadList.length - 1] || {}).cardList || [];
	const resultRead = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="rater-search-result"]')).map((result) => ({
		cedsTupleId: result.getAttribute('data-ceds-tuple-id'),
		classText: (result.querySelector('[data-testid="rater-card-class-definition"]') || {}).textContent,
		propertyText: (result.querySelector('[data-testid="rater-card-element-definition"]') || {}).textContent,
	})));
	const searchCardByTupleId = Object.fromEntries(searchCardList.map((card) => [card.cedsTupleId, card]));
	const resultProblemList = resultRead.filter((result) => !searchCardByTupleId[result.cedsTupleId] || normalizedText(result.classText) !== classLineOf(searchCardByTupleId[result.cedsTupleId]) || normalizedText(result.propertyText) !== propertyLineOf(searchCardByTupleId[result.cedsTupleId]));
	check(`CEDS ID search ${groupCardListList[0][0].cedsId}: all ${resultRead.length} results show "Class: …" and "Property: …"`, resultRead.length > 1 && resultProblemList.length === 0, JSON.stringify(resultProblemList.slice(0, 2)));
	await page.locator('[data-testid="rater-search-results"]').screenshot({ path: shotPath('153-search-results-both-lines') });
} catch (walkError) {
	check('the group-lead walkthrough ran to the end', false, `${walkError && walkError.message}`.split('\n')[0]);
	await page.screenshot({ path: shotPath('159-group-lead-failure') }).catch(() => {});
} finally {
	await browser.close();
}

console.log(`\n=== raterGroupLeadDefinition (revision 15 browser) — Results: ${passCount} passed, ${failCount} failed ===`);
process.exit(failCount === 0 ? 0 : 1);
