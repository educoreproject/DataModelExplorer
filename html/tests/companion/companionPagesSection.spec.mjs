// companionPagesSection.spec.mjs — gate G2.1 (SPEC-companionPages-102826, Phase 2) in a real browser against a running
// site (API and Nuxt dev) whose database holds the seeded jedx-dictionary page and no other standard's pages:
//   G2.1a the JEDx root (families:all,family:JEDx,jedx:root) shows the Companion pages section with the
//         jedx-dictionary card, above the Downloads section
//   G2.1b the CEDS root, a family with no pages (CASE) and the families catalog show no Companion pages section and no
//         "Companion pages" text at all, and their Downloads section still renders
//   OBSERVED (reported, not a gate): family:JEDx, which the shared focus rule reads as the JEDx standard
// The main login lives in memory only (loginStore), so the page logs in once (landing on the first path) and moves by
// the app's own router after that; a page.goto would drop the login.
//
//   node html/tests/companion/companionPagesSection.spec.mjs --baseUrl=… --userName=… --passwordFile=<file holding it>
//        --playwrightCorePath=… --chromePath=… --evidenceDir=…

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'userName', 'passwordFile', 'playwrightCorePath', 'chromePath', 'evidenceDir'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`companionPagesSection: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const userPassword = fs.readFileSync(argumentByName.passwordFile, 'utf8').trim();
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
fs.mkdirSync(argumentByName.evidenceDir, { recursive: true });
const shotPath = (shotName) => path.join(argumentByName.evidenceDir, `${shotName}.png`);

const EXPLORER_PATH = '/explore/graphicModelExplorer';
const JEDX_ROOT_PATH_TEXT = 'families:all,family:JEDx,jedx:root';
const NO_PAGE_PATH_TEXT_LIST = [
	{ pathText: 'families:all,family:CEDS,https://w3id.org/CEDStandards/terms/', shotName: 'companionPages-G2.1-cedsRoot', showsDownloads: true },
	{ pathText: 'families:all,family:CASE', shotName: '', showsDownloads: true },
	{ pathText: 'families:all', shotName: '', showsDownloads: true },
];

let passed = 0;
let failed = 0;
const check = (checkName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${checkName}`); return; }
	failed++;
	console.log(`  FAIL: ${checkName}${detailText ? ` (${detailText})` : ''}`);
};

const explorerUrlOf = (pathText) => `${EXPLORER_PATH}?path=${encodeURIComponent(pathText)}`;

// the detail panel has settled when its name is drawn and the downloads manifest has answered
const waitForDetailPanel = async (page) => {
	await page.waitForSelector('[data-testid="detail-name"]', { timeout: 30000 });
	await page.waitForFunction(() => !document.body.innerText.includes('Looking for downloads'), null, { timeout: 30000 });
	await page.waitForTimeout(1500);
};

const moveTo = async (page, pathText) => {
	await page.evaluate((targetUrl) => document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$router.push(targetUrl), explorerUrlOf(pathText));
	await page.waitForFunction((pathText) => decodeURIComponent(location.search).includes(pathText), pathText, { timeout: 15000 });
	await waitForDetailPanel(page);
};

const browser = await chromium.launch({ executablePath: argumentByName.chromePath });
try {
	const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
	await page.goto(`${baseUrl}/login?redirect=${encodeURIComponent(explorerUrlOf(JEDX_ROOT_PATH_TEXT))}`);
	await page.getByLabel('User Name').fill(argumentByName.userName);
	await page.getByLabel('Password', { exact: true }).fill(userPassword);
	await page.getByRole('button', { name: 'Login' }).click();
	await page.waitForURL(/graphicModelExplorer/, { timeout: 30000 });
	await waitForDetailPanel(page);

	console.log(`G2.1a ${JEDX_ROOT_PATH_TEXT}`);
	const jedxCard = page.locator('[data-testid="companion-card-jedx-dictionary"]');
	check('the jedx-dictionary card is shown', (await jedxCard.count()) === 1);
	check('the card carries the page title', ((await jedxCard.textContent()) || '').includes('One dictionary, four lenses'));
	const sectionOrderText = await page.evaluate(() => {
		const companionSection = document.querySelector('[data-testid="companion-section"]');
		const downloadsSection = document.querySelector('[data-testid="downloads-section"]');
		if (!companionSection || !downloadsSection) return 'missing';
		return companionSection.compareDocumentPosition(downloadsSection) & Node.DOCUMENT_POSITION_FOLLOWING ? 'companionFirst' : 'downloadsFirst';
	});
	check('the Companion pages section sits above Downloads', sectionOrderText === 'companionFirst', sectionOrderText);
	await page.locator('[data-testid="detail-panel"]').screenshot({ path: shotPath('companionPages-G2.1-jedxRoot') });

	for (const { pathText, shotName, showsDownloads } of NO_PAGE_PATH_TEXT_LIST) {
		console.log(`G2.1b ${pathText}`);
		await moveTo(page, pathText);
		check('no Companion pages section', (await page.locator('[data-testid="companion-section"]').count()) === 0);
		check('no "Companion pages" text anywhere in the detail panel', !((await page.locator('[data-testid="detail-panel"]').innerText()) || '').toLowerCase().includes('companion pages'));
		if (showsDownloads) check('the Downloads section still renders', (await page.locator('[data-testid="downloads-section"]').count()) === 1);
		if (shotName) await page.locator('[data-testid="detail-panel"]').screenshot({ path: shotPath(shotName) });
	}

	console.log('OBSERVED families:all,family:JEDx');
	await moveTo(page, 'families:all,family:JEDx');
	console.log(`  the family shows the jedx-dictionary card: ${(await page.locator('[data-testid="companion-card-jedx-dictionary"]').count()) === 1}`);
} finally {
	await browser.close();
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
