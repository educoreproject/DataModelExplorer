<script setup>
import { useLoginStore } from '@/stores/loginStore';

const LoginStore = useLoginStore();
const route = useRoute();

// Handle ?logout query param from any page
if (route.query.logout !== undefined) {
	LoginStore.logout();
}
</script>

<template>
	<NuxtLayout>
		<NuxtPage />
	</NuxtLayout>
</template>
