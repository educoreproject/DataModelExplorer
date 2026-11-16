#!/usr/bin/env node
// qualityReportText.test.mjs — the Certification page reads the report's inline text exactly as the generator's HTML does
// (cli/lib.d/quality-report/lib/documentRenderer.js inlineHtmlOf: **bold**, then `code`, nothing else), and its display
// helpers refuse what they cannot read rather than guessing. Every report paragraph the committed report holds is drawn
// through inlineSegmentListOf and compared with the generator's own HTML for it.
//
//   node html/tests/qualityReport/qualityReportText.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { inlineSegmentListOf, shortIdentityOf, dayTextOf } from '../../components/qualityReport/qualityReportText.js';

const require = createRequire(import.meta.url);
const testDirectoryPath = path.dirname(fileURLToPath(import.meta.url));
const codeDirectoryPath = path.resolve(testDirectoryPath, '../../..');
const { RENDERER_SET_BY_FORMAT_NAME } = require(path.join(codeDirectoryPath, 'cli/lib.d/quality-report/lib/documentRenderer.js'));
const reportPage = JSON.parse(fs.readFileSync(path.join(codeDirectoryPath, 'qualityReports/GOLD_261106_useCases/qualityReportPage.json'), 'utf8'));

let passCount = 0;
let failCount = 0;
const check = (checkName, condition, detailText = '') => {
	if (condition) { passCount++; } else { failCount++; }
	console.log(`${condition ? 'PASS' : 'FAIL'} ${checkName}${condition || !detailText ? '' : `\n     ${detailText}`}`);
};

// the page's drawing of a segment list, as HTML, to compare with the generator's
const escapeHtml = (plainText) => `${plainText}`.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const htmlOfSegments = (segmentList) => {
	let htmlText = '';
	let isInStrong = false;
	segmentList.forEach((segment) => {
		if (segment.isStrong !== isInStrong) { htmlText += segment.isStrong ? '<strong>' : '</strong>'; isInStrong = segment.isStrong; }
		htmlText += segment.isCode ? `<code>${escapeHtml(segment.segmentText)}</code>` : escapeHtml(segment.segmentText);
	});
	return htmlText + (isInStrong ? '</strong>' : '');
};

check('T1 plain text is one segment', JSON.stringify(inlineSegmentListOf('plain')) === JSON.stringify([{ segmentText: 'plain', isStrong: false, isCode: false }]));
check('T2 bold and code are marked', JSON.stringify(inlineSegmentListOf('a **b** `c`').map((segment) => [segment.segmentText, segment.isStrong, segment.isCode])) === JSON.stringify([['a ', false, false], ['b', true, false], [' ', false, false], ['c', false, true]]));
check('T3 markup in text stays text', inlineSegmentListOf('<script>x</script>').length === 1 && inlineSegmentListOf('<script>x</script>')[0].segmentText === '<script>x</script>');

const paragraphTextList = [reportPage.report, ...reportPage.certificateList].flatMap((documentPart) => documentPart.blockList.filter((block) => block.blockKind === 'paragraph').map((block) => block.text));
const differingList = paragraphTextList.filter((paragraphText) => `<p>${htmlOfSegments(inlineSegmentListOf(paragraphText))}</p>` !== RENDERER_SET_BY_FORMAT_NAME.html.renderBlock.paragraph({ text: paragraphText }));
check(`T4 all ${paragraphTextList.length} committed paragraphs read as the generator's HTML reads them`, paragraphTextList.length > 50 && differingList.length === 0, differingList.slice(0, 2).join(' | '));

check('T5 shortIdentityOf keeps 12 hex characters', shortIdentityOf('f'.repeat(64)) === 'ffffffffffff');
check('T6 shortIdentityOf marks a value that is not an id', /not an id/.test(shortIdentityOf('GOLD_x')));
check('T7 dayTextOf keeps the written day, no time-zone shift', dayTextOf('2026-11-06T23:59:00.000Z') === '2026-11-06');
check('T8 dayTextOf marks a value that is not a date', /not a date/.test(dayTextOf(undefined)));

console.log(`\n${passCount} passed, ${failCount} failed`);
process.exit(failCount === 0 ? 0 : 1);
