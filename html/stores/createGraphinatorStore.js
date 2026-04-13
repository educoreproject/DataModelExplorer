// @concept: [[WebSocketGraphTool]]
// @concept: [[DataModelExplorer]]
// @concept: [[PiniaStorePattern]]
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
			sessionList: [],
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

				// DEV: Connect to production server (no local backend).
				// PROD: nginx handles the upgrade via /ws/ location block.
				const wsHost = import.meta.dev ? 'educore.tqtmp.org' : window.location.host;
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

			// Auto-save session to server (fire-and-forget)
			async _saveSession() {
				if (this._saveInFlight) return;
				if (this.responses.length === 0) return;

				this._saveInFlight = true;

				try {
					const { useLoginStore } = await import('@/stores/loginStore');
					const loginStore = useLoginStore();

					const payload = {
						sessionData: this.responses,
					};
					if (this._activeSessionRefId) {
						payload.refId = this._activeSessionRefId;
					}

					const response = await fetch('/api/dmeSessionSave', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							...loginStore.getAuthTokenProperty,
						},
						body: JSON.stringify(payload),
					});

					const result = await response.json();
					if (result && result[0]) {
						this._activeSessionRefId = result[0].refId;
						this._activeSessionName = result[0].sessionName || '';
					}
				} catch (err) {
					console.error(`[${storeId}] Session save failed:`, err);
				} finally {
					this._saveInFlight = false;
				}
			},

			// List user's sessions
			async fetchSessionList() {
				try {
					const { useLoginStore } = await import('@/stores/loginStore');
					const loginStore = useLoginStore();

					const response = await fetch('/api/dmeSessionList', {
						headers: { ...loginStore.getAuthTokenProperty },
					});

					this.sessionList = await response.json();
				} catch (err) {
					console.error(`[${storeId}] Session list failed:`, err);
					this.sessionList = [];
				}
			},

			// Load a saved session
			async loadSession(refId) {
				try {
					const { useLoginStore } = await import('@/stores/loginStore');
					const loginStore = useLoginStore();

					const response = await fetch(`/api/dmeSessionLoad?refId=${encodeURIComponent(refId)}`, {
						headers: { ...loginStore.getAuthTokenProperty },
					});

					const result = await response.json();
					if (result && result[0]) {
						const session = result[0];
						const sessionData = typeof session.sessionData === 'string'
							? JSON.parse(session.sessionData)
							: session.sessionData;

						this.responses = sessionData;
						this.currentIndex = sessionData.length - 1;
						this._activeSessionRefId = session.refId;
						this._activeSessionName = session.sessionName || '';
						this.settings.newSession = false;
					}
				} catch (err) {
					console.error(`[${storeId}] Session load failed:`, err);
				}
			},

			// Delete a session
			async deleteSession(refId) {
				try {
					const { useLoginStore } = await import('@/stores/loginStore');
					const loginStore = useLoginStore();

					await fetch(`/api/dmeSessionDelete?refId=${encodeURIComponent(refId)}`, {
						method: 'DELETE',
						headers: { ...loginStore.getAuthTokenProperty },
					});

					await this.fetchSessionList();

					if (this._activeSessionRefId === refId) {
						this._activeSessionRefId = null;
						this._activeSessionName = '';
					}
				} catch (err) {
					console.error(`[${storeId}] Session delete failed:`, err);
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
