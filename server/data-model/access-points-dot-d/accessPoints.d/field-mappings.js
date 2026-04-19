#!/usr/bin/env node
'use strict';
// @concept: [[AccessPointPattern]]
// @concept: [[FieldMappings]]

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;

	const { sqlDb, dataMapping } = passThroughParameters;
	const mapper = dataMapping['field-mappings'];

	const serviceFunction = (xQuery, callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			if (!mapper) {
				next('field-mappings mapper not loaded.', args);
				return;
			}
			next('', args);
		});

		taskList.push((args, next) => {
			sqlDb.checkTableExists('field_mappings', (err, exists) => {
				next('', { ...args, tableExists: !!exists });
			});
		});

		taskList.push((args, next) =>
			sqlDb.getTable('field_mappings', mergeArgs(args, next, 'tableRef')),
		);

		taskList.push((args, next) => {
			const { tableExists, tableRef } = args;
			if (!tableExists) {
				next('', { ...args, result: [] });
				return;
			}
			const query = mapper.getSql('all');
			tableRef.getData(query, { suppressStatementLog: true, noTableNameOk: true }, (err, rows) => {
				if (err) {
					next(`field_mappings query failed: ${err}`, args);
					return;
				}
				const mapped = mapper.map(rows || [], 'forward');
				const bySlug = mapped.reduce((acc, row) => {
					acc[row.slug] = row.data;
					return acc;
				}, {});
				next('', { ...args, result: [bySlug] });
			});
		});

		pipeRunner(taskList.getList(), { xQuery }, (err, args) => {
			if (err) {
				callback(err, []);
				return;
			}
			callback('', args.result || []);
		});
	};

	const addEndpoint = ({ name, serviceFunction, dotD }) => {
		dotD.logList.push(name);
		dotD.library.add(name, serviceFunction);
	};

	addEndpoint({ name: moduleName, serviceFunction, dotD });
	return {};
};

module.exports = moduleFunction;
