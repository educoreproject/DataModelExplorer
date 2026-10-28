#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]
// @concept: [[AccessPointPattern]]
//
// The current compile of a compiled companion page (SPEC-companionPages-102826, gates G3.2 and G3.3). A compile is
// current only while its four stamps equal the live values:
//   graphName            [dataModelExplorerSearch] goldenContainerName, which the golden's passport must also name
//   graphContractSha256  the golden passport's
//   sourceSetSha256      sha256 over the page's current sources, one line 'sourceRole TAB sourcePart TAB sha256' each,
//                        sorted (read through the companion-source-list access point)
//   compilerVersion      the page's compiler's (compilers/compiler-registry.js)
// When the newest stored compile is not current, the page is recompiled before answering and the compile stored. The
// sources' bytes are read only through the companion-source-file access point (which checks them against their row),
// and the golden only through the READ-ONLY handle (neo4jDb). If the recompile fails, or the live stamps cannot be read
// at all, the last good compile is answered marked NOT current, with which stamps differ and why; with no compile on
// record the request is refused by name (compileUnavailable). One recompile per page runs at a time; requests arriving
// meanwhile wait for its result.
//
//   inputData: { pageSlug }
//   -> callback(errText, { pageSlug, isCurrent, staleStampList [{ stampName, compileValue, liveValue }],
//                          recompileErrorText, compileRecord { refId, graphName, graphContractSha256, sourceSetSha256,
//                          compiledAt, compilerVersion }, payload })

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const crypto = require('crypto');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();

const newRefId = require('../../lib/new-refid')({ digits: 20 });
const { getCompanionTables } = require('../../lib/companion-pages/companion-tables');
const { compilerByName } = require('../../lib/companion-pages/compilers/compiler-registry');
const { namePatternByField } = require('../../lib/companion-pages/companion-source-rules.json');

const QUIET = { suppressStatementLog: true };

const sha256Of = (contentText) => crypto.createHash('sha256').update(contentText).digest('hex');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig } = process.global;
	const { sqlDb, dataMapping, neo4jDb, accessPointsDotD } = passThroughParameters;
	const pageMapper = dataMapping['companion-page'];
	const compileMapper = dataMapping['companion-compile'];

	// the requests waiting on a recompile already running, by pageSlug
	const waitingCallbackListByPageSlug = {};

	// ================================================================================
	// THE GOLDEN, read only

	// neo4j-instance calls back from inside the driver's promise and turns a later throw into a second callback naming
	// the query; the work after each read therefore starts on its own tick (as standard-downloads does)
	const runGoldenQuery = (queryName, callback) => {
		if (!neo4jDb) {
			callback(`the golden graph is not connected on this server`);
			return;
		}
		const { cypher, params } = compileMapper.getCypher(queryName);
		neo4jDb.runQuery(cypher, params, (queryError, rowList) => setImmediate(() => callback(queryError ? `reading ${queryName} on the golden failed: ${queryError}` : '', rowList || [])));
	};

	// ================================================================================
	// THE LIVE STAMPS

	const readLiveStamps = ({ pageSlug, compilerEntry }, callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			const goldenContainerName = (getConfig('dataModelExplorerSearch') || {}).goldenContainerName;
			if (typeof goldenContainerName !== 'string' || !goldenContainerName) {
				next('this server declares no [dataModelExplorerSearch] goldenContainerName', args);
				return;
			}
			next('', { ...args, goldenContainerName });
		});

		taskList.push((args, next) =>
			runGoldenQuery('goldenPassport', (queryError, passportRowList) => {
				if (queryError) {
					next(queryError, args);
					return;
				}
				if (passportRowList.length !== 1) {
					next(`the golden holds ${passportRowList.length} passport(s); one is needed to stamp a compile`, args);
					return;
				}
				if (passportRowList[0].graphName !== args.goldenContainerName) {
					next(`the golden's passport names graph '${passportRowList[0].graphName}', this server serves '${args.goldenContainerName}'`, args);
					return;
				}
				next('', { ...args, goldenPassport: passportRowList[0] });
			}),
		);

		taskList.push((args, next) => accessPointsDotD['companion-source-list']({ pageSlug, listScope: 'current' }, (listError, sourceRecordList) => next(listError, { ...args, sourceRecordList })));

		pipeRunner(taskList.getList(), {}, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}
			const sourceSetText = args.sourceRecordList
				.map(({ sourceRole, sourcePart, sha256 }) => `${sourceRole}\t${sourcePart}\t${sha256}`)
				.sort()
				.join('\n');
			callback('', {
				liveStampByName: { graphName: args.goldenContainerName, graphContractSha256: args.goldenPassport.graphContractSha256, sourceSetSha256: sha256Of(sourceSetText), compilerVersion: compilerEntry.compilerVersion },
				sourceRecordList: args.sourceRecordList,
			});
		});
	};

	const staleStampListOf = ({ compileRow, liveStampByName }) =>
		compileMapper.FRESHNESS_STAMP_NAME_LIST.filter((stampName) => compileRow[stampName] !== liveStampByName[stampName]).map((stampName) => ({ stampName, compileValue: compileRow[stampName], liveValue: liveStampByName[stampName] }));

	// ================================================================================
	// THE RECOMPILE

	const recompile = ({ pageSlug, compilerEntry, liveStampByName, sourceRecordList, compileTable }, callback) => {
		const taskList = new taskListPlus();

		// each current source's bytes, through its row only
		sourceRecordList.forEach((sourceRecord) =>
			taskList.push((args, next) =>
				accessPointsDotD['companion-source-file']({ sourceRefId: sourceRecord.refId }, (fileError, sourceFile) => {
					if (fileError) {
						next(`source ${sourceRecord.sourceRole}/${sourceRecord.sourcePart} (${sourceRecord.fileName}): ${fileError}`, args);
						return;
					}
					const sourceList = args.sourceListByRole[sourceRecord.sourceRole] || [];
					const sourceEntry = { sourcePart: sourceRecord.sourcePart, fileName: sourceRecord.fileName, documentDate: sourceRecord.documentDate, contentBuffer: sourceFile.contentBuffer };
					next('', { ...args, sourceListByRole: { ...args.sourceListByRole, [sourceRecord.sourceRole]: [...sourceList, sourceEntry] } });
				}),
			),
		);

		Object.entries(compilerEntry.goldenQueryNameByRowSetName).forEach(([rowSetName, queryName]) =>
			taskList.push((args, next) => runGoldenQuery(queryName, (queryError, rowList) => next(queryError, { ...args, goldenRowSet: { ...args.goldenRowSet, [rowSetName]: rowList } }))),
		);

		taskList.push((args, next) => {
			const { compileErrorText, payloadBody } = compilerEntry.compile({ sourceListByRole: args.sourceListByRole, goldenRowSet: args.goldenRowSet });
			if (compileErrorText) {
				next(compileErrorText, args);
				return;
			}
			const sourceList = sourceRecordList.map((sourceRecord) => sourceRecord.qtSelectProperties(['refId', 'sourceRole', 'sourcePart', 'fileName', 'documentDate', 'originUrl', 'originNote', 'sha256', 'uploadedAt']));
			const compileRow = { refId: newRefId(), pageSlug, ...liveStampByName, compiledAt: new Date().toISOString(), payloadJson: JSON.stringify({ ...payloadBody, sourceList }), statusText: 'compiled' };
			next('', { ...args, compileRow });
		});

		taskList.push((args, next) => compileTable.runStatement(compileMapper.getSql('insert', compileMapper.map(args.compileRow, 'reverse')), QUIET, (insertError) => next(insertError ? `storing the compile failed: ${insertError}` : '', args)));

		pipeRunner(taskList.getList(), { sourceListByRole: {}, goldenRowSet: {} }, (err, args) => callback(err, args.compileRow));
	};

	// one recompile per page at a time: a request arriving while one runs is answered with its result
	const recompileOnce = (recompileRequest, callback) => {
		const { pageSlug } = recompileRequest;
		if (waitingCallbackListByPageSlug[pageSlug]) {
			waitingCallbackListByPageSlug[pageSlug].push(callback);
			return;
		}
		waitingCallbackListByPageSlug[pageSlug] = [callback];
		recompile(recompileRequest, (recompileError, compileRow) => {
			const waitingCallbackList = waitingCallbackListByPageSlug[pageSlug];
			delete waitingCallbackListByPageSlug[pageSlug];
			waitingCallbackList.forEach((waitingCallback) => waitingCallback(recompileError, compileRow));
		});
	};

	// ================================================================================
	// THE ANSWER

	const answerOf = ({ compileRow, isCurrent, staleStampList, recompileErrorText }) => ({
		pageSlug: compileRow.pageSlug,
		isCurrent,
		staleStampList,
		recompileErrorText,
		compileRecord: compileRow.qtSelectProperties(['refId', ...compileMapper.FRESHNESS_STAMP_NAME_LIST, 'compiledAt']),
		payload: JSON.parse(compileRow.payloadJson),
	});

	const serviceFunction = (inputData, callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			if (!new RegExp(namePatternByField.pageSlug).test(String(args.pageSlug))) {
				next(`pageSlug '${args.pageSlug}' does not match ${namePatternByField.pageSlug}`, args);
				return;
			}
			next('', args);
		});

		taskList.push((args, next) => getCompanionTables({ sqlDb, dataMapping }, mergeArgs(args, next, 'companionTables')));

		taskList.push((args, next) =>
			args.companionTables.pageTable.getData(pageMapper.getSql('byPageSlug', { pageSlug: args.pageSlug }), QUIET, (err, rowList = []) => {
				const pageRecord = rowList && rowList.length ? pageMapper.map(rowList[0], 'forward') : null;
				// the first refusal that applies, in order
				const refusalText =
					[
						[!pageRecord, () => `no companion page '${args.pageSlug}' is registered`],
						[pageRecord && !pageRecord.isActive, () => `companion page '${args.pageSlug}' is not active`],
						[pageRecord && pageRecord.targetKind !== 'compiled', () => `companion page '${args.pageSlug}' is not a compiled page (targetKind ${pageRecord.targetKind})`],
						[pageRecord && !compilerByName[pageRecord.compilerName], () => `companion page '${args.pageSlug}' names compiler '${pageRecord.compilerName}', which is not one of ${Object.keys(compilerByName).join(', ')}`],
					]
						.filter(([isRefused]) => isRefused)
						.map(([, refusalTextOf]) => refusalTextOf())[0] || '';
				next(err || refusalText, { ...args, compilerEntry: pageRecord && compilerByName[pageRecord.compilerName] });
			}),
		);

		taskList.push((args, next) => args.companionTables.compileTable.getData(compileMapper.getSql('newestForPage', { pageSlug: args.pageSlug }), QUIET, (err, rowList = []) => next(err, { ...args, newestCompileRow: rowList && rowList.length ? compileMapper.map(rowList[0], 'forward') : null })));

		// the live stamps; when they cannot be read, the newest compile can only be answered as not current
		taskList.push((args, next) => readLiveStamps(args, (stampError, liveStamps) => next('', { ...args, stampError, ...liveStamps })));

		taskList.push((args, next) => {
			const { newestCompileRow, stampError, liveStampByName } = args;
			if (stampError) {
				next(newestCompileRow ? '' : `compileUnavailable: no compile of '${args.pageSlug}' is on record and the live stamps cannot be read: ${stampError}`, { ...args, pageAnswer: newestCompileRow && answerOf({ compileRow: newestCompileRow, isCurrent: false, staleStampList: [], recompileErrorText: `the live stamps cannot be read: ${stampError}` }) });
				return;
			}
			const staleStampList = newestCompileRow ? staleStampListOf({ compileRow: newestCompileRow, liveStampByName }) : [];
			if (newestCompileRow && !staleStampList.length) {
				next('', { ...args, pageAnswer: answerOf({ compileRow: newestCompileRow, isCurrent: true, staleStampList, recompileErrorText: '' }) });
				return;
			}
			recompileOnce({ pageSlug: args.pageSlug, compilerEntry: args.compilerEntry, liveStampByName, sourceRecordList: args.sourceRecordList, compileTable: args.companionTables.compileTable }, (recompileError, compileRow) => {
				if (!recompileError) {
					next('', { ...args, pageAnswer: answerOf({ compileRow, isCurrent: true, staleStampList: [], recompileErrorText: '' }) });
					return;
				}
				xLog.error(`${moduleName}: recompiling '${args.pageSlug}' failed: ${recompileError}`);
				next(newestCompileRow ? '' : `compileUnavailable: no compile of '${args.pageSlug}' is on record and the recompile failed: ${recompileError}`, { ...args, pageAnswer: newestCompileRow && answerOf({ compileRow: newestCompileRow, isCurrent: false, staleStampList, recompileErrorText: recompileError }) });
			});
		});

		pipeRunner(taskList.getList(), { pageSlug: inputData.pageSlug }, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}
			callback('', args.pageAnswer);
		});
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
