#!/usr/bin/env node
'use strict';
// @concept: [[ManifestEditor]]
// @concept: [[MapperPattern]]
// @concept: [[CollaborationAccess]]

/**
 * MAPPER: MANIFEST-USER ASSIGNMENT
 *
 * The manifest -> users collaboration assignment (one manifest, many users). This is an
 * educore-side join table -- educore owns it; educoreForge's forgeStore is untouched.
 * `manifestKey` is a soft string reference to an educoreForge manifest (NOT an FK);
 * `userId` is an educore user's refId. The assignment is MUTABLE side-metadata: adding or
 * removing a collaborator is an ordinary write and never mints a new manifest.
 *
 * Follows the profile-user.js mapper template: field mapping + named getSql queries with
 * <!token!> substitution via safeSql (injection-safe).
 */

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const qt = require('qtools-functional-library');

//START OF moduleFunction() ============================================================

const moduleFunction =
	({ moduleName }) =>
	({ baseMappingProcess, pwHash, hashPassword, verifyPassword, validatePasswordStrength, safeSql }) => {
		process.global = process.global ? process.global : {};
		const xLog = process.global.xLog;

		// ================================================================================
		// FIELD MAPPING CONFIGURATION

		const inputNameMapping = {
			['refId']: 'refId',
			['manifestKey']: 'manifestKey',
			['userId']: 'userId',
		}; // {reverseName:'forwardName'}, result name XXX forces removed from output

		const basicMapper = baseMappingProcess(inputNameMapping);

		// ================================================================================
		// RECORD-LEVEL TRANSFORMATION (straight field mapping; no special logic)

		const recordMapper = (inObj, direction = 'forward') => {
			const outObj = basicMapper(inObj, { direction });
			delete outObj.XXX;
			return outObj;
		};

		const mapper = (inData, direction = 'forward') => {
			if (Array.isArray(inData)) {
				return inData.map((inObj) => recordMapper(inObj, direction));
			}
			return recordMapper(inData, direction);
		};

		// ================================================================================
		// NAMED SQL QUERY GENERATION (safeSql injection protection)

		const getSql = (queryName, replaceObject = {}) => {
			const queries = {
				// All collaborators assigned to one manifest.
				'byManifest': `
					SELECT refId, manifestKey, userId, createdAt
					FROM <!tableName!>
					WHERE manifestKey = <!manifestKey!>
				`,
				// Existence check for a specific (manifest, user) -- dedupe before insert.
				'byManifestAndUser': `
					SELECT refId, manifestKey, userId, createdAt
					FROM <!tableName!>
					WHERE manifestKey = <!manifestKey!> AND userId = <!userId!>
				`,
				// Remove one collaborator from one manifest.
				'deleteByManifestAndUser': `
					DELETE FROM <!tableName!>
					WHERE manifestKey = <!manifestKey!> AND userId = <!userId!>
				`,
			};

			if (!queries[queryName]) {
				xLog.error(`Unknown query name '${queryName}' in ${moduleName}`);
				return undefined;
			}

			return safeSql(queries[queryName], replaceObject);
		};

		return {
			map: mapper,
			getSql,
		};
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction(moduleName);
