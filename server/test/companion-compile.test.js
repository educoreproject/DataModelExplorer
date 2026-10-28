#!/usr/bin/env node
'use strict';

// companion-compile.test.js — gates G3.1 to G3.3 (Companion Pages Phase 3, SPEC-companionPages-102826). Runs the REAL
// sqlite-instance, data-mapping, companion access points, token middleware and endpoints over HTTP
// (test/lib/companionServerHarness.js) on throwaway databases under os.tmpdir(), never a project database, with the
// jedx-dictionary page and its sources seeded from seed/jedx-dictionary.seed.json through the upload access point.
// The compile reads the live golden (_goldenContainer.ini) on a READ-ONLY handle, wrapped so a test can make a read fail.
//
// PROVES:
//   G3.1  on the golden, with the 2026-08-20 dictionary, the compile reproduces the join probe: 422 elements, 290
//         resolved, 123 distinct JEDx properties, 145 with a match, AND each element equals joinProbe.json's (status,
//         property, match set); a difference is printed by element. Also: a second view answers the same compile;
//         the explorer roles may read it, no token and the lookalike role may not
//   G3.2  a stored compile whose graphName, graphContractSha256, sourceSetSha256 or compilerVersion differs from the
//         live value is never answered as current: the request recompiles (a new compile, current, live stamps).
//         sourceSetSha256 changes by a real upload; the other three by changing the stored stamp
//   G3.3  a failed recompile answers the last good compile marked NOT current, with the stale stamp and the reason:
//         (a) a dictionary part with no header uploaded, (b) a golden read failing, (c) the passport unreadable.
//         Restoring the part's bytes makes the last good compile current again without a recompile. A page with no
//         compile whose first compile fails is refused (compileUnavailable)
// RED TWINS (each observed failing the gate):
//   exactSegmentOnly a walk that looks a segment up only as written (no singular or plural form): G3.1's counts and
//                    elements differ from the probe's
//   ignores<stamp>   one per stamp: a freshness check that leaves that stamp out answers the stale compile as current
//   failureCurrent   a failed recompile answered as current
//
//   /usr/local/bin/node server/test/companion-compile.test.js   (sqlite3 is built for that node)

const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadWithStubs } = require('./lib/moduleWithStubs');
const { bootCompanionServer, httpPost, loginEveryRole } = require('./lib/companionServerHarness');
const { readGoldenContainerName } = require('./lib/goldenContainerName');

const SERVER_PATH = path.join(__dirname, '..');
const PROJECT_SYSTEM_PATH = path.join(SERVER_PATH, '..', '..');
const COMPILE_ACCESS_POINT_PATH = path.join(SERVER_PATH, 'data-model', 'access-points-dot-d', 'accessPoints.d', 'companion-compile-current.js');
const COMPILER_DIR_PATH = path.join(SERVER_PATH, 'data-model', 'lib', 'companion-pages', 'compilers');
const SEED_MANIFEST = JSON.parse(fs.readFileSync(path.join(SERVER_PATH, 'data-model', 'lib', 'companion-pages', 'seed', 'jedx-dictionary.seed.json'), 'utf8'));
const SEED_SOURCE_DIR_PATH = path.join(PROJECT_SYSTEM_PATH, SEED_MANIFEST.sourceDirProjectRelativePath);
const JOIN_PROBE_FILE_PATH = path.join(PROJECT_SYSTEM_PATH, 'management', 'zNotesPlansDocs', 'companionPages-102826', 'joinProbe', 'joinProbe.json');
const PAGE_SLUG = SEED_MANIFEST.pageRecord.pageSlug;
const EXPECTED_COUNT_SUMMARY = { elementCount: 422, resolvedCount: 290, distinctPropertyCount: 123, matchedElementCount: 145 };
const STAMP_NAME_LIST = ['graphName', 'graphContractSha256', 'sourceSetSha256', 'compilerVersion'];

const results = [];
const ok = (name, condition, detail) => {
	results.push([name, !!condition]);
	console.log(`  ${condition ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

const scratchRootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'companionCompile-'));
const goldenContainerName = readGoldenContainerName();

// runs (state, next) steps in order; a step calls next(state) to continue
const runSteps = (stepList, initialState, done) => {
	const runAt = (stepIndex, state) => (stepIndex >= stepList.length ? done(state) : stepList[stepIndex](state, (nextState) => runAt(stepIndex + 1, nextState)));
	runAt(0, initialState);
};

const abort = (whereText, errorText) => {
	console.log(`  FAIL: ${whereText}: ${errorText}`);
	process.exit(1);
};

// ================================================================================
// THE GOLDEN: the real read-only handle, behind a switch board that can make one read fail

const readFailureByName = { matchRead: false, passportRead: false, everyJedxRead: false };
const READ_NAME_PATTERN_LIST = [
	['passportRead', /GraphProvenance/],
	['matchRead', /HubReference/],
	['everyJedxRead', /Jedx/],
];
const wrappedGoldenOf = (goldenDb) => ({
	runQuery: (cypher, params, callback) => {
		const failingReadName = READ_NAME_PATTERN_LIST.find(([readName, cypherPattern]) => readFailureByName[readName] && cypherPattern.test(cypher));
		if (failingReadName) {
			callback(`test switch ${failingReadName[0]}: the read is made to fail`);
			return;
		}
		goldenDb.runQuery(cypher, params, callback);
	},
});

// ================================================================================
// STEPS

const bootStep = (scratchName, bootOptions) => (state, next) =>
	bootCompanionServer({ scratchDirPath: path.join(scratchRootPath, scratchName), neo4jDb: state.wrappedGolden, configBySectionName: { dataModelExplorerSearch: { goldenContainerName } }, ...bootOptions }, (bootError, server) => {
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

const uploadStep = (uploadRequest) => (state, next) =>
	state.server.accessPointByName['companion-source-upload']({ uploadedBy: 'companion-compile.test', ...uploadRequest }, (uploadError) => {
		if (uploadError) abort(`upload ${uploadRequest.sourceRole}/${uploadRequest.sourcePart}`, uploadError);
		next(state);
	});

const seedStep = (state, next) =>
	state.server.accessPointByName['companion-page-save']({ pageRecord: SEED_MANIFEST.pageRecord }, (saveError) => {
		if (saveError) abort('seed page', saveError);
		const uploadNext = (remainingSourceList) => {
			if (!remainingSourceList.length) {
				next(state);
				return;
			}
			const oneSource = remainingSourceList[0];
			uploadStep({
				pageSlug: PAGE_SLUG,
				sourceRole: oneSource.sourceRole,
				sourcePart: oneSource.sourcePart,
				fileName: path.basename(oneSource.relativeFilePath),
				fileBase64: fs.readFileSync(path.join(SEED_SOURCE_DIR_PATH, oneSource.relativeFilePath)).toString('base64'),
				originUrl: oneSource.originUrl,
				originNote: oneSource.originNote,
				documentDate: oneSource.documentDate,
			})(state, () => uploadNext(remainingSourceList.slice(1)));
		};
		uploadNext(SEED_MANIFEST.sourceList);
	});

// asks for the current compile as roleName (or with no token); stores the response under responseName
const askStep = (responseName, roleName = 'user', requestBody = { pageSlug: PAGE_SLUG }) => (state, next) =>
	httpPost({ baseUrl: state.server.baseUrl, routePath: '/api/companion-compile-current', requestBody, authtoken: roleName ? state.tokenByRoleName[roleName] : undefined }, (postError, response) => {
		if (postError) abort(`ask ${responseName}`, postError);
		const pageAnswer = response.statusCode === 200 && Array.isArray(response.bodyJson) ? response.bodyJson[0] : null;
		next({ ...state, [responseName]: { statusCode: response.statusCode, bodyText: response.bodyText, pageAnswer } });
	});

// changes one stamp of the newest stored compile, as if it had been built from another golden or by another compiler
const staleStampStep = (stampName) => (state, next) =>
	state.server.sqlDb.getTable('companionCompile', (tableError, compileTable) => {
		if (tableError) abort('open companionCompile', tableError);
		compileTable.runStatement(`UPDATE <!tableName!> SET [${stampName}] = 'stale-${stampName}' WHERE refId = (SELECT refId FROM <!tableName!> ORDER BY compiledAt DESC, rowid DESC LIMIT 1);`, { suppressStatementLog: true }, (updateError) => {
			if (updateError) abort(`stale ${stampName}`, updateError);
			next(state);
		});
	});

const switchStep = (readName, isFailing) => (state, next) => {
	readFailureByName[readName] = isFailing;
	next(state);
};

const tocUploadOf = (contentText) => ({ pageSlug: PAGE_SLUG, sourceRole: 'dictionary', sourcePart: 'TOC', fileName: 'Data Dictionary TOC (test revision).csv', fileBase64: Buffer.from(contentText).toString('base64'), originUrl: null, originNote: 'a test revision of the TOC part, which the compiler skips', documentDate: '2026-10-28' });
const seededFileOf = (sourcePart) => SEED_MANIFEST.sourceList.filter((oneSource) => oneSource.sourceRole === 'dictionary' && oneSource.sourcePart === sourcePart).slice(-1)[0];
const vUploadOf = (fileBuffer, fileName) => ({ pageSlug: PAGE_SLUG, sourceRole: 'dictionary', sourcePart: 'VI', fileName, fileBase64: fileBuffer.toString('base64'), originUrl: null, originNote: 'test upload of part VI', documentDate: '2026-10-28' });
const BROKEN_PART_BUFFER = Buffer.from('this,is,not,the,dictionary\n1,2,3,4,5\n');
const seededPartBufferOf = (sourcePart) => fs.readFileSync(path.join(SEED_SOURCE_DIR_PATH, seededFileOf(sourcePart).relativeFilePath));

// ================================================================================
// THE GATE ASSERTIONS, as fault lists, so a twin can be shown to fail them

// G3.2: after a stamp went stale, the answer must be a NEW compile, current, carrying the live stamp
const recompiledFaultListOf = ({ beforeAnswer, afterAnswer, stampName }) => {
	if (!afterAnswer) return ['no compile answered'];
	const faultList = [];
	if (afterAnswer.compileRecord.refId === beforeAnswer.compileRecord.refId) faultList.push(`the stale compile ${beforeAnswer.compileRecord.refId} was answered again`);
	if (!afterAnswer.isCurrent) faultList.push('the answer is not current');
	if (stampName !== 'sourceSetSha256' && afterAnswer.compileRecord[stampName] !== beforeAnswer.compileRecord[stampName]) faultList.push(`${stampName} is '${afterAnswer.compileRecord[stampName]}', not the live '${beforeAnswer.compileRecord[stampName]}'`);
	return faultList;
};

// G3.3: after a failed recompile, the last good compile, NOT current, naming the stale stamp and the reason
const servedStaleFaultListOf = ({ lastGoodAnswer, afterAnswer, stampName, reasonPattern }) => {
	if (!afterAnswer) return ['no compile answered'];
	const faultList = [];
	if (afterAnswer.isCurrent !== false) faultList.push('the answer is marked current');
	if (afterAnswer.compileRecord.refId !== lastGoodAnswer.compileRecord.refId) faultList.push(`compile ${afterAnswer.compileRecord.refId} answered, not the last good ${lastGoodAnswer.compileRecord.refId}`);
	if (stampName && !afterAnswer.staleStampList.some((oneStamp) => oneStamp.stampName === stampName)) faultList.push(`staleStampList does not name ${stampName}: ${JSON.stringify(afterAnswer.staleStampList)}`);
	if (!reasonPattern.test(afterAnswer.recompileErrorText || '')) faultList.push(`the reason '${afterAnswer.recompileErrorText}' does not match ${reasonPattern}`);
	return faultList;
};

// G3.1, per element: each probe element against the compiled one with the same id, element name and part order
const TIER_BY_MATCH_KIND = { exact: 'EXACT_MATCH', close: 'CLOSE_MATCH', narrow: 'NARROW_MATCH', broad: 'BROAD_MATCH' };
const PROBE_STATUS_BY_STATUS = { resolved: 'resolved', unresolved: 'stuckAt', pathAbsent: 'noRoot', unknownRoot: 'noRoot', rootOnly: 'rootOnly' };
const probeSignatureOf = (probeElement) =>
	JSON.stringify([probeElement.id, probeElement.element, probeElement.status, probeElement.status === 'noRoot' ? null : probeElement.jedxStableId, probeElement.matches.map((oneMatch) => [oneMatch.tier, oneMatch.hub, oneMatch.name, oneMatch.method, oneMatch.source, String(oneMatch.confidence)].join('|')).sort()]);
const compiledSignatureOf = (compiledElement) =>
	JSON.stringify([
		compiledElement.elementId,
		compiledElement.elementName,
		`${PROBE_STATUS_BY_STATUS[compiledElement.status]}${compiledElement.status === 'unresolved' ? `:${compiledElement.unresolvedSegment}` : ''}`,
		compiledElement.jedxStableId,
		compiledElement.matchList.map((oneMatch) => [TIER_BY_MATCH_KIND[oneMatch.matchKind], oneMatch.hubName, oneMatch.matchName, oneMatch.mappingMethod, oneMatch.mappingSource, String(oneMatch.mappingConfidence)].join('|')).sort(),
	]);
const elementDifferenceListOf = (compiledElementList) => {
	const probeSignatureList = JSON.parse(fs.readFileSync(JOIN_PROBE_FILE_PATH, 'utf8')).map(probeSignatureOf).sort();
	const compiledSignatureList = compiledElementList.map(compiledSignatureOf).sort();
	const remainingProbeList = [...probeSignatureList];
	const onlyCompiledList = compiledSignatureList.filter((signatureText) => {
		const probeIndex = remainingProbeList.indexOf(signatureText);
		if (probeIndex < 0) return true;
		remainingProbeList.splice(probeIndex, 1);
		return false;
	});
	return [...onlyCompiledList.map((signatureText) => `compiler only: ${signatureText}`), ...remainingProbeList.map((signatureText) => `probe only: ${signatureText}`)];
};

// ================================================================================
// THE STEPS, gate by gate

const g31StepList = [
	bootStep('gate', {}),
	seedStep,
	askStep('firstAnswer'),
	(state, next) => {
		console.log(`G3.1 the compile on ${goldenContainerName}`);
		const { pageAnswer, statusCode, bodyText } = state.firstAnswer;
		if (!pageAnswer) abort('G3.1 first compile', `${statusCode} ${bodyText.slice(0, 300)}`);
		const { countSummary, elementList } = pageAnswer.payload;
		Object.entries(EXPECTED_COUNT_SUMMARY).forEach(([countName, expectedCount]) => ok(`${countName} is ${expectedCount}`, countSummary[countName] === expectedCount, `compiled ${countSummary[countName]}`));
		const elementDifferenceList = elementDifferenceListOf(elementList);
		ok('every element equals joinProbe.json (status, property, match set)', elementDifferenceList.length === 0, elementDifferenceList.slice(0, 12).join('\n      '));
		ok('no walk step had more than one candidate (the probe could not have chosen otherwise)', countSummary.walkChoiceElementCount === 0, String(countSummary.walkChoiceElementCount));
		ok('the compile is current and stamped with the golden', pageAnswer.isCurrent === true && pageAnswer.compileRecord.graphName === goldenContainerName && /^[0-9a-f]{64}$/.test(pageAnswer.compileRecord.graphContractSha256), JSON.stringify(pageAnswer.compileRecord));
		ok('the payload names the sources it was built from (12 current)', pageAnswer.payload.sourceList.length === 12, String(pageAnswer.payload.sourceList.length));
		ok('workedPayAmount is shared by 21 elements', (pageAnswer.payload.sharedPropertyList.find((oneShared) => /workedPayAmount$/.test(oneShared.jedxStableId)) || { elementList: [] }).elementList.length === 21);
		next(state);
	},
	askStep('secondAnswer'),
	askStep('clientAnswer', 'client'),
	askStep('anonymousAnswer', null),
	askStep('lookalikeAnswer', 'subadministrator'),
	askStep('extraPropertyAnswer', 'user', { pageSlug: PAGE_SLUG, path: '/etc' }),
	askStep('unknownPageAnswer', 'user', { pageSlug: 'no-such-page' }),
	(state, next) => {
		ok('a second view answers the same compile, current (no recompile)', state.secondAnswer.pageAnswer && state.secondAnswer.pageAnswer.compileRecord.refId === state.firstAnswer.pageAnswer.compileRecord.refId && state.secondAnswer.pageAnswer.isCurrent);
		ok('client may read it', state.clientAnswer.statusCode === 200);
		ok('no token: 401', state.anonymousAnswer.statusCode === 401, String(state.anonymousAnswer.statusCode));
		ok('subadministrator: 401', state.lookalikeAnswer.statusCode === 401, String(state.lookalikeAnswer.statusCode));
		ok('an unexpected request property is refused 400', state.extraPropertyAnswer.statusCode === 400 && /unexpected request property: path/.test(state.extraPropertyAnswer.bodyText), state.extraPropertyAnswer.bodyText.slice(0, 120));
		ok('an unknown page is refused 400 by name', state.unknownPageAnswer.statusCode === 400 && /no companion page 'no-such-page'/.test(state.unknownPageAnswer.bodyText), state.unknownPageAnswer.bodyText.slice(0, 120));
		next({ ...state, lastAnswer: state.secondAnswer });
	},
];

// G3.2, one stamp: make it stale, ask, and check the answer is a fresh compile
const staleThenAskStepList = (stampName) => [
	stampName === 'sourceSetSha256' ? uploadStep(tocUploadOf(`test revision for ${stampName} ${Date.now()}\n`)) : staleStampStep(stampName),
	askStep('afterStaleAnswer'),
];

const g32StepList = STAMP_NAME_LIST.flatMap((stampName) => [
	...staleThenAskStepList(stampName),
	(state, next) => {
		console.log(`G3.2 ${stampName}`);
		const faultList = recompiledFaultListOf({ beforeAnswer: state.lastAnswer.pageAnswer, afterAnswer: state.afterStaleAnswer.pageAnswer, stampName });
		ok(`a stale ${stampName} is never answered: the request recompiled`, faultList.length === 0, faultList.join('; '));
		if (stampName === 'sourceSetSha256') ok('  the new compile carries a new sourceSetSha256', state.afterStaleAnswer.pageAnswer.compileRecord.sourceSetSha256 !== state.lastAnswer.pageAnswer.compileRecord.sourceSetSha256);
		ok('  and still reproduces the probe counts', state.afterStaleAnswer.pageAnswer && state.afterStaleAnswer.pageAnswer.payload.countSummary.elementCount === 422);
		next({ ...state, lastAnswer: state.afterStaleAnswer });
	},
]);

const g33StepList = [
	// (a) a broken dictionary part
	uploadStep(vUploadOf(BROKEN_PART_BUFFER, 'Data Dictionary VI (broken).csv')),
	askStep('brokenPartAnswer'),
	askStep('brokenPartAgainAnswer'),
	(state, next) => {
		console.log('G3.3 (a) a dictionary part with no header');
		const faultList = servedStaleFaultListOf({ lastGoodAnswer: state.lastAnswer.pageAnswer, afterAnswer: state.brokenPartAnswer.pageAnswer, stampName: 'sourceSetSha256', reasonPattern: /dictionary part VI .* has no header row/ });
		ok('the last good compile is answered, NOT current, naming sourceSetSha256 and the reason', faultList.length === 0, faultList.join('; '));
		ok('  its payload is the last good one (422 elements)', state.brokenPartAnswer.pageAnswer && state.brokenPartAnswer.pageAnswer.payload.countSummary.elementCount === 422);
		ok('  a second request tries again and is still not current', state.brokenPartAgainAnswer.pageAnswer && state.brokenPartAgainAnswer.pageAnswer.isCurrent === false);
		next(state);
	},
	uploadStep(vUploadOf(seededPartBufferOf('VI'), 'Data Dictionary VI (restored).csv')),
	askStep('restoredPartAnswer'),
	(state, next) => {
		const restoredAnswer = state.restoredPartAnswer.pageAnswer;
		ok('restoring part VI\'s bytes makes the last good compile current again, without a recompile', restoredAnswer && restoredAnswer.isCurrent && restoredAnswer.compileRecord.refId === state.lastAnswer.pageAnswer.compileRecord.refId, restoredAnswer && JSON.stringify(restoredAnswer.compileRecord));
		next(state);
	},
	// (b) a golden read failing during the recompile
	switchStep('matchRead', true),
	staleStampStep('compilerVersion'),
	askStep('goldenFailAnswer'),
	switchStep('matchRead', false),
	(state, next) => {
		console.log('G3.3 (b) a golden read fails during the recompile');
		const faultList = servedStaleFaultListOf({ lastGoodAnswer: state.lastAnswer.pageAnswer, afterAnswer: state.goldenFailAnswer.pageAnswer, stampName: 'compilerVersion', reasonPattern: /reading jedxMatchList on the golden failed/ });
		ok('the last good compile is answered, NOT current, naming compilerVersion and the reason', faultList.length === 0, faultList.join('; '));
		next(state);
	},
	// (c) the passport unreadable: the stamps cannot be read at all
	switchStep('passportRead', true),
	askStep('passportFailAnswer'),
	switchStep('passportRead', false),
	(state, next) => {
		console.log('G3.3 (c) the live stamps cannot be read');
		const faultList = servedStaleFaultListOf({ lastGoodAnswer: state.lastAnswer.pageAnswer, afterAnswer: state.passportFailAnswer.pageAnswer, stampName: '', reasonPattern: /live stamps cannot be read: .*passportRead/ });
		ok('the last good compile is answered, NOT current, with the reason', faultList.length === 0, faultList.join('; '));
		next(state);
	},
	askStep('recoveredAnswer'),
	(state, next) => {
		ok('with the golden readable again, the next request recompiles and is current', state.recoveredAnswer.pageAnswer && state.recoveredAnswer.pageAnswer.isCurrent && state.recoveredAnswer.pageAnswer.compileRecord.refId !== state.lastAnswer.pageAnswer.compileRecord.refId);
		next(state);
	},
	closeStep,
	// no compile on record, and the first compile fails
	switchStep('everyJedxRead', true),
	bootStep('firstCompileFails', {}),
	seedStep,
	askStep('unavailableAnswer'),
	switchStep('everyJedxRead', false),
	(state, next) => {
		console.log('G3.3 no compile on record');
		ok('a page whose first compile fails is refused by name (compileUnavailable)', state.unavailableAnswer.statusCode === 400 && /compileUnavailable: no compile of 'jedx-dictionary' is on record and the recompile failed/.test(state.unavailableAnswer.bodyText), state.unavailableAnswer.bodyText.slice(0, 200));
		next(state);
	},
	closeStep,
];

// ================================================================================
// RED TWINS

const STALE_FILTER_FIND_TEXT = 'compileMapper.FRESHNESS_STAMP_NAME_LIST.filter((stampName) => compileRow[stampName] !== liveStampByName[stampName])';
const twinStepListOf = (stampName) => [
	bootStep(`twinIgnores-${stampName}`, {
		accessPointModulePathByName: {
			'companion-compile-current': loadWithStubs({ modulePath: COMPILE_ACCESS_POINT_PATH, mutationList: [{ find: STALE_FILTER_FIND_TEXT, replace: `compileMapper.FRESHNESS_STAMP_NAME_LIST.filter((stampName) => stampName !== '${stampName}' && compileRow[stampName] !== liveStampByName[stampName])` }] }),
		},
	}),
	seedStep,
	askStep('lastAnswerRaw'),
	(state, next) => next({ ...state, lastAnswer: state.lastAnswerRaw }),
	...staleThenAskStepList(stampName),
	(state, next) => {
		console.log(`red twin ignores ${stampName}`);
		const faultList = recompiledFaultListOf({ beforeAnswer: state.lastAnswer.pageAnswer, afterAnswer: state.afterStaleAnswer.pageAnswer, stampName });
		ok(`the G3.2 ${stampName} gate goes red on the twin`, faultList.length > 0, faultList.join('; '));
		next(state);
	},
	closeStep,
];

const exactSegmentTwinStepList = [
	bootStep('twinExactSegmentOnly', {
		accessPointModulePathByName: {
			'companion-compile-current': loadWithStubs({
				modulePath: COMPILE_ACCESS_POINT_PATH,
				stubByRequestPath: {
					'../../lib/companion-pages/compilers/compiler-registry': loadWithStubs({
						modulePath: path.join(COMPILER_DIR_PATH, 'compiler-registry.js'),
						stubByRequestPath: {
							'./jedx-dictionary-compiler': loadWithStubs({
								modulePath: path.join(COMPILER_DIR_PATH, 'jedx-dictionary-compiler.js'),
								mutationList: [{ find: "[segmentText, segmentText.replace(/s+$/, ''), `${segmentText}s`]", replace: '[segmentText]' }],
							}),
						},
					}),
				},
			}),
		},
	}),
	seedStep,
	askStep('twinAnswer'),
	(state, next) => {
		console.log('red twin exactSegmentOnly');
		const { countSummary, elementList } = state.twinAnswer.pageAnswer.payload;
		const countFaultList = Object.entries(EXPECTED_COUNT_SUMMARY).filter(([countName, expectedCount]) => countSummary[countName] !== expectedCount).map(([countName]) => `${countName} ${countSummary[countName]}`);
		ok('the G3.1 gate goes red on the twin (counts and elements)', countFaultList.length > 0 && elementDifferenceListOf(elementList).length > 0, countFaultList.join(', '));
		next(state);
	},
	closeStep,
];

const failureCurrentTwinStepList = [
	bootStep('twinFailureCurrent', {
		accessPointModulePathByName: {
			'companion-compile-current': loadWithStubs({ modulePath: COMPILE_ACCESS_POINT_PATH, mutationList: [{ find: 'answerOf({ compileRow: newestCompileRow, isCurrent: false, staleStampList, recompileErrorText: recompileError })', replace: "answerOf({ compileRow: newestCompileRow, isCurrent: true, staleStampList: [], recompileErrorText: '' })" }] }),
		},
	}),
	seedStep,
	askStep('lastAnswerRaw'),
	uploadStep(vUploadOf(BROKEN_PART_BUFFER, 'Data Dictionary VI (broken).csv')),
	askStep('brokenPartAnswer'),
	(state, next) => {
		console.log('red twin failureCurrent');
		const faultList = servedStaleFaultListOf({ lastGoodAnswer: state.lastAnswerRaw.pageAnswer, afterAnswer: state.brokenPartAnswer.pageAnswer, stampName: 'sourceSetSha256', reasonPattern: /has no header row/ });
		ok('the G3.3 gate goes red on the twin', faultList.length > 0, faultList.join('; '));
		next(state);
	},
	closeStep,
];

// ================================================================================

// the harness installs its own process.global at boot; until then the golden connection needs a quiet logger
process.global = { xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {}, debug: () => {} } };
const { resolveContainerConnection } = require('../data-model/lib/user-graph/container-connection-resolver');
const neo4jGen = require('../data-model/lib/neo4j-instance/neo4j-instance')({ unused: true });
const goldenConnection = resolveContainerConnection(goldenContainerName);
if (goldenConnection.error) abort('golden connection', goldenConnection.error);

neo4jGen.initDatabaseInstance({ neo4jBoltUri: goldenConnection.boltUri, neo4jUser: goldenConnection.user, neo4jPassword: goldenConnection.password, readOnly: true, queryTimeoutMs: 120000 }, (connectError, goldenDb) => {
	if (connectError) abort('golden connect', connectError);
	// G3.1, G3.2 and the first G3.3 cases share one server; g33StepList closes it
	const stepList = [...g31StepList, ...g32StepList, ...g33StepList, ...exactSegmentTwinStepList, ...STAMP_NAME_LIST.flatMap(twinStepListOf), ...failureCurrentTwinStepList];
	runSteps(stepList, { wrappedGolden: wrappedGoldenOf(goldenDb) }, () => {
		goldenDb.close();
		fs.rmSync(scratchRootPath, { recursive: true, force: true });
		const failedCount = results.filter(([, passed]) => !passed).length;
		console.log(`\n=== Results: ${results.length - failedCount} passed, ${failedCount} failed ===`);
		process.exit(failedCount ? 1 : 0);
	});
});
