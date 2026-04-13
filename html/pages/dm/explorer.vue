<script setup>
// @concept: [[DataModelExplorer]]
// @concept: [[WebSocketGraphTool]]
// explorer.vue — Data Model Explorer page
//
// Site-specific: auth guard, navigation, welcome text, AI filename generation.
// All UI logic lives in GraphinatorPanel.vue (shared component).

definePageMeta({ middleware: 'auth' });

import { useLoginStore } from '@/stores/loginStore';
import { createGraphinatorStore } from '@/stores/createGraphinatorStore';
import { personas } from '@/data/personas';
import axios from 'axios';

const LoginStore = useLoginStore();
const route = useRoute();
const router = useRouter();

// Create store instance for this page's WS endpoint
// Role-based tool visibility: server sends toolsByRole config, store filters by userRole
const useGraphStore = createGraphinatorStore({
	storeId: 'explorerStore',
	wsPath: '/ws/explorer',
	devPort: 7790,
	defaultPromptName: 'DataModelExplorer',
	getUserRole: () => LoginStore.loggedInUser.role || null,
});
const graphStore = useGraphStore();

const activeTab = 'explore';
const graphinatorRef = ref(null);

// Auto-send prompt from query params (from implementation plan flow)
const pendingPrompt = ref(route.query.prompt ? decodeURIComponent(route.query.prompt) : '');
const pendingPersona = ref(route.query.persona || '');

// Watch for WebSocket connection, then auto-send
watch(() => graphStore.connected, (connected) => {
	if (connected && pendingPrompt.value) {
		const personaInfo = personas.find((p) => p.id === pendingPersona.value);
		const personaPrefix = personaInfo
			? `[PERSONA: ${personaInfo.title} — ${personaInfo.description}]\n\n`
			: '';
		const fullPrompt = personaPrefix + pendingPrompt.value;

		// Small delay to let the config message arrive first
		setTimeout(() => {
			graphStore.sendPrompt(fullPrompt);
			pendingPrompt.value = '';
			// Clean URL
			router.replace({ path: '/dm/explorer' });
		}, 500);
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
	<div>
		<SubPageNav :model-value="activeTab" :tabs="[{ label: 'Explore', value: 'explore', to: '/dm/explorer' }, { label: 'Lookup', value: 'lookup', to: '/dm/lookup' }]" />

			<v-alert
					v-if="graphStore.roleResolved && graphStore.availableTools.length === 0"
					type="warning"
					class="mx-4 mt-4"
				>
					No tools are configured for your role ({{ LoginStore.loggedInUser.role }}). Contact an administrator.
				</v-alert>

				<GraphinatorPanel
				:store="graphStore"
				:generate-filename="generateAiFilename"
				:fallback-prompt-options="fallbackPromptOptions"
				download-prefix="explorer-output"
			>
				<template #welcome>
					<h2>Welcome to the Data Model Explorer</h2>
					<p style="color: #1565C0; font-weight: 600; background: #E3F2FD; padding: 0.6em 1em; border-radius: 6px; margin-bottom: 0.8em;">
						NEW: Click the info icon in the bottom right for example prompts to get you started.
					</p>
					<p style="color: #1565C0; font-weight: 600; background: #E3F2FD; padding: 0.6em 1em; border-radius: 6px; margin-bottom: 0.8em;">
						Your sessions are automatically saved. Access them by the tiny clock icon in the bottom right. Manage them in the profile sessions editor.
					</p>
					<p><strong>The Data Model Explorer</strong> provides a unified graph of education data standards with cross-standard search, mapping, and comparison. This is a work in progress &mdash; more standards and features are being added all the time. Currently supported standards (as of 4/3/26):</p>
					<ul style="margin: 0.8em 0 0.8em 1.5em;">
						<li><strong>CEDS</strong> &mdash; Common Education Data Standards (RDF ontology)</li>
						<li><strong>SIF</strong> &mdash; Schools Interoperability Framework</li>
						<li><strong>Ed-Fi</strong> &mdash; Ed-Fi Data Standard</li>
						<li><strong>PESC</strong> &mdash; Postsecondary Electronic Standards Council (XML Schema)</li>
						<li><strong>CTDL</strong> &mdash; Credential Transparency Description Language</li>
						<li><strong>SEDM</strong> &mdash; Special Education Data Model (IDEA compliance)</li>
						<li><strong>JEDx</strong> &mdash; Job and Education Data Exchange</li>
						<li><strong>EdMatrix</strong> &mdash; Education Standards Directory</li>
							<li><strong>CIP</strong> &mdash; Classification of Instructional Programs</li>
					</ul>
					<p><strong>Use Cases</strong> live in the graph too: a library of real-world processes, each linked to the exact data model elements it depends on.</p>
					<p style="font-style: italic;">For the most current list of data models, ask: &ldquo;What standards do you currently support and how many elements does each one have?&rdquo;</p>

					<h3 style="margin-top: 1.2em;">How the standards are connected</h3>
					<p>All standards in the graph are connected to CEDS &mdash; the common semantic backbone &mdash; through a multi-phase bridge-building process. The bridge builder creates cross-standard edges using a combination of authoritative annotations, semantic inference, and structural analysis:</p>

					<h4 style="margin-top: 1em;">Phase 1 &mdash; Spec-Annotation MAPS_TO <span style="color: #888;">(confidence=1.0)</span></h4>
					<p>Some standards include explicit CEDS references in their specifications &mdash; field-level annotations that identify the corresponding CEDS element by Global ID. These are authoritative mappings decided by each standard's governance body. When present, the builder creates high-confidence MAPS_TO edges directly to the matching CEDS property.</p>

					<h4 style="margin-top: 1em;">Phase 2 &mdash; Embedding-Inferred MAPS_TO <span style="color: #888;">(confidence=cosine score)</span></h4>
					<p>For fields without explicit annotations, the builder uses vector embeddings to find semantically similar CEDS properties. Each field's description is compared against the CEDS vector index using cosine similarity. Matches above 0.6 create provisional MAPS_TO edges, with up to 3 candidates per field. This is how standards without built-in CEDS references still get connected to the common backbone.</p>

					<h4 style="margin-top: 1em;">Phase 3 &mdash; ALIGNS_WITH <span style="color: #888;">(codeset comparison)</span></h4>
					<p>When a mapped field and its corresponding CEDS property both have value lists (codesets or enumerations), the builder compares them: exact match, subset, superset, partial overlap, or disjoint. The edge records alignment type and coverage percentage. This answers questions like &ldquo;does this standard's grade level codeset match CEDS's?&rdquo;</p>

					<h4 style="margin-top: 1em;">Phase 4 &mdash; STRUCTURALLY_MAPS_TO <span style="color: #888;">(class-level inference)</span></h4>
					<p>Standards often define complex types (Address, Demographics, Person) that are structural analogs to CEDS classes. The builder aggregates field-level MAPS_TO edges and asks: &ldquo;If most fields inside complex type X map to properties of CEDS class Y, then X structurally maps to Y.&rdquo; This enables class-level questions like &ldquo;which CEDS class corresponds to this standard's Person structure?&rdquo;</p>
				</template>
			</GraphinatorPanel>
	</div>
</template>
