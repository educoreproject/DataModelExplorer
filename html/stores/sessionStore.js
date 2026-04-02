// @concept: [[SessionPersistence]]
// @concept: [[PiniaStorePattern]]
import { defineStore } from 'pinia';
import { useLoginStore } from '@/stores/loginStore';

export const useSessionStore = defineStore('sessionStore', {
	state: () => ({
		sessions: [],
		loading: false,
		statusMsg: '',
	}),

	actions: {
		async fetchSessions() {
			this.loading = true;
			this.statusMsg = '';
			try {
				const loginStore = useLoginStore();
				const response = await fetch('/api/dmeSessionList', {
					headers: { ...loginStore.getAuthTokenProperty },
				});
				if (!response.ok) {
					this.statusMsg = `Failed to load sessions (${response.status})`;
					this.sessions = [];
					return;
				}
				this.sessions = await response.json();
			} catch (err) {
				this.statusMsg = err.message || 'Failed to load sessions';
				this.sessions = [];
			} finally {
				this.loading = false;
			}
		},

		async deleteSession(refId) {
			try {
				const loginStore = useLoginStore();
				const response = await fetch(
					`/api/dmeSessionDelete?refId=${encodeURIComponent(refId)}`,
					{
						method: 'DELETE',
						headers: { ...loginStore.getAuthTokenProperty },
					},
				);
				if (!response.ok) {
					this.statusMsg = `Delete failed (${response.status})`;
					return false;
				}
				// Refresh the list
				await this.fetchSessions();
				return true;
			} catch (err) {
				this.statusMsg = err.message || 'Delete failed';
				return false;
			}
		},
	},

	getters: {
		sessionCount: (state) => state.sessions.length,
	},
});
