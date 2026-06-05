#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[GraphStateStore]]
// @concept: [[AccessPointPattern]]
//
// graph-state-version-getById — resolve a version row by versionRefId ALONE (no userRefId
// scoping) and return its owner userRefId. Used ONLY by the executor endpoints on the
// internal-auth path (secret + localhost): the dmeUser tools hold a versionRefId but no
// userRefId, so the server derives the owner from the row rather than trusting any
// client-supplied identity. The secret gate + the unguessable, owner-only versionRefId
// establish ownership; this never runs on a JWT request (those carry userRefId already).

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');

const VERSIONS_TABLE = 'graph_state_versions';

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { sqlDb, dataMapping } = passThroughParameters;

	const serviceFunction = (inputData, callback) => {
		const { versionRefId } = inputData || {};
		if (!versionRefId) {
			callback('graph-state-version-getById: versionRefId is required');
			return;
		}

		sqlDb.getTable(VERSIONS_TABLE, (err, tableRef) => {
			if (err || !tableRef) { callback(err || 'no versions table'); return; }

			const query = dataMapping['graph-state-version'].getSql('getById', {
				refId: versionRefId,
			});

			tableRef.getData(
				query,
				{ suppressStatementLog: true, noTableNameOk: true },
				(getErr, rows = []) => {
					if (getErr) { callback(getErr); return; }
					const row = rows.qtLast() || null;
					if (!row) { callback('', { found: false }); return; }
					callback('', {
						found: true,
						userRefId: row.userRefId,
						versionName: row.versionName || '',
					});
				},
			);
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
