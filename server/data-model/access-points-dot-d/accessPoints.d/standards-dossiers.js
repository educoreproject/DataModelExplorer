#!/usr/bin/env node
'use strict';
// @concept: [[AccessPointPattern]]
// @concept: [[StandardDossier]]

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;

	const { sqlDb, dataMapping } = passThroughParameters;
	const mapper = dataMapping['standard-dossier'];

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (xQuery, callback) => {
		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// Validate dependencies

		taskList.push((args, next) => {
			if (!mapper) {
				next('standard-dossier mapper not loaded.', args);
				return;
			}
			next('', args);
		});

		// --------------------------------------------------------------------------------
		// Check table exists — empty array response is fine if it doesn't

		taskList.push((args, next) => {
			sqlDb.checkTableExists('standard_dossier', (err, exists) => {
				next('', { ...args, tableExists: !!exists });
			});
		});

		// --------------------------------------------------------------------------------
		// Acquire table handle (creates if missing)

		taskList.push((args, next) =>
			sqlDb.getTable('standard_dossier', mergeArgs(args, next, 'tableRef')),
		);

		// --------------------------------------------------------------------------------
		// Query and transform

		taskList.push((args, next) => {
			const { tableExists, tableRef } = args;
			if (!tableExists) {
				next('', { ...args, result: [] });
				return;
			}

			const { standardId } = xQuery || {};
			const query = standardId
				? mapper.getSql('byStandardId', { standardId })
				: mapper.getSql('all');

			tableRef.getData(query, { suppressStatementLog: true, noTableNameOk: true }, (err, rows) => {
				if (err) {
					next(`standard_dossier query failed: ${err}`, args);
					return;
				}
				next('', { ...args, result: mapper.map(rows || [], 'forward') });
			});
		});

		// --------------------------------------------------------------------------------
		// Execute

		pipeRunner(taskList.getList(), { xQuery }, (err, args) => {
			if (err) {
				callback(err, []);
				return;
			}
			callback('', args.result || []);
		});
	};

	// ================================================================================
	// REGISTRATION

	const addEndpoint = ({ name, serviceFunction, dotD }) => {
		dotD.logList.push(name);
		dotD.library.add(name, serviceFunction);
	};

	addEndpoint({ name: moduleName, serviceFunction, dotD });
	return {};
};

module.exports = moduleFunction;
