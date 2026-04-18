// @concept: [[WebSocketGraphTool]]
// @concept: [[DataModelExplorer]]
// @concept: [[PiniaStorePattern]]
// createGraphinatorStore.js
//
// -------------------------------------------------------------------------
// Phase 0 decision (liveDataStores branch, 2026-04-17):
//
// This top-level file is the AUTHORITATIVE copy. The stale copy at
// html/layers/graphinator/stores/createGraphinatorStore.js (and the sibling
// GraphinatorPanel.vue, DownloadButton.vue, buildZip.js, and composables/
// inside the layer) were deleted along with the layer itself. The
// `extends: ['./layers/graphinator']` line in html/nuxt.config.ts and the
// associated `preserveSymlinks: true` vite setting were removed at the same
// time.
//
// Rationale:
//   - The layer was introduced in commit a644d77 ("Move Graphinator UI into
//     a self-contained Nuxt layer") to enable sharing with qbookInternal as
//     a symlinked upstream. That symlink was replaced with real files in
//     commit fdc11b6, at which point the layer became a duplicate rather
//     than an upstream.
//   - After a644d77, both sides were edited independently. Top-level files
//     were updated in commits 1cae736 ("Fix prompt/message debug leakage,
//     hostname-driven client config") and 35212f6 ("Fix cid rendering and
//     panel overflow in Graphinator UI"). The layer copies received no
//     corresponding updates.
//   - The only pages that consume the store (`html/pages/dm/explorer.vue`
//     and `html/pages/explore/use-cases/[id].vue`) import directly from
//     `@/stores/createGraphinatorStore`, resolving to this top-level file.
//     GraphinatorPanel is auto-imported; Nuxt resolves top-level over layer.
//     The layer copies were dead code.
//
// WebSocket-host diff between the two copies (this file vs layer):
//   TOP-LEVEL (this file, authoritative):
//     const rc = useRuntimeConfig().public;
//     const wsHost = rc.wsHost || window.location.host;
//   LAYER (deleted):
//     const wsHost = import.meta.dev ? `localhost:${devPort}` : window.location.host;
// The top-level approach is what the hostname-driven deployment profile in
// nuxt.config.ts is designed around; the layer's import.meta.dev branch was
// the pre-hostname-profile pattern.
//
// GraphinatorPanel.vue diff summary: top-level has the current edu-theme
// UI (fullscreen toggle, Response/Activity/Visualization labels, teal
// palette, CSS variables). Layer copy had the older STDOUT/STDERR/CONTROL
// labels and hardcoded blue palette. See git log html/components/
// GraphinatorPanel.vue — 35212f6 and 1cae736 are the updates that did not
// propagate to the layer.
// -------------------------------------------------------------------------
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
import { useUserDataStore } from '@/stores/userDataStore';

// WebSocket reference kept outside reactive state (one per store instance)
const wsInstances = {};

export function createGraphinatorStore({
	storeId = 'graphinatorStore',
	wsPath = '/ws/graphinator',
	devPort = 7790,
	defaultPromptName = 'default',
	defaultModel = 'opus',
	getUserRole = null,   // function returning current user role — called at config-receive time, not factory-creation time
} = {}) {
	return defineStore(storeId, {
		state: () => ({
			responses: [],     // Array of { prompt, stdout, stderr, controlHtml, timestamp }
			currentIndex: -1,  // Which slide is displayed (-1 = none/welcome)
			loading: false,
			lastHeartbeat: null,
			connected: false,
			statusMsg: '',
			availableTools: [],
			availablePrompts: [],
			_rawConfig: null,   // Stashed server config for deferred role application
			roleResolved: false, // True once role-based tool filtering has completed
			_activeSessionRefId: null,
			_activeSessionName: '',
			_saveInFlight: false,
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

		getters: {
			currentResponse: (state) => {
				if (state.currentIndex >= 0 && state.currentIndex < state.responses.length) {
					return state.responses[state.currentIndex];
				}
				return null;
			},
			hasResponses: (state) => state.responses.length > 0,
			canNavigatePrev: (state) => state.currentIndex > 0,
			canNavigateNext: (state) => state.currentIndex < state.responses.length - 1,
			responseCount: (state) => state.responses.length,
			displayIndex: (state) => state.currentIndex + 1,
			isViewingLatest: (state) => state.currentIndex === state.responses.length - 1,

			// Saved conversations live in userDataStore; expose a read-through
			// getter so existing GraphinatorPanel template references to
			// graphStore.sessionList keep working.
			sessionList() {
				return useUserDataStore().savedConversations;
			},
		},

		actions: {
			// Apply role-based tool filtering from stashed config.
			// If the role isn't available yet (login still in flight), retry up to 3 seconds.
			_applyRoleConfig(retryCount = 0) {
				const cfg = this._rawConfig;
				if (!cfg || !cfg.availableTools) return;

				const userRole = getUserRole ? getUserRole() : null;
				const roleConfig = (cfg.toolsByRole && userRole)
					? cfg.toolsByRole[userRole]
					: null;

				if (!roleConfig && retryCount < 6) {
					// Role not available yet — retry in 500ms
					setTimeout(() => this._applyRoleConfig(retryCount + 1), 500);
					return;
				}

				if (roleConfig) {
					if (roleConfig.available === 'getAllFromAskMilo') {
						this.availableTools = cfg.availableTools;
					} else {
						const allowed = roleConfig.available.map(t => t.toLowerCase());
						this.availableTools = cfg.availableTools.filter(
							t => allowed.includes(t.toLowerCase())
						);
					}
					const roleDefaults = roleConfig.default.map(t => t.toLowerCase());
					this.settings.tools = this.availableTools.filter(
						t => roleDefaults.includes(t.toLowerCase())
					);
				}
				this.roleResolved = true;
			},

			connect() {
				if (wsInstances[storeId] && wsInstances[storeId].readyState <= 1) return;

				const protocol =
					window.location.protocol === 'https:' ? 'wss:' : 'ws:';
				// WebSocket host is driven by the deployment profile resolved in
				// nuxt.config.ts from the Nuxt machine's hostname. In dev this points
				// to the local API server (default localhost:7790); in production it
				// is empty, and we fall back to window.location.host (nginx routes
				// the /ws/ upgrade to the API server port).
				const rc = useRuntimeConfig().public;
				const wsHost = rc.wsHost || window.location.host;
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
							// Stash raw config for deferred role application
							this._rawConfig = cfg;
							this._applyRoleConfig();
						}
						if (cfg.availablePrompts) {
							this.availablePrompts = cfg.availablePrompts;
						}
						return;
					}

					if (msg.channel === 'stdout') {
						const current = this.responses[this.responses.length - 1];
						if (current) current.stdout += msg.delta;
					} else if (msg.channel === 'stderr') {
						const current = this.responses[this.responses.length - 1];
						if (current) current.stderr += msg.delta;
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
						// Auto-save session
						this._saveSession();
					}
				};

				ws.onclose = (event) => {
					console.log(`[${storeId}] WebSocket closed: code=${event.code} reason=${event.reason}`);
					this.connected = false;
					// If we were loading, the connection dropped mid-query
					if (this.loading) {
						const current = this.responses[this.responses.length - 1];
						if (current) {
							current.stderr += `<span class="ws-error">CONNECTION LOST — WebSocket closed (code: ${event.code}). Your query may still be running on the server but results cannot be delivered. Try submitting again.</span>\n`;
						}
						this.loading = false;
						this.lastHeartbeat = null;
					}
				};

				ws.onerror = (event) => {
					console.error(`[${storeId}] WebSocket error:`, event);
					this.connected = false;
					const current = this.responses.length > 0 ? this.responses[this.responses.length - 1] : null;
					if (current) {
						current.stderr += `<span class="ws-error">WEBSOCKET ERROR — Connection failed. Check network and try again.</span>\n`;
					}
					this.statusMsg = 'WebSocket connection failed';
				};
			},

			sendPrompt(text) {
				const ws = wsInstances[storeId];
				if (!ws || ws.readyState !== 1) {
					this.statusMsg = 'Not connected';
					return;
				}

				this.responses.push({
					prompt: text,
					stdout: '',
					stderr: '',
					controlHtml: '',
					timestamp: Date.now(),
				});
				this.currentIndex = this.responses.length - 1;
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
				const current = this.currentResponse;
				if (current) {
					current.stdout = '';
					current.stderr = '';
					current.controlHtml = '';
				}
				this.statusMsg = '';
			},

			startNewSession() {
				this.responses = [];
				this.currentIndex = -1;
				this.settings.resumeSessionName = '';
				this.settings.newSession = true;
				this._activeSessionRefId = null;
				this._activeSessionName = '';
			},

			navigatePrev() {
				if (this.currentIndex > 0) this.currentIndex--;
			},

			navigateNext() {
				if (this.currentIndex < this.responses.length - 1) this.currentIndex++;
			},

			// Auto-save session to server (fire-and-forget).
			// Delegates persistence to userDataStore; keeps local active-session meta.
			async _saveSession() {
				if (this._saveInFlight) return;
				if (this.responses.length === 0) return;

				this._saveInFlight = true;

				const payload = { sessionData: this.responses };
				if (this._activeSessionRefId) {
					payload.refId = this._activeSessionRefId;
				}

				const saved = await useUserDataStore().saveSavedConversation(payload);
				if (saved) {
					this._activeSessionRefId = saved.refId;
					this._activeSessionName = saved.sessionName || '';
				}
				this._saveInFlight = false;
			},

			// Populate userDataStore.savedConversations (sessionList getter reads from there).
			async fetchSessionList() {
				await useUserDataStore().fetchSavedConversations();
			},

			// Load a saved conversation and apply its data to the local graph panel.
			async loadSession(refId) {
				const session = await useUserDataStore().loadSavedConversation(refId);
				if (!session) return;

				const sessionData = typeof session.sessionData === 'string'
					? JSON.parse(session.sessionData)
					: session.sessionData;

				this.responses = sessionData;
				this.currentIndex = sessionData.length - 1;
				this._activeSessionRefId = session.refId;
				this._activeSessionName = session.sessionName || '';
				this.settings.newSession = false;
			},

			// Delete via userDataStore; clear local active-session meta if it was the active one.
			async deleteSession(refId) {
				const ok = await useUserDataStore().deleteSavedConversation(refId);
				if (!ok) return;
				if (this._activeSessionRefId === refId) {
					this._activeSessionRefId = null;
					this._activeSessionName = '';
				}
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
