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
