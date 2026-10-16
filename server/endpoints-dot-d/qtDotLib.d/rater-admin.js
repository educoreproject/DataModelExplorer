#!/usr/bin/env node
'use strict';

// ENDPOINT: /api/raterAdmin — CEDS Rater (lane RATER, 2026-10-14). POST { adminAction: list|add|surveyChange|passwordReset|download|results|surveys|surveyItems|previewItem|previewSearch|previewBrowse|remove, ... } — admin only.
// Roles: ['admin', 'super']. The shape (permission first, the access point, arrays back, refusals by name) is
// lib/rater-endpoint-registrar.js; this file names the route, the roles and how the request is read.

const { registerRaterEndpoint } = require('../../lib/rater-endpoint-registrar');

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	registerRaterEndpoint({
		passThroughParameters,
		endpointsDotD,
		thisEndpointName: 'raterAdmin',
		accessPointName: 'rater-admin',
		roleList: ['admin', 'super'],
		requestOf: ({ requestBody, authclaims }) => ({ ...requestBody }),
	});
	return {};
};

module.exports = moduleFunction;
