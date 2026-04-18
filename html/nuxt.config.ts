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
  'qMini.local': {
    deployment: 'tq-local',
    wsHost: 'localhost:7790',
    apiBase: 'http://localhost:7790',
  },
  // Add additional dev hostnames here (e.g., Brandon's machine) as needed.
};

const deploymentProfile = isProdBuild
  ? { deployment: 'production', wsHost: '', apiBase: '' }
  : devDeploymentMap[hostname] || {
      deployment: `dev-${hostname}`,
      wsHost: 'localhost:7790',
      apiBase: 'http://localhost:7790',
    };

export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',

  // Graphinator UI (GraphinatorPanel, DownloadButton, composables, store)
  // lives directly in the main project under components/, composables/,
  // and stores/. The self-contained Nuxt layer at layers/graphinator was
  // removed on the liveDataStores branch (Phase 0, 2026-04-17): its copies
  // of those files had diverged from the top-level originals and were
  // unreachable in practice (Nuxt auto-imports resolve top-level over
  // layer; the consuming pages imported the store via `@/stores/...`
  // directly). See createGraphinatorStore.js header for full rationale.

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
        target: `${deploymentProfile.apiBase || 'https://educore.tqtmp.org'}/api/`,
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