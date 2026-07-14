#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]
// @concept: [[SqliteAbstraction]]

// ============================================================================
// oauth-audit-enforce.js — makes authAuditLog APPEND-ONLY at the database layer
// (dmeMcpOAuth Phase 2.6). Two BEFORE triggers RAISE(ABORT) on any UPDATE or
// DELETE, so even a bug (or a compromised access point) cannot rewrite or erase
// history — the audit trail can only grow. INSERTs are unaffected.
//
// Idempotent (CREATE TRIGGER IF NOT EXISTS); safe to run every boot after
// oauth-schema-init has ensured the table exists.
//
// RETENTION NOTE: because the log is append-only and never pruned by the GC
// job, it grows without bound. Retention/rotation is an operations decision
// (export-then-truncate under DBA control, or a partition rollover) — it is
// deliberately NOT automated here, since automated deletion is exactly what an
// append-only audit trail exists to prevent. Documented for the ops runbook.
//
// Contract: module.exports({ sqlDb, tableName })(callback)
//   -> callback(err, { installed })
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const DEFAULT_TABLE = 'authAuditLog';

const moduleFunction = ({ sqlDb, tableName = DEFAULT_TABLE } = {}) => (callback) => {
	const { xLog } = process.global;

	sqlDb.getTable(tableName, (err, tableRef) => {
		if (err) {
			xLog && xLog.error(`[${moduleName}] getTable('${tableName}') failed: ${err}`);
			callback(err);
			return;
		}

		// <!tableName!> is substituted by the abstraction to the real table name.
		const statements = `
			CREATE TRIGGER IF NOT EXISTS <!tableName!>_append_only_no_update
				BEFORE UPDATE ON <!tableName!>
				BEGIN SELECT RAISE(ABORT, 'authAuditLog is append-only: UPDATE rejected'); END;
			CREATE TRIGGER IF NOT EXISTS <!tableName!>_append_only_no_delete
				BEFORE DELETE ON <!tableName!>
				BEGIN SELECT RAISE(ABORT, 'authAuditLog is append-only: DELETE rejected'); END;
		`;

		tableRef.runStatement(statements, { suppressStatementLog: true }, (runErr) => {
			if (runErr) {
				xLog && xLog.error(`[${moduleName}] failed to install append-only triggers: ${runErr}`);
				callback(runErr);
				return;
			}
			xLog && xLog.status(`[${moduleName}] append-only triggers installed on ${tableName}`);
			callback('', { installed: true });
		});
	});
};

module.exports = moduleFunction;
