#!/usr/bin/env node
'use strict';

// ENDPOINT: /api/raterBrowse — CEDS Rater (lane RATER, 2026-10-14). POST { browseMode: concepts|classesOfConcept|propertiesOfClass, conceptName, classCedsId }.
// Roles: ['rater']. The shape (permission first, the access point, arrays back, refusals by name) is
// lib/rater-endpoint-registrar.js; this file names the route, the roles and how the request is read.

const { registerRaterEndpoint } = require('../../lib/rater-endpoint-registrar');

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	registerRaterEndpoint({
		passThroughParameters,
		endpointsDotD,
		thisEndpointName: 'raterBrowse',
		accessPointName: 'rater-browse',
		roleList: ['rater'],
		requestOf: ({ requestBody, authclaims }) => ({ raterUserName: authclaims.user.username, browseMode: requestBody.browseMode, conceptName: requestBody.conceptName, classCedsId: requestBody.classCedsId }),
	});
	return {};
};

module.exports = moduleFunction;
