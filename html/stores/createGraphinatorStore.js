// createGraphinatorStore.js
//
// Factory function that creates a Pinia store for the Graphinator panel.
// Parameterized so each consuming project can configure WS endpoint,
// dev port, and defaults without duplicating the store code.
//
// Usage:
//   import { createGraphinatorStore } from '@/stores/createGraphinatorStore';
//   const useGraphStore = createGraphinatorStore({ wsPath: '/ws/graphinator', devPort: 7790 });
//   const graphStore = useGraphStore();

import { defineStore } from 'pinia';

// WebSocket reference kept outside reactive state (one per store instance)
const wsInstances = {};

export function createGraphinatorStore({
	storeId = 'graphinatorStore',
	wsPath = '/ws/graphinator',
	devPort = 7790,
	defaultPromptName = 'graphinator',
	defaultModel = 'opus',
} = {}) {
	return defineStore(storeId, {
		state: () => ({
			stdout: '',
			stderr: '',
			controlHtml: '',
			loading: false,
			lastHeartbeat: null,
			connected: false,
			statusMsg: '',
			availableTools: [],
			availablePrompts: [],
			settings: {
				model: defaultModel,
				perspectives: 0,
				summarize: true,
				agentModel: 'sonnet',
				serialFanOut: true,
				tools: [],
				promptName: defaultPromptName,
				newSession: true,
				resumeSessionName: '',
			},
		}),

		actions: {
			connect() {
				if (wsInstances[storeId] && wsInstances[storeId].readyState <= 1) return;

				// DEV vs PRODUCTION WebSocket routing:
				//
				// DEV: Connect to production server directly (local backend not running).
				// PRODUCTION: nginx handles the upgrade via the /ws/ location block.
				//
				const wsHost = import.meta.dev ? `educore.tqtmp.org` : window.location.host;
				const protocol = import.meta.dev ? 'wss:' : (window.location.protocol === 'https:' ? 'wss:' : 'ws:');
				const url = `${protocol}//${wsHost}${wsPath}`;

				console.log(`[${storeId}] Connecting to ${url}`);

				try {
					wsInstances[storeId] = new WebSocket(url);
				} catch (err) {
					console.error(`[${storeId}] WebSocket constructor threw:`, err);
					this.statusMsg = `WebSocket creation failed: ${err.message}`;
					this.connected = false;
					return;
				}

				const ws = wsInstances[storeId];

				ws.onopen = () => {
					console.log(`[${storeId}] WebSocket connected`);
					this.connected = true;
					this.statusMsg = '';
				};

				ws.onmessage = (event) => {
					const msg = JSON.parse(event.data);

					if (msg.channel === 'config') {
						// Server sends config defaults on connection
						const cfg = msg.config || {};
						if (cfg.availableTools) {
							this.availableTools = cfg.availableTools;
							// Default: all tools selected (nothing suppressed)
							this.settings.tools = [...cfg.availableTools];
						}
						if (cfg.availablePrompts) {
							this.availablePrompts = cfg.availablePrompts;
						}
						return;
					}

					if (msg.channel === 'stdout') {
						this.stdout += msg.delta;
					} else if (msg.channel === 'stderr') {
						this.stderr += msg.delta;
						// Auto-detect session name from stderr.
						// askMilo outputs "Session saved: session_name" via xLog.status.
						const sessionMatch = msg.delta.match(
							/Session saved:\s*(\S+)/,
						);
						if (sessionMatch) {
							this.settings.resumeSessionName = sessionMatch[1];
							this.settings.newSession = false;
						}
					} else if (msg.channel === 'heartbeat') {
						this.lastHeartbeat = Date.now();
					} else if (msg.channel === 'done') {
						this.loading = false;
						this.lastHeartbeat = null;
					}
				};

				ws.onclose = (event) => {
					console.log(`[${storeId}] WebSocket closed: code=${event.code} reason=${event.reason}`);
					this.connected = false;
				};

				ws.onerror = (event) => {
					console.error(`[${storeId}] WebSocket error:`, event);
					this.statusMsg = `WebSocket connection failed (see browser console for details)`;
					this.connected = false;
				};
			},

			sendPrompt(text) {
				const ws = wsInstances[storeId];
				if (!ws || ws.readyState !== 1) {
					this.statusMsg = 'Not connected';
					return;
				}

				this.stdout = '';
				this.stderr = '';
				this.loading = true;
				this.lastHeartbeat = Date.now();
				this.statusMsg = '';

				// Compute suppression list: available tools NOT selected by user
				const aiToolsSuppressed = this.availableTools.filter(
					t => !this.settings.tools.includes(t),
				);

				ws.send(JSON.stringify({
					type: 'prompt',
					text,
					settings: { ...this.settings, aiToolsSuppressed },
				}));
			},

			clear() {
				this.stdout = '';
				this.stderr = '';
				this.statusMsg = '';
			},

			startNewSession() {
				this.stdout = '';
				this.stderr = '';
				this.controlHtml = '';
				this.settings.resumeSessionName = '';
				this.settings.newSession = true;
			},

			disconnect() {
				const ws = wsInstances[storeId];
				if (ws) {
					ws.close();
					wsInstances[storeId] = null;
				}
			},
		},
	});
}
