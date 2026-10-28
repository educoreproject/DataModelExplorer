#!/usr/bin/env node
'use strict';

// companion-page-admin.test.js — the server half of Companion Pages Phase 4 (SPEC-companionPages-102826): the two
// endpoints the compiled page and its admin controls add, and the upload-then-restore cycle the admin UI drives. Runs
// the REAL sqlite-instance, data-mapping, companion access points, token middleware and endpoints over HTTP
// (test/lib/companionServerHarness.js) on throwaway databases under os.tmpdir(), never a project database, with the
// jedx-dictionary page seeded from seed/jedx-dictionary.seed.json. The compile reads the live golden READ-ONLY.
//
// PROVES:
//   PAGE-GET     companion-page-get answers the page's registry record to the explorer roles; it refuses no token, the
//                lookalike role, an unregistered slug and an unexpected property, by name
//   HISTORY      companion-compile-history answers admin and super only (401 for user, client, subadministrator, none),
//                newest first, with no payload
//   CYCLE        an upload of a new TOC revision becomes current and the next view recompiles; restoring the earlier
//                version (its bytes fetched through companion-source-file and uploaded again, as the admin UI does)
//                becomes current with the earlier sha256 and the next view recompiles again. Every compile names the
//                source rows it was built from, each list proven by the compile's own sourceSetSha256
//   UNPROVEN     a compile whose sourceSetSha256 the reconstructed rows do not hash to names NO rows (null)
// RED TWIN (observed failing the gate):
//   unverified   the reconstruction trusted without its hash check: the UNPROVEN compile names rows it did not use
//
//   /usr/local/bin/node server/test/companion-page-admin.test.js   (sqlite3 is built for that node)

const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadWithStubs } = require('./lib/moduleWithStubs');
const { bootCompanionServer, httpPost, loginEveryRole } = require('./lib/companionServerHarness');
const { readGoldenContainerName } = require('./lib/goldenContainerName');

const SERVER_PATH = path.join(__dirname, '..');
const PROJECT_SYSTEM_PATH = path.join(SERVER_PATH, '..', '..');
const HISTORY_ACCESS_POINT_PATH = path.join(SERVER_PATH, 'data-model', 'access-points-dot-d', 'accessPoints.d', 'companion-compile-history.js');
const SEED_MANIFEST = JSON.parse(fs.readFileSync(path.join(SERVER_PATH, 'data-model', 'lib', 'companion-pages', 'seed', 'jedx-dictionary.seed.json'), 'utf8'));
const SEED_SOURCE_DIR_PATH = path.join(PROJECT_SYSTEM_PATH, SEED_MANIFEST.sourceDirProjectRelativePath);
const PAGE_SLUG = SEED_MANIFEST.pageRecord.pageSlug;
const VERIFY_FIND_TEXT = 'sourceSetSha256Of(currentRecordList) === compileRecord.sourceSetSha256 ?';
const UNPROVEN_SOURCE_SET_SHA256 = 'f'.repeat(64);

const results = [];
const ok = (name, condition, detail) => {
	results.push([name, !!condition]);
	console.log(`  ${condition ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

const scratchRootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'companionPageAdmin-'));
const goldenContainerName = readGoldenContainerName();

const runSteps = (stepList, initialState, done) => {
	const runAt = (stepIndex, state) => (stepIndex >= stepList.length ? done(state) : stepList[stepIndex](state, (nextState) => runAt(stepIndex + 1, nextState)));
	runAt(0, initialState);
};

const abort = (whereText, errorText) => {
	console.log(`  FAIL: ${whereText}: ${errorText}`);
	process.exit(1);
};

// ================================================================================
// STEPS

const bootStep = (scratchName, bootOptions) => (state, next) =>
	bootCompanionServer({ scratchDirPath: path.join(scratchRootPath, scratchName), neo4jDb: state.goldenDb, configBySectionName: { dataModelExplorerSearch: { goldenContainerName } }, ...bootOptions }, (bootError, server) => {
		if (bootError) abort(`boot ${scratchName}`, bootError);
		loginEveryRole(server, (loginError, tokenByRoleName) => {
			if (loginError) abort(`login ${scratchName}`, loginError);
			next({ ...state, server, tokenByRoleName });
		});
	});

const closeStep = (state, next) => {
	state.server.close();
	next(state);
};

const seedStep = (state, next) =>
	state.server.accessPointByName['companion-page-save']({ pageRecord: SEED_MANIFEST.pageRecord }, (saveError) => {
		if (saveError) abort('seed page', saveError);
		const uploadNext = (remainingSourceList) => {
			if (!remainingSourceList.length) {
				next(state);
				return;
			}
			const oneSource = remainingSourceList[0];
			const uploadRequest = {
				pageSlug: PAGE_SLUG,
				sourceRole: oneSource.sourceRole,
				sourcePart: oneSource.sourcePart,
				fileName: path.basename(oneSource.relativeFilePath),
				fileBase64: fs.readFileSync(path.join(SEED_SOURCE_DIR_PATH, oneSource.relativeFilePath)).toString('base64'),
				originUrl: oneSource.originUrl,
				originNote: oneSource.originNote,
				documentDate: oneSource.documentDate,
				uploadedBy: 'companion-page-admin.test',
			};
			state.server.accessPointByName['companion-source-upload'](uploadRequest, (uploadError) => {
				if (uploadError) abort(`seed upload ${oneSource.sourceRole}/${oneSource.sourcePart}`, uploadError);
				uploadNext(remainingSourceList.slice(1));
			});
		};
		uploadNext(SEED_MANIFEST.sourceList);
	});

// POSTs as roleName (or with no token) and stores { statusCode, bodyText, bodyJson, bodyBuffer, headerByName } under responseName
const postStep = (responseName, routePath, requestBodyOf, roleName = 'admin') => (state, next) =>
	httpPost({ baseUrl: state.server.baseUrl, routePath, requestBody: typeof requestBodyOf === 'function' ? requestBodyOf(state) : requestBodyOf, authtoken: roleName ? state.tokenByRoleName[roleName] : undefined }, (postError, response) => {
		if (postError) abort(`post ${responseName}`, postError);
		next({ ...state, [responseName]: response });
	});

const viewStep = (responseName) => postStep(responseName, '/api/companion-compile-current', { pageSlug: PAGE_SLUG }, 'user');

const currentTocOf = (sourceListResponse) => sourceListResponse.bodyJson.find((sourceRecord) => sourceRecord.sourceRole === 'dictionary' && sourceRecord.sourcePart === 'TOC');

// ================================================================================
// THE GATE STEPS

const pageGetStepList = [
	bootStep('main'),
	seedStep,
	postStep('pageGetUser', '/api/companion-page-get', { pageSlug: PAGE_SLUG }, 'user'),
	postStep('pageGetClient', '/api/companion-page-get', { pageSlug: PAGE_SLUG }, 'client'),
	postStep('pageGetNone', '/api/companion-page-get', { pageSlug: PAGE_SLUG }, null),
	postStep('pageGetLookalike', '/api/companion-page-get', { pageSlug: PAGE_SLUG }, 'subadministrator'),
	postStep('pageGetUnknown', '/api/companion-page-get', { pageSlug: 'no-such-page' }, 'user'),
	postStep('pageGetExtra', '/api/companion-page-get', { pageSlug: PAGE_SLUG, path: '/etc' }, 'user'),
	(state, next) => {
		console.log('PAGE-GET');
		const pageRecord = state.pageGetUser.bodyJson && state.pageGetUser.bodyJson[0];
		ok('user gets the page record', state.pageGetUser.statusCode === 200 && pageRecord && pageRecord.pageSlug === PAGE_SLUG && pageRecord.title === SEED_MANIFEST.pageRecord.title, state.pageGetUser.bodyText.slice(0, 160));
		ok('the record carries its types (isActive boolean, sortOrder integer)', pageRecord && pageRecord.isActive === true && Number.isInteger(pageRecord.sortOrder));
		ok('client gets the page record', state.pageGetClient.statusCode === 200);
		ok('no token is refused 401', state.pageGetNone.statusCode === 401);
		ok('subadministrator is refused 401', state.pageGetLookalike.statusCode === 401);
		ok('an unregistered slug is refused by name', state.pageGetUnknown.statusCode === 400 && /no companion page 'no-such-page' is registered/.test(state.pageGetUnknown.bodyText), state.pageGetUnknown.bodyText);
		ok('an unexpected property is refused by name', state.pageGetExtra.statusCode === 400 && /unexpected request property: path/.test(state.pageGetExtra.bodyText), state.pageGetExtra.bodyText);
		next(state);
	},
];

const historyRoleStepList = [
	...['admin', 'super', 'user', 'client', 'subadministrator', null].map((roleName) => postStep(`history_${roleName}`, '/api/companion-compile-history', { pageSlug: PAGE_SLUG }, roleName)),
	(state, next) => {
		console.log('HISTORY roles');
		ok('admin may read the compile history', state.history_admin.statusCode === 200 && Array.isArray(state.history_admin.bodyJson));
		ok('super may read the compile history', state.history_super.statusCode === 200);
		['user', 'client', 'subadministrator', null].forEach((roleName) => ok(`${roleName || 'no token'} is refused 401`, state[`history_${roleName}`].statusCode === 401, String(state[`history_${roleName}`].statusCode)));
		ok('before any view there is no compile', state.history_admin.bodyJson && state.history_admin.bodyJson.length === 0);
		next(state);
	},
];

const cycleStepList = [
	viewStep('firstView'),
	postStep('sourcesBefore', '/api/companion-source-list', { pageSlug: PAGE_SLUG }, 'user'),
	// a new TOC revision: the seeded TOC's bytes plus one line, uploaded through the endpoint as the admin form does
	(state, next) => {
		const originalToc = currentTocOf(state.sourcesBefore);
		next({ ...state, originalToc });
	},
	postStep('originalTocFile', '/api/companion-source-file', (state) => ({ sourceRefId: state.originalToc.refId }), 'admin'),
	postStep('revisionUpload', '/api/companion-source-upload', (state) => ({
		pageSlug: PAGE_SLUG,
		sourceRole: 'dictionary',
		sourcePart: 'TOC',
		fileName: 'Data Dictionary TOC test revision.csv',
		fileBase64: Buffer.concat([state.originalTocFile.bodyBuffer, Buffer.from('\r\n"test revision",""\r\n')]).toString('base64'),
		originUrl: null,
		originNote: "A test revision of Steve Saxton's TOC (companion-page-admin.test)",
		documentDate: '2026-10-28',
	})),
	postStep('sourcesAfterRevision', '/api/companion-source-list', { pageSlug: PAGE_SLUG }, 'user'),
	viewStep('revisionView'),
	// the restore: the earlier version's bytes and provenance, uploaded again
	postStep('restoreUpload', '/api/companion-source-upload', (state) => ({
		pageSlug: PAGE_SLUG,
		sourceRole: 'dictionary',
		sourcePart: 'TOC',
		fileName: state.originalToc.fileName,
		fileBase64: state.originalTocFile.bodyBuffer.toString('base64'),
		originUrl: state.originalToc.originUrl,
		originNote: `${state.originalToc.originNote} [restored from source ${state.originalToc.refId}]`,
		documentDate: state.originalToc.documentDate,
	})),
	postStep('sourcesAfterRestore', '/api/companion-source-list', { pageSlug: PAGE_SLUG }, 'user'),
	viewStep('restoreView'),
	postStep('historyAfterCycle', '/api/companion-compile-history', { pageSlug: PAGE_SLUG }, 'admin'),
	(state, next) => {
		console.log('CYCLE');
		const revisionToc = currentTocOf(state.sourcesAfterRevision);
		const restoredToc = currentTocOf(state.sourcesAfterRestore);
		const firstCompile = state.firstView.bodyJson[0].compileRecord;
		const revisionCompile = state.revisionView.bodyJson[0].compileRecord;
		const restoreCompile = state.restoreView.bodyJson[0].compileRecord;
		ok('the old TOC bytes came back with their sha256 header', state.originalTocFile.statusCode === 200 && state.originalTocFile.headerByName['x-source-sha256'] === state.originalToc.sha256);
		ok('the revision upload is answered 200', state.revisionUpload.statusCode === 200, state.revisionUpload.bodyText.slice(0, 160));
		ok('the revision is the current TOC', revisionToc && revisionToc.refId !== state.originalToc.refId && revisionToc.sha256 !== state.originalToc.sha256);
		ok('the revision records the signed-in admin as uploadedBy', revisionToc && revisionToc.uploadedBy === 'harnessadmin', revisionToc && revisionToc.uploadedBy);
		ok('the next view recompiled (a new, current compile)', state.revisionView.bodyJson[0].isCurrent === true && revisionCompile.refId !== firstCompile.refId);
		ok('the restore upload is answered 200', state.restoreUpload.statusCode === 200, state.restoreUpload.bodyText.slice(0, 160));
		ok('the restored TOC is current, a new row with the earlier sha256', restoredToc && restoredToc.refId !== state.originalToc.refId && restoredToc.sha256 === state.originalToc.sha256);
		ok('the restored row says where it came from', restoredToc && restoredToc.originNote.endsWith(`[restored from source ${state.originalToc.refId}]`));
		ok('the next view recompiled again, with the first compile\'s source set', state.restoreView.bodyJson[0].isCurrent === true && restoreCompile.refId !== revisionCompile.refId && restoreCompile.sourceSetSha256 === firstCompile.sourceSetSha256);

		const historyList = state.historyAfterCycle.bodyJson;
		ok('the history holds the three compiles, newest first', historyList.length === 3 && historyList.map((compileRecord) => compileRecord.refId).join() === [restoreCompile.refId, revisionCompile.refId, firstCompile.refId].join(), historyList.map((compileRecord) => compileRecord.refId).join());
		ok('the history carries no payload', historyList.every((compileRecord) => compileRecord.payload === undefined && compileRecord.payloadJson === undefined));
		const usedTocRefIdOf = (compileRecord, sourceList) => (compileRecord.usedSourceRefIdList || []).find((sourceRefId) => sourceList.some((sourceRecord) => sourceRecord.refId === sourceRefId && sourceRecord.sourcePart === 'TOC'));
		const everySourceList = [...state.sourcesBefore.bodyJson, revisionToc, restoredToc];
		ok('every compile names the 12 rows it used', historyList.every((compileRecord) => Array.isArray(compileRecord.usedSourceRefIdList) && compileRecord.usedSourceRefIdList.length === 12), historyList.map((compileRecord) => JSON.stringify(compileRecord.usedSourceRefIdList && compileRecord.usedSourceRefIdList.length)).join());
		ok('the first compile used the original TOC', usedTocRefIdOf(historyList[2], everySourceList) === state.originalToc.refId);
		ok('the revision compile used the revision', usedTocRefIdOf(historyList[1], everySourceList) === revisionToc.refId);
		ok('the restore compile used the restored row', usedTocRefIdOf(historyList[0], everySourceList) === restoredToc.refId);
		next(state);
	},
];

// a compile stamped with a source set its time's rows do not hash to (as when an upload lands mid-compile)
const insertUnprovenCompileStep = (state, next) => {
	const compileMapper = state.server.dataMapping['companion-compile'];
	state.server.sqlDb.getTable('companionCompile', (tableError, compileTable) => {
		if (tableError) abort('compile table', tableError);
		const compileRow = { refId: 'unprovenCompile00001', pageSlug: PAGE_SLUG, graphName: goldenContainerName, graphContractSha256: 'unproven', sourceSetSha256: UNPROVEN_SOURCE_SET_SHA256, compiledAt: new Date(Date.now() + 1000).toISOString(), compilerVersion: 'unproven', payloadJson: '{}', statusText: 'compiled' };
		compileTable.runStatement(compileMapper.getSql('insert', compileMapper.map(compileRow, 'reverse')), { suppressStatementLog: true }, (insertError) => {
			if (insertError) abort('insert unproven compile', insertError);
			next(state);
		});
	});
};

const unprovenStepList = [
	insertUnprovenCompileStep,
	postStep('historyWithUnproven', '/api/companion-compile-history', { pageSlug: PAGE_SLUG }, 'admin'),
	(state, next) => {
		console.log('UNPROVEN');
		const unprovenCompile = state.historyWithUnproven.bodyJson.find((compileRecord) => compileRecord.refId === 'unprovenCompile00001');
		ok('a compile its rows do not hash to names no rows (null)', unprovenCompile && unprovenCompile.usedSourceRefIdList === null, JSON.stringify(unprovenCompile && unprovenCompile.usedSourceRefIdList));
		ok('the proven compiles still name theirs', state.historyWithUnproven.bodyJson.filter((compileRecord) => compileRecord.refId !== 'unprovenCompile00001').every((compileRecord) => Array.isArray(compileRecord.usedSourceRefIdList)));
		next(state);
	},
	closeStep,
];

const unverifiedTwinStepList = [
	bootStep('twinUnverified', { accessPointModulePathByName: { 'companion-compile-history': loadWithStubs({ modulePath: HISTORY_ACCESS_POINT_PATH, mutationList: [{ find: VERIFY_FIND_TEXT, replace: 'true ?' }] }) } }),
	seedStep,
	viewStep('twinView'),
	insertUnprovenCompileStep,
	postStep('twinHistory', '/api/companion-compile-history', { pageSlug: PAGE_SLUG }, 'admin'),
	(state, next) => {
		console.log('red twin unverified');
		const unprovenCompile = state.twinHistory.bodyJson.find((compileRecord) => compileRecord.refId === 'unprovenCompile00001');
		ok('the UNPROVEN gate goes red on the twin (it names rows)', unprovenCompile && Array.isArray(unprovenCompile.usedSourceRefIdList), JSON.stringify(unprovenCompile && unprovenCompile.usedSourceRefIdList && unprovenCompile.usedSourceRefIdList.length));
		next(state);
	},
	closeStep,
];

// ================================================================================

process.global = { xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {}, debug: () => {} } };
const { resolveContainerConnection } = require('../data-model/lib/user-graph/container-connection-resolver');
const neo4jGen = require('../data-model/lib/neo4j-instance/neo4j-instance')({ unused: true });
const goldenConnection = resolveContainerConnection(goldenContainerName);
if (goldenConnection.error) abort('golden connection', goldenConnection.error);

neo4jGen.initDatabaseInstance({ neo4jBoltUri: goldenConnection.boltUri, neo4jUser: goldenConnection.user, neo4jPassword: goldenConnection.password, readOnly: true, queryTimeoutMs: 120000 }, (connectError, goldenDb) => {
	if (connectError) abort('golden connect', connectError);
	const stepList = [...pageGetStepList, ...historyRoleStepList, ...cycleStepList, ...unprovenStepList, ...unverifiedTwinStepList];
	runSteps(stepList, { goldenDb }, () => {
		goldenDb.close();
		fs.rmSync(scratchRootPath, { recursive: true, force: true });
		const failedCount = results.filter(([, passed]) => !passed).length;
		console.log(`\n=== Results: ${results.length - failedCount} passed, ${failedCount} failed ===`);
		process.exit(failedCount ? 1 : 0);
	});
});
