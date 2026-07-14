#!/usr/bin/env node
'use strict';
// @concept: [[OidcIdentityProvider]]
// @concept: [[SecurityFirstPattern]]

// ============================================================================
// oauth-provider.js — builds & configures the node-oidc-provider Provider for
// the EDUcore Authorization Server (dmeMcpOAuth Phase 2). This is the OAuth 2.1
// hardening surface; every non-default setting here answers a spec/gate item:
//
//   OAuth 2.1              responseTypes ['code'] only (NO implicit/hybrid),
//                          PKCE S256 REQUIRED for every client.
//   Token model (C5/C6)    RS256 JWT access tokens (~10 min) bound to the MCP
//                          audience via RFC 8707 resourceIndicators; rotating
//                          refresh tokens WITH reuse detection (a replayed
//                          rotated refresh revokes the whole grant family).
//   Interaction (2.2)      devInteractions OFF — our own login+consent pages
//                          are served by the mount module; the provider only
//                          redirects to interactions.url.
//   Cookies (consent sec)  Secure (config) + HttpOnly + SameSite=Lax, signed
//                          with rotating keys.
//   DCR (2.4)              registration ON (guards — allowlist/rate-limit — are
//                          layered in the mount module, in front of the route).
//   CIMD (2.4)             clientIdMetadataDocument advertised.
//   Revocation (2.3)       RFC 7009 revocation ON.
//   Logout (2.6)           rpInitiatedLogout ON (/oauth/session/end).
//
// The provider NEVER sees a plaintext credential — findAccount only ever
// receives a `sub` that the interaction flow already authenticated through the
// DB-only oidc-verify-credential hook (C1). loadAccountBySub re-hydrates claims
// (role/username) from the users table for token/userinfo minting.
//
// Contract: module.exports(config) -> { provider }
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
// oidc-provider v9 loads via require(esm) on Node >=22.12 (proven Phase 0). The
// module namespace exposes the constructor as both `.Provider` and `.default`.
const { Provider } = require('oidc-provider');

const moduleFunction = ({
	issuer, // e.g. https://qbook.work
	mcpResource, // the canonical MCP resource URL == token audience, e.g. https://qbook.work/mcp
	Adapter, // the persistence adapter class (oauth-adapter.js)
	jwks, // { keys: [ privateJwk ] } from oauth-keys.js
	cookieKeys, // array of secrets for cookie signing/rotation
	cookieSecure = true, // false only for direct-http standalone testing
	loadAccountBySub, // (sub) => Promise<{ sub, role, username } | null>
	interactionPath = '/oauth/interaction', // base path for our interaction pages
	ttl = {},
	extraScopes = ['dme:read'],
	staticClients = [], // pre-registered clients (harness/tests only; prod uses DCR)
} = {}) => {
	const { xLog } = process.global;

	const scopes = ['openid', 'offline_access', ...extraScopes];

	// RFC 8707: the MCP resource server. accessTokenFormat 'jwt' makes the
	// access token an RS256 JWT (verifiable offline by the /mcp gate); audience
	// is the exact resource URL, which the strict verifier pins.
	const resourceServer = {
		scope: extraScopes.join(' '),
		audience: mcpResource,
		accessTokenFormat: 'jwt',
		jwt: { sign: { alg: 'RS256' } },
	};

	const configuration = {
		adapter: Adapter,
		jwks,

		// --- OAuth 2.1: authorization-code + refresh only; no implicit/hybrid ---
		responseTypes: ['code'],
		grantTypes: ['authorization_code', 'refresh_token'],

		// --- PKCE S256 required for EVERY client (no plain, no opt-out) ---
		pkce: {
			required: () => true,
			methods: ['S256'],
		},

		scopes,

		// No static clients in production — everything arrives via DCR (2.4).
		// staticClients is injected only by the test harness.
		clients: staticClients,
		clientDefaults: {
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
			token_endpoint_auth_method: 'none', // public clients (PKCE), no secret
			id_token_signed_response_alg: 'RS256',
		},
		clientAuthMethods: ['none', 'client_secret_basic', 'client_secret_post'],

		// --- Spec-required route paths (root /.well-known handled in mount) ---
		routes: {
			authorization: '/oauth/authorize',
			token: '/oauth/token',
			jwks: '/oauth/jwks',
			userinfo: '/oauth/userinfo',
			revocation: '/oauth/revoke',
			registration: '/oauth/register',
			end_session: '/oauth/session/end',
			introspection: '/oauth/introspection',
		},

		// --- Our own interaction (login+consent) pages; dev UI disabled ---
		interactions: {
			url(ctx, interaction) {
				return `${interactionPath}/${interaction.uid}`;
			},
		},

		cookies: {
			keys: cookieKeys,
			long: { httpOnly: true, sameSite: 'lax', secure: cookieSecure, signed: true },
			short: { httpOnly: true, sameSite: 'lax', secure: cookieSecure, signed: true },
		},

		// Rotating refresh WITH reuse detection: always rotate, so a replayed
		// (already-consumed) refresh token trips oidc-provider's reuse detection
		// and revokes the entire grant family.
		rotateRefreshToken: true,

		// MCP needs durable access, so issue a refresh token to any client that
		// is allowed the refresh_token grant — decoupled from the OIDC quirk
		// where `offline_access` is silently dropped unless prompt=consent is
		// sent (many MCP clients don't send it). Rotation + reuse detection above
		// keep this safe.
		issueRefreshToken(ctx, client, code) {
			return client.grantTypeAllowed('refresh_token');
		},

		ttl: {
			AccessToken: ttl.AccessToken || 600, // ~10 minutes (spec §4)
			AuthorizationCode: ttl.AuthorizationCode || 60,
			RefreshToken: ttl.RefreshToken || 14 * 24 * 60 * 60,
			Grant: ttl.Grant || 14 * 24 * 60 * 60,
			IdToken: ttl.IdToken || 600,
			Session: ttl.Session || 14 * 24 * 60 * 60,
			Interaction: ttl.Interaction || 3600,
		},

		claims: {
			openid: ['sub'],
			profile: ['role', 'username'],
		},

		features: {
			devInteractions: { enabled: false }, // we serve our own — never the dev UI
			resourceIndicators: {
				enabled: true,
				defaultResource: () => mcpResource,
				useGrantedResource: () => true,
				getResourceServerInfo: () => resourceServer,
			},
			registration: {
				enabled: true,
				initialAccessToken: false, // anonymous DCR; guarded in the mount module
			},
			registrationManagement: { enabled: true },
			clientIdMetadataDocument: { enabled: true, ack: 'draft-02' }, // CIMD (2.4)
			revocation: { enabled: true }, // RFC 7009 (2.3)
			userinfo: { enabled: true },
			rpInitiatedLogout: { enabled: true }, // /oauth/session/end (2.6)
		},

		// findAccount only ever receives an already-authenticated sub.
		findAccount(ctx, sub) {
			return loadAccountBySub(sub).then((account) => {
				if (!account) {
					return undefined;
				}
				return {
					accountId: sub,
					claims() {
						return {
							sub,
							role: account.role,
							username: account.username,
						};
					},
				};
			});
		},

		// Role rides in the access-token JWT so the /mcp gate (Phase 3) can make
		// authz decisions offline without a DB hit on the hot path. gid (the
		// grant refId, spec §4) rides along too: jwt-format access tokens are
		// never persisted (formats/jwt.js returns no payload for base_model to
		// upsert), so gid is the gate's ONLY route to the Grant row for the
		// per-grant revocation checks.
		extraTokenClaims(ctx, token) {
			const accountId = token.accountId;
			if (!accountId) {
				return {};
			}
			const gid = token.grantId ? { gid: token.grantId } : {};
			return loadAccountBySub(accountId).then((account) =>
				account ? { ...gid, role: account.role, username: account.username } : gid,
			);
		},
	};

	const provider = new Provider(issuer, configuration);

	// Behind nginx TLS termination, trust the proxy so the provider sees https
	// and the real client IP (needed for Secure cookies + per-IP throttling).
	provider.proxy = true;

	xLog && xLog.status(`[${moduleName}] provider constructed for issuer ${issuer} (aud ${mcpResource})`);

	return { provider };
};

module.exports = moduleFunction;
