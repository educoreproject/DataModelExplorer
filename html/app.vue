<script setup>
import { useUserDataStore } from '@/stores/userDataStore';

const userDataStore = useUserDataStore();
const route = useRoute();

// Handle ?logout query param from any page
if (route.query.logout !== undefined) {
	userDataStore.logout();
}
</script>

<template>
	<NuxtLayout>
		<NuxtPage />
	</NuxtLayout>
</template>
