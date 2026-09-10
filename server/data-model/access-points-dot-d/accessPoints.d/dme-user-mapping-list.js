#!/usr/bin/env node
'use strict';
// @concept: [[UserMappingPersistence]]
// @concept: [[AccessPointPattern]]
//
// Lists every curated mapping (and transformation rule) belonging to one user.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const { getMappingTable } = require('../../lib/dme-user-mapping-table');

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

		taskList.push((args, next) => {
			if (!args.userRefId) {
				next('No user identity supplied', args);
				return;
			}
			next('', args);
		});

		taskList.push((args, next) =>
			getMappingTable(
				{ sqlDb: args.sqlDb, dataMapping: args.dataMapping },
				mergeArgs(args, next, 'mappingTable'),
			),
		);

		taskList.push((args, next) => {
			const { mappingTable, dataMapping, userRefId } = args;
			const query = dataMapping['dme-user-mapping'].getSql('byUser', { userRefId });
			mappingTable.getData(query, { suppressStatementLog: true }, (err, rows = []) =>
				next(err, { ...args, mappingList: rows || [] }),
			);
		});

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
			callback('', args.mappingList);
		});
	};

	// ================================================================================
	// Access Point Registration

	const addEndpoint = ({ name, serviceFunction, dotD }) => {
		dotD.logList.push(name);
		dotD.library.add(name, serviceFunction);
	};

	addEndpoint({ name: moduleName, serviceFunction, dotD });

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
