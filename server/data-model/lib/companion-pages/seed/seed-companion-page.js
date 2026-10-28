#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]
//
// seed-companion-page.js — registers one companion page and uploads its sources, in order, from a seed manifest
// (e.g. jedx-dictionary.seed.json), through the SAME companion-page-save and companion-source-upload access points the
// admin endpoints call. It reads this machine's server configuration exactly as startApiServer does, so it writes the
// instance's own database and companionSources directory. Run once per database: a page that already has sources is
// refused, so a second run cannot double the history. Back the database up first.
//
//   /usr/local/bin/node server/data-model/lib/companion-pages/seed/seed-companion-page.js --seedFileName=jedx-dictionary.seed.json

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const fs = require('fs');
const path = require('path');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();

const SERVER_PATH = path.join(__dirname, '..', '..', '..', '..');
const ACCESS_POINT_DIR_PATH = path.join(SERVER_PATH, 'data-model', 'access-points-dot-d', 'accessPoints.d');
const SEED_ACCESS_POINT_NAME_LIST = ['companion-page-save', 'companion-source-upload', 'companion-source-list'];

const findProjectRoot = () => __dirname.replace(/^(.*\/system).*$/, '$1');

process.global = {};
process.global.xLog = require(path.join(SERVER_PATH, 'lib', 'x-log'));
process.global.xLog.logToStdOut();
process.global.projectRoot = findProjectRoot();

const seedCompanionPage = (err, { getConfig, commandLineParameters }) => {
	const { xLog } = process.global;
	process.global.getConfig = getConfig;
	process.global.commandLineParameters = commandLineParameters;

	const taskList = new taskListPlus();

	taskList.push((args, next) => {
		const seedFileName = commandLineParameters.qtGetSurePath('values.seedFileName[0]', '');
		if (!/^[A-Za-z0-9-]+\.seed\.json$/.test(seedFileName)) {
			next(`--seedFileName must name a *.seed.json file beside this script (got '${seedFileName}')`, args);
			return;
		}
		const seedManifest = JSON.parse(fs.readFileSync(path.join(__dirname, seedFileName), 'utf8'));
		next('', { ...args, seedManifest, sourceDirPath: path.join(process.global.projectRoot, seedManifest.sourceDirProjectRelativePath) });
	});

	taskList.push((args, next) => {
		const { databaseFileName, databaseContainerDirPath } = getConfig('data-model');
		if (!databaseFileName || !databaseContainerDirPath) {
			next('the [data-model] configuration lacks databaseFileName or databaseContainerDirPath', args);
			return;
		}
		const databaseFilePath = path.join(databaseContainerDirPath, databaseFileName);
		const { companionSourcesDirPathOf } = require('../companion-source-files');
		const passwordTools = require(path.join(SERVER_PATH, 'data-model', 'lib', 'password-hash'))();
		const dataMapping = require(path.join(SERVER_PATH, 'data-model', 'data-mapping', 'data-mapping'))(passwordTools);
		require(path.join(SERVER_PATH, 'data-model', 'lib', 'sqlite-instance'))({}).initDatabaseInstance(databaseFilePath, (dbError, sqlDb) => {
			const accessPointByName = {};
			const dotD = { logList: [], library: { add: (addedName, serviceFunction) => { accessPointByName[addedName] = serviceFunction; } } };
			const passThroughParameters = { sqlDb, dataMapping, companionSourcesDirPath: companionSourcesDirPathOf(databaseContainerDirPath) };
			SEED_ACCESS_POINT_NAME_LIST.forEach((accessPointName) => require(path.join(ACCESS_POINT_DIR_PATH, accessPointName))({ dotD, passThroughParameters }));
			xLog.status(`${moduleName}: database ${databaseFilePath}; sources to ${passThroughParameters.companionSourcesDirPath}`);
			next(dbError, { ...args, accessPointByName });
		});
	});

	taskList.push((args, next) => {
		const { accessPointByName, seedManifest } = args;
		accessPointByName['companion-source-list']({ pageSlug: seedManifest.pageRecord.pageSlug, listScope: 'history' }, (err, existingSourceList) => {
			if (err) {
				next(err, args);
				return;
			}
			next(existingSourceList.length ? `page ${seedManifest.pageRecord.pageSlug} already has ${existingSourceList.length} source row(s); this seed runs once per database` : '', args);
		});
	});

	taskList.push((args, next) => args.accessPointByName['companion-page-save']({ pageRecord: args.seedManifest.pageRecord }, mergeArgs(args, next, 'savedPage')));

	taskList.push((args, next) => {
		const { accessPointByName, seedManifest, sourceDirPath } = args;
		const uploadedRowList = [];
		const uploadNext = (remainingSourceList) => {
			if (!remainingSourceList.length) {
				next('', { ...args, uploadedRowList });
				return;
			}
			const oneSource = remainingSourceList[0];
			const uploadRequest = {
				pageSlug: seedManifest.pageRecord.pageSlug,
				sourceRole: oneSource.sourceRole,
				sourcePart: oneSource.sourcePart,
				fileName: path.basename(oneSource.relativeFilePath),
				fileBase64: fs.readFileSync(path.join(sourceDirPath, oneSource.relativeFilePath)).toString('base64'),
				originUrl: oneSource.originUrl,
				originNote: oneSource.originNote,
				documentDate: oneSource.documentDate,
				uploadedBy: seedManifest.uploadedBy,
			};
			accessPointByName['companion-source-upload'](uploadRequest, (err, uploadedRow) => {
				if (err) {
					next(`uploading ${oneSource.relativeFilePath}: ${err}`, args);
					return;
				}
				xLog.status(`uploaded ${uploadedRow.sourceRole}/${uploadedRow.sourcePart || '-'} ${uploadedRow.fileName} ${uploadedRow.byteSize} bytes sha256 ${uploadedRow.sha256}`);
				uploadedRowList.push(uploadedRow);
				uploadNext(remainingSourceList.slice(1));
			});
		};
		uploadNext(seedManifest.sourceList);
	});

	pipeRunner(taskList.getList(), {}, (pipeError, args) => {
		if (pipeError) {
			xLog.error(`${moduleName} REFUSED: ${pipeError}`);
			process.exit(1);
		}
		xLog.status(`${moduleName}: page ${args.savedPage.pageSlug} registered (refId ${args.savedPage.refId}); ${args.uploadedRowList.length} source(s) uploaded`);
		process.exit(0);
	});
};

require(path.join(SERVER_PATH, 'lib', 'assemble-configuration-show-help-maybe-exit'))({ configName: 'startApiServer', applicationControls: ['--seedFileName'] }, seedCompanionPage);
