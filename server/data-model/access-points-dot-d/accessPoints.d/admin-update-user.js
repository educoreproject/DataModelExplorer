#!/usr/bin/env node
'use strict';
// @concept: [[UserCrudAdmin]]
// @concept: [[PasswordHashing]]
// @concept: [[AccessPointPattern]]

/**
 * ACCESS POINT: ADMIN USER UPDATE
 * 
 * This access point handles administrative user updates with secure password hashing
 * and validation. Only administrators can update users.
 * 
 * BUSINESS LOGIC: Updates existing users with validated data:
 * - Optional password strength validation (only if password provided)
 * - Automatic password hashing before database storage (if password provided)
 * - Username uniqueness validation (excluding current user)
 * - Role validation and assignment
 */

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();
const { usernameRefusalOf, textIdentifierRefusalOf, valueLengthRefusalOf, refusalOf, refusalText } = require('../../../lib/user-profile-rules');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	// ================================================================================
	// INITIALIZATION AND DEPENDENCY INJECTION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(moduleName);

	const { sqlDb, hxAccess, dataMapping } = passThroughParameters;
	const { validatePasswordStrength } = dataMapping['profile-user'];

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (userData, callback) => {
		if (typeof userData == 'function') {
			callback = userData;
			userData = {};
		}

		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 1: INPUT VALIDATION

		taskList.push((args, next) => {
			const { userData } = args;
			const errors = [];

			// refId and username reach SQL; a non-text one (an object escapes to `column` = value) is refused before any check.
			// An absent one is left to the required-field checks below.
			const presentIdentifierByName = Object.fromEntries(Object.entries({ refId: userData.refId, username: userData.username }).filter(([, identifierText]) => identifierText !== undefined));
			const identifierRefusal = textIdentifierRefusalOf(presentIdentifierByName);
			if (identifierRefusal) {
				next(`Validation failed: ${refusalText(identifierRefusal)}`, args);
				return;
			}

			// every limited property within its limit, refused by name before any save (review SF-7: an over-long value
			// re-signed into every token header locked the account)
			const lengthRefusal = valueLengthRefusalOf(userData);
			if (lengthRefusal) {
				errors.push(refusalText(lengthRefusal));
			}

			// Required fields validation
			if (!userData.refId?.trim()) {
				errors.push('User ID (refId) is required for updates');
			}
			if (!userData.username?.trim()) {
				errors.push('Username is required');
			}
			if (!userData.first?.trim()) {
				errors.push('First name is required');
			}
			if (!userData.last?.trim()) {
				errors.push('Last name is required');
			}
			if (!userData.emailAdr?.trim()) {
				errors.push('Email address is required');
			}

			// Email format validation
			if (userData.emailAdr && !userData.emailAdr.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
				errors.push('Invalid email address format');
			}

			// Username format validation: the rule and its refusal are in lib/user-profile-rules.json (usernamePatternText)
			const usernameRefusal = userData.username ? usernameRefusalOf(userData.username) : '';
			if (usernameRefusal) {
				errors.push(refusalText(usernameRefusal));
			}

			// Password strength validation (only if password provided)
			if (userData.password) {
				const passwordValidation = validatePasswordStrength(userData.password);
				if (!passwordValidation.isValid) {
					errors.push(...passwordValidation.errors);
				}
			}

			// Role validation
			const validRoles = ['user', 'admin', 'super'];
			if (userData.role && !validRoles.includes(userData.role)) {
				errors.push('Invalid role specified');
			}

			if (errors.length > 0) {
				next(`Validation failed: ${errors.join(', ')}`, args);
				return;
			}

			// Sanitize and prepare data
			const validatedUserData = {
				...userData,
				username: userData.username.trim().toLowerCase(),
				first: userData.first.trim(),
				last: userData.last.trim(),
				emailAdr: userData.emailAdr.trim().toLowerCase(),
				phone: userData.phone?.trim() || ''
			};

			next('', { ...args, validatedUserData });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: DATABASE TABLE ACQUISITION

		taskList.push((args, next) =>
			args.sqlDb.getTable('users', mergeArgs(args, next, 'userTable')),
		);

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 3: CHECK FOR EXISTING USERNAME (excluding current user)

		taskList.push((args, next) => {
			const { validatedUserData, userTable, dataMapping } = args;

			const localCallback = (err, existingUsers = []) => {
				if (err) {
					next(err, args);
					return;
				}

				// Check if username exists for a different user (not the current one being updated)
				const duplicateUser = existingUsers.find(user => user.refId !== validatedUserData.refId);
				if (duplicateUser) {
					next('Username already exists', args);
					return;
				}

				next('', args);
			};

			const query = dataMapping['profile-user'].getSql('byUsername', { 
				username: validatedUserData.username 
			});

			userTable.getData(query, { suppressStatementLog: true, noTableNameOk: true }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 4: UPDATE USER

		taskList.push((args, next) => {
			const { validatedUserData, userTable } = args;

			const localCallback = (err) => {
				if (err) {
					next(`User update failed: ${err}`, args);
					return;
				}
				next('', { ...args, refId: validatedUserData.refId });
			};

			// The mapper will automatically hash the password during 'reverse' transformation (if provided). An UPDATE by
			// refId, not saveObject: it writes apostrophes once (review SF-6) and never inserts a row for an unknown refId
			// (saveObject on sqlite-instance 11 did); the read-back below then refuses it as noSuchUser.
			const dbData = dataMapping['profile-user'].map(validatedUserData, 'reverse');

			userTable.runStatement(dataMapping['profile-user'].getSql('updateByRefId', dbData), { suppressStatementLog: true }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 5: RETRIEVE UPDATED USER (WITHOUT PASSWORD)

		taskList.push((args, next) => {
			const { validatedUserData, userTable } = args;

			const localCallback = (err, users = []) => {
				if (err) {
					next(err, args);
					return;
				}

				const user = users.qtLast();
				// an update of a refId with no record changes nothing; say so by name (it used to crash mapping undefined
				// here once the refId was escaped, and before that the interpolated query matched other rows)
				if (!user) {
					next(`User update failed: ${refusalText(refusalOf('noSuchUser'))}`, args);
					return;
				}
				// Transform back to application format (automatically removes password)
				const userForClient = dataMapping['profile-user'].map(user, 'forward');

				next('', { ...args, updatedUser: userForClient });
			};

			const query = dataMapping['profile-user'].getSql('byRefId', { refId: validatedUserData.refId });
			userTable.getData(query, { suppressStatementLog: true }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// EXECUTE PIPELINE

		const initialData = { userData, sqlDb, hxAccess, dataMapping };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}

			const { updatedUser } = args;
			callback('', { user: updatedUser });
		});
	};

	// ================================================================================
	// ACCESS POINT REGISTRATION

	const addEndpoint = ({ name, serviceFunction, dotD }) => {
		dotD.logList.push(name);
		dotD.library.add(name, serviceFunction);
	};

	const name = moduleName;
	addEndpoint({ name, serviceFunction, dotD });

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;