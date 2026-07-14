#!/usr/bin/env node
'use strict';
// @concept: [[OidcIdentityProvider]]
// @concept: [[SecurityFirstPattern]]
// @concept: [[DependencyInjection]]

// ============================================================================
// oauth-server.js — the EDUcore Authorization Server mount orchestrator
// (dmeMcpOAuth Phase 2). The analogue of mcp-server.js: it assembles every
// Phase-2 module and mounts the AS on the shared Express app.
//
// Assembly order (each async stage feeds the next via the qtools pipe):
//   keys (RS256 file) -> adapter (oauthAdapterStore) -> audit (append-only)
//   -> audit-enforce (triggers) -> provider (OAuth 2.1) -> GC daemon
//   -> mount [interactions, well-known, DCR guard, provider delegate].
//
// MOUNT MODEL (learned in the e2e harness): the provider is mounted at ROOT via
// a PATH-FILTERED middleware that does NOT strip the path (so oidc-provider
// generates correct absolute URLs — no /oauth/oauth doubling) and calls next()
// for everything it does not own. Our interaction routes, the well-known docs,
// and the DCR guard are registered BEFORE that filter so they win their paths.
// The /mcp loopback path and every existing route are untouched.
//
// Returns { provider, resolvePublicKey, mcpResource, bearerVerifier } so the
// Phase-3 /mcp bearer gate can compose the audience-bound verifier without
// re-loading keys.
//
// Contract: module.exports({ expressApp, accessPointsDotD, sqlDb })
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const path = require('path');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const makeAdapter = require('./oauth-adapter');
const makeKeys = require('./oauth-keys');
const makeProvider = require('./oauth-provider');
const makeInteractions = require('./oauth-interactions');
const makeThrottle = require('./oauth-throttle');
const makeAudit = require('./oauth-audit');
const makeAuditEnforce = require('./oauth-audit-enforce');
const makeGc = require('./oauth-gc');
const makeWellKnown = require('./oauth-well-known');
const makeDcrGuard = require('./oauth-dcr-guard');
const makeMcpVerifier = require('./oauth-mcp-verifier');
const makeValidators = require('./oauth-token-validators');

const OIDC_OWNED = /^\/(oauth\/|\.well-known\/(openid-configuration|oauth-authorization-server|oauth-protected-resource))/;
const INTERACTION_PREFIX = '/oauth/interaction';

const moduleFunction = ({ expressApp, accessPointsDotD, sqlDb } = {}) => {
	const { xLog, getConfig } = process.global;
	const config = (getConfig && getConfig(moduleName)) || {};

	if (config.enabled === false || config.enabled === 'false') {
		xLog && xLog.status(`[${moduleName}] disabled by configuration`);
		return;
	}

	// --- configuration (INI-driven; dev defaults only where safe) ---
	const issuer = config.issuer || 'https://qbook.work';
	const mcpResource = config.mcpResource || `${issuer}/mcp`;
	const keyFilePath = config.keyFilePath ||
		path.join(process.global.projectRoot || '.', 'dataStores', 'oauthKeys', 'oauth-signing-keys.json');
	// Secrets MUST come from config in production; a generated ephemeral value is
	// used only if config is absent (dev), and that is logged loudly.
	const cookieKeys = config.cookieKeys
		? [].concat(config.cookieKeys)
		: [require('crypto').randomBytes(32).toString('hex')];
	const csrfSecret = config.csrfSecret || require('crypto').randomBytes(32).toString('hex');
	if (!config.cookieKeys || !config.csrfSecret) {
		xLog && xLog.error(`[${moduleName}] WARNING: cookieKeys/csrfSecret not in config — using ephemeral dev secrets (sessions won't survive restart). Set them in [${moduleName}] for production.`);
	}
	const cookieSecure = config.cookieSecure === false ? false : true;

	const credentialHook = accessPointsDotD['oidc-verify-credential'];
	if (!credentialHook) {
		xLog && xLog.error(`[${moduleName}] FATAL: oidc-verify-credential access point missing — AS not mounted`);
		return;
	}

	// loadAccountBySub: DB lookup by refId (never a plaintext-credential path).
	const loadAccountBySub = (sub) => new Promise((resolve) => {
		sqlDb.getTable('users', (err, userTable) => {
			if (err) { resolve(null); return; }
			const esc = String(sub).replace(/'/g, "''");
			userTable.getData(
				`SELECT refId, username, role FROM <!tableName!> WHERE refId='${esc}' LIMIT 1;`,
				{ suppressStatementLog: true, noTableNameOk: true },
				(qErr, rows) => {
					const u = rows && rows[0];
					resolve(u ? { sub: u.refId, username: u.username, role: u.role } : null);
				},
			);
		});
	});

	const throttle = makeThrottle(config.throttle || {});
	const { verifyMcpAccessToken } = makeValidators();

	// ------------------------------------------------------------------
	// ASSEMBLY PIPELINE
	const taskList = new taskListPlus();

	// keys
	taskList.push((args, next) => {
		const { jwks, resolvePublicKey } = makeKeys({ keyFilePath });
		next('', { ...args, jwks, resolvePublicKey });
	});

	// adapter
	taskList.push((args, next) => {
		makeAdapter({ sqlDb })((err, { Adapter } = {}) => {
			if (err) { next(err, args); return; }
			next('', { ...args, Adapter });
		});
	});

	// audit writer
	taskList.push((args, next) => {
		makeAudit({ sqlDb })((err, audit) => {
			if (err) { next(err, args); return; }
			next('', { ...args, audit });
		});
	});

	// audit append-only enforcement (triggers)
	taskList.push((args, next) => {
		makeAuditEnforce({ sqlDb })((err) => {
			if (err) { xLog && xLog.error(`[${moduleName}] audit-enforce failed (non-fatal): ${err}`); }
			next('', args);
		});
	});

	// GC daemon
	taskList.push((args, next) => {
		makeGc({ sqlDb })((err, gc) => {
			if (err) { xLog && xLog.error(`[${moduleName}] GC init failed (non-fatal): ${err}`); next('', args); return; }
			gc.startDaemon(config.gcIntervalMs || 60 * 60 * 1000);
			next('', { ...args, gc });
		});
	});

	// provider
	taskList.push((args, next) => {
		const { Adapter, jwks } = args;
		let provider;
		try {
			({ provider } = makeProvider({
				issuer, mcpResource, Adapter, jwks, cookieKeys, cookieSecure,
				loadAccountBySub, ttl: config.ttl || {},
			}));
		} catch (e) {
			next(`provider construction failed: ${e.message}`, args);
			return;
		}
		next('', { ...args, provider });
	});

	// ------------------------------------------------------------------
	// MOUNT
	pipeRunner(taskList.getList(), {}, (err, args) => {
		if (err) {
			xLog && xLog.error(`[${moduleName}] assembly failed — AS NOT mounted: ${err}`);
			return;
		}
		const { provider, audit, resolvePublicKey } = args;

		// interaction pages (login + consent) — registered FIRST so they own
		// /oauth/interaction/* ahead of the provider delegate.
		makeInteractions({ provider, credentialHook, throttle, audit, interactionPath: INTERACTION_PREFIX, csrfSecret })({ expressApp });

		// well-known docs at root paths.
		makeWellKnown({ issuer, mcpResource, routes: {
			authorization: '/oauth/authorize', token: '/oauth/token', jwks: '/oauth/jwks',
			userinfo: '/oauth/userinfo', registration: '/oauth/register', revocation: '/oauth/revoke',
			end_session: '/oauth/session/end',
		} })({ expressApp });

		// DCR guard in front of the registration endpoint.
		const dcrGuard = makeDcrGuard({ audit, allowlist: config.dcrAllowlist, rateLimit: config.dcrRateLimit });
		expressApp.post('/oauth/register', dcrGuard);

		// provider delegate — root-mounted, path-filtered, NON-stripping. Strips
		// the website-auth response headers the global refreshauthtoken
		// middleware stamps on EVERY response, so provider-served OAuth responses
		// (discovery, token, the authorize redirect) never carry a website token.
		const stripWebsiteAuthHeaders = (res) => {
			['authtoken', 'authclaims', 'authsecondsexpirationseconds'].forEach((h) => {
				try { res.removeHeader(h); } catch (e) {}
			});
		};
		const oidcHandler = provider.callback();
		expressApp.use((req, res, xnext) => {
			if (req.path.startsWith(INTERACTION_PREFIX)) { xnext(); return; }
			if (OIDC_OWNED.test(req.path)) { stripWebsiteAuthHeaders(res); oidcHandler(req, res); return; }
			xnext();
		});

		// The audience-bound verifier seam for the Phase-3 /mcp gate (MED-1).
		const { verifyBearer } = makeMcpVerifier({ resolvePublicKey, expectedAudience: mcpResource, verifyMcpAccessToken });

		// Stash for Phase 3 to consume. Beyond the verifier, the /mcp bearer gate
		// needs sqlDb (per-request revocation checks against users +
		// oauthAdapterStore), the audit writer (mcp_tool_call / mcp_auth_rejected
		// events), and the RFC 9728 resource-metadata URL for its 401s.
		const resourceMetadataUrl = `${issuer}/.well-known/oauth-protected-resource`;
		expressApp.set && expressApp.set('oauthServer', {
			provider, resolvePublicKey, mcpResource, verifyBearer,
			audit, sqlDb, issuer, resourceMetadataUrl,
		});

		xLog && xLog.status(`[${moduleName}] EDUcore Authorization Server mounted (issuer ${issuer}, aud ${mcpResource})`);
	});
};

module.exports = moduleFunction;
