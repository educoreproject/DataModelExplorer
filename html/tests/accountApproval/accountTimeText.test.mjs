#!/usr/bin/env node
// accountTimeText.test.mjs — WORKORDER-approvalLooseEnds-112126 L1: the one helper both approval views use to show a time
// shows it in the viewer's local time. Run under a fixed zone so "local" is known: the server suite's wrapper
// (server/test/account-time-text.test.js) runs it with TZ=America/Chicago; run alone it sets that zone for itself.
//
//   T1 SQLite's zone-less UTC createdAt ('2026-11-21 19:24:59') is read as UTC: 13:24:59 in Chicago, not 19:24:59
//   T2 an ISO decidedAt with Z is shown in local time
//   T3 absent, null, '' and spaces show the vocabulary's named blank, never "Invalid Date"
//   T4 a time in neither form is shown as sent, never "Invalid Date"
//   T5 both views import this helper and keep no time formatting of their own
//
//   node html/tests/accountApproval/accountTimeText.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.TZ = process.env.TZ || 'America/Chicago';
const { localTimeTextOf } = await import('../../components/accountTimeText.js');
const { accountVocabulary } = await import('../../components/accountVocabulary.js');

const htmlDirectoryPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let passCount = 0;
let failCount = 0;
const check = (checkName, condition, detailText = '') => {
	if (condition) { passCount++; } else { failCount++; }
	console.log(`${condition ? 'PASS' : 'FAIL'} ${checkName}${condition || !detailText ? '' : `\n     ${detailText}`}`);
};

const expectedLocalText = (isoText) => new Date(isoText).toLocaleString();

check('T0 the test runs in America/Chicago', process.env.TZ === 'America/Chicago', process.env.TZ);
const sqliteShown = localTimeTextOf('2026-11-21 19:24:59');
check('T1 SQLite UTC createdAt is shown as local time (13:24:59 in Chicago)', sqliteShown === expectedLocalText('2026-11-21T19:24:59Z') && /1:24:59/.test(sqliteShown), sqliteShown);
const isoShown = localTimeTextOf('2026-11-21T17:30:31.993Z');
check('T2 ISO decidedAt is shown as local time (11:30:31 in Chicago)', isoShown === expectedLocalText('2026-11-21T17:30:31.993Z') && /11:30:31/.test(isoShown), isoShown);
[undefined, null, '', '   '].forEach((absentTime) => {
	const absentShown = localTimeTextOf(absentTime);
	check(`T3 ${JSON.stringify(absentTime) ?? 'undefined'} shows the named blank '${accountVocabulary.timeAbsentText}'`, typeof accountVocabulary.timeAbsentText === 'string' && !!accountVocabulary.timeAbsentText && absentShown === accountVocabulary.timeAbsentText, absentShown);
});
const oddShown = localTimeTextOf('yesterday-ish');
check('T4 a time in neither form is shown as sent', oddShown === 'yesterday-ish', oddShown);
check('T4 nothing here ever reads "Invalid Date"', ![sqliteShown, isoShown, oddShown, localTimeTextOf('2026-13-45 99:99:99')].some((shownText) => /Invalid Date/.test(shownText)));

['components/tools/pending-approvals.vue', 'pages/account-approval.vue'].forEach((viewPath) => {
	const viewText = fs.readFileSync(path.join(htmlDirectoryPath, viewPath), 'utf8');
	check(`T5 ${viewPath} uses localTimeTextOf from accountTimeText.js`, /import \{ localTimeTextOf \} from '@\/components\/accountTimeText\.js'/.test(viewText) && /localTimeTextOf\(/.test(viewText));
	check(`T5 ${viewPath} formats no time itself (no toLocaleString, no new Date)`, !/toLocaleString|new Date\(/.test(viewText));
});

console.log(`\naccountTimeText: ${passCount} passed, ${failCount} failed`);
process.exit(failCount ? 1 : 0);
