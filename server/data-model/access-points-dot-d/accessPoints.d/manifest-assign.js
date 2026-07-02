#!/usr/bin/env node
'use strict';
// @concept: [[ManifestEditor]]
// @concept: [[AccessPointPattern]]
// @concept: [[CollaborationAccess]]

/**
 * ACCESS POINT: MANIFEST ASSIGN (add a collaborator to a manifest)
 *
 * Adds one educore user to a manifest's collaborator set (local manifestUserAssignment
 * join). Idempotent: if the (manifestKey, userId) pair already exists it is a no-op.
 * The table auto-creates on first saveObject. This is mutable side-metadata -- it never
 * mints a new manifest.
 *
 * inputData: { manifestKey, userId }. returns: { assigned:true, manifestKey, userId }.
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
				next('manifest-assign requires manifestKey and userId', args);
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
		// STAGE 3: DEDUPE -- skip insert if the pair already exists

		taskList.push((args, next) => {
			const { assignmentTable, dataMapping, manifestKey, userId } = args;

			const query = dataMapping['manifest-user-assignment'].getSql(
				'byManifestAndUser',
				{ manifestKey, userId },
			);

			assignmentTable.getData(
				query,
				{ suppressStatementLog: true, noTableNameOk: true },
				(err, rows) => {
					if (err) {
						// Bare/uninitialized table (no manifestKey/userId columns yet):
						// nothing can already be assigned -- fall through to the insert,
						// whose saveObject creates the columns.
						if (/no such (column|table)/i.test(`${err}`)) {
							next('', { ...args, alreadyAssigned: false });
							return;
						}
						next(err, args);
						return;
					}
					next('', { ...args, alreadyAssigned: (rows || []).length > 0 });
				},
			);
		});

		// --------------------------------------------------------------------------------
		// STAGE 4: INSERT IF NEW

		taskList.push((args, next) => {
			if (args.alreadyAssigned) {
				next('', args);
				return;
			}

			const { assignmentTable, manifestKey, userId } = args;

			assignmentTable.saveObject(
				{ manifestKey, userId },
				{ suppressStatementLog: true, noTableNameOk: true },
				(err) => {
					if (err) {
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
				assigned: true,
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
