// @concept: [[PiniaStorePattern]]
// @concept: [[OidcIdentityProvider]]
// @concept: [[AuthenticatedApiCall]]
import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

// ---------------------------------------------------------------------------
// OAUTH ADMIN STORE (dmeMcpOAuth Phase 4.2)
//
// Backs the admin panel's OAuth Access tool: a user's active MCP connections,
// revoke (per-client or all), the DCR client list + disable, and the audit-log
// viewer. Every request carries the website Bearer token (loginStore); the
// endpoints sit behind the STRICT validator + audience firewall, so an MCP
// token can never reach them. Endpoints return arrays (response.data[0]).
// ---------------------------------------------------------------------------

const authHeaders = (extra = {}) => ({ ...extra, ...useLoginStore().getAuthTokenProperty });

export const useOauthAdminStore = defineStore('oauthAdminStore', {
	state: () => ({
		statusMsg: '',
		loading: false,
		connections: [],
		clients: [],
		auditEvents: [],
		selectedUserRef: null,
		selectedUsername: '',
	}),

	actions: {
		clearStatus() {
			this.statusMsg = '';
		},

		// List a user's active connections (one row per client).
		async loadConnections(userRef, username) {
			this.loading = true;
			this.statusMsg = '';
			this.selectedUserRef = userRef;
			this.selectedUsername = username || '';
			try {
				const response = await axios.get('/api/oauthAdminConnections', {
					params: { userRef },
					headers: authHeaders(),
				});
				const result = response.data[0];
				this.connections = (result && result.connections) || [];
				return true;
			} catch (error) {
				this.connections = [];
				this.statusMsg = this._errText(error, 'Failed to load connections');
				return false;
			} finally {
				this.loading = false;
			}
		},

		// Revoke a user's access — one client (clientId) or all (clientId omitted).
		async revoke({ userRef, clientId, targetUsername }) {
			this.loading = true;
			this.statusMsg = '';
			try {
				const response = await axios.post(
					'/api/oauthAdminRevoke',
					{ userRef, clientId, targetUsername },
					{ headers: authHeaders({ 'Content-Type': 'application/json' }) },
				);
				const result = response.data[0];
				this.statusMsg = clientId
					? `Revoked the connection (${result.grantsAffected} grant(s)).`
					: `Revoked ALL access for ${targetUsername || userRef}.`;
				// refresh the connections view so the revoked flag shows immediately
				await this.loadConnections(userRef, targetUsername || this.selectedUsername);
				return true;
			} catch (error) {
				this.statusMsg = this._errText(error, 'Revoke failed');
				return false;
			} finally {
				this.loading = false;
			}
		},

		async loadClients() {
			this.loading = true;
			this.statusMsg = '';
			try {
				const response = await axios.get('/api/oauthAdminClients', { headers: authHeaders() });
				const result = response.data[0];
				this.clients = (result && result.clients) || [];
				return true;
			} catch (error) {
				this.clients = [];
				this.statusMsg = this._errText(error, 'Failed to load clients');
				return false;
			} finally {
				this.loading = false;
			}
		},

		async disableClient(clientId) {
			this.loading = true;
			this.statusMsg = '';
			try {
				const response = await axios.post(
					'/api/oauthAdminDisableClient',
					{ clientId },
					{ headers: authHeaders({ 'Content-Type': 'application/json' }) },
				);
				const result = response.data[0];
				this.statusMsg = `Client disabled (${result.grantsRevoked} grant(s) revoked).`;
				await this.loadClients();
				return true;
			} catch (error) {
				this.statusMsg = this._errText(error, 'Disable client failed');
				return false;
			} finally {
				this.loading = false;
			}
		},

		async loadAudit(filters = {}) {
			this.loading = true;
			this.statusMsg = '';
			try {
				const response = await axios.get('/api/oauthAdminAudit', {
					params: filters,
					headers: authHeaders(),
				});
				const result = response.data[0];
				this.auditEvents = (result && result.events) || [];
				return true;
			} catch (error) {
				this.auditEvents = [];
				this.statusMsg = this._errText(error, 'Failed to load audit log');
				return false;
			} finally {
				this.loading = false;
			}
		},

		_errText(error, defaultMsg) {
			if (error.response?.status === 401) return 'Unauthorized: admin access required';
			if (error.response?.data) return error.response.data.toString();
			if (error.message) return error.message;
			return defaultMsg;
		},
	},
});
