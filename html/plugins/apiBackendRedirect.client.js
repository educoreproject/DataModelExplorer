// Redirects axios /api/* calls to a configured backend's apiBase.
//
// Two cases trigger a rewrite (the /api prefix is swapped for profile.apiBase,
// which already ends in /api, producing e.g. http://localhost:7790/api/login):
//
//   1. A cookie profile is active (educoreDevServer set to a known profile) —
//      works in any environment.
//   2. Production build with a build-time apiBase configured via
//      NUXT_PUBLIC_API_BASE (e.g. a Vercel static deploy with no co-located
//      backend). There is no Nuxt proxy in a static SPA, so a relative /api
//      call would hit the static-hosting origin and 404 — the absolute apiBase
//      is required.
//
// Otherwise config.url passes through unchanged:
//   - In dev, relative /api flows through Nuxt's nitro.devProxy to the remote
//     (avoids browser CORS), so we must NOT rewrite the default profile there.
//   - On the educore.tqtmp.org prod domain, apiBase is empty and nginx proxies
//     /api, so the falsy-apiBase guard leaves the request relative.
//
// NOTE: when case 2 applies, the backend must send CORS headers permitting the
// deploy origin — these become genuine cross-origin requests.

import axios from 'axios';

export default defineNuxtPlugin(() => {
	axios.interceptors.request.use((config) => {
		const profile = useBackendProfile();

		const shouldRewrite =
			profile.apiBase && (profile.source === 'cookie' || !import.meta.dev);
		if (!shouldRewrite) {
			return config;
		}

		if (!config.url || !config.url.startsWith('/api')) {
			return config;
		}

		config.url = profile.apiBase + config.url.replace(/^\/api/, '');
		return config;
	});
});
