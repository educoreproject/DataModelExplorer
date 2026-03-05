import { defineStore } from 'pinia';
import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

// WebSocket reference kept outside reactive state
let ws = null;

export const useAskMiloStore = defineStore('askMiloStore', {
	state: () => ({
		stdout: '',
		sessionStdout: '',
		stderr: '',
		loading: false,
		connected: false,
		statusMsg: '',
		availableTools: [],
		settings: {
			model: 'opus',
			perspectives: 0,
			summarize: true,
			agentModel: 'sonnet',
			serialFanOut: true,
			tools: [],
			promptName: 'default',
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
			// index.html for ANY unrecognized path — including /ws/askmilo. This
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
			const url = `${protocol}//${wsHost}/ws/askmilo`;

			console.log(`[askMilo] Connecting to ${url}`);

			try {
				ws = new WebSocket(url);
			} catch (err) {
				console.error('[askMilo] WebSocket constructor threw:', err);
				this.statusMsg = `WebSocket creation failed: ${err.message}`;
				this.connected = false;
				return;
			}

			ws.onopen = () => {
				console.log('[askMilo] WebSocket connected');
				this.connected = true;
				this.statusMsg = '';
			};

			ws.onmessage = (event) => {
				const msg = JSON.parse(event.data);

				if (msg.channel === 'config') {
					const cfg = msg.config || {};
					if (cfg.defaultTools) {
						this.settings.tools = cfg.defaultTools;
					}
					if (cfg.availableTools) {
						this.availableTools = cfg.availableTools;
					}
					return;
				}

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
				console.log(`[askMilo] WebSocket closed: code=${event.code} reason=${event.reason}`);
				this.connected = false;
			};

			ws.onerror = (event) => {
				console.error('[askMilo] WebSocket error:', event);
				this.statusMsg = `WebSocket connection failed (see browser console for details)`;
				this.connected = false;
			};
		},

		sendPrompt(text) {
			if (!ws || ws.readyState !== 1) {
				this.statusMsg = 'Not connected';
				return;
			}

			if (this.stdout) {
				this.sessionStdout += this.stdout + '\n\n';
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
			this.sessionStdout = '';
			this.settings.resumeSessionName = '';
			this.settings.newSession = true;
		},

		// Generic utility AI call (prompt in, response out)
		// Uses the /api/askmilo-utility endpoint via Nuxt proxy, not WebSocket
		async utilityCall(prompt, model = 'haiku') {
			const loginStore = useLoginStore();
			try {
				const response = await axios.post(
					'/api/askmilo-utility',
					{ prompt, model },
					{ headers: { ...loginStore.getAuthTokenProperty } },
				);
				return response.data.response;
			} catch (err) {
				console.error('[askMilo] utilityCall error:', err);
				this.statusMsg = err.response?.data || err.message;
				return null;
			}
		},

		// Download stdout as markdown with AI-suggested filename
		async downloadStdout() {
			const fullContent = this.sessionStdout + this.stdout;
			if (!fullContent) return;

			const snippet = fullContent.slice(0, 500);
			const prompt = `Given this content, suggest a short camelCase filename (no extension, max 40 chars). Reply with ONLY the filename, nothing else.\n\n${snippet}`;

			let filename = await this.utilityCall(prompt, 'haiku');
			if (!filename) {
				filename = 'askMilo-output';
			}
			// Clean up — haiku might add quotes or extension
			filename = filename.replace(/['"`.]/g, '').trim();

			const blob = new Blob([fullContent], { type: 'text/markdown' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${filename}.md`;
			a.click();
			URL.revokeObjectURL(url);
		},

		disconnect() {
			if (ws) {
				ws.close();
				ws = null;
			}
		},
	},
});
