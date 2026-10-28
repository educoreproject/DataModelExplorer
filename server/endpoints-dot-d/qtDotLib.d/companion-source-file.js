#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]

// ENDPOINT: POST /api/companion-source-file (SPEC-companionPages-102826). Body { sourceRefId } or { pageSlug, sourceRole, sourcePart }: the bytes of that source (the current one, in the second form), found only through its companionSource row; a body naming anything else, a path included, is refused. Answers the file, not an array. Roles: the explorer's.
// The shape (permission first, the access point, the answer, refusals by name) is lib/companion-endpoint-registrar.js;
// this file names the route, the roles and how the request is read.

const { registerCompanionEndpoint, unknownPropertyRefusalOf } = require('../../lib/companion-endpoint-registrar');

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	registerCompanionEndpoint({
		passThroughParameters,
		endpointsDotD,
		thisEndpointName: moduleName,
		accessPointName: 'companion-source-file',
		roleList: ['user', 'client', 'admin'],
		answerKind: 'file',
		requestOf: ({ requestBody }) => ({ accessRequest: requestBody }),
	});
	return {};
};

module.exports = moduleFunction;
