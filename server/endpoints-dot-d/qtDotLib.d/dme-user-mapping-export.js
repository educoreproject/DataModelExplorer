#!/usr/bin/env node
'use strict';
// @concept: [[UserMappingPersistence]]
//
// GET /api/dmeUserMappingExport?format=json|csv|cypher&status=accepted|proposed|rejected|all
// Streams every user's mappings as a downloadable file for graph ingestion.
// Admin and super roles only. Defaults: format=json, status=accepted.
//
//   curl -H "Authorization: Bearer $TOKEN" \
//        "https://ed-core.org/api/dmeUserMappingExport?format=cypher&status=accepted" \
//        -o accepted-mappings.cypher

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
			const { format, status } = xReq.query || {};

			accessPointsDotD['dme-user-mapping-export']({ format, status }, (err, result) => {
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
			xRes.setHeader('Content-Type', `${result.mimeType}; charset=utf-8`);
			xRes.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
			xRes.setHeader('X-Mapping-Count', String(result.count));
			xRes.send(result.content);
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

	const method = 'get';
	const thisEndpointName = 'dmeUserMappingExport';
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
