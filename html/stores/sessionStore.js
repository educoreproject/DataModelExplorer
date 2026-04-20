// @concept: [[SessionPersistence]]
// @concept: [[PiniaStorePattern]]
import { defineStore } from 'pinia';
import axios from 'axios';
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
				const response = await axios.get('/api/dmeSessionList', {
					headers: { ...loginStore.getAuthTokenProperty },
				});
				this.sessions = response.data;
			} catch (err) {
				const status = err.response?.status;
				this.statusMsg = status
					? `Failed to load sessions (${status})`
					: (err.message || 'Failed to load sessions');
				this.sessions = [];
			} finally {
				this.loading = false;
			}
		},

		async deleteSession(refId) {
			try {
				const loginStore = useLoginStore();
				await axios.delete(
					`/api/dmeSessionDelete?refId=${encodeURIComponent(refId)}`,
					{
						headers: { ...loginStore.getAuthTokenProperty },
					},
				);
				// Refresh the list
				await this.fetchSessions();
				return true;
			} catch (err) {
				const status = err.response?.status;
				this.statusMsg = status
					? `Delete failed (${status})`
					: (err.message || 'Delete failed');
				return false;
			}
		},
	},

	getters: {
		sessionCount: (state) => state.sessions.length,
	},
});
