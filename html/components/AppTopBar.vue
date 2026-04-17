<script setup>
import { useLoginStore } from '@/stores/loginStore';
import { useRoute } from 'vue-router';

const LoginStore = useLoginStore();
const route = useRoute();

defineEmits(['toggle-drawer']);

const pageTitle = computed(() => {
	const path = route.path;
	if (path.startsWith('/admin')) return 'Admin Tools';
	if (path.startsWith('/dm')) return 'Data Models';
	if (path.startsWith('/uc')) return 'Use Cases';
	if (path.startsWith('/util')) return 'Utilities';
	if (path.startsWith('/library')) return 'My Library';
	if (path.startsWith('/profile')) return 'Profile';
	if (path.startsWith('/ontology')) return 'Data Miner';
	if (path.startsWith('/explore')) return 'Explore';
	if (path.startsWith('/work')) return 'Work';
	if (path.startsWith('/search')) return 'Search';
	return 'EDUcore';
});
</script>

<template>
	<v-app-bar elevation="0">
		<v-app-bar-nav-icon
			class="d-lg-none"
			@click="$emit('toggle-drawer')"
		/>

		<v-app-bar-title class="text-primary font-weight-bold">
			{{ pageTitle }}
		</v-app-bar-title>

		<template #append>
			<template v-if="LoginStore.validUser">
				<span class="text-body-2 text-medium-emphasis mr-2 d-none d-sm-inline">
					<span v-if="LoginStore.loggedInUser.last">
						{{ LoginStore.loggedInUser.first }} {{ LoginStore.loggedInUser.last }}
					</span>
					<span v-else>{{ LoginStore.loggedInUser.username }}</span>
				</span>
			</template>
			<v-btn
				v-else
				to="/login"
				variant="tonal"
				color="secondary"
				size="small"
				prepend-icon="mdi-login"
			>
				Login
			</v-btn>
		</template>
	</v-app-bar>

	<!-- Login error snackbar -->
	<v-snackbar
		:model-value="!!LoginStore.statusMsg"
		@update:model-value="LoginStore.statusMsg = ''"
		:timeout="4000"
		color="error"
		location="top"
	>
		{{ LoginStore.statusMsg }}
		<template #actions>
			<v-btn variant="text" @click="LoginStore.statusMsg = ''">Close</v-btn>
		</template>
	</v-snackbar>
</template>
