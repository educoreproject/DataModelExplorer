// useCaseDiagram.spec.mjs — the use case map on a forged use case's Overview tab, in a real browser against a running dev
// server. Every /api/* call is answered here: the case from server/test/fixtures/useCaseDiagramFixture.js, and the
// diagram drawn by the SERVER's own renderer (render-use-case-diagram) on the same rows, so the browser decodes exactly
// what the server would send. Needs no backend and no graph.
//   M1 the Overview shows the map: a heading, an image the browser decodes (a well-formed SVG of the case), its text
//      alternative and caption from the server's summary
//   M2 Download SVG saves the server's SVG, named after the case
//   M3 a refused diagram says why and offers Try again, which draws it
//
//   node html/tests/forgedUseCases/useCaseDiagram.spec.mjs --baseUrl=http://localhost:3000 [--evidenceDir=…]
//        [--playwrightPath=playwright] [--chromePath=…]

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const requireHere = createRequire(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { renderUseCaseDiagram } = requireHere(path.join(repositoryRoot, 'server/data-model/lib/use-case-diagram/render-use-case-diagram.js'));
const fixture = requireHere(path.join(repositoryRoot, 'server/test/fixtures/useCaseDiagramFixture.js'));

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
if (!argumentByName.baseUrl) {
	console.error('useCaseDiagram: missing --baseUrl');
	process.exit(2);
}
const { chromium } = requireHere(argumentByName.playwrightPath || 'playwright');
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
const evidenceDir = argumentByName.evidenceDir || '';
if (evidenceDir) fs.mkdirSync(evidenceDir, { recursive: true });

let passed = 0;
let failed = 0;
const check = (checkName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${checkName}${detailText ? ` (${detailText})` : ''}`); return; }
	failed++;
	console.log(`  FAIL: ${checkName}${detailText ? ` (${detailText})` : ''}`);
};

const caseStableId = fixture.useCase.caseStableId;
const expectedDiagram = renderUseCaseDiagram(fixture);
const caseAnswer = {
	useCase: fixture.useCase,
	stepList: fixture.stepList.map((oneStep) => ({ ...oneStep, dataList: [] })),
	citationList: fixture.citationList,
	citationStateCountList: [],
	contextBySection: fixture.contextBySection,
	implementationGuide: { citedElementList: [], standardList: [] },
};

let refuseDiagram = false;
const answerApi = async (route) => {
	const body = route.request().postDataJSON?.() || {};
	const json = (payload) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
	if (new URL(route.request().url()).pathname.endsWith('/api/forged-use-cases')) {
		if (body.action === 'case') return json([caseAnswer]);
		if (body.action === 'useCaseDiagram') {
			if (refuseDiagram) return route.fulfill({ status: 400, contentType: 'text/plain', body: 'forged-use-cases: caseStepDataLinkList failed: fixture refusal (abc123)' });
			return json([{ caseStableId: body.caseStableId, ...expectedDiagram }]);
		}
	}
	return json([]);
};

const browser = await chromium.launch(argumentByName.chromePath ? { executablePath: argumentByName.chromePath } : {});
try {
	const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
	await context.route((requestUrl) => requestUrl.pathname.startsWith('/api/'), answerApi);
	const page = await context.newPage();
	const pageErrorList = [];
	page.on('pageerror', (error) => pageErrorList.push(error.message));

	console.log('M1 the map on the Overview');
	await page.goto(`${baseUrl}/explore/use-cases/forged/${encodeURIComponent(caseStableId)}`, { waitUntil: 'load' });
	await page.waitForSelector('[data-testid="use-case-diagram-image"]', { timeout: 30000 }).catch(() => {});
	check('the map has a heading', (await page.getByRole('heading', { name: 'USE CASE MAP' }).count()) === 1);
	const imageFacts = await page.locator('[data-testid="use-case-diagram-image"]').evaluate((imageElement) => imageElement.decode().then(() => ({ naturalWidth: imageElement.naturalWidth, naturalHeight: imageElement.naturalHeight, alt: imageElement.alt })).catch((decodeError) => ({ decodeError: String(decodeError) }))).catch((error) => ({ decodeError: error.message }));
	check('the browser decodes the server\'s SVG', imageFacts.naturalWidth === expectedDiagram.width && imageFacts.naturalHeight === expectedDiagram.height, JSON.stringify(imageFacts).slice(0, 160));
	check('its text alternative is the server\'s summary', (imageFacts.alt || '').includes(expectedDiagram.summary.summaryText));
	check('its caption is the summary', ((await page.locator('[data-testid="use-case-diagram-summary"]').textContent()) || '').trim() === expectedDiagram.summary.summaryText);
	check('it sits on the Overview, above the actors', await page.locator('[data-testid="panel-overview"] [data-testid="use-case-diagram"]').count() === 1);
	if (evidenceDir) {
		await page.locator('[data-testid="use-case-diagram"]').scrollIntoViewIfNeeded();
		await page.screenshot({ path: path.join(evidenceDir, 'M1-overviewMap.png') });
	}

	console.log('M2 Download SVG');
	const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.locator('[data-testid="use-case-diagram-download"]').click()]);
	const savedPath = path.join(evidenceDir || fs.mkdtempSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp-')), download.suggestedFilename());
	await download.saveAs(savedPath);
	const savedText = fs.readFileSync(savedPath, 'utf8');
	check('it saves the server\'s SVG', savedText === expectedDiagram.svgText, `${savedText.length} bytes`);
	check('named after the case', download.suggestedFilename() === 'uc-transcript-exchange-use-case-map.svg', download.suggestedFilename());
	if (!evidenceDir) fs.rmSync(path.dirname(savedPath), { recursive: true, force: true });

	console.log('M3 a refused diagram');
	refuseDiagram = true;
	await page.reload({ waitUntil: 'load' });
	await page.waitForSelector('[data-testid="use-case-diagram-error"]', { timeout: 30000 }).catch(() => {});
	check('it says why', /could not be drawn: forged-use-cases: caseStepDataLinkList failed/.test((await page.locator('[data-testid="use-case-diagram-error"]').textContent().catch(() => '')) || ''));
	refuseDiagram = false;
	await page.locator('[data-testid="use-case-diagram-error"]').getByRole('button', { name: 'Try again' }).click();
	await page.waitForSelector('[data-testid="use-case-diagram-image"]', { timeout: 15000 }).catch(() => {});
	check('Try again draws it', (await page.locator('[data-testid="use-case-diagram-image"]').count()) === 1);

	check('no page errors', pageErrorList.length === 0, pageErrorList.join(' | '));
} finally {
	await browser.close();
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
