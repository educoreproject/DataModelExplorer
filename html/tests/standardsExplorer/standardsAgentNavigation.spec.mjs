// standardsAgentNavigation.spec.mjs — can something that reads the page, not looks at it (a screen reader, or an AI
// agent working from the DOM or the accessibility tree), find its way around the Standards view? In a real browser
// against a running dev server, every /api/* call answered by standardsViewFixtures.mjs (no backend, no graph).
//   N1 every page of the view: a title naming it, <html lang>, one h1, a main landmark, the site navigation and its
//      sections as named landmarks, and a name on every visible link, button, tab and text field
//   N2 the sidebar's logo is a link home with a name, not a clickable div
//   N3 signed out (the explorer is public): the walk names itself, and a family's catalog card in the panel is an
//      article named by its heading
//   N4 the explorer in Diagram view (a selected item with more inside is offered Open, never also called the end of
//      the line): the canvas is named as a picture, and the level's items are listed under it,
//      one per row, each with a Select button and, when it has more inside, an Open link; following an Open href
//      (the app's router sent to exactly that href, no click) lands on that item, and the title and level region say
//      where the walk is
//   N5 the breadcrumb's crumbs are links; following the first goes back to every family
//   N6 the explorer in Table view: each row's name is a Select button, the Open column is a link with an href and a
//      header, and selecting a row marks it aria-selected
//   N7 with --axePath, axe-core finds no critical issue on any page (serious ones are listed)
//
//   node html/tests/standardsExplorer/standardsAgentNavigation.spec.mjs --baseUrl=http://localhost:3000
//        [--axePath=…/axe-core/axe.min.js] [--playwrightPath=playwright] [--chromePath=…]

import fs from 'node:fs';
import { createRequire } from 'node:module';
import { answerApi, isApiUrl } from './standardsViewFixtures.mjs';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
if (!argumentByName.baseUrl) {
	console.error('standardsAgentNavigation: missing --baseUrl');
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightPath || 'playwright');
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
const axeSourceText = argumentByName.axePath ? fs.readFileSync(argumentByName.axePath, 'utf8') : '';

let passed = 0;
let failed = 0;
const check = (checkName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${checkName}${detailText ? ` (${detailText})` : ''}`); return; }
	failed++;
	console.log(`  FAIL: ${checkName}${detailText ? ` (${detailText})` : ''}`);
};

// what a reader of the page finds: its title, language, h1s, landmarks, and the visible controls that have no name
const pageFactsOf = (page) =>
	page.evaluate(() => {
		const isShown = (oneElement) => oneElement.getClientRects().length > 0;
		const nameOf = (oneElement) =>
			(oneElement.getAttribute('aria-label') || (oneElement.getAttribute('aria-labelledby') && document.getElementById(oneElement.getAttribute('aria-labelledby'))?.textContent) || (oneElement.labels && [...oneElement.labels].map((oneLabel) => oneLabel.textContent).join(' ')) || oneElement.getAttribute('title') || oneElement.textContent || oneElement.getAttribute('alt') || '').trim();
		const controlSelectorText = 'a[href], button, [role="button"], [role="tab"], [role="link"], input:not([type="hidden"]), textarea, select';
		const unnamedControlList = [...document.querySelectorAll(controlSelectorText)]
			.filter((oneElement) => isShown(oneElement) && !oneElement.closest('nuxt-devtools-frame, .nuxt-devtools-label, [aria-hidden="true"]') && !nameOf(oneElement) && !oneElement.querySelector('img[alt]:not([alt=""])'))
			.map((oneElement) => oneElement.outerHTML.slice(0, 120));
		const landmarkList = [...document.querySelectorAll('nav, [role="navigation"], main, aside, section[aria-label], section[aria-labelledby]')].map((oneElement) => ({ tagName: oneElement.tagName.toLowerCase(), role: oneElement.getAttribute('role') || '', name: oneElement.getAttribute('aria-label') || '' }));
		return {
			title: document.title,
			lang: document.documentElement.getAttribute('lang'),
			h1Count: [...document.querySelectorAll('h1')].filter(isShown).length,
			mainCount: document.querySelectorAll('main, [role="main"]').length,
			landmarkList,
			unnamedControlList,
		};
	});

const checkPage = async (page, { pageLabel, titlePattern, sectionNameList }) => {
	const pageFacts = await pageFactsOf(page);
	check(`${pageLabel}: the title names the page`, titlePattern.test(pageFacts.title), pageFacts.title);
	check(`${pageLabel}: <html lang="en">`, pageFacts.lang === 'en', pageFacts.lang);
	check(`${pageLabel}: one h1`, pageFacts.h1Count === 1, String(pageFacts.h1Count));
	check(`${pageLabel}: a main landmark`, pageFacts.mainCount === 1);
	const navigationNameList = pageFacts.landmarkList.filter((oneLandmark) => oneLandmark.tagName === 'nav' || oneLandmark.role === 'navigation').map((oneLandmark) => oneLandmark.name);
	check(`${pageLabel}: the site navigation and its sections are named landmarks`, ['Site', ...sectionNameList].every((sectionName) => navigationNameList.includes(sectionName)), navigationNameList.join(', '));
	check(`${pageLabel}: every visible control has a name`, pageFacts.unnamedControlList.length === 0, pageFacts.unnamedControlList.join(' | '));
	if (!axeSourceText) return;
	await page.addScriptTag({ content: axeSourceText });
	const violationList = await page.evaluate(async () => (await window.axe.run({ exclude: [['nuxt-devtools-frame'], ['.nuxt-devtools-label']] }, { resultTypes: ['violations'] })).violations.map((oneViolation) => ({ impact: oneViolation.impact, ruleId: oneViolation.id, targetText: oneViolation.nodes.slice(0, 2).map((oneNode) => oneNode.target.join(' ')).join(' | ') })));
	const criticalList = violationList.filter((oneViolation) => oneViolation.impact === 'critical');
	check(`${pageLabel}: axe finds no critical issue`, criticalList.length === 0, criticalList.map((oneViolation) => `${oneViolation.ruleId}: ${oneViolation.targetText}`).join(' ; '));
	violationList.filter((oneViolation) => oneViolation.impact === 'serious').forEach((oneViolation) => console.log(`  note: axe serious ${oneViolation.ruleId}: ${oneViolation.targetText}`));
};

const browser = await chromium.launch(argumentByName.chromePath ? { executablePath: argumentByName.chromePath } : {});
try {
	const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
	await context.route(isApiUrl, answerApi);
	const page = await context.newPage();
	const open = async (routePath, readySelector) => {
		await page.goto(`${baseUrl}${routePath}`, { waitUntil: 'load' });
		await page.waitForSelector(readySelector || '[data-testid="standards-view"]', { timeout: 30000 }).catch(() => {});
		await page.waitForTimeout(800);
	};
	const hrefOf = async (locator) => (await locator.getAttribute('href').catch(() => null)) || '';
	// following a link inside the app, as a reader of its href would: the app's router goes to exactly that href (a
	// full page load would start a new session, and sign-in is not kept across page loads)
	const follow = async (hrefText, readySelector) => {
		await page.evaluate((targetHref) => document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$router.push(targetHref), hrefText);
		await page.waitForSelector(readySelector, { timeout: 30000 }).catch(() => {});
		await page.waitForTimeout(800);
	};

	console.log('N1, N2, N3 signed out');
	await open('/explore/standards', '[data-testid="level-item-list"] li');
	await checkPage(page, { pageLabel: 'Standards Explorer (signed out)', titlePattern: /^Standards Explorer · EDUcore$/, sectionNameList: ['Explore', 'Breadcrumb', 'Items on this level'] });
	const logoLink = page.locator('[data-testid="menu-logo"]');
	check('the logo is a link home named "EDUcore home"', (await logoLink.evaluate((oneElement) => oneElement.tagName)) === 'A' && (await hrefOf(logoLink)) === '/' && (await logoLink.getAttribute('aria-label')) === 'EDUcore home');
	await page.getByRole('button', { name: /^Select CEDS \(Standards family\)/ }).click();
	await page.waitForSelector('[data-testid="detail-spec"] [data-testid="spec-card-ceds"]', { timeout: 10000 }).catch(() => {});
	check('signed out, a family\'s catalog card is an article named by its heading', (await page.locator('[data-testid="spec-card-ceds"]').evaluate((oneElement) => oneElement.tagName).catch(() => '')) === 'ARTICLE' && (await page.getByRole('article', { name: 'Common Education Data Standards (CEDS)' }).count()) === 1);

	for (const [routePath, pageLabel, titlePattern] of [
		['/explore/standards/specifications', 'Specifications', /^Specification Viewer · EDUcore$/],
		['/explore/standards/downloads?family=CEDS', 'Downloads (CEDS)', /^CEDS · Downloads · EDUcore$/],
	]) {
		await open(routePath);
		await checkPage(page, { pageLabel, titlePattern, sectionNameList: ['Explore'] });
	}

	console.log('N4 the explorer, Diagram view');
	await page.goto(`${baseUrl}/login?redirect=${encodeURIComponent('/explore/standards?path=families:all')}`);
	await page.getByLabel('User Name').fill('fixture');
	await page.getByLabel('Password', { exact: true }).fill('fixture');
	await page.getByRole('button', { name: 'Login' }).click();
	await page.waitForSelector('[data-testid="level-item-list"] li', { timeout: 30000 }).catch(() => {});
	await page.waitForTimeout(800);
	await checkPage(page, { pageLabel: 'Explorer (families, diagram)', titlePattern: /^Standards Explorer · EDUcore$/, sectionNameList: ['Explore', 'Tools', 'Account', 'Breadcrumb', 'Items on this level'] });
	check('the diagram is named as a picture of the level', /^Bubble diagram of 12 of the 12 items/.test((await page.locator('[data-testid="explorer-diagram"]').getAttribute('aria-label')) || ''));
	check('the level region says where the walk is', (await page.getByRole('region', { name: /Explorer: 12 items in every standards family, shown as a diagram/ }).count()) === 1);
	const levelItemList = page.locator('[data-testid="level-item-list"] li');
	check('every item on the level is listed beside the diagram', (await levelItemList.count()) === 12, String(await levelItemList.count()));
	await page.getByRole('button', { name: /^Select CEDS \(Standards family\)/ }).click();
	check('Select shows the item in the detail panel', (await page.getByRole('complementary', { name: 'Details: CEDS' }).count()) === 1);
	check('the panel offers Open and does not also call CEDS the end of the line', (await page.locator('[data-testid="detail-open"]').count()) === 1 && (await page.locator('[data-testid="detail-leaf"]').count()) === 0);
	const cedsOpenHref = await hrefOf(page.getByRole('navigation', { name: 'Items on this level' }).getByRole('link', { name: 'Open CEDS' }));
	check('Open is a link with an href', /\/explore\/standards\?path=families(%3A|:)all,family(%3A|:)CEDS$/.test(cedsOpenHref), cedsOpenHref);
	await follow(cedsOpenHref, '[data-testid="level-item-list"] li, [data-testid="explorer-table"]');
	check('following the href (no click) lands on CEDS', /^CEDS · Standards Explorer · EDUcore$/.test(await page.title()), await page.title());
	check('and the panel says so', (await page.getByRole('complementary', { name: 'Details: CEDS' }).count()) === 1);

	console.log('N5 the breadcrumb');
	const crumbLinkList = page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link');
	check('every crumb is a link', (await crumbLinkList.count()) === 2, String(await crumbLinkList.count()));
	check('the current crumb is marked', (await crumbLinkList.last().getAttribute('aria-current')) === 'page');
	const topHref = await hrefOf(crumbLinkList.first());
	await follow(topHref, '[data-testid="level-item-list"] li');
	check('following the first crumb goes back to every family', /^Standards Explorer · EDUcore$/.test(await page.title()) && (await page.locator('[data-testid="level-item-list"] li').count()) === 12, topHref);

	console.log('N6 the explorer, Table view');
	await page.locator('[data-testid="view-table"]').click();
	await page.waitForSelector('[data-testid="explorer-table"] tbody tr', { timeout: 10000 }).catch(() => {});
	await checkPage(page, { pageLabel: 'Explorer (families, table)', titlePattern: /^Standards Explorer · EDUcore$/, sectionNameList: ['Explore', 'Breadcrumb'] });
	check('the Open column has a header', /Open/.test(await page.locator('[data-testid="explorer-table"] thead th').last().textContent()));
	const tableOpenHref = await hrefOf(page.locator('[data-testid="explorer-table"]').getByRole('link', { name: 'Open PESC' }));
	check('a row\'s Open is a link with an href', /family(%3A|:)PESC$/.test(tableOpenHref), tableOpenHref);
	await page.getByRole('button', { name: /^Select PESC/ }).click();
	check('selecting a row marks it aria-selected', (await page.locator('[data-testid="row-PESC"]').getAttribute('aria-selected')) === 'true');
} finally {
	await browser.close();
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
