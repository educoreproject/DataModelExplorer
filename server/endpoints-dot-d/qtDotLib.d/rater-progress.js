#!/usr/bin/env node
'use strict';

// ENDPOINT: /api/raterProgress — CEDS Rater (lane RATER, 2026-10-14). POST {} — the rater's progress.
// Roles: ['rater']. The shape (permission first, the access point, arrays back, refusals by name) is
// lib/rater-endpoint-registrar.js; this file names the route, the roles and how the request is read.

const { registerRaterEndpoint } = require('../../lib/rater-endpoint-registrar');

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	registerRaterEndpoint({
		passThroughParameters,
		endpointsDotD,
		thisEndpointName: 'raterProgress',
		accessPointName: 'rater-progress',
		roleList: ['rater'],
		requestOf: ({ requestBody, authclaims }) => ({ raterUserName: authclaims.user.username }),
	});
	return {};
};

module.exports = moduleFunction;
