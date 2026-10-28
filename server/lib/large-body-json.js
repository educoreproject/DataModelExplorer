#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]
//
// The two halves of a per-route JSON body limit (registry: large-body-route-list.json).
//   isLargeBodyRoute(routePath)            -> true when the global JSON parser must leave this route alone
//   skippingLargeBodyRoutes(jsonParser)    -> middleware: jsonParser for every route except the registry's
//                                             (startApiServer.js mounts the global parser through this)
//   largeBodyJsonParserOf(routePath)       -> a body-parser json middleware with the route's limit; throws for a
//                                             route that is not in the registry, so a typo cannot pass silently
// An endpoint calls its parser as an ordinary pipeline step after the permission check:
//   largeBodyJsonParser(xReq, xRes, (parseError) => ...)   then reads xReq.body

const bodyParser = require('body-parser');

const { jsonBodyLimitByRoutePath } = require('./large-body-route-list.json');

const isLargeBodyRoute = (routePath) => Object.prototype.hasOwnProperty.call(jsonBodyLimitByRoutePath, routePath);

const skippingLargeBodyRoutes = (jsonParser) => (xReq, xRes, next) => (isLargeBodyRoute(xReq.path) ? next() : jsonParser(xReq, xRes, next));

const largeBodyJsonParserOf = (routePath) => {
	if (!isLargeBodyRoute(routePath)) {
		throw new Error(`large-body-json: route ${routePath} is not in large-body-route-list.json`);
	}
	return bodyParser.json({ limit: jsonBodyLimitByRoutePath[routePath] });
};

module.exports = { isLargeBodyRoute, skippingLargeBodyRoutes, largeBodyJsonParserOf };
