// Named backend profiles for the dev-server cookie selector.
// Key is the cookie value; object is the resolved { wsHost, apiBase }.
// To add a profile: drop an entry here. No server changes required.

export const backendProfiles = {
	qbook: {
		label: 'TQ local (qbook)',
		wsHost: 'localhost:7790',
		apiBase: 'http://localhost:7790/api',
	},
	// REMOVED 2026-08-09 (TQ: "I do not want dev to ever talk to production"):
	//   educoreProd → wsHost/apiBase educore.tqtmp.org
	// Selecting it pointed the websocket at the live server while /api kept going wherever
	// nitro's devProxy was baked to go — one page, two backends, nothing in the UI saying so.
	// To look at production, open the production site. Do not aim a dev page at it.
	//
	// Add additional LOCAL profiles here as needed. nuxt.config refuses to start a dev build
	// whose resolved wsHost/apiBase is not loopback, so a non-local entry will fail loudly.
};
