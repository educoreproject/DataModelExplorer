#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[SessionLifecycle]]
// @concept: [[SecurityFirstPattern]]
//
// dme-user-graph-status — GET the authoritative open/dirty state for one version
// (doc 12). Mirrors dme-user-graph-list: authenticated, scoped to the JWT userRefId,
// returns only booleans (never the script, never a secret). The client calls this on
// askMilo turn-complete so its synchronous unsaved-changes guards stay accurate.
//   GET /api/dme-user-graph-status?versionRefId=...  ->  [{ versionRefId, open, dirty }]

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const makeRefId = require('../../lib/make-ref-id');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { expressApp, accessTokenHeaderTools, accessPointsDotD, routingPrefix } = passThroughParameters;

	const getServiceFunction = (permissionValidator) => (xReq, xRes) => {
		const taskList = new taskListPlus();
		taskList.push((args, next) =>
			args.permissionValidator(xReq.appValueGetter('authclaims'), forwardArgs({ next, args })),
		);
		taskList.push((args, next) => {
			const userRefId = xReq.appValueGetter('authclaims').qtGetSurePath('user.refId', '');
			const versionRefId = xReq.qtGetSurePath('query.versionRefId', '');
			accessPointsDotD['dme-user-graph-status']({ userRefId, versionRefId }, (err, result) => {
				if (err) { next(err, args); return; }
				next('', { ...args, result });
			});
		});
		const initialData = { accessPointsDotD, permissionValidator };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				const errorId = makeRefId(12);
				xLog.error(`dme-user-graph-status error (${errorId}): ${err}`);
				xRes.status(401).send(`${err.toString()} (${errorId})`);
				return;
			}
			const { result } = args;
			xRes.send(Array.isArray(result) ? result : [result]);
		});
	};

	const routePath = `${routingPrefix}${moduleName}`;
	const permissionValidator = accessTokenHeaderTools.getValidator(['user', 'client', 'admin', 'super']);
	expressApp.get(routePath, getServiceFunction(permissionValidator));
	endpointsDotD.logList.push(`${routePath} [GET]`);
	return {};
};

module.exports = moduleFunction;
