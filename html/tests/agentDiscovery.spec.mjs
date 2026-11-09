// agentDiscovery.spec.mjs — what an AI agent or a crawler finds about EDUcore before and after it reads a page, against a
// running site (dev server or a generated build). /api/* is answered from the specs' fixtures, so no backend is needed.
//   A1 /llms.txt: plain text, an H1, a summary, and links to the pages and the agent catalog
//   A2 /.well-known/ai-catalog.json and /.well-known/mcp.json: JSON, naming the MCP server and the public APIs
//   A3 /robots.txt allows every crawler and the named AI agents (no "Disallow: /"), and names the sitemap; /sitemap.xml
//      lists the public pages
//   A4 every page's HTML, before any JavaScript, carries the site's Organization and WebSite JSON-LD
//   A5 each page's own JSON-LD, once its data has arrived: the specification catalog (ItemList of CreativeWork), the
//      downloads (ItemList of Dataset with DataDownload), the use-case list (ItemList), and one use case (a HowTo whose
//      steps name the elements they use as DefinedTerms); every block parses, and none can close its script tag early
//
//   node html/tests/agentDiscovery.spec.mjs --baseUrl=http://localhost:3000 [--playwrightPath=playwright] [--chromePath=…]

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { answerApi as answerStandardsApi } from './standardsExplorer/standardsViewFixtures.mjs';

const requireHere = createRequire(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const useCaseFixture = requireHere(path.join(repositoryRoot, 'server/test/fixtures/useCaseDiagramFixture.js'));

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
if (!argumentByName.baseUrl) {
	console.error('agentDiscovery: missing --baseUrl');
	process.exit(2);
}
const { chromium } = requireHere(argumentByName.playwrightPath || 'playwright');
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');

let passed = 0;
let failed = 0;
const check = (checkName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${checkName}${detailText ? ` (${detailText})` : ''}`); return; }
	failed++;
	console.log(`  FAIL: ${checkName}${detailText ? ` (${detailText})` : ''}`);
};
const fetchText = async (routePath) => {
	const response = await fetch(`${baseUrl}${routePath}`);
	return { status: response.status, contentType: response.headers.get('content-type') || '', text: await response.text() };
};
const jsonLdBlockListOf = (htmlText) => [...htmlText.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((scriptMatch) => scriptMatch[1]);

// the use-case API: the list, and one case shaped as the case action answers it
const answerApi = async (route) => {
	const requestPath = new URL(route.request().url()).pathname;
	if (requestPath.endsWith('/api/forged-use-cases')) {
		const body = route.request().postDataJSON?.() || {};
		const json = (payload) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
		if (body.action === 'list') return json([{ caseList: [{ caseStableId: useCaseFixture.useCase.caseStableId, shortName: useCaseFixture.useCase.shortName, longName: useCaseFixture.useCase.longName, stepCount: 6 }] }]);
		if (body.action === 'case') {
			// the case action's steps carry the data each story names (CONSUMES / PRODUCES), by reference
			const dataListByCodedNotation = {};
			useCaseFixture.stepDataLinkList.filter((oneLink) => oneLink.partHopCount === 0 && oneLink.referenceStableId).forEach((oneLink) => (dataListByCodedNotation[oneLink.codedNotation] ||= []).push({ dataEdgeType: oneLink.dataEdgeType, dataStableId: oneLink.referenceStableId, dataName: oneLink.namedDataName || oneLink.referenceStableId }));
			return json([{ useCase: useCaseFixture.useCase, stepList: useCaseFixture.stepList.map((oneStep) => ({ ...oneStep, dataList: dataListByCodedNotation[oneStep.codedNotation] || [] })), citationList: useCaseFixture.citationList, citationStateCountList: [], contextBySection: useCaseFixture.contextBySection, implementationGuide: { citedElementList: [], standardList: [] } }]);
		}
		return json([{}]);
	}
	return answerStandardsApi(route);
};

console.log('A1 /llms.txt');
const llmsTxt = await fetchText('/llms.txt');
check('it is served as plain text', llmsTxt.status === 200 && /^text\/plain/.test(llmsTxt.contentType), `${llmsTxt.status} ${llmsTxt.contentType}`);
check('it opens with an H1 and a summary', /^# EDUcore\n\n> /.test(llmsTxt.text));
check('it links the pages, the MCP server and the agent catalog', ['/explore/use-cases', '/explore/standards', '/explore/standards/downloads', '/explore/access-guide', '/mcp', '/.well-known/ai-catalog.json'].every((linkText) => llmsTxt.text.includes(linkText)));

console.log('A2 the .well-known files');
const aiCatalog = await fetchText('/.well-known/ai-catalog.json');
let aiCatalogJson = null;
try { aiCatalogJson = JSON.parse(aiCatalog.text); } catch (parseError) { /* checked below */ }
check('ai-catalog.json is JSON', aiCatalog.status === 200 && aiCatalogJson !== null && /json/.test(aiCatalog.contentType), aiCatalog.contentType);
check('it names the MCP server, its transport and its sign-in', aiCatalogJson && aiCatalogJson.mcpServers[0].name === 'educore-standards' && aiCatalogJson.mcpServers[0].transport === 'streamable-http' && /\/mcp$/.test(aiCatalogJson.mcpServers[0].url) && aiCatalogJson.mcpServers[0].authentication);
check('it lists the public APIs, the use-case diagram among them', aiCatalogJson && aiCatalogJson.apis.length >= 6 && aiCatalogJson.apis.some((oneApi) => oneApi.requestBody && (oneApi.requestBody.action || []).includes('useCaseDiagram')));
const mcpDeclaration = await fetchText('/.well-known/mcp.json');
let mcpDeclarationJson = null;
try { mcpDeclarationJson = JSON.parse(mcpDeclaration.text); } catch (parseError) { /* checked below */ }
check('mcp.json declares the same server', mcpDeclarationJson && mcpDeclarationJson.mcpServers['educore-standards'].url === aiCatalogJson.mcpServers[0].url);

console.log('A3 robots.txt and the sitemap');
const robotsTxt = await fetchText('/robots.txt');
check('nothing is blocked wholesale', !/^Disallow:\s*\/\s*$/m.test(robotsTxt.text));
check('every crawler may read the site', /User-agent: \*\nAllow: \//.test(robotsTxt.text));
check('the AI agents are named and allowed', ['GPTBot', 'ClaudeBot', 'Claude-User', 'PerplexityBot', 'Google-Extended'].every((agentName) => robotsTxt.text.includes(`User-agent: ${agentName}`)));
check('it names the sitemap', /^Sitemap: https:\/\/educore\.org\/sitemap\.xml$/m.test(robotsTxt.text));
const sitemapXml = await fetchText('/sitemap.xml');
check('the sitemap lists the public pages', sitemapXml.status === 200 && ['/explore/use-cases', '/explore/standards</loc>', '/explore/standards/downloads'].every((pathText) => sitemapXml.text.includes(pathText)));

console.log('A4 the site\'s JSON-LD before any JavaScript');
for (const routePath of ['/', '/explore/standards', '/explore/use-cases']) {
	const pageHtml = await fetchText(routePath);
	const siteBlock = jsonLdBlockListOf(pageHtml.text).map((blockText) => { try { return JSON.parse(blockText); } catch (parseError) { return null; } }).find((oneBlock) => oneBlock && oneBlock['@graph']);
	const typeList = siteBlock ? siteBlock['@graph'].map((oneNode) => oneNode['@type']) : [];
	check(`${routePath}: Organization and WebSite are in the HTML`, typeList.includes('Organization') && typeList.includes('WebSite'), typeList.join(', '));
}

console.log('A5 each page\'s own JSON-LD');
const browser = await chromium.launch(argumentByName.chromePath ? { executablePath: argumentByName.chromePath } : {});
try {
	const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
	await context.route((requestUrl) => requestUrl.pathname.startsWith('/api/'), answerApi);
	const page = await context.newPage();
	// the page's JSON-LD once the block of this type has appeared (data arrives after the page draws)
	const jsonLdOfType = async (routePath, wantedType) => {
		await page.goto(`${baseUrl}${routePath}`, { waitUntil: 'load' });
		await page.waitForFunction((typeName) => [...document.querySelectorAll('script[type="application/ld+json"]')].some((scriptElement) => scriptElement.textContent.includes(`"@type":"${typeName}"`)), wantedType, { timeout: 20000 }).catch(() => {});
		const blockTextList = await page.$$eval('script[type="application/ld+json"]', (scriptList) => scriptList.map((scriptElement) => scriptElement.textContent));
		const parsedList = blockTextList.map((blockText) => { try { return JSON.parse(blockText); } catch (parseError) { return { unparsable: blockText.slice(0, 80) }; } });
		return { parsedList, unparsableCount: parsedList.filter((oneBlock) => oneBlock.unparsable).length, openScriptCount: blockTextList.filter((blockText) => /<\/script/i.test(blockText)).length };
	};

	const catalog = await jsonLdOfType('/explore/standards', 'ItemList');
	const catalogList = catalog.parsedList.find((oneBlock) => oneBlock['@type'] === 'ItemList');
	check('the specification catalog is an ItemList of 15 CreativeWorks', catalogList && catalogList.itemListElement.length === 15 && catalogList.itemListElement.every((oneItem) => oneItem.item['@type'] === 'CreativeWork' && oneItem.item.name));
	const cedsItem = catalogList && catalogList.itemListElement.find((oneItem) => /\(CEDS\)/.test(oneItem.item.name));
	check('a specification the graph holds links to its walk in the explorer', cedsItem && /\/explore\/standards\?path=families%3Aall%2Cfamily%3ACEDS$/.test(cedsItem.item.subjectOf.url), cedsItem && cedsItem.item.subjectOf && cedsItem.item.subjectOf.url);

	const downloads = await jsonLdOfType('/explore/standards/downloads', 'Dataset');
	const downloadList = downloads.parsedList.find((oneBlock) => oneBlock['@type'] === 'ItemList');
	check('the downloads are Datasets with zip DataDownloads', downloadList && downloadList.itemListElement.length === 3 && downloadList.itemListElement.every((oneItem) => oneItem.item['@type'] === 'Dataset' && oneItem.item.distribution.length === 2 && oneItem.item.distribution.every((oneDownload) => oneDownload['@type'] === 'DataDownload' && oneDownload.encodingFormat === 'application/zip')));

	const caseListPage = await jsonLdOfType('/explore/use-cases', 'ItemList');
	const caseList = caseListPage.parsedList.find((oneBlock) => oneBlock['@type'] === 'ItemList');
	check('the use-case list is an ItemList linking each case', caseList && caseList.itemListElement.length === 1 && /\/explore\/use-cases\/forged\/uc%3Atranscript-exchange$/.test(caseList.itemListElement[0].item.url));
	check('the use-case list names itself', /^Use Cases · EDUcore$/.test(await page.title()), await page.title());

	const useCasePage = await jsonLdOfType(`/explore/use-cases/forged/${encodeURIComponent(useCaseFixture.useCase.caseStableId)}`, 'HowTo');
	const howTo = useCasePage.parsedList.find((oneBlock) => oneBlock['@type'] === 'HowTo');
	check('a use case is a HowTo of its 6 steps in order', howTo && howTo.step.length === 6 && howTo.step.every((oneStep, stepIndex) => oneStep['@type'] === 'HowToStep' && oneStep.position === stepIndex + 1));
	const firstStepTermList = howTo ? howTo.step[0].about : [];
	check('a step names the CEDS elements it uses (DefinedTerm, termCode, set)', firstStepTermList.some((oneTerm) => oneTerm['@type'] === 'DefinedTerm' && oneTerm.termCode === 'P001572' && oneTerm.inDefinedTermSet === 'CEDS'), JSON.stringify(firstStepTermList.slice(0, 1)));
	check('the case is about its resolved elements', howTo && howTo.about.length === 7);
	check('a step name carrying markup cannot close its script tag', useCasePage.openScriptCount === 0 && howTo && howTo.step[5].name.includes('<manual>'));
	check('the use case page names itself', /^Transcript exchange · Use Cases · EDUcore$/.test(await page.title()), await page.title());
	check('every JSON-LD block on these pages parses', [catalog, downloads, caseListPage, useCasePage].every((onePage) => onePage.unparsableCount === 0));
} finally {
	await browser.close();
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
