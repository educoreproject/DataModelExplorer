import { defineStore } from 'pinia';

// WebSocket reference kept outside reactive state
let ws = null;

export const useGraphinatorStore = defineStore('graphinatorStore', {
	state: () => ({
		stdout: '',
		stderr: '',
		loading: false,
		connected: false,
		statusMsg: '',
	}),

	actions: {
		connect() {
			if (ws && ws.readyState <= 1) return; // Already connected or connecting

			const protocol =
				window.location.protocol === 'https:' ? 'wss:' : 'ws:';
			// In dev, Nitro intercepts /ws before Vite proxy can upgrade it.
			// Connect directly to the API server for WebSocket.
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

			ws.send(JSON.stringify({ type: 'prompt', text }));
		},

		clear() {
			this.stdout = '';
			this.stderr = '';
			this.statusMsg = '';
		},

		disconnect() {
			if (ws) {
				ws.close();
				ws = null;
			}
		},
	},
});
