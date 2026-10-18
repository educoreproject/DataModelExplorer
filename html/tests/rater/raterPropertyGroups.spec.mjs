// raterPropertyGroups.spec.mjs — revision 12 browser gates (WORKORDER-RATER12): a list's cards are gathered by CEDS
// property (the server orders them; card-property-identity.js) and the screen frames each run of two or more with a
// lead line. Makes two raters on a survey through the admin API, removes them in `finally`. On a running site:
//   B12.1 on a rater's item with properties in several classes: each group's cards are adjacent and inside ONE frame
//         (data-testid rater-property-group) whose lead line reads "<property>[ (<qualifiers>)], in N classes" with N
//         its card count; the rows are in the payload's order; singletons sit outside any frame; the frame is drawn
//   B12.2 the group order differs between two raters on the same element (each keeps their own shuffle)
//   B12.3 Best on one group member and Same on another work as before: the summary, Save, and both still set on reload
//   B12.4 a card added from the drawer appears at the top, marked Added by you, outside every frame; frames unchanged
//   B12.5 the admin preview (reached by clicks, the main login is memory-only): the same frames for the survey's item
//         with Number of Credits Earned ×7 ("Number of Credits Earned, in 7 classes"), and the same order after
//         walking away and back (stable)
//   B12.6 no rater or preview payload card carries a field beyond the rater card fields
// Revision 15 (WORKORDER-RATER15): each frame states its property definition once, under the lead, and the cards in it
// show their class only; a singleton and an added card show both lines. framesMatchPayload checks it on the rater's
// page (B12.1–B12.3) and the preview (B12.5); B12.4 checks the added card. raterGroupLeadDefinition has the rest.
// Density (the walkthrough's T4.4 count: rows fully above the answer bar) is printed for the preview item, not gated.
//
//   node html/tests/rater/raterPropertyGroups.spec.mjs --baseUrl=… --adminUserName=… --adminPasswordFile=<file>
//        --surveyName=B --playwrightCorePath=… --chromePath=… --evidenceDir=…

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'adminUserName', 'adminPasswordFile', 'surveyName', 'playwrightCorePath', 'chromePath', 'evidenceDir'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`raterPropertyGroups: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const adminPassword = fs.readFileSync(argumentByName.adminPasswordFile, 'utf8').trim();
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
const surveyName = argumentByName.surveyName;
fs.mkdirSync(argumentByName.evidenceDir, { recursive: true });
const shotPath = (shotName) => path.join(argumentByName.evidenceDir, `${shotName}.png`);

const RATER_USER_NAME_LIST = ['rater12-groups-x', 'rater12-groups-y'];
const ITEM_COUNT = 50;
const TAB_URL_PATTERN = /\/admin\/?\?tool=ceds-rater$/;
const RATER_CARD_FIELD_LIST = ['cedsTupleId', 'className', 'classCedsId', 'classDefinition', 'propertyName', 'qualifierNameList', 'cedsId', 'definition', 'optionSetName', 'optionValueList', 'cedsUrl'];
const CREDITS_PROPERTY_NAME = 'Number of Credits Earned';

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

// the property identity as the server makes it (card-property-identity.js): P-id plus sorted qualifiers, class ignored
const propertyIdentityOf = (card) => [card.cedsId].concat(card.qualifierNameList.slice().sort()).join('|');
const propertyLabelOf = (card) => `${card.propertyName}${card.qualifierNameList.length ? ` (${card.qualifierNameList.join(', ')})` : ''}`;
// the payload's runs of one property: [{ propertyIdentity, tupleIdList, leadText }]
const runListOf = (cardList) => cardList.reduce((soFar, card) => {
	const lastRun = soFar[soFar.length - 1];
	if (lastRun && lastRun.propertyIdentity === propertyIdentityOf(card)) {
		lastRun.tupleIdList.push(card.cedsTupleId);
		lastRun.leadText = `${propertyLabelOf(card)}, in ${lastRun.tupleIdList.length} classes`;
		return soFar;
	}
	return soFar.concat([{ propertyIdentity: propertyIdentityOf(card), tupleIdList: [card.cedsTupleId], leadText: '' }]);
}, []);
const groupRunListOf = (cardList) => runListOf(cardList).filter((run) => run.tupleIdList.length > 1);

const browser = await chromium.launch({ executablePath: argumentByName.chromePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// every item payload the browser was given (rater and preview), for B12.6
const seenCardList = [];
const watchPayloads = (watchedPage) =>
	watchedPage.on('response', async (response) => {
		if (!/\/api\/(raterItemGet|raterAdmin)/.test(response.url())) {
			return;
		}
		const bodyJson = await response.json().catch(() => null);
		const answer = firstOf(bodyJson);
		if (answer && Array.isArray(answer.cardList)) {
			seenCardList.push(...answer.cardList);
		}
	});
watchPayloads(page);

const waitForItem = async (targetPage, itemNumber) => {
	await targetPage.waitForFunction((expectedNumber) => {
		const crumb = document.querySelector('[data-testid="rater-item-crumb"]');
		return crumb && crumb.textContent.includes(`Item ${expectedNumber} of`) && document.querySelectorAll('[data-testid="rater-candidate-row"]').length > 0;
	}, itemNumber, { timeout: 20000 });
};
// what the list shows: every row in DOM order, and every frame with its rows, lead, count and drawn border
const readListLayout = (targetPage) =>
	targetPage.evaluate(() => {
		const list = document.querySelector('[data-testid="rater-candidate-list"]');
		const rowList = Array.from(list.querySelectorAll('[data-testid="rater-candidate-row"]')).map((row) => ({
			cedsTupleId: row.getAttribute('data-ceds-tuple-id'),
			isAdded: Boolean(row.querySelector('.rt-chip-added')),
			hasClassLine: Boolean(row.querySelector('[data-testid="rater-card-class-definition"]')),
			hasPropertyLine: Boolean(row.querySelector('[data-testid="rater-card-element-definition"]')),
			frameIndex: Array.from(list.querySelectorAll('[data-testid="rater-property-group"]')).indexOf(row.closest('[data-testid="rater-property-group"]')),
		}));
		const frameList = Array.from(list.querySelectorAll('[data-testid="rater-property-group"]')).map((frame) => {
			const lead = frame.querySelector('[data-testid="rater-property-group-lead"]');
			const frameStyle = getComputedStyle(frame, '::before');
			return {
				tupleIdList: Array.from(frame.querySelectorAll('[data-testid="rater-candidate-row"]')).map((row) => row.getAttribute('data-ceds-tuple-id')),
				leadText: lead ? lead.textContent.replace(/\s+/g, ' ').trim() : '',
				leadIsFirst: Boolean(lead) && frame.firstElementChild === lead,
				leadInsideCard: Boolean(lead && lead.closest('article')),
				memberCount: Number(frame.getAttribute('data-member-count')),
				definitionTextList: Array.from(frame.querySelectorAll('[data-testid="rater-property-group-definition"]')).map((definitionElement) => definitionElement.textContent.replace(/\s+/g, ' ').trim()),
				ariaLabel: frame.getAttribute('aria-label'),
				frameBorderWidth: frameStyle.borderTopWidth,
				frameBorderStyle: frameStyle.borderTopStyle,
			};
		});
		return { rowList, frameList };
	});
const fullyVisibleCardCount = (targetPage) =>
	targetPage.evaluate(() => {
		const answerBarTop = document.querySelector('[data-testid="rater-answer-bar"]').getBoundingClientRect().top;
		return Array.from(document.querySelectorAll('[data-testid="rater-candidate-row"]')).filter((row) => {
			const rect = row.getBoundingClientRect();
			return rect.top >= 0 && rect.bottom <= Math.min(answerBarTop, window.innerHeight);
		}).length;
	});

// B12.1's checks for one page showing one payload (no added cards)
const framesMatchPayload = (labelText, listLayout, cardList) => {
	const groupRunList = groupRunListOf(cardList);
	check(`${labelText}: the rows are in the payload's order (${listLayout.rowList.length} cards)`, JSON.stringify(listLayout.rowList.map((row) => row.cedsTupleId)) === JSON.stringify(cardList.map((card) => card.cedsTupleId)));
	check(`${labelText}: one frame per property in several classes (${listLayout.frameList.length} frames, ${groupRunList.length} groups)`, groupRunList.length > 0 && listLayout.frameList.length === groupRunList.length);
	const frameProblemList = groupRunList.map((run, runIndex) => {
		const frame = listLayout.frameList[runIndex];
		if (!frame) {
			return `no frame for ${run.leadText}`;
		}
		if (JSON.stringify(frame.tupleIdList) !== JSON.stringify(run.tupleIdList)) {
			return `frame ${runIndex} holds other cards`;
		}
		if (frame.leadText !== run.leadText || frame.ariaLabel !== run.leadText || frame.memberCount !== run.tupleIdList.length) {
			return `frame ${runIndex}: lead '${frame.leadText}' / label '${frame.ariaLabel}' / count ${frame.memberCount}, wanted '${run.leadText}'`;
		}
		if (!frame.leadIsFirst || frame.leadInsideCard) {
			return `frame ${runIndex}: the lead line is not above its cards`;
		}
		return '';
	}).filter(Boolean);
	check(`${labelText}: each frame holds exactly its property's cards, adjacent, led by "<property>, in N classes" with the right N`, frameProblemList.length === 0, frameProblemList.slice(0, 3).join(' | '));
	const groupedTupleIdSet = new Set(groupRunList.reduce((soFar, run) => soFar.concat(run.tupleIdList), []));
	check(`${labelText}: every singleton sits outside any frame`, listLayout.rowList.filter((row) => !groupedTupleIdSet.has(row.cedsTupleId)).every((row) => row.frameIndex === -1));
	// revision 15: the property once, in the lead; the class on every card; both lines on a card outside a frame
	const cardByTupleId = Object.fromEntries(cardList.map((card) => [card.cedsTupleId, card]));
	const leadDefinitionProblemList = groupRunList.map((run, runIndex) => {
		const frame = listLayout.frameList[runIndex];
		const wantedText = `Property: ${cardByTupleId[run.tupleIdList[0]].definition || '(none in CEDS)'}`.replace(/\s+/g, ' ').trim();
		return frame && frame.definitionTextList.length === 1 && frame.definitionTextList[0] === wantedText ? '' : `${run.leadText}: ${JSON.stringify(frame ? frame.definitionTextList.map((definitionText) => definitionText.slice(0, 40)) : null)}`;
	}).filter(Boolean);
	check(`${labelText}: each frame states its property definition once, under the lead`, leadDefinitionProblemList.length === 0, leadDefinitionProblemList.slice(0, 3).join(' | '));
	const framedRowList = listLayout.rowList.filter((row) => row.frameIndex !== -1);
	check(`${labelText}: every card in a frame shows its Class line and no Property line (${framedRowList.length} cards)`, framedRowList.length > 0 && framedRowList.every((row) => row.hasClassLine && !row.hasPropertyLine));
	check(`${labelText}: every card outside a frame shows both lines`, listLayout.rowList.filter((row) => row.frameIndex === -1).every((row) => row.hasClassLine && row.hasPropertyLine));
	check(`${labelText}: the frame is drawn (a 1px solid border)`, listLayout.frameList.length > 0 && listLayout.frameList.every((frame) => frame.frameBorderWidth === '1px' && frame.frameBorderStyle === 'solid'), JSON.stringify(listLayout.frameList.map((frame) => [frame.frameBorderWidth, frame.frameBorderStyle])));
};

const raterRecordList = [];
let adminToken = null;
try {
	// ---------------------------------------------------------------- set up: two raters, through the admin API
	const adminLogin = await apiPost('login', { username: argumentByName.adminUserName, password: adminPassword });
	adminToken = adminLogin.statusCode === 200 ? adminLogin.authtoken : null;
	if (!adminToken) {
		throw new Error(`admin login refused (${adminLogin.statusCode})`);
	}
	for (const raterUserName of RATER_USER_NAME_LIST) {
		await apiPost('raterAdmin', { adminAction: 'remove', raterUserName }, adminToken);
		const addResponse = await apiPost('raterAdmin', { adminAction: 'add', raterUserName, whoText: 'Property groups test rater (temporary, lane RATER revision 12)', surveyName }, adminToken);
		const added = firstOf(addResponse.bodyJson);
		if (addResponse.statusCode !== 200 || !added || !added.issuedPassword) {
			throw new Error(`could not make ${raterUserName}: ${addResponse.statusCode} ${addResponse.bodyText.slice(0, 200)}`);
		}
		const raterRecord = { raterUserName, password: added.issuedPassword, itemList: [] };
		raterRecordList.push(raterRecord);
		const raterLogin = await apiPost('login', { username: raterUserName, password: added.issuedPassword });
		for (let itemNumber = 1; itemNumber <= ITEM_COUNT; itemNumber++) {
			raterRecord.itemList.push(firstOf((await apiPost('raterItemGet', { itemNumber }, raterLogin.authtoken)).bodyJson));
		}
	}
	const [raterX, raterY] = raterRecordList;
	const yItemByStableId = Object.fromEntries(raterY.itemList.map((item) => [item.element.elementStableId, item]));
	// an element both raters see with groups, in a different group order: the one B12.1–B12.4 use
	const sharedItemX = raterX.itemList.find((item) => groupRunListOf(item.cardList).length > 0 && JSON.stringify(runListOf(item.cardList).map((run) => run.propertyIdentity)) !== JSON.stringify(runListOf(yItemByStableId[item.element.elementStableId].cardList).map((run) => run.propertyIdentity)));
	if (!sharedItemX) {
		throw new Error('no element has groups in a different order for the two raters');
	}
	const sharedItemY = yItemByStableId[sharedItemX.element.elementStableId];

	// ---------------------------------------------------------------- B12.1 the frames on a rater's item
	console.log(`B12.1 ${raterX.raterUserName}, item ${sharedItemX.itemNumber} (${sharedItemX.element.name})`);
	await page.goto(`${baseUrl}/rater`);
	await page.fill('[data-testid="rater-signin-name"]', raterX.raterUserName);
	await page.fill('[data-testid="rater-signin-password"]', raterX.password);
	await page.click('[data-testid="rater-signin-submit"]');
	await waitForItem(page, 1);
	await page.goto(`${baseUrl}/rater/rate?item=${sharedItemX.itemNumber}`);
	await waitForItem(page, sharedItemX.itemNumber);
	const xLayout = await readListLayout(page);
	framesMatchPayload(`${raterX.raterUserName} item ${sharedItemX.itemNumber}`, xLayout, sharedItemX.cardList);
	await page.locator('[data-testid="rater-property-group"]').first().scrollIntoViewIfNeeded();
	await page.screenshot({ path: shotPath('B12-1-rater-groups') });

	// ---------------------------------------------------------------- B12.2 another rater, another group order
	console.log(`B12.2 ${raterY.raterUserName}, the same element at their item ${sharedItemY.itemNumber}`);
	const yContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const yPage = await yContext.newPage();
	watchPayloads(yPage);
	await yPage.goto(`${baseUrl}/rater`);
	await yPage.fill('[data-testid="rater-signin-name"]', raterY.raterUserName);
	await yPage.fill('[data-testid="rater-signin-password"]', raterY.password);
	await yPage.click('[data-testid="rater-signin-submit"]');
	await waitForItem(yPage, 1);
	await yPage.goto(`${baseUrl}/rater/rate?item=${sharedItemY.itemNumber}`);
	await waitForItem(yPage, sharedItemY.itemNumber);
	const yLayout = await readListLayout(yPage);
	framesMatchPayload(`${raterY.raterUserName} item ${sharedItemY.itemNumber}`, yLayout, sharedItemY.cardList);
	const domRunOrderOf = (listLayout, cardList) => {
		const identityByTupleId = Object.fromEntries(cardList.map((card) => [card.cedsTupleId, propertyIdentityOf(card)]));
		return listLayout.rowList.map((row) => identityByTupleId[row.cedsTupleId]).filter((propertyIdentity, position, identityList) => position === 0 || identityList[position - 1] !== propertyIdentity);
	};
	check('the same element shows its properties in a different order to the two raters (each keeps their shuffle)', JSON.stringify(domRunOrderOf(xLayout, sharedItemX.cardList)) !== JSON.stringify(domRunOrderOf(yLayout, sharedItemY.cardList)));
	await yContext.close();

	// ---------------------------------------------------------------- B12.3 Best and Same inside a group
	console.log('B12.3 Best and Same inside a group');
	const answerRun = groupRunListOf(sharedItemX.cardList)[0];
	const [sameTupleId, bestTupleId] = answerRun.tupleIdList;
	const rowOf = (cedsTupleId) => page.locator(`[data-testid="rater-candidate-row"][data-ceds-tuple-id="${cedsTupleId}"]`);
	await rowOf(bestTupleId).locator('[data-testid="rater-best-radio"]').check();
	await rowOf(sameTupleId).locator('[data-testid="rater-same-checkbox"]').check();
	const cardOf = (cedsTupleId) => sharedItemX.cardList.find((card) => card.cedsTupleId === cedsTupleId);
	const summaryText = (await page.textContent('[data-testid="rater-answer-summary"]')).replace(/\s+/g, ' ');
	check(`the summary names the Best and the Same, both members of one group (${summaryText.slice(0, 120)})`, summaryText.includes(`Best: ${cardOf(bestTupleId).className} → ${propertyLabelOf(cardOf(bestTupleId))}`) && summaryText.includes(`Same: ${cardOf(sameTupleId).className} → ${propertyLabelOf(cardOf(sameTupleId))}`));
	await page.click('[data-testid="rater-save"]');
	await page.waitForURL(new RegExp(`item=${sharedItemX.itemNumber + 1 > ITEM_COUNT ? sharedItemX.itemNumber : sharedItemX.itemNumber + 1}`), { timeout: 20000 }).catch(() => null);
	await page.goto(`${baseUrl}/rater/rate?item=${sharedItemX.itemNumber}`);
	await waitForItem(page, sharedItemX.itemNumber);
	check('after Save and a fresh load: Best is still on that member', await rowOf(bestTupleId).locator('[data-testid="rater-best-radio"]').isChecked());
	check('and Same is still on the other member', await rowOf(sameTupleId).locator('[data-testid="rater-same-checkbox"]').isChecked());
	framesMatchPayload('after saving, the same item', await readListLayout(page), sharedItemX.cardList);

	// ---------------------------------------------------------------- B12.4 an added card is not regrouped
	console.log('B12.4 a card added from the drawer stays at the top, outside the frames');
	// a card of a framed property in a class not in the list, when CEDS has one; else any card (P001572 has many)
	const searchCedsIdList = Array.from(new Set(groupRunListOf(sharedItemX.cardList).map((run) => cardOf(run.tupleIdList[0]).cedsId))).concat(['P001572']);
	await page.click('[data-testid="rater-open-search"]');
	let addButton = null;
	let searchedCedsId = '';
	for (const cedsId of searchCedsIdList) {
		await page.fill('[data-testid="rater-search-input"]', cedsId);
		await Promise.all([page.waitForResponse((response) => response.url().includes('/api/raterSearch'), { timeout: 20000 }), page.click('[data-testid="rater-search-submit"]')]);
		await page.waitForTimeout(300);
		const candidateButton = page.locator('[data-testid="rater-search-result"] [data-testid="rater-add-card"]').first();
		if ((await candidateButton.count()) > 0) {
			addButton = candidateButton;
			searchedCedsId = cedsId;
			break;
		}
	}
	const addsFramedProperty = searchedCedsId !== '' && searchedCedsId !== 'P001572';
	check(`a CEDS ID search offers a card not in the list (${searchedCedsId}${addsFramedProperty ? ', a framed property in another class' : ', no framed property has another class in CEDS'})`, Boolean(addButton));
	const addedTupleId = await addButton.evaluate((button) => button.closest('[data-testid="rater-search-result"]').getAttribute('data-ceds-tuple-id'));
	await addButton.click();
	await page.keyboard.press('Escape');
	const addedLayout = await readListLayout(page);
	const addedRow = addedLayout.rowList[0];
	check('the added card is the first row, marked Added by you', addedRow && addedRow.cedsTupleId === addedTupleId && addedRow.isAdded);
	check(`the added card is outside every frame${addsFramedProperty ? ', even the frame of its own property' : ''}`, addedRow && addedRow.frameIndex === -1);
	check('the added card shows both its Class and its Property line (revision 15)', addedRow && addedRow.hasClassLine && addedRow.hasPropertyLine);
	check('the frames are exactly as before', JSON.stringify(addedLayout.frameList.map((frame) => [frame.tupleIdList, frame.leadText, frame.definitionTextList])) === JSON.stringify(xLayout.frameList.map((frame) => [frame.tupleIdList, frame.leadText, frame.definitionTextList])));
	await page.screenshot({ path: shotPath('B12-4-added-card') });

	// ---------------------------------------------------------------- B12.5 the admin preview
	console.log('B12.5 the admin preview');
	const previewItemList = [];
	for (let itemNumber = 1; itemNumber <= ITEM_COUNT; itemNumber++) {
		previewItemList.push(firstOf((await apiPost('raterAdmin', { adminAction: 'previewItem', surveyName, itemNumber }, adminToken)).bodyJson));
	}
	const creditsItem = previewItemList.find((item) => item.cardList.filter((card) => card.propertyName === CREDITS_PROPERTY_NAME).length === 7) || previewItemList.find((item) => groupRunListOf(item.cardList).length > 0);
	const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const adminPage = await adminContext.newPage();
	watchPayloads(adminPage);
	await adminPage.goto(`${baseUrl}/login?redirect=${encodeURIComponent('/admin?tool=ceds-rater')}`);
	await adminPage.getByLabel('User Name').fill(argumentByName.adminUserName);
	await adminPage.getByLabel('Password', { exact: true }).fill(adminPassword);
	await adminPage.getByRole('button', { name: 'Login' }).click();
	await adminPage.waitForURL(TAB_URL_PATTERN, { timeout: 20000 });
	await adminPage.click(`[data-testid="rater-surveys-view-${surveyName}"]`);
	await adminPage.click(`[data-testid="rater-surveys-item-preview-${creditsItem.itemNumber}"]`);
	await waitForItem(adminPage, creditsItem.itemNumber);
	const previewLayout = await readListLayout(adminPage);
	framesMatchPayload(`preview ${surveyName} item ${creditsItem.itemNumber}`, previewLayout, creditsItem.cardList);
	check(`the preview leads its credits group with "${CREDITS_PROPERTY_NAME}, in 7 classes"`, previewLayout.frameList.some((frame) => frame.leadText === `${CREDITS_PROPERTY_NAME}, in 7 classes` && frame.memberCount === 7), JSON.stringify(previewLayout.frameList.map((frame) => frame.leadText)));
	const densityAt1440 = await fullyVisibleCardCount(adminPage);
	await adminPage.locator('[data-testid="rater-property-group"]').first().scrollIntoViewIfNeeded();
	await adminPage.screenshot({ path: shotPath('B12-5-preview-credits') });
	const walkAwayItemNumber = creditsItem.itemNumber === ITEM_COUNT ? creditsItem.itemNumber - 1 : creditsItem.itemNumber + 1;
	const [awaySelector, backSelector] = walkAwayItemNumber > creditsItem.itemNumber ? ['[data-testid="rater-preview-next"]', '[data-testid="rater-previous"]'] : ['[data-testid="rater-previous"]', '[data-testid="rater-preview-next"]'];
	await adminPage.click(awaySelector);
	await waitForItem(adminPage, walkAwayItemNumber);
	await adminPage.click(backSelector);
	await waitForItem(adminPage, creditsItem.itemNumber);
	const previewAgainLayout = await readListLayout(adminPage);
	check('the preview order and frames are the same after walking away and back (stable)', JSON.stringify(previewAgainLayout) === JSON.stringify(previewLayout));
	await adminPage.setViewportSize({ width: 1280, height: 720 });
	await adminPage.evaluate(() => window.scrollTo(0, 0));
	await adminPage.waitForTimeout(300);
	const densityAt1280 = await fullyVisibleCardCount(adminPage);
	console.log(`  (density, preview ${surveyName} item ${creditsItem.itemNumber}: ${densityAt1440} cards fully visible at 1440×900, ${densityAt1280} at 1280×720)`);
	await adminContext.close();

	// ---------------------------------------------------------------- B12.6 no new field
	console.log('B12.6 no payload card gains a field');
	check(`every card the pages were given has exactly the rater card fields (${seenCardList.length} cards)`, seenCardList.length > 0 && seenCardList.every((card) => JSON.stringify(Object.keys(card)) === JSON.stringify(RATER_CARD_FIELD_LIST)), JSON.stringify(Object.keys(seenCardList.find((card) => JSON.stringify(Object.keys(card)) !== JSON.stringify(RATER_CARD_FIELD_LIST)) || {})));
} catch (walkError) {
	check('the property-groups walkthrough ran to the end', false, `${walkError && walkError.message}`.split('\n')[0]);
	await page.screenshot({ path: shotPath('B12-9-failure') }).catch(() => {});
} finally {
	for (const raterRecord of raterRecordList) {
		const removeResponse = await apiPost('raterAdmin', { adminAction: 'remove', raterUserName: raterRecord.raterUserName }, adminToken);
		console.log(`  (cleanup: ${raterRecord.raterUserName} removed, status ${removeResponse.statusCode})`);
	}
	await browser.close();
}

console.log(`\n=== raterPropertyGroups (revision 12 browser) — Results: ${passCount} passed, ${failCount} failed ===`);
process.exit(failCount === 0 ? 0 : 1);
