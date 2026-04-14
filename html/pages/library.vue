<script setup>
// @concept: [[UserLibrary]]
// @concept: [[SessionHistory]]
definePageMeta({ middleware: 'auth' });

import { ref, onMounted, computed } from 'vue';
import { useSessionStore } from '@/stores/sessionStore';
import { useRouter } from 'vue-router';

const sessionStore = useSessionStore();
const router = useRouter();

const searchQuery = ref('');

onMounted(() => {
	sessionStore.fetchSessions();
});

// Delete confirmation
const confirmDeleteDialog = ref(false);
const sessionToDelete = ref(null);

const promptDelete = (session) => {
	sessionToDelete.value = session;
	confirmDeleteDialog.value = true;
};

const confirmDelete = async () => {
	if (sessionToDelete.value) {
		await sessionStore.deleteSession(sessionToDelete.value.refId);
	}
	confirmDeleteDialog.value = false;
	sessionToDelete.value = null;
};

const cancelDelete = () => {
	confirmDeleteDialog.value = false;
	sessionToDelete.value = null;
};

const formatDate = (dateStr) => {
	if (!dateStr) return '';
	const d = new Date(dateStr);
	return d.toLocaleDateString('en-US', {
		month: 'short', day: 'numeric', year: 'numeric',
		hour: 'numeric', minute: '2-digit',
	});
};

const relativeDate = (dateStr) => {
	if (!dateStr) return '';
	const now = new Date();
	const d = new Date(dateStr);
	const diffMs = now - d;
	const diffMin = Math.floor(diffMs / 60000);
	const diffHr = Math.floor(diffMs / 3600000);
	const diffDay = Math.floor(diffMs / 86400000);

	if (diffMin < 1) return 'just now';
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHr < 24) return `${diffHr}h ago`;
	if (diffDay < 7) return `${diffDay}d ago`;
	return formatDate(dateStr);
};

const filteredSessions = computed(() => {
	if (!searchQuery.value.trim()) return sessionStore.sessions;
	const q = searchQuery.value.toLowerCase();
	return sessionStore.sessions.filter(s =>
		(s.sessionName || '').toLowerCase().includes(q)
	);
});

const openSession = (session) => {
	router.push({
		path: '/dm/explorer',
		query: { resume: session.refId },
	});
};
</script>

<template>
	<v-container class="py-8" style="max-width: 900px;">
		<div class="d-flex align-center justify-space-between mb-2">
			<h1 class="text-h4 font-weight-bold text-primary">My Library</h1>
			<v-btn
				color="primary"
				prepend-icon="mdi-plus"
				to="/dm/personas"
			>
				New Chat
			</v-btn>
		</div>
		<p class="text-body-1 text-medium-emphasis mb-6">
			Your saved AI Explorer conversations. Click a session to resume where you left off.
		</p>

		<!-- Search -->
		<v-text-field
			v-if="sessionStore.sessions.length > 3"
			v-model="searchQuery"
			prepend-inner-icon="mdi-magnify"
			placeholder="Search sessions..."
			variant="outlined"
			density="compact"
			hide-details
			clearable
			class="mb-5"
		/>

		<!-- Loading -->
		<v-progress-linear v-if="sessionStore.loading" indeterminate color="primary" class="mb-4" />

		<!-- Error -->
		<v-alert
			v-if="sessionStore.statusMsg"
			type="error"
			density="compact"
			class="mb-4"
			closable
			@click:close="sessionStore.statusMsg = ''"
		>
			{{ sessionStore.statusMsg }}
		</v-alert>

		<!-- Session list -->
		<div v-if="filteredSessions.length > 0">
			<v-card
				v-for="session in filteredSessions"
				:key="session.refId"
				variant="outlined"
				class="mb-3 session-card"
				@click="openSession(session)"
			>
				<v-card-text class="d-flex align-center pa-4">
					<v-icon color="primary" class="mr-4" size="24">mdi-chat-outline</v-icon>
					<div class="flex-grow-1" style="min-width: 0;">
						<div class="text-subtitle-2 font-weight-bold text-truncate">
							{{ session.sessionName || 'Untitled Session' }}
						</div>
						<div class="text-caption text-medium-emphasis">
							{{ relativeDate(session.updatedAt) }}
						</div>
					</div>
					<v-btn
						icon
						variant="text"
						size="small"
						color="error"
						title="Delete session"
						@click.stop="promptDelete(session)"
					>
						<v-icon>mdi-delete-outline</v-icon>
					</v-btn>
				</v-card-text>
			</v-card>
		</div>

		<!-- Empty state -->
		<v-card v-else-if="!sessionStore.loading && !searchQuery" variant="flat" color="grey-lighten-4" class="pa-12 text-center" rounded="lg">
			<v-icon size="48" color="grey" class="mb-4">mdi-chat-plus-outline</v-icon>
			<h3 class="text-h6 font-weight-bold mb-2">No saved conversations yet</h3>
			<p class="text-body-2 text-medium-emphasis mb-4">
				Start a new chat in the AI Explorer. Your conversations save automatically.
			</p>
			<v-btn color="primary" prepend-icon="mdi-robot-outline" to="/dm/personas">
				Open AI Explorer
			</v-btn>
		</v-card>

		<!-- No search results -->
		<div v-else-if="!sessionStore.loading && searchQuery" class="text-center pa-8 text-medium-emphasis">
			No sessions matching "{{ searchQuery }}"
		</div>

		<!-- Delete confirmation dialog -->
		<v-dialog v-model="confirmDeleteDialog" max-width="400">
			<v-card>
				<v-card-title>Delete Session?</v-card-title>
				<v-card-text>
					Are you sure you want to delete "{{ sessionToDelete?.sessionName || 'Untitled Session' }}"? This cannot be undone.
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="cancelDelete">Cancel</v-btn>
					<v-btn color="error" variant="flat" @click="confirmDelete">Delete</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-container>
</template>

<style scoped>
.session-card {
	cursor: pointer;
	transition: all 0.15s ease;
}

.session-card:hover {
	box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
	border-color: rgb(var(--v-theme-primary));
}
</style>
