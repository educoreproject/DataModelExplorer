#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[SessionLifecycle]]
// @concept: [[SecurityFirstPattern]]

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const makeRefId = require('../../lib/make-ref-id');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { expressApp, accessTokenHeaderTools, accessPointsDotD, routingPrefix } =
		passThroughParameters;

	const postServiceFunction = (permissionValidator) => (xReq, xRes) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) =>
			args.permissionValidator(
				xReq.appValueGetter('authclaims'),
				forwardArgs({ next, args }),
			),
		);

		taskList.push((args, next) => {
			const { accessPointsDotD } = args;
			const authClaims = xReq.appValueGetter('authclaims');
			const userRefId = authClaims.qtGetSurePath('user.refId', '');
			const username = authClaims.qtGetSurePath('user.username', '');

			const body = xReq.body || {};
			const apInput = {
				userRefId,
				username,
				versionRefId: body.versionRefId,
				isNew: !!body.new,
				versionName: body.versionName,
			};

			accessPointsDotD['dme-user-graph-open'](apInput, (err, result) => {
				if (err) { next(err, args); return; }
				next('', { ...args, result });
			});
		});

		const initialData = { accessPointsDotD, permissionValidator };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				const errorId = makeRefId(12);
				xLog.error(`dme-user-graph-open error (${errorId}): ${err}`);
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
	const permissionValidator = accessTokenHeaderTools.getValidator([
		'user', 'client', 'admin', 'super',
	]);

	addEndpoint({
		name: `${routePath} [POST]`,
		method: 'post',
		routePath,
		serviceFunction: postServiceFunction,
		permissionValidator,
	});

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
