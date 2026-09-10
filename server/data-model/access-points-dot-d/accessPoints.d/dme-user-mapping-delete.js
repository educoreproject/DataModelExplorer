#!/usr/bin/env node
'use strict';
// @concept: [[UserMappingPersistence]]
// @concept: [[AccessPointPattern]]
//
// Deletes one of a user's curated mappings, addressed either by refId or by
// identity (mappingKey + targetStandard + targetName). The userRefId is part of
// every WHERE clause, so a user can only ever remove their own rows.

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
			const { userRefId, refId, mappingKey, targetStandard, targetName } = args;
			if (!userRefId) {
				next('No user identity supplied', args);
				return;
			}
			if (!refId && !(mappingKey && targetStandard && targetName)) {
				next('Supply refId, or mappingKey + targetStandard + targetName', args);
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
			const { mappingTable, dataMapping, userRefId, refId, mappingKey, targetStandard, targetName } =
				args;
			const mapper = dataMapping['dme-user-mapping'];
			const sql = refId
				? mapper.getSql('deleteByRefId', { refId: String(refId), userRefId })
				: mapper.getSql('deleteByIdentity', {
						userRefId,
						mappingKey: String(mappingKey),
						targetStandard: String(targetStandard),
						targetName: String(targetName),
					});
			mappingTable.runStatement(sql, { suppressStatementLog: true }, (err) => next(err, args));
		});

		const initialData = {
			userRefId: inputData.userRefId,
			refId: inputData.refId,
			mappingKey: inputData.mappingKey,
			targetStandard: inputData.targetStandard,
			targetName: inputData.targetName,
			sqlDb,
			dataMapping,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}
			callback('', { deleted: true, refId: args.refId || null });
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
