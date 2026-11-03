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

// Hostnames whose nginx reverse-proxies this dev server AND the local API server, so the
// browser must use its own origin for both: relative /api, websocket to window.location.host.
// Without this, a page loaded through the proxy is told to call localhost:7790, which is
// this Mac's loopback only from this Mac.
// dme.qbook.work: added 2026-10-02 (TQ). nginx config:
//   qbookInternal/system/configs/instanceSpecific/qbook/systemConfigsLib/nginx/dme.qbook.work.conf
// The backend is still the LOCAL API server, so this does not breach the dev-never-talks-to-
// production rule; it only changes which address the browser uses to reach it.
export const sameOriginProxyHosts = ['dme.qbook.work'];

// Hostnames served by Vercel, whose vercel.json rewrites /api/* to the backend (2026-11-03: demo.educore.dev, whose
// backend runs main; ed-core.org's ran code from before 2026-10-08 and answered the explorer's routes 404). The browser
// calls the page's own /api, so vercel.json is the one place that names the backend, whatever NUXT_PUBLIC_API_BASE the
// Vercel build was given. A rewrite cannot carry a websocket, so each names the host its websocket opens on directly.
export const vercelApiProxyWsHostByHost = {
	'educore.org': 'demo.educore.dev',
	'www.educore.org': 'demo.educore.dev',
};
