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
		// QUERY SESSION BY REFID

		taskList.push((args, next) => {
			const { sessionsTable, dataMapping, refId } = args;

			const query = dataMapping['dme-session'].getSql('byRefId', { refId });

			const localCallback = (err, resultList = []) => {
				if (err) {
					next(err, args);
					return;
				}

				const session = resultList.qtLast();

				if (!session) {
					next(`Session not found: ${refId}`, args);
					return;
				}

				next('', { ...args, session });
			};

			sessionsTable.getData(query, { suppressStatementLog: true, noTableNameOk: true }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// VERIFY OWNERSHIP AND PARSE SESSION DATA

		taskList.push((args, next) => {
			const { session, userRefId } = args;

			if (session.userRefId !== userRefId) {
				next('Permission denied: not session owner', args);
				return;
			}

			let sessionData;
			if (typeof session.sessionData === 'string') {
				sessionData = JSON.parse(session.sessionData);
			} else {
				sessionData = session.sessionData;
			}

			const result = {
				refId: session.refId,
				sessionName: session.sessionName,
				sessionData,
				createdAt: session.createdAt,
				updatedAt: session.updatedAt,
			};

			next('', { ...args, result });
		});

		// --------------------------------------------------------------------------------
		// INIT AND EXECUTE THE PIPELINE

		const initialData = {
			refId: inputData.refId,
			userRefId: inputData.userRefId,
			sqlDb,
			dataMapping,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}
			const { result } = args;
			callback('', result);
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
