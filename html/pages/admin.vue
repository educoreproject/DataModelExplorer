<script setup>
// @concept: [[UserCrudAdmin]]
definePageMeta({ middleware: 'auth' });

import { ref, computed } from 'vue';

// Import tool components
import AddEditUser from '@/components/tools/add-edit-user.vue';
import ManifestEditor from '@/components/tools/manifest-editor.vue';
import OauthAdmin from '@/components/tools/oauth-admin.vue';
import CedsRaterAdmin from '@/components/tools/ceds-rater-admin.vue';

// Dev server selector — runtime backend override for DME (see SPEC §8).
import { backendProfiles } from '@/config/backendProfiles';
import {
	useBackendProfile,
	setBackendProfile,
	clearBackendProfile,
} from '@/composables/useBackendProfile';
import { useLoginStore } from '@/stores/loginStore';
import { isRaterAdminRole } from '@/stores/raterStore';

const LoginStore = useLoginStore();
const route = useRoute();
const router = useRouter();
const profile = useBackendProfile();
const selectedProfile = ref(profile.source === 'cookie' ? profile.name : '');
const profileOptions = Object.entries(backendProfiles).map(([value, p]) => ({
	value,
	title: `${value} — ${p.label}`,
}));

// Switching backends invalidates the current auth token — the token was
// signed by the previous backend's JWT secret and the new backend will
// reject it as malformed. Log out, then send the user to /login so they
// re-authenticate against the newly-selected backend.
const switchBackend = (mutateCookie) => {
	LoginStore.logout();
	mutateCookie();
	window.location.href = '/login';
};

const applyProfile = () => {
	if (!selectedProfile.value) return;
	switchBackend(() => setBackendProfile(selectedProfile.value));
};

const clearProfile = () => {
	switchBackend(() => clearBackendProfile());
};

// Selected tool - default to add-edit-user. The tool is the `tool` query parameter (WORKORDER-RATER6), so a bookmark
// or a redirect lands on it: /admin?tool=ceds-rater is the CEDS Rater tab (the old /rater/admin URLs redirect there).
const TOOL_NAME_LIST = ['add-edit-user', 'manifest-editor', 'oauth-admin', 'ceds-rater', 'dev-tools'];
const DEFAULT_TOOL_NAME = 'add-edit-user';
const selectedTool = computed(() => route.query.tool || DEFAULT_TOOL_NAME);
const isKnownTool = computed(() => TOOL_NAME_LIST.includes(selectedTool.value));
const isRaterAdmin = computed(() => isRaterAdminRole(LoginStore.loggedInUser?.role));

// Handle tool selection
const selectTool = (toolName) => {
	router.push({ query: { tool: toolName } });
};
</script>

<template>
	<div>
			<v-container fluid class="fill-height">
				<v-row no-gutters class="fill-height">
					<!-- Main content area -->
					<v-col style="flex: 1;">
						<v-card flat class="h-100">
							<!-- Tool selection toolbar -->
							<v-toolbar flat density="compact" color="surface">
								<v-spacer></v-spacer>

								<!-- Add/Edit User tab -->
								<v-btn
									variant="outlined"
									:disabled="selectedTool === 'add-edit-user'"
									@click="selectTool('add-edit-user')"
									prepend-icon="mdi-account-plus"
									class="mr-2"
								>
									ADD/EDIT NEW USER
								</v-btn>

								<!-- Manifest Editor tab -->
								<v-btn
									variant="outlined"
									:disabled="selectedTool === 'manifest-editor'"
									@click="selectTool('manifest-editor')"
									prepend-icon="mdi-file-tree"
									class="mr-2"
								>
									MANIFEST EDITOR
								</v-btn>

								<!-- OAuth Access tab (dmeMcpOAuth Phase 4) -->
								<v-btn
									variant="outlined"
									:disabled="selectedTool === 'oauth-admin'"
									@click="selectTool('oauth-admin')"
									prepend-icon="mdi-key-chain"
									class="mr-2"
								>
									OAUTH ACCESS
								</v-btn>

								<!-- CEDS Rater tab (WORKORDER-RATER6): raters, surveys, results; admins only -->
								<v-btn
									v-if="isRaterAdmin"
									variant="outlined"
									:disabled="selectedTool === 'ceds-rater'"
									@click="selectTool('ceds-rater')"
									prepend-icon="mdi-clipboard-check-outline"
									class="mr-2"
									data-testid="admin-tool-ceds-rater"
								>
									CEDS RATER
								</v-btn>

								<!-- Dev Tools tab -->
								<v-btn
									variant="outlined"
									:disabled="selectedTool === 'dev-tools'"
									@click="selectTool('dev-tools')"
									prepend-icon="mdi-wrench-cog"
								>
									DEV TOOLS
								</v-btn>
							</v-toolbar>

							<!-- Tool area with conditional rendering -->
							<v-card-text class="d-flex justify-center align-start text-subtitle-1 text-medium-emphasis tool-area">
								<add-edit-user
									v-if="selectedTool === 'add-edit-user'"
								/>

								<!-- Manifest Editor -->
								<manifest-editor
									v-else-if="selectedTool === 'manifest-editor'"
								/>

								<!-- OAuth Access (connections / revoke / clients / audit) -->
								<oauth-admin
									v-else-if="selectedTool === 'oauth-admin'"
								/>

								<!-- CEDS Rater (raters, surveys, results); the component refuses a non-admin itself -->
								<ceds-rater-admin
									v-else-if="selectedTool === 'ceds-rater'"
								/>

								<!-- an unknown ?tool= is refused by name, not quietly replaced -->
								<v-alert
									v-else-if="!isKnownTool"
									type="warning"
									variant="tonal"
									class="ma-4"
									data-testid="admin-tool-unknown"
								>
									There is no admin tool '{{ selectedTool }}'. Choose one above.
								</v-alert>

								<!-- Dev Tools: dev-server-selector -->
								<v-card
									v-else-if="selectedTool === 'dev-tools'"
									class="ma-4"
									variant="outlined"
									min-width="420"
								>
									<v-card-title>Dev Server Selector</v-card-title>
									<v-card-text>
										<div class="mb-3">
											<strong class="mr-2">Current:</strong>
											<v-chip
												:color="profile.source === 'cookie' ? 'warning' : 'default'"
												size="small"
												prepend-icon="mdi-server-network"
											>
												{{ profile.label }}
											</v-chip>
										</div>

										<v-select
											v-model="selectedProfile"
											:items="profileOptions"
											item-title="title"
											item-value="value"
											label="Select backend"
											density="compact"
											hide-details
											class="mb-3"
										/>

										<div class="d-flex ga-2">
											<v-btn
												color="primary"
												:disabled="!selectedProfile"
												@click="applyProfile"
											>
												Apply &amp; Reload
											</v-btn>
											<v-btn variant="outlined" @click="clearProfile">
												Clear (use default)
											</v-btn>
										</div>
									</v-card-text>
								</v-card>
							</v-card-text>
						</v-card>
					</v-col>
				</v-row>
			</v-container>
	</div>
</template>

<style scoped>
.h-100 {
	height: 100%;
}
:deep(.v-container) {
	padding: 0;
}
.tool-area {
	min-height: calc(100vh - 180px);
}
</style>
