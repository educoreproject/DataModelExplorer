// raterHowToRate.spec.mjs — revision 17 browser gates (WORKORDER-RATER17, TQ 2026-10-18: "sure. make it pretty."). The
// two links into the instructions page take that page's heading, "How to rate". In the element panel the link leaves
// the "How to answer" bullets and becomes a call to action at the foot of the box, in the element's family colour.
// Mostly driven through the admin preview (the raters' own rating screen, read-only); the phone check and the return
// observation need a real rater page, so one temporary rater is made through the admin API, saves nothing, and is removed.
//   H17.1 the element panel's "How to answer" box ends with a link whose accessible name is "How to rate", outside the
//         bullet list, pointing at /rater/instructions in the same tab; the bullets no longer carry a link
//   H17.2 it is styled, not a browser link: family ink text and border, no underline, a fill that is neither transparent
//         nor the panel's own tint, a stronger fill on hover, the rater focus ring on keyboard focus; checked on an
//         element of each standard the walk meets (Ed-Fi, SIF, PESC)
//   H17.3 on a rater's own page at phone width (390px) it is at least 44px tall and the page does not scroll sideways
//   H17.4 clicking it reaches /rater/instructions, whose heading is "How to rate"
//   H17.5 the admin "Rating pages" strip notes the instructions page as "How to rate. Readable without signing in."
//   H17.6 "how we are judging this" is on no rater page the walk opens, and (with --bundleDir) in no file of the build
//   OBSERVED (reported, not gated; WORKORDER-RATER17 says report, do not fix): which item a rater on item 3 comes back
//         to from the instructions page, by its "Back to rating" link and by the browser's Back. Revision 18 fixed it and
//         gates it in raterBackKeepsPlace.spec.mjs; from revision 18 the bullets are TQ's five, not four
//
//   node html/tests/rater/raterHowToRate.spec.mjs --baseUrl=… --adminUserName=… --adminPasswordFile=<file>
//        --surveyName=A --raterPrefix=rater17-howto --playwrightCorePath=… --chromePath=… --evidenceDir=…
//        [--bundleDir=<html/.output/public>]

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'adminUserName', 'adminPasswordFile', 'surveyName', 'raterPrefix', 'playwrightCorePath', 'chromePath', 'evidenceDir'];
const missingNameList = requiredNameList.filter((argumentName) => !argumentByName[argumentName]);
if (missingNameList.length > 0) {
	console.error(`raterHowToRate: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
if (argumentByName.bundleDir && !fs.existsSync(argumentByName.bundleDir)) {
	console.error(`raterHowToRate: --bundleDir '${argumentByName.bundleDir}' does not exist`);
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const adminPassword = fs.readFileSync(argumentByName.adminPasswordFile, 'utf8').trim();
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
const surveyName = argumentByName.surveyName;
const raterUserName = `${argumentByName.raterPrefix}-1`;
fs.mkdirSync(argumentByName.evidenceDir, { recursive: true });
const shotPath = (shotName) => path.join(argumentByName.evidenceDir, `${shotName}.png`);

const TAB_URL_PATTERN = /\/admin\/?\?tool=ceds-rater$/;
const LINK_NAME = 'How to rate';
const OLD_LINK_PATTERN = /how we are judging this/i;
const INSTRUCTIONS_NOTE = 'How to rate. Readable without signing in.';
const PHONE_VIEWPORT = { width: 390, height: 844 };
const MIN_TAP_HEIGHT = 44;
const MAX_WALK_ITEM_COUNT = 50;
// the element panel's family ink and tint (ElementPanel.vue FAMILY_STYLE_BY_STANDARD), as computed colours
const FAMILY_COLOUR_BY_STANDARD = Object.freeze({
	'Ed-Fi': { ink: 'rgb(30, 122, 76)', tint: 'rgb(230, 244, 236)' },
	SIF: { ink: 'rgb(107, 63, 160)', tint: 'rgb(241, 235, 248)' },
	PESC: { ink: 'rgb(7, 42, 108)', tint: 'rgb(231, 236, 246)' },
});
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

const apiPost = async (routeName, requestBody, authtoken) => {
	const response = await fetch(`${baseUrl}/api/${routeName}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authtoken ? { Authorization: `Bearer ${authtoken}` } : {}) }, body: JSON.stringify(requestBody) });
	const bodyText = await response.text();
	return { statusCode: response.status, bodyText, bodyJson: /^\s*[[{]/.test(bodyText) ? JSON.parse(bodyText) : null, authtoken: response.headers.get('authtoken') };
};
const firstOf = (bodyJson) => (Array.isArray(bodyJson) ? bodyJson[0] : bodyJson);

const browser = await chromium.launch({ executablePath: argumentByName.chromePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const waitForPreviewItem = async (itemNumber) => {
	await page.waitForURL(previewUrlPatternOf(itemNumber), { timeout: 20000 });
	await page.waitForFunction((expectedNumber) => {
		const crumb = document.querySelector('[data-testid="rater-item-crumb"]');
		return crumb && crumb.textContent.includes(`Item ${expectedNumber} of`) && document.querySelectorAll('[data-testid="rater-candidate-row"]').length > 0;
	}, itemNumber, { timeout: 20000 });
};
const panelSelector = '[data-testid="rater-element-panel"]';
const howToRateLocator = () => page.locator(panelSelector).getByRole('link', { name: LINK_NAME, exact: true });
const openHowToAnswer = () => page.locator(`${panelSelector} details.rt-how`).evaluate((detailsElement) => { detailsElement.open = true; });

// the link's place and look, read from the page
const readLinkState = (targetPage = page) => targetPage.evaluate((linkName) => {
	const panel = document.querySelector('[data-testid="rater-element-panel"]');
	const howBox = panel.querySelector('details.rt-how');
	const linkList = Array.from(panel.querySelectorAll('a')).filter((anchor) => anchor.textContent.replace(/\s+/g, ' ').trim().startsWith(linkName));
	const link = linkList[0];
	if (!link) {
		return { linkCount: 0, standard: panel.getAttribute('data-standard') };
	}
	const style = getComputedStyle(link);
	const rect = link.getBoundingClientRect();
	return {
		linkCount: linkList.length,
		standard: panel.getAttribute('data-standard'),
		panelBackground: getComputedStyle(panel).backgroundColor,
		href: link.getAttribute('href'),
		target: link.getAttribute('target'),
		isInHowBox: howBox.contains(link),
		isInBulletList: Boolean(link.closest('ul')),
		isLastInHowBox: howBox.lastElementChild === link || howBox.lastElementChild.contains(link),
		bulletLinkCount: howBox.querySelectorAll('ul a').length,
		bulletCount: howBox.querySelectorAll('ul > li').length,
		color: style.color,
		borderColor: style.borderTopColor,
		borderStyle: style.borderTopStyle,
		textDecorationLine: style.textDecorationLine,
		backgroundColor: style.backgroundColor,
		height: rect.height,
		hasArrow: Array.from(link.querySelectorAll('[aria-hidden="true"]')).some((arrow) => /[→›➜]/.test(arrow.textContent)),
	};
}, LINK_NAME);

let raterWasMade = false;
let adminToken = null;
try {
	// ---------------------------------------------------------------- open the preview
	console.log(`H17.0 open survey ${surveyName} in the preview`);
	await page.goto(`${baseUrl}/login?redirect=${encodeURIComponent('/admin?tool=ceds-rater')}`);
	await page.getByLabel('User Name').fill(argumentByName.adminUserName);
	await page.getByLabel('Password', { exact: true }).fill(adminPassword);
	await page.getByRole('button', { name: 'Login' }).click();
	await page.waitForURL(TAB_URL_PATTERN, { timeout: 20000 });

	// ---------------------------------------------------------------- H17.5 the admin strip
	console.log('H17.5 the Rating pages strip names the page "How to rate"');
	const instructionsRowText = (await page.locator('[data-testid="rating-pages-strip"] li').filter({ has: page.locator('[data-testid="rating-page-link-instructions"]') }).innerText()).replace(/\s+/g, ' ');
	check(`the instructions row notes "${INSTRUCTIONS_NOTE}" (${instructionsRowText})`, instructionsRowText.includes(INSTRUCTIONS_NOTE));
	const adminPageText = await page.locator('body').innerText();
	check('"how we are judging this" is not on the admin raters view', !OLD_LINK_PATTERN.test(adminPageText));
	await page.locator('[data-testid="rating-pages-strip"]').screenshot({ path: shotPath('170-rating-pages-strip') });

	await page.click(`[data-testid="rater-surveys-view-${surveyName}"]`);
	await page.click(`[data-testid="rater-surveys-item-preview-1"]`);
	await waitForPreviewItem(1);

	// ---------------------------------------------------------------- H17.1, H17.2 on an element of each standard
	const linkStateByStandard = {};
	for (let itemNumber = 1; itemNumber <= MAX_WALK_ITEM_COUNT && Object.keys(linkStateByStandard).length < Object.keys(FAMILY_COLOUR_BY_STANDARD).length; itemNumber++) {
		if (itemNumber > 1) {
			await page.click('[data-testid="rater-preview-next"]');
			await waitForPreviewItem(itemNumber);
		}
		const standardName = await page.locator(panelSelector).getAttribute('data-standard');
		if (linkStateByStandard[standardName]) {
			continue;
		}
		await openHowToAnswer();
		await page.mouse.move(0, 0);
		const restState = await readLinkState();
		if (restState.linkCount === 0) {
			linkStateByStandard[standardName] = { itemNumber, restState };
			continue;
		}
		await howToRateLocator().hover();
		await page.waitForTimeout(250);
		const hoverBackground = (await readLinkState()).backgroundColor;
		await page.mouse.move(0, 0);
		// keyboard focus: focus the summary, then Tab forward until the link has it
		await page.locator(`${panelSelector} details.rt-how summary`).focus();
		let focusRing = null;
		for (let tabCount = 0; tabCount < 4 && !focusRing; tabCount++) {
			await page.keyboard.press('Tab');
			focusRing = await page.evaluate((linkName) => {
				const focused = document.activeElement;
				if (!focused || focused.tagName !== 'A' || !focused.textContent.trim().startsWith(linkName)) {
					return null;
				}
				const style = getComputedStyle(focused);
				return { outline: `${style.outlineStyle} ${style.outlineWidth}`, shadow: style.boxShadow, backgroundColor: style.backgroundColor };
			}, LINK_NAME);
		}
		await page.locator(panelSelector).screenshot({ path: shotPath(`171-panel-${standardName}-focus`) });
		await page.evaluate(() => document.activeElement && document.activeElement.blur());
		linkStateByStandard[standardName] = { itemNumber, restState, hoverBackground, focusRing };
	}
	check(`the walk met an element of each standard (${Object.entries(linkStateByStandard).map(([standardName, linkState]) => `${standardName} at item ${linkState.itemNumber}`).join(', ')})`, Object.keys(FAMILY_COLOUR_BY_STANDARD).every((standardName) => linkStateByStandard[standardName]));

	console.log('H17.1 the link: its name, place and destination');
	Object.entries(linkStateByStandard).forEach(([standardName, { restState }]) => {
		check(`${standardName}: exactly one "${LINK_NAME}" link in the panel, inside the How to answer box`, restState.linkCount === 1 && restState.isInHowBox, JSON.stringify(restState));
		check(`${standardName}: it is outside the bullet list and is the box's last thing`, restState.isInBulletList === false && restState.isLastInHowBox === true);
		check(`${standardName}: the bullets carry no link and are TQ's five (revision 18; ${restState.bulletCount})`, restState.bulletLinkCount === 0 && restState.bulletCount === 5);
		check(`${standardName}: it points at /rater/instructions in the same tab (href ${restState.href}, target ${restState.target})`, restState.href === '/rater/instructions' && !restState.target);
		check(`${standardName}: it carries a small arrow, hidden from screen readers`, restState.hasArrow === true);
	});
	check(`the accessible name is exactly "${LINK_NAME}"`, (await howToRateLocator().count()) === 1);

	console.log('H17.2 the link is styled in the element\'s family colour');
	Object.entries(linkStateByStandard).forEach(([standardName, { restState, hoverBackground, focusRing }]) => {
		const familyColour = FAMILY_COLOUR_BY_STANDARD[standardName] || {};
		const isPaintedFill = (colourText) => Boolean(colourText) && colourText !== 'rgba(0, 0, 0, 0)' && colourText !== 'transparent';
		check(`${standardName}: text in the family ink ${familyColour.ink} (${restState.color}), no underline (${restState.textDecorationLine})`, restState.color === familyColour.ink && restState.textDecorationLine === 'none');
		check(`${standardName}: a solid border in the family ink (${restState.borderStyle} ${restState.borderColor})`, restState.borderStyle === 'solid' && restState.borderColor === familyColour.ink);
		check(`${standardName}: a fill that is painted and is not the panel's tint (${restState.backgroundColor} on ${restState.panelBackground})`, isPaintedFill(restState.backgroundColor) && restState.backgroundColor !== restState.panelBackground && restState.panelBackground === familyColour.tint);
		check(`${standardName}: hover gives a different, painted fill (${restState.backgroundColor} → ${hoverBackground})`, isPaintedFill(hoverBackground) && hoverBackground !== restState.backgroundColor);
		check(`${standardName}: keyboard focus shows the rater focus ring (${focusRing ? `${focusRing.outline}, ${focusRing.shadow.slice(0, 40)}` : 'never focused'})`, Boolean(focusRing) && focusRing.outline === 'solid 3px' && /255, 171, 64/.test(focusRing.shadow) && isPaintedFill(focusRing.backgroundColor) && focusRing.backgroundColor !== restState.backgroundColor);
	});

	// ---------------------------------------------------------------- screenshots, desktop then phone
	await openHowToAnswer();
	await howToRateLocator().evaluate((link) => link.scrollIntoView({ block: 'center' }));
	await page.screenshot({ path: shotPath('172-panel-desktop') });
	// ---------------------------------------------------------------- H17.6 the page text, then H17.4 the click
	const previewPageText = await page.locator('body').innerText();
	check('"how we are judging this" is not on the rating screen', !OLD_LINK_PATTERN.test(previewPageText));
	console.log('H17.4 clicking it reaches the instructions page');
	await openHowToAnswer();
	await howToRateLocator().click();
	await page.waitForURL(/\/rater\/instructions\/?$/, { timeout: 20000 });
	await page.locator('[data-testid="rater-instructions"] h1').waitFor({ timeout: 20000 });
	const headingText = (await page.locator('[data-testid="rater-instructions"] h1').innerText()).trim();
	check(`the click lands on /rater/instructions with the heading "${LINK_NAME}" (${headingText})`, headingText === LINK_NAME);
	check('"how we are judging this" is not on the instructions page', !OLD_LINK_PATTERN.test(await page.locator('body').innerText()));
	await page.goto(`${baseUrl}/rater`);
	await page.waitForLoadState('networkidle');
	check('"how we are judging this" is not on the rater sign-in page', !OLD_LINK_PATTERN.test(await page.locator('body').innerText()));

	// ---------------------------------------------------------------- H17.3 a rater's page at phone width
	console.log(`H17.3 on a rater's page at ${PHONE_VIEWPORT.width}px the link is at least ${MIN_TAP_HEIGHT}px tall`);
	const adminLogin = await apiPost('login', { username: argumentByName.adminUserName, password: adminPassword });
	adminToken = adminLogin.statusCode === 200 ? adminLogin.authtoken : null;
	if (!adminToken) {
		throw new Error(`admin login refused (${adminLogin.statusCode})`);
	}
	await apiPost('raterAdmin', { adminAction: 'remove', raterUserName }, adminToken);
	const addResponse = await apiPost('raterAdmin', { adminAction: 'add', raterUserName, whoText: 'How-to-rate test rater (temporary, lane RATER revision 17)', surveyName }, adminToken);
	const added = firstOf(addResponse.bodyJson);
	if (addResponse.statusCode !== 200 || !added || !added.issuedPassword) {
		throw new Error(`could not make ${raterUserName}: ${addResponse.statusCode} ${addResponse.bodyText.slice(0, 200)}`);
	}
	raterWasMade = true;
	const phonePage = await (await browser.newContext({ viewport: PHONE_VIEWPORT, isMobile: true, hasTouch: true })).newPage();
	const waitForRaterItem = (itemNumber) => phonePage.waitForFunction((expectedNumber) => {
		const crumb = document.querySelector('[data-testid="rater-item-crumb"]');
		return crumb && crumb.textContent.includes(`Item ${expectedNumber} of`) && document.querySelectorAll('[data-testid="rater-candidate-row"]').length > 0;
	}, itemNumber, { timeout: 20000 });
	const raterItemNumber = () => phonePage.evaluate(() => {
		const crumb = document.querySelector('[data-testid="rater-item-crumb"]');
		const matched = crumb && crumb.textContent.match(/Item (\d+) of/);
		return matched ? Number(matched[1]) : null;
	});
	await phonePage.goto(`${baseUrl}/rater`);
	await phonePage.fill('[data-testid="rater-signin-name"]', raterUserName);
	await phonePage.fill('[data-testid="rater-signin-password"]', added.issuedPassword);
	await phonePage.click('[data-testid="rater-signin-submit"]');
	await waitForRaterItem(1);
	await phonePage.locator(`${panelSelector} details.rt-how`).evaluate((detailsElement) => { detailsElement.open = true; });
	const phoneState = await readLinkState(phonePage);
	check(`${phoneState.standard}: the link is ${Math.round(phoneState.height)}px tall (>= ${MIN_TAP_HEIGHT}), in the family ink, not underlined`, phoneState.height >= MIN_TAP_HEIGHT && phoneState.color === (FAMILY_COLOUR_BY_STANDARD[phoneState.standard] || {}).ink && phoneState.textDecorationLine === 'none');
	const phonePageWidth = await phonePage.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
	check(`the page does not scroll sideways (${phonePageWidth.scrollWidth} <= ${phonePageWidth.clientWidth})`, phonePageWidth.scrollWidth <= phonePageWidth.clientWidth);
	await phonePage.locator(panelSelector).getByRole('link', { name: LINK_NAME, exact: true }).evaluate((link) => link.scrollIntoView({ block: 'center' }));
	await phonePage.screenshot({ path: shotPath('173-panel-phone') });

	// ---------------------------------------------------------------- OBSERVED: coming back from the instructions page
	console.log('OBSERVED a rater on item 3 who opens How to rate, then comes back');
	const returnObservationList = [];
	for (const returnWayName of ['the page\'s "Back to rating" link', 'the browser\'s Back']) {
		await phonePage.goto(`${baseUrl}/rater/rate?item=3`);
		await waitForRaterItem(3);
		await phonePage.locator(`${panelSelector} details.rt-how`).evaluate((detailsElement) => { detailsElement.open = true; });
		await phonePage.locator(panelSelector).getByRole('link', { name: LINK_NAME, exact: true }).click();
		// from revision 18 a rater's own item carries its place: /rater/instructions?item=3
		await phonePage.waitForURL(/\/rater\/instructions\/?(\?item=3)?$/, { timeout: 20000 });
		if (returnWayName.includes('Back to rating')) {
			await phonePage.getByRole('link', { name: 'Back to rating' }).first().click();
		} else {
			await phonePage.goBack();
		}
		await phonePage.waitForFunction(() => document.querySelectorAll('[data-testid="rater-candidate-row"]').length > 0, null, { timeout: 20000 });
		returnObservationList.push(`${returnWayName} → item ${await raterItemNumber()} (${new URL(phonePage.url()).pathname}${new URL(phonePage.url()).search})`);
	}
	returnObservationList.forEach((observationText) => console.log(`  OBSERVED: from item 3, ${observationText}`));
} catch (walkError) {
	check('the How to rate walkthrough ran to the end', false, `${walkError && walkError.message}`.split('\n')[0]);
	await page.screenshot({ path: shotPath('179-how-to-rate-failure') }).catch(() => {});
} finally {
	if (raterWasMade) {
		const removeResponse = await apiPost('raterAdmin', { adminAction: 'remove', raterUserName }, adminToken).catch((removeError) => ({ statusCode: `${removeError}` }));
		check(`the temporary rater ${raterUserName} is removed (${removeResponse.statusCode})`, removeResponse.statusCode === 200);
	}
	await browser.close();
}

// ---------------------------------------------------------------- H17.6 the built bundle
if (argumentByName.bundleDir) {
	const fileListOf = (dirPath) => fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? fileListOf(path.join(dirPath, entry.name)) : [path.join(dirPath, entry.name)]));
	const textFileList = fileListOf(argumentByName.bundleDir).filter((filePath) => /\.(js|mjs|html|json|css|txt)$/.test(filePath));
	const leakFileList = textFileList.filter((filePath) => OLD_LINK_PATTERN.test(fs.readFileSync(filePath, 'utf8')));
	check(`"how we are judging this" is in none of the build's ${textFileList.length} text files`, textFileList.length > 0 && leakFileList.length === 0, leakFileList.slice(0, 3).join(', '));
}

console.log(`\n=== raterHowToRate (revision 17 browser) — Results: ${passCount} passed, ${failCount} failed ===`);
process.exit(failCount === 0 ? 0 : 1);
