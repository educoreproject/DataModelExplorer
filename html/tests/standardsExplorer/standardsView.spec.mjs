// standardsView.spec.mjs — the one Standards view (sidebar entry, Explorer · Specifications · Downloads tabs) in a real
// browser against a running dev server, with every /api/* call answered by standardsViewFixtures.mjs, so it needs no
// backend and no graph.
//   V1 the sidebar has one Standards entry and none of the entries it replaced
//   V2 signed out (the explorer is public since 2026-11-04), /explore/standards opens the walk: no sign-in prompt, no
//      Authorization header on the walk's requests, and no companion pages asked for (they stay for signed-in people)
//   V3 the Specifications and Downloads tabs open and are selected; Downloads keeps its ?family= filter
//   V4 every old route redirects to its tab with its query
//   V5 a shared walk link opens signed out
//   V6..V8 run signed out
//   V6 the families level: the table leads each family with its catalog title; the panel lists the catalog's
//      specifications the graph does not hold
//   V7 selecting a family shows its catalog card in the panel; opening it keeps the card for the focus, and the panel
//      reads no 'undefined' (an opened family's node carries no counts)
//   V8 the Schema Viewer: not offered at the families catalog; inside CEDS it is a third view beside Diagram and Table,
//      showing the Specification Viewer opened on CEDS, full width (no detail panel, no filter); Diagram brings them back
//
//   node html/tests/standardsExplorer/standardsView.spec.mjs --baseUrl=http://localhost:3000 [--evidenceDir=…]
//        [--playwrightPath=playwright] [--chromePath=…]

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { answerApi, isApiUrl } from './standardsViewFixtures.mjs';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
if (!argumentByName.baseUrl) {
	console.error('standardsView: missing --baseUrl');
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightPath || 'playwright');
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
const evidenceDir = argumentByName.evidenceDir || '';
if (evidenceDir) fs.mkdirSync(evidenceDir, { recursive: true });
const shoot = async (page, shotName) => evidenceDir && page.screenshot({ path: path.join(evidenceDir, `${shotName}.png`) });

let passed = 0;
let failed = 0;
const check = (checkName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${checkName}${detailText ? ` (${detailText})` : ''}`); return; }
	failed++;
	console.log(`  FAIL: ${checkName}${detailText ? ` (${detailText})` : ''}`);
};

// ================================================================================
// THE RUN

const browser = await chromium.launch(argumentByName.chromePath ? { executablePath: argumentByName.chromePath } : {});
try {
	const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
	await context.route(isApiUrl, answerApi);
	const page = await context.newPage();
	const pageErrorList = [];
	page.on('pageerror', (error) => pageErrorList.push(`${error.message} at ${(error.stack || '').split('\n')[1]?.trim() || '?'} on ${page.url().replace(baseUrl, '')}`));
	// what the walk asks the server, and whether it sends a token
	const neighbourhoodRequestList = [];
	let companionRequestCount = 0;
	page.on('request', (oneRequest) => {
		const requestPath = new URL(oneRequest.url()).pathname;
		if (requestPath === '/api/standards-neighbourhood') neighbourhoodRequestList.push({ authorization: oneRequest.headers().authorization || '' });
		if (requestPath === '/api/companion-page-list') companionRequestCount += 1;
	});
	const open = async (routePath) => {
		await page.goto(`${baseUrl}${routePath}`, { waitUntil: 'load' });
		await page.waitForSelector('[data-testid="standards-view"]', { timeout: 30000 }).catch(() => {});
	};
	const selectedTabText = async () => (await page.locator('[data-testid^="standards-tab-"].v-tab--selected').innerText().catch(() => '')).trim();

	console.log('V1 the sidebar');
	await open('/explore/standards');
	const sidebarText = await page.locator('.v-navigation-drawer').first().innerText();
	check('one Standards entry', (await page.locator('[data-testid="menu-standards"]').count()) === 1);
	check('no separate Schema Verifier, Specification Viewer, Standards Explorer or Downloads entries', !/Schema Verifier|Specification Viewer|Standards Explorer|Downloads/.test(sidebarText), sidebarText.replace(/\s+/g, ' '));

	console.log('V2 signed out: the walk is public');
	await page.waitForSelector('[data-testid="standards-explorer"] [data-testid="level-item-list"] li', { timeout: 30000 }).catch(() => {});
	check('the Explorer tab is selected', (await selectedTabText()) === 'Explorer', await selectedTabText());
	check('the walk opens without signing in', (await page.locator('[data-testid="standards-explorer"]').count()) === 1 && (await page.locator('[data-testid="level-item-list"] li').count()) === 12);
	check('no sign-in prompt', (await page.locator('[data-testid="standards-signin-prompt"]').count()) === 0);
	check('the walk\'s requests carry no Authorization header', neighbourhoodRequestList.length > 0 && neighbourhoodRequestList.every((oneRequest) => !oneRequest.authorization), `${neighbourhoodRequestList.length} requests; ${neighbourhoodRequestList.map((oneRequest) => oneRequest.authorization || 'none').join(', ')}`);
	await shoot(page, 'V2-signedOut');

	console.log('V3 the other tabs');
	await page.click('[data-testid="standards-tab-specifications"]');
	await page.waitForURL(/\/explore\/standards\/specifications/, { timeout: 15000 }).catch(() => {});
	check('Specifications opens', /\/explore\/standards\/specifications$/.test(page.url()) && (await selectedTabText()) === 'Specifications', page.url());
	check('the Specification Viewer is in it', (await page.getByRole('heading', { name: 'Specification Viewer' }).count()) === 1);
	await shoot(page, 'V3-specifications');
	await open('/explore/standards/downloads?family=PESC');
	await page.waitForSelector('[data-testid="downloads-family-PESC"]', { timeout: 15000 }).catch(() => {});
	check('Downloads opens with its family filter', (await selectedTabText()) === 'Downloads' && (await page.locator('[data-testid^="downloads-family-"]').count()) === 1);
	await shoot(page, 'V3-downloads');

	console.log('V4 the old routes');
	for (const [oldPath, newPattern] of [
		['/explore/downloads?family=CEDS', /\/explore\/standards\/downloads\?family=CEDS$/],
		['/explore/schema-verifier', /\/explore\/standards\/specifications$/],
		['/explore/specification-viewer', /\/explore\/standards\/specifications$/],
		['/explore/graphicModelExplorer?path=families%3Aall', /\/explore\/standards\?path=families(%3A|:)all$/],
		['/explore/standards/explorer?path=families%3Aall', /\/explore\/standards\?path=families(%3A|:)all$/],
		// the explorer then writes the walk out from the top (families:all), as it does for any path that skips it
		['/explore/pesc', /\/explore\/standards\?path=(families(%3A|:)all(,|%2C))?family(%3A|:)PESC$/],
	]) {
		await open(oldPath);
		check(`${oldPath} redirects`, newPattern.test(page.url()), page.url().replace(baseUrl, ''));
	}

	console.log('V5 a shared walk link, signed out');
	await open('/explore/standards?path=families%3Aall');
	await page.waitForSelector('[data-testid="standards-explorer"] [data-testid="level-item-list"] li', { timeout: 30000 }).catch(() => {});
	check('it opens on the Explorer tab with the walk', (await page.locator('[data-testid="standards-explorer"]').count()) === 1 && (await selectedTabText()) === 'Explorer' && !/\/login/.test(page.url()), page.url().replace(baseUrl, ''));

	console.log('V6 the families level');
	await page.locator('.v-btn', { hasText: /^Table$/ }).first().click().catch(() => {});
	await page.waitForSelector('table', { timeout: 10000 }).catch(() => {});
	const tableText = await page.locator('[data-testid="standards-explorer"] table').innerText().catch(() => '');
	check('the table leads CEDS with its catalog title', /Common Education Data Standards \(CEDS\)/.test(tableText));
	const catalogPanel = page.locator('[data-testid="detail-spec-catalog"]');
	check('the panel offers the specification catalog', (await catalogPanel.count()) === 1);
	check('the panel lists IEEE LER as not yet in the graph', /IEEE P1484\.2/.test(await catalogPanel.innerText().catch(() => '')));
	await shoot(page, 'V6-families');

	console.log('V7 a family');
	await page.locator('[data-testid="standards-explorer"] tr', { hasText: 'Common Education Data Standards' }).first().click();
	await page.waitForSelector('[data-testid="detail-spec"]', { timeout: 10000 }).catch(() => {});
	check('selecting CEDS shows its catalog card', (await page.locator('[data-testid="detail-spec"] [data-testid="spec-card-ceds"]').count()) === 1);
	await shoot(page, 'V7-cedsSelected');
	await page.click('[data-testid="detail-open"]');
	await page.waitForURL(/family(%3A|:)CEDS/, { timeout: 15000 }).catch(() => {});
	await page.waitForSelector('[data-testid="detail-spec"]', { timeout: 10000 }).catch(() => {});
	check('the opened family\'s panel says no "undefined"', !/undefined/.test(await page.locator('[data-testid="detail-panel"]').innerText()));
	check('opened CEDS keeps its catalog card for the focus', (await page.locator('[data-testid="detail-spec"] [data-testid="spec-card-ceds"]').count()) === 1, page.url().replace(baseUrl, ''));
	await page.locator('[data-testid="detail-spec"] .v-expansion-panel-title').click();
	await page.waitForTimeout(500);
	check('its implementation details open', /Burden Rubric|Guidance/.test(await page.locator('[data-testid="detail-spec"]').innerText()));
	await shoot(page, 'V7-cedsOpened');

	console.log('V8 the Schema Viewer');
	check('inside CEDS, Schema Viewer is a third view', (await page.locator('[data-testid="view-schema"]').count()) === 1 && /Schema Viewer/.test(await page.locator('[data-testid="view-switch"]').innerText()));
	await page.locator('[data-testid="view-schema"]').click();
	await page.waitForSelector('[data-testid="schema-view"] [data-testid="specification-viewer"]', { timeout: 15000 }).catch(() => {});
	const schemaPickerLocator = page.locator('[data-testid="schema-view"] .v-autocomplete');
	await page.waitForFunction(() => /CEDS/.test(document.querySelector('[data-testid="schema-view"] .v-autocomplete')?.innerText || ''), null, { timeout: 15000 }).catch(() => {});
	check('it shows the Specification Viewer, opened on CEDS', /CEDS/.test((await schemaPickerLocator.innerText().catch(() => '')) || '') && (await page.locator('[data-testid="schema-view-unmatched"]').count()) === 0, ((await schemaPickerLocator.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 80));
	check('embedded: no page header of its own, no Load Your Own Schema switch', (await page.locator('[data-testid="schema-view"]').getByRole('heading', { name: 'Specification Viewer' }).count()) === 0 && (await page.locator('[data-testid="schema-view"]').getByText('Load Your Own Schema').count()) === 0);
	check('it takes the width: no detail panel, no filter', (await page.locator('[data-testid="detail-panel"]').count()) === 0 && (await page.locator('[data-testid="filter"]').count()) === 0);
	await shoot(page, 'V8-schemaViewer');
	await page.locator('[data-testid="view-diagram"]').click();
	await page.waitForSelector('[data-testid="detail-panel"]', { timeout: 10000 }).catch(() => {});
	check('Diagram brings the panel and the diagram back', (await page.locator('[data-testid="detail-panel"]').count()) === 1 && (await page.locator('[data-testid="explorer-diagram"]').count()) === 1);
	await page.locator('[data-testid^="crumb-"]').first().click();
	await page.waitForFunction(() => !document.querySelector('[data-testid="view-schema"]'), null, { timeout: 10000 }).catch(() => {});
	check('at the families catalog it is not offered', (await page.locator('[data-testid="view-schema"]').count()) === 0);

	check('signed out, companion pages were never asked for', companionRequestCount === 0, `${companionRequestCount} requests`);
	check('no page errors', pageErrorList.length === 0, pageErrorList.join(' | '));
} finally {
	await browser.close();
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
