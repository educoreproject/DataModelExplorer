// Named backend profiles for the dev-server cookie selector.
// Key is the cookie value; object is the resolved { wsHost, apiBase }.
// To add a profile: drop an entry here. No server changes required.

export const backendProfiles = {
	qbook: {
		label: 'TQ local (qbook)',
		wsHost: 'localhost:7790',
		apiBase: 'http://localhost:7790/api',
	},
	educoreProd: {
		label: 'Production (educore.tqtmp.org)',
		wsHost: 'educore.tqtmp.org',
		apiBase: 'https://educore.tqtmp.org/api',
	},
	// Add additional profiles here as needed.
};
