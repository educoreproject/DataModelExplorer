#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]

// ENDPOINT: POST /api/companion-source-upload (SPEC-companionPages-102826). Body { pageSlug, sourceRole, sourcePart, fileName, fileBase64, originUrl, originNote, documentDate }: store a source file and make it current. uploadedBy is the token's username, never the body's. The body limit is this route's own (lib/large-body-route-list.json), parsed only after the permission check. Roles: admin and super only.
// The shape (permission first, the access point, the answer, refusals by name) is lib/companion-endpoint-registrar.js;
// this file names the route, the roles and how the request is read.

const { registerCompanionEndpoint, unknownPropertyRefusalOf } = require('../../lib/companion-endpoint-registrar');

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	registerCompanionEndpoint({
		passThroughParameters,
		endpointsDotD,
		thisEndpointName: moduleName,
		accessPointName: 'companion-source-upload',
		roleList: ['admin', 'super'],
		answerKind: 'array',
		requestOf: ({ requestBody, authclaims }) => ({
			refusalText: requestBody.uploadedBy !== undefined ? 'uploadedBy is taken from the signed-in user and may not be sent' : '',
			accessRequest: { ...requestBody, uploadedBy: authclaims.user.username },
		}),
	});
	return {};
};

module.exports = moduleFunction;
