#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[GraphStateStore]]
// @concept: [[AccessPointPattern]]
//
// graph-state-version-save — UPDATE an existing version's durable state in place
// (doc 06): stateScript (the re-emit output, 04), userNodeCount, embeddingModelVersion,
// goldenVersionAuthoredAgainst. Last-write-wins; no per-save history row. Ownership is
// verified first (scoped getByIdForUser) so a user can only save their own version.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig } = process.global;
	const { sqlDb, dataMapping } = passThroughParameters;
	const { encodeStateScript } = require('../../lib/user-graph/re-emit');

	const serviceFunction = (inputData, callback) => {
		const taskList = new taskListPlus();

		// GET TABLE
		taskList.push((args, next) =>
			args.sqlDb.getTable(
				'graph_state_versions',
				mergeArgs(args, next, 'versionsTable'),
			),
		);

		// OWNERSHIP CHECK (scoped getByIdForUser)
		taskList.push((args, next) => {
			const { versionsTable, dataMapping, refId, userRefId } = args;

			if (!refId || !userRefId) {
				next('graph-state-version-save: refId and userRefId are required', args);
				return;
			}

			const query = dataMapping['graph-state-version'].getSql('getByIdForUser', {
				refId,
				userRefId,
			});

			versionsTable.getData(
				query,
				{ suppressStatementLog: true, noTableNameOk: true },
				(err, resultList = []) => {
					if (err) {
						next(err, args);
						return;
					}
					if (!resultList.qtLast()) {
						next('Version not found or not owned by this user', args);
						return;
					}
					next('', args);
				},
			);
		});

		// UPDATE THE DURABLE FIELDS IN PLACE
		taskList.push((args, next) => {
			const {
				versionsTable,
				refId,
				stateScript,
				userNodeCount,
				embeddingModelVersion,
				goldenVersionAuthoredAgainst,
			} = args;

			const saveObj = {
				refId,
				stateScript: encodeStateScript(stateScript || ''),
				userNodeCount: typeof userNodeCount === 'number' ? userNodeCount : 0,
				embeddingModelVersion: embeddingModelVersion || '',
				goldenVersionAuthoredAgainst: goldenVersionAuthoredAgainst || '',
			};

			versionsTable.saveObject(saveObj, { suppressStatementLog: true }, (err) => {
				if (err) {
					next(err, args);
					return;
				}
				next('', args);
			});
		});

		const initialData = {
			refId: inputData.refId,
			userRefId: inputData.userRefId,
			stateScript: inputData.stateScript,
			userNodeCount: inputData.userNodeCount,
			embeddingModelVersion: inputData.embeddingModelVersion,
			goldenVersionAuthoredAgainst: inputData.goldenVersionAuthoredAgainst,
			sqlDb,
			dataMapping,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}
			callback('', { refId: args.refId, saved: true });
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
