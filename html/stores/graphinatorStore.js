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
			ws = new WebSocket(
				`${protocol}//${window.location.host}/ws/graphinator`,
			);

			ws.onopen = () => {
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

			ws.onclose = () => {
				this.connected = false;
			};

			ws.onerror = () => {
				this.statusMsg = 'WebSocket connection failed';
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
