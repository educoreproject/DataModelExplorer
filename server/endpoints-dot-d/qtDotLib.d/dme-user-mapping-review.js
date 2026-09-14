#!/usr/bin/env node
'use strict';
// @concept: [[UserMappingPersistence]]
//
// POST /api/dmeUserMappingReview   body: { refId, status, note? }
// Sets a proposal's review status (proposed | accepted | rejected). Admin and
// super roles only; the reviewer is taken from the verified token claim.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	// ================================================================================
	// INITIALIZATION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(moduleName);

	const { expressApp, accessTokenHeaderTools, accessPointsDotD, routingPrefix } =
		passThroughParameters;

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (permissionValidator) => (xReq, xRes, next) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) =>
			args.permissionValidator(xReq.appValueGetter('authclaims'), forwardArgs({ next, args })),
		);

		taskList.push((args, next) => {
			const { accessPointsDotD } = args;
			const authClaims = xReq.appValueGetter('authclaims');
			const reviewerRefId = authClaims.qtGetSurePath('user.refId', '');
			const { refId, status, note } = xReq.body || {};

			accessPointsDotD['dme-user-mapping-review']({ reviewerRefId, refId, status, note }, (err, result) => {
				if (err) {
					next(err, args);
					return;
				}
				next('', { ...args, result });
			});
		});

		const initialData = { accessPointsDotD, permissionValidator };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			const { result } = args;
			if (err) {
				xRes.status(401).send(`${err.toString()}`);
				return;
			}
			xRes.send([result]);
		});
	};

	// ================================================================================
	// Endpoint Constructor

	const addEndpoint = ({
		name,
		method,
		routePath,
		serviceFunction,
		expressApp,
		endpointsDotD,
		permissionValidator,
	}) => {
		expressApp[method](routePath, serviceFunction(permissionValidator));
		endpointsDotD.logList.push(name);
	};

	// ================================================================================
	// Do the constructing

	const method = 'post';
	const thisEndpointName = 'dmeUserMappingReview';
	const routePath = `${routingPrefix}${thisEndpointName}`;
	const name = routePath;

	const permissionValidator = accessTokenHeaderTools.getValidator(['admin', 'super']);

	addEndpoint({
		name,
		method,
		routePath,
		serviceFunction,
		expressApp,
		endpointsDotD,
		permissionValidator,
	});

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
