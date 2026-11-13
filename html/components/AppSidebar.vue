<script setup>
import { useLoginStore } from '@/stores/loginStore';
import { useRouter } from 'vue-router';

const LoginStore = useLoginStore();
const router = useRouter();

const props = defineProps({
	modelValue: { type: Boolean, default: true },
	permanent: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const handleLogout = () => {
	LoginStore.logout();
	router.push('/explore/use-cases');
};

const isAdmin = computed(() =>
	['admin', 'super'].includes(LoginStore.loggedInUser?.role),
);
</script>

<template>
	<v-navigation-drawer
		:model-value="modelValue"
		@update:model-value="emit('update:modelValue', $event)"
		:permanent="permanent"
		:temporary="!permanent"
		width="260"
		elevation="1"
		color="surface"
		aria-label="Site"
	>
		<!-- Logo: a real link home, so it can be followed and named, not a clickable div -->
		<NuxtLink to="/explore/use-cases" class="sidebar-header" aria-label="EDUcore home" data-testid="menu-logo">
			<img src="/educore-logo.png" alt="EDUcore" class="sidebar-logo-img" />
		</NuxtLink>

		<!-- Explore (public); the site opens on Use Cases, so there is no separate Home item -->
		<!-- each section is a named navigation landmark of links (Vuetify's default role=list wants listitem children) -->
		<v-list density="compact" nav role="navigation" aria-label="Explore">
			<v-list-subheader>Explore</v-list-subheader>
			<v-list-item
				to="/explore/use-cases"
				prepend-icon="mdi-lightbulb-on-outline"
				title="Use Cases"
			/>
			<!-- one standards view: overview, visualizations, schema and downloads are tabs inside it -->
			<v-list-item
				to="/explore/standards"
				prepend-icon="mdi-certificate-outline"
				title="Standards"
				data-testid="menu-standards"
			/>
			<!-- ⟪meaningsExplorer⟫ the hub cards as the subject: each meaning, what it names and every element that expresses it -->
			<v-list-item
				to="/explore/meanings"
				prepend-icon="mdi-hexagon-multiple-outline"
				title="Meanings"
				data-testid="menu-meanings"
			/>
			<v-list-item
				to="/explore/rosetta"
				prepend-icon="mdi-translate"
				title="Rosetta"
			/>
			<v-list-item
				to="/explore/access-guide"
				prepend-icon="mdi-compass-outline"
				title="Access Guide"
			/>
			<v-list-item
				to="/explore/implementation-burden"
				prepend-icon="mdi-speedometer-medium"
				title="Impl. Burden"
			/>
		</v-list>

		<v-divider />

		<!-- Tools (auth-gated) -->
		<v-list v-if="LoginStore.validUser" density="compact" nav role="navigation" aria-label="Tools">
			<v-list-subheader>Tools</v-list-subheader>
			<v-list-item
				to="/uc/matrix"
				prepend-icon="mdi-grid"
				title="Alignment"
			/>
			<v-list-item
				to="/dm/explorer"
				prepend-icon="mdi-graph-outline"
				title="Data Model Explorer"
			/>
		</v-list>

		<v-divider v-if="LoginStore.validUser" />

		<!-- Account (auth-gated) -->
		<v-list v-if="LoginStore.validUser" density="compact" nav role="navigation" aria-label="Account">
			<v-list-subheader>Account</v-list-subheader>
			<v-list-item
				to="/profile/edit"
				prepend-icon="mdi-account"
				title="Profile"
			/>
			<v-list-item
				to="/profile/sessions"
				prepend-icon="mdi-history"
				title="Sessions"
			/>
			<v-list-item
				v-if="isAdmin"
				to="/admin"
				prepend-icon="mdi-shield-account"
				title="Admin"
			/>
		</v-list>

		<template #append>
			<v-divider />
			<v-list density="compact" nav role="navigation" aria-label="Library and sign out">
				<v-list-item
					v-if="LoginStore.validUser"
					to="/library"
					prepend-icon="mdi-bookshelf"
					title="Library"
				/>
				<v-list-item
					v-if="LoginStore.validUser"
					prepend-icon="mdi-logout"
					title="Logout"
					role="button"
					@click="handleLogout"
				/>
			</v-list>
		</template>
	</v-navigation-drawer>
</template>

<style scoped>
.sidebar-header {
	display: block;
	padding: 20px 24px;
	text-align: center;
	background: var(--edu-surface, #fff);
	border-bottom: 1px solid var(--edu-gray-100, #EEF1F7);
}

.sidebar-logo-img {
	max-width: 150px;
	height: auto;
}
</style>
