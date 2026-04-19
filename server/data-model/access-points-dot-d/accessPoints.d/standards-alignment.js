#!/usr/bin/env node
'use strict';
// @concept: [[AccessPointPattern]]
// @concept: [[StandardCedsAlignment]]

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;

	const { sqlDb, dataMapping } = passThroughParameters;
	const mapper = dataMapping['standards-alignment'];

	const serviceFunction = (xQuery, callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			if (!mapper) {
				next('standards-alignment mapper not loaded.', args);
				return;
			}
			next('', args);
		});

		taskList.push((args, next) => {
			sqlDb.checkTableExists('standard_ceds_alignment', (err, exists) => {
				next('', { ...args, tableExists: !!exists });
			});
		});

		taskList.push((args, next) =>
			sqlDb.getTable('standard_ceds_alignment', mergeArgs(args, next, 'tableRef')),
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
					next(`standard_ceds_alignment query failed: ${err}`, args);
					return;
				}
				const mapped = mapper.map(rows || [], 'forward');

				// Compose response: array with a single object carrying the
				// two logical slices the client wants. Keeps the HTTP-array
				// convention without forcing the caller to reconstruct them.
				const domainsRow = mapped.find((r) => r.slug === '__domains');
				const entries = mapped
					.filter((r) => r.slug !== '__domains')
					.map((r) => r.data);
				const domains = domainsRow ? domainsRow.data : [];

				next('', { ...args, result: [{ cedsDomains: domains, alignmentMatrix: entries }] });
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
