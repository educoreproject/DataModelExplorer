#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[GraphStateStore]]
// @concept: [[MapperPattern]]
//
// graph-state-version.js — mapper for the per-user graph-state VERSION store
// (design doc 06). One row per version: created by New, updated in place by Save
// across any number of sessions, until the next New. A NEW, parallel table to the
// untouched dme_sessions. All client-scoped queries filter on userRefId.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const qt = require('qtools-functional-library');

//START OF moduleFunction() ============================================================

const moduleFunction =
	({ moduleName }) =>
	({ baseMappingProcess, safeSql }) => {
		process.global = process.global ? process.global : {};
		const xLog = process.global.xLog;

		// ================================================================================
		// FIELD MAPPING CONFIGURATION
		//
		// Durable identity columns + the transient "live session" block (nullable,
		// set on open, cleared on teardown — doc 06). All map identity (DB name ===
		// app name) so one grep follows a value across the boundary.

		const inputNameMapping = {
			['refId']: 'refId',
			['userRefId']: 'userRefId',
			['versionName']: 'versionName',
			['stateScript']: 'stateScript',
			['embeddingModelVersion']: 'embeddingModelVersion',
			['goldenVersionAuthoredAgainst']: 'goldenVersionAuthoredAgainst',
			['userNodeCount']: 'userNodeCount',
			['createdAt']: 'createdAt',
			['updatedAt']: 'updatedAt',
			// --- transient live block ---
			['liveBoltUri']: 'liveBoltUri',
			['liveBoltPassword']: 'liveBoltPassword',
			['liveContainerName']: 'liveContainerName',
			['livePort']: 'livePort',
			['lockToken']: 'lockToken',
			['openedAt']: 'openedAt',
			['lastHeartbeatAt']: 'lastHeartbeatAt',
			// authoritative "unsaved live writes" flag (doc 12): 0/1, set on open/save/close
			// to 0 and on a successful write to 1.
			['liveDirty']: 'liveDirty',
		};

		// ================================================================================
		// TRANSFORMATION

		const basicMapper = baseMappingProcess(inputNameMapping);

		const recordMapper = (inObj, direction = 'forward') => {
			const outObj = basicMapper(inObj, { direction });
			delete outObj.XXX;
			return outObj;
		};

		const mapper = (inData, direction = 'forward') => {
			if (Array.isArray(inData)) {
				return inData.map((inObj) => recordMapper(inObj, direction));
			}
			return recordMapper(inData, direction);
		};

		// ================================================================================
		// NAMED SQL QUERY GENERATION
		//
		// Writes (insert New, Save, setLive, clearLive, stampHeartbeat) go through the
		// sqlite abstraction's saveObject in the access points (the idiomatic path here),
		// so only SELECTs and the multi-row reaper UPDATE live as named queries.
		//
		// SECRET RULE (doc 06): the CLIENT-FACING list returns only refId, versionName,
		// updatedAt, userNodeCount — never stateScript, never any liveBolt* field.
		// getByIdForUser is SERVER-INTERNAL (ownership checks + loadScript for replay)
		// and may return the full row; it is never sent to a client verbatim.

		const getSql = (queryName, replaceObject = {}) => {
			const queries = {
				// Client-facing selector list — safe columns only, scoped to the user.
				'listByUser': `SELECT refId, versionName, updatedAt, userNodeCount FROM <!tableName!> WHERE userRefId = <!userRefId!> ORDER BY updatedAt DESC`,

				// Server-internal full row, always scoped to userRefId (a user can never
				// name another user's refId and get a row).
				'getByIdForUser': `SELECT * FROM <!tableName!> WHERE refId = <!refId!> AND userRefId = <!userRefId!>`,

				// Server-internal full row by versionRefId ALONE (no userRefId scoping).
				// Reachable ONLY on the internal-auth executor path (secret + localhost):
				// the trusted server caller already holds a versionRefId that was handed to
				// the authenticated owner at open, so ownership is established by the secret
				// gate + the unguessable id, and userRefId is derived from the row itself.
				'getById': `SELECT * FROM <!tableName!> WHERE refId = <!refId!>`,

				// Reaper discovery: rows whose lease has expired AND still hold a live
				// container — these need real teardown (container + clone dir) before the
				// lock is cleared.
				'findStaleLive': `SELECT refId, userRefId, liveContainerName FROM <!tableName!> WHERE liveContainerName != '' AND lastHeartbeatAt != '' AND lastHeartbeatAt < <!cutoff!>`,

				// Reaper: clear the transient live block for every row whose lease has
				// expired (lastHeartbeatAt older than the cutoff). Durable columns
				// (stateScript etc.) are untouched. Empty string === "not live"
				// (saveObject drops nulls, so the store uses '' as the cleared marker).
				'clearStaleLocks': `UPDATE <!tableName!> SET liveBoltUri='', liveBoltPassword='', liveContainerName='', livePort='', lockToken='', openedAt='', lastHeartbeatAt='', liveDirty='0' WHERE lastHeartbeatAt != '' AND lastHeartbeatAt < <!cutoff!>`,
			};

			if (!queries[queryName]) {
				xLog.error(`Unknown query name '${queryName}' in ${moduleName}`);
				return undefined;
			}

			return safeSql(queries[queryName], replaceObject);
		};

		// ================================================================================
		// MAPPER API EXPORT

		return {
			map: mapper,
			getSql,
		};
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction(moduleName);
