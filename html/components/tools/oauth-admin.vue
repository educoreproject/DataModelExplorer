<script setup>
// @concept: [[OidcIdentityProvider]]
// @concept: [[SecurityFirstPattern]]
// dmeMcpOAuth Phase 4.2 — admin panel for OAuth/MCP access: a user's active
// connections with per-client + all Revoke, the DCR client list with Disable,
// and the audit-log viewer. Component owns its own fetches and actions (no
// store-driven navigation), per the browser guidance.
import { ref, onMounted } from 'vue';
import { useAdminStore } from '@/stores/adminStore';
import { useOauthAdminStore } from '@/stores/oauthAdminStore';

const adminStore = useAdminStore();
const oauthStore = useOauthAdminStore();

const users = ref([]);
const selectedUser = ref(null); // a user object { refId, username, ... }

const auditFilter = ref({ event: '', userRef: '', limit: 100 });

const eventTypes = ['', 'access_revoked', 'client_disabled', 'login_success', 'login_failed', 'consent_granted', 'mcp_tool_call', 'mcp_auth_rejected'];

const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString() : '');

const loadUsers = async () => {
	await adminStore.listUsers();
	users.value = adminStore.users || [];
};

const onSelectUser = async (user) => {
	selectedUser.value = user;
	if (user) {
		await oauthStore.loadConnections(user.refId, user.username);
	}
};

const revokeConnection = async (clientId) => {
	if (!selectedUser.value) return;
	await oauthStore.revoke({
		userRef: selectedUser.value.refId,
		clientId,
		targetUsername: selectedUser.value.username,
	});
};

const revokeAll = async () => {
	if (!selectedUser.value) return;
	await oauthStore.revoke({
		userRef: selectedUser.value.refId,
		targetUsername: selectedUser.value.username,
	});
};

const disableClient = async (clientId) => {
	await oauthStore.disableClient(clientId);
};

const runAudit = async () => {
	const filters = { limit: auditFilter.value.limit || 100 };
	if (auditFilter.value.event) filters.event = auditFilter.value.event;
	if (auditFilter.value.userRef) filters.userRef = auditFilter.value.userRef;
	await oauthStore.loadAudit(filters);
};

onMounted(async () => {
	await loadUsers();
	await oauthStore.loadClients();
	await runAudit();
});
</script>

<template>
	<div class="oauth-admin pa-4" style="width: 100%; max-width: 1100px;">
		<v-alert
			v-if="oauthStore.statusMsg"
			type="info"
			variant="tonal"
			closable
			class="mb-4"
			@click:close="oauthStore.clearStatus()"
		>
			{{ oauthStore.statusMsg }}
		</v-alert>

		<v-progress-linear v-if="oauthStore.loading" indeterminate class="mb-2" />

		<!-- USER CONNECTIONS -->
		<v-card variant="outlined" class="mb-6">
			<v-card-title>User Connections</v-card-title>
			<v-card-text>
				<v-select
					:items="users"
					item-title="username"
					return-object
					label="Select a user"
					density="compact"
					hide-details
					class="mb-4"
					style="max-width: 360px;"
					@update:model-value="onSelectUser"
				/>

				<div v-if="selectedUser">
					<div class="d-flex align-center mb-2">
						<strong class="mr-4">{{ selectedUser.username }}</strong>
						<v-btn
							color="error"
							size="small"
							variant="flat"
							:disabled="oauthStore.loading"
							@click="revokeAll"
						>
							Revoke ALL access
						</v-btn>
					</div>

					<v-table density="compact">
						<thead>
							<tr>
								<th>Client</th>
								<th>Client ID</th>
								<th>Scopes</th>
								<th>Status</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="conn in oauthStore.connections" :key="conn.clientId">
								<td>{{ conn.clientName }}</td>
								<td class="text-caption">{{ conn.clientId }}</td>
								<td>{{ conn.scopes }}</td>
								<td>
									<v-chip :color="conn.revoked ? 'error' : 'success'" size="x-small">
										{{ conn.revoked ? 'revoked' : 'active' }}
									</v-chip>
								</td>
								<td>
									<v-btn
										size="x-small"
										color="error"
										variant="outlined"
										:disabled="conn.revoked || oauthStore.loading"
										@click="revokeConnection(conn.clientId)"
									>
										Revoke
									</v-btn>
								</td>
							</tr>
							<tr v-if="oauthStore.connections.length === 0">
								<td colspan="5" class="text-medium-emphasis">No active connections.</td>
							</tr>
						</tbody>
					</v-table>
				</div>
			</v-card-text>
		</v-card>

		<!-- CLIENTS -->
		<v-card variant="outlined" class="mb-6">
			<v-card-title>OAuth Clients</v-card-title>
			<v-card-text>
				<v-table density="compact">
					<thead>
						<tr>
							<th>Name</th>
							<th>Client ID</th>
							<th>Scope</th>
							<th>Status</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="client in oauthStore.clients" :key="client.clientId">
							<td>{{ client.clientName }}</td>
							<td class="text-caption">{{ client.clientId }}</td>
							<td>{{ client.scope }}</td>
							<td>
								<v-chip :color="client.disabled ? 'error' : 'success'" size="x-small">
									{{ client.disabled ? 'disabled' : 'enabled' }}
								</v-chip>
							</td>
							<td>
								<v-btn
									size="x-small"
									color="warning"
									variant="outlined"
									:disabled="client.disabled || oauthStore.loading"
									@click="disableClient(client.clientId)"
								>
									Disable
								</v-btn>
							</td>
						</tr>
						<tr v-if="oauthStore.clients.length === 0">
							<td colspan="5" class="text-medium-emphasis">No registered clients.</td>
						</tr>
					</tbody>
				</v-table>
			</v-card-text>
		</v-card>

		<!-- AUDIT LOG -->
		<v-card variant="outlined">
			<v-card-title>Audit Log</v-card-title>
			<v-card-text>
				<div class="d-flex ga-3 mb-3 flex-wrap">
					<v-select
						v-model="auditFilter.event"
						:items="eventTypes"
						label="Event"
						density="compact"
						hide-details
						clearable
						style="max-width: 220px;"
					/>
					<v-text-field
						v-model="auditFilter.userRef"
						label="User refId (optional)"
						density="compact"
						hide-details
						style="max-width: 260px;"
					/>
					<v-text-field
						v-model.number="auditFilter.limit"
						label="Limit"
						type="number"
						density="compact"
						hide-details
						style="max-width: 120px;"
					/>
					<v-btn color="primary" :disabled="oauthStore.loading" @click="runAudit">Query</v-btn>
				</div>

				<v-table density="compact" class="audit-table">
					<thead>
						<tr>
							<th>Time</th>
							<th>Event</th>
							<th>User</th>
							<th>Client</th>
							<th>Detail</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="(ev, idx) in oauthStore.auditEvents" :key="idx">
							<td class="text-caption">{{ fmtTime(ev.eventAt) }}</td>
							<td>{{ ev.event }}</td>
							<td>{{ ev.username || ev.sub }}</td>
							<td class="text-caption">{{ ev.clientId }}</td>
							<td class="text-caption">{{ JSON.stringify(ev.detail) }}</td>
						</tr>
						<tr v-if="oauthStore.auditEvents.length === 0">
							<td colspan="5" class="text-medium-emphasis">No audit events.</td>
						</tr>
					</tbody>
				</v-table>
			</v-card-text>
		</v-card>
	</div>
</template>

<style scoped>
.audit-table {
	max-height: 380px;
	overflow-y: auto;
}
</style>
