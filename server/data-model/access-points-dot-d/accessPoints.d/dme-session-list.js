#!/usr/bin/env node
'use strict';
// @concept: [[SessionPersistence]]
// @concept: [[AccessPointPattern]]

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
		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// GET DME_SESSIONS TABLE

		taskList.push((args, next) =>
			args.sqlDb.getTable('dme_sessions', mergeArgs(args, next, 'sessionsTable')),
		);

		// --------------------------------------------------------------------------------
		// QUERY SESSIONS FOR USER

		taskList.push((args, next) => {
			const { sessionsTable, dataMapping, userRefId } = args;

			const query = dataMapping['dme-session'].getSql('byUser', { userRefId });

			const localCallback = (err, resultList = []) => {
				if (err) {
					next(err, args);
					return;
				}
				next('', { ...args, sessionList: resultList });
			};

			sessionsTable.getData(query, { suppressStatementLog: true, noTableNameOk: true }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// INIT AND EXECUTE THE PIPELINE

		const initialData = {
			userRefId: inputData.userRefId,
			sqlDb,
			dataMapping,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, []);
				return;
			}
			const { sessionList } = args;
			callback('', sessionList);
		});
	};

	// ================================================================================
	// Access Point Registration

	const addEndpoint = ({ name, serviceFunction, dotD }) => {
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
