#!/usr/bin/env node
'use strict';
// @concept: [[UserDataPersistence]]
// @concept: [[AccessPointPattern]]

// user-save-data — saves a signed-in user's OWN profile record. Called only by the saveUserData endpoint, which has
// already keyed the record on the token's refId and refused every property outside lib/user-profile-rules.json's
// selfEditablePropertyList (WORKORDER-userSqlAndSaveHole-111026).
//
//   serviceFunction({ refId, ...selfEditableProperties }, callback(errText, { user, refusal }))
//     user    the saved record as the application sees it (profile-user 'forward': no password hash), for the token
//     refusal on a refused save, the named refusal ({ refusalName, httpStatus, reason }); errText is its text

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, ''); //this just seems to come in handy a lot
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const os = require('os');
const { textIdentifierRefusalOf, refusalOf, refusalText, hasNewPassword, isBlank, currentPasswordPropertyName } = require('../../../lib/user-profile-rules');

// accessRevokedAfter is epoch SECONDS, the unit of a JWT's iat (the MCP bearer gate and hasValidToken both compare them)
const MILLISECONDS_PER_SECOND = 1000;

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	// ================================================================================
	// INITIALIZATION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(moduleName); //moduleName is closure

	const { sqlDb, hxAccess, dataMapping } = passThroughParameters;
	const { validatePasswordStrength, verifyPassword } = dataMapping['profile-user'];

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (xQuery = {}, callback) => {
		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// REFUSE A NON-TEXT refId OR A WEAK NEW PASSWORD, BY NAME

		taskList.push((args, next) => {
			const { xQuery } = args;

			const identifierRefusal = textIdentifierRefusalOf({ refId: xQuery.refId });
			if (identifierRefusal) {
				next(refusalText(identifierRefusal), { ...args, refusal: identifierRefusal });
				return;
			}

			// '' or null means 'unchanged' (profile-user drops it); anything else is a new password and meets the rule
			if (hasNewPassword(xQuery)) {
				const passwordValidation = validatePasswordStrength(String(xQuery.password));
				if (!passwordValidation.isValid) {
					const passwordRefusal = refusalOf('passwordNotAccepted', { detailList: passwordValidation.errors });
					next(refusalText(passwordRefusal), { ...args, refusal: passwordRefusal });
					return;
				}
			}

			next('', args);
		});

		// --------------------------------------------------------------------------------
		// TASKLIST ITEM TEMPLATE

		taskList.push((args, next) =>
			args.sqlDb.getTable('users', mergeArgs(args, next, 'userTable')),
		);

		// --------------------------------------------------------------------------------
		// SECURITY: DERIVE ROLE FROM THE STORED RECORD, NEVER FROM THE REQUEST
		//
		// This self-service endpoint must not be usable to escalate privilege.
		// The role written to the database is taken from the target user's
		// currently-stored role (looked up by refId), with 'firstTime' removed.
		// Any role supplied in the request is discarded. The only role change
		// possible here is the legacy first-time -> normal transition (dropping
		// 'firstTime'); all other role changes go through the admin tools
		// (admin-update-user). A refId with no stored record is refused: a save
		// here never creates a user.

		taskList.push((args, next) => {
			const { xQuery, userTable, dataMapping } = args;

			const localCallback = (err, users = []) => {
				if (err) {
					next(err, args);
					return;
				}

				const storedUser = users.qtLast();
				if (!storedUser) {
					const noUserRefusal = refusalOf('noSuchUser');
					next(refusalText(noUserRefusal), { ...args, refusal: noUserRefusal });
					return;
				}

				// a new password is saved only when the current one is given and matches the stored hash: a stolen
				// session must not be able to change the password. The current password is never saved.
				if (hasNewPassword(xQuery)) {
					const currentPasswordText = xQuery[currentPasswordPropertyName];
					if (isBlank(currentPasswordText)) {
						const requiredRefusal = refusalOf('currentPasswordRequired');
						next(refusalText(requiredRefusal), { ...args, refusal: requiredRefusal });
						return;
					}
					if (!storedUser.password || !verifyPassword(String(currentPasswordText), storedUser.password)) {
						const wrongRefusal = refusalOf('currentPasswordWrong');
						next(refusalText(wrongRefusal), { ...args, refusal: wrongRefusal });
						return;
					}
				}

				const revisedRole = (storedUser.role || '')
					.split(/,/)
					.filter((item) => item && item != 'firstTime')
					.join(',');

				// the current password is verified above and never saved; profile-user 'reverse' hashes the new one (it hashes
				// anything that is not already in password-hash's own stored form, colon or no colon)
				const { [currentPasswordPropertyName]: verifiedCurrentPassword, ...savedProperties } = xQuery;
				const safeXQuery = { ...savedProperties, role: revisedRole };

				next('', { ...args, xQuery: safeXQuery, isPasswordChange: hasNewPassword(savedProperties) });
			};

			const query = dataMapping['profile-user'].getSql('byRefId', { refId: xQuery.refId });

			userTable.getData(query, { suppressStatementLog: true }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// SAVE ('reverse' is application -> database: it hashes a new password; 'forward' deleted it, so a profile
		// password change answered SAVED and changed nothing). An UPDATE by refId through profile-user's updateByRefId,
		// not saveObject: this project's saveObject doubles apostrophes before escaping them again (review SF-6).

		taskList.push((args, next) => {
			const { xQuery, userTable } = args;

			const localCallback = (err) => {
				next(err, { ...args, refId: xQuery.refId });
			};

			const dbData = dataMapping['profile-user'].map(xQuery, 'reverse');

			userTable.runStatement(dataMapping['profile-user'].getSql('updateByRefId', dbData), { suppressStatementLog: true }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// A PASSWORD CHANGE SIGNS OUT EVERY OTHER SESSION (review SF-4, ROMANTIC_PARASOL ruling 2026-11-10)
		//
		// users.accessRevokedAfter (epoch seconds) is the cutoff hasValidToken applies to website tokens and the MCP
		// bearer gate applies to OAuth access tokens: a token issued before it is refused. AI-connector sessions of this
		// user are signed out too, deliberately. The token the endpoint signs after this stage is issued at or after the
		// cutoff (iat >= cutoff passes), so the changer stays signed in. saveObject adds the column when a table lacks it;
		// the value is digits, so its apostrophe handling does not matter.

		taskList.push((args, next) => {
			const { isPasswordChange, refId, userTable } = args;
			if (!isPasswordChange) {
				next('', args);
				return;
			}
			const accessRevokedAfterSeconds = Math.floor(Date.now() / MILLISECONDS_PER_SECOND);
			userTable.saveObject({ refId, accessRevokedAfter: String(accessRevokedAfterSeconds) }, { suppressStatementLog: true }, (stampError) => next(stampError, args));
		});

		// --------------------------------------------------------------------------------
		// READ IT BACK, AS THE APPLICATION SEES IT (no password hash: this record is signed into the token)

		taskList.push((args, next) => {
			const { refId, userTable, dataMapping } = args;

			const localCallback = (err, users = []) => {
				if (err) {
					next(err, args);
					return;
				}
				const user = dataMapping['profile-user'].map(users.qtLast(), 'forward');
				next('', { ...args, user });
			};

			const query = dataMapping['profile-user'].getSql('byRefId', { refId });

			userTable.getData(query, { suppressStatementLog: true }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// INIT AND EXECUTE THE PIPELINE

		const initialData = { xQuery, sqlDb, hxAccess, dataMapping };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			const { user, refusal } = args;
			callback(err, { user, refusal });
		});
	};

	// ================================================================================
	// Access Point Constructor

	const addEndpoint = ({ name, method, serviceFunction, dotD }) => {
		dotD.logList.push(name);
		dotD.library.add(name, serviceFunction);
	};

	// ================================================================================
	// Do the constructing

	const name = moduleName;

	addEndpoint({ name, serviceFunction, dotD });

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
