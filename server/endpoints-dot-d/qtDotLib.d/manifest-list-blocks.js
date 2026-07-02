#!/usr/bin/env node
'use strict';
// @concept: [[ManifestEditor]]
// @concept: [[SecurityFirstPattern]]

/**
 * ENDPOINT: MANIFEST LIST BLOCKS
 *
 * GET /api/manifestListBlocks -- the schema-block catalog for the Manifest Editor
 * picker. Admin/super only. Delegates to the manifest-list-blocks access point,
 * which shells out to educoreForge's `manifestEditor -listBlocks`.
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
		// STEP 2: LIST BLOCKS VIA ACCESS POINT

		taskList.push((args, next) => {
			const { accessPointsDotD } = args;

			const localCallback = (err, result) => {
				if (err) {
					next(`Block catalog listing failed: ${err}`, args);
					return;
				}
				next('', { ...args, result });
			};

			accessPointsDotD['manifest-list-blocks']({}, localCallback);
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
				xLog.error(`Manifest block catalog error (${errorId}): ${err}`);
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
	const thisEndpointName = 'manifestListBlocks';
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
