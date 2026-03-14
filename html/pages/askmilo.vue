<script setup>
// askmilo.vue — Thin wrapper for GraphinatorPanel (askMilo endpoint)
//
// Identical UI to graphinator.vue but connects to /ws/askmilo endpoint.

import { useLoginStore } from '@/stores/loginStore';
import { createGraphinatorStore } from '@/stores/createGraphinatorStore';
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import axios from 'axios';

const LoginStore = useLoginStore();
const router = useRouter();
const route = useRoute();

// Create store instance for askMilo WS endpoint
const useAskMiloStore = createGraphinatorStore({
	storeId: 'askMiloStore',
	wsPath: '/ws/askmilo',
	devPort: 7790,
	defaultPromptName: 'graphinator',
});
const askMiloStore = useAskMiloStore();

const activeTab = ref('dialog');

// Auth guard
onMounted(() => {
	if (!LoginStore.validUser) {
		router.push({ path: '/', query: { redirect: route.fullPath } });
	}
});

// AI-powered filename generation for download button
const generateAiFilename = async (snippet) => {
	const prompt = `Given this content, suggest a short camelCase filename (no extension, max 40 chars). Reply with ONLY the filename, nothing else.\n\n${snippet}`;
	try {
		const response = await axios.post(
			'/api/askmilo-utility',
			{ prompt, model: 'haiku' },
			{ headers: { ...LoginStore.getAuthTokenProperty } },
		);
		return response.data.response;
	} catch (err) {
		console.warn('[askmilo] AI filename generation failed:', err);
		return null;
	}
};

const fallbackPromptOptions = [
	{ title: 'Data Model Explorer', value: 'graphinator' },
	{ title: 'Enrichment Analyst', value: 'enrichmentAnalyst' },
	{ title: 'Default', value: 'default' },
	{ title: 'White Paper', value: 'whitePaper' },
	{ title: 'Interrogator', value: 'interrogator' },
];
</script>

<template>
	<v-app>
		<generalNavSub />
		<v-main style="padding-top: 65px">
			<SubPageNav v-model="activeTab" :tabs="[{ label: 'Dialog', value: 'dialog', icon: 'mdi-chat' }]" />

			<GraphinatorPanel
				:store="askMiloStore"
				:generate-filename="generateAiFilename"
				:fallback-prompt-options="fallbackPromptOptions"
				download-prefix="askmilo-output"
			>
				<template #welcome>
					<h2>askMilo</h2>
					<p>Ask a question to get started.</p>
				</template>
			</GraphinatorPanel>
		</v-main>
	</v-app>
</template>
