#!/usr/bin/env node
'use strict';
// @concept: [[ManifestEditor]]
// @concept: [[SecurityFirstPattern]]
// @concept: [[CollaborationAccess]]

/**
 * ENDPOINT: MANIFEST ASSIGNMENTS (list collaborators)
 *
 * GET /api/manifestAssignments?manifest=<key> -> [{ refId, manifestKey, userId, createdAt }].
 * Admin/super only.
 */

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const makeRefId = require('../../lib/make-ref-id');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({
	dotD: endpointsDotD,
	passThroughParameters,
}) {
	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(moduleName);

	const {
		expressApp,
		accessTokenHeaderTools,
		accessPointsDotD,
		routingPrefix,
	} = passThroughParameters;

	const serviceFunction = (permissionValidator) => (xReq, xRes, next) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) =>
			args.permissionValidator(
				xReq.appValueGetter('authclaims'),
				{ showDetails: false },
				forwardArgs({ next, args }),
			),
		);

		taskList.push((args, next) => {
			const requestData = {
				manifestKey: xReq.qtGetSurePath('query.manifest', null),
			};
			next('', { ...args, requestData });
		});

		taskList.push((args, next) => {
			const { accessPointsDotD, requestData } = args;
			const localCallback = (err, result) => {
				if (err) {
					next(`Manifest assignments failed: ${err}`, args);
					return;
				}
				next('', { ...args, result });
			};
			accessPointsDotD['manifest-assignments'](requestData, localCallback);
		});

		const initialData = {
			accessPointsDotD,
			permissionValidator,
			accessTokenHeaderTools,
		};
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				const errorId = makeRefId(12);
				xLog.error(`Manifest assignments error (${errorId}): ${err}`);
				xRes.status(400).send(`${err.toString()} (${errorId})`);
				return;
			}
			const { result } = args;
			xRes.send(Array.isArray(result) ? result : [result]);
		});
	};

	const addEndpoint = ({
		name,
		method,
		routePath,
		serviceFunction,
		expressApp,
		endpointsDotD,
		permissionValidator,
		accessTokenHeaderTools,
	}) => {
		expressApp[method](routePath, serviceFunction(permissionValidator));
		endpointsDotD.logList.push(name);
	};

	const method = 'get';
	const thisEndpointName = 'manifestAssignments';
	const routePath = `${routingPrefix}${thisEndpointName}`;
	const name = routePath;

	const permissionValidator = accessTokenHeaderTools.getValidator([
		'admin',
		'super',
	]);

	addEndpoint({
		name,
		method,
		routePath,
		serviceFunction,
		expressApp,
		endpointsDotD,
		permissionValidator,
		accessTokenHeaderTools,
	});

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
