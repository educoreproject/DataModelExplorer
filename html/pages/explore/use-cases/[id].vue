<script setup>
import { getUseCaseById, getStandardsForUseCase, getDomainLabel, getDomainIcon } from '@/data/resolvers';
import { useCaseTaxonomy, useCaseCedsDomains } from '@/data/use-case-taxonomy';
import { useLoginStore } from '@/stores/loginStore';
import { createGraphinatorStore } from '@/stores/createGraphinatorStore';
import { personas } from '@/data/personas';
import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

const LoginStore = useLoginStore();
const route = useRoute();
const ucId = route.params.id;

const useCase = computed(() => getUseCaseById(ucId));
const standards = computed(() => getStandardsForUseCase(ucId));

// Sibling stories in same driver/subcategory
const siblingStories = computed(() => {
	if (!useCase.value) return [];
	for (const cat of useCaseTaxonomy) {
		for (const sub of cat.children) {
			if (sub.id === useCase.value.subcategoryId) {
				return sub.children.filter((uc) => uc.id !== ucId && uc.githubIssue);
			}
		}
	}
	return [];
});

const activeTab = ref('overview');
const tabs = [
	{ id: 'overview', label: 'Overview' },
	{ id: 'tchart', label: 'T-Chart' },
	{ id: 'swimlane', label: 'Swimlane' },
	{ id: 'roadmap', label: 'Implementation Roadmap' },
];

// Standards multi-select — auto-select standards with full domain matches and manageable burden
const selectedStandardIds = ref([]);
watch(standards, (list) => {
	if (selectedStandardIds.value.length) return; // don't override manual selections
	selectedStandardIds.value = list
		.filter(s => s.fullCount > 0 && s.entry.implementationBurden !== 'high')
		.map(s => s.entry.id);
}, { immediate: true });

function toggleStandard(id) {
	const idx = selectedStandardIds.value.indexOf(id);
	if (idx >= 0) {
		selectedStandardIds.value.splice(idx, 1);
	} else {
		selectedStandardIds.value.push(id);
	}
}

function isSelected(id) {
	return selectedStandardIds.value.includes(id);
}

// ── Inline implementation plan generation ──
const showPersonaPicker = ref(false);
const planResponse = ref('');
const planLoading = ref(false);
const planError = ref('');
const planStore = ref(null);
const responsePanel = ref(null);

const renderedPlan = computed(() => {
	if (!planResponse.value) return '';
	// Strip <control> tags (same as GraphinatorPanel)
	const stripped = planResponse.value.replace(/<control[^>]*>[\s\S]*?<\/control>/g, '');
	return marked.parse(stripped);
});

function createImplementationPlan() {
	if (!LoginStore.validUser) {
		navigateTo({ path: '/login', query: { redirect: route.fullPath } });
		return;
	}
	showPersonaPicker.value = true;
}

function selectPersonaAndGenerate(persona) {
	showPersonaPicker.value = false;

	const uc = useCase.value;
	const selectedSpecs = standards.value
		.filter((s) => selectedStandardIds.value.includes(s.entry.id))
		.map((s) => s.entry.title);

	const prompt =
		`[PERSONA: ${persona.title} — ${persona.description}]\n\n` +
		`Create an implementation plan for the "${uc.label}" use case (under ${uc.subcategoryLabel} / ${uc.categoryLabel}). ` +
		`CEDS domains involved: ${uc.cedsDomains.map(getDomainLabel).join(', ')}. ` +
		`IMPORTANT: The user has specifically selected ONLY these ${selectedSpecs.length} standards: ${selectedSpecs.join('; ')}. ` +
		`Limit your plan strictly to these selected standards — do NOT introduce or recommend other standards that were not selected. ` +
		`For each selected standard, describe what role it plays in this use case, what data elements are needed, ` +
		`implementation steps, dependencies between the selected standards, and a recommended phased approach.`;

	// Create store, connect, send
	planResponse.value = '';
	planLoading.value = true;
	planError.value = '';
	activeTab.value = 'roadmap';

	const useStore = createGraphinatorStore({
		storeId: 'ucPlanStore',
		wsPath: '/ws/explorer',
		defaultPromptName: 'DataModelExplorer',
		getUserRole: () => LoginStore.loggedInUser.role || null,
	});
	const store = useStore();
	planStore.value = store;

	// Watch for connection then send
	const stopWatch = watch(() => store.connected, (connected) => {
		if (connected) {
			setTimeout(() => {
				store.sendPrompt(prompt);
				stopWatch();
			}, 500);
		}
	});

	// Stream response text into our local ref
	watch(() => store.currentResponse?.stdout, (text) => {
		if (text) {
			planResponse.value = text;
			nextTick(() => {
				if (responsePanel.value) {
					responsePanel.value.scrollTop = responsePanel.value.scrollHeight;
				}
			});
		}
	});

	watch(() => store.loading, (loading) => {
		planLoading.value = loading;
	});

	store.connect();
}

// Swimlane steps (procedural from use case context)
const swimlaneActors = computed(() => {
	if (!useCase.value) return [];
	return [
		{ label: useCase.value.subcategoryLabel, desc: 'Primary actor driving this use case', color: '#1e40af' },
		{ label: 'System', desc: 'Automated processing and validation', color: '#7c3aed' },
		{ label: 'Verifier', desc: 'Credential verification and trust', color: '#15803d' },
	];
});

const swimlaneSteps = computed(() => {
	if (!useCase.value) return [];
	const uc = useCase.value;
	const domains = uc.cedsDomains || [];
	return [
		{ actorIdx: 0, action: `Initiate ${uc.label}`, dataIn: 'Request or trigger event' },
		{ actorIdx: 1, action: 'Validate inputs against CEDS domains', dataOut: domains.slice(0, 2).map(getDomainLabel).join(', ') || 'Validation result' },
		{ actorIdx: 0, action: 'Provide required credentials and documentation', dataIn: 'Source documents' },
		{ actorIdx: 1, action: 'Process and map to interoperability standards', dataIn: 'Raw data', dataOut: 'Structured records' },
		{ actorIdx: 2, action: 'Verify credential authenticity and claims', dataIn: 'Structured records', dataOut: 'Verification result' },
		{ actorIdx: 1, action: 'Update records and generate output', dataOut: 'Final LER / credential artifact' },
		{ actorIdx: 0, action: 'Receive and review results' },
	];
});
</script>

<template>
	<v-container v-if="useCase" class="py-6" style="max-width: 1100px;">
		<!-- Header -->
		<div class="text-caption text-medium-emphasis mb-1">
			USER STORY #{{ useCase.githubIssue || '—' }}
		</div>
		<h1 class="text-h4 font-weight-bold mb-4">{{ useCase.label }}</h1>

		<!-- Tabs -->
		<v-tabs v-model="activeTab" class="mb-6">
			<v-tab v-for="tab in tabs" :key="tab.id" :value="tab.id">
				{{ tab.label }}
			</v-tab>
		</v-tabs>

		<!-- ═══════════════════════════════════════════════════════════ -->
		<!-- OVERVIEW TAB -->
		<!-- ═══════════════════════════════════════════════════════════ -->
		<div v-if="activeTab === 'overview'">
			<!-- Hero card -->
			<v-card variant="flat" color="grey-lighten-4" class="pa-6 mb-6" rounded="lg">
				<v-chip size="small" color="primary" variant="flat" class="mb-3">SYSTEMATIC FRAMEWORK</v-chip>
				<h2 class="text-h5 font-weight-bold mb-2">{{ useCase.label }}</h2>
				<p class="text-body-1 text-medium-emphasis mb-3">
					Use case under <strong>{{ useCase.subcategoryLabel }}</strong> within the {{ useCase.categoryLabel }} topic, linking stakeholder needs to interoperable ecosystem nodes.
				</p>
				<div>
					<v-chip
						v-for="tag in (useCase.tags || [])"
						:key="tag"
						size="small"
						variant="outlined"
						class="mr-1"
					>{{ tag }}</v-chip>
				</div>
				<div class="mt-4 d-flex ga-3 flex-wrap">
					<v-btn
						v-if="useCase.githubIssue"
						:href="`https://github.com/educoreproject/educore_use_cases/issues/${useCase.githubIssue}`"
						target="_blank"
						color="grey-darken-3"
						prepend-icon="mdi-github"
					>
						View on GitHub
					</v-btn>
				</div>
			</v-card>

			<!-- Actor + CEDS Domains row -->
			<v-row class="mb-6">
				<v-col cols="12" md="4">
					<v-card variant="outlined" class="pa-5 h-100">
						<div class="d-flex align-center mb-2">
							<v-icon class="mr-2" color="primary">mdi-account-circle-outline</v-icon>
							<div>
								<div class="font-weight-bold">{{ useCase.subcategoryLabel }}</div>
								<div class="text-caption text-medium-emphasis">Primary Actor</div>
							</div>
						</div>
						<p class="text-body-2 text-medium-emphasis mb-3">
							Responsible for initiating and managing use cases in this domain.
						</p>
						<v-chip size="small" variant="tonal" color="primary">{{ useCase.categoryLabel }}</v-chip>
					</v-card>
				</v-col>
				<v-col cols="12" md="8">
					<div class="text-overline text-medium-emphasis mb-2">CEDS DOMAINS</div>
					<v-row dense>
						<v-col
							v-for="domain in useCase.cedsDomains"
							:key="domain"
							cols="6"
							sm="4"
						>
							<v-card variant="outlined" class="pa-3 text-center">
								<div class="text-body-2 font-weight-medium">{{ getDomainLabel(domain) }}</div>
							</v-card>
						</v-col>
					</v-row>
				</v-col>
			</v-row>

			<!-- Related User Stories -->
			<div v-if="siblingStories.length" class="mb-6">
				<div class="text-overline text-medium-emphasis mb-2">RELATED USER STORIES</div>
				<v-list density="compact" variant="outlined" rounded class="py-0">
					<v-list-item
						v-for="story in siblingStories"
						:key="story.id"
						:to="`/explore/use-cases/${story.id}`"
					>
						<v-list-item-title>{{ story.label }}</v-list-item-title>
						<template #append>
							<span class="text-caption text-medium-emphasis">#{{ story.githubIssue }}</span>
						</template>
					</v-list-item>
				</v-list>
			</div>
		</div>

		<!-- ═══════════════════════════════════════════════════════════ -->
		<!-- T-CHART TAB -->
		<!-- ═══════════════════════════════════════════════════════════ -->
		<div v-if="activeTab === 'tchart'">
			<h2 class="text-h5 font-weight-bold mb-1">T-Chart</h2>
			<p class="text-body-2 text-medium-emphasis mb-6">
				T-shaped view showing the use case within the topic context (vertical) and implementation specifics (horizontal).
			</p>

			<v-row>
				<!-- Left stem: Topic → Driver → Use Case -->
				<v-col cols="12" md="3">
					<div class="tchart-stem">
						<div class="tchart-level" style="background: #1e293b;">
							<div class="text-overline" style="color: rgba(255,255,255,0.6);">TOPIC</div>
							<div class="text-body-2 font-weight-bold" style="color: #fff;">{{ useCase.categoryLabel }}</div>
						</div>
						<div class="tchart-level" style="background: #1d4ed8;">
							<div class="text-overline" style="color: rgba(255,255,255,0.6);">VALUE DRIVER</div>
							<div class="text-body-2 font-weight-bold" style="color: #fff;">{{ useCase.subcategoryLabel }}</div>
						</div>
						<div class="tchart-level" style="background: #5B3FD3;">
							<div class="text-overline" style="color: rgba(255,255,255,0.6);">USE CASE</div>
							<div class="text-body-2 font-weight-bold" style="color: #fff;">{{ useCase.label }}</div>
						</div>
					</div>
				</v-col>

				<!-- Right bar: User Stories + Domains -->
				<v-col cols="12" md="9">
					<!-- Sibling user stories -->
					<div v-if="siblingStories.length" class="mb-6">
						<div class="text-overline text-medium-emphasis mb-2">USER STORIES — EXECUTABLE UNITS</div>
						<v-row dense>
							<v-col
								v-for="story in siblingStories"
								:key="story.id"
								cols="12"
								sm="6"
							>
								<v-card
									variant="outlined"
									class="pa-3"
									:to="`/explore/use-cases/${story.id}`"
									hover
								>
									<div class="d-flex align-start ga-2">
										<v-chip size="x-small" color="success" variant="flat">#{{ story.githubIssue }}</v-chip>
										<span class="text-body-2">{{ story.label }}</span>
									</div>
								</v-card>
							</v-col>
						</v-row>
					</div>

					<!-- Data Domains -->
					<div class="mb-6">
						<div class="text-overline text-medium-emphasis mb-2">DATA DOMAINS</div>
						<div class="d-flex ga-2 flex-wrap">
							<v-chip
								v-for="domain in useCase.cedsDomains"
								:key="domain"
								variant="flat"
								color="grey-darken-3"
								text-color="white"
								size="small"
							>
								{{ getDomainLabel(domain) }}
							</v-chip>
						</div>
					</div>

					<!-- Hierarchy Context -->
					<div>
						<div class="text-overline text-medium-emphasis mb-2">HIERARCHY CONTEXT</div>
						<ul class="text-body-2 pl-4">
							<li><strong>Topic:</strong> {{ useCase.categoryLabel }}</li>
							<li><strong>Driver:</strong> {{ useCase.subcategoryLabel }}</li>
							<li><strong>Domains:</strong> {{ useCase.cedsDomains.map(getDomainLabel).join(', ') }}</li>
						</ul>
					</div>
				</v-col>
			</v-row>
		</div>

		<!-- ═══════════════════════════════════════════════════════════ -->
		<!-- SWIMLANE TAB -->
		<!-- ═══════════════════════════════════════════════════════════ -->
		<div v-if="activeTab === 'swimlane'">
			<h2 class="text-h5 font-weight-bold mb-1">Swimlane Diagram</h2>
			<p class="text-body-2 text-medium-emphasis mb-4">
				Process-oriented view — who does what, with what data.
			</p>

			<!-- Legend -->
			<div class="d-flex ga-4 flex-wrap mb-4">
				<div v-for="actor in swimlaneActors" :key="actor.label" class="d-flex align-center ga-1">
					<div :style="{ width: '10px', height: '10px', borderRadius: '50%', background: actor.color }" />
					<span class="text-caption font-weight-bold">{{ actor.label }}</span>
					<span class="text-caption text-medium-emphasis">— {{ actor.desc }}</span>
				</div>
			</div>

			<!-- Swimlane table -->
			<div class="swimlane-table" style="overflow-x: auto;">
				<table style="width: 100%; border-collapse: collapse;">
					<thead>
						<tr>
							<th class="swimlane-header" style="width: 40px;">#</th>
							<th
								v-for="actor in swimlaneActors"
								:key="actor.label"
								class="swimlane-header"
								:style="{ background: actor.color, color: '#fff' }"
							>
								{{ actor.label }}
							</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="(step, idx) in swimlaneSteps" :key="idx" class="swimlane-row">
							<td class="swimlane-cell text-center font-weight-bold text-medium-emphasis">{{ idx + 1 }}</td>
							<td
								v-for="(actor, aIdx) in swimlaneActors"
								:key="aIdx"
								class="swimlane-cell"
								:class="{ 'swimlane-active': step.actorIdx === aIdx }"
								:style="step.actorIdx === aIdx ? { borderLeft: `3px solid ${actor.color}`, background: `${actor.color}08` } : {}"
							>
								<template v-if="step.actorIdx === aIdx">
									<div class="font-weight-bold text-body-2 mb-1">{{ step.action }}</div>
									<div v-if="step.dataIn" class="d-flex align-center ga-1 mb-1">
										<v-chip size="x-small" color="info" variant="flat">IN</v-chip>
										<span class="text-caption">{{ step.dataIn }}</span>
									</div>
									<div v-if="step.dataOut" class="d-flex align-center ga-1">
										<v-chip size="x-small" color="success" variant="flat">OUT</v-chip>
										<span class="text-caption">{{ step.dataOut }}</span>
									</div>
								</template>
							</td>
						</tr>
					</tbody>
				</table>
			</div>

			<!-- Connected User Stories -->
			<div v-if="siblingStories.length" class="mt-6">
				<div class="text-overline text-medium-emphasis mb-2">CONNECTED USER STORIES</div>
				<v-list density="compact" variant="outlined" rounded class="py-0">
					<v-list-item
						v-for="story in siblingStories"
						:key="story.id"
						:to="`/explore/use-cases/${story.id}`"
					>
						<v-list-item-title class="text-body-2">{{ story.label }}</v-list-item-title>
						<template #append>
							<span class="text-caption text-medium-emphasis">#{{ story.githubIssue }}</span>
						</template>
					</v-list-item>
				</v-list>
			</div>
		</div>

		<!-- ═══════════════════════════════════════════════════════════ -->
		<!-- IMPLEMENTATION ROADMAP TAB -->
		<!-- ═══════════════════════════════════════════════════════════ -->
		<div v-if="activeTab === 'roadmap'">
			<div class="d-flex align-center justify-space-between mb-2">
				<h2 class="text-h5 font-weight-bold">Implementation Roadmap</h2>
				<v-btn
					v-if="planResponse && !planLoading"
					variant="text"
					size="small"
					prepend-icon="mdi-open-in-new"
					:to="{ path: '/dm/explorer' }"
				>
					Open in Explorer
				</v-btn>
			</div>

			<p class="text-body-2 text-medium-emphasis mb-4">
				{{ selectedStandardIds.length }} standard{{ selectedStandardIds.length !== 1 ? 's' : '' }} identified for this use case based on CEDS domain alignment.
			</p>

			<!-- Pre-selected standards as removable chips -->
			<div v-if="selectedStandardIds.length" class="d-flex ga-2 flex-wrap mb-5">
				<v-chip
					v-for="std in standards.filter(s => isSelected(s.entry.id))"
					:key="std.entry.id"
					size="small"
					variant="tonal"
					color="primary"
					closable
					@click:close="toggleStandard(std.entry.id)"
				>
					{{ std.entry.title }}
				</v-chip>
				<v-chip
					v-for="std in standards.filter(s => !isSelected(s.entry.id))"
					:key="std.entry.id"
					size="small"
					variant="outlined"
					@click="toggleStandard(std.entry.id)"
				>
					+ {{ std.entry.title }}
				</v-chip>
			</div>

			<!-- CTA when no plan generated yet -->
			<div v-if="!planResponse && !planLoading" class="text-center py-8">
				<v-btn
					v-if="selectedStandardIds.length"
					color="primary"
					size="large"
					prepend-icon="mdi-rocket-launch"
					@click="createImplementationPlan"
				>
					Generate Implementation Roadmap
				</v-btn>
				<v-alert v-else type="info" variant="tonal" class="mt-2" style="max-width: 500px; margin: 0 auto;">
					No standards mapped to this use case's CEDS domains yet.
				</v-alert>
			</div>

			<!-- Loading state -->
			<div v-if="planLoading && !planResponse" class="text-center py-12">
				<v-progress-circular indeterminate color="secondary" size="48" class="mb-4" />
				<div class="text-body-2 text-medium-emphasis">Connecting to AI Explorer...</div>
			</div>

			<!-- Streaming response -->
			<v-card v-if="planResponse || planLoading" variant="outlined" class="plan-response-card">
				<div v-if="planLoading" class="plan-status-bar">
					<v-progress-linear indeterminate color="secondary" height="3" />
				</div>
				<div ref="responsePanel" class="plan-response-body prose" v-html="renderedPlan"></div>
			</v-card>

			<!-- Error -->
			<v-alert v-if="planError" type="error" variant="tonal" class="mt-4">
				{{ planError }}
			</v-alert>

			<!-- Follow-up actions -->
			<div v-if="!planLoading && planResponse" class="mt-4 d-flex ga-3">
				<v-btn
					color="primary"
					prepend-icon="mdi-open-in-new"
					:to="{ path: '/dm/explorer' }"
				>
					Continue in Explorer
				</v-btn>
				<v-btn
					variant="outlined"
					prepend-icon="mdi-refresh"
					@click="createImplementationPlan"
				>
					Regenerate
				</v-btn>
			</div>
		</div>

		<!-- Persona picker dialog -->
		<v-dialog v-model="showPersonaPicker" max-width="680" scrollable>
			<v-card class="pa-6">
				<v-card-title class="text-h6 font-weight-bold pb-1">Select your role</v-card-title>
				<v-card-subtitle class="pb-4">This helps the AI tailor the implementation plan to your perspective.</v-card-subtitle>
				<v-row dense>
					<v-col
						v-for="persona in personas"
						:key="persona.id"
						cols="12"
						sm="6"
					>
						<v-card
							variant="outlined"
							class="pa-4 text-center persona-pick-card"
							hover
							@click="selectPersonaAndGenerate(persona)"
						>
							<v-icon size="32" color="primary" class="mb-2">{{ persona.icon }}</v-icon>
							<div class="text-subtitle-2 font-weight-bold">{{ persona.title }}</div>
							<div class="text-caption text-medium-emphasis">{{ persona.description }}</div>
						</v-card>
					</v-col>
				</v-row>
			</v-card>
		</v-dialog>
	</v-container>

	<!-- Not found -->
	<v-container v-else class="py-12 text-center">
		<v-icon size="64" color="grey">mdi-alert-circle-outline</v-icon>
		<h2 class="text-h5 mt-4">Use case not found</h2>
		<v-btn to="/explore/use-cases" variant="text" class="mt-4">Back to Use Cases</v-btn>
	</v-container>
</template>

<style scoped>
.tchart-stem {
	display: flex;
	flex-direction: column;
	border-radius: 8px;
	overflow: hidden;
}

.tchart-level {
	padding: 16px;
}

.swimlane-header {
	padding: 10px 12px;
	text-align: center;
	font-size: 0.85rem;
	font-weight: 600;
	background: #f1f5f9;
}

.swimlane-row {
	border-bottom: 1px solid #f1f5f9;
}

.swimlane-cell {
	padding: 12px;
	vertical-align: top;
	min-height: 60px;
}

.swimlane-active {
	min-width: 180px;
}

.plan-response-card {
	overflow: hidden;
}

.plan-status-bar {
	flex-shrink: 0;
}

.plan-response-body {
	padding: 24px 28px;
	max-height: 60vh;
	overflow-y: auto;
	font-family: 'Open Sans', sans-serif;
	font-size: 15px;
	line-height: 1.7;
	color: var(--edu-gray-900, #111827);
}

.plan-response-body :deep(h1) { font-family: 'DM Serif Display', serif; font-size: 1.4rem; color: var(--edu-blue, #072A6C); margin: 1em 0 0.4em; }
.plan-response-body :deep(h2) { font-size: 1.15rem; font-weight: 700; color: var(--edu-blue, #072A6C); margin: 0.8em 0 0.3em; }
.plan-response-body :deep(h3) { font-size: 1rem; font-weight: 700; color: var(--edu-blue, #072A6C); margin: 0.6em 0 0.3em; }
.plan-response-body :deep(p) { margin: 0.4em 0; }
.plan-response-body :deep(ul), .plan-response-body :deep(ol) { margin: 0.4em 0; padding-left: 1.5em; }
.plan-response-body :deep(li) { margin: 0.2em 0; }
.plan-response-body :deep(code) { font-size: 0.85em; background: rgba(7,42,108,0.06); padding: 0.15em 0.3em; border-radius: 3px; }
.plan-response-body :deep(pre) { background: #1e293b; color: #f8fafc; padding: 1em; border-radius: 8px; overflow-x: auto; margin: 0.5em 0; }
.plan-response-body :deep(pre code) { background: none; padding: 0; color: inherit; }
.plan-response-body :deep(table) { border-collapse: collapse; margin: 0.5em 0; width: 100%; }
.plan-response-body :deep(th), .plan-response-body :deep(td) { border: 1px solid var(--edu-gray-100, #EEF1F7); padding: 0.4em 0.6em; text-align: left; }
.plan-response-body :deep(th) { background: var(--edu-gray-50, #F8F9FC); font-weight: 700; }
.plan-response-body :deep(strong) { font-weight: 700; }
.plan-response-body :deep(a) { color: var(--edu-teal, #00B5B8); }
.plan-response-body :deep(blockquote) { border-left: 3px solid var(--edu-teal, #00B5B8); margin: 0.5em 0; padding: 0.3em 0.8em; color: var(--edu-gray-500, #7A8499); }

.persona-pick-card {
	cursor: pointer;
	transition: border-color 0.15s, box-shadow 0.15s;
}

.persona-pick-card:hover {
	border-color: rgb(var(--v-theme-primary));
}
</style>
