<script setup>
// @concept: [[DataModelExplorer]]
// @concept: [[WebSocketGraphTool]]
// explorer.vue — Data Model Explorer page
//
// Site-specific: auth guard, navigation, welcome text, AI filename generation.
// All UI logic lives in EdunatorPanel.vue (shared component).

definePageMeta({ middleware: 'auth' });

import { useLoginStore } from '@/stores/loginStore';
import { createEdunatorStore } from '@/stores/createEdunatorStore';
import { personas } from '@/data/personas';
import { ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import axios from 'axios';

const LoginStore = useLoginStore();
const route = useRoute();
const router = useRouter();

// Create store instance for this page's WS endpoint.
// Role-based tool visibility: server sends toolsByRole config, store filters by userRole.
// sessionEndpoints preserve educore's existing dmeSession* URLs (and the underlying
// dme_sessions SQLite table) so persisted sessions keep working through the migration.
// getAuthHeaders is required now that the canonical layer no longer imports loginStore.
const useGraphStore = createEdunatorStore({
	storeId: 'explorerStore',
	wsPath: '/ws/explorer',
	devPort: 7790,
	defaultPromptName: 'DataModelExplorer',
	getUserRole: () => LoginStore.loggedInUser.role || null,
	sessionEndpoints: {
		save:   '/api/dmeSessionSave',
		list:   '/api/dmeSessionList',
		load:   '/api/dmeSessionLoad',
		delete: '/api/dmeSessionDelete',
	},
	getAuthHeaders: async () => ({ ...LoginStore.getAuthTokenProperty }),
});
const graphStore = useGraphStore();

// Example prompts for the 16-standard equivalence graph (gf_allStandards1 era).
// Every prompt was tested against the live graph before shipping — each exercises
// a real capability: cross-standard comparison, HubReference tuples, authored vs
// inferred (candidate) mappings with confidence, codeset alignment, and the
// honestly-unmapped islands. The canonical component takes them via prop.
const cedsExamplePrompts = [
	'Compare how SIF and Ed-Fi model grade level — show the CEDS concept each maps to.',
	'How do the different standards represent a student’s English learner status?',
	'Show me the codeset for exit reasons in SEDM and what CEDS values they align to.',
	'Show me the full CEDS tuple — domain, property, range, and value — that ‘Tenth grade’ resolves to, and every standard that lands on it.',
	'What is the canonical CEDS address (the HubReference tuple) for a student’s birthdate, and which standards map to it?',
	'Show candidate equivalences from PESC to CEDS with confidence below 0.8 — where are the mappings most uncertain?',
	'Which LIF fields have only inferred (not authored) CEDS mappings, and how confident are they?',
	'Which standards have nothing mapped to CEDS at all? List the islands.',
	'How do the standards handle occupational classification? Compare SOC, CIP, JEDx, CTDL, and CEDS.',
	'What does SEDM contribute for special education (IDEA) data, and how does it connect to CEDS?',
	'SIF turned out to carry authored CEDS crosswalks. Show me examples of SIF elements with EXACT matches to CEDS tuples.',
	'Pick a concept — student attendance — and show which standards model it and whether their mappings are established or candidate.',
	'Which cross-standard equivalences are established (authored at both ends) versus candidate (inferred)? Explain the difference with examples.',
];

const activeTab = 'explore';

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
	<div class="explorer-page">
		<SubPageNav :model-value="activeTab" :tabs="[{ label: 'Explore', value: 'explore', to: '/dm/explorer' }, { label: 'Lookup', value: 'lookup', to: '/dm/lookup' }]" />

			<v-alert
					v-if="graphStore.roleResolved && graphStore.availableTools.length === 0"
					type="warning"
					class="mx-4 mt-4"
				>
					No tools are configured for your role ({{ LoginStore.loggedInUser.role }}). Contact an administrator.
				</v-alert>

				<EdunatorPanel
				:store="graphStore"
				:generate-filename="generateAiFilename"
				:fallback-prompt-options="fallbackPromptOptions"
				:example-prompts="cedsExamplePrompts"
				download-prefix="explorer-output"
			>
				<template #welcome>
					<h2>Welcome to the Data Model Explorer</h2>
					<p style="color: #1565C0; font-weight: 600; background: #E3F2FD; padding: 0.6em 1em; border-radius: 6px; margin-bottom: 0.8em;">
						<strong>Data Model Explorer is still in development.</strong> Connections between standards elements, mappings, come in two types, specified (those that are written in the model) and implied (those we calculate). The latter have a confidence value. We are working on a new implied mapping algorithm that we think will be much better.
					</p>
					<p style="color: #1565C0; font-weight: 600; background: #E3F2FD; padding: 0.6em 1em; border-radius: 6px; margin-bottom: 0.8em;">
						Click the info icon in the bottom right for example prompts to get you started. Your sessions are automatically saved. Access them by the tiny clock icon in the bottom right. Manage them in the profile sessions editor.
					</p>
					<p><strong>The Data Model Explorer</strong> provides a unified graph of education data standards with cross-standard search, mapping, and comparison. This is a work in progress &mdash; more standards and features are being added all the time. Currently supported standards (as of 4/16/26):</p>
					<ul style="margin: 0.8em 0 0.8em 1.5em;">
						<li><strong>CEDS</strong> &mdash; Common Education Data Standards (RDF ontology)</li>
						<li><strong>SIF</strong> &mdash; Schools Interoperability Framework</li>
						<li><strong>LIF</strong> &mdash; Learner Information Framework (OpenAPI)</li>
						<li><strong>Ed-Fi</strong> &mdash; Ed-Fi Data Standard</li>
						<li><strong>PESC</strong> &mdash; Postsecondary Electronic Standards Council (XML Schema)</li>
						<li><strong>CTDL</strong> &mdash; Credential Transparency Description Language</li>
						<li><strong>SEDM</strong> &mdash; Special Education Data Model (IDEA compliance)</li>
						<li><strong>JEDx</strong> &mdash; Job and Education Data Exchange</li>
						<li><strong>EdMatrix</strong> &mdash; Education Standards Directory</li>
						<li><strong>CIP</strong> &mdash; Classification of Instructional Programs</li>
						<li><strong>CLR</strong> &mdash; Comprehensive Learner Record (IMS Global v2.0)</li>
						<li><strong>CASE</strong> &mdash; Competencies and Academic Standards Exchange (1EdTech)</li>
						<li><strong>SOC</strong> &mdash; Standard Occupational Classification (BLS)</li>
						<li><strong>DCTAP</strong> &mdash; Dublin Core Tabular Application Profile (meta-vocabulary for application profiles)</li>
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
			</EdunatorPanel>
	</div>
</template>

<style scoped>
.explorer-page {
	display: flex;
	flex-direction: column;
	height: calc(100vh - 64px);
	overflow: hidden;
}
</style>
