#!/usr/bin/env node
'use strict';
// @concept: [[ManifestEditor]]
// @concept: [[SecurityFirstPattern]]

/**
 * ENDPOINT: MANIFEST COMBINE
 *
 * POST /api/manifestCombine  body { base?, set:[blockId,...], label?, note? }
 * Derives a NEW immutable manifest from a block set (+ optional base). Admin/super only.
 * On a missing block, combine errors once with the FULL missing-blockId list; that text
 * is surfaced to the client via the 400 body.
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

		// STEP 1: PERMISSION VALIDATION (SECURITY FIRST)
		taskList.push((args, next) =>
			args.permissionValidator(
				xReq.appValueGetter('authclaims'),
				{ showDetails: false },
				forwardArgs({ next, args }),
			),
		);

		// STEP 2: EXTRACT REQUEST BODY
		taskList.push((args, next) => {
			const body = xReq.qtGetSurePath('body', {});
			const requestData = {
				base: body.base,
				set: Array.isArray(body.set) ? body.set : [],
				label: body.label,
				note: body.note,
			};
			if (!requestData.set.length) {
				next('A non-empty block set is required', args);
				return;
			}
			next('', { ...args, requestData });
		});

		// STEP 3: COMBINE VIA ACCESS POINT
		taskList.push((args, next) => {
			const { accessPointsDotD, requestData } = args;
			const localCallback = (err, result) => {
				if (err) {
					next(`Manifest combine failed: ${err}`, args);
					return;
				}
				next('', { ...args, result });
			};
			accessPointsDotD['manifest-combine'](requestData, localCallback);
		});

		const initialData = {
			accessPointsDotD,
			permissionValidator,
			accessTokenHeaderTools,
		};
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				const errorId = makeRefId(12);
				xLog.error(`Manifest combine error (${errorId}): ${err}`);
				xRes.status(400).send(`${err.toString()} (${errorId})`);
				return;
			}
			const { result } = args;
			xRes.send(Array.isArray(result) ? result : [result]);
		});
	};

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

	const method = 'post';
	const thisEndpointName = 'manifestCombine';
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
