#!/usr/bin/env node
'use strict';
// @concept: [[OidcIdentityProvider]]
// @concept: [[AccessPointPattern]]
// @concept: [[SecurityFirstPattern]]

// ============================================================================
// oidc-verify-credential.js — the OIDC credential hook (dmeMcpOAuth Phase 1)
//
// Resolves C1 from the security panel. This is the ONLY credential path the
// OAuth/OIDC authorization server is allowed to use. It authenticates DB users
// ONLY:
//   - looks the user up in the `users` table by EXACT username,
//   - rejects if the row is absent, `disabled`, or its stored password is not
//     in hashed `hash:salt` form,
//   - verifies solely via `verifyPassword` (PBKDF2) against the stored hash.
//
// It NEVER consults `rootPassword` (removed), NEVER honors a builtin/config
// plaintext compare, and NEVER calls the `user-login` access point (which
// historically carried both backdoors). A would-be root/builtin-plaintext
// bypass therefore cannot mint an OAuth token.
//
// Contract: serviceFunction({ username, password }, callback)
//   callback(err)                 -> a real DB/lookup error
//   callback('', { account })     -> account is a sanitized object on success,
//                                    or null when authentication fails (no such
//                                    user / disabled / bad password). Failure is
//                                    NOT an error — findAccount returns nothing.
// The returned account carries: sub (refId), username, role, accessRevokedAfter
// (epoch, 0 when unset), disabled — never the password/hash.
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig } = process.global;

	const { sqlDb, dataMapping } = passThroughParameters;
	const { verifyPassword } = dataMapping['profile-user'];

	const serviceFunction = (xQuery, callback) => {
		const username = xQuery && xQuery.username;
		const password = xQuery && xQuery.password;

		// Empty username/password never authenticates — bail before any DB work.
		if (!username || !password) {
			callback('', { account: null });
			return;
		}

		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// STAGE 1: users table reference
		taskList.push((args, next) =>
			args.sqlDb.getTable('users', mergeArgs(args, next, 'userTable')),
		);

		// --------------------------------------------------------------------------------
		// STAGE 2: exact-username lookup (SELECT * so we see disabled / accessRevokedAfter)
		taskList.push((args, next) => {
			const { userTable, dataMapping } = args;
			const localCallback = (err, userList = []) => {
				if (err) {
					next(err, args);
					return;
				}
				next('', { ...args, user: userList.qtLast() });
			};
			const query = dataMapping['profile-user'].getSql('byUsernameForAuth', {
				username,
			});
			userTable.getData(
				query,
				{ suppressStatementLog: true, noTableNameOk: true },
				localCallback,
			);
		});

		// --------------------------------------------------------------------------------
		// EXECUTE + decide
		const initialData = { sqlDb, dataMapping };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				xLog.error(`oidc-verify-credential lookup error: ${err.toString()}`);
				callback(err);
				return;
			}

			const user = args.user;

			// No such user.
			if (!user) {
				callback('', { account: null });
				return;
			}
			// Disabled account cannot authenticate (missing column -> undefined -> allowed).
			if (user.disabled) {
				callback('', { account: null });
				return;
			}
			// DB-users-only: the stored password MUST be a real PBKDF2 hash (`hash:salt`).
			// A row without a hashed password (plaintext/builtin-only) is NOT authenticated
			// by this path — that is the whole point of C1.
			if (typeof user.password !== 'string' || !user.password.includes(':')) {
				callback('', { account: null });
				return;
			}
			// The only credential check: PBKDF2 verify against the stored hash.
			if (!verifyPassword(password, user.password)) {
				callback('', { account: null });
				return;
			}

			// Success — return a sanitized account (never the password/hash).
			const account = {
				sub: user.refId,
				username: user.username,
				role: user.role,
				accessRevokedAfter: Number(user.accessRevokedAfter) || 0,
				disabled: !!user.disabled,
			};
			callback('', { account });
		});
	};

	// ================================================================================
	// REGISTRATION

	const addEndpoint = ({ name, serviceFunction, dotD }) => {
		dotD.logList.push(name);
		dotD.library.add(name, serviceFunction);
	};

	addEndpoint({ name: moduleName, serviceFunction, dotD });

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
