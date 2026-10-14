#!/usr/bin/env node
'use strict';

// ENDPOINT: /api/raterAnswerSave — CEDS Rater (lane RATER, 2026-10-14). POST { elementStableId, answerKind, bestCedsTupleId, sameCedsTupleIdList, addedCardList, note, searchesTyped, secondsOnItem }.
// Roles: ['rater']. The shape (permission first, the access point, arrays back, refusals by name) is
// lib/rater-endpoint-registrar.js; this file names the route, the roles and how the request is read.

const { registerRaterEndpoint } = require('../../lib/rater-endpoint-registrar');

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	registerRaterEndpoint({
		passThroughParameters,
		endpointsDotD,
		thisEndpointName: 'raterAnswerSave',
		accessPointName: 'rater-answer-save',
		roleList: ['rater'],
		requestOf: ({ requestBody, authclaims }) => ({ raterUserName: authclaims.user.username, answerSubmission: requestBody }),
	});
	return {};
};

module.exports = moduleFunction;
