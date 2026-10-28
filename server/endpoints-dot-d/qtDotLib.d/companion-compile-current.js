#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]

// ENDPOINT: POST /api/companion-compile-current (SPEC-companionPages-102826, Phase 3). Body { pageSlug }: the current compile of a compiled companion page, recompiled first when stale; when a recompile fails, the last good compile marked not current. Roles: the explorer's.
// The shape (permission first, the access point, the answer, refusals by name) is lib/companion-endpoint-registrar.js;
// this file names the route, the roles and how the request is read.

const { registerCompanionEndpoint, unknownPropertyRefusalOf } = require('../../lib/companion-endpoint-registrar');

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	registerCompanionEndpoint({
		passThroughParameters,
		endpointsDotD,
		thisEndpointName: moduleName,
		accessPointName: 'companion-compile-current',
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
