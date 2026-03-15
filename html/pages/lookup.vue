<script setup>
// lookup.vue — Lookup Browser page
//
// Non-AI tree browser for navigating education data standards.
// Auth guard redirects to login if not authenticated.

import { useLoginStore } from '@/stores/loginStore';
import { onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';

const LoginStore = useLoginStore();
const router = useRouter();
const route = useRoute();

// Auth guard
onMounted(() => {
	if (!LoginStore.validUser) {
		router.push({ path: '/', query: { redirect: route.fullPath } });
	}
});
</script>

<template>
	<v-app>
		<generalNavSub />
		<v-main style="padding-top: 65px">
			<LookupBrowser />
		</v-main>
	</v-app>
</template>
