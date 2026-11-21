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
let serverHandle = null;
bootCompanionServer({ scratchDirPath }, (bootError, server) => {
	if (bootError) {
		console.log(`companion-moment-tie: harness did not boot: ${bootError}`);
		process.exit(1);
	}
	const { accessPointByName } = server;
	serverHandle = server;
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

					// legacy rows (stamped before the clock) can tie: make these two tie, as old rows do, and read the history again
					const { getCompanionTables } = require('../data-model/lib/companion-pages/companion-tables');
					getCompanionTables({ sqlDb: server.sqlDb, dataMapping: server.dataMapping }, (tablesError, companionTables) => {
						companionTables.sourceTable.runStatement(`UPDATE <!tableName!> SET [uploadedAt] = '2026-01-01T00:00:00.000Z', [createdAt] = '2026-01-01 00:00:00' WHERE [pageSlug] = '${PAGE_SLUG}';`, { suppressStatementLog: true }, (tieError) => {
							accessPointByName['companion-source-list']({ pageSlug: PAGE_SLUG, listScope: 'history' }, (relistError, tiedHistoryList = []) => {
								const tiedPickList = sourceRecordListCurrentAt({ sourceHistoryList: tiedHistoryList, momentText: '2026-01-01T00:00:00.000Z' });
								check('legacy tie (equal uploadedAt AND createdAt): the history lists the later INSERT (the revision) first', !tablesError && !tieError && !relistError && tiedHistoryList[0] && tiedHistoryList[0].refId === revisionRecord.refId, JSON.stringify(tiedHistoryList.map((sourceRecord) => sourceRecord.fileName)));
								check('and the compile pick agrees with the list: the revision', tiedPickList.length === 1 && tiedPickList[0].refId === revisionRecord.refId, JSON.stringify(tiedPickList.map((sourceRecord) => sourceRecord.fileName)));
								finish();
							});
						});
					});
				});
			});
		});
	});
});

const finish = () => {
	serverHandle.close();
	fs.rmSync(scratchDirPath, { recursive: true, force: true });
	const failedCount = resultList.filter((passed) => !passed).length;
	console.log(`companion-moment-tie: ${resultList.length - failedCount} passed, ${failedCount} failed`);
	process.exit(failedCount ? 1 : 0);
};
