// Redirects axios /api/* calls to the cookie-selected backend's apiBase.
//
// Default behavior (no cookie): config.url passes through unchanged; the
// request flows to the Nuxt /api proxy and out to the deployment's
// configured remote. When educoreDevServer is set to a known profile, the
// /api prefix is swapped for profile.apiBase (which already ends in /api),
// producing e.g. http://localhost:7790/api/login.
//
// Production is inert: useBackendProfile() short-circuits on the
// educore.tqtmp.org domain and returns source='default', so the rewrite
// branch is never entered regardless of any cookie value.

import axios from 'axios';

export default defineNuxtPlugin(() => {
	axios.interceptors.request.use((config) => {
		const profile = useBackendProfile();

		if (profile.source !== 'cookie' || !profile.apiBase) {
			return config;
		}

		if (!config.url || !config.url.startsWith('/api')) {
			return config;
		}

		config.url = profile.apiBase + config.url.replace(/^\/api/, '');
		return config;
	});
});
