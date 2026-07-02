#!/usr/bin/env node
'use strict';
// @concept: [[ManifestEditor]]
// @concept: [[SecurityFirstPattern]]

/**
 * ENDPOINT: MANIFEST SHOW
 *
 * GET /api/manifestShow?manifest=<key> -- one manifest's membership in derived build
 * order. Admin/super only. Delegates to the manifest-show access point, which shells
 * out to educoreForge's `manifestEditor -show --manifest=<key>`.
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
	// ================================================================================
	// INITIALIZATION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(moduleName);

	const {
		expressApp,
		accessTokenHeaderTools,
		accessPointsDotD,
		routingPrefix,
	} = passThroughParameters;

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (permissionValidator) => (xReq, xRes, next) => {
		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// STEP 1: PERMISSION VALIDATION (SECURITY FIRST)

		taskList.push((args, next) =>
			args.permissionValidator(
				xReq.appValueGetter('authclaims'),
				{ showDetails: false },
				forwardArgs({ next, args }),
			),
		);

		// --------------------------------------------------------------------------------
		// STEP 2: EXTRACT REQUEST PARAMETERS

		taskList.push((args, next) => {
			const requestData = {
				manifest: xReq.qtGetSurePath('query.manifest', null),
			};
			next('', { ...args, requestData });
		});

		// --------------------------------------------------------------------------------
		// STEP 3: SHOW MANIFEST VIA ACCESS POINT

		taskList.push((args, next) => {
			const { accessPointsDotD, requestData } = args;

			const localCallback = (err, result) => {
				if (err) {
					next(`Manifest show failed: ${err}`, args);
					return;
				}
				next('', { ...args, result });
			};

			accessPointsDotD['manifest-show'](requestData, localCallback);
		});

		// --------------------------------------------------------------------------------
		// EXECUTE PIPELINE AND HANDLE RESPONSE

		const initialData = {
			accessPointsDotD,
			permissionValidator,
			accessTokenHeaderTools,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				const errorId = makeRefId(12);
				xLog.error(`Manifest show error (${errorId}): ${err}`);
				xRes.status(400).send(`${err.toString()} (${errorId})`);
				return;
			}

			const { result } = args;

			// Always return array for consistent client handling
			xRes.send(Array.isArray(result) ? result : [result]);
		});
	};

	// ================================================================================
	// ENDPOINT REGISTRATION

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

	// ================================================================================
	// ENDPOINT CONFIGURATION

	const method = 'get';
	const thisEndpointName = 'manifestShow';
	const routePath = `${routingPrefix}${thisEndpointName}`;
	const name = routePath;

	// Require admin or super privileges
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
