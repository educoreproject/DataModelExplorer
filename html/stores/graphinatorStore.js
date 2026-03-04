import { defineStore } from 'pinia';

// WebSocket reference kept outside reactive state
let ws = null;

export const useGraphinatorStore = defineStore('graphinatorStore', {
	state: () => ({
		stdout: '',
		stderr: '',
		controlHtml: '',
		loading: false,
		connected: false,
		statusMsg: '',
		settings: {
			model: 'opus',
			perspectives: 0,
			summarize: true,
			agentModel: 'sonnet',
			serialFanOut: true,
			tools: ['WebSearch', 'WebFetch', 'Read', 'Glob', 'Grep'],
			promptName: 'graphinator',
			newSession: true,
			resumeSessionName: '',
		},
	}),

	actions: {
		connect() {
			if (ws && ws.readyState <= 1) return; // Already connected or connecting

			const protocol =
				window.location.protocol === 'https:' ? 'wss:' : 'ws:';
			// DEV vs PRODUCTION WebSocket routing:
			//
			// PROBLEM: In Nuxt 3 SPA mode (ssr:false), Nitro's catch-all route serves
			// index.html for ANY unrecognized path — including /ws/graphinator. This
			// returns HTTP 200 instead of allowing the WebSocket upgrade handshake.
			// Neither nitro.devProxy nor vite.server.proxy can intercept the request
			// before Nitro's catch-all does. Tested exhaustively with ws://, http://,
			// changeOrigin, and both proxy config locations. It's a Nuxt/Nitro limitation.
			//
			// DEV SOLUTION: Connect directly to the API server on port 7790, bypassing
			// the Nuxt dev server (7791) entirely for WebSocket connections.
			//
			// PRODUCTION: nginx handles the upgrade correctly via the /ws/ location
			// block (see configs/.../nginx/educore.tqwhite.com.conf). The client uses
			// window.location.host, and nginx forwards the upgrade to port 7790.
			//
			const wsHost = import.meta.dev ? 'localhost:7790' : window.location.host;
			const url = `${protocol}//${wsHost}/ws/graphinator`;

			console.log(`[graphinator] Connecting to ${url}`);

			try {
				ws = new WebSocket(url);
			} catch (err) {
				console.error('[graphinator] WebSocket constructor threw:', err);
				this.statusMsg = `WebSocket creation failed: ${err.message}`;
				this.connected = false;
				return;
			}

			ws.onopen = () => {
				console.log('[graphinator] WebSocket connected');
				this.connected = true;
				this.statusMsg = '';
			};

			ws.onmessage = (event) => {
				const msg = JSON.parse(event.data);

				if (msg.channel === 'stdout') {
					this.stdout += msg.delta;
				} else if (msg.channel === 'stderr') {
					this.stderr += msg.delta;
					// Auto-detect session name from stderr.
					// askMilo outputs "Session saved: session_name" via xLog.status.
					// Capture it so the user can resume the session on subsequent prompts.
					const sessionMatch = msg.delta.match(
						/Session saved:\s*(\S+)/,
					);
					if (sessionMatch) {
						this.settings.resumeSessionName = sessionMatch[1];
						this.settings.newSession = false;
					}
				} else if (msg.channel === 'done') {
					this.loading = false;
				}
			};

			ws.onclose = (event) => {
				console.log(`[graphinator] WebSocket closed: code=${event.code} reason=${event.reason}`);
				this.connected = false;
			};

			ws.onerror = (event) => {
				console.error('[graphinator] WebSocket error:', event);
				this.statusMsg = `WebSocket connection failed (see browser console for details)`;
				this.connected = false;
			};
		},

		sendPrompt(text) {
			if (!ws || ws.readyState !== 1) {
				this.statusMsg = 'Not connected';
				return;
			}

			this.stdout = '';
			this.stderr = '';
			this.loading = true;
			this.statusMsg = '';

			ws.send(JSON.stringify({
				type: 'prompt',
				text,
				settings: { ...this.settings },
			}));
		},

		clear() {
			this.stdout = '';
			this.stderr = '';
			this.statusMsg = '';
		},

		startNewSession() {
			this.controlHtml = '';
			this.settings.resumeSessionName = '';
			this.settings.newSession = true;
		},

		disconnect() {
			if (ws) {
				ws.close();
				ws = null;
			}
		},
	},
});
