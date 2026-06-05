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
import { nextTick } from 'vue';
import axios from 'axios';

// WebSocket reference kept outside reactive state (one per store instance)
const wsInstances = {};

export function createGraphinatorStore({
	storeId = 'graphinatorStore',
	wsPath = '/ws/graphinator',
	devPort = 7790,
	defaultPromptName = 'default',
	defaultModel = 'opus',
	getUserRole = null,   // function returning current user role — called at config-receive time, not factory-creation time

	// Session-persistence endpoints. Defaults to generic graphSession* URLs.
	// Educore passes its existing dmeSession* URLs to preserve table compat.
	sessionEndpoints = {
		save:   '/api/graphSessionSave',
		list:   '/api/graphSessionList',
		load:   '/api/graphSessionLoad',
		delete: '/api/graphSessionDelete',
	},

	// async () => Promise<object> returning auth headers (e.g. { Authorization }).
	// Replaces the previous hardcoded loginStore import so the canonical layer
	// has no dependency on a consumer's @ alias resolution.
	getAuthHeaders = null,
} = {}) {
	// Internal helper — resolves getAuthHeaders to a header object, or {}.
	const resolveAuthHeaders = async () => {
		if (typeof getAuthHeaders !== 'function') return {};
		try {
			const headers = await getAuthHeaders();
			return headers || {};
		} catch (err) {
			console.warn(`[${storeId}] getAuthHeaders threw:`, err);
			return {};
		}
	};

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
			// Multi-tenant version selector (08): the user's graph-state versions, the
			// active version, and whether the current view is read-only (soft lock).
			availableVersions: [],
			activeVersionRefId: null,
			activeVersionName: '',
			isReadOnly: false,
			versionStatusMsg: '',
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
				// Multi-tenant: which graph the user is exploring.
				// 'standard' = the public 18-standard graph (default, unchanged
				// behavior); 'user' = the user's own graph leg. Rides along in
				// the settings broadcast on every prompt (see sendPrompt).
				graphMode: 'standard',
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

				// WebSocket host comes from useBackendProfile(), which layers a
				// runtime cookie override on top of the build-time default from
				// nuxt.config.ts. Default: the hostname-driven profile (remote in
				// dev, window.location.host in prod). Cookie override: one of the
				// registered profiles in html/config/backendProfiles.js. On the
				// prod domain the cookie is ignored regardless of its value.
				const profile = useBackendProfile();
				const wsHost = profile.wsHost || window.location.host;
				// Protocol depends on the target host, not the page. Loopback = ws://,
				// remote host = wss://. In prod the page is https so wss is also right
				// when wsHost falls back to window.location.host.
				const isLocal = /^(localhost|127\.|0\.0\.0\.0)/.test(wsHost);
				const protocol = isLocal ? 'ws:' : 'wss:';
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
					this._reconnectAttempt = 0;
				};

				ws.onmessage = async (event) => {
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
						// GraphinatorPanel's watcher on `loading` fires on the next
						// tick and serializes the rendered DOM (with SVG diagrams)
						// back into resp.controlHtml. Auto-save must wait for that,
						// otherwise the saved sessionData has controlHtml='' and
						// reopening the session shows an empty right-side panel.
						await nextTick();
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

					// Auto-reconnect with exponential backoff unless disconnect()
					// was called explicitly. Without this, an idle-timeout WS
					// close leaves the user stuck on a "Disconnected" indicator
					// with no way to send prompts (sendPrompt short-circuits when
					// the WS isn't open), so subsequent conversations never
					// reach the server and nothing saves.
					if (!this._intentionalClose) {
						const attempt = (this._reconnectAttempt || 0) + 1;
						this._reconnectAttempt = attempt;
						const delay = Math.min(30000, 1000 * Math.pow(2, attempt - 1));
						console.log(`[${storeId}] reconnect attempt ${attempt} in ${delay}ms`);
						setTimeout(() => {
							if (!this._intentionalClose) this.connect();
						}, delay);
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

				// Multi-tenant: the active version rides along in User mode so the server
				// (ws-graphinator) can hand askMilo the versionRefId + internal secret +
				// executor base URL. Null in Standard mode -> server injects nothing.
				ws.send(JSON.stringify({
					type: 'prompt',
					text,
					settings: {
						...this.settings,
						aiToolsSuppressed,
						activeVersionRefId: this.activeVersionRefId,
					},
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

			// Multi-tenant: set which graph the user is exploring.
			// 'standard' | 'user'. The value rides along in the settings broadcast
			// (sendPrompt). The toggle in GraphinatorPanel also v-models this field
			// directly, matching the existing settings-binding pattern.
			setGraphMode(mode) {
				this.settings.graphMode = mode === 'user' ? 'user' : 'standard';
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
					const authHeaders = await resolveAuthHeaders();

					const payload = {
						sessionData: this.responses,
					};
					if (this._activeSessionRefId) {
						payload.refId = this._activeSessionRefId;
					}

					const response = await axios.post(sessionEndpoints.save, payload, {
						headers: {
							'Content-Type': 'application/json',
							...authHeaders,
						},
					});

					const result = response.data;
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
					const authHeaders = await resolveAuthHeaders();

					const response = await axios.get(sessionEndpoints.list, {
						headers: { ...authHeaders },
					});

					// Defensive client-side sort: most-recent createdAt first.
					// updatedAt is unreliable — the table trigger has no WHERE
					// clause and smears updatedAt across all rows on every save,
					// so it can't disambiguate row age.
					const rows = Array.isArray(response.data) ? [...response.data] : [];
					rows.sort((a, b) => {
						const aKey = a.createdAt || 0;
						const bKey = b.createdAt || 0;
						return bKey > aKey ? 1 : bKey < aKey ? -1 : 0;
					});
					this.sessionList = rows;
				} catch (err) {
					console.error(`[${storeId}] Session list failed:`, err);
					this.sessionList = [];
				}
			},

			// Load a saved session
			async loadSession(refId) {
				try {
					const authHeaders = await resolveAuthHeaders();

					const response = await axios.get(`${sessionEndpoints.load}?refId=${encodeURIComponent(refId)}`, {
						headers: { ...authHeaders },
					});

					const result = response.data;
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
					const authHeaders = await resolveAuthHeaders();

					await axios.delete(`${sessionEndpoints.delete}?refId=${encodeURIComponent(refId)}`, {
						headers: { ...authHeaders },
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

			// ---- Multi-tenant version lifecycle (08) ----
			// All call the educore user-graph endpoints; the bolt secret stays server-side.

			async listVersions() {
				try {
					const authHeaders = await resolveAuthHeaders();
					const response = await axios.get('/api/dme-user-graph-list', { headers: { ...authHeaders } });
					this.availableVersions = Array.isArray(response.data) ? response.data : [];
				} catch (err) {
					console.error(`[${storeId}] listVersions failed:`, err);
					this.availableVersions = [];
				}
			},

			async newVersion(versionName = 'Untitled version') {
				return this._openCall({ new: true, versionName });
			},

			async openVersion(versionRefId) {
				return this._openCall({ versionRefId });
			},

			async _openCall(body) {
				this.versionStatusMsg = 'Opening…';
				try {
					const authHeaders = await resolveAuthHeaders();
					const response = await axios.post('/api/dme-user-graph-open', body, {
						headers: { 'Content-Type': 'application/json', ...authHeaders },
					});
					const result = response.data && response.data[0];
					if (result) {
						this.activeVersionRefId = result.versionRefId;
						this.activeVersionName = (result.identityMarker && result.identityMarker.versionName) || '';
						this.isReadOnly = !!result.readOnly;
						this.versionStatusMsg = result.readOnly ? 'Read-only (open elsewhere)' : '';
					}
					await this.listVersions();
					return result;
				} catch (err) {
					console.error(`[${storeId}] open failed:`, err);
					this.versionStatusMsg = 'Open failed';
					return null;
				}
			},

			async saveGraph() {
				if (!this.activeVersionRefId || this.isReadOnly) return false;
				try {
					const authHeaders = await resolveAuthHeaders();
					await axios.post('/api/dme-user-graph-save', { versionRefId: this.activeVersionRefId }, {
						headers: { 'Content-Type': 'application/json', ...authHeaders },
					});
					this.versionStatusMsg = `Saved ${new Date().toLocaleTimeString()}`;
					await this.listVersions();
					return true;
				} catch (err) {
					console.error(`[${storeId}] saveGraph failed:`, err);
					this.versionStatusMsg = 'Save failed';
					return false;
				}
			},

			async closeGraph() {
				if (!this.activeVersionRefId) return;
				try {
					const authHeaders = await resolveAuthHeaders();
					await axios.post('/api/dme-user-graph-close', { versionRefId: this.activeVersionRefId }, {
						headers: { 'Content-Type': 'application/json', ...authHeaders },
					});
				} catch (err) {
					console.error(`[${storeId}] closeGraph failed:`, err);
				}
				this.activeVersionRefId = null;
				this.activeVersionName = '';
				this.isReadOnly = false;
				this.versionStatusMsg = '';
			},

			disconnect() {
				this._intentionalClose = true;
				const ws = wsInstances[storeId];
				if (ws) {
					ws.close();
					wsInstances[storeId] = null;
				}
			},
		},
	});
}
