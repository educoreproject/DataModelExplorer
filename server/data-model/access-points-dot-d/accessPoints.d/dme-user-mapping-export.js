#!/usr/bin/env node
'use strict';
// @concept: [[UserMappingPersistence]]
// @concept: [[AccessPointPattern]]
//
// Exports every user's mappings for ingestion into the graph.
//   format: json | csv | cypher      (default json)
//   status: accepted | proposed | rejected | all   (default accepted)
// Returns { filename, mimeType, content, count }. The endpoint restricts this to
// admin/super roles.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const { getMappingTable, getUserDirectory, decorateRows } = require('../../lib/dme-user-mapping-table');
const { renderExport, FORMATS } = require('../../lib/dme-user-mapping-export');

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
			const statuses = [...args.dataMapping['dme-user-mapping'].REVIEW_STATUSES, 'all'];
			if (!FORMATS[args.format]) {
				next(`Unknown format '${args.format}' (expected ${Object.keys(FORMATS).join(' | ')})`, args);
				return;
			}
			if (!statuses.includes(args.status)) {
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
			const { mappingTable, dataMapping, status } = args;
			const mapper = dataMapping['dme-user-mapping'];
			const query = status === 'all' ? mapper.getSql('all') : mapper.getSql('allByStatus', { status });
			mappingTable.getData(query, { suppressStatementLog: true }, (err, rows = []) =>
				next(err, { ...args, rows: rows || [] }),
			);
		});

		taskList.push((args, next) =>
			getUserDirectory({ sqlDb: args.sqlDb, dataMapping: args.dataMapping }, (err, directory) =>
				next('', { ...args, directory: err ? {} : directory }),
			),
		);

		const initialData = {
			format: String(inputData.format || 'json').toLowerCase(),
			status: String(inputData.status || 'accepted').toLowerCase(),
			sqlDb,
			dataMapping,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}
			const decorated = decorateRows(args.rows, args.directory, '');
			const rendered = renderExport(decorated, { format: args.format, statusFilter: args.status });
			callback('', { ...rendered, count: decorated.length });
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
