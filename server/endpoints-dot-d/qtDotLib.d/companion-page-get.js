#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]

// ENDPOINT: POST /api/companion-page-get (SPEC-companionPages-102826, Phase 4). Body { pageSlug }: one companion page's registry record, for the compiled page's heading and an admin's edit form. Roles: the explorer's.
// The shape (permission first, the access point, the answer, refusals by name) is lib/companion-endpoint-registrar.js;
// this file names the route, the roles and how the request is read.

const { registerCompanionEndpoint, unknownPropertyRefusalOf } = require('../../lib/companion-endpoint-registrar');

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	registerCompanionEndpoint({
		passThroughParameters,
		endpointsDotD,
		thisEndpointName: moduleName,
		accessPointName: 'companion-page-get',
		roleList: ['user', 'client', 'admin'],
		answerKind: 'array',
		requestOf: ({ requestBody }) => ({
			refusalText: unknownPropertyRefusalOf({ requestBody, allowedPropertyList: ['pageSlug'] }),
			accessRequest: { pageSlug: requestBody.pageSlug },
		}),
	});
	return {};
};

module.exports = moduleFunction;
