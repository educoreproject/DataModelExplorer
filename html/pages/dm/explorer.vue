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
	'Describe this graph from its self-documentation: identity, provenance, and the recipe it was built from. Then list every standard it currently contains with element counts and mapping statistics.',
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
						<strong>The mapping layer has been rebuilt.</strong> Every cross-standard connection now resolves to a full CEDS <em>tuple</em> &mdash; domain class &middot; property &middot; range, down to the individual code value &mdash; instead of a bare element reference. Authored mappings (written into the standards themselves) and inferred mappings (calculated, with a calibrated confidence) both land on the same tuples, so they can be compared honestly. Ask about anything and the answer will tell you which kind of evidence it rests on.
					</p>
					<p style="color: #1565C0; font-weight: 600; background: #E3F2FD; padding: 0.6em 1em; border-radius: 6px; margin-bottom: 0.8em;">
						Click the info icon in the bottom right for example prompts to get you started. Your sessions are automatically saved. Access them by the tiny clock icon in the bottom right. Manage them in the profile sessions editor.
					</p>
					<p><strong>The Data Model Explorer</strong> provides a unified graph of education data standards with cross-standard search, mapping, and comparison. Currently supported standards (as of 7/4/26):</p>
					<ul style="margin: 0.8em 0 0.8em 1.5em;">
						<li><strong>CEDS</strong> &mdash; Common Education Data Standards (RDF ontology; the semantic hub)</li>
						<li><strong>SIF</strong> &mdash; Schools Interoperability Framework</li>
						<li><strong>LIF</strong> &mdash; Learner Information Framework (OpenAPI)</li>
						<li><strong>Ed-Fi</strong> &mdash; Ed-Fi Data Standard</li>
						<li><strong>PESC</strong> &mdash; Postsecondary Electronic Standards Council (XML Schema)</li>
						<li><strong>CTDL</strong> &mdash; Credential Transparency Description Language</li>
						<li><strong>SEDM</strong> &mdash; Special Education Data Model (IDEA compliance)</li>
						<li><strong>JEDx</strong> &mdash; Job and Education Data Exchange</li>
						<li><strong>CLR</strong> &mdash; Comprehensive Learner Record (1EdTech)</li>
						<li><strong>Open Badges</strong> &mdash; digital credential specification (1EdTech)</li>
						<li><strong>CASE</strong> &mdash; Competencies and Academic Standards Exchange (1EdTech)</li>
						<li><strong>Edu-API</strong> &mdash; higher-education data API (1EdTech)</li>
						<li><strong>MedBiquitous</strong> &mdash; health-professions education standards</li>
						<li><strong>CIP</strong> &mdash; Classification of Instructional Programs</li>
						<li><strong>SOC</strong> &mdash; Standard Occupational Classification (BLS)</li>
						<li><strong>DCTAP</strong> &mdash; Dublin Core Tabular Application Profile (meta-vocabulary for application profiles)</li>
					</ul>
					<p style="font-style: italic;">For the most current list, ask: &ldquo;What standards do you currently support and how many elements does each one have?&rdquo;</p>

					<h3 style="margin-top: 1.2em;">How the standards are connected</h3>
					<p>Cross-standard meaning is anchored on CEDS &mdash; the common semantic backbone. Every mapped element resolves to a <strong>CEDS tuple</strong>: the domain class, the property, its range, and (where it matters) the individual code value. Two elements from different standards that resolve to the same tuple are talking about the same thing &mdash; and the graph is careful about how confidently it says so:</p>

					<h4 style="margin-top: 1em;">Authored mappings &mdash; EXACT_MATCH <span style="color: #888;">(confidence 1.0, spec-authoritative)</span></h4>
					<p>Some standards publish explicit CEDS references in their own specifications &mdash; decisions made by each standard's governance body. These become authored EXACT_MATCH edges: the strongest evidence in the graph.</p>

					<h4 style="margin-top: 1em;">Inferred mappings &mdash; CLOSE_MATCH <span style="color: #888;">(calibrated confidence + SKOS predicate)</span></h4>
					<p>Where no authored mapping exists, candidates are inferred: semantic retrieval over element definitions, adjudicated one-by-one with the option to decline &mdash; an element with no good match is honestly left unmapped rather than force-fit. Each accepted candidate carries a calibrated confidence and a SKOS relationship type. <strong>Inferred matches now resolve to the same full CEDS tuples as authored ones</strong> &mdash; an upgrade from the earlier leaf-node approach &mdash; so a hypothesis and an authored fact can be compared slot for slot.</p>

					<h4 style="margin-top: 1em;">Equivalence is conservative</h4>
					<p>Two elements are reported as <em>equivalent</em> only when <strong>both</strong> resolve to the same tuple by authored EXACT_MATCH. If either side is inferred, the pair is presented as a <em>candidate</em> equivalence &mdash; a promising hypothesis with its evidence shown, never dressed up as established fact.</p>

					<h4 style="margin-top: 1em;">Classification crosswalks are not equivalence</h4>
					<p>Some connections express relatedness rather than sameness: the CIP&rarr;SOC crosswalk records which occupations an instructional program prepares graduates for, straight from the published federal table. These edges never mix with the equivalence machinery, and the Explorer will say so if you ask.</p>

					<h4 style="margin-top: 1em;">The graph documents itself</h4>
					<p>Ask &ldquo;What is this graph, how was it built, and what can it do?&rdquo; and the Explorer reads the answer from the graph's own build records &mdash; the standards loaded, their versions, the recipe it was assembled from, and what each standard's mapping coverage looks like.</p>
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
