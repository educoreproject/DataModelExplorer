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
// Revision 13 (WORKORDER-RATER13), agreement by property as well as by card:
//   B13.1 the two raters choose cards of one CEDS property in different classes on a second target; after a reload its
//         block shows Same card 1 of 2 and Same property 2 of 2, still marked split (card level is the default); the
//         split target (a card against No match) shows 1 of 2 at both levels; the column heads and the property count
//   B13.2 the summary CSV carries sameCard and sameProperty on every line of both targets
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
	check('the summary CSV downloads with its header and the split target\'s rows', /^cedsRaterResults-.*\.csv$/.test(download.suggestedFilename()) && csvText.startsWith('standard,survey,targetStableId,targetName,answered,assigned,candidateTupleId,candidateTitle,added,best,same,sameCard,sameProperty\n') && csvText.split('\n').filter((lineText) => lineText.includes(splitStableId)).length === 3, download.suggestedFilename());
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

	// ---------------------------------------------------------------- B13.1 Same card and Same property
	console.log('B13.1 agreement by card and by property');
	const propertyIdentityOf = (card) => JSON.stringify([card.cedsId, card.qualifierNameList.slice().sort()]);
	let propertyPair = null;
	for (let itemNumber = 2; itemNumber <= 50 && !propertyPair; itemNumber++) {
		const item = (await apiPost('raterItemGet', { itemNumber }, tokenList[0])).bodyJson[0];
		const pairCard = item.cardList.find((cardA) => item.cardList.some((cardB) => cardB.classCedsId !== cardA.classCedsId && propertyIdentityOf(cardB) === propertyIdentityOf(cardA)));
		if (pairCard) {
			const otherCard = item.cardList.find((cardB) => cardB.classCedsId !== pairCard.classCedsId && propertyIdentityOf(cardB) === propertyIdentityOf(pairCard));
			propertyPair = { elementStableId: item.element.elementStableId, cardList: [pairCard, otherCard] };
		}
	}
	check('a target whose list holds one CEDS property in two classes', !!propertyPair);
	const pairSaveCodeList = [
		(await apiPost('raterAnswerSave', { elementStableId: propertyPair.elementStableId, answerKind: 'cards', bestCedsTupleId: propertyPair.cardList[0].cedsTupleId }, tokenList[0])).statusCode,
		(await apiPost('raterAnswerSave', { elementStableId: propertyPair.elementStableId, answerKind: 'cards', bestCedsTupleId: propertyPair.cardList[1].cedsTupleId }, tokenList[1])).statusCode,
	];
	check(`the raters choose ${propertyPair.cardList[0].className} and ${propertyPair.cardList[1].className} → ${propertyPair.cardList[0].propertyName}`, pairSaveCodeList.every((statusCode) => statusCode === 200), JSON.stringify(pairSaveCodeList));
	await page.click('[data-testid="rater-results-back"]');
	await page.click('[data-testid="rater-admin-results-link"]');
	await page.waitForSelector(`[data-testid="rater-results-target"][data-target-stable-id="${propertyPair.elementStableId}"] [data-testid="rater-results-same-property"]`, { timeout: 20000 });
	const agreementTextOf = async (targetStableId) => {
		const block = page.locator(`[data-testid="rater-results-target"][data-target-stable-id="${targetStableId}"]`);
		return [(await block.locator('[data-testid="rater-results-same-card"]').innerText()).trim(), (await block.locator('[data-testid="rater-results-same-property"]').innerText()).trim(), await block.locator('[data-testid="rater-results-split"]').count()];
	};
	const pairAgreement = await agreementTextOf(propertyPair.elementStableId);
	check('the same property in two classes: Same card 1 of 2, Same property 2 of 2, still marked split', JSON.stringify(pairAgreement) === '["1 of 2","2 of 2",1]', JSON.stringify(pairAgreement));
	const splitAgreement = await agreementTextOf(splitStableId);
	check('a card against No match: 1 of 2 at both levels', JSON.stringify(splitAgreement) === '["1 of 2","1 of 2",1]', JSON.stringify(splitAgreement));
	const headTextList = await page.$$eval('[data-testid="rater-results-table"] thead th', (cellList) => cellList.map((cell) => cell.textContent.trim()));
	check('the column heads say Same card and Same property, beside Answered', JSON.stringify(headTextList) === '["Target","Answered","Same card","Same property","Chosen","Best","Same"]', JSON.stringify(headTextList));
	const cardCountText = await page.locator('[data-testid="rater-results-count"]').innerText();
	const propertyCountText = await page.locator('[data-testid="rater-results-count-property"]').innerText();
	// other answers may be in the store; the pair target is split by card and not by property, so the property count is
	// at least one below the card count whatever else is there
	const cardSplitCount = Number((cardCountText.match(/^150 targets · (\d+) with more than one Best answer$/) || [])[1]);
	const propertySplitCount = Number((propertyCountText.trim().match(/^· (\d+) with more than one Best property$/) || [])[1]);
	check('the counts: split by card, and by property (at least one fewer)', cardSplitCount >= 2 && propertySplitCount <= cardSplitCount - 1, `${cardCountText} | ${propertyCountText}`);
	const disagreementOrderList = await shownTargetIdList(page);
	check('Disagreement first is still by card: both split targets among the card splits on top', [splitStableId, propertyPair.elementStableId].every((targetStableId) => disagreementOrderList.indexOf(targetStableId) !== -1 && disagreementOrderList.indexOf(targetStableId) < cardSplitCount), JSON.stringify([disagreementOrderList.indexOf(splitStableId), disagreementOrderList.indexOf(propertyPair.elementStableId), cardSplitCount]));
	await page.locator(`[data-testid="rater-results-target"][data-target-stable-id="${propertyPair.elementStableId}"]`).scrollIntoViewIfNeeded();
	await page.screenshot({ path: shotPath('52-results-same-property') });

	// ---------------------------------------------------------------- B13.2 the CSV carries both
	console.log('B13.2 summary CSV, both levels');
	const [agreementDownload] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('[data-testid="rater-results-download"]')]);
	const agreementCsvPath = path.join(argumentByName.evidenceDir, agreementDownload.suggestedFilename());
	await agreementDownload.saveAs(agreementCsvPath);
	const agreementCsvLineList = fs.readFileSync(agreementCsvPath, 'utf8').split('\n');
	const pairLineList = agreementCsvLineList.filter((lineText) => lineText.includes(propertyPair.elementStableId));
	const splitLineList = agreementCsvLineList.filter((lineText) => lineText.includes(splitStableId));
	check('the pair target\'s lines end ,1,2 (Same card, Same property); the split target\'s end ,1,1', pairLineList.length === 2 && pairLineList.every((lineText) => lineText.endsWith(',1,2')) && splitLineList.length === 3 && splitLineList.every((lineText) => lineText.endsWith(',1,1')), JSON.stringify([pairLineList, splitLineList]).slice(0, 400));
	fs.rmSync(agreementCsvPath);

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

console.log(`\n=== raterResults (revisions 4 and 13 browser) — Results: ${passCount} passed, ${failCount} failed ===`);
process.exit(failCount === 0 ? 0 : 1);
