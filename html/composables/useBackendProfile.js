// Runtime backend-profile resolver.
//
// Reads the educoreDevServer cookie, looks the name up in the registry, and
// returns a uniform { source, name, label, wsHost, apiBase } shape. Callers
// do not branch on whether the source is 'cookie' or 'default'.
//
// Production safety: when the page itself is served from educore.tqtmp.org,
// the cookie is ignored outright — an admin who somehow sets it on the prod
// domain cannot redirect prod traffic to an attacker-controlled backend.
//
// Unknown cookie values silently fall through to the default, so a typo
// cannot break the UI.

import { backendProfiles } from '@/config/backendProfiles';

export const COOKIE_NAME = 'educoreDevServer';

const readCookie = (name) => {
	if (typeof document === 'undefined') return null;
	const match = document.cookie
		.split('; ')
		.find((row) => row.startsWith(`${name}=`));
	return match ? decodeURIComponent(match.split('=')[1]) : null;
};

export const useBackendProfile = () => {
	const rc = useRuntimeConfig().public;

	const onProdDomain = typeof window !== 'undefined'
		&& /educore\.tqtmp\.org$/i.test(window.location.hostname);

	if (!onProdDomain) {
		const name = readCookie(COOKIE_NAME);
		if (name && backendProfiles[name]) {
			return {
				source: 'cookie',
				name,
				label: backendProfiles[name].label,
				wsHost: backendProfiles[name].wsHost,
				apiBase: backendProfiles[name].apiBase,
			};
		}
	}

	// Cookieless safety default: a page served from localhost talks to the LOCAL
	// backend, never silently to production. A dev browser with no local server
	// then fails loud (connection refused) rather than quietly serving prod data.
	// The explicit cookie still wins (handled above); the production domain is
	// unaffected (onProdDomain short-circuits before this point).
	const localHosts = ['localhost', '127.0.0.1', '::1'];
	const onLocalhost = typeof window !== 'undefined'
		&& localHosts.includes(window.location.hostname);

	if (onLocalhost && backendProfiles.qbook) {
		return {
			source: 'localhost',
			name: 'qbook',
			label: backendProfiles.qbook.label,
			wsHost: backendProfiles.qbook.wsHost,
			apiBase: backendProfiles.qbook.apiBase,
		};
	}

	const defaultHost = rc.wsHost || (typeof window !== 'undefined' ? window.location.host : 'unknown');
	return {
		source: 'default',
		name: rc.deployment || 'default',
		label: `Default (${defaultHost})`,
		wsHost: rc.wsHost,
		apiBase: rc.apiBase,
	};
};

export const setBackendProfile = (name) => {
	if (!backendProfiles[name]) {
		throw new Error(`Unknown backend profile: ${name}`);
	}
	const maxAge = 60 * 60 * 24 * 180;
	document.cookie = `${COOKIE_NAME}=${encodeURIComponent(name)}; path=/; max-age=${maxAge}; SameSite=Lax`;
};

export const clearBackendProfile = () => {
	document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
};
