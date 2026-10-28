#!/usr/bin/env node
'use strict';

// companion-pages-registry.test.js — gates G1.1 to G1.4 and the upload route's body limit (Companion Pages Phase 1,
// SPEC-companionPages-102826). Runs the REAL sqlite-instance, data-mapping, access points, token middleware and
// companion-* endpoints over HTTP (test/lib/companionServerHarness.js), on a throwaway database and source directory
// under os.tmpdir(); never a project database.
//
// PROVES:
//   G1.1  listing by standardKey returns only that standard's ACTIVE pages; a page pinned to a subjectStableId is
//         returned only when that node is asked for
//   G1.2  an admin upload stores the file, with byteSize and sha256 computed by the server, and makes the new row
//         current; the previous row for that role stays, with its file and bytes, no longer current; SQLite itself
//         refuses a second current row
//   G1.3  upload and registry writes are refused (401) for user, client, subadministrator and no token
//   G1.4  a file is read back only through its row (by refId, or as the current row of a role and part); a request
//         naming a path, a fileName or a storedFileName is refused
//   BODY  a 200 KB body is still refused (413) on an ordinary route; an anonymous 200 KB post to the upload route is
//         refused 401 BEFORE any parse (its body is not even JSON, and the answer is still 401); an admin's 200 KB
//         upload succeeds
// RED TWINS:
//   rowOverwritten   the MoveCurrent trigger DELETES the previous current row: G1.2 fails (the old row is gone)
//   fileOverwritten  stored file names without the refId, written with 'w': G1.2 fails (the old file holds new bytes)
//   skipOff          the global JSON parser on every route: the admin's 200 KB upload is refused 413
//
//   /usr/local/bin/node server/test/companion-pages-registry.test.js   (sqlite3 is built for that node)

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { loadWithStubs } = require('./lib/moduleWithStubs');
const { bootCompanionServer, httpPost, loginEveryRole } = require('./lib/companionServerHarness');

const SERVER_PATH = path.join(__dirname, '..');
const DATA_MAPPING_PATH = path.join(SERVER_PATH, 'data-model', 'data-mapping', 'data-mapping.js');
const SOURCE_MAPPER_PATH = path.join(SERVER_PATH, 'data-model', 'data-mapping', 'mappers', 'companion-source.js');
const UPLOAD_ACCESS_POINT_PATH = path.join(SERVER_PATH, 'data-model', 'access-points-dot-d', 'accessPoints.d', 'companion-source-upload.js');
const SOURCE_FILES_PATH = path.join(SERVER_PATH, 'data-model', 'lib', 'companion-pages', 'companion-source-files.js');

const results = [];
const ok = (name, condition, detail) => {
	results.push([name, !!condition]);
	console.log(`  ${condition ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

const sha256Of = (contentBuffer) => crypto.createHash('sha256').update(contentBuffer).digest('hex');
const scratchRootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'companionPages-'));

const pageRecordOf = (overrideRecord) => ({
	pageSlug: 'jedx-dictionary',
	title: "One dictionary, four lenses (Steve's)",
	summary: 'The JEDx data dictionary seen four ways.',
	audienceText: 'HR staff, state data stewards, implementers, developers',
	standardKey: 'jedx',
	subjectStableId: null,
	targetKind: 'compiled',
	externalUrl: null,
	compilerName: 'jedxDictionary',
	sortOrder: 10,
	isActive: true,
	...overrideRecord,
});

const uploadOf = (overrideUpload) => ({
	pageSlug: 'jedx-dictionary',
	sourceRole: 'dictionary',
	sourcePart: 'TOC',
	fileName: 'Data Dictionary (TOC).csv',
	fileBase64: Buffer.from('elementId,element\n1,Worker\n').toString('base64'),
	originUrl: 'https://example.org/dictionary',
	originNote: "Steve Saxton's OneDrive, first draft",
	documentDate: '2026-04-19',
	...overrideUpload,
});

// runs (state, next) steps in order; a step calls next(state) to continue
const runSteps = (stepList, initialState, done) => {
	const runAt = (stepIndex, state) => (stepIndex >= stepList.length ? done(state) : stepList[stepIndex](state, (nextState) => runAt(stepIndex + 1, nextState)));
	runAt(0, initialState);
};

const post = (state, routePath, requestBody, roleName, callback) =>
	httpPost({ baseUrl: state.server.baseUrl, routePath, requestBody, authtoken: roleName ? state.tokenByRoleName[roleName] : undefined }, (postError, response) => {
		if (postError) {
			console.error(postError);
			process.exit(1);
		}
		callback(response);
	});

const bootStep = (scratchName, bootOptions) => (state, next) =>
	bootCompanionServer({ scratchDirPath: path.join(scratchRootPath, scratchName), ...bootOptions }, (bootError, server) => {
		if (bootError) {
			console.error(bootError);
			process.exit(1);
		}
		loginEveryRole({ baseUrl: server.baseUrl }, (loginError, tokenByRoleName) => {
			if (loginError) {
				console.error(loginError);
				process.exit(1);
			}
			next({ ...state, server, tokenByRoleName });
		});
	});

const closeStep = (state, next) => {
	state.server.close();
	next(state);
};

// the G1.2 sequence, shared by the real run and the twins: two uploads to one role and part
const twoUploadsStep = (state, next) =>
	post(state, '/api/companion-page-save', { pageRecord: pageRecordOf({}) }, 'admin', (pageResponse) => {
		const firstBuffer = Buffer.from('elementId,element\n1,Worker\n');
		const secondBuffer = Buffer.from('elementId,element\n1,Worker\n2,Organization\n');
		post(state, '/api/companion-source-upload', uploadOf({ fileBase64: firstBuffer.toString('base64') }), 'admin', (firstResponse) => {
			post(state, '/api/companion-source-upload', uploadOf({ fileBase64: secondBuffer.toString('base64'), documentDate: '2026-08-20', originNote: "Steve Saxton's OneDrive, 08202026 draft" }), 'admin', (secondResponse) => {
				post(state, '/api/companion-source-history', { pageSlug: 'jedx-dictionary' }, 'admin', (historyResponse) => {
					const firstRow = firstResponse.bodyJson && firstResponse.bodyJson[0];
					const secondRow = secondResponse.bodyJson && secondResponse.bodyJson[0];
					const firstRefId = firstRow && firstRow.refId;
					post(state, '/api/companion-source-file', { sourceRefId: firstRefId }, 'user', (firstFileResponse) => {
						next({ ...state, pageResponse, firstBuffer, secondBuffer, firstResponse, secondResponse, firstRow, secondRow, historyResponse, firstFileResponse });
					});
				});
			});
		});
	});

// the G1.2 verdict: true when the previous row and its bytes survive, no longer current
const previousSurvives = (state) => {
	const historyList = state.historyResponse.bodyJson || [];
	const firstOnRecord = historyList.find((oneRow) => state.firstRow && oneRow.refId === state.firstRow.refId);
	return !!firstOnRecord && firstOnRecord.isCurrent === false && state.firstFileResponse.statusCode === 200 && sha256Of(state.firstFileResponse.bodyBuffer) === sha256Of(state.firstBuffer);
};

const stepList = [
	bootStep('real', {}),

	// ---------------------------------------------------------------- G1.3 refusals, before anything exists
	(state, next) => {
		console.log('G1.3 refusals');
		const refusedRoleList = ['user', 'client', 'subadministrator', undefined];
		const probeList = [];
		refusedRoleList.forEach((roleName) => {
			probeList.push({ roleName, routePath: '/api/companion-page-save', requestBody: { pageRecord: pageRecordOf({}) } });
			probeList.push({ roleName, routePath: '/api/companion-source-upload', requestBody: uploadOf({}) });
		});
		const probeNext = (remainingList) => {
			if (!remainingList.length) {
				next(state);
				return;
			}
			const probe = remainingList[0];
			post(state, probe.routePath, probe.requestBody, probe.roleName, (response) => {
				ok(`${probe.routePath} refused for ${probe.roleName || 'no token'}`, response.statusCode === 401, `status ${response.statusCode}`);
				probeNext(remainingList.slice(1));
			});
		};
		probeNext(probeList);
	},
	(state, next) =>
		post(state, '/api/companion-source-history', { pageSlug: 'jedx-dictionary' }, 'user', (response) => {
			ok('the source history is refused for user', response.statusCode === 401, `status ${response.statusCode}`);
			post(state, '/api/companion-page-save', { pageRecord: pageRecordOf({ pageSlug: 'super-made', title: 'Made by super', sortOrder: 15 }) }, 'super', (superResponse) => {
				ok('super may write the registry', superResponse.statusCode === 200, superResponse.bodyText.slice(0, 160));
				next(state);
			});
		}),

	// ---------------------------------------------------------------- G1.2
	twoUploadsStep,
	(state, next) => {
		console.log('G1.2 upload');
		ok('admin may write the registry', state.pageResponse.statusCode === 200, state.pageResponse.bodyText.slice(0, 160));
		ok('admin upload accepted', state.firstResponse.statusCode === 200 && state.secondResponse.statusCode === 200, `${state.firstResponse.statusCode}/${state.secondResponse.statusCode} ${state.secondResponse.bodyText.slice(0, 200)}`);
		ok('byteSize and sha256 are the server\'s own, from the bytes', state.secondRow.byteSize === state.secondBuffer.length && state.secondRow.sha256 === sha256Of(state.secondBuffer));
		ok('the new row is current', state.secondRow.isCurrent === true);
		ok('the row does not reveal where the file is stored', !('storedFileName' in state.secondRow));
		ok('provenance kept verbatim, apostrophes intact', state.secondRow.originNote === "Steve Saxton's OneDrive, 08202026 draft" && state.secondRow.uploadedBy === 'harnessadmin');
		ok('the previous row stays, not current, its file and bytes intact', previousSurvives(state));
		const historyList = state.historyResponse.bodyJson || [];
		ok('history holds both rows, newest first', historyList.length === 2 && historyList[0].refId === state.secondRow.refId, `rows=${historyList.length}`);
		const pageDirPath = path.join(state.server.companionSourcesDirPath, 'jedx-dictionary');
		ok('both files are on disk', fs.readdirSync(pageDirPath).length === 2, fs.readdirSync(pageDirPath).join(', '));
		post(state, '/api/companion-source-list', { pageSlug: 'jedx-dictionary' }, 'user', (currentResponse) => {
			const currentList = currentResponse.bodyJson || [];
			ok('the current list has the new row only', currentList.length === 1 && currentList[0].refId === state.secondRow.refId, `rows=${currentList.length}`);
			next(state);
		});
	},
	(state, next) => {
		state.server.sqlDb.getTable('companionSource', (tableError, sourceTable) => {
			// a direct UPDATE that makes the old row current again beside the new one must be refused by the index
			sourceTable.runStatement(`UPDATE <!tableName!> SET isCurrent = 1 WHERE refId = '${state.firstRow.refId}';`, { suppressStatementLog: true }, (indexError) => {
				ok('SQLite itself refuses a second current row for one role and part', !!indexError && /UNIQUE/.test(String(indexError)), String(indexError));
				next(state);
			});
		});
	},
	(state, next) =>
		post(state, '/api/companion-source-upload', uploadOf({ pageSlug: 'no-such-page' }), 'admin', (unknownPageResponse) => {
			post(state, '/api/companion-source-upload', uploadOf({ fileName: 'evil.exe' }), 'admin', (badExtensionResponse) => {
				post(state, '/api/companion-source-upload', uploadOf({ uploadedBy: 'someoneElse' }), 'admin', (uploadedByResponse) => {
					post(state, '/api/companion-source-upload', uploadOf({ sourcePart: '../x' }), 'admin', (traversalResponse) => {
						ok('an upload for an unregistered page is refused', unknownPageResponse.statusCode === 400, unknownPageResponse.bodyText.slice(0, 120));
						ok('an extension outside the registry is refused', badExtensionResponse.statusCode === 400 && /not allowed/.test(badExtensionResponse.bodyText));
						ok('uploadedBy in the body is refused', uploadedByResponse.statusCode === 400 && /uploadedBy/.test(uploadedByResponse.bodyText));
						ok('a sourcePart that would make a path is refused', traversalResponse.statusCode === 400 && /sourcePart/.test(traversalResponse.bodyText));
						next(state);
					});
				});
			});
		}),

	// ---------------------------------------------------------------- G1.4
	(state, next) => {
		console.log('G1.4 read back only through the row');
		post(state, '/api/companion-source-file', { pageSlug: 'jedx-dictionary', sourceRole: 'dictionary', sourcePart: 'TOC' }, 'client', (currentFileResponse) => {
			ok('the current file by role and part, with its sha256 header', currentFileResponse.statusCode === 200 && sha256Of(currentFileResponse.bodyBuffer) === state.secondRow.sha256 && currentFileResponse.headerByName['x-source-sha256'] === state.secondRow.sha256);
			const pathProbeList = [
				{ path: '/etc/passwd' },
				{ sourceRefId: state.secondRow.refId, path: '../../companion.sqlite3' },
				{ fileName: 'Data Dictionary (TOC).csv' },
				{ pageSlug: 'jedx-dictionary', storedFileName: '../companion.sqlite3' },
				{ pageSlug: 'jedx-dictionary', sourceRole: 'dictionary', sourcePart: 'TOC', path: 'x' },
				{ sourceRefId: '../companion' },
			];
			const probeNext = (remainingList) => {
				if (!remainingList.length) {
					next(state);
					return;
				}
				post(state, '/api/companion-source-file', remainingList[0], 'admin', (response) => {
					ok(`refused: ${JSON.stringify(remainingList[0])}`, response.statusCode === 400 && !response.headerByName['x-source-sha256'], `status ${response.statusCode}`);
					probeNext(remainingList.slice(1));
				});
			};
			probeNext(pathProbeList);
		});
	},

	// ---------------------------------------------------------------- G1.1
	(state, next) => {
		console.log('G1.1 listing');
		const pageList = [
			pageRecordOf({ pageSlug: 'jedx-node-page', title: 'A worker page', standardKey: 'jedx', subjectStableId: 'jedx:workerType', sortOrder: 20 }),
			pageRecordOf({ pageSlug: 'jedx-retired', title: 'Retired', standardKey: 'jedx', isActive: false, sortOrder: 0 }),
			pageRecordOf({ pageSlug: 'ceds-page', title: 'A CEDS page', standardKey: 'ceds', targetKind: 'externalUrl', externalUrl: 'https://ceds.ed.gov/', compilerName: null, sortOrder: 5 }),
		];
		const saveNext = (remainingList) => {
			if (!remainingList.length) {
				next(state);
				return;
			}
			post(state, '/api/companion-page-save', { pageRecord: remainingList[0] }, 'admin', (response) => {
				if (response.statusCode !== 200) {
					ok(`saving ${remainingList[0].pageSlug}`, false, response.bodyText);
				}
				saveNext(remainingList.slice(1));
			});
		};
		saveNext(pageList);
	},
	(state, next) =>
		post(state, '/api/companion-page-list', { standardKey: 'jedx' }, 'user', (standardResponse) => {
			post(state, '/api/companion-page-list', { standardKey: 'jedx', subjectStableId: 'jedx:workerType' }, 'user', (nodeResponse) => {
				post(state, '/api/companion-page-list', { standardKey: 'jedx', subjectStableId: 'jedx:otherType' }, 'user', (otherNodeResponse) => {
					post(state, '/api/companion-page-list', { standardKey: 'nothing-here' }, 'user', (emptyResponse) => {
						const slugsOf = (response) => (response.bodyJson || []).map((onePage) => onePage.pageSlug).join(',');
						ok('the standard lists only its own active, unpinned pages', slugsOf(standardResponse) === 'jedx-dictionary,super-made', slugsOf(standardResponse));
						ok('the pinned page shows for its node, after the standard pages by sortOrder', slugsOf(nodeResponse) === 'jedx-dictionary,super-made,jedx-node-page', slugsOf(nodeResponse));
						ok('the pinned page does not show for another node', slugsOf(otherNodeResponse) === 'jedx-dictionary,super-made', slugsOf(otherNodeResponse));
						ok('a standard with no pages answers an empty list', emptyResponse.statusCode === 200 && slugsOf(emptyResponse) === '');
						ok('isActive and sortOrder come back typed', (standardResponse.bodyJson || [])[0].isActive === true && (standardResponse.bodyJson || [])[0].sortOrder === 10);
						ok("an apostrophe in a title is stored once, not doubled", (standardResponse.bodyJson || [])[0].title === "One dictionary, four lenses (Steve's)");
						post(state, '/api/companion-page-save', { pageRecord: { ...pageRecordOf({}), sortOrder: undefined } }, 'admin', (absentResponse) => {
							post(state, '/api/companion-page-save', { pageRecord: { ...pageRecordOf({}), colour: 'blue' } }, 'admin', (unknownResponse) => {
								ok('a page record missing a column is refused by name', absentResponse.statusCode === 400 && /sortOrder/.test(absentResponse.bodyText), absentResponse.bodyText.slice(0, 120));
								ok('a page record with an unknown property is refused by name', unknownResponse.statusCode === 400 && /colour/.test(unknownResponse.bodyText));
								next(state);
							});
						});
					});
				});
			});
		}),

	// ---------------------------------------------------------------- BODY
	(state, next) => {
		console.log('BODY limit');
		const largeText = 'x'.repeat(200 * 1024);
		post(state, '/api/harness-echo', { largeText }, 'admin', (ordinaryResponse) => {
			httpPost({ baseUrl: state.server.baseUrl, routePath: '/api/companion-source-upload', rawBodyText: `{not json ${largeText}` }, (anonymousError, anonymousResponse) => {
				httpPost({ baseUrl: state.server.baseUrl, routePath: '/api/companion-source-upload', rawBodyText: `{not json ${largeText}`, authtoken: state.tokenByRoleName.admin }, (adminBadError, adminBadResponse) => {
					const largeFileBuffer = Buffer.from(`elementId,element\n${'1,Worker\n'.repeat(16000)}`);
					post(state, '/api/companion-source-upload', uploadOf({ sourcePart: 'X', fileBase64: largeFileBuffer.toString('base64') }), 'admin', (adminLargeResponse) => {
						ok('a 200 KB body to an ordinary route is still refused', ordinaryResponse.statusCode === 413, `status ${ordinaryResponse.statusCode}`);
						ok('an anonymous 200 KB post to the upload route is refused before any parse', anonymousResponse.statusCode === 401, `status ${anonymousResponse.statusCode} ${anonymousResponse.bodyText.slice(0, 80)}`);
						ok('  (control: for an admin the same bytes ARE parsed, and fail as JSON)', adminBadResponse.statusCode === 400 && /could not be read/.test(adminBadResponse.bodyText), adminBadResponse.bodyText.slice(0, 120));
						ok("an admin's 200 KB upload succeeds", adminLargeResponse.statusCode === 200 && adminLargeResponse.bodyJson[0].byteSize === largeFileBuffer.length, `status ${adminLargeResponse.statusCode}, ${largeFileBuffer.length} bytes`);
						next({ ...state, largeFileBuffer });
					});
				});
			});
		});
	},
	closeStep,

	// ---------------------------------------------------------------- RED TWINS
	bootStep('twinRowOverwritten', {
		dataMappingModule: loadWithStubs({
			modulePath: DATA_MAPPING_PATH,
			stubByRequestPath: {
				[SOURCE_MAPPER_PATH]: loadWithStubs({
					modulePath: SOURCE_MAPPER_PATH,
					mutationList: [{ find: `UPDATE <!tableName!> SET [isCurrent] = 0
							WHERE [pageSlug] = NEW.[pageSlug]`, replace: `DELETE FROM <!tableName!>
							WHERE [pageSlug] = NEW.[pageSlug]` }],
				}),
			},
		}),
	}),
	twoUploadsStep,
	(state, next) => {
		console.log('red twin rowOverwritten');
		ok('the twin uploads succeed (the twin is otherwise working)', state.secondResponse.statusCode === 200, state.secondResponse.bodyText.slice(0, 120));
		ok('the gate sees the lost previous row', !previousSurvives(state));
		next(state);
	},
	closeStep,
	bootStep('twinFileOverwritten', {
		accessPointModulePathByName: {
			'companion-source-upload': loadWithStubs({
				modulePath: UPLOAD_ACCESS_POINT_PATH,
				stubByRequestPath: {
					'../../lib/companion-pages/companion-source-files': loadWithStubs({
						modulePath: SOURCE_FILES_PATH,
						mutationList: [
							{ find: '`${sourceRefId}-${path.basename(String(fileName))', replace: '`${path.basename(String(fileName))' },
							{ find: "{ flag: 'wx' }", replace: "{ flag: 'w' }" },
						],
					}),
				},
			}),
		},
	}),
	twoUploadsStep,
	(state, next) => {
		console.log('red twin fileOverwritten');
		// the twin's second write replaces the first file; its row is then refused by the UNIQUE storedFileName (a second
		// defence) and the twin removes "its own" file, which was the first row's: either way the old bytes are gone
		ok('the twin really wrote over the first file', state.secondResponse.statusCode !== 200 || state.firstFileResponse.statusCode !== 200, state.secondResponse.bodyText.slice(0, 120));
		ok('the gate sees the overwritten previous file', !previousSurvives(state), `old file answered ${state.firstFileResponse.statusCode}`);
		next(state);
	},
	closeStep,
	bootStep('twinSkipOff', { isLargeBodySkipOff: true }),
	(state, next) =>
		post(state, '/api/companion-page-save', { pageRecord: pageRecordOf({}) }, 'admin', () =>
			post(state, '/api/companion-source-upload', uploadOf({ sourcePart: 'X', fileBase64: Buffer.from(`a,b\n${'1,Worker\n'.repeat(16000)}`).toString('base64') }), 'admin', (largeResponse) => {
				console.log('red twin skipOff');
				ok("without the skip, the admin's 200 KB upload is refused 413", largeResponse.statusCode === 413, `status ${largeResponse.statusCode}`);
				next(state);
			}),
		),
	closeStep,
];

runSteps(stepList, {}, () => {
	fs.rmSync(scratchRootPath, { recursive: true, force: true });
	const failedCount = results.filter(([, isPass]) => !isPass).length;
	console.log(`\n=== Results: ${results.length - failedCount} passed, ${failedCount} failed ===\n`);
	process.exit(failedCount > 0 ? 1 : 0);
});
