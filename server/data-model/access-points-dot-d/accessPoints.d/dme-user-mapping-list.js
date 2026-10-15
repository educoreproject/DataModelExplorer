#!/usr/bin/env node
'use strict';
// @concept: [[UserMappingPersistence]]
// @concept: [[AccessPointPattern]]
//
// Lists curated mappings (with transformation rules and review status).
//   scope: 'mine' (default) — the caller's own rows
//          'all'            — every user's rows; proposals are shared knowledge
//   status: optional filter (proposed | accepted | rejected)
// Every row is labelled with who proposed it and whether it belongs to the
// caller, so the browser can show one shared table with owner-only controls.

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
			if (!args.userRefId) {
				next('No user identity supplied', args);
				return;
			}
			const statuses = args.dataMapping['dme-user-mapping'].REVIEW_STATUSES;
			if (args.status && !statuses.includes(args.status)) {
				next(`Unknown status '${args.status}' (expected ${statuses.join(' | ')})`, args);
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
			const { mappingTable, dataMapping, userRefId, scope, status } = args;
			const mapper = dataMapping['dme-user-mapping'];
			let query;
			if (scope === 'all') {
				query = status ? mapper.getSql('allByStatus', { status }) : mapper.getSql('all');
			} else {
				query = mapper.getSql('byUser', { userRefId });
			}
			mappingTable.getData(query, { suppressStatementLog: true }, (err, rows = []) => {
				let list = rows || [];
				if (scope !== 'all' && status) list = list.filter((r) => (r.status || 'proposed') === status);
				next(err, { ...args, mappingList: list });
			});
		});

		taskList.push((args, next) =>
			getUserDirectory({ sqlDb: args.sqlDb, dataMapping: args.dataMapping }, (err, directory) =>
				next('', { ...args, directory: err ? {} : directory }),
			),
		);

		const initialData = {
			userRefId: inputData.userRefId,
			scope: inputData.scope === 'all' ? 'all' : 'mine',
			status: inputData.status || '',
			sqlDb,
			dataMapping,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, []);
				return;
			}
			callback('', decorateRows(args.mappingList, args.directory, args.userRefId));
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
