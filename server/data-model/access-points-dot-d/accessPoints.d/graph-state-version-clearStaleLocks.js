#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[GraphStateStore]]
// @concept: [[SessionLifecycle]]
// @concept: [[AccessPointPattern]]
//
// graph-state-version-clearStaleLocks — the REAPER's data side (doc 06/07). Clears
// the transient live block for every row whose lease has expired
// (now - lastHeartbeatAt > leaseTTL), across ALL users — orphan GC is a system
// maintenance op, not user-scoped. Durable columns (stateScript ...) are untouched,
// so nothing authored-and-saved is lost. Container/clone teardown is the seam's job
// (03/07); this only releases the SQL lease so the version can be reopened.
//
// Input: { cutoff } (ISO string) OR { leaseTtlSeconds } (default 900). The container
// orchestration (Phase 8) sets the concrete interval.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const DEFAULT_LEASE_TTL_SECONDS = 900;

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig } = process.global;
	const { sqlDb, dataMapping } = passThroughParameters;

	const serviceFunction = (inputData, callback) => {
		const taskList = new taskListPlus();

		// GET TABLE
		taskList.push((args, next) =>
			args.sqlDb.getTable(
				'graph_state_versions',
				mergeArgs(args, next, 'versionsTable'),
			),
		);

		// CLEAR EXPIRED LEASES (multi-row UPDATE via runStatement)
		taskList.push((args, next) => {
			const { versionsTable, dataMapping } = args;

			const leaseTtlSeconds =
				typeof args.leaseTtlSeconds === 'number'
					? args.leaseTtlSeconds
					: DEFAULT_LEASE_TTL_SECONDS;

			const cutoff =
				args.cutoff ||
				new Date(Date.now() - leaseTtlSeconds * 1000).toISOString();

			const statement = dataMapping['graph-state-version'].getSql('clearStaleLocks', {
				cutoff,
			});

			versionsTable.runStatement(
				statement,
				{ suppressStatementLog: true },
				(err) => {
					if (err) {
						next(err, args);
						return;
					}
					next('', { ...args, cutoff });
				},
			);
		});

		const initialData = {
			cutoff: inputData.cutoff,
			leaseTtlSeconds: inputData.leaseTtlSeconds,
			sqlDb,
			dataMapping,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}
			callback('', { cleared: true, cutoff: args.cutoff });
		});
	};

	const addEndpoint = ({ name, serviceFunction, dotD }) => {
		dotD.logList.push(name);
		dotD.library.add(name, serviceFunction);
	};

	addEndpoint({ name: moduleName, serviceFunction, dotD });
	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
