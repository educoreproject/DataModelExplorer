import vuetify from 'vite-plugin-vuetify';
import { execSync } from 'child_process';

const gitCommitHash = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
})();

export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',

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
      // Symlinked shared files (GraphinatorPanel, etc.) live in qbookSuperTool
      // but must resolve their imports (pinia, vue, marked) from THIS project's
      // node_modules. Without this, Vite follows the symlink and looks for
      // dependencies relative to the real file path, causing dual-instance errors.
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
        target: 'https://educore.tqtmp.org/api/',
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
    },
  },

  app: {
    head: {
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no',
        },
        // Add other meta tags as needed
      ],
      // Add other app-level configurations here if needed
    },
  },

  hooks: {
    // Additional hooks can be added here if needed
  },
});