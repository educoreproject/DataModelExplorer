#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]
// @concept: [[OidcIdentityProvider]]

// ENDPOINT: OAUTH ADMIN — AUDIT LOG (dmeMcpOAuth 4.1)
// GET /api/oauthAdminAudit?event=&userRef=&clientId=&sinceMs=&untilMs=&limit=
// Reads the append-only authAuditLog with optional filters. STRICT validator +
// audience firewall.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const makeRefId = require('../../lib/make-ref-id');
const makeValidators = require('../../lib/oauth-token-validators');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	const { xLog, getConfig } = process.global;
	const { expressApp, accessPointsDotD, routingPrefix } = passThroughParameters;

	const mcpAudience = (getConfig('oauth-server') || {}).mcpResource;
	const { makeStrictValidator } = makeValidators();

	const serviceFunction = (permissionValidator) => (xReq, xRes) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) =>
			args.permissionValidator(
				xReq.appValueGetter('authclaims'),
				{ mcpAudience },
				forwardArgs({ next, args }),
			),
		);

		taskList.push((args, next) => {
			const query = xReq.qtGetSurePath('query', {});
			next('', {
				...args,
				requestData: {
					action: 'auditLog',
					event: query.event || undefined,
					userRef: query.userRef || undefined,
					clientId: query.clientId || undefined,
					sinceMs: query.sinceMs || undefined,
					untilMs: query.untilMs || undefined,
					limit: query.limit || undefined,
				},
			});
		});

		taskList.push((args, next) => {
			accessPointsDotD['oauth-admin'](
				args.requestData,
				(err, result) => (err ? next(err, args) : next('', { ...args, result })),
			);
		});

		pipeRunner(taskList.getList(), { accessPointsDotD, permissionValidator }, (err, args) => {
			if (err) {
				const errorId = makeRefId(12);
				xLog.error(`oauthAdminAudit error (${errorId}): ${err}`);
				xRes.status(err.toString().startsWith('Unauthorized') ? 401 : 400).send(`${err.toString()} (${errorId})`);
				return;
			}
			const { result } = args;
			xRes.send(Array.isArray(result) ? result : [result]);
		});
	};

	const method = 'get';
	const routePath = `${routingPrefix}oauthAdminAudit`;
	expressApp[method](routePath, serviceFunction(makeStrictValidator(['admin', 'super'])));
	endpointsDotD.logList.push(routePath);
	return {};
};

module.exports = moduleFunction;
