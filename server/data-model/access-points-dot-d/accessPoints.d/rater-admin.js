#!/usr/bin/env node
'use strict';

// ACCESS POINT: rater-admin — CEDS Rater admin actions (lane RATER, 2026-10-14): list, add, surveyChange, passwordReset,
// download, remove (rater-tool-admin.js, a registry). Uses the main users table through admin-create-user and the
// profile-user mapper, and the rater store. Refuses by name when the rater tool cannot run on this server.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const { makeRaterToolService } = require('../../lib/rater-tool/rater-tool-service');
const { makeRaterToolAdmin } = require('../../lib/rater-tool/rater-tool-admin');

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { raterToolAccess, dataMapping, sqlDb, accessPointsDotD } = passThroughParameters;
	let raterToolAdmin = null;

	const serviceFunction = (adminRequest, callback) => {
		if (!raterToolAccess || raterToolAccess.setupRefusal) {
			callback('', { refusal: raterToolAccess ? raterToolAccess.setupRefusal : { refusalName: 'raterToolNotConfigured', refusalText: 'CEDS Rater: the rater tool was not set up on this server.' } });
			return;
		}
		raterToolAdmin = raterToolAdmin || makeRaterToolAdmin({ raterToolAccess, dataMapping, sqlDb, accessPointsDotD, raterService: makeRaterToolService({ raterToolAccess, dataMapping }) });
		raterToolAdmin.runAdminAction({ adminRequest }, callback);
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);
	return {};
};

module.exports = moduleFunction;
