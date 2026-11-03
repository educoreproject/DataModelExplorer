<script setup>
import { useLoginStore } from '@/stores/loginStore';

const LoginStore = useLoginStore();
const route = useRoute();

// every page's title reads '<page> · EDUcore' (a page names itself with useHead({ title })); one without a title is 'EDUcore'
useHead({ titleTemplate: (pageTitle) => (pageTitle && pageTitle !== 'EDUcore' ? `${pageTitle} · EDUcore` : 'EDUcore') });

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
