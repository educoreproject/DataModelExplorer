#!/usr/bin/env node
'use strict';

// ENDPOINT: /api/raterItemGet — CEDS Rater (lane RATER, 2026-10-14). POST { itemNumber } — the rater's item N.
// Roles: ['rater']. The shape (permission first, the access point, arrays back, refusals by name) is
// lib/rater-endpoint-registrar.js; this file names the route, the roles and how the request is read.

const { registerRaterEndpoint } = require('../../lib/rater-endpoint-registrar');

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	registerRaterEndpoint({
		passThroughParameters,
		endpointsDotD,
		thisEndpointName: 'raterItemGet',
		accessPointName: 'rater-item-get',
		roleList: ['rater'],
		requestOf: ({ requestBody, authclaims }) => ({ raterUserName: authclaims.user.username, itemNumber: requestBody.itemNumber }),
	});
	return {};
};

module.exports = moduleFunction;
