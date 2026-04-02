<script setup>
// @concept: [[DataModelExplorer]]
// dm/lookup.vue — Lookup Browser page under Data Models

import { useLoginStore } from '@/stores/loginStore';
import { onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';

const LoginStore = useLoginStore();
const router = useRouter();
const route = useRoute();

const activeTab = 'lookup';

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
			<SubPageNav :model-value="activeTab" :tabs="[{ label: 'Explore', value: 'explore', to: '/dm/explorer' }, { label: 'Lookup', value: 'lookup', to: '/dm/lookup' }]" />
			<LookupBrowser />
		</v-main>
	</v-app>
</template>
