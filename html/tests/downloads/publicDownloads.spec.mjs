// publicDownloads.spec.mjs — D2 of PLAN-publicDownloadsAndEditorRemoval-103026 in a real browser against a running site.
// The downloads are public (TQ, 2026-10-30: "all public"); the Standards Explorer stays signed-in (SHADOW_MEADOW's
// ruling the same day), so its Downloads section is checked signed IN, to prove it still works.
//   D2a signed out, /explore/downloads opens (no redirect to /login), lists the standards, and a source zip and a graph
//       zip each download; the publications section answers (a listing, or the gold's own "none published")
//   D2b signed out, a forged use case's Structure tab offers the whole standard's zips (no "once you sign in" text) and
//       one downloads
//   D2c signed out, the Standards Explorer still sends a visitor to /login (it was not opened)
//   D2d signed in, the Standards Explorer's Downloads section offers the CEDS zips and one downloads
// A download counts only when the browser fires its download event and the saved file is not empty.
//
//   node html/tests/downloads/publicDownloads.spec.mjs --baseUrl=… --userName=… --passwordFile=<file holding it>
//        --playwrightCorePath=… --chromePath=… --evidenceDir=…

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'userName', 'passwordFile', 'playwrightCorePath', 'chromePath', 'evidenceDir'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`publicDownloads: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const userPassword = fs.readFileSync(argumentByName.passwordFile, 'utf8').trim();
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
fs.mkdirSync(argumentByName.evidenceDir, { recursive: true });
const shotPath = (shotName) => path.join(argumentByName.evidenceDir, `${shotName}.png`);

const CEDS_ROOT_PATH_TEXT = 'families:all,family:CEDS,https://w3id.org/CEDStandards/terms/';

let passed = 0;
let failed = 0;
const check = (checkName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${checkName}${detailText ? ` (${detailText})` : ''}`); return; }
	failed++;
	console.log(`  FAIL: ${checkName}${detailText ? ` (${detailText})` : ''}`);
};

// clicks a download button and answers { suggestedFileName, byteSize }, or { failureText } when no download arrives
const downloadByClicking = async (page, buttonLocator) => {
	try {
		const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), buttonLocator.click()]);
		const savedPath = path.join(argumentByName.evidenceDir, `download-${download.suggestedFilename()}`);
		await download.saveAs(savedPath);
		return { suggestedFileName: download.suggestedFilename(), byteSize: fs.statSync(savedPath).size };
	} catch (error) {
		return { failureText: error.message.split('\n')[0] };
	}
};
const isGoodDownload = (downloadResult) => !downloadResult.failureText && downloadResult.byteSize > 0;
const downloadDetailOf = (downloadResult) => downloadResult.failureText || `${downloadResult.suggestedFileName}, ${downloadResult.byteSize} bytes`;

const browser = await chromium.launch({ executablePath: argumentByName.chromePath });
try {
	// ---- signed out
	const visitorContext = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1100 } });
	const visitorPage = await visitorContext.newPage();

	console.log('D2a signed out: /explore/downloads');
	await visitorPage.goto(`${baseUrl}/explore/downloads`);
	await visitorPage.waitForTimeout(1500);
	check('the Downloads page opens without a redirect to /login', !/\/login/.test(visitorPage.url()), visitorPage.url());
	const manifestShown = await visitorPage.waitForSelector('[data-testid="downloads-stamp"]', { timeout: 30000 }).then(() => true, () => false);
	check('the manifest is shown (no sign-in refusal)', manifestShown, manifestShown ? '' : ((await visitorPage.locator('[data-testid="downloads-error"]').textContent().catch(() => '')) || 'no stamp'));
	const familyCount = await visitorPage.locator('[data-testid^="downloads-family-"]').count();
	check('the standards are listed, grouped by family', familyCount > 0, `${familyCount} families`);
	await visitorPage.screenshot({ path: shotPath('D2a-downloadsPage-signedOut'), fullPage: false });
	if (manifestShown) {
		const sourceResult = await downloadByClicking(visitorPage, visitorPage.locator('[data-testid="download-ceds-source"]'));
		check('signed out: the CEDS source zip downloads', isGoodDownload(sourceResult), downloadDetailOf(sourceResult));
		const graphResult = await downloadByClicking(visitorPage, visitorPage.locator('[data-testid="download-ceds-graph"]'));
		check('signed out: the CEDS graph zip downloads', isGoodDownload(graphResult), downloadDetailOf(graphResult));
		check('no download error is shown', (await visitorPage.locator('[data-testid="downloads-download-error"]').count()) === 0);
		await visitorPage.locator('[data-testid="publications-section"]').scrollIntoViewIfNeeded();
		const publicationButton = visitorPage.locator('[data-testid="publications-site-registry"], [data-testid^="publications-set-"]').first();
		if ((await publicationButton.count()) > 0) {
			const publicationResult = await downloadByClicking(visitorPage, publicationButton);
			check('signed out: a published file downloads', isGoodDownload(publicationResult), downloadDetailOf(publicationResult));
		} else {
			const publicationStatusText = (await visitorPage.locator('[data-testid="publications-status"]').textContent().catch(() => '')) || '';
			check('signed out: the publications section answers the gold\'s own refusal, not a sign-in refusal', /publicationsAbsentForGolden/.test(publicationStatusText) && !/Unauthorized|token error/.test(publicationStatusText), publicationStatusText.slice(0, 120));
		}
		await visitorPage.locator('[data-testid="publications-section"]').screenshot({ path: shotPath('D2a-publications-signedOut') });
	}

	console.log('D2b signed out: a forged use case, Structure tab');
	const caseListAnswer = await visitorPage.request.post(`${baseUrl}/api/forged-use-cases`, { data: { action: 'list' } });
	const caseList = caseListAnswer.ok() ? ((await caseListAnswer.json())[0] || {}).caseList || [] : [];
	if (caseList.length === 0) {
		check('a forged use case exists to open', false, `forged-use-cases list answered ${caseListAnswer.status()}`);
	} else {
		const caseStableId = caseList[0].caseStableId;
		await visitorPage.goto(`${baseUrl}/explore/use-cases/forged/${encodeURIComponent(caseStableId)}`);
		await visitorPage.locator('[data-testid="tab-structure"]').click();
		const structureDownloads = visitorPage.locator('[data-testid="structure-standard-downloads"]');
		await structureDownloads.waitFor({ timeout: 30000 });
		await visitorPage.waitForSelector('[data-testid="structure-standard-downloads"] [data-testid^="download-entry-"]', { timeout: 30000 }).catch(() => {});
		check('no "once you sign in" text', (await visitorPage.locator('[data-testid="structure-standard-downloads-signin"]').count()) === 0 && !/once you sign in/.test((await structureDownloads.innerText()) || ''));
		const structureButton = structureDownloads.locator('button[data-testid^="download-"]:not([disabled])').first();
		const structureButtonCount = await structureDownloads.locator('button[data-testid^="download-"]:not([disabled])').count();
		check('the whole standard\'s zips are offered', structureButtonCount > 0, `${structureButtonCount} enabled buttons for ${caseStableId}`);
		if (structureButtonCount > 0) {
			const structureResult = await downloadByClicking(visitorPage, structureButton);
			check('signed out: a whole-standard zip downloads from the Structure tab', isGoodDownload(structureResult), downloadDetailOf(structureResult));
		}
		await structureDownloads.screenshot({ path: shotPath('D2b-structureTab-signedOut') });
	}

	console.log('D2c signed out: the Standards Explorer still asks for sign-in');
	await visitorPage.goto(`${baseUrl}/explore/graphicModelExplorer`);
	await visitorPage.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {});
	check('the Standards Explorer sends a visitor to /login', /\/login/.test(visitorPage.url()), visitorPage.url());
	await visitorContext.close();

	// ---- signed in
	console.log('D2d signed in: the Standards Explorer\'s Downloads section');
	const memberContext = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1100 } });
	const memberPage = await memberContext.newPage();
	await memberPage.goto(`${baseUrl}/login?redirect=${encodeURIComponent(`/explore/graphicModelExplorer?path=${encodeURIComponent(CEDS_ROOT_PATH_TEXT)}`)}`);
	await memberPage.getByLabel('User Name').fill(argumentByName.userName);
	await memberPage.getByLabel('Password', { exact: true }).fill(userPassword);
	await memberPage.getByRole('button', { name: 'Login' }).click();
	await memberPage.waitForURL(/graphicModelExplorer/, { timeout: 30000 });
	await memberPage.waitForSelector('[data-testid="downloads-section"] [data-testid^="download-entry-"]', { timeout: 60000 }).catch(() => {});
	const sectionButton = memberPage.locator('[data-testid="downloads-section"] button[data-testid^="download-"]:not([disabled])').first();
	const sectionButtonCount = await memberPage.locator('[data-testid="downloads-section"] button[data-testid^="download-"]:not([disabled])').count();
	check('signed in: the explorer\'s Downloads section offers zips', sectionButtonCount > 0, `${sectionButtonCount} enabled buttons`);
	if (sectionButtonCount > 0) {
		const sectionResult = await downloadByClicking(memberPage, sectionButton);
		check('signed in: a zip downloads from the explorer\'s Downloads section', isGoodDownload(sectionResult), downloadDetailOf(sectionResult));
	}
	await memberPage.locator('[data-testid="downloads-section"]').screenshot({ path: shotPath('D2d-explorerDownloads-signedIn') }).catch(() => memberPage.screenshot({ path: shotPath('D2d-explorerDownloads-signedIn') }));
	await memberContext.close();
} finally {
	await browser.close();
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
