#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[AuthoringWrites]]
// @concept: [[SecurityFirstPattern]]

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const makeRefId = require('../../lib/make-ref-id');
const { resolveInternalAuth } = require('../../lib/dme-internal-auth');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	const { xLog, getConfig } = process.global;
	const { expressApp, accessTokenHeaderTools, accessPointsDotD, routingPrefix } =
		passThroughParameters;

	// The server-only internal auth secret (Option A). Present -> the internal write mode
	// is available; absent -> only the JWT path works. NEVER served to the client.
	const { internalAuthSecret } = getConfig('dmeUserGraphInternalAuth') || {};

	const postServiceFunction = (permissionValidator) => (xReq, xRes) => {
		const taskList = new taskListPlus();
		const internalAuth = resolveInternalAuth({
			xReq,
			configuredSecret: internalAuthSecret,
		});

		// STEP 1: AUTHENTICATION — internal (secret + localhost) OR the existing JWT path
		taskList.push((args, next) => {
			if (internalAuth.internal) {
				next('', args); // trusted server-internal call; identity asserted in STEP 2
				return;
			}
			args.permissionValidator(xReq.appValueGetter('authclaims'), forwardArgs({ next, args }));
		});

		// STEP 2: RESOLVE IDENTITY (internal: derive owner from the version row; else JWT)
		// + CALL ACCESS POINT
		taskList.push((args, next) => {
			const { accessPointsDotD } = args;
			const body = xReq.body || {};
			const versionRefId = body.versionRefId;

			const callExecutor = (userRefId) => {
				accessPointsDotD['dme-user-graph-write'](
					{ userRefId, versionRefId, action: body.action, params: body.params },
					(err, result) => {
						if (err) { next(err, args); return; }
						next('', { ...args, result });
					},
				);
			};

			if (internalAuth.internal) {
				// Internal path: derive the owner userRefId from the version row; never trust
				// a client-supplied identity. Ownership is established by the secret gate.
				if (!versionRefId) { next('versionRefId is required', args); return; }
				accessPointsDotD['graph-state-version-getById']({ versionRefId }, (err, res) => {
					if (err) { next(err, args); return; }
					if (!res || !res.found) { next('Version not found', args); return; }
					callExecutor(res.userRefId);
				});
				return;
			}

			callExecutor(xReq.appValueGetter('authclaims').qtGetSurePath('user.refId', ''));
		});

		const initialData = { accessPointsDotD, permissionValidator };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				const errorId = makeRefId(12);
				xLog.error(`dme-user-graph-write error (${errorId}): ${err}`);
				xRes.status(401).send(`${err.toString()} (${errorId})`);
				return;
			}
			const { result } = args;
			xRes.send(Array.isArray(result) ? result : [result]);
		});
	};

	const addEndpoint = ({ name, method, routePath, serviceFunction, permissionValidator }) => {
		expressApp[method](routePath, serviceFunction(permissionValidator));
		endpointsDotD.logList.push(name);
	};

	const routePath = `${routingPrefix}${moduleName}`;
	const permissionValidator = accessTokenHeaderTools.getValidator(['user', 'client', 'admin', 'super']);
	addEndpoint({ name: `${routePath} [POST]`, method: 'post', routePath, serviceFunction: postServiceFunction, permissionValidator });

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
