#!/usr/bin/env node
'use strict';
// @concept: [[OidcIdentityProvider]]
// @concept: [[SecurityFirstPattern]]
// @concept: [[PermissionValidation]]

// ============================================================================
// oauth-interactions.js — the provider-served login + consent pages for the
// EDUcore AS (dmeMcpOAuth Phase 2.2 + 2.5). Plain server-rendered HTML; Nuxt is
// uninvolved. The provider redirects the browser here (interactions.url) during
// the authorize dance; we authenticate against the DB-only credential hook and
// hand the result back with provider.interactionResult.
//
// Security properties baked in (each answers a review finding):
//   - Credentials are POSTed (never a GET query string) — qbook logs query
//     strings (allowQueryStringInLog=true), so a GET login would leak the
//     password to stdout. The <form method="post">, and the POST handler is the
//     ONLY credential path.
//   - CSRF: a stateless per-interaction token = HMAC(csrfSecret, uid). The form
//     carries it; the POST handler recomputes and compares. An attacker can
//     neither forge it (no secret) nor reuse another interaction's (bound to
//     uid). Layered atop the provider's SameSite=Lax interaction cookie.
//   - Brute force: every POST consults the throttle (per-account + per-IP)
//     BEFORE verifying, and records failure/success after.
//   - login_failed / login_success / consent_granted are audited.
//   - Response headers on every auth page: Referrer-Policy: no-referrer,
//     X-Frame-Options: DENY, CSP frame-ancestors 'none', Cache-Control:
//     no-store. Website-auth response headers (leaked by the global
//     refreshauthtoken middleware) are stripped.
//
// Contract: module.exports({ provider, credentialHook, throttle, audit,
//   interactionPath, csrfSecret })({ expressApp })  -> registers the routes.
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const crypto = require('crypto');

// --- tiny HTML helpers (no template engine; escape everything interpolated) ---
const escapeHtml = (value) =>
	String(value == null ? '' : value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

const PAGE_STYLE = `
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f5f7;margin:0;padding:0;color:#1d2733}
  .card{max-width:400px;margin:8vh auto;background:#fff;border-radius:10px;box-shadow:0 2px 16px rgba(0,0,0,.08);padding:32px}
  h1{font-size:20px;margin:0 0 4px}.sub{color:#5b6b7b;font-size:13px;margin:0 0 20px}
  label{display:block;font-size:13px;font-weight:600;margin:14px 0 4px}
  input[type=text],input[type=password]{width:100%;box-sizing:border-box;padding:10px;border:1px solid #cdd6df;border-radius:6px;font-size:15px}
  button{margin-top:20px;width:100%;padding:11px;border:0;border-radius:6px;background:#2b6cb0;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
  button.secondary{background:#e2e8f0;color:#1d2733}
  .row{display:flex;gap:10px}.row button{margin-top:0}
  .err{background:#fdecea;color:#b3261e;border-radius:6px;padding:10px;font-size:13px;margin-bottom:8px}
  .scopes{background:#f4f6f8;border-radius:6px;padding:12px;font-size:13px;margin:12px 0}
  .scopes li{margin:2px 0}.muted{color:#5b6b7b;font-size:12px;margin-top:18px}
`;

const moduleFunction = ({
	provider,
	credentialHook, // (query, cb) => cb(err, { account }) — the DB-only oidc-verify-credential hook
	throttle,
	audit,
	interactionPath = '/oauth/interaction',
	csrfSecret,
} = {}) => ({ expressApp }) => {
	const { xLog } = process.global;

	if (!csrfSecret) {
		throw new Error(`[${moduleName}] csrfSecret is required`);
	}

	const csrfToken = (uid) =>
		crypto.createHmac('sha256', csrfSecret).update(String(uid)).digest('base64url');

	const csrfOk = (uid, presented) => {
		const expected = csrfToken(uid);
		const a = Buffer.from(String(expected));
		const b = Buffer.from(String(presented || ''));
		return a.length === b.length && crypto.timingSafeEqual(a, b);
	};

	// The client IP, honoring the proxy (provider.proxy=true so req.ip is real).
	const clientIp = (req) =>
		(req.ip ||
			(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
			(req.socket && req.socket.remoteAddress) ||
			'').toString();

	// Strip the website-auth headers the global refreshauthtoken middleware set,
	// and stamp the hardened auth-page headers. Applied to every response here.
	const harden = (res) => {
		['authtoken', 'authclaims', 'authsecondsexpirationseconds'].forEach((h) => {
			try { res.removeHeader(h); } catch (e) {}
		});
		res.setHeader('Referrer-Policy', 'no-referrer');
		res.setHeader('X-Frame-Options', 'DENY');
		res.setHeader('Content-Security-Policy', "frame-ancestors 'none'; default-src 'self'; style-src 'unsafe-inline'");
		res.setHeader('Cache-Control', 'no-store');
		res.setHeader('Pragma', 'no-cache');
	};

	const sendHtml = (res, status, html) => {
		harden(res);
		res.status(status);
		res.setHeader('Content-Type', 'text/html; charset=utf-8');
		res.send(html);
	};

	const renderLogin = ({ uid, error }) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>EDUcore — Sign in</title>
<style>${PAGE_STYLE}</style></head><body><div class="card">
<h1>Sign in to EDUcore</h1><p class="sub">Authorize access to the education-standards knowledge graph.</p>
${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
<form method="post" action="${escapeHtml(interactionPath)}/${escapeHtml(uid)}/login" autocomplete="off">
<input type="hidden" name="csrf" value="${escapeHtml(csrfToken(uid))}">
<label for="username">Username</label>
<input id="username" name="username" type="text" autocapitalize="none" autocorrect="off" required autofocus>
<label for="password">Password</label>
<input id="password" name="password" type="password" required>
<button type="submit">Sign in</button>
</form>
<p class="muted">EDUcore identity provider</p></div></body></html>`;

	const renderConsent = ({ uid, clientName, scopes, resource }) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>EDUcore — Authorize</title>
<style>${PAGE_STYLE}</style></head><body><div class="card">
<h1>Authorize ${escapeHtml(clientName)}</h1><p class="sub">This application is requesting access to your EDUcore account.</p>
<div class="scopes"><strong>Requested access</strong><ul>
${scopes.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
</ul>${resource ? `<div class="muted">Resource: ${escapeHtml(resource)}</div>` : ''}</div>
<form method="post" action="${escapeHtml(interactionPath)}/${escapeHtml(uid)}/confirm">
<input type="hidden" name="csrf" value="${escapeHtml(csrfToken(uid))}">
<div class="row">
<button type="submit" name="decision" value="deny" class="secondary">Deny</button>
<button type="submit" name="decision" value="allow">Allow</button>
</div></form>
<p class="muted">You can revoke this access at any time.</p></div></body></html>`;

	// ------------------------------------------------------------------
	// GET /oauth/interaction/:uid — render login or consent per the prompt.
	const interactionPage = (req, res) => {
		provider
			.interactionDetails(req, res)
			.then((details) => {
				const { uid, prompt, params } = details;
				if (prompt.name === 'login') {
					sendHtml(res, 200, renderLogin({ uid }));
					return;
				}
				if (prompt.name === 'consent') {
					const scopes = String(params.scope || '')
						.split(' ')
						.filter(Boolean);
					sendHtml(res, 200, renderConsent({
						uid,
						clientName: params.client_id || 'the application',
						scopes,
						resource: params.resource,
					}));
					return;
				}
				sendHtml(res, 400, `<p>Unsupported interaction: ${escapeHtml(prompt.name)}</p>`);
			})
			.catch((err) => {
				xLog && xLog.error(`[${moduleName}] interactionDetails failed: ${err}`);
				sendHtml(res, 400, '<p>This authorization session has expired. Please start again.</p>');
			});
	};

	// ------------------------------------------------------------------
	// POST /oauth/interaction/:uid/login — verify credentials (DB-only hook).
	const loginPost = (req, res) => {
		const uid = req.params.uid;
		const body = req.body || {};
		const username = body.username;
		const password = body.password;
		const ip = clientIp(req);

		if (!csrfOk(uid, body.csrf)) {
			audit.write({ event: 'login_failed', username, ip, detail: { reason: 'csrf' } });
			sendHtml(res, 403, renderLogin({ uid, error: 'Your session expired. Please try again.' }));
			return;
		}

		const gate = throttle.check({ username, ip });
		if (!gate.allowed) {
			audit.write({ event: 'login_failed', username, ip, detail: { reason: 'throttled' } });
			sendHtml(res, 429, renderLogin({ uid, error: 'Too many attempts. Please wait a few minutes and try again.' }));
			return;
		}

		credentialHook({ username, password }, (err, result) => {
			const account = result && result.account;
			if (err || !account) {
				throttle.recordFailure({ username, ip });
				audit.write({ event: 'login_failed', username, ip, detail: { reason: err ? 'error' : 'bad_credential' } });
				sendHtml(res, 401, renderLogin({ uid, error: 'Invalid username or password.' }));
				return;
			}

			throttle.recordSuccess({ username });
			audit.write({ event: 'login_success', sub: account.sub, username: account.username, ip });

			provider
				.interactionResult(req, res, { login: { accountId: account.sub } }, { mergeWithLastSubmission: false })
				.then((redirectTo) => {
					harden(res);
					res.status(303).set('Location', redirectTo).send();
				})
				.catch((resultErr) => {
					xLog && xLog.error(`[${moduleName}] interactionResult(login) failed: ${resultErr}`);
					sendHtml(res, 500, renderLogin({ uid, error: 'Something went wrong. Please try again.' }));
				});
		});
	};

	// ------------------------------------------------------------------
	// POST /oauth/interaction/:uid/confirm — grant or deny consent.
	const confirmPost = (req, res) => {
		const uid = req.params.uid;
		const body = req.body || {};

		if (!csrfOk(uid, body.csrf)) {
			sendHtml(res, 403, `<p>Your session expired. Please start again.</p>`);
			return;
		}

		if (body.decision !== 'allow') {
			// Denial — tell the provider the end-user refused.
			const denyResult = { error: 'access_denied', error_description: 'End-user denied the request' };
			provider
				.interactionResult(req, res, denyResult, { mergeWithLastSubmission: false })
				.then((redirectTo) => {
					harden(res);
					res.status(303).set('Location', redirectTo).send();
				})
				.catch(() => sendHtml(res, 500, '<p>Something went wrong.</p>'));
			return;
		}

		provider
			.interactionDetails(req, res)
			.then((details) => {
				const { prompt, params, session } = details;
				const accountId = session && session.accountId;
				let grant;
				if (details.grantId) {
					return provider.Grant.find(details.grantId).then((g) => ({ grant: g, prompt, params, accountId }));
				}
				grant = new provider.Grant({ accountId, clientId: params.client_id });
				return { grant, prompt, params, accountId };
			})
			.then(({ grant, prompt, params }) => {
				const details = prompt.details || {};
				if (details.missingOIDCScope) {
					grant.addOIDCScope(details.missingOIDCScope.join(' '));
				}
				if (details.missingResourceScopes) {
					Object.entries(details.missingResourceScopes).forEach(([resource, scopes]) => {
						grant.addResourceScope(resource, scopes.join(' '));
					});
				}
				// When the prompt did not enumerate missing scopes (fresh grant),
				// grant exactly what was requested for our resource.
				if (!details.missingOIDCScope && params.scope) {
					grant.addOIDCScope(params.scope);
				}
				return grant.save().then((grantId) => ({ grantId, params }));
			})
			.then(({ grantId, params }) => {
				audit.write({ event: 'consent_granted', clientId: params.client_id, detail: { grantId, scope: params.scope, resource: params.resource } });
				return provider.interactionResult(req, res, { consent: { grantId } }, { mergeWithLastSubmission: true });
			})
			.then((redirectTo) => {
				harden(res);
				res.status(303).set('Location', redirectTo).send();
			})
			.catch((err) => {
				xLog && xLog.error(`[${moduleName}] confirm failed: ${err}`);
				sendHtml(res, 500, '<p>Something went wrong completing authorization.</p>');
			});
	};

	// ------------------------------------------------------------------
	// REGISTRATION — specific routes BEFORE the provider's /oauth delegate.
	expressApp.get(`${interactionPath}/:uid`, interactionPage);
	expressApp.post(`${interactionPath}/:uid/login`, loginPost);
	expressApp.post(`${interactionPath}/:uid/confirm`, confirmPost);

	xLog && xLog.status(`[${moduleName}] interaction routes mounted at ${interactionPath}/:uid`);

	return { csrfToken };
};

module.exports = moduleFunction;
