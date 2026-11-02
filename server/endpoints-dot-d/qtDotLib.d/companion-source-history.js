#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]

// ENDPOINT: POST /api/companion-source-history (SPEC-companionPages-102826). Body { pageSlug }: EVERY source row ever uploaded for the page, newest first per role and part, with provenance. Roles: admin and super only.
// The shape (permission first, the access point, the answer, refusals by name) is lib/companion-endpoint-registrar.js;
// this file names the route, the roles and how the request is read.

const { registerCompanionEndpoint, unknownPropertyRefusalOf } = require('../../lib/companion-endpoint-registrar');

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	registerCompanionEndpoint({
		passThroughParameters,
		endpointsDotD,
		thisEndpointName: moduleName,
		accessPointName: 'companion-source-list',
		roleList: ['admin', 'super'],
		answerKind: 'array',
		requestOf: ({ requestBody }) => ({
			refusalText: unknownPropertyRefusalOf({ requestBody, allowedPropertyList: ['pageSlug'] }),
			accessRequest: { pageSlug: requestBody.pageSlug, listScope: 'history' },
		}),
	});
	return {};
};

module.exports = moduleFunction;
