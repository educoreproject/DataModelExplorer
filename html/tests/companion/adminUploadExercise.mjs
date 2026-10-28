// adminUploadExercise.mjs — ONE real upload and ONE restore through the companion page's admin UI on a running site
// (SPEC-companionPages-102826, Phase 4; the doubt both earlier stand-downs left open: upload through the real server).
// It WRITES the site's database and source folder: back the database up first.
//   1. as an admin-role user, open the page and note its compile
//   2. upload --uploadFile as a new version of --sourceRole/--sourcePart, with an origin note and document date; the
//      page re-reads its compile: it must be a NEW compile, current
//   3. press "Restore as current" on the row --restoreSourceRefId; the page re-reads: a new compile again, current, whose
//      source-set stamp equals the first compile's (the same bytes are current again)
// Each step's compile answer and screenshots go to --evidenceDir, with a summary.json. --stepList=restore runs step 3
// alone (after a run whose restore did not complete), checked against --expectedSourceSetSha256, the source-set stamp
// from before the upload; the default is upload,restore.
//
//   node html/tests/companion/adminUploadExercise.mjs --baseUrl=… --adminUserName=… --adminPasswordFile=…
//        --playwrightCorePath=… --chromePath=… --evidenceDir=… --sourceRole=… --sourcePart=… --uploadFile=…
//        --documentDate=YYYY-MM-DD --originNote=… --restoreSourceRefId=…

import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
const requiredNameList = ['baseUrl', 'adminUserName', 'adminPasswordFile', 'playwrightCorePath', 'chromePath', 'evidenceDir', 'sourceRole', 'sourcePart', 'uploadFile', 'documentDate', 'originNote', 'restoreSourceRefId'];
const missingNameList = requiredNameList.filter((argumentName) => argumentByName[argumentName] === undefined || argumentByName[argumentName] === '');
if (missingNameList.length > 0) {
	console.error(`adminUploadExercise: missing --${missingNameList.join(', --')}`);
	process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(argumentByName.playwrightCorePath);
const baseUrl = argumentByName.baseUrl.replace(/\/$/, '');
fs.mkdirSync(argumentByName.evidenceDir, { recursive: true });
const shotPath = (shotName) => path.join(argumentByName.evidenceDir, `${shotName}.png`);
const PAGE_PATH = '/explore/companion/jedx-dictionary';
const STEP_NAME_LIST = ['upload', 'restore'];
const chosenStepList = (argumentByName.stepList || STEP_NAME_LIST.join(',')).split(',');
if (chosenStepList.some((stepName) => !STEP_NAME_LIST.includes(stepName))) {
	console.error(`adminUploadExercise: --stepList '${argumentByName.stepList}' may name only ${STEP_NAME_LIST.join(', ')}`);
	process.exit(2);
}
const partName = [argumentByName.sourceRole, argumentByName.sourcePart].filter(Boolean).join(' ');

let passed = 0;
let failed = 0;
const check = (checkName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${checkName}`); return; }
	failed++;
	console.log(`  FAIL: ${checkName}${detailText ? ` (${detailText})` : ''}`);
};

const browser = await chromium.launch({ executablePath: argumentByName.chromePath });
const summary = { startedAt: new Date().toISOString() };
try {
	const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
	const compileAnswerList = [];
	const historyAnswerList = [];
	page.on('response', async (response) => {
		if (response.status() !== 200) return;
		if (response.url().endsWith('/api/companion-compile-current')) compileAnswerList.push((await response.json())[0]);
		if (response.url().endsWith('/api/companion-source-history')) historyAnswerList.push(await response.json());
	});
	const compileCountBefore = () => compileAnswerList.length;
	// the compile answer that arrives after countBefore answers (the page re-reads its compile after an upload)
	const waitForNewCompile = async (countBefore) => {
		const deadline = Date.now() + 60000;
		while (compileAnswerList.length <= countBefore && Date.now() < deadline) await page.waitForTimeout(250);
		return compileAnswerList[compileAnswerList.length - 1];
	};
	const compileStampsOf = (compileAnswer) => ({ isCurrent: compileAnswer.isCurrent, ...compileAnswer.compileRecord });
	const currentRowOf = () => historyAnswerList[historyAnswerList.length - 1].find((sourceRecord) => sourceRecord.sourceRole === argumentByName.sourceRole && sourceRecord.sourcePart === argumentByName.sourcePart && sourceRecord.isCurrent);

	await page.goto(`${baseUrl}/login?redirect=${encodeURIComponent(PAGE_PATH)}`);
	await page.getByLabel('User Name').fill(argumentByName.adminUserName);
	await page.getByLabel('Password', { exact: true }).fill(fs.readFileSync(argumentByName.adminPasswordFile, 'utf8').trim());
	await page.getByRole('button', { name: 'Login' }).click();
	await page.waitForSelector('[data-testid="companion-admin"]', { timeout: 60000 });
	await page.waitForTimeout(2000);
	const firstCompile = compileAnswerList[0];
	const firstCurrentRow = currentRowOf();
	summary.firstCompile = compileStampsOf(firstCompile);
	summary.firstCurrentRow = firstCurrentRow;
	console.log(`1 the page's compile ${firstCompile.compileRecord.refId}, current ${firstCompile.isCurrent}; current ${partName} row ${firstCurrentRow.refId}`);

	if (chosenStepList.includes('upload')) {
		console.log(`2 upload ${path.basename(argumentByName.uploadFile)} as a new ${partName}`);
		await page.locator('[data-testid="admin-upload-part"]').click();
		await page.locator('.v-overlay .v-list-item', { hasText: new RegExp(`^${partName}$`) }).first().click();
		await page.locator('[data-testid="admin-upload-file"] input[type="file"]').setInputFiles(argumentByName.uploadFile);
		await page.locator('[data-testid="admin-upload-origin-note"] input').fill(argumentByName.originNote);
		await page.locator('[data-testid="admin-upload-document-date"] input').fill(argumentByName.documentDate);
		await page.locator('[data-testid="admin-upload-form"]').screenshot({ path: shotPath('upload-1-formFilled') });
		const countBeforeUpload = compileCountBefore();
		await page.locator('[data-testid="admin-upload-submit"]').click();
		await page.waitForSelector('[data-testid="admin-upload-done"], [data-testid="admin-upload-error"]', { timeout: 60000 });
		const uploadErrorText = (await page.locator('[data-testid="admin-upload-error"]').count()) ? await page.locator('[data-testid="admin-upload-error"]').innerText() : '';
		check('the upload is accepted', !uploadErrorText, uploadErrorText);
		const uploadCompile = await waitForNewCompile(countBeforeUpload);
		await page.waitForTimeout(1500);
		const uploadedRow = currentRowOf();
		const uploadedSha256 = crypto.createHash('sha256').update(fs.readFileSync(argumentByName.uploadFile)).digest('hex');
		summary.uploadedRow = uploadedRow;
		summary.uploadCompile = compileStampsOf(uploadCompile);
		check('the uploaded file is the current row, with the sha256 of the bytes sent', uploadedRow.refId !== firstCurrentRow.refId && uploadedRow.sha256 === uploadedSha256, `${uploadedRow.refId} ${uploadedRow.sha256}`);
		check('uploadedBy is the signed-in admin', uploadedRow.uploadedBy === argumentByName.adminUserName, uploadedRow.uploadedBy);
		check('the next view recompiled: a new compile, current', uploadCompile.isCurrent === true && uploadCompile.compileRecord.refId !== firstCompile.compileRecord.refId, uploadCompile.compileRecord.refId);
		check('its source-set stamp changed', uploadCompile.compileRecord.sourceSetSha256 !== firstCompile.compileRecord.sourceSetSha256);
		await page.locator('[data-testid="admin-upload-done"]').screenshot({ path: shotPath('upload-2-done') });
		await page.locator(`[data-testid="admin-history-${argumentByName.sourceRole}-${argumentByName.sourcePart || 'whole'}"]`).screenshot({ path: shotPath('upload-3-history') });
	}

	if (chosenStepList.includes('restore')) {
		console.log(`3 restore row ${argumentByName.restoreSourceRefId}`);
		const restoreTargetRow = historyAnswerList[historyAnswerList.length - 1].find((sourceRecord) => sourceRecord.refId === argumentByName.restoreSourceRefId);
		const compileBeforeRestore = compileAnswerList[compileAnswerList.length - 1];
		const countBeforeRestore = compileCountBefore();
		await page.locator(`[data-testid="admin-restore-${argumentByName.restoreSourceRefId}"]`).click();
		await page.waitForFunction(() => /is current again/.test(document.querySelector('[data-testid="admin-upload-done"]')?.innerText || '') || document.querySelector('[data-testid="admin-upload-error"]'), null, { timeout: 60000 });
		const restoreErrorText = (await page.locator('[data-testid="admin-upload-error"]').count()) ? await page.locator('[data-testid="admin-upload-error"]').innerText() : '';
		check('the restore is accepted', !restoreErrorText, restoreErrorText);
		const restoreCompile = await waitForNewCompile(countBeforeRestore);
		await page.waitForTimeout(1500);
		const restoredRow = currentRowOf();
		summary.restoredRow = restoredRow;
		summary.restoreCompile = compileStampsOf(restoreCompile);
		check('the restored version is current, as a new row with the restored bytes', restoredRow.refId !== argumentByName.restoreSourceRefId && restoredRow.sha256 === restoreTargetRow.sha256 && restoredRow.originNote.endsWith(`[restored from source ${argumentByName.restoreSourceRefId}]`), `${restoredRow.refId} ${restoredRow.sha256}`);
		check('the next view recompiled again: a new compile, current', restoreCompile.isCurrent === true && restoreCompile.compileRecord.refId !== compileBeforeRestore.compileRecord.refId, restoreCompile.compileRecord.refId);
		const expectedSourceSetSha256 = argumentByName.expectedSourceSetSha256 || firstCompile.compileRecord.sourceSetSha256;
		check(`its source-set stamp is the one before the upload (${expectedSourceSetSha256.slice(0, 12)})`, restoreCompile.compileRecord.sourceSetSha256 === expectedSourceSetSha256, restoreCompile.compileRecord.sourceSetSha256);
		await page.locator(`[data-testid="admin-history-${argumentByName.sourceRole}-${argumentByName.sourcePart || 'whole'}"]`).screenshot({ path: shotPath('upload-4-historyAfterRestore') });
		await page.locator('[data-testid="admin-compile-history"]').screenshot({ path: shotPath('upload-5-compileHistory') });
		await page.locator('[data-testid="companion-stamps"]').screenshot({ path: shotPath('upload-6-stamps') });
	}
} finally {
	await browser.close();
	summary.finishedAt = new Date().toISOString();
	fs.writeFileSync(path.join(argumentByName.evidenceDir, 'summary.json'), JSON.stringify(summary, null, '\t'));
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
