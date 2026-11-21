#!/usr/bin/env node
'use strict';

// timestamp-trigger-repair.js — recognises and rewrites the WHERE-less updatedAt triggers that pre-10.0 sqlite-instance
// wrote (ruling R5 of PLAN-userRegistrationReset-112026). The template in sqlite-instance.js initTable was fixed long ago,
// but it says CREATE TRIGGER IF NOT EXISTS, so every table created before the fix keeps its old trigger, which restamps
// updatedAt on EVERY row whenever one row changes. Used by the startup migration (user-account-schema-migration.js) and
// by scripts/repairSqlite10Damage.js, so the two agree on what a stale trigger is and what replaces it.
//
//   isWherelessTimestampTrigger({ name, sql })           -> true for a *UpdateTimestamp trigger whose SQL has no WHERE
//   correctTriggerSqlOf(tableName, triggerName)          -> the trigger as initTable writes it today (triggerName defaults
//                                                           to tableName + 'UpdateTimestamp', the name initTable gives it)
//
// Only triggers NAMED *UpdateTimestamp are ever recognised. Hand-written triggers (authAuditLog_append_only_*,
// companionSourceMoveCurrent) never match, whatever their SQL says.

const TIMESTAMP_TRIGGER_NAME_PATTERN = /UpdateTimestamp$/;

const bracketedNameOf = (sqlName) => `[${String(sqlName).replace(/]/g, ']]')}]`;

const isWherelessTimestampTrigger = (triggerRow) => TIMESTAMP_TRIGGER_NAME_PATTERN.test(triggerRow.name) && !/\bWHERE\b/i.test(triggerRow.sql || '');

const correctTriggerSqlOf = (tableName, triggerName = `${tableName}UpdateTimestamp`) =>
	`CREATE TRIGGER ${bracketedNameOf(triggerName)} AFTER UPDATE ON ${bracketedNameOf(tableName)} FOR EACH ROW BEGIN UPDATE ${bracketedNameOf(tableName)} SET [updatedAt] = CURRENT_TIMESTAMP WHERE [refId] = NEW.[refId]; END;`;

// the repair of one trigger as one transaction: the old one is never dropped without the new one in its place
const triggerReplacementSqlOf = ({ triggerName, tableName }) => `BEGIN;\nDROP TRIGGER IF EXISTS ${bracketedNameOf(triggerName)};\n${correctTriggerSqlOf(tableName, triggerName)}\nCOMMIT;`;

module.exports = { isWherelessTimestampTrigger, correctTriggerSqlOf, triggerReplacementSqlOf };
