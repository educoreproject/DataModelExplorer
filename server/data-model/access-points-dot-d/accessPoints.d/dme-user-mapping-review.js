#!/usr/bin/env node
'use strict';
// @concept: [[UserMappingPersistence]]
// @concept: [[AccessPointPattern]]
//
// Sets the review status of one proposed mapping: proposed | accepted |
// rejected, stamped with the reviewer and time and an optional note. The
// endpoint restricts this to admin/super roles; the access point trusts the
// reviewerRefId it is handed.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const { getMappingTable, getUserDirectory, decorateRows } = require('../../lib/dme-user-mapping-table');

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
			const { reviewerRefId, refId, status } = args;
			const statuses = args.dataMapping['dme-user-mapping'].REVIEW_STATUSES;
			if (!reviewerRefId) {
				next('No reviewer identity supplied', args);
				return;
			}
			if (!refId) {
				next('refId is required', args);
				return;
			}
			if (!statuses.includes(status)) {
				next(`Unknown status '${status}' (expected ${statuses.join(' | ')})`, args);
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
			const { mappingTable, dataMapping, refId } = args;
			mappingTable.getData(
				dataMapping['dme-user-mapping'].getSql('byRefId', { refId }),
				{ suppressStatementLog: true },
				(err, rows = []) => {
					if (err) {
						next(err, args);
						return;
					}
					if (!(rows || []).length) {
						next(`Mapping not found: ${refId}`, args);
						return;
					}
					next('', args);
				},
			);
		});

		taskList.push((args, next) => {
			const { mappingTable, dataMapping, refId, status, reviewerRefId, note } = args;
			const sql = dataMapping['dme-user-mapping'].getSql('setStatus', {
				refId,
				status,
				reviewedBy: reviewerRefId,
				reviewedAt: new Date().toISOString(),
				reviewNote: note || '',
			});
			mappingTable.runStatement(sql, { suppressStatementLog: true }, (err) => next(err, args));
		});

		taskList.push((args, next) => {
			const { mappingTable, dataMapping, refId } = args;
			mappingTable.getData(
				dataMapping['dme-user-mapping'].getSql('byRefId', { refId }),
				{ suppressStatementLog: true },
				(err, rows = []) => next(err, { ...args, updated: (rows || []).qtLast() }),
			);
		});

		taskList.push((args, next) =>
			getUserDirectory({ sqlDb: args.sqlDb, dataMapping: args.dataMapping }, (err, directory) =>
				next('', { ...args, directory: err ? {} : directory }),
			),
		);

		const initialData = {
			reviewerRefId: inputData.reviewerRefId,
			refId: inputData.refId ? String(inputData.refId) : '',
			status: String(inputData.status || ''),
			note: inputData.note ? String(inputData.note) : '',
			sqlDb,
			dataMapping,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}
			callback('', decorateRows([args.updated], args.directory, args.reviewerRefId)[0]);
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
