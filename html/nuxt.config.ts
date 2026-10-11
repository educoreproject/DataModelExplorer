import vuetify from 'vite-plugin-vuetify';
import { execSync } from 'child_process';
import os from 'node:os';

const gitCommitHash = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
})();

// Hostname-driven deployment profile.
// Mirrors the server's instanceSpecific/<hostname>/ pattern: the machine running
// Nuxt picks which wsUrl + apiBase the browser should talk to. In production
// (nuxt build), we leave host fields null so the client falls back to
// window.location.host — nginx does the routing. In dev, each developer's
// hostname maps to their local API server port (default 7790).
const hostname = os.hostname();
const isProdBuild = process.env.NODE_ENV === 'production';

const devDeploymentMap: Record<string, { deployment: string; wsHost: string; apiBase: string }> = {
  // 2026-08-07: apiBase moved from https://educore.tqtmp.org/api to the LOCAL server.
  // The websocket already honours a runtime cookie (useBackendProfile), but /api requests are
  // relative URLs handled by nitro's devProxy, whose target is baked from this map when the
  // config loads — so a cookie set to 'qbook' produced a page whose websocket talked to this
  // laptop while every API call went to PRODUCTION. Hours of "the fix isn't working" were
  // actually production failing, with the local server never seeing a single request.
  // Point both at localhost so dev means dev; use the cookie to reach a remote backend.
  'qMini.local': {
    deployment: 'tq-local',
    wsHost: 'localhost:7790',
    apiBase: 'http://localhost:7790/api',
  },
  // Add additional dev hostnames here (e.g., Brandon's machine) as needed.
};

// In production the host fields default to empty (client falls back to
// window.location.host — nginx routes /api and /ws). On platforms without a
// co-located backend (e.g. Vercel), set NUXT_PUBLIC_API_BASE / NUXT_PUBLIC_WS_HOST
// in the build environment to point the SPA at an absolute backend origin.
// These are read at build time during `nuxt generate` and baked into the bundle.
const deploymentProfile = isProdBuild
  ? {
      deployment: process.env.NUXT_PUBLIC_DEPLOYMENT || 'production',
      wsHost: process.env.NUXT_PUBLIC_WS_HOST || '',
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '',
    }
  : devDeploymentMap[hostname] || {
      // UNMAPPED DEV HOSTNAME. This used to default to educore.tqtmp.org, which meant any
      // machine not listed above — a new laptop, a renamed host, a colleague's box — silently
      // ran its whole dev session against PRODUCTION. It defaults to the local API server now.
      // A developer with no local server gets connection-refused, which is the correct and
      // obvious failure. Add your hostname to devDeploymentMap above if the port differs.
      deployment: `dev-${hostname}`,
      wsHost: 'localhost:7790',
      apiBase: 'http://localhost:7790/api',
    };

// STRUCTURAL GUARANTEE (TQ ruling 2026-08-09: "I do not want dev to ever talk to production").
// A dev build MUST resolve to a loopback backend. Twice now a dev browser has spent hours
// talking to production without anything in the UI showing it — once as a phantom "stale
// graph" (AZURE_OCEAN, 2026-07-04) and once as a user-graph repair that appeared not to work
// while every request landed on the server. Habits did not prevent the second occurrence, so
// this is enforced rather than documented: any non-loopback host in a dev profile stops the
// dev server at startup with a message naming the offending value.
if (!isProdBuild) {
	const loopbackPattern = /^(localhost|127\.0\.0\.1|\[?::1\]?)(:\d+)?$/i;
	const hostOf = (value: string) => {
		if (!value) return '';
		const withScheme = /^[a-z]+:\/\//i.test(value) ? value : `http://${value}`;
		try { return new URL(withScheme).host; } catch (e) { return value; }
	};
	['wsHost', 'apiBase'].forEach((key) => {
		const host = hostOf((deploymentProfile as Record<string, string>)[key]);
		if (host && !loopbackPattern.test(host)) {
			throw new Error(
				`nuxt.config: dev build resolved ${key} to a NON-LOCAL host ('${host}'). `
				+ `Dev must never talk to production. Fix devDeploymentMap for hostname '${hostname}'.`,
			);
		}
	});
}

export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',

  // Graphinator UI (GraphinatorPanel, DownloadButton, composables, store)
  // lives in the canonical Nuxt layer at qbookSuperTool. Files there are
  // auto-imported across components/, composables/, and stores/.
  // Educore's own composables/useBackendProfile.js takes precedence over
  // the canonical's stub via Nuxt's extends: layering rules.
  extends: [
    process.env.GRAPHINATOR_CANONICAL_PATH
      || '/Users/tqwhite/tq_usr_bin/qbookSuperTool/system/code/html/shared/graphinator',
  ],

  ssr: false, // Disable server-side rendering for an SPA
  target: 'static', // Set target to 'static' for static site generation

  css: ['~/assets/css/global.css'],

  modules: [
    '@pinia/nuxt',
    (_options, nuxt) => {
      nuxt.hooks.hook('vite:extendConfig', (config) => {
        // @ts-expect-error: Add Vuetify plugin
        config.plugins.push(
          vuetify({
            autoImport: true,
            styles: true, // Ensure styles are included
          })
        );
      });
    },
    // Add other modules here...
  ],

  pinia: {
    autoImports: ['defineStore', ['defineStore', 'definePiniaStore']],
  },

  devtools: {
    enabled: true,
  },

  build: {
    transpile: ['vuetify'],
  },

  vite: {
    resolve: {
      // The layers/graphinator directory is a symlink to qbookInternal's
      // canonical layer during development. Without preserveSymlinks, Vite
      // follows the link to qbookInternal's real path and tries to resolve
      // vue/pinia/marked from that project's node_modules, causing
      // dual-instance errors.
      preserveSymlinks: true,
    },
  },

  devServer: {
    port: 7791, // Set dev server port
    open: true, // Automatically open browser on start
  },

  server: {
    port: process.env.UI_SERVER_PORT || 7791, // Use environment variable for flexibility
    host: '0.0.0.0', // Listen on all network interfaces
  },

  nitro: {
    devProxy: {
      '/api': {
        // Fallback is LOOPBACK, never production — this line was the second of two places a
        // production URL could sneak into a dev build. The guard above has already refused any
        // non-local apiBase by the time this is read, so the fallback only covers an empty one.
        target: `${deploymentProfile.apiBase || 'http://localhost:7790/api'}/`,
        changeOrigin: true,
        prependPath: true,
      },
    },
  },

  // WEBSOCKET PROXY — WHY THERE ISN'T ONE HERE
  //
  // Nuxt 3 in SPA mode (ssr:false) has a catch-all route that serves index.html
  // for any path Nitro doesn't recognize. This fires BEFORE either nitro.devProxy
  // or vite.server.proxy can intercept, so /ws/graphinator gets an HTTP 200
  // (the SPA page) instead of a WebSocket upgrade. No combination of ws:// target,
  // changeOrigin, or proxy location fixes this — it's a Nitro architectural issue.
  //
  // DEV:  graphinatorStore.js uses import.meta.dev to connect directly to port 7790
  // PROD: nginx /ws/ location handles the upgrade (see nginx/educore.tqwhite.com.conf)

  runtimeConfig: {
    public: {
      gitCommitHash,
      deployment: deploymentProfile.deployment,
      wsHost: deploymentProfile.wsHost,    // empty string in prod → store falls back to window.location.host
      apiBase: deploymentProfile.apiBase,  // empty string in prod → store uses relative URLs
    },
  },

  app: {
    head: {
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no',
        },
      ],
      link: [
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300;0,400;0,600;0,700;0,800;1,400&family=DM+Serif+Display:ital@0;1&display=swap',
        },
      ],
    },
  },

  hooks: {
    // Additional hooks can be added here if needed
  },
});