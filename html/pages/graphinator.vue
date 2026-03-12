<script setup>
// graphinator.vue — Thin wrapper for GraphinatorPanel
//
// Site-specific: auth guard, navigation, welcome text, AI filename generation.
// All UI logic lives in GraphinatorPanel.vue (shared component).

import { useLoginStore } from '@/stores/loginStore';
import { createGraphinatorStore } from '@/stores/createGraphinatorStore';
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import axios from 'axios';

const LoginStore = useLoginStore();
const router = useRouter();
const route = useRoute();

// Create store instance for this page's WS endpoint
const useGraphStore = createGraphinatorStore({
	storeId: 'graphinatorStore',
	wsPath: '/ws/graphinator',
	devPort: 7790,
	defaultPromptName: 'graphinator',
});
const graphStore = useGraphStore();

const activeTab = ref('ceds');

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
		console.warn('[graphinator] AI filename generation failed:', err);
		return null;
	}
};

// Fallback prompt options (used if server doesn't provide availablePrompts)
const fallbackPromptOptions = [
	{ title: 'Graphinator', value: 'graphinator' },
	{ title: 'Default', value: 'default' },
	{ title: 'White Paper', value: 'whitePaper' },
	{ title: 'Interrogator', value: 'interrogator' },
];
</script>

<template>
	<v-app>
		<generalNavSub />
		<v-main style="padding-top: 65px">
			<SubPageNav v-model="activeTab" :tabs="[{ label: 'CEDS', value: 'ceds', icon: 'mdi-graph' }]" />

			<GraphinatorPanel
				:store="graphStore"
				:generate-filename="generateAiFilename"
				:fallback-prompt-options="fallbackPromptOptions"
				download-prefix="graphinator-output"
			>
				<template #welcome>
					<h2>Welcome to the Graphinator</h2>
					<p>Presently we have tools demonstrating:</p>
					<ol>
						<li><strong>Graph database integration</strong> &mdash; structured ontology lookup</li>
						<li><strong>External website as RAG source</strong> &mdash; live documentation search</li>
						<li><strong>Body of text files converted to an AI-searchable source</strong> &mdash; semantic vector search</li>
						<li><strong>Integration of HTML and diagrams in results</strong> &mdash; rich control panel rendering</li>
					</ol>
					<p>You can try these with these queries:</p>
					<ol>
						<li><em>Tell me about the CEDS student object</em></li>
						<li><em>What HTTP verbs are supported by the SIF Infrastructure?</em></li>
						<li><em>Is there any reason I should respect TQ?</em> <span style="font-size: 0.85em; color: #888;">(no really, do it)</span></li>
						<li><em>Draw a diagram of a circle and a square with an arrow pointing at the square. Show it with a caption that says, "Got the point?"</em></li>
					</ol>
				</template>
			</GraphinatorPanel>
		</v-main>
	</v-app>
</template>
