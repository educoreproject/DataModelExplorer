#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[SessionLifecycle]]
// @concept: [[SecurityFirstPattern]]
//
// dme-user-graph-list — the version selector's data source (doc 09). Returns the
// user's versions (refId, versionName, updatedAt, userNodeCount) — never the script,
// never any secret. Authenticated; scoped to the JWT userRefId.

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
			accessPointsDotD['graph-state-version-list']({ userRefId }, (err, result) => {
				if (err) { next(err, args); return; }
				next('', { ...args, result });
			});
		});
		const initialData = { accessPointsDotD, permissionValidator };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				const errorId = makeRefId(12);
				xLog.error(`dme-user-graph-list error (${errorId}): ${err}`);
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
