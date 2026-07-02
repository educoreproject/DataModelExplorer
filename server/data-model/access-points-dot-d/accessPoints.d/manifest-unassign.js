#!/usr/bin/env node
'use strict';
// @concept: [[ManifestEditor]]
// @concept: [[AccessPointPattern]]
// @concept: [[CollaborationAccess]]

/**
 * ACCESS POINT: MANIFEST UNASSIGN (remove a collaborator from a manifest)
 *
 * Removes one educore user from a manifest's collaborator set via a DELETE on the local
 * manifestUserAssignment join (runStatement + mapper getSql, per the dme-session-delete
 * idiom). Mutable side-metadata -- never mints a new manifest.
 *
 * inputData: { manifestKey, userId }. returns: { unassigned:true, manifestKey, userId }.
 */

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	// ================================================================================
	// INITIALIZATION AND DEPENDENCY INJECTION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(moduleName);

	const { sqlDb, hxAccess, dataMapping } = passThroughParameters;

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (requestData, callback) => {
		if (typeof requestData == 'function') {
			callback = requestData;
			requestData = {};
		}

		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// STAGE 1: VALIDATE INPUT

		taskList.push((args, next) => {
			const { manifestKey, userId } = args.requestData;
			if (!manifestKey || !userId) {
				next('manifest-unassign requires manifestKey and userId', args);
				return;
			}
			next('', { ...args, manifestKey, userId });
		});

		// --------------------------------------------------------------------------------
		// STAGE 2: GET TABLE

		taskList.push((args, next) =>
			args.sqlDb.getTable(
				'manifestUserAssignment',
				mergeArgs(args, next, 'assignmentTable'),
			),
		);

		// --------------------------------------------------------------------------------
		// STAGE 3: DELETE THE (manifest, user) ROW (via mapper + runStatement)

		taskList.push((args, next) => {
			const { assignmentTable, dataMapping, manifestKey, userId } = args;

			const query = dataMapping['manifest-user-assignment'].getSql(
				'deleteByManifestAndUser',
				{ manifestKey, userId },
			);

			assignmentTable.runStatement(
				query,
				{ suppressStatementLog: true, noTableNameOk: true },
				(err) => {
					if (err) {
						// Nothing to delete from a bare/uninitialized table -- no-op.
						if (/no such (column|table)/i.test(`${err}`)) {
							next('', args);
							return;
						}
						next(err, args);
						return;
					}
					next('', args);
				},
			);
		});

		// --------------------------------------------------------------------------------
		// EXECUTE PIPELINE

		const initialData = { requestData, sqlDb, dataMapping };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}
			callback('', {
				unassigned: true,
				manifestKey: args.manifestKey,
				userId: args.userId,
			});
		});
	};

	// ================================================================================
	// ACCESS POINT REGISTRATION

	const addEndpoint = ({ name, serviceFunction, dotD }) => {
		dotD.logList.push(name);
		dotD.library.add(name, serviceFunction);
	};

	const name = moduleName;
	addEndpoint({ name, serviceFunction, dotD });

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
