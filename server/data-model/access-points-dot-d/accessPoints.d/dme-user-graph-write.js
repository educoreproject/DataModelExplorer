#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[AuthoringWrites]]
// @concept: [[AccessPointPattern]]
//
// dme-user-graph-write — the write-enabled user leg (doc 02/09). Executes a structured
// write action against the version's LIVE isolated clone, enforcing the ownership
// invariant + additive-only guardrail server-side (write-executor). This is the
// low-level executor an askMilo write tool would call; the conversational layer is a
// deferred, out-of-scope qbookSuperTool change (parent ruling, Phase 6).

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig } = process.global;
	const { sqlDb, dataMapping } = passThroughParameters;

	const path = require('path');
	const configFileProcessor = require('qtools-config-file-processor');
	const { readVersionRow, setLiveDirty } = require('../../lib/user-graph/user-graph');
	const { executeWrite } = require('../../lib/user-graph/write-executor');
	const neo4jInstanceGen = require('../../lib/neo4j-instance/neo4j-instance')({ unused: true });

	// The server's assembled config resolves neo4j* (global substitutions) but not the
	// DME-local voyageApiKey; read it straight from the ini, where its own
	// [_substitutions] resolve correctly. getConfig is preferred when it has the value.
	const resolveVoyageApiKey = () => {
		const fromCfg = (getConfig('dataModelExplorerSearch') || {}).voyageApiKey;
		if (fromCfg && fromCfg.indexOf('<!') === -1) {
			return fromCfg;
		}
		const srcFile = process.global.configurationSourceFilePath;
		if (!srcFile) return undefined;
		try {
			const dir = path.dirname(srcFile) + '/';
			const c = configFileProcessor.getConfig('dataModelExplorerSearch.ini', dir, { resolve: true });
			return (c.dataModelExplorerSearch || {}).voyageApiKey;
		} catch (e) {
			return undefined;
		}
	};

	const serviceFunction = (inputData, callback) => {
		const taskList = new taskListPlus();

		// STAGE 1: resolve the LIVE clone connection from SQL (scoped to userRefId)
		taskList.push((args, next) => {
			const { userRefId, versionRefId } = args;
			if (!userRefId || !versionRefId) {
				next('dme-user-graph-write: an open versionRefId is required', args);
				return;
			}
			readVersionRow({ sqlDb, dataMapping, userRefId, versionRefId }, (err, row) => {
				if (err) { next(err, args); return; }
				if (!row) { next('Version not found or not owned by this user', args); return; }
				if (!row.liveBoltUri) { next('Version is not open — open it before writing', args); return; }
				next('', { ...args, versionRow: row });
			});
		});

		// STAGE 2: open a per-request connection to the live clone
		taskList.push((args, next) => {
			const { versionRow } = args;
			neo4jInstanceGen.initDatabaseInstance(
				{ neo4jBoltUri: versionRow.liveBoltUri, neo4jUser: 'neo4j', neo4jPassword: versionRow.liveBoltPassword },
				(err, userGraphDb) => {
					if (err) { next(`user graph connection failed: ${err}`, args); return; }
					next('', { ...args, userGraphDb });
				},
			);
		});

		// STAGE 3: execute the structured write (server-enforced invariants)
		taskList.push((args, next) => {
			const { userGraphDb, action, params } = args;
			const voyageApiKey = resolveVoyageApiKey();
			executeWrite({ userGraphDb, voyageApiKey, action, params }, (err, result) => {
				if (err) { next(err, args); return; }
				next('', { ...args, writeResult: result });
			});
		});

		// STAGE 4: a successful write means the live clone now diverges from the durable
		// stateScript — mark the version dirty (doc 12). The status endpoint reads this
		// authoritative flag; the client mirrors it for the unsaved-changes guards.
		taskList.push((args, next) => {
			const { sqlDb, versionRefId } = args;
			setLiveDirty({ sqlDb, versionRefId, dirty: 1 }, (err) => {
				if (err) { next(err, args); return; }
				next('', args);
			});
		});

		const initialData = {
			userRefId: inputData.userRefId,
			versionRefId: inputData.versionRefId,
			action: inputData.action,
			params: inputData.params,
			sqlDb,
			dataMapping,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (args.userGraphDb && typeof args.userGraphDb.close === 'function') {
				args.userGraphDb.close();
			}
			if (err) { callback(err, {}); return; }
			callback('', args.writeResult || {});
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
