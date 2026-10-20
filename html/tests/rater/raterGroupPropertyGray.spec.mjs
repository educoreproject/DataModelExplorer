// raterGroupPropertyGray.spec.mjs — revision 15 browser gates (WORKORDER-RATER15, as amended by TQ 2026-10-18: "I want
// both the class and the property on all of them though I wouldn't mind making the repeated class distinguishable by
// make it gray"). Inside a property group the Property line, identical on every card of the group, is gray, label
// included, so the Class line that tells the cards apart stands out. Driven through the admin preview (the raters' own
// rating screen, read-only), so it makes no raters and writes nothing. On a running site:
//   G15.1 each frame's lead is revision 12's text alone: no definition line in the frame outside its cards
//   G15.2 every card inside a frame shows its title, "Class: <class definition>" and "Property: <definition>"; the
//         Property line and its label are gray (#6B7280); the Class line keeps the full colour
//   G15.3 every card outside a frame (a singleton) shows both lines in the full colour
//   G15.4 a grouped card's long Property line keeps its two-line clamp and its "Show the whole definition" control
//   G15.5 a grouped card whose definition is empty reads "Property: (none in CEDS)", italic, gray (the item's first group
//         has its definitions blanked on the wire)
//   G15.6 the Finder's search results are not grouped: both lines, full colour
// Raters' own pages, added cards and the preview-against-rater comparison are raterPropertyGroups' (B12.1, B12.4, B12.5).
//
//   node html/tests/rater/raterGroupPropertyGray.spec.mjs --baseUrl=… --adminUserName=… --adminPasswordFile=<file>
//        --surveyName=B --itemNumber=46 --playwrightCorePath=… --chromePath=… --evidenceDir=…
// itemNumber must be 2..50 and name an item with a group whose definition is long (B 46, SIF CourseCreditsAttempted:
// Credits Attempted Cumulative ×3).

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'adminUserName', 'adminPasswordFile', 'surveyName', 'itemNumber', 'playwrightCorePath', 'chromePath', 'evidenceDir'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`raterGroupPropertyGray: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
const targetItemNumber = Number(argumentByName.itemNumber);
if (!Number.isInteger(targetItemNumber) || targetItemNumber < 2 || targetItemNumber > 50) {
	console.error(`raterGroupPropertyGray: --itemNumber must be 2..50, got '${argumentByName.itemNumber}'`);
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
const REPEATED_LINE_COLOUR = 'rgb(107, 114, 128)'; // #6B7280, ONYX_CANVAS's relay of TQ's "gray or something"
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
// each response body is read asynchronously; a payload is read only after every pending body has landed (deploy 101926 race)
const pendingResponseReadSet = new Set();
const recordResponse = async (response) => {
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
};
page.on('response', (response) => {
	const responseRead = recordResponse(response);
	pendingResponseReadSet.add(responseRead);
	responseRead.finally(() => pendingResponseReadSet.delete(responseRead)).catch(() => {});
});

const waitForPreviewItem = async (itemNumber) => {
	await page.waitForURL(previewUrlPatternOf(itemNumber), { timeout: 20000 });
	await page.waitForFunction((expectedNumber) => {
		const crumb = document.querySelector('[data-testid="rater-item-crumb"]');
		return crumb && crumb.textContent.includes(`Item ${expectedNumber} of`) && document.querySelectorAll('[data-testid="rater-candidate-row"]').length > 0;
	}, itemNumber, { timeout: 20000 });
	await Promise.all([...pendingResponseReadSet]);
};

// each card's two lines with their colours, inside a root; and each frame's lead and anything else it holds
const readCardLineList = (rootSelector, cardSelector) => page.evaluate(({ rootSelector, cardSelector }) => {
	const textOf = (element) => (element ? element.textContent.replace(/\s+/g, ' ').trim() : null);
	const colourOf = (element) => (element ? getComputedStyle(element).color : null);
	const frameElementList = Array.from(document.querySelectorAll('[data-testid="rater-property-group"]'));
	return Array.from(document.querySelectorAll(`${rootSelector} ${cardSelector}`)).map((cardElement) => {
		const classElement = cardElement.querySelector('[data-testid="rater-card-class-definition"]');
		const propertyElement = cardElement.querySelector('[data-testid="rater-card-element-definition"]');
		const noticeElement = propertyElement && propertyElement.querySelector('[data-testid="rater-card-property-absent"]');
		return {
			cedsTupleId: cardElement.getAttribute('data-ceds-tuple-id'),
			frameIndex: frameElementList.indexOf(cardElement.closest('[data-testid="rater-property-group"]')),
			hasTitle: Boolean(cardElement.querySelector('.rt-card-title')),
			classText: textOf(classElement),
			classColour: colourOf(classElement),
			classLabelColour: colourOf(classElement && classElement.querySelector('b')),
			propertyText: textOf(propertyElement),
			propertyColour: colourOf(propertyElement),
			propertyLabelColour: colourOf(propertyElement && propertyElement.querySelector('b')),
			propertyAfterClass: Boolean(classElement && propertyElement && (classElement.compareDocumentPosition(propertyElement) & Node.DOCUMENT_POSITION_FOLLOWING)),
			noticeText: textOf(noticeElement),
			noticeFontStyle: noticeElement ? getComputedStyle(noticeElement).fontStyle : null,
			noticeColour: colourOf(noticeElement),
		};
	});
}, { rootSelector, cardSelector });
const readFrameList = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="rater-property-group"]')).map((frame) => {
	const lead = frame.querySelector('[data-testid="rater-property-group-lead"]');
	// what the frame holds beside its lead and its rows: revision 12 has nothing else
	const otherChildList = Array.from(frame.children).filter((child) => child !== lead && !child.matches('[data-testid="rater-candidate-row"]'));
	return {
		leadText: lead ? lead.textContent.replace(/\s+/g, ' ').trim() : null,
		otherChildCount: otherChildList.length,
		propertyLineOutsideCards: Array.from(frame.querySelectorAll('p, div')).filter((element) => !element.closest('article') && /^\s*Property:/.test(element.textContent)).length,
	};
}));

// the clamp state of one card's Property line
const readClampState = (cardLocator) => cardLocator.evaluate((cardElement) => {
	const definitionElement = cardElement.querySelector('[data-testid="rater-card-element-definition"]');
	const toggleElement = cardElement.querySelector('[data-testid="rater-definition-toggle"]');
	if (!definitionElement) {
		return { isPresent: false };
	}
	const lineHeight = parseFloat(getComputedStyle(definitionElement).lineHeight);
	return {
		isPresent: true,
		isClamped: definitionElement.scrollHeight > definitionElement.clientHeight + 2,
		lineCount: Math.round(definitionElement.clientHeight / lineHeight),
		toggleText: toggleElement ? toggleElement.textContent.trim() : null,
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
	const cardLineList = await readCardLineList('[data-testid="rater-candidate-list"]', '[data-testid="rater-candidate-row"]');
	await page.locator('[data-testid="rater-property-group"]').first().scrollIntoViewIfNeeded();
	await page.screenshot({ path: shotPath('150-group-property-gray') });

	// ---------------------------------------------------------------- G15.1 the lead is revision 12's
	console.log('G15.1 each frame\'s lead is its revision 12 text, with no definition beside it');
	const frameList = await readFrameList();
	const leadProblemList = groupCardListList.map((runCardList, runIndex) => {
		const frame = frameList[runIndex];
		const wantedLead = `${runCardList[0].propertyName}${runCardList[0].qualifierNameList.length ? ` (${runCardList[0].qualifierNameList.join(', ')})` : ''}, in ${runCardList.length} classes`;
		if (!frame) {
			return `no frame for ${wantedLead}`;
		}
		return frame.leadText === wantedLead && frame.otherChildCount === 0 && frame.propertyLineOutsideCards === 0 ? '' : `'${frame.leadText}' (wanted '${wantedLead}'), ${frame.otherChildCount} other children, ${frame.propertyLineOutsideCards} Property lines outside cards`;
	}).filter(Boolean);
	check(`${frameList.length} frames: each lead reads "<property>, in N classes" and the frame holds only its lead and its cards`, frameList.length === groupCardListList.length && leadProblemList.length === 0, leadProblemList.slice(0, 3).join(' | '));

	// ---------------------------------------------------------------- G15.2 grouped cards: both lines, Property gray
	console.log('G15.2 a card inside a frame shows both lines; the Property line is gray');
	const fullColourLine = cardLineList.find((cardLine) => cardLine.frameIndex === -1) || {};
	const groupedLineList = cardLineList.filter((cardLine) => cardLine.frameIndex !== -1);
	const groupedTextProblemList = groupedLineList.filter((cardLine) => {
		const card = cardByTupleId[cardLine.cedsTupleId];
		return !cardLine.hasTitle || cardLine.classText !== classLineOf(card) || cardLine.propertyText !== propertyLineOf(card) || !cardLine.propertyAfterClass;
	});
	check(`all ${groupedLineList.length} grouped cards: title, "Class: …", then "Property: …", texts equal to the payload`, groupedLineList.length > 0 && groupedTextProblemList.length === 0, JSON.stringify(groupedTextProblemList.slice(0, 2).map((cardLine) => [cardLine.classText, cardLine.propertyText])));
	check(`their Property line and its label are gray (${REPEATED_LINE_COLOUR})`, groupedLineList.length > 0 && groupedLineList.every((cardLine) => cardLine.propertyColour === REPEATED_LINE_COLOUR && cardLine.propertyLabelColour === REPEATED_LINE_COLOUR), JSON.stringify([...new Set(groupedLineList.map((cardLine) => `${cardLine.propertyColour} / ${cardLine.propertyLabelColour}`))]));
	check('their Class line keeps the full colour (the colours of a singleton\'s Class line)', groupedLineList.length > 0 && groupedLineList.every((cardLine) => cardLine.classColour === fullColourLine.classColour && cardLine.classLabelColour === fullColourLine.classLabelColour), JSON.stringify([groupedLineList[0] && groupedLineList[0].classColour, fullColourLine.classColour]));

	// ---------------------------------------------------------------- G15.3 singletons: both lines, full colour
	console.log('G15.3 a card outside a frame shows both lines in the full colour');
	const singletonLineList = cardLineList.filter((cardLine) => cardLine.frameIndex === -1);
	const singletonProblemList = singletonLineList.filter((cardLine) => {
		const card = cardByTupleId[cardLine.cedsTupleId];
		return cardLine.classText !== classLineOf(card) || cardLine.propertyText !== propertyLineOf(card) || cardLine.propertyColour !== cardLine.classColour || cardLine.propertyLabelColour !== cardLine.classLabelColour || cardLine.propertyColour === REPEATED_LINE_COLOUR;
	});
	check(`all ${singletonLineList.length} singletons: both lines, the Property line the same colour as the Class line (not gray)`, singletonLineList.length > 0 && singletonProblemList.length === 0, JSON.stringify(singletonProblemList.slice(0, 2).map((cardLine) => [cardLine.propertyColour, cardLine.classColour])));

	// ---------------------------------------------------------------- G15.4 the gray line keeps its clamp
	console.log('G15.4 a grouped card\'s long Property line keeps its clamp and control');
	const longRunCardList = groupCardListList.find((runCardList) => (runCardList[0].definition || '').length > LONG_DEFINITION_LENGTH);
	check(`item ${targetItemNumber} has a group with a long definition`, Boolean(longRunCardList));
	const longCardLocator = page.locator(`[data-testid="rater-candidate-row"][data-ceds-tuple-id="${longRunCardList[0].cedsTupleId}"]`);
	const closedState = await readClampState(longCardLocator);
	await longCardLocator.locator('[data-testid="rater-definition-toggle"]').click({ timeout: 5000 }).catch(() => null);
	const openState = await readClampState(longCardLocator);
	await longCardLocator.screenshot({ path: shotPath('151-group-property-gray-open') });
	await longCardLocator.locator('[data-testid="rater-definition-toggle"]').click({ timeout: 5000 }).catch(() => null);
	check(`${longRunCardList[0].className} → ${longRunCardList[0].propertyName}: two lines with "Show the whole definition", opens to "Show less"`, closedState.isPresent && closedState.isClamped && closedState.lineCount === 2 && closedState.toggleText === 'Show the whole definition' && !openState.isClamped && openState.toggleText === 'Show less', JSON.stringify([closedState, openState]));

	// ---------------------------------------------------------------- G15.5 an empty definition in a group
	console.log('G15.5 an empty definition in a group reads Property: (none in CEDS), italic and gray');
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
	const blankedTupleIdSet = new Set(blankedRunCardList.map((card) => card.cedsTupleId));
	const blankedLineList = (await readCardLineList('[data-testid="rater-candidate-list"]', '[data-testid="rater-candidate-row"]')).filter((cardLine) => blankedTupleIdSet.has(cardLine.cedsTupleId));
	check(`the ${blankedLineList.length} blanked grouped cards read "Property: ${ABSENT_PROPERTY_NOTICE}", the notice italic, the line gray`, blankedLineList.length === blankedRunCardList.length && blankedLineList.every((cardLine) => cardLine.propertyText === `Property: ${ABSENT_PROPERTY_NOTICE}` && cardLine.noticeText === ABSENT_PROPERTY_NOTICE && cardLine.noticeFontStyle === 'italic' && cardLine.noticeColour === REPEATED_LINE_COLOUR && cardLine.propertyLabelColour === REPEATED_LINE_COLOUR), JSON.stringify(blankedLineList[0]));
	await page.locator('[data-testid="rater-property-group"]').first().screenshot({ path: shotPath('152-group-property-absent-gray') });

	// ---------------------------------------------------------------- G15.6 Finder results are not grouped
	console.log('G15.6 search results show both lines in the full colour');
	await page.click('[data-testid="rater-open-search"]');
	await page.fill('[data-testid="rater-search-input"]', groupCardListList[0][0].cedsId);
	await page.click('[data-testid="rater-search-submit"]');
	await page.locator('[data-testid="rater-search-result"]').first().waitFor({ timeout: 20000 });
	const searchCardByTupleId = Object.fromEntries(((searchPayloadList[searchPayloadList.length - 1] || {}).cardList || []).map((card) => [card.cedsTupleId, card]));
	const resultLineList = await readCardLineList('[data-testid="rater-search-results"]', '[data-testid="rater-search-result"]');
	const resultProblemList = resultLineList.filter((cardLine) => {
		const card = searchCardByTupleId[cardLine.cedsTupleId];
		return !card || cardLine.classText !== classLineOf(card) || cardLine.propertyText !== propertyLineOf(card) || cardLine.propertyColour === REPEATED_LINE_COLOUR || cardLine.propertyColour !== cardLine.classColour;
	});
	check(`CEDS ID search ${groupCardListList[0][0].cedsId}: all ${resultLineList.length} results show both lines, neither gray`, resultLineList.length > 1 && resultProblemList.length === 0, JSON.stringify(resultProblemList.slice(0, 2)));
	await page.locator('[data-testid="rater-search-results"]').screenshot({ path: shotPath('153-search-results-full-colour') });
} catch (walkError) {
	check('the group-property walkthrough ran to the end', false, `${walkError && walkError.message}`.split('\n')[0]);
	await page.screenshot({ path: shotPath('159-group-property-failure') }).catch(() => {});
} finally {
	await browser.close();
}

console.log(`\n=== raterGroupPropertyGray (revision 15 browser) — Results: ${passCount} passed, ${failCount} failed ===`);
process.exit(failCount === 0 ? 0 : 1);
