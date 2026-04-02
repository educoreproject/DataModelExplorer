<script setup>
import { ref, onMounted } from 'vue';
import { useLoginStore } from '@/stores/loginStore';
import { useSessionStore } from '@/stores/sessionStore';

const LoginStore = useLoginStore();
const sessionStore = useSessionStore();
const router = useRouter();

// Auth guard
onMounted(() => {
	if (!LoginStore.validUser) {
		router.push({ path: '/', query: { redirect: '/profile/sessions' } });
		return;
	}
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
</script>

<template>
	<v-app>
		<generalNavSub />
		<v-main style="padding-top: 65px">
			<SubPageNav
				:model-value="'sessions'"
				:tabs="[
					{ label: 'Profile', value: 'edit', to: '/profile/edit' },
					{ label: 'Sessions', value: 'sessions', to: '/profile/sessions' },
				]"
			/>

			<v-container>
				<v-sheet class="mx-auto pa-6" max-width="700" :elevation="2" rounded="lg">
					<h2 class="text-h6 mb-4">Saved Explorer Sessions</h2>

					<v-progress-linear v-if="sessionStore.loading" indeterminate class="mb-4" />

					<v-alert v-if="sessionStore.statusMsg" type="error" density="compact" class="mb-4" closable @click:close="sessionStore.statusMsg = ''">
						{{ sessionStore.statusMsg }}
					</v-alert>

					<v-list v-if="sessionStore.sessions.length > 0" lines="two">
						<v-list-item
							v-for="session in sessionStore.sessions"
							:key="session.refId"
						>
							<v-list-item-title>{{ session.sessionName || 'Untitled Session' }}</v-list-item-title>
							<v-list-item-subtitle>{{ formatDate(session.updatedAt) }}</v-list-item-subtitle>

							<template v-slot:append>
								<v-btn
									icon
									variant="text"
									size="small"
									color="error"
									title="Delete session"
									@click.stop="promptDelete(session)"
								>
									<v-icon>mdi-delete</v-icon>
								</v-btn>
							</template>
						</v-list-item>
					</v-list>

					<div v-else-if="!sessionStore.loading" class="text-center pa-8 text-medium-emphasis">
						No saved sessions yet. Use the Data Model Explorer to create sessions — they save automatically.
					</div>
				</v-sheet>
			</v-container>

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
		</v-main>
	</v-app>
</template>
