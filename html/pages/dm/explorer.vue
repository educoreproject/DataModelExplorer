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
import { ref, watch, computed, onMounted } from 'vue';
import { useDmeStandardListStore } from '@/stores/dmeStandardListStore';
import { dmeExamplePromptList } from '@/data/dmeExamplePromptList';
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

// The standards list and the example prompts come from the graph (WEL, 2026-10-07): the list is askMilo's own
// dme_list_standards read on load, and a prompt is offered only when every standard family it needs is loaded now.
// When the list is unavailable the page says so, and offers only the prompts that are about the graph itself.
const standardListStore = useDmeStandardListStore();
onMounted(() => {
	standardListStore.fetchStandardInventory();
});

const graphExamplePromptList = computed(() =>
	dmeExamplePromptList
		.filter((oneExamplePrompt) => oneExamplePrompt.requiredFamilyList.every((familyName) => standardListStore.loadedFamilyNameList.includes(familyName)))
		.map((oneExamplePrompt) => oneExamplePrompt.promptText),
);

const formatCount = (countNumber) => Number(countNumber).toLocaleString();

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
		<SubPageNav :model-value="activeTab" :tabs="[{ label: 'Explore', value: 'explore', to: '/dm/explorer' }]" />

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
				:example-prompts="graphExamplePromptList"
				download-prefix="explorer-output"
			>
				<template #welcome>
					<h2>Welcome to the Data Model Explorer</h2>
					<p style="color: #1565C0; font-weight: 600; background: #E3F2FD; padding: 0.6em 1em; border-radius: 6px; margin-bottom: 0.8em;">
						<strong>The mapping layer has been rebuilt.</strong> Every cross-standard connection now resolves to a full CEDS <em>tuple</em> &mdash; domain class &middot; property &middot; range &mdash; instead of a bare element reference. Each connection is a <em>judgment</em>: one of four relations (exact, close, broad, narrow), carrying its own confidence and the source that made it. Ask about anything and the answer will tell you which relation it rests on and how confident the judgment was.
					</p>
					<p style="color: #1565C0; font-weight: 600; background: #E3F2FD; padding: 0.6em 1em; border-radius: 6px; margin-bottom: 0.8em;">
						Click the info icon in the bottom right for example prompts to get you started. Your sessions are automatically saved. Access them by the tiny clock icon in the bottom right. Manage them in the profile sessions editor.
					</p>
					<p><strong>The Data Model Explorer</strong> provides a unified graph of education data standards with cross-standard search, mapping, and comparison. The standards in this graph, read from the graph itself when this page opened:</p>
					<p v-if="standardListStore.standardListLoading" style="font-style: italic;">Reading the standards list from the graph&hellip;</p>
					<p v-else-if="standardListStore.standardListUnavailableReason" style="color: #B71C1C; font-weight: 600;">standards list unavailable: {{ standardListStore.standardListUnavailableReason }}</p>
					<template v-else-if="standardListStore.standardInventory">
						<ul style="margin: 0.8em 0 0.8em 1.5em;">
							<li v-for="familyGroup in standardListStore.standardFamilyGroupList" :key="familyGroup.standardFamily">
								<template v-if="familyGroup.standardList.length === 1">
									<strong>{{ familyGroup.standardFamily }}</strong> &mdash; {{ familyGroup.standardList[0].standardName }} {{ familyGroup.standardList[0].version }}
									<span style="color: #888;">
										&middot; {{ formatCount(familyGroup.standardList[0].nodeCount) }} nodes
										&middot; <template v-if="familyGroup.standardList[0].isHub">the semantic hub</template><template v-else-if="familyGroup.standardList[0].mappedToHub">{{ formatCount(familyGroup.standardList[0].hubMatchEdgeCount) }} judged mappings to {{ standardListStore.standardInventory.totals.hubSource }}</template><template v-else>not mapped to {{ standardListStore.standardInventory.totals.hubSource }}</template>
									</span>
								</template>
								<template v-else>
									<strong>{{ familyGroup.standardFamily }}</strong> &mdash; {{ familyGroup.standardList.length }} releases
									<ul style="margin: 0.2em 0 0.2em 1.5em;">
										<li v-for="oneStandard in familyGroup.standardList" :key="oneStandard.source">
											{{ oneStandard.standardName }}
											<span style="color: #888;">
												&middot; {{ formatCount(oneStandard.nodeCount) }} nodes
												&middot; <template v-if="oneStandard.isHub">the semantic hub</template><template v-else-if="oneStandard.mappedToHub">{{ formatCount(oneStandard.hubMatchEdgeCount) }} judged mappings to {{ standardListStore.standardInventory.totals.hubSource }}</template><template v-else>not mapped to {{ standardListStore.standardInventory.totals.hubSource }}</template>
											</span>
										</li>
									</ul>
								</template>
							</li>
						</ul>
						<p style="color: #888;">{{ standardListStore.standardInventory.totals.standardCount }} standards in {{ standardListStore.standardFamilyGroupList.length }} families.</p>
					</template>
					<p style="font-style: italic;">For element counts and mapping coverage in the conversation, ask: &ldquo;What standards do you currently support and how many elements does each one have?&rdquo;</p>

					<h3 style="margin-top: 1.2em;">How the standards are connected</h3>
					<p>Cross-standard meaning is anchored on CEDS &mdash; the common semantic backbone. A mapped element resolves to a <strong>CEDS tuple</strong>: the domain class, the property and its range. Two elements from different standards that resolve to the same tuple may be talking about the same thing &mdash; and the graph is careful about how confidently it says so:</p>

					<h4 style="margin-top: 1em;">Four relations, each a judgment</h4>
					<p>Every mapping names one of the four SKOS relations between an element and its CEDS tuple: <strong>exact</strong> (EXACT_MATCH &mdash; the same concept), <strong>close</strong> (CLOSE_MATCH &mdash; near enough to use with care), <strong>broad</strong> (BROAD_MATCH &mdash; the CEDS concept is broader) and <strong>narrow</strong> (NARROW_MATCH &mdash; the CEDS concept is narrower). None of them is a fact. Each is a judgment that carries its own <span style="color: #888;">confidence</span> and its <span style="color: #888;">source</span> &mdash; in this build, bridge-jev, the judge that read each element's definition beside its CEDS candidates. Relation and confidence are independent: an exact match can be held with modest confidence.</p>

					<h4 style="margin-top: 1em;">The judge may abstain</h4>
					<p>Candidates are found by semantic retrieval over element definitions and then judged one by one, with &ldquo;none of these&rdquo; always among the choices. An element with no good CEDS match is left unmapped rather than force-fit, and the Explorer will say when something is unmapped instead of guessing.</p>

					<h4 style="margin-top: 1em;">Equivalence is conservative</h4>
					<p>Two elements from different standards are reported as <em>equivalent</em> only when <strong>both</strong> are judged EXACT_MATCH to the same tuple &mdash; two judgments, each shown with its confidence. If either hop is CLOSE_MATCH the pair is a <em>candidate</em> equivalence; a BROAD or NARROW hop makes them only <em>related</em>. A hypothesis is shown with its evidence, never dressed up as established fact.</p>

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
