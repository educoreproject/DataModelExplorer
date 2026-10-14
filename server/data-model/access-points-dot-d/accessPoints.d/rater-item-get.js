#!/usr/bin/env node
'use strict';

// ACCESS POINT: rater-item-get — CEDS Rater (lane RATER, 2026-10-14): the rater's item N: the element, its candidate cards in this rater's shuffle, the saved answer, progress.
// A thin wrapper: the work is rater-tool-service.js getItem(). Answers callback('', result) or callback('', { refusal });
// an errText only when the tool itself failed. When the rater tool cannot run on this server (raterToolAccess.setupRefusal)
// every call is refused with that reason, by name.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const { makeRaterToolService } = require('../../lib/rater-tool/rater-tool-service');

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { raterToolAccess, dataMapping } = passThroughParameters;
	let raterToolService = null;

	const serviceFunction = (raterRequest, callback) => {
		if (!raterToolAccess || raterToolAccess.setupRefusal) {
			callback('', { refusal: raterToolAccess ? raterToolAccess.setupRefusal : { refusalName: 'raterToolNotConfigured', refusalText: 'CEDS Rater: the rater tool was not set up on this server.' } });
			return;
		}
		raterToolService = raterToolService || makeRaterToolService({ raterToolAccess, dataMapping });
		raterToolService.getItem(raterRequest, callback);
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);
	return {};
};

module.exports = moduleFunction;
