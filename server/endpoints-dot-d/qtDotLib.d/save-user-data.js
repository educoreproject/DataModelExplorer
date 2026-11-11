#!/usr/bin/env node
'use strict';
// @concept: [[UserDataPersistence]]
// @concept: [[SecurityFirstPattern]]

// POST /api/saveUserData — a signed-in user saves their OWN profile (WORKORDER-userSqlAndSaveHole-111026).
// The record is keyed on the TOKEN's refId, never the body's. The body may carry only the properties in
// lib/user-profile-rules.json selfEditablePropertyList (and its own refId, and the current password beside a new one);
// anything else is refused by name, never dropped: 403 notOwnRecord, 400 propertyNotSelfEditable, and so on, answered
// as JSON { refusalName, reason }. On success the token is re-signed from the saved record, which carries no password.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, ''); //this just seems to come in handy a lot
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();
const { selfSaveRefusalOf, selfSaveRecordOf, refusalText } = require('../../lib/user-profile-rules');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({
	dotD: endpointsDotD,
	passThroughParameters,
}) {
	// ================================================================================
	// INITIALIZATION
	

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(moduleName); //moduleName is closure

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
		// TASKLIST ITEM TEMPLATE

		taskList.push((args, next) =>
			args.permissionValidator(
				xReq.appValueGetter('authclaims'),
				{ showDetails: false },
				forwardArgs({ next, args }),
			),
		);

		// --------------------------------------------------------------------------------
		// THE SIGNED-IN USER'S OWN RECORD, AND ONLY THE SELF-EDITABLE PROPERTIES

		taskList.push((args, next) => {
			const signedInUserRefId = xReq.appValueGetter('authclaims').qtGetSurePath('user.refId');
			const requestBody = xReq.body || {};

			const refusal = selfSaveRefusalOf({ requestBody, signedInUserRefId });
			if (refusal) {
				next(refusalText(refusal), { ...args, refusal });
				return;
			}

			next('', { ...args, saveRecord: selfSaveRecordOf({ requestBody, signedInUserRefId }) });
		});

		// --------------------------------------------------------------------------------
		// TASKLIST ITEM TEMPLATE

		taskList.push((args, next) => {
			const { accessPointsDotD, saveRecord } = args;

			const localCallback = (err, { user, refusal } = {}) => {
				if (err) {
					next(`${err}  (Q11120246254062540030)`, { ...args, refusal });
					return;
				}
				next('', { ...args, user });
			};
			accessPointsDotD['user-save-data'](saveRecord, localCallback);
		});

		// --------------------------------------------------------------------------------
		// TASKLIST ITEM TEMPLATE

		taskList.push((args, next) => {
			const { user, accessTokenHeaderTools } = args;

			const localCallback = (err) => {
				if (err) {
					next(`${err}  (Q14620245330253302478)`, args);
					return;
				}
				next('', args);
			};

			//this is the only endpoint that allows the role, firstTime, and it always deletes it.
			accessTokenHeaderTools.refreshauthtoken(
				{
					xReq,
					xRes,
					// after a password change, refreshauthtoken signs this token no earlier than the account's new cutoff (the
					// next whole second), so it survives while every older token, even one from this same second, is refused
					payloadValues: {
						source: 'save-user-data',
						user,
					},
				},
				localCallback,
			);
		});

		// --------------------------------------------------------------------------------
		// INIT AND EXECUTE THE PIPELINE

		const initialData = {
			accessPointsDotD,
			permissionValidator,
			accessTokenHeaderTools,
		};
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			const { user, refusal } = args;

			if (refusal) {
				xRes.status(refusal.httpStatus).send({ refusalName: refusal.refusalName, reason: refusal.reason });
				return;
			}

			if (err) {
				xRes.status(500).send(`${err.toString()}`);
				return;
			}

			xRes.send([{ refID: user.refId }]);
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
		accessTokenHeaderTools,
	}) => {
		expressApp[method](routePath, serviceFunction(permissionValidator)); //uaw expressApp instead of dotD.library
		endpointsDotD.logList.push(name);
	};

	// ================================================================================
	// Do the constructing

	const method = 'post';
	const thisEndpointName = 'saveUserData';
	const routePath = `${routingPrefix}${thisEndpointName}`;
	const name = routePath;

	const permissionValidator = accessTokenHeaderTools.getValidator([
		'user',
		'client',
		'admin',
		'super',
		'firstTime',
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
