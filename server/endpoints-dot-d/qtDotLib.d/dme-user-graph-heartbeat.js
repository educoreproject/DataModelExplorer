#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]] [[MultiTenant]] [[SessionLifecycle]]
// dme-user-graph-heartbeat — the live browser session pings this periodically (07) to
// refresh its lease (lastHeartbeatAt); when the browser is gone, the stamp goes stale
// and the reaper reclaims the container + clone dir. Authenticated; userRefId from JWT.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const makeRefId = require('../../lib/make-ref-id');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require('qtools-asynchronous-pipe-plus')();

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { expressApp, accessTokenHeaderTools, accessPointsDotD, routingPrefix } = passThroughParameters;

	const postServiceFunction = (permissionValidator) => (xReq, xRes) => {
		const taskList = new taskListPlus();
		taskList.push((args, next) =>
			args.permissionValidator(xReq.appValueGetter('authclaims'), forwardArgs({ next, args })),
		);
		taskList.push((args, next) => {
			const userRefId = xReq.appValueGetter('authclaims').qtGetSurePath('user.refId', '');
			const body = xReq.body || {};
			accessPointsDotD['graph-state-version-stampHeartbeat'](
				{ userRefId, refId: body.versionRefId },
				(err, result) => { if (err) { next(err, args); return; } next('', { ...args, result }); },
			);
		});
		const initialData = { accessPointsDotD, permissionValidator };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				const errorId = makeRefId(12);
				xLog.error(`dme-user-graph-heartbeat error (${errorId}): ${err}`);
				xRes.status(401).send(`${err.toString()} (${errorId})`);
				return;
			}
			xRes.send(Array.isArray(args.result) ? args.result : [args.result]);
		});
	};

	const routePath = `${routingPrefix}${moduleName}`;
	const permissionValidator = accessTokenHeaderTools.getValidator(['user', 'client', 'admin', 'super']);
	expressApp.post(routePath, postServiceFunction(permissionValidator));
	endpointsDotD.logList.push(`${routePath} [POST]`);
	return {};
};

module.exports = moduleFunction;
