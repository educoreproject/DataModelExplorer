#!/usr/bin/env node
'use strict';
// @concept: [[SchemaVerifier]]
// @concept: [[SecurityFirstPattern]]

// schemaEquivalents — POST /api/schemaEquivalents { wordList } for the Schema Verifier page (campaign P4b, A11 /
// W-E-8). Logged-in users only. The browser sends WORDS, never Cypher: the query is the schema-equivalents mapper's,
// run on the golden read-only handle. A refusal (an empty word list, a graph lacking a required label) is answered
// 400 with its text, so the page shows why instead of an empty result.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const makeRefId = require('../../lib/make-ref-id');
const { pipeRunner, taskListPlus, forwardArgs } = new require('qtools-asynchronous-pipe-plus')();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { expressApp, accessTokenHeaderTools, accessPointsDotD, routingPrefix } = passThroughParameters;

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (permissionValidator) => (xReq, xRes, next) => {
		const taskList = new taskListPlus();

		// STEP 1: PERMISSION VALIDATION (a failure here is answered 401)
		taskList.push((args, next) =>
			args.permissionValidator(xReq.appValueGetter('authclaims'), forwardArgs({ next, args })),
		);
		taskList.push((args, next) => next('', { ...args, permissionPassed: true }));

		// STEP 2: THE SCHEMA-EQUIVALENTS ACCESS POINT
		taskList.push((args, next) => {
			args.accessPointsDotD['schema-equivalents'](args.requestBody, (accessPointError, equivalentRowList) => {
				if (accessPointError) {
					next(accessPointError, args);
					return;
				}
				next('', { ...args, equivalentRowList });
			});
		});

		const initialData = {
			accessPointsDotD,
			permissionValidator,
			requestBody: xReq.qtGetSurePath('body', {}),
			permissionPassed: false,
		};

		pipeRunner(taskList.getList(), initialData, (pipeError, args) => {
			if (pipeError) {
				const errorId = makeRefId(12);
				xLog.error(`${moduleName} error (${errorId}): ${pipeError}`);
				xRes.status(args && args.permissionPassed ? 400 : 401).send(`${pipeError.toString()} (${errorId})`);
				return;
			}
			xRes.send(args.equivalentRowList);
		});
	};

	// ================================================================================
	// ENDPOINT REGISTRATION

	const method = 'post';
	const routePath = `${routingPrefix}${moduleName}`;
	const permissionValidator = accessTokenHeaderTools.getValidator(['user', 'client', 'admin']);

	expressApp[method](routePath, serviceFunction(permissionValidator));
	endpointsDotD.logList.push(routePath);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
