'use strict';
// companion-moment-tie.test.js — with the wall clock FROZEN, so every new Date() and Date.now() in this process gives
// the same millisecond, two revisions of one companion source part must still be told apart: "the source current at
// the revision's upload moment" must be the revision. Before the shared companion clock (2026-11-19) both rows were
// stamped with the same uploadedAt, the tie went to whichever row came first, and companion-compile-history named
// the wrong rows (companion-page-admin.test.js flaked under the faster sqlite-instance 11.0).
// Real companion harness (scratch sqlite, real access points). No graph needed. Run: node server/test/companion-moment-tie.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

// freeze the clock: every no-argument Date and Date.now() is this one millisecond
const FROZEN_MS = Date.parse('2026-11-19T20:38:38.000Z');
const RealDate = Date;
class FrozenDate extends RealDate {
	constructor(...argumentList) {
		super(...(argumentList.length ? argumentList : [FROZEN_MS]));
	}
	static now() {
		return FROZEN_MS;
	}
}
global.Date = FrozenDate;

const { bootCompanionServer } = require('./lib/companionServerHarness');
const { sourceRecordListCurrentAt } = require('../data-model/lib/companion-pages/companion-source-set');
const SERVER_PATH = path.join(__dirname, '..');
const SEED_MANIFEST = JSON.parse(fs.readFileSync(path.join(SERVER_PATH, 'data-model', 'lib', 'companion-pages', 'seed', 'jedx-dictionary.seed.json'), 'utf8'));
const PAGE_SLUG = SEED_MANIFEST.pageRecord.pageSlug;

const tocUploadOf = (contentText) => ({
	pageSlug: PAGE_SLUG,
	sourceRole: 'dictionary',
	sourcePart: 'TOC',
	fileName: `toc-${contentText}.csv`,
	fileBase64: Buffer.from(`part,title\n${contentText}\n`).toString('base64'),
	originUrl: null,
	originNote: `tie test ${contentText}`,
	documentDate: '2026-11-19',
	uploadedBy: 'companion-moment-tie.test',
});

const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'companionMomentTie-'));
bootCompanionServer({ scratchDirPath }, (bootError, server) => {
	if (bootError) {
		console.log(`companion-moment-tie: harness did not boot: ${bootError}`);
		process.exit(1);
	}
	const { accessPointByName } = server;
	accessPointByName['companion-page-save']({ pageRecord: SEED_MANIFEST.pageRecord }, (saveError) => {
		accessPointByName['companion-source-upload'](tocUploadOf('original'), (firstError) => {
			accessPointByName['companion-source-upload'](tocUploadOf('revision'), (secondError) => {
				accessPointByName['companion-source-list']({ pageSlug: PAGE_SLUG, listScope: 'history' }, (listError, sourceHistoryList = []) => {
					check('setup: page saved, two TOC uploads, history read, with the clock frozen', !saveError && !firstError && !secondError && !listError && sourceHistoryList.length === 2, saveError || firstError || secondError || listError);
					const originalRecord = sourceHistoryList.find((sourceRecord) => /original/.test(sourceRecord.fileName)) || {};
					const revisionRecord = sourceHistoryList.find((sourceRecord) => /revision/.test(sourceRecord.fileName)) || {};
					check('two uploads in the same frozen millisecond get DIFFERENT uploadedAt, the revision later', originalRecord.uploadedAt < revisionRecord.uploadedAt, `${originalRecord.uploadedAt} / ${revisionRecord.uploadedAt}`);
					const currentAtRevisionList = sourceRecordListCurrentAt({ sourceHistoryList, momentText: revisionRecord.uploadedAt });
					check('the source current at the revision moment is the revision', currentAtRevisionList.length === 1 && currentAtRevisionList[0].refId === revisionRecord.refId, JSON.stringify(currentAtRevisionList.map((sourceRecord) => sourceRecord.fileName)));
					const currentAtOriginalList = sourceRecordListCurrentAt({ sourceHistoryList, momentText: originalRecord.uploadedAt });
					check('and the source current at the original moment is still the original', currentAtOriginalList.length === 1 && currentAtOriginalList[0].refId === originalRecord.refId, JSON.stringify(currentAtOriginalList.map((sourceRecord) => sourceRecord.fileName)));

					// legacy rows stamped before the clock can tie: the pick must not depend on the list's order
					const tiedList = [{ ...originalRecord, uploadedAt: 'T' }, { ...revisionRecord, uploadedAt: 'T' }];
					const forwardPick = sourceRecordListCurrentAt({ sourceHistoryList: tiedList, momentText: 'T' })[0].refId;
					const reversePick = sourceRecordListCurrentAt({ sourceHistoryList: [...tiedList].reverse(), momentText: 'T' })[0].refId;
					check('rows with equal stamps (stamped before the clock) give the same pick in either list order', forwardPick === reversePick);

					server.close();
					fs.rmSync(scratchDirPath, { recursive: true, force: true });
					const failedCount = resultList.filter((passed) => !passed).length;
					console.log(`companion-moment-tie: ${resultList.length - failedCount} passed, ${failedCount} failed`);
					process.exit(failedCount ? 1 : 0);
				});
			});
		});
	});
});
