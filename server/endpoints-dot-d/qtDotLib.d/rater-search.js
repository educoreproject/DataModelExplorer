#!/usr/bin/env node
'use strict';

// ENDPOINT: /api/raterSearch — CEDS Rater (lane RATER, 2026-10-14). POST { elementStableId, searchMode: words|meaning|cedsId, queryText }.
// Roles: ['rater']. The shape (permission first, the access point, arrays back, refusals by name) is
// lib/rater-endpoint-registrar.js; this file names the route, the roles and how the request is read.

const { registerRaterEndpoint } = require('../../lib/rater-endpoint-registrar');

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	registerRaterEndpoint({
		passThroughParameters,
		endpointsDotD,
		thisEndpointName: 'raterSearch',
		accessPointName: 'rater-search',
		roleList: ['rater'],
		requestOf: ({ requestBody, authclaims }) => ({ raterUserName: authclaims.user.username, elementStableId: requestBody.elementStableId, searchMode: requestBody.searchMode, queryText: requestBody.queryText }),
	});
	return {};
};

module.exports = moduleFunction;
