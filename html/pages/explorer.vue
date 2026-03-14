<script setup>
// explorer.vue — Data Model Explorer page
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
	storeId: 'explorerStore',
	wsPath: '/ws/explorer',
	devPort: 7790,
	defaultPromptName: 'DataModelExplorer',
	defaultTools: ['DataModelExplorer', 'CareerStoryGraph', 'SifSpecGraph'],
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
		console.warn('[explorer] AI filename generation failed:', err);
		return null;
	}
};

// Fallback prompt options (used if server doesn't provide availablePrompts)
const fallbackPromptOptions = [
	{ title: 'Data Model Explorer', value: 'DataModelExplorer' },
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
			<SubPageNav v-model="activeTab" :tabs="[{ label: 'CEDS', value: 'ceds', icon: 'mdi-graph' }]" />

			<GraphinatorPanel
				:store="graphStore"
				:generate-filename="generateAiFilename"
				:fallback-prompt-options="fallbackPromptOptions"
				download-prefix="explorer-output"
			>
				<template #welcome>
					<h2>Welcome to the Data Model Explorer</h2>
					<p>This tool provides a unified graph of education data standards &mdash; currently <strong>CEDS</strong> and <strong>SIF</strong> &mdash; with cross-standard search, mapping, and comparison. Enter your query in the prompt below to get started.</p>

					<h3 style="margin-top: 1.2em;">How the standards are connected</h3>
					<p>The bridge builder creates edges that only exist because both standards are in the same graph. It runs in four phases:</p>

					<h4 style="margin-top: 1em;">Phase 1 &mdash; Spec-Annotation MAPS_TO <span style="color: #888;">(confidence=1.0)</span></h4>
					<p>The SIF specification already annotates 2,231 fields with CEDS Global IDs. The builder takes each SIF field's cedsId (e.g., 000040), prepends P to get the CEDS Element ID (P000040), and creates a MAPS_TO edge to the matching CedsProperty node. These are authoritative &mdash; the SIF spec committee decided this mapping. 2,168 resolve; 63 reference CEDS IDs absent from the v14 RDF.</p>

					<h4 style="margin-top: 1em;">Phase 2 &mdash; Embedding-Inferred MAPS_TO <span style="color: #888;">(confidence=cosine score)</span></h4>
					<p>For every SIF field that doesn't already have a spec-annotation link, the builder takes its vector embedding and runs a nearest-neighbor search against the CEDS vector index. If the top CEDS property scores above 0.6 cosine similarity, it creates a MAPS_TO edge with the similarity as the confidence score. Up to 3 candidates per field. This is how the 13,452 unannotated fields get provisional mappings.</p>

					<h4 style="margin-top: 1em;">Phase 3 &mdash; ALIGNS_WITH <span style="color: #888;">(codeset comparison)</span></h4>
					<p>For SIF fields that have both a spec-annotation MAPS_TO edge and a codeset (allowed values list), the builder checks whether the corresponding CEDS property also has an option set. When both sides have value lists, it compares them: exact match, subset, superset, partial overlap, or disjoint. The edge records alignment type and coverage percentage. This is how you answer &ldquo;does SIF's grade level codeset match CEDS's?&rdquo;</p>

					<h4 style="margin-top: 1em;">Phase 4 &mdash; STRUCTURALLY_MAPS_TO <span style="color: #888;">(class-level inference)</span></h4>
					<p>SIF has complex types (Address, Demographics, PhoneNumber) that are structural analogs to CEDS classes. The builder looks at all the field-level MAPS_TO edges and asks: &ldquo;If most fields inside SIF complex type X map to properties of CEDS class Y, then X structurally maps to Y.&rdquo; Requires at least 2 mapped fields to create the edge. This enables class-level questions like &ldquo;what CEDS class corresponds to SIF's Address structure?&rdquo;</p>
				</template>
			</GraphinatorPanel>
		</v-main>
	</v-app>
</template>
