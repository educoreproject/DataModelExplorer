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
	// Cached most-recent auth headers, so a synchronous unload handler (pagehide) can read the
	// bearer token without awaiting — sendBeacon must fire synchronously as the page is torn down.
	let lastAuthHeaders = {};

	// Internal helper — resolves getAuthHeaders to a header object, or {}.
	const resolveAuthHeaders = async () => {
		if (typeof getAuthHeaders !== 'function') return {};
		try {
			const headers = await getAuthHeaders();
			lastAuthHeaders = headers || {};
			return lastAuthHeaders;
		} catch (err) {
			console.warn(`[${storeId}] getAuthHeaders threw:`, err);
			return {};
		}
	};

	// Synchronous bearer-token accessor for the unload beacon (no await possible at pagehide).
	const currentBearerToken = () => {
		const auth = (lastAuthHeaders && (lastAuthHeaders.Authorization || lastAuthHeaders.authorization)) || '';
		return auth.replace(/^Bearer\s+/i, '');
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
			// Authoritative "unsaved live writes" mirror (doc 12). Refreshed from the
			// server status endpoint; drives the switch + unload guards. Set false on
			// open/save/close; refreshStatus() pulls the server's truth.
			isDirty: false,
			versionStatusMsg: '',
			// True from the moment a version open starts until it resolves. While true the
			// live clone is still provisioning, so User-mode querying is blocked (sendPrompt
			// guard) and the input box is replaced by a loading overlay.
			openInFlight: false,
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
				// Race guard: in User mode the live clone is provisioned asynchronously and
				// takes several seconds. Until the open resolves (openInFlight) and a version
				// is active, the server has no graph to query — block the send rather than
				// fire a prompt that rides out with activeVersionRefId=null.
				if (this.settings.graphMode === 'user' && (this.openInFlight || !this.activeVersionRefId)) {
					this.statusMsg = this.openInFlight
						? 'Graph still opening — please wait...'
						: 'No graph open — choose a version first';
					console.warn(`[dmeOpenTrace] store.sendPrompt: BLOCKED — graphMode=user openInFlight=${this.openInFlight} activeVersionRefId=${this.activeVersionRefId}`);
					return;
				}
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
				console.log(`[dmeOpenTrace] store.sendPrompt: sending prompt — graphMode='${this.settings.graphMode}' activeVersionRefId=${this.activeVersionRefId}${this.settings.graphMode === 'user' && !this.activeVersionRefId ? ' <<< USER MODE WITH NO ACTIVE VERSION — server will report no graph' : ''}`);
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
				console.log(`[dmeOpenTrace] store.setGraphMode: graphMode now '${this.settings.graphMode}' (activeVersionRefId=${this.activeVersionRefId})`);
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
					console.log(`[dmeOpenTrace] store.listVersions: loaded ${this.availableVersions.length} versions`, this.availableVersions.map(v => ({ refId: v.refId, name: v.versionName, userNodeCount: v.userNodeCount })));
				} catch (err) {
					console.error(`[dmeOpenTrace] store.listVersions: FAILED`, err);
					this.availableVersions = [];
				}
			},

			async newVersion(versionName) {
				// No client-side default name — the server auto-names distinctly (a timestamp
				// with seconds) when none is given, so the selector never shows duplicate
				// "Untitled version" rows.
				return this._openCall({ new: true, versionName });
			},

			async openVersion(versionRefId) {
				// Guard against a null/empty selection (e.g. a v-select emitting
				// update:modelValue with no value). Never round-trip an empty open — that
				// path previously fell through the server gate and minted a stray version.
				console.log(`[dmeOpenTrace] store.openVersion: called with versionRefId=${versionRefId}`);
				if (!versionRefId) { console.warn(`[dmeOpenTrace] store.openVersion: empty versionRefId — NO-OP (returning null)`); return null; }
				return this._openCall({ versionRefId });
			},

			async _openCall(body) {
				// Req 1 (doc 12): opening a graph DEALLOCATES the incumbent — the real cure
				// for "clone cap reached (3 concurrent)". Close a DIFFERENT active version
				// first (tears down its clone + clears its live block); a same-version reopen
				// is a no-op switch and must NOT close+reopen itself.
				const targetRefId = body && body.versionRefId;
				const reopeningSame = !!targetRefId && targetRefId === this.activeVersionRefId;
				console.log(`[dmeOpenTrace] store._openCall: ENTRY body=`, JSON.parse(JSON.stringify(body || {})), `incumbentActiveVersionRefId=${this.activeVersionRefId} reopeningSame=${reopeningSame}`);
				this.openInFlight = true;
				console.log('[dmeOpenTrace] store._openCall: UI LOCKED (openInFlight=true) — provisioning graph, querying blocked');
				if (this.activeVersionRefId && !reopeningSame) {
					console.log(`[dmeOpenTrace] store._openCall: deallocating incumbent ${this.activeVersionRefId} before open`);
					await this.closeGraph();
				}
				this.versionStatusMsg = 'Opening…';
				try {
					const authHeaders = await resolveAuthHeaders();
					console.log(`[dmeOpenTrace] store._openCall: POST /api/dme-user-graph-open ...`);
					const response = await axios.post('/api/dme-user-graph-open', body, {
						headers: { 'Content-Type': 'application/json', ...authHeaders },
					});
					console.log(`[dmeOpenTrace] store._openCall: HTTP ${response.status} response.data=`, response.data);
					const result = response.data && response.data[0];
					if (result) {
						this.activeVersionRefId = result.versionRefId;
						this.activeVersionName = (result.identityMarker && result.identityMarker.versionName) || '';
						this.isReadOnly = !!result.readOnly;
						this.versionStatusMsg = result.readOnly ? 'Read-only (open elsewhere)' : '';
						// Fresh provision (or owner-reclaim) replayed the durable stateScript:
						// the live clone matches the saved state, so nothing is unsaved yet.
						this.isDirty = false;
						console.log(`[dmeOpenTrace] store._openCall: result OK -> activeVersionRefId=${this.activeVersionRefId} activeVersionName="${this.activeVersionName}" isReadOnly=${this.isReadOnly}`);
					} else {
						console.warn(`[dmeOpenTrace] store._openCall: response had NO result object (response.data[0] falsy) — activeVersionRefId stays ${this.activeVersionRefId}`);
					}
					await this.listVersions();
					console.log(`[dmeOpenTrace] store._openCall: RETURNING result=`, result ? JSON.parse(JSON.stringify(result)) : result);
					this.openInFlight = false;
					console.log(`[dmeOpenTrace] store._openCall: UI UNLOCKED (openInFlight=false) — open done, activeVersionRefId=${this.activeVersionRefId}`);
					// On a successful User-mode activation, inject a dedicated, fully-visible
					// askMilo turn announcing the switch and asking for a brief characterization.
					// Routed through the normal sendPrompt path so the prompt + reply render as a
					// real turn, and it rides the SAME conversation session (resume) — no reset.
					if (result && this.settings.graphMode === 'user') {
						const switchedName = this.activeVersionName || 'this graph';
						console.log(`[dmeOpenTrace] store._openCall: injecting graph-switch turn for "${switchedName}"`);
						this.sendPrompt(`Graph switched to ${switchedName}. Tell me about it briefly.`);
					}
					return result;
				} catch (err) {
					console.error(`[dmeOpenTrace] store._openCall: open FAILED (catch) — status=${err && err.response && err.response.status} body=`, err && err.response && err.response.data, err);
					this.versionStatusMsg = 'Open failed';
					this.openInFlight = false;
					console.log('[dmeOpenTrace] store._openCall: UI UNLOCKED (openInFlight=false) — open FAILED, querying re-enabled');
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
					this.isDirty = false;
					this.versionStatusMsg = `Saved ${new Date().toLocaleTimeString()}`;
					await this.listVersions();
					return true;
				} catch (err) {
					console.error(`[${storeId}] saveGraph failed:`, err);
					this.versionStatusMsg = 'Save failed';
					return false;
				}
			},

			// Window-unload close: navigator.sendBeacon a {versionRefId, token} body to the public
			// beacon endpoint, which the browser guarantees to deliver as the page is torn down —
			// frees the live clone in ~1s instead of waiting for the 15-min reaper. Fully synchronous
			// (no await possible at pagehide); reads the cached bearer token. Reaper stays as backstop.
			closeGraphBeacon() {
				if (!this.activeVersionRefId) return;
				const token = currentBearerToken();
				if (!token) { console.warn('[dmeOpenTrace] closeGraphBeacon: no cached token — skipping'); return; }
				try {
					const payload = JSON.stringify({ versionRefId: this.activeVersionRefId, token });
					const blob = new Blob([payload], { type: 'application/json' });
					const ok = navigator.sendBeacon('/api/dme-user-graph-close-beacon', blob);
					console.log(`[dmeOpenTrace] closeGraphBeacon: sendBeacon ${ok ? 'queued' : 'FAILED'} for ${this.activeVersionRefId}`);
				} catch (e) {
					console.warn('[dmeOpenTrace] closeGraphBeacon error:', e);
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
				this.isDirty = false;
				this.versionStatusMsg = '';
			},

			// Pull the authoritative open/dirty state for the active version (doc 12).
			// The panel calls this when an askMilo response finishes streaming, so the
			// SYNCHRONOUS unload check and the switch guard read an accurate isDirty mirror.
			async refreshStatus() {
				if (!this.activeVersionRefId) {
					this.isDirty = false;
					return;
				}
				try {
					const authHeaders = await resolveAuthHeaders();
					const response = await axios.get(
						`/api/dme-user-graph-status?versionRefId=${encodeURIComponent(this.activeVersionRefId)}`,
						{ headers: { ...authHeaders } },
					);
					const row = Array.isArray(response.data) ? response.data[0] : null;
					this.isDirty = !!(row && row.dirty);
				} catch (err) {
					console.error(`[${storeId}] refreshStatus failed:`, err);
				}
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
