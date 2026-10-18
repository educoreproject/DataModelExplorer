// raterClassDefinition.spec.mjs — revision 9 browser gates (WORKORDER-RATER9): a card shows its class definition on its
// face, BEFORE the element's definition, wherever the card appears. Driven through the admin preview (the raters' own
// rating screen, read-only), so it makes no raters and writes nothing. On a running site, with a main-site admin:
//   C9.1 on item N every candidate card reads: title, then "<class>: <class definition>", then "<element>:
//        <definition>", each text equal to the item's payload; the two definitions have the same weight, size, colour
//   C9.2 a class definition over the long-definition length is clamped to two lines with a "Show the whole class
//        definition" control that expands it and "Show less" that clamps it again; a short one has no control
//   C9.3 the element definition keeps its own clamp and toggle
//   C9.4 cards that share an element name (eg Number of Credits Earned) show their own, distinct class definitions
//   C9.5 "More about this property" no longer repeats the class; the option set is still there, and a card with no
//        option set has no empty disclosure (checked on items N and N-1; B 45 has option sets)
//   C9.6 a card with no class definition shows "No class definition in CEDS." (one card's classDefinition is blanked
//        on the wire for item N-1, the page's own handling of an absent value)
//   C9.7 Finder: words, meaning and CEDS ID search results read the same way (class before element, texts equal to
//        the search payload); the class-browse view keeps its banner and its cards carry no class definition
//   C9.8 a search result's class name switches to the Browse tab and shows that class (a revision 9 fix)
// Revision 15: a card inside a property group's frame shows its class line only (the frame's lead states the property
// once), so C9.1 expects no element line there, and C9.3 finds a grouped card's element clamp in its frame's lead.
//
//   node html/tests/rater/raterClassDefinition.spec.mjs --baseUrl=… --adminUserName=… --adminPasswordFile=<file>
//        --surveyName=B --itemNumber=46 --playwrightCorePath=… --chromePath=… --evidenceDir=…
// itemNumber must be 2..50 and name an item with a long class definition (B 46, SIF CourseCreditsAttempted, has two).

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'adminUserName', 'adminPasswordFile', 'surveyName', 'itemNumber', 'playwrightCorePath', 'chromePath', 'evidenceDir'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`raterClassDefinition: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
const targetItemNumber = Number(argumentByName.itemNumber);
if (!Number.isInteger(targetItemNumber) || targetItemNumber < 2 || targetItemNumber > 50) {
	console.error(`raterClassDefinition: --itemNumber must be 2..50, got '${argumentByName.itemNumber}'`);
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const adminPassword = fs.readFileSync(argumentByName.adminPasswordFile, 'utf8').trim();
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
const surveyName = argumentByName.surveyName;
fs.mkdirSync(argumentByName.evidenceDir, { recursive: true });
const shotPath = (shotName) => path.join(argumentByName.evidenceDir, `${shotName}.png`);

const TAB_URL_PATTERN = /\/admin\/?\?tool=ceds-rater$/;
const LONG_DEFINITION_LENGTH = 200; // the card's own threshold (CardDefinitions.vue)
const ABSENT_CLASS_NOTICE = 'No class definition in CEDS.';
const ABSENT_PROPERTY_NOTICE = '(none in CEDS)'; // revision 11
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
const elementLineOf = (card) => normalizedText(`Property: ${card.definition || ABSENT_PROPERTY_NOTICE}`);
const answerOf = (bodyJson) => (Array.isArray(bodyJson) ? bodyJson[0] : bodyJson);

const browser = await chromium.launch({ executablePath: argumentByName.chromePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// the payloads the page was given, by preview action: the truth each card's text is checked against
const payloadByItemNumber = {};
const searchPayloadList = [];
page.on('response', async (response) => {
	if (!response.url().includes('/api/raterAdmin')) {
		return;
	}
	const requestBody = JSON.parse(response.request().postData() || '{}') || {};
	if (!['previewItem', 'previewSearch'].includes(requestBody.adminAction)) {
		return;
	}
	const bodyJson = await response.json().catch(() => null);
	if (!bodyJson) {
		return;
	}
	if (requestBody.adminAction === 'previewItem') {
		payloadByItemNumber[requestBody.itemNumber] = answerOf(bodyJson);
		return;
	}
	searchPayloadList.push({ requestBody, answer: answerOf(bodyJson) });
});

const mainLoginInBrowser = async (userName, password) => {
	await page.getByLabel('User Name').fill(userName);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Login' }).click();
};
const waitForPreviewItem = async (itemNumber) => {
	await page.waitForURL(previewUrlPatternOf(itemNumber), { timeout: 20000 });
	await page.waitForFunction((expectedNumber) => {
		const crumb = document.querySelector('[data-testid="rater-item-crumb"]');
		return crumb && crumb.textContent.includes(`Item ${expectedNumber} of`) && document.querySelectorAll('[data-testid="rater-candidate-row"]').length > 0;
	}, itemNumber, { timeout: 20000 });
};

// one card's face as the browser draws it: the order of its parts and the texts and styles of its two definitions
const readCardFaceList = (rootSelector, cardSelector) => page.evaluate(({ rootSelector, cardSelector }) => {
	const styleOf = (element) => {
		const computed = getComputedStyle(element);
		return { color: computed.color, fontSize: computed.fontSize, fontWeight: computed.fontWeight, fontStyle: computed.fontStyle, opacity: computed.opacity };
	};
	return Array.from(document.querySelectorAll(`${rootSelector} ${cardSelector}`)).map((cardElement) => {
		const titleElement = cardElement.querySelector('.rt-card-title');
		const classElement = cardElement.querySelector('[data-testid="rater-card-class-definition"]');
		const elementElement = cardElement.querySelector('[data-testid="rater-card-element-definition"]');
		const follows = (laterElement, earlierElement) => Boolean(laterElement && earlierElement && (earlierElement.compareDocumentPosition(laterElement) & Node.DOCUMENT_POSITION_FOLLOWING));
		const moreElement = cardElement.querySelector('details');
		return {
			cedsTupleId: cardElement.getAttribute('data-ceds-tuple-id') || (cardElement.closest('[data-ceds-tuple-id]') || cardElement).getAttribute('data-ceds-tuple-id'),
			hasClassDefinition: Boolean(classElement),
			hasElementDefinition: Boolean(elementElement),
			inPropertyGroup: Boolean(cardElement.closest('[data-testid="rater-property-group"]')),
			classAfterTitle: follows(classElement, titleElement),
			elementAfterClass: follows(elementElement, classElement),
			classText: classElement ? classElement.textContent.replace(/\s+/g, ' ').trim() : '',
			elementText: elementElement ? elementElement.textContent.replace(/\s+/g, ' ').trim() : '',
			classStyle: classElement ? styleOf(classElement) : null,
			elementStyle: elementElement ? styleOf(elementElement) : null,
			classLeadWeight: classElement && classElement.querySelector('b') ? getComputedStyle(classElement.querySelector('b')).fontWeight : '',
			moreText: moreElement ? moreElement.textContent.replace(/\s+/g, ' ').trim() : null,
			moreTermList: moreElement ? Array.from(moreElement.querySelectorAll('dt')).map((termElement) => termElement.textContent.trim()) : [],
		};
	});
}, { rootSelector, cardSelector });

// the clamp state of one definition: clamped means it shows at most two lines and hides the rest
const readClampState = (cardLocator, definitionTestId, toggleTestId) => cardLocator.evaluate((cardElement, { definitionTestId, toggleTestId }) => {
	const definitionElement = cardElement.querySelector(`[data-testid="${definitionTestId}"]`);
	const toggleElement = cardElement.querySelector(`[data-testid="${toggleTestId}"]`);
	const lineHeight = parseFloat(getComputedStyle(definitionElement).lineHeight);
	return {
		isClamped: definitionElement.scrollHeight > definitionElement.clientHeight + 2,
		lineCount: Math.round(definitionElement.clientHeight / lineHeight),
		toggleText: toggleElement ? toggleElement.textContent.trim() : null,
		toggleExpanded: toggleElement ? toggleElement.getAttribute('aria-expanded') : null,
	};
}, { definitionTestId, toggleTestId });

const cardFaceProblemListOf = (cardFaceList, cardByTupleId) => {
	const problemList = [];
	cardFaceList.forEach((cardFace) => {
		const card = cardByTupleId[cardFace.cedsTupleId];
		if (!card) {
			problemList.push(`${cardFace.cedsTupleId}: not in the payload`);
			return;
		}
		if (cardFace.inPropertyGroup) {
			if (!cardFace.hasClassDefinition || cardFace.hasElementDefinition || !cardFace.classAfterTitle || cardFace.classText !== classLineOf(card)) {
				problemList.push(`${card.className} → ${card.propertyName} (in a group): class ${cardFace.hasClassDefinition}, element ${cardFace.hasElementDefinition}, class text '${cardFace.classText.slice(0, 40)}'`);
			}
			return;
		}
		if (!cardFace.hasClassDefinition || !cardFace.hasElementDefinition) {
			problemList.push(`${card.className} → ${card.propertyName}: class ${cardFace.hasClassDefinition}, element ${cardFace.hasElementDefinition}`);
			return;
		}
		if (!cardFace.classAfterTitle || !cardFace.elementAfterClass) {
			problemList.push(`${card.className} → ${card.propertyName}: order title→class ${cardFace.classAfterTitle}, class→element ${cardFace.elementAfterClass}`);
		}
		if (cardFace.classText !== classLineOf(card)) {
			problemList.push(`class text '${cardFace.classText.slice(0, 60)}' ≠ '${classLineOf(card).slice(0, 60)}'`);
		}
		if (cardFace.elementText !== elementLineOf(card)) {
			problemList.push(`element text '${cardFace.elementText.slice(0, 60)}' ≠ '${elementLineOf(card).slice(0, 60)}'`);
		}
	});
	return problemList;
};

try {
	// ---------------------------------------------------------------- open the preview at item N
	console.log(`C9.0 open survey ${surveyName} item ${targetItemNumber} in the preview`);
	await page.goto(`${baseUrl}/login?redirect=${encodeURIComponent('/admin?tool=ceds-rater')}`);
	await mainLoginInBrowser(argumentByName.adminUserName, adminPassword);
	await page.waitForURL(TAB_URL_PATTERN, { timeout: 20000 });
	await page.click(`[data-testid="rater-surveys-view-${surveyName}"]`);
	await page.click(`[data-testid="rater-surveys-item-preview-${targetItemNumber}"]`);
	await waitForPreviewItem(targetItemNumber);
	const itemPayload = payloadByItemNumber[targetItemNumber];
	check(`item ${targetItemNumber}'s payload was read (${itemPayload ? itemPayload.cardList.length : 0} cards)`, Boolean(itemPayload && itemPayload.cardList.length > 0));
	const cardByTupleId = Object.fromEntries(itemPayload.cardList.map((card) => [card.cedsTupleId, card]));
	await page.screenshot({ path: shotPath('90-class-definition-cards') });

	// ---------------------------------------------------------------- C9.1 the card face
	console.log('C9.1 class definition, then element definition, on every card');
	const cardFaceList = await readCardFaceList('[data-testid="rater-candidate-list"]', '[data-testid="rater-candidate-row"]');
	const faceProblemList = cardFaceProblemListOf(cardFaceList, cardByTupleId);
	check(`all ${cardFaceList.length} cards: title, then "<class>: <class definition>", then (outside a property group, revision 15) "<element>: <definition>", texts equal to the payload`, cardFaceList.length === itemPayload.cardList.length && faceProblemList.length === 0, faceProblemList.slice(0, 3).join(' | '));
	const styleMismatchList = cardFaceList.filter((cardFace) => cardFace.classStyle && cardFace.elementStyle && JSON.stringify(cardFace.classStyle) !== JSON.stringify(cardFace.elementStyle));
	check('the class definition is not muted: the same colour, size, weight, style and opacity as the element definition', cardFaceList.length > 0 && cardFaceList.every((cardFace) => cardFace.classStyle) && cardFaceList.some((cardFace) => cardFace.elementStyle) && styleMismatchList.length === 0, JSON.stringify(styleMismatchList.slice(0, 1).map((cardFace) => [cardFace.classStyle, cardFace.elementStyle])));
	check('each definition is led by a bold name', cardFaceList.every((cardFace) => Number(cardFace.classLeadWeight) >= 600), cardFaceList.map((cardFace) => cardFace.classLeadWeight).join(','));

	// ---------------------------------------------------------------- C9.2 the class definition's clamp and control
	console.log('C9.2 a long class definition: two lines and a more/less control');
	const longClassCard = itemPayload.cardList.find((card) => (card.classDefinition || '').length > LONG_DEFINITION_LENGTH);
	const shortClassCard = itemPayload.cardList.find((card) => (card.classDefinition || '').length > 0 && (card.classDefinition || '').length <= LONG_DEFINITION_LENGTH);
	check(`item ${targetItemNumber} has a card with a long class definition and one with a short one`, Boolean(longClassCard && shortClassCard));
	const longCardLocator = page.locator(`[data-testid="rater-candidate-row"][data-ceds-tuple-id="${longClassCard.cedsTupleId}"]`);
	const closedState = await readClampState(longCardLocator, 'rater-card-class-definition', 'rater-class-definition-toggle');
	check(`closed: ${longClassCard.className}'s definition shows two lines, the rest hidden; the control says "Show the whole class definition"`, closedState.isClamped && closedState.lineCount === 2 && closedState.toggleText === 'Show the whole class definition' && closedState.toggleExpanded === 'false', JSON.stringify(closedState));
	await longCardLocator.locator('[data-testid="rater-class-definition-toggle"]').click();
	const openState = await readClampState(longCardLocator, 'rater-card-class-definition', 'rater-class-definition-toggle');
	check('open: the whole class definition shows; the control says "Show less"', !openState.isClamped && openState.lineCount > 2 && openState.toggleText === 'Show less' && openState.toggleExpanded === 'true', JSON.stringify(openState));
	await longCardLocator.screenshot({ path: shotPath('91-class-definition-open') });
	await longCardLocator.locator('[data-testid="rater-class-definition-toggle"]').click();
	const reclosedState = await readClampState(longCardLocator, 'rater-card-class-definition', 'rater-class-definition-toggle');
	check('"Show less" clamps it to two lines again', reclosedState.isClamped && reclosedState.lineCount === 2, JSON.stringify(reclosedState));
	const shortCardLocator = page.locator(`[data-testid="rater-candidate-row"][data-ceds-tuple-id="${shortClassCard.cedsTupleId}"]`);
	const shortState = await readClampState(shortCardLocator, 'rater-card-class-definition', 'rater-class-definition-toggle');
	check(`a short class definition (${shortClassCard.className}) shows whole, with no control`, !shortState.isClamped && shortState.toggleText === null, JSON.stringify(shortState));

	// ---------------------------------------------------------------- C9.3 the element definition keeps its clamp
	console.log('C9.3 the element definition keeps its own clamp and toggle');
	const longElementCard = itemPayload.cardList.find((card) => (card.definition || '').length > LONG_DEFINITION_LENGTH);
	if (longElementCard) {
		const elementRowLocator = page.locator(`[data-testid="rater-candidate-row"][data-ceds-tuple-id="${longElementCard.cedsTupleId}"]`);
		// revision 15: a grouped card's element definition is its frame's lead, with the lead's own test ids
		const elementIsGrouped = (await page.locator('[data-testid="rater-property-group"]').filter({ has: elementRowLocator }).count()) > 0;
		const elementCardLocator = elementIsGrouped ? page.locator('[data-testid="rater-property-group"]').filter({ has: elementRowLocator }) : elementRowLocator;
		const [elementLineTestId, elementToggleTestId] = elementIsGrouped ? ['rater-property-group-definition', 'rater-property-group-definition-toggle'] : ['rater-card-element-definition', 'rater-definition-toggle'];
		const elementClosed = await readClampState(elementCardLocator, elementLineTestId, elementToggleTestId);
		await elementCardLocator.locator(`[data-testid="${elementToggleTestId}"]`).click();
		const elementOpen = await readClampState(elementCardLocator, elementLineTestId, elementToggleTestId);
		await elementCardLocator.locator(`[data-testid="${elementToggleTestId}"]`).click();
		check(`${longElementCard.propertyName}${elementIsGrouped ? ' (its group\'s lead)' : ''}: clamped to two lines with "Show the whole definition", opens to "Show less"`, elementClosed.isClamped && elementClosed.lineCount === 2 && elementClosed.toggleText === 'Show the whole definition' && !elementOpen.isClamped && elementOpen.toggleText === 'Show less', JSON.stringify([elementClosed, elementOpen]));
	} else {
		check(`item ${targetItemNumber} has no long element definition, so C9.3 is not exercised here (choose another item)`, false);
	}

	// ---------------------------------------------------------------- C9.4 shared element names, distinct classes
	console.log('C9.4 cards with the same element name read apart by their classes');
	const cardListByPropertyName = {};
	itemPayload.cardList.forEach((card) => {
		cardListByPropertyName[card.propertyName] = (cardListByPropertyName[card.propertyName] || []).concat(card);
	});
	const sharedPropertyName = Object.keys(cardListByPropertyName).sort((leftName, rightName) => cardListByPropertyName[rightName].length - cardListByPropertyName[leftName].length)[0];
	const sharedFaceList = cardFaceList.filter((cardFace) => cardByTupleId[cardFace.cedsTupleId].propertyName === sharedPropertyName);
	const distinctClassTextCount = new Set(sharedFaceList.map((cardFace) => cardFace.classText)).size;
	check(`the ${sharedFaceList.length} "${sharedPropertyName}" cards each show their own class definition (${distinctClassTextCount} distinct)`, sharedFaceList.length >= 2 && distinctClassTextCount === sharedFaceList.length);

	// ---------------------------------------------------------------- C9.5 More about this property
	console.log('C9.5 "More about this property" holds the option set only');
	check('no card repeats the class in "More about this property"', cardFaceList.every((cardFace) => !cardFace.moreTermList.includes('Class')), JSON.stringify(cardFaceList.map((cardFace) => cardFace.moreTermList).filter((termList) => termList.length).slice(0, 3)));
	const itemOptionSetCheck = (itemNumber, faceList, tupleCardIndex) => {
		const optionSetProblemList = faceList.filter((cardFace) => {
			const card = tupleCardIndex[cardFace.cedsTupleId];
			return card.optionSetName ? !(cardFace.moreTermList.join() === 'Option set' && cardFace.moreText.includes(card.optionSetName)) : cardFace.moreText !== null;
		});
		const optionSetCardCount = Object.values(tupleCardIndex).filter((card) => card.optionSetName).length;
		check(`item ${itemNumber}: cards with an option set (${optionSetCardCount}) still show it there, under "More about this property"; cards without one have no empty disclosure`, optionSetProblemList.length === 0, JSON.stringify(optionSetProblemList.slice(0, 2)));
		return optionSetCardCount;
	};
	let optionSetCardTotal = itemOptionSetCheck(targetItemNumber, cardFaceList, cardByTupleId);

	// ---------------------------------------------------------------- C9.6 absent class definition
	console.log('C9.6 no class definition: the notice');
	const blankedItemNumber = targetItemNumber - 1;
	let blankedCard = null;
	await page.route('**/api/raterAdmin', async (route) => {
		const requestBody = JSON.parse(route.request().postData() || '{}') || {};
		if (requestBody.adminAction !== 'previewItem' || Number(requestBody.itemNumber) !== blankedItemNumber) {
			await route.continue();
			return;
		}
		const fetchedResponse = await route.fetch();
		const bodyJson = await fetchedResponse.json();
		const blankedAnswer = answerOf(bodyJson);
		blankedAnswer.cardList[0].classDefinition = null;
		blankedCard = blankedAnswer.cardList[0];
		await route.fulfill({ response: fetchedResponse, json: bodyJson });
	});
	await page.click('[data-testid="rater-previous"]');
	await waitForPreviewItem(blankedItemNumber);
	await page.unroute('**/api/raterAdmin');
	const blankedPayload = payloadByItemNumber[blankedItemNumber];
	const blankedCardByTupleId = Object.fromEntries(blankedPayload.cardList.map((card) => [card.cedsTupleId, card]));
	const blankedFaceList = await readCardFaceList('[data-testid="rater-candidate-list"]', '[data-testid="rater-candidate-row"]');
	check(`item ${blankedItemNumber}: no card repeats the class in "More about this property"`, blankedFaceList.length > 0 && blankedFaceList.every((cardFace) => !cardFace.moreTermList.includes('Class')));
	optionSetCardTotal += itemOptionSetCheck(blankedItemNumber, blankedFaceList, blankedCardByTupleId);
	check(`the option-set case was exercised (${optionSetCardTotal} cards with an option set on items ${blankedItemNumber} and ${targetItemNumber})`, optionSetCardTotal > 0);
	const blankedLocator = page.locator(`[data-testid="rater-candidate-row"][data-ceds-tuple-id="${blankedCard.cedsTupleId}"]`);
	const blankedText = normalizedText(await blankedLocator.locator('[data-testid="rater-card-class-definition"]').innerText());
	check(`a card whose class definition is absent reads "Class: ${ABSENT_CLASS_NOTICE}", with no control`, blankedText === `Class: ${ABSENT_CLASS_NOTICE}` && (await blankedLocator.locator('[data-testid="rater-class-definition-toggle"]').count()) === 0, blankedText);
	await page.click('[data-testid="rater-preview-next"]');
	await waitForPreviewItem(targetItemNumber);

	// ---------------------------------------------------------------- C9.7 the Finder
	console.log('C9.7 Finder results read the same way');
	// revision 10: the finder lives in a drawer, opened from the button above the element
	await page.click('[data-testid="rater-open-search"]');
	const searchCaseList = [
		{ modeName: 'words', queryText: 'credits earned' },
		{ modeName: 'meaning', queryText: 'how many credits a student earned' },
		{ modeName: 'cedsId', queryText: longClassCard.cedsId },
	];
	for (const searchCase of searchCaseList) {
		const payloadCountBefore = searchPayloadList.length;
		await page.fill('[data-testid="rater-search-input"]', searchCase.queryText);
		if (searchCase.modeName !== 'cedsId') {
			await page.locator(`[data-testid="rater-search-mode-${searchCase.modeName}"]`).check({ force: true });
		}
		await page.click('[data-testid="rater-search-submit"]');
		for (let waitCount = 0; waitCount < 300 && searchPayloadList.length === payloadCountBefore; waitCount++) {
			await page.waitForTimeout(100);
		}
		await page.locator('[data-testid="rater-search-result"]').first().waitFor({ timeout: 20000 }).catch(() => null);
		const searchPayload = searchPayloadList[searchPayloadList.length - 1];
		const searchCardByTupleId = Object.fromEntries(((searchPayload && searchPayload.answer && searchPayload.answer.cardList) || []).map((card) => [card.cedsTupleId, card]));
		const resultFaceList = await readCardFaceList('[data-testid="rater-search-results"]', '[data-testid="rater-search-result"]');
		const resultProblemList = cardFaceProblemListOf(resultFaceList, searchCardByTupleId);
		check(`${searchCase.modeName} search "${searchCase.queryText}": all ${resultFaceList.length} results read title, class definition, element definition, texts equal to the payload`, searchPayloadList.length > payloadCountBefore && searchPayload.requestBody.searchMode === searchCase.modeName && resultFaceList.length > 0 && resultFaceList.length === Object.keys(searchCardByTupleId).length && resultProblemList.length === 0, `${searchPayload && searchPayload.requestBody.searchMode}; ${resultProblemList.slice(0, 3).join(' | ')}`);
		if (searchCase.modeName === 'cedsId') {
			const resultLocator = page.locator('[data-testid="rater-search-result"]').filter({ hasText: longClassCard.className }).first();
			const resultClosed = await readClampState(resultLocator, 'rater-card-class-definition', 'rater-class-definition-toggle');
			check(`in the results, ${longClassCard.className}'s long class definition is clamped to two lines with its control`, resultClosed.isClamped && resultClosed.lineCount === 2 && resultClosed.toggleText === 'Show the whole class definition', JSON.stringify(resultClosed));
			await page.locator('[data-testid="rater-search-results"]').screenshot({ path: shotPath('92-class-definition-search-results') });
		}
	}
	// C9.8 (revision 9 fix): a search result's class link switches to Browse and shows that class (it used to load the
	// class into the hidden Browse tab, so nothing visible happened)
	console.log('C9.8 a search result\'s class link opens Browse on that class');
	const resultClassName = (await page.locator('[data-testid="rater-search-result"] [data-testid="rater-card-class"]').first().innerText()).trim();
	await page.locator('[data-testid="rater-search-result"] [data-testid="rater-card-class"]').first().click();
	await page.locator('[data-testid="rater-browse-property"]').first().waitFor({ timeout: 10000 }).catch(() => null);
	const browseTabSelected = await page.locator('[data-testid="rater-tab-browse"]').getAttribute('aria-selected');
	const bannerText = (await page.locator('.rt-class-banner').count()) ? (await page.locator('.rt-class-banner').innerText()).trim() : '';
	check(`clicking "${resultClassName}" in a search result selects Browse and shows that class's properties under its banner`, browseTabSelected === 'true' && bannerText.startsWith(`${resultClassName}:`) && (await page.locator('[data-testid="rater-browse-property"]').count()) > 0, `browse tab ${browseTabSelected}, banner '${bannerText.slice(0, 60)}'`);
	await page.screenshot({ path: shotPath('93-search-result-class-opens-browse') });
	// a candidate card's class link opens Browse on that class too (the finder's openClassFromCard); revision 10: the
	// drawer covers the list, so it is closed first and the class link opens it again
	await page.keyboard.press('Escape');
	await page.locator('[data-testid="rater-candidate-row"] [data-testid="rater-card-class"]').first().click();
	await page.locator('[data-testid="rater-browse-property"]').first().waitFor({ timeout: 20000 });
	const bannerCount = await page.locator('.rt-class-banner').count();
	const browseClassDefinitionCount = await page.locator('[data-testid="rater-browse-property"] [data-testid="rater-card-class-definition"]').count();
	check('the class-browse view keeps its class banner, and its cards carry no class definition of their own', bannerCount === 1 && browseClassDefinitionCount === 0, `${bannerCount} banner, ${browseClassDefinitionCount} class definitions`);
} catch (walkError) {
	check('the class-definition walkthrough ran to the end', false, `${walkError && walkError.message}`.split('\n')[0]);
	await page.screenshot({ path: shotPath('99-class-definition-failure') }).catch(() => {});
} finally {
	await browser.close();
}

console.log(`\n=== raterClassDefinition (revision 9 browser) — Results: ${passCount} passed, ${failCount} failed ===`);
process.exit(failCount === 0 ? 0 : 1);
