#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]

// ENDPOINT: POST /api/companion-page-save (SPEC-companionPages-102826). Body { pageRecord }: add or edit a companion page registry entry (a whole row). Roles: admin and super only.
// The shape (permission first, the access point, the answer, refusals by name) is lib/companion-endpoint-registrar.js;
// this file names the route, the roles and how the request is read.

const { registerCompanionEndpoint, unknownPropertyRefusalOf } = require('../../lib/companion-endpoint-registrar');

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	registerCompanionEndpoint({
		passThroughParameters,
		endpointsDotD,
		thisEndpointName: moduleName,
		accessPointName: 'companion-page-save',
		roleList: ['admin', 'super'],
		answerKind: 'array',
		requestOf: ({ requestBody }) => ({
			refusalText: unknownPropertyRefusalOf({ requestBody, allowedPropertyList: ['pageRecord'] }),
			accessRequest: { pageRecord: requestBody.pageRecord },
		}),
	});
	return {};
};

module.exports = moduleFunction;
