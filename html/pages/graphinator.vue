<script setup>
import { useLoginStore } from '@/stores/loginStore';
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';

const LoginStore = useLoginStore();
const router = useRouter();
const route = useRoute();

// -------------------------------------------------------------------------
// Tab configuration

const activeTab = ref('ceds');

const graphinatorTabs = [
	{ label: 'CEDS', value: 'ceds', icon: 'mdi-graph' },
];

// -------------------------------------------------------------------------
// Auth guard

onMounted(() => {
	if (!LoginStore.validUser) {
		router.push({ path: '/', query: { redirect: route.fullPath } });
		return;
	}
});
</script>

<template>
	<v-app>
		<generalNavSub />
		<v-main style="padding-top: 65px">
			<SubPageNav v-model="activeTab" :tabs="graphinatorTabs" />

			<!-- ============================================================ -->
			<!-- CEDS TAB -->
			<!-- ============================================================ -->
			<v-container v-show="activeTab === 'ceds'" fluid class="pa-4">
				<div class="hello-world">
					<h2>Hello World</h2>
					<p class="text-medium-emphasis">Graphinator CEDS analysis tools will live here.</p>
				</div>
			</v-container>
		</v-main>
	</v-app>
</template>

<style scoped>
.hello-world {
	padding: 40px;
	text-align: center;
}
</style>
