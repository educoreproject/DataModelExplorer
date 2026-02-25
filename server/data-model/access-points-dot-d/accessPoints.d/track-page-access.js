#!/usr/bin/env node
'use strict';

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	// ================================================================================
	// INITIALIZATION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(moduleName);

	const { sqlDb, hxAccess, dataMapping } = passThroughParameters;

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (inputData, callback) => {
		if (typeof args == 'function') {
			callback = args;
			args = {};
		}

		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// GET PAGES TABLE

		taskList.push((args, next) =>
			args.sqlDb.getTable('pages', mergeArgs(args, next, 'pagesTable')),
		);

		// --------------------------------------------------------------------------------
		// GET ACCESSES TABLE

		taskList.push((args, next) =>
			args.sqlDb.getTable('accesses', mergeArgs(args, next, 'accessesTable')),
		);

		// --------------------------------------------------------------------------------
		// LOOK UP PAGE BY PATH

		taskList.push((args, next) => {
			const { pagesTable, dataMapping, pagePath } = args;

			const localCallback = (err, pageList = []) => {
				if (err) {
					// Column may not exist yet on first run — treat as no page found
					next('', { ...args, pageRefId: null });
					return;
				}
				const pageRecord = pageList.qtLast();
				const pageRefId = pageRecord ? pageRecord.refId : null;
				next('', { ...args, pageRefId });
			};

			const query = dataMapping['page-access'].getSql('byPath', { path: pagePath });
			pagesTable.getData(query, { suppressStatementLog: true, noTableNameOk: true }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// CREATE PAGE IF NOT FOUND

		taskList.push((args, next) => {
			const { pagesTable, pagePath, pageRefId } = args;

			if (pageRefId) {
				next('', args);
				return;
			}

			const localCallback = (err, refId) => {
				if (err) {
					next(err, args);
					return;
				}
				next('', { ...args, pageRefId: refId });
			};

			pagesTable.saveObject({ path: pagePath }, { suppressStatementLog: true }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// RECORD THE ACCESS

		taskList.push((args, next) => {
			const { accessesTable, pageRefId, userRefId } = args;

			const localCallback = (err, refId) => {
				if (err) {
					next(err, args);
					return;
				}
				next('', { ...args, accessRefId: refId });
			};

			accessesTable.saveObject({
				pageRefId,
				userRefId,
				accessedAt: new Date().toISOString(),
			}, { suppressStatementLog: true }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// INIT AND EXECUTE THE PIPELINE

		const initialData = { pagePath: inputData.pagePath, userRefId: inputData.userRefId, sqlDb, dataMapping };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}
			const { pageRefId } = args;
			callback('', { tracked: true, pageRefId });
		});
	};

	// ================================================================================
	// Access Point Registration

	const addEndpoint = ({ name, method, serviceFunction, dotD }) => {
		dotD.logList.push(name);
		dotD.library.add(name, serviceFunction);
	};

	// ================================================================================
	// Do the constructing

	const name = moduleName;

	addEndpoint({ name, serviceFunction, dotD });

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
