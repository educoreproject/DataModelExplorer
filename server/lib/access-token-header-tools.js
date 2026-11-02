#!/usr/bin/env node
'use strict';
// @concept: [[JwtTokenManagement]]
// @concept: [[PermissionValidation]]
// @concept: [[SecurityFirstPattern]]

/**
 * Module Name: [moduleName]
 * Description: This module provides JWT authentication utilities for an Express application.
 */

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

// Required modules
const os = require('os');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

/**
 * Main module function
 */
const moduleFunction =
	({ moduleName } = {}) =>
	({ expressApp, userByUsername } = {}) => {
		// Retrieve global variables
		const { xLog, getConfig, rawConfig, commandLineParameters } =
			process.global;
		const { secret, authsecondsexpirationseconds } = getConfig(moduleName); // moduleName is closure

		// Routes whose endpoint declared, at registration, that a bad token is to be read as no token (the public
		// downloads, TQ 2026-10-30: a visitor holding a stale or garbled token is served as a visitor, not refused 401).
		// Exact path match only; every other route still refuses a bad token. See declareTokenTolerantRoute.
		const tokenTolerantRoutePathList = [];
		const ANONYMOUS_AUTHCLAIMS = Object.freeze({ noToken: true, user: Object.freeze({ role: 'public' }) });

		// ============================================================
		// Function: hasValidToken
		// Description: Middleware to check if the request has a valid JWT token.
		// ============================================================
		const hasValidToken = (xReq, callback) => {
			xLog.status(`hasValidToken ${xReq.path}`);

			const taskList = new taskListPlus();

			// Extract and verify JWT token
			taskList.push((args, next) => {
				const authHeader = xReq.headers['authorization'];
				const token = authHeader && authHeader.split(' ')[1]; // Get the token from 'Bearer <token>'
				if (!authHeader) {
					// No token provided, set default authclaims
					xReq.appValueSetter('authclaims', {
						...ANONYMOUS_AUTHCLAIMS,
						user: { ...ANONYMOUS_AUTHCLAIMS.user },
					});
					next('skipRestOfPipe', args);
					return;
				}

				try {
					// Pin HS256 explicitly (dmeMcpOAuth Phase 1, resolves C6 for the
					// website path). All website tokens are HS256 (jwt.sign default,
					// see refreshauthtoken), so this only REJECTS non-HS256 tokens —
					// e.g. an RS256 MCP access token can never authenticate a website
					// session (the audience firewall, enforced by algorithm+key type).
					const authclaims = jwt.verify(token, secret, { algorithms: ['HS256'] });
					xReq.appValueSetter('authclaims', authclaims);
					next('', { ...args, authclaims });
				} catch (err) {
					xLog.status(`token error: ${err.toString()}`);
					next(`token error: ${err.toString()}`, args);
				}
			});

			// Retrieve user from database based on token claims
			taskList.push((args, next) => {
				const { userByUsername, authclaims } = args;
				if (authclaims.qtGetSurePath('user.role', []).includes('firstTime')) {
					next('', args);
					return;
				}
				const localCallback = (err, user) => {
					if (!user) {
						err = `token error: User not found`; // Token specifies user not in database
					}
					next(err, { ...args, user });
				};

				userByUsername(
					{
						username: authclaims.user?.username || 'unmatchablevalue',
					},
					localCallback,
				); // user-by-username.js
			});

			// Initialize and execute the task list
			const initialData = { userByUsername };
			pipeRunner(taskList.getList(), initialData, (err, args) => {
				if (err == 'skipRestOfPipe') {
					err = '';
				}
				if (err && tokenTolerantRoutePathList.includes(xReq.path)) {
					xLog.status(`token-tolerant route ${xReq.path}: bad token read as no token (${err})`);
					xReq.appValueSetter('authclaims', {
						...ANONYMOUS_AUTHCLAIMS,
						user: { ...ANONYMOUS_AUTHCLAIMS.user },
					});
					err = '';
				}
				callback(err);
			});
		};

		// ============================================================
		// Function: declareTokenTolerantRoute
		// Description:
		//   An endpoint whose content is public calls this with its own routePath so that a bad token (garbled,
		//   expired, wrongly signed, naming no known user) is read as no token on that route instead of being
		//   refused 401. It never grants anything a visitor without a token lacks.
		// ============================================================
		const declareTokenTolerantRoute = (routePath) => {
			if (typeof routePath !== 'string' || !routePath.startsWith('/')) {
				throw new Error(`declareTokenTolerantRoute: routePath must be an absolute path, got ${JSON.stringify(routePath)}`);
			}
			tokenTolerantRoutePathList.push(routePath);
		};

		// ============================================================
		// Function: refreshauthtoken
		// Description: Middleware to refresh the JWT token.
		// ============================================================
		const refreshauthtoken = ({ xReq, xRes, payloadValues = {} }, callback) => {
			xLog.status(`refreshauthtoken ${xReq.path}`);
			const taskList = new taskListPlus();

			// Initialize and execute the task list
			const initialData = {};
			pipeRunner(taskList.getList(), initialData, (err, args) => {
				const authclaims = xReq.appValueGetter('authclaims');
				delete authclaims.exp;
				delete authclaims.iat;

				const payload = {
					...authclaims,
					...payloadValues,
					authsecondsexpirationseconds,
				};

				xReq.appValueSetter('authclaims', payload);

				const authtoken = jwt.sign(payload, secret, {
					expiresIn: authsecondsexpirationseconds,
				});

				xRes.set({
					authtoken,
					authclaims: JSON.stringify(payload),
					authsecondsexpirationseconds,
				});
				callback();
			});
		};

		// ============================================================
		// Function: getValidator
		// Description:
		//   Returns a validator function that checks if the user has the required permissions.
		// Parameters:
		//   - permissionList: Array of permitted roles.
		// ============================================================
		const getValidator = (permissionList) => {
			return (authclaims, options = {}, callback) => {
				if (typeof options == 'function') {
					callback = options;
					options = {};
				}

				// EXACT role names. This was userRole.includes(item), a substring test on the role text, so
				// 'subadministrator' passed ['admin']. A role is one name, a list in one text (commas or spaces),
				// or an array; a permitted name must equal one of them. A token with no role matches nothing
				// (it used to throw). The 'super' bypass is unchanged.
				const userRole = authclaims?.user?.role;
				const userRoleNameList = (Array.isArray(userRole) ? userRole : String(userRole ?? '').split(/[\s,]+/))
					.map((roleName) => String(roleName).trim())
					.filter(Boolean);
				const isValid =
					permissionList.includes('public') ||
					userRole === 'super' ||
					permissionList.some((permittedRoleName) => userRoleNameList.includes(permittedRoleName));

				const err = isValid ? false : 'Unauthorized access';

				if (options.showDetails) {
					xLog.status(
						`\nauthclaims  ========================= [access-token-header-tools.js.]\n`,
					);
					xLog.status(`userRole=${userRole}`);
					xLog.status(authclaims);
					xLog.status(`\npermissionList  =========================\n`);
					xLog.status(permissionList);
					xLog.status(`\nerror message  =========================\n`);
					xLog.status(err);
					xLog.status(
						`\n  ========================= [access-token-header-tools.js.]\n`,
					);
				}

				if (typeof callback == 'function') {
					callback(err);
				} else {
					return err;
				}
			};
		};

		return { hasValidToken, refreshauthtoken, getValidator, declareTokenTolerantRoute };
	};

module.exports = moduleFunction({ moduleName });
