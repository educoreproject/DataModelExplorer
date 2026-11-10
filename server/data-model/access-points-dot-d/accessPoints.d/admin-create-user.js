#!/usr/bin/env node
'use strict';
// @concept: [[UserCrudAdmin]]
// @concept: [[PasswordHashing]]
// @concept: [[AccessPointPattern]]

/**
 * ACCESS POINT: ADMIN USER CREATION
 * 
 * This access point handles administrative user creation with secure password hashing
 * and validation. Only administrators can create new users.
 * 
 * BUSINESS LOGIC: Creates new users with validated data and proper security measures:
 * - Password strength validation using NIST guidelines
 * - Automatic password hashing before database storage
 * - Role validation and assignment
 * - Unique username enforcement
 * 
 * SECURITY FEATURES:
 * - All passwords are hashed using PBKDF2 with salt
 * - Input validation and sanitization
 * - Role-based access control
 * - No plaintext password storage
 */

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();
const { usernameRefusalOf, textIdentifierRefusalOf, valueLengthRefusalOf, refusalText } = require('../../../lib/user-profile-rules');

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

			// a non-text username or password is refused by name before the checks below call .trim() on it (review N-3:
			// an object username threw 'userData.username?.trim is not a function'). An absent one is left to them.
			const presentCredentialByName = Object.fromEntries(Object.entries({ username: userData.username, password: userData.password }).filter(([, credentialText]) => credentialText !== undefined));
			const credentialRefusal = textIdentifierRefusalOf(presentCredentialByName);
			if (credentialRefusal) {
				next(`Validation failed: ${refusalText(credentialRefusal)}`, args);
				return;
			}

			// every limited property within its limit, refused by name before any save (review SF-7: an over-long value
			// re-signed into every token header locked the account)
			const lengthRefusal = valueLengthRefusalOf(userData);
			if (lengthRefusal) {
				errors.push(refusalText(lengthRefusal));
			}

			// Required fields validation
			if (!userData.username?.trim()) {
				errors.push('Username is required');
			}
			if (!userData.password) {
				errors.push('Password is required');
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

			// Password strength validation
			if (userData.password) {
				const passwordValidation = validatePasswordStrength(userData.password);
				if (!passwordValidation.isValid) {
					errors.push(...passwordValidation.errors);
				}
			}

			// Role validation
			// 'rater': a CEDS Rater account (lane RATER, 2026-10-14), made by the rater-admin access point
			const validRoles = ['user', 'admin', 'super', 'rater'];
			if (userData.role && !validRoles.includes(userData.role)) {
				errors.push('Invalid role specified');
			}

			if (errors.length > 0) {
				next(`Validation failed: ${errors.join(', ')}`, args);
				return;
			}

			// Set default role if not specified
			const validatedUserData = {
				...userData,
				role: userData.role || 'user',
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
		// PIPELINE STAGE 3: CHECK FOR EXISTING USERNAME

		taskList.push((args, next) => {
			const { validatedUserData, userTable, dataMapping } = args;

			const localCallback = (err, existingUsers = []) => {
				if (err) {
					next(err, args);
					return;
				}

				if (existingUsers.length > 0) {
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
		// PIPELINE STAGE 4: CREATE NEW USER

		taskList.push((args, next) => {
			const { validatedUserData, userTable } = args;

			const localCallback = (err, refId) => {
				if (err) {
					next(`User creation failed: ${err}`, args);
					return;
				}
				next('', { ...args, refId });
			};

			// The mapper will automatically hash the password during 'reverse' transformation
			const dbData = dataMapping['profile-user'].map(validatedUserData, 'reverse');

			// saveObject inserts the row and makes its refId; this project's saveObject doubles apostrophes, so the same
			// values are then written once more, exactly, by an UPDATE through updateByRefId (review SF-6)
			userTable.saveObject(dbData, { suppressStatementLog: true }, (saveError, refId) => {
				if (saveError) {
					localCallback(saveError, refId);
					return;
				}
				userTable.runStatement(dataMapping['profile-user'].getSql('updateByRefId', { ...dbData, refId }), { suppressStatementLog: true }, (exactWriteError) => localCallback(exactWriteError, refId));
			});
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 5: RETRIEVE CREATED USER (WITHOUT PASSWORD)

		taskList.push((args, next) => {
			const { refId, userTable } = args;

			const localCallback = (err, users = []) => {
				if (err) {
					next(err, args);
					return;
				}

				const user = users.qtLast();
				// Transform back to application format (automatically removes password)
				const userForClient = dataMapping['profile-user'].map(user, 'forward');
				
				next('', { ...args, createdUser: userForClient });
			};

			const query = dataMapping['profile-user'].getSql('byRefId', { refId });
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

			const { createdUser } = args;
			callback('', { user: createdUser });
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