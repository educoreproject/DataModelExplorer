#!/usr/bin/env node
'use strict';
// @concept: [[OidcIdentityProvider]]

// ============================================================================
// oauth-well-known.js — the discovery documents at their spec-required ROOT
// paths (dmeMcpOAuth Phase 2.3). oidc-provider natively serves
// /.well-known/openid-configuration; the MCP authorization spec ALSO requires:
//
//   /.well-known/oauth-authorization-server   (RFC 8414) — AS metadata
//   /.well-known/oauth-protected-resource     (RFC 9728) — resource metadata
//     naming the AS that guards the MCP resource; this is what a 401 from /mcp
//     points at via WWW-Authenticate (Phase 3).
//
// Both are public, cacheable JSON with permissive CORS (Claude fetches them
// cross-origin). They are derived from the SAME issuer/route config the
// provider uses, so they can never drift from it. Served here as tiny Express
// routes so they answer at the ROOT path (nginx proxies these to this port).
//
// Contract: module.exports({ issuer, mcpResource, routes })({ expressApp })
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction = ({ issuer, mcpResource, routes = {} } = {}) => ({ expressApp }) => {
	const { xLog } = process.global;

	const abs = (route) => `${issuer}${route}`;

	const authorizationServerMetadata = {
		issuer,
		authorization_endpoint: abs(routes.authorization || '/oauth/authorize'),
		token_endpoint: abs(routes.token || '/oauth/token'),
		jwks_uri: abs(routes.jwks || '/oauth/jwks'),
		userinfo_endpoint: abs(routes.userinfo || '/oauth/userinfo'),
		registration_endpoint: abs(routes.registration || '/oauth/register'),
		revocation_endpoint: abs(routes.revocation || '/oauth/revoke'),
		end_session_endpoint: abs(routes.end_session || '/oauth/session/end'),
		scopes_supported: ['openid', 'offline_access', 'dme:read'],
		response_types_supported: ['code'],
		response_modes_supported: ['query'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
		code_challenge_methods_supported: ['S256'],
		// Advertise the RFC 8707 resource-indicator + CIMD support.
		authorization_response_iss_parameter_supported: true,
	};

	const protectedResourceMetadata = {
		resource: mcpResource,
		authorization_servers: [issuer],
		scopes_supported: ['dme:read'],
		bearer_methods_supported: ['header'],
		resource_documentation: `${issuer}/`,
	};

	// Public, cacheable, CORS-open JSON. Answer OPTIONS preflight too.
	const serveJson = (payload) => (req, res) => {
		// Strip website-auth headers the global refreshauthtoken middleware set.
		['authtoken', 'authclaims', 'authsecondsexpirationseconds'].forEach((h) => {
			try { res.removeHeader(h); } catch (e) {}
		});
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
		res.setHeader('Cache-Control', 'public, max-age=3600');
		if (req.method === 'OPTIONS') {
			res.status(204).end();
			return;
		}
		res.setHeader('Content-Type', 'application/json');
		res.status(200).send(JSON.stringify(payload));
	};

	expressApp.get('/.well-known/oauth-authorization-server', serveJson(authorizationServerMetadata));
	expressApp.options('/.well-known/oauth-authorization-server', serveJson(authorizationServerMetadata));
	expressApp.get('/.well-known/oauth-protected-resource', serveJson(protectedResourceMetadata));
	expressApp.options('/.well-known/oauth-protected-resource', serveJson(protectedResourceMetadata));

	xLog && xLog.status(`[${moduleName}] well-known oauth-authorization-server + oauth-protected-resource mounted`);

	return { authorizationServerMetadata, protectedResourceMetadata };
};

module.exports = moduleFunction;
