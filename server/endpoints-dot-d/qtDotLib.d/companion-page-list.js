#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]

// ENDPOINT: POST /api/companion-page-list (SPEC-companionPages-102826). Body { standardKey, subjectStableId? }: the active companion pages for the standard (or node) in focus. Roles: the explorer's.
// The shape (permission first, the access point, the answer, refusals by name) is lib/companion-endpoint-registrar.js;
// this file names the route, the roles and how the request is read.

const { registerCompanionEndpoint, unknownPropertyRefusalOf } = require('../../lib/companion-endpoint-registrar');

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	registerCompanionEndpoint({
		passThroughParameters,
		endpointsDotD,
		thisEndpointName: moduleName,
		accessPointName: 'companion-page-list',
		roleList: ['user', 'client', 'admin'],
		answerKind: 'array',
		requestOf: ({ requestBody }) => ({
			refusalText: unknownPropertyRefusalOf({ requestBody, allowedPropertyList: ['standardKey', 'subjectStableId'] }),
			accessRequest: { standardKey: requestBody.standardKey, subjectStableId: requestBody.subjectStableId },
		}),
	});
	return {};
};

module.exports = moduleFunction;
