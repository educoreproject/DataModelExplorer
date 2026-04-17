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
	router.push('/');
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
	>
		<!-- Logo -->
		<div class="sidebar-header" @click="router.push('/')" style="cursor: pointer;">
			<img src="/educore-logo.png" alt="EDUcore" class="sidebar-logo-img" />
		</div>

		<!-- Home -->
		<v-list density="compact" nav class="pt-1 pb-0">
			<v-list-item
				to="/"
				prepend-icon="mdi-home-outline"
				title="Home"
				exact
			/>
		</v-list>

		<v-divider class="my-1" />

		<!-- Explore (public) -->
		<v-list density="compact" nav>
			<v-list-subheader>Explore</v-list-subheader>
			<v-list-item
				to="/explore/topics"
				prepend-icon="mdi-book-open-variant"
				title="Topics"
			/>
			<v-list-item
				to="/explore/use-cases"
				prepend-icon="mdi-lightbulb-on-outline"
				title="Use Cases"
			/>
			<v-list-item
				to="/explore/standards"
				prepend-icon="mdi-certificate-outline"
				title="Standards"
			/>
			<v-list-item
				to="/explore/access-guide"
				prepend-icon="mdi-compass-outline"
				title="Access Guide"
			/>
		</v-list>

		<v-divider />

		<!-- Tools (auth-gated) -->
		<v-list v-if="LoginStore.validUser" density="compact" nav>
			<v-list-subheader>Tools</v-list-subheader>
			<v-list-item
				to="/search"
				prepend-icon="mdi-magnify"
				title="Search"
			/>
			<v-list-item
				to="/uc/matrix"
				prepend-icon="mdi-grid"
				title="Alignment"
			/>
			<v-list-item
				to="/dm/lookup"
				prepend-icon="mdi-swap-horizontal"
				title="Ontology"
			/>
			<v-list-item
				to="/ontology"
				prepend-icon="mdi-pickaxe"
				title="Data Miner"
			/>
			<v-list-item
				to="/dm/personas"
				prepend-icon="mdi-robot-outline"
				title="AI Explorer"
			/>
		</v-list>

		<v-divider v-if="LoginStore.validUser" />

		<!-- Account (auth-gated) -->
		<v-list v-if="LoginStore.validUser" density="compact" nav>
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
			<v-list density="compact" nav>
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
					@click="handleLogout"
				/>
			</v-list>
		</template>
	</v-navigation-drawer>
</template>

<style scoped>
.sidebar-header {
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
