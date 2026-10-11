#!/usr/bin/env node
'use strict';
// @concept: [[ManifestEditor]]
// @concept: [[AccessPointPattern]]
// @concept: [[CollaborationAccess]]

/**
 * ACCESS POINT: MANIFEST ASSIGNMENTS (list collaborators for a manifest)
 *
 * Lists the educore users assigned to one manifest from the local manifestUserAssignment
 * join table. Read-only. inputData: { manifestKey }. returns: [{ refId, manifestKey, userId, createdAt }].
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
			const manifestKey = args.requestData.manifestKey;
			if (!manifestKey) {
				next('manifest-assignments requires a manifestKey', args);
				return;
			}
			next('', { ...args, manifestKey });
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
		// STAGE 3: QUERY BY MANIFEST (via mapper)

		taskList.push((args, next) => {
			const { assignmentTable, dataMapping, manifestKey } = args;

			const query = dataMapping['manifest-user-assignment'].getSql('byManifest', {
				manifestKey,
			});

			assignmentTable.getData(
				query,
				{ suppressStatementLog: true, noTableNameOk: true },
				(err, rows) => {
					if (err) {
						// An uninitialized join table (created bare by getTable but never
						// written to) has no manifestKey/userId columns yet -- treat that
						// as "no assignments" rather than an error.
						if (/no such (column|table)/i.test(`${err}`)) {
							next('', { ...args, rows: [] });
							return;
						}
						next(err, args);
						return;
					}
					next('', { ...args, rows: rows || [] });
				},
			);
		});

		// --------------------------------------------------------------------------------
		// EXECUTE PIPELINE

		const initialData = { requestData, sqlDb, dataMapping };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, []);
				return;
			}
			callback('', args.rows);
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
