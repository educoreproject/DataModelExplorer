#!/usr/bin/env node
'use strict';
// @concept: [[AccessPointPattern]]
// @concept: [[OidcIdentityProvider]]
// @concept: [[SecurityFirstPattern]]

// ============================================================================
// oauth-admin.js (access point) — the Phase-4 admin & audit business logic
// (dmeMcpOAuth 4.1). One access point, dispatched by `action`, backing the
// admin endpoints. It drives EXACTLY the revocation levers Gate 3 proved bite:
//
//   revoke all   -> users.accessRevokedAfter = now  (every token for the user)
//   revoke client-> the user's Grant rows for that client get payload.revoked
//                   = true + payload.accessRevokedAfter = now (per-connection)
//   disableClient-> the Client payload gets disabled=true AND all its Grants
//                   are revoked (kills live tokens; new-token blocking at the
//                   authorize step is a documented follow-on, see handoff)
//
// The oidc-provider records live in the generic one-table adapter store
// (oauthAdapterStore, model='Grant'/'Client', JSON payloads). Grant payload
// carries accountId (== user refId) and clientId — the join keys. Mutations go
// through the educore abstraction's saveObject({refId, payload}) partial-update
// (preserves the row's model/id/expiresAt so GC + the gate's by-id lookup are
// untouched); reads go through the oauth-admin mapper's getSql. No raw SQL here.
//
// Every mutating action writes an append-only authAuditLog row (access_revoked
// / client_disabled) recording the TARGET (sub/username/clientId) and, in
// detail, the acting admin — never secrets. qtools pipe; no async/await.
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const ADAPTER_TABLE = 'oauthAdapterStore';
const AUDIT_TABLE = 'authAuditLog';
const READ_OPTS = { suppressStatementLog: true, noTableNameOk: true };
const WRITE_OPTS = { suppressStatementLog: true };

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { sqlDb, dataMapping } = passThroughParameters;

	const mapper = dataMapping['oauth-admin'];

	const nowSec = () => Math.floor(Date.now() / 1000);

	const safeParse = (jsonText) => {
		try { return JSON.parse(jsonText || '{}'); } catch (e) { return {}; }
	};

	// Sequentially saveObject each item (no async/await); transformFn(item)->rowToSave.
	const saveEach = (tableRef, items, transformFn, done) => {
		let index = 0;
		const step = () => {
			if (index >= items.length) { done(''); return; }
			const row = transformFn(items[index]);
			index += 1;
			tableRef.saveObject(row, WRITE_OPTS, (err) => {
				if (err) { done(err); return; }
				step();
			});
		};
		step();
	};

	// Append one audit row (INSERT — no refId — honoring the append-only triggers).
	const writeAudit = (auditTable, { event, sub, username, clientId, detail }, done) => {
		auditTable.saveObject(
			{
				event,
				sub: sub || '',
				username: username || '',
				clientId: clientId || '',
				ip: '',
				detail: detail ? JSON.stringify(detail) : '',
				eventAt: Date.now(),
			},
			WRITE_OPTS,
			(err) => done(err),
		);
	};

	// ================================================================================
	// ACTION: listConnections { userRef } — a user's active OAuth connections,
	// one row per client, with a live/revoked flag from the grant payload.
	const handleListConnections = (requestData, callback) => {
		const { userRef } = requestData;
		if (!userRef) { callback('listConnections: userRef required'); return; }

		const taskList = new taskListPlus();

		taskList.push((args, next) => sqlDb.getTable(ADAPTER_TABLE, mergeArgs(args, next, 'adapterTable')));

		taskList.push((args, next) => {
			args.adapterTable.getData(mapper.getSql('grantsAll'), READ_OPTS, (err, rows = []) => {
				if (err) { next(err, args); return; }
				next('', { ...args, grantRows: rows });
			});
		});

		taskList.push((args, next) => {
			args.adapterTable.getData(mapper.getSql('clientsAll'), READ_OPTS, (err, rows = []) => {
				if (err) { next(err, args); return; }
				next('', { ...args, clientRows: rows });
			});
		});

		taskList.push((args, next) => {
			const clientNameById = {};
			args.clientRows.forEach((row) => {
				const p = safeParse(row.payload);
				clientNameById[p.client_id || row.id] = p.client_name || '(unnamed client)';
			});

			const byClient = {};
			args.grantRows.forEach((row) => {
				const p = safeParse(row.payload);
				if (p.accountId !== userRef) { return; }
				const cid = p.clientId || '(none)';
				if (!byClient[cid]) {
					byClient[cid] = {
						clientId: cid,
						clientName: clientNameById[cid] || '(unknown client)',
						grantCount: 0,
						scopes: p.openid && p.openid.scope ? p.openid.scope : '',
						issuedAt: Number(p.iat || 0),
						revoked: false,
						accessRevokedAfter: 0,
					};
				}
				byClient[cid].grantCount += 1;
				if (p.revoked) { byClient[cid].revoked = true; }
				if (p.accessRevokedAfter) {
					byClient[cid].accessRevokedAfter = Math.max(byClient[cid].accessRevokedAfter, Number(p.accessRevokedAfter));
				}
			});

			next('', { ...args, connections: Object.values(byClient) });
		});

		pipeRunner(taskList.getList(), {}, (err, args) => {
			if (err) { callback(err.toString ? err.toString() : String(err)); return; }
			callback('', { connections: args.connections });
		});
	};

	// ================================================================================
	// ACTION: revoke { userRef, clientId?, adminUsername } — set the proven levers.
	const handleRevoke = (requestData, callback) => {
		const { userRef, clientId, adminUsername } = requestData;
		if (!userRef) { callback('revoke: userRef required'); return; }
		const cutoff = nowSec();

		const taskList = new taskListPlus();

		taskList.push((args, next) => sqlDb.getTable(ADAPTER_TABLE, mergeArgs(args, next, 'adapterTable')));
		taskList.push((args, next) => sqlDb.getTable('users', mergeArgs(args, next, 'userTable')));
		taskList.push((args, next) => sqlDb.getTable(AUDIT_TABLE, mergeArgs(args, next, 'auditTable')));

		// find this user's grants (optionally scoped to one client)
		taskList.push((args, next) => {
			args.adapterTable.getData(mapper.getSql('grantsAll'), READ_OPTS, (err, rows = []) => {
				if (err) { next(err, args); return; }
				const matching = rows.filter((row) => {
					const p = safeParse(row.payload);
					if (p.accountId !== userRef) { return false; }
					if (clientId && p.clientId !== clientId) { return false; }
					return true;
				});
				next('', { ...args, matching });
			});
		});

		// mark each matching grant revoked (payload.revoked + accessRevokedAfter)
		taskList.push((args, next) => {
			saveEach(
				args.adapterTable,
				args.matching,
				(row) => ({
					refId: row.refId,
					payload: JSON.stringify({ ...safeParse(row.payload), revoked: true, accessRevokedAfter: cutoff }),
				}),
				(err) => (err ? next(err, args) : next('', args)),
			);
		});

		// revoke-all also stamps the user column (covers future/other grants)
		taskList.push((args, next) => {
			if (clientId) { next('', args); return; }
			args.userTable.saveObject(
				{ refId: userRef, accessRevokedAfter: String(cutoff) },
				WRITE_OPTS,
				(err) => (err ? next(err, args) : next('', args)),
			);
		});

		// audit
		taskList.push((args, next) => {
			writeAudit(args.auditTable, {
				event: 'access_revoked',
				sub: userRef,
				username: requestData.targetUsername || '',
				clientId: clientId || '',
				detail: { scope: clientId ? 'client' : 'all', grantsAffected: args.matching.length, actor: adminUsername || '(unknown admin)', cutoff },
			}, (err) => (err ? next(err, args) : next('', args)));
		});

		pipeRunner(taskList.getList(), {}, (err, args) => {
			if (err) { callback(err.toString ? err.toString() : String(err)); return; }
			callback('', { revoked: true, userRef, clientId: clientId || null, grantsAffected: args.matching.length });
		});
	};

	// ================================================================================
	// ACTION: listClients {} — all DCR clients, with a disabled flag.
	const handleListClients = (requestData, callback) => {
		const taskList = new taskListPlus();
		taskList.push((args, next) => sqlDb.getTable(ADAPTER_TABLE, mergeArgs(args, next, 'adapterTable')));
		taskList.push((args, next) => {
			args.adapterTable.getData(mapper.getSql('clientsAll'), READ_OPTS, (err, rows = []) => {
				if (err) { next(err, args); return; }
				const clients = rows.map((row) => {
					const p = safeParse(row.payload);
					return {
						clientId: p.client_id || row.id,
						clientName: p.client_name || '(unnamed client)',
						redirectUris: p.redirect_uris || [],
						scope: p.scope || '',
						issuedAt: Number(p.client_id_issued_at || 0),
						disabled: !!p.disabled,
					};
				});
				next('', { ...args, clients });
			});
		});
		pipeRunner(taskList.getList(), {}, (err, args) => {
			if (err) { callback(err.toString ? err.toString() : String(err)); return; }
			callback('', { clients: args.clients });
		});
	};

	// ================================================================================
	// ACTION: disableClient { clientId, adminUsername } — mark disabled + revoke
	// its live grants. (Blocking NEW authorize for a disabled client is a
	// documented follow-on; see the Phase-4→5 handoff.)
	const handleDisableClient = (requestData, callback) => {
		const { clientId, adminUsername } = requestData;
		if (!clientId) { callback('disableClient: clientId required'); return; }
		const cutoff = nowSec();

		const taskList = new taskListPlus();
		taskList.push((args, next) => sqlDb.getTable(ADAPTER_TABLE, mergeArgs(args, next, 'adapterTable')));
		taskList.push((args, next) => sqlDb.getTable(AUDIT_TABLE, mergeArgs(args, next, 'auditTable')));

		// mark the client row disabled
		taskList.push((args, next) => {
			args.adapterTable.getData(mapper.getSql('clientsAll'), READ_OPTS, (err, rows = []) => {
				if (err) { next(err, args); return; }
				const clientRow = rows.find((row) => {
					const p = safeParse(row.payload);
					return (p.client_id || row.id) === clientId;
				});
				if (!clientRow) { next(`disableClient: client '${clientId}' not found`, args); return; }
				const newPayload = JSON.stringify({ ...safeParse(clientRow.payload), disabled: true });
				args.adapterTable.saveObject({ refId: clientRow.refId, payload: newPayload }, WRITE_OPTS, (saveErr) => {
					if (saveErr) { next(saveErr, args); return; }
					next('', args);
				});
			});
		});

		// revoke its grants
		taskList.push((args, next) => {
			args.adapterTable.getData(mapper.getSql('grantsAll'), READ_OPTS, (err, rows = []) => {
				if (err) { next(err, args); return; }
				const matching = rows.filter((row) => safeParse(row.payload).clientId === clientId);
				saveEach(
					args.adapterTable,
					matching,
					(row) => ({ refId: row.refId, payload: JSON.stringify({ ...safeParse(row.payload), revoked: true, accessRevokedAfter: cutoff }) }),
					(saveErr) => (saveErr ? next(saveErr, args) : next('', { ...args, grantsRevoked: matching.length })),
				);
			});
		});

		taskList.push((args, next) => {
			writeAudit(args.auditTable, {
				event: 'client_disabled',
				sub: '',
				username: '',
				clientId,
				detail: { grantsRevoked: args.grantsRevoked, actor: adminUsername || '(unknown admin)', cutoff },
			}, (err) => (err ? next(err, args) : next('', args)));
		});

		pipeRunner(taskList.getList(), {}, (err, args) => {
			if (err) { callback(err.toString ? err.toString() : String(err)); return; }
			callback('', { disabled: true, clientId, grantsRevoked: args.grantsRevoked });
		});
	};

	// ================================================================================
	// ACTION: auditLog { event, userRef, clientId, sinceMs, untilMs, limit }
	const handleAuditLog = (requestData, callback) => {
		const taskList = new taskListPlus();
		taskList.push((args, next) => sqlDb.getTable(AUDIT_TABLE, mergeArgs(args, next, 'auditTable')));
		taskList.push((args, next) => {
			const query = mapper.getSql('auditFiltered', {
				event: requestData.event,
				userRef: requestData.userRef,
				clientId: requestData.clientId,
				sinceMs: requestData.sinceMs,
				untilMs: requestData.untilMs,
				limit: requestData.limit,
			});
			args.auditTable.getData(query, READ_OPTS, (err, rows = []) => {
				if (err) { next(err, args); return; }
				const events = rows.map((row) => ({
					event: row.event,
					sub: row.sub,
					username: row.username,
					clientId: row.clientId,
					ip: row.ip,
					detail: safeParse(row.detail),
					eventAt: Number(row.eventAt || 0),
				}));
				next('', { ...args, events });
			});
		});
		pipeRunner(taskList.getList(), {}, (err, args) => {
			if (err) { callback(err.toString ? err.toString() : String(err)); return; }
			callback('', { events: args.events });
		});
	};

	// ================================================================================
	// DISPATCH
	const serviceFunction = (requestData, callback) => {
		if (typeof requestData === 'function') { callback = requestData; requestData = {}; }
		const action = requestData.action;
		switch (action) {
			case 'listConnections': return handleListConnections(requestData, callback);
			case 'revoke': return handleRevoke(requestData, callback);
			case 'listClients': return handleListClients(requestData, callback);
			case 'disableClient': return handleDisableClient(requestData, callback);
			case 'auditLog': return handleAuditLog(requestData, callback);
			default:
				callback(`oauth-admin: unknown action '${action}'`);
				return;
		}
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);
	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
