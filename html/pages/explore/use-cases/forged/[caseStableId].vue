<script setup>
// @concept: [[DataModelExplorer]]
// Explore → Use Cases → one FORGED use case (use-case forge Phase 5, 2026-10-30; Phase C3 the same day).
//
// One case of the EDUcore use-case standard, read from the graph. TQ ruled that the old static catalogue goes away and that
// its replacement must not be poorer ("the old ones had swimlanes and t-charts and stuff"), so the old page's presentation
// is carried over, every tab fed by the graph instead of the static file:
//   Overview             the case, its actors (HAS_ACTOR role and interest), what it assumes and guarantees, what starts it,
//                        its related cases and its sources
//   T-Chart              stem: subject → value drivers → use case; bar: its user stories, the elements it cites, its actors
//   Swimlane             the actors who perform a step (story PERFORMED_BY actor) as lanes, the steps in reading order as rows,
//                        each with the data it uses (IN) and produces (OUT)
//   Steps and citations  the steps table and every data reference with its state, linked into the Standards Explorer
//   Implementation Guide the standards a judge mapped to each cited element's hub card, and an Ask DME roadmap

import { computed, ref, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { marked } from 'marked';
import { useForgedUseCaseStore } from '@/stores/forgedUseCaseStore';
import { useLoginStore } from '@/stores/loginStore';
import { createEdunatorStore } from '@/stores/createEdunatorStore';
import { pathTextOf, FAMILY_CATALOG_STABLE_ID } from '@/components/standardsExplorer/explorerVocabulary';

marked.setOptions({ breaks: true, gfm: true });

const route = useRoute();
const store = useForgedUseCaseStore();
const loginStore = useLoginStore();

watch(
	() => route.params.caseStableId,
	(caseStableId) => {
		if (caseStableId) store.fetchCase(caseStableId);
	},
	{ immediate: true },
);

const useCase = computed(() => (store.caseDetail ? store.caseDetail.useCase : null));
const stepList = computed(() => (store.caseDetail ? store.caseDetail.stepList : []));
const citationList = computed(() => (store.caseDetail ? store.caseDetail.citationList : []));
const shownStateCountList = computed(() => (store.caseDetail ? store.caseDetail.citationStateCountList.filter((oneState) => oneState.citationCount > 0) : []));
const contextBySection = computed(() => (store.caseDetail && store.caseDetail.contextBySection) || {});
const contextOf = (sectionName) => contextBySection.value[sectionName] || [];
const implementationGuide = computed(() => (store.caseDetail && store.caseDetail.implementationGuide) || { citedElementList: [], standardList: [] });

const activeTab = ref('overview');
const TAB_LIST = Object.freeze([
	{ tabName: 'overview', tabLabel: 'Overview' },
	{ tabName: 'tchart', tabLabel: 'T-Chart' },
	{ tabName: 'swimlane', tabLabel: 'Swimlane' },
	{ tabName: 'steps', tabLabel: 'Steps and citations' },
	{ tabName: 'standards', tabLabel: 'Implementation Guide' },
]);

// step kind, citation state and guarantee role → chip colour; anything the table does not name is drawn plain
const STEP_KIND_COLOUR_BY_KIND = Object.freeze({ main: 'primary', exception: 'error', extension: 'warning' });
const CITATION_STATE_COLOUR_BY_STATE = Object.freeze({ resolved: 'success', gap: 'error', documentAnchored: 'info', wholeStandard: 'info', unresolved: 'warning', corpus: 'grey' });
const GUARANTEE_ROLE_COLOUR_BY_ROLE = Object.freeze({ success: 'success', minimum: 'warning', invariant: 'info' });
const RELATED_CASE_LABEL_BY_EDGE_TYPE = Object.freeze({ PARENT: 'part of', CHILD: 'contains', SIBLING: 'sibling', INVOKES: 'invokes', INCLUDES: 'includes', EXTENDS: 'extends', DUPLICATE: 'duplicates' });
const ACTOR_COLOUR_LIST = Object.freeze(['#1e40af', '#7c3aed', '#15803d', '#b45309', '#be185d', '#0f766e', '#6d28d9', '#dc2626']);

const explorerLinkOf = (citedStableId) => ({ path: '/explore/graphicModelExplorer', query: { path: pathTextOf([FAMILY_CATALOG_STABLE_ID, citedStableId]) } });
const forgedCaseLinkOf = (caseStableId) => `/explore/use-cases/forged/${encodeURIComponent(caseStableId)}`;
const citedIdentifierTextOf = (oneCitation) => [oneCitation.citedStandard, oneCitation.citedIdentifier].filter(Boolean).join(' ');

// ================================================================================
// ACTORS — the case's own cast (HAS_ACTOR, in its listed order), each with a lane colour

const actorList = computed(() =>
	contextOf('actor').map((oneActor, actorIndex) => ({
		actorStableId: oneActor.targetStableId,
		actorName: oneActor.targetName,
		actorRole: oneActor.edgeRole,
		actorInterest: oneActor.interest,
		laneColour: ACTOR_COLOUR_LIST[actorIndex % ACTOR_COLOUR_LIST.length],
	})),
);
const laneColourOf = (actorName) => (actorList.value.find((oneActor) => oneActor.actorName === actorName) || {}).laneColour || '#64748b';

// ================================================================================
// SWIMLANE — lanes are the actors who PERFORM a step (story PERFORMED_BY actor), in cast order, then any performer the cast
// does not list; rows are the steps in reading order

const swimlaneActorList = computed(() => {
	const performerNameList = [...new Set(stepList.value.map((oneStep) => oneStep.actorName).filter(Boolean))];
	const castPerformerList = actorList.value.filter((oneActor) => performerNameList.includes(oneActor.actorName));
	const uncastPerformerList = performerNameList
		.filter((performerName) => !actorList.value.some((oneActor) => oneActor.actorName === performerName))
		.map((performerName) => ({ actorName: performerName, actorRole: 'performs a step; not in the case\'s cast list', laneColour: '#64748b' }));
	return castPerformerList.concat(uncastPerformerList);
});
const dataTextOf = (oneStep, dataEdgeType) => oneStep.dataList.filter((oneData) => oneData.dataEdgeType === dataEdgeType).map((oneData) => oneData.dataName || oneData.dataStableId).join('; ');

// ================================================================================
// T-CHART — the data domains are the elements the case cites that resolve in the graph

const citedElementList = computed(() => implementationGuide.value.citedElementList || []);

// ================================================================================
// IMPLEMENTATION GUIDE — standards chips (the most cited elements held first, all selected), and an Ask DME roadmap

const standardList = computed(() => implementationGuide.value.standardList || []);
const selectedStandardList = ref([]);
watch(standardList, (shownStandardList) => {
	selectedStandardList.value = shownStandardList.map((oneStandard) => oneStandard.standard);
}, { immediate: true });
const isStandardSelected = (standardName) => selectedStandardList.value.includes(standardName);
const toggleStandard = (standardName) => {
	selectedStandardList.value = isStandardSelected(standardName)
		? selectedStandardList.value.filter((oneName) => oneName !== standardName)
		: selectedStandardList.value.concat([standardName]);
};
const relationTextOf = (relationCountList) => relationCountList.map((oneRelation) => `${(oneRelation.relation || '').replace('_MATCH', '').toLowerCase()} ${oneRelation.elementCount}`).join(', ');

const planResponseText = ref('');
const planLoading = ref(false);
const planStatusMsg = ref(''); // a future refusal from the Explorer connection would land here; nothing sets it yet
const planResponsePanel = ref(null);
const renderedPlanHtml = computed(() => (planResponseText.value ? marked.parse(planResponseText.value.replace(/<control[^>]*>[\s\S]*?<\/control>/g, '')) : ''));

const createImplementationPlan = () => {
	if (!loginStore.validUser) {
		navigateTo({ path: '/login', query: { redirect: route.fullPath } });
		return;
	}
	const promptText =
		`Create an implementation roadmap for the forged use case ${useCase.value.caseStableId} ("${useCase.value.shortName}": ${useCase.value.longName}). ` +
		`Read the case from the graph first (dme_explore with the case id; its steps in edgeProperties order) and follow its citations ` +
		`(DECLARED_CORRESPONDENCE) to the CEDS elements it cites: ${citedElementList.value.map((oneElement) => oneElement.citedName).join(', ')}. ` +
		`Limit the roadmap STRICTLY to these ${selectedStandardList.value.length} standards: ${selectedStandardList.value.join('; ')}. ` +
		`For each, say which cited elements it holds and by which judged relation, what each step of the case needs from it, the dependencies ` +
		`between the selected standards, and a phased approach. Name the case's gaps (orphan or document-anchored references) as gaps.`;
	planResponseText.value = '';
	planStatusMsg.value = '';
	planLoading.value = true;
	const usePlanStore = createEdunatorStore({
		storeId: 'forgedCasePlanStore',
		wsPath: '/ws/explorer',
		defaultPromptName: 'DataModelExplorer',
		getUserRole: () => loginStore.loggedInUser.role || null,
		getAuthHeaders: async () => ({ ...loginStore.getAuthTokenProperty }),
	});
	const planStore = usePlanStore();
	const stopConnectedWatch = watch(() => planStore.connected, (isConnected) => {
		if (!isConnected) return;
		planStore.sendPrompt(promptText);
		stopConnectedWatch();
	});
	watch(() => planStore.currentResponse?.stdout, (stdoutText) => {
		if (!stdoutText) return;
		planResponseText.value = stdoutText;
		nextTick(() => {
			if (planResponsePanel.value) planResponsePanel.value.scrollTop = planResponsePanel.value.scrollHeight;
		});
	});
	watch(() => planStore.loading, (isLoading) => {
		planLoading.value = isLoading;
	});
	planStore.connect();
};
</script>

<template>
	<v-container class="py-6" style="max-width: 1100px;" data-testid="forged-use-case-page">
		<v-btn variant="text" size="small" prepend-icon="mdi-arrow-left" to="/explore/use-cases" class="mb-2 px-0">Use Cases</v-btn>

		<v-progress-linear v-if="store.caseLoading" indeterminate color="primary" class="mb-4" />
		<v-alert v-if="store.caseStatusMsg" type="error" variant="tonal" class="mb-4" data-testid="forged-use-case-error">{{ store.caseStatusMsg }}</v-alert>

		<template v-if="useCase">
			<div class="text-overline text-medium-emphasis">{{ useCase.standardName || useCase.standardSource }} &middot; release {{ useCase.releaseVersion }} &middot; format {{ useCase.formatVersion }} &middot; <code>{{ useCase.caseStableId }}</code></div>
			<h1 class="text-h4 font-weight-bold text-primary mb-1" data-testid="forged-use-case-title">{{ useCase.shortName }}</h1>
			<p class="text-h6 font-weight-regular mb-4">{{ useCase.longName }}</p>

			<v-tabs v-model="activeTab" class="mb-6" data-testid="forged-use-case-tabs">
				<v-tab v-for="oneTab in TAB_LIST" :key="oneTab.tabName" :value="oneTab.tabName" :data-testid="`tab-${oneTab.tabName}`">{{ oneTab.tabLabel }}</v-tab>
			</v-tabs>

			<!-- ═══ OVERVIEW ═══ -->
			<div v-if="activeTab === 'overview'" data-testid="panel-overview">
				<v-card variant="flat" color="grey-lighten-4" class="pa-6 mb-6" rounded="lg">
					<v-chip size="small" color="primary" variant="flat" class="mb-3">EDUCORE USE CASE &middot; {{ useCase.level || 'level not stated' }}</v-chip>
					<h2 class="text-h5 font-weight-bold mb-2">{{ useCase.longName }}</h2>
					<p v-if="useCase.scope" class="text-body-1 text-medium-emphasis mb-2"><strong>Scope:</strong> {{ useCase.scope }}</p>
					<p v-if="contextOf('trigger').length" class="text-body-2 mb-2"><strong>Starts when:</strong> {{ contextOf('trigger').map((oneTrigger) => oneTrigger.targetName).join('; ') }}</p>
					<p v-if="useCase.frequency" class="text-body-2 mb-2"><strong>Frequency:</strong> {{ useCase.frequency }}</p>
					<div class="d-flex flex-wrap ga-1">
						<v-chip v-for="oneDriver in contextOf('valueDriver')" :key="oneDriver.targetStableId" size="small" variant="outlined">{{ oneDriver.targetName }}</v-chip>
					</div>
				</v-card>

				<v-row class="mb-6">
					<v-col cols="12" md="6">
						<div class="text-overline text-medium-emphasis mb-2">ACTORS</div>
						<v-card v-for="oneActor in actorList" :key="oneActor.actorStableId" variant="outlined" class="pa-4 mb-2">
							<div class="d-flex align-center ga-2 mb-1">
								<div :style="{ width: '10px', height: '10px', borderRadius: '50%', background: oneActor.laneColour, flexShrink: 0 }" />
								<div class="font-weight-bold text-body-2">{{ oneActor.actorName }}</div>
								<v-chip v-if="contextOf('primaryActor').some((onePrimary) => onePrimary.targetStableId === oneActor.actorStableId)" size="x-small" color="primary" variant="tonal">primary</v-chip>
							</div>
							<div v-if="oneActor.actorRole" class="text-caption pl-5">{{ oneActor.actorRole }}</div>
							<div v-if="oneActor.actorInterest" class="text-caption text-medium-emphasis pl-5">Interest: {{ oneActor.actorInterest }}</div>
						</v-card>
						<template v-if="contextOf('interestedParty').length">
							<div class="text-overline text-medium-emphasis mb-2 mt-4">INTERESTED PARTIES</div>
							<v-card v-for="oneParty in contextOf('interestedParty')" :key="oneParty.targetStableId" variant="outlined" class="pa-3 mb-2">
								<div class="font-weight-bold text-body-2">{{ oneParty.targetName }} <span v-if="oneParty.partyKind" class="text-caption text-medium-emphasis">({{ oneParty.partyKind }})</span></div>
								<div v-if="oneParty.interest" class="text-caption text-medium-emphasis">{{ oneParty.interest }}</div>
							</v-card>
						</template>
					</v-col>
					<v-col cols="12" md="6">
						<div class="text-overline text-medium-emphasis mb-2">DATA DOMAINS (CITED ELEMENTS)</div>
						<v-row dense class="mb-4">
							<v-col v-for="oneElement in citedElementList" :key="oneElement.citedStableId" cols="6">
								<v-card variant="outlined" class="pa-3 text-center" :to="explorerLinkOf(oneElement.citedStableId)">
									<div class="text-body-2 font-weight-medium">{{ oneElement.citedName }}</div>
									<div class="text-caption text-medium-emphasis">{{ oneElement.citedSource }}</div>
								</v-card>
							</v-col>
						</v-row>
						<div v-if="contextOf('precondition').length" class="mb-4">
							<div class="text-overline text-medium-emphasis mb-2">ASSUMES (PRECONDITIONS)</div>
							<ul class="text-body-2 pl-4"><li v-for="oneCondition in contextOf('precondition')" :key="oneCondition.targetStableId">{{ oneCondition.targetName }}</li></ul>
						</div>
						<div v-if="contextOf('guarantee').length">
							<div class="text-overline text-medium-emphasis mb-2">GUARANTEES (OUTCOMES)</div>
							<div v-for="oneGuarantee in contextOf('guarantee')" :key="oneGuarantee.targetStableId" class="d-flex align-start ga-2 mb-2">
								<v-chip size="x-small" variant="tonal" :color="GUARANTEE_ROLE_COLOUR_BY_ROLE[oneGuarantee.edgeRole]">{{ oneGuarantee.edgeRole }}</v-chip>
								<span class="text-body-2">{{ oneGuarantee.targetName }}</span>
							</div>
						</div>
					</v-col>
				</v-row>

				<div v-if="contextOf('relatedCase').length" class="mb-6">
					<div class="text-overline text-medium-emphasis mb-2">RELATED USE CASES</div>
					<v-list density="compact" variant="outlined" rounded class="py-0">
						<v-list-item v-for="oneRelated in contextOf('relatedCase')" :key="`${oneRelated.edgeType}-${oneRelated.targetStableId}`" :to="forgedCaseLinkOf(oneRelated.targetStableId)">
							<v-list-item-title>{{ oneRelated.targetShortName || oneRelated.targetName }}</v-list-item-title>
							<v-list-item-subtitle v-if="oneRelated.notes">{{ oneRelated.notes }}</v-list-item-subtitle>
							<template #append><v-chip size="x-small" variant="tonal">{{ RELATED_CASE_LABEL_BY_EDGE_TYPE[oneRelated.edgeType] || oneRelated.edgeType }}</v-chip></template>
						</v-list-item>
					</v-list>
				</div>

				<div v-if="contextOf('resource').length">
					<div class="text-overline text-medium-emphasis mb-2">SOURCES AND RESOURCES</div>
					<ul class="text-body-2 pl-4">
						<li v-for="oneResource in contextOf('resource')" :key="oneResource.targetStableId">
							<a v-if="oneResource.url" :href="oneResource.url" target="_blank" rel="noopener">{{ oneResource.targetName }}</a>
							<template v-else>{{ oneResource.targetName }}</template>
						</li>
					</ul>
				</div>
			</div>

			<!-- ═══ T-CHART ═══ -->
			<div v-if="activeTab === 'tchart'" data-testid="panel-tchart">
				<h2 class="text-h5 font-weight-bold mb-1">T-Chart</h2>
				<p class="text-body-2 text-medium-emphasis mb-6">The case in its context (the stem: what it is about, what it serves) and its implementation specifics (the bar).</p>
				<v-row>
					<v-col cols="12" md="3">
						<div class="tchart-stem">
							<div v-for="oneSubject in contextOf('subject')" :key="oneSubject.targetStableId" class="tchart-level" style="background: #1e293b;">
								<div class="text-overline" style="color: rgba(255,255,255,0.6);">SUBJECT</div>
								<div class="text-body-2 font-weight-bold" style="color: #fff;">{{ oneSubject.targetName }}</div>
							</div>
							<div v-for="oneDriver in contextOf('valueDriver')" :key="oneDriver.targetStableId" class="tchart-level" style="background: #1d4ed8;">
								<div class="text-overline" style="color: rgba(255,255,255,0.6);">VALUE DRIVER</div>
								<div class="text-body-2 font-weight-bold" style="color: #fff;">{{ oneDriver.targetName }}</div>
							</div>
							<div class="tchart-level" style="background: #5B3FD3;">
								<div class="text-overline" style="color: rgba(255,255,255,0.6);">USE CASE</div>
								<div class="text-body-2 font-weight-bold" style="color: #fff;">{{ useCase.shortName }}</div>
							</div>
						</div>
					</v-col>
					<v-col cols="12" md="9">
						<div class="mb-6">
							<div class="text-overline text-medium-emphasis mb-2">USER STORIES — EXECUTABLE UNITS ({{ stepList.length }})</div>
							<v-row dense>
								<v-col v-for="oneStep in stepList" :key="oneStep.codedNotation" cols="12" sm="6">
									<v-card variant="outlined" class="pa-3">
										<div class="d-flex align-start ga-2">
											<v-chip size="x-small" :color="STEP_KIND_COLOUR_BY_KIND[oneStep.stepKind]" variant="flat">{{ oneStep.codedNotation }}</v-chip>
											<span class="text-body-2"><strong>{{ oneStep.actorName }}</strong> {{ oneStep.action }}</span>
										</div>
									</v-card>
								</v-col>
							</v-row>
						</div>
						<div class="mb-6">
							<div class="text-overline text-medium-emphasis mb-2">DATA DOMAINS</div>
							<div class="d-flex ga-2 flex-wrap">
								<v-chip v-for="oneElement in citedElementList" :key="oneElement.citedStableId" variant="flat" color="grey-darken-3" size="small" :to="explorerLinkOf(oneElement.citedStableId)">{{ oneElement.citedSource }} {{ oneElement.citedName }}</v-chip>
							</div>
						</div>
						<div class="mb-6">
							<div class="text-overline text-medium-emphasis mb-2">ACTORS</div>
							<v-row dense>
								<v-col v-for="oneActor in actorList" :key="oneActor.actorStableId" cols="12" sm="6">
									<v-card variant="outlined" class="pa-3">
										<div class="d-flex align-center ga-2 mb-1">
											<div :style="{ width: '8px', height: '8px', borderRadius: '50%', background: oneActor.laneColour, flexShrink: 0 }" />
											<span class="text-body-2 font-weight-bold">{{ oneActor.actorName }}</span>
										</div>
										<div v-if="oneActor.actorRole" class="text-caption text-medium-emphasis pl-4">{{ oneActor.actorRole }}</div>
									</v-card>
								</v-col>
							</v-row>
						</div>
						<div>
							<div class="text-overline text-medium-emphasis mb-2">HIERARCHY CONTEXT</div>
							<ul class="text-body-2 pl-4">
								<li><strong>Subject:</strong> {{ contextOf('subject').map((oneSubject) => oneSubject.targetName).join('; ') || 'none stated' }}</li>
								<li><strong>Value drivers:</strong> {{ contextOf('valueDriver').map((oneDriver) => oneDriver.targetName).join('; ') || 'none stated' }}</li>
								<li><strong>Domains:</strong> {{ citedElementList.map((oneElement) => oneElement.citedName).join(', ') || 'no cited element resolves in the graph' }}</li>
							</ul>
						</div>
					</v-col>
				</v-row>
			</div>

			<!-- ═══ SWIMLANE ═══ -->
			<div v-if="activeTab === 'swimlane'" data-testid="panel-swimlane">
				<h2 class="text-h5 font-weight-bold mb-1">Swimlane Diagram</h2>
				<p class="text-body-2 text-medium-emphasis mb-4">Who does what, with what data: each step in its performer's lane (the story's PERFORMED_BY actor), in reading order.</p>
				<div class="d-flex ga-4 flex-wrap mb-4">
					<div v-for="oneActor in swimlaneActorList" :key="oneActor.actorName" class="d-flex align-center ga-1">
						<div :style="{ width: '10px', height: '10px', borderRadius: '50%', background: oneActor.laneColour }" />
						<span class="text-caption font-weight-bold">{{ oneActor.actorName }}</span>
						<span v-if="oneActor.actorRole" class="text-caption text-medium-emphasis">— {{ oneActor.actorRole }}</span>
					</div>
				</div>
				<div class="swimlane-table" style="overflow-x: auto;">
					<table style="width: 100%; border-collapse: collapse;" data-testid="swimlane-table">
						<thead>
							<tr>
								<th class="swimlane-header" style="width: 48px;">#</th>
								<th v-for="oneActor in swimlaneActorList" :key="oneActor.actorName" class="swimlane-header" :style="{ background: oneActor.laneColour, color: '#fff' }">{{ oneActor.actorName }}</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="oneStep in stepList" :key="oneStep.codedNotation" class="swimlane-row">
								<td class="swimlane-cell text-center font-weight-bold text-medium-emphasis">{{ oneStep.codedNotation }}</td>
								<td
									v-for="oneActor in swimlaneActorList"
									:key="oneActor.actorName"
									class="swimlane-cell"
									:class="{ 'swimlane-active': oneStep.actorName === oneActor.actorName }"
									:style="oneStep.actorName === oneActor.actorName ? { borderLeft: `3px solid ${oneActor.laneColour}`, background: `${oneActor.laneColour}08` } : {}"
								>
									<template v-if="oneStep.actorName === oneActor.actorName">
										<v-chip v-if="oneStep.stepKind !== 'main'" size="x-small" variant="tonal" class="mb-1" :color="STEP_KIND_COLOUR_BY_KIND[oneStep.stepKind]">{{ oneStep.stepKind }}</v-chip>
										<div class="font-weight-bold text-body-2 mb-1">{{ oneStep.action }}</div>
										<div v-if="dataTextOf(oneStep, 'CONSUMES')" class="d-flex align-center ga-1 mb-1">
											<v-chip size="x-small" color="info" variant="flat">IN</v-chip>
											<span class="text-caption">{{ dataTextOf(oneStep, 'CONSUMES') }}</span>
										</div>
										<div v-if="dataTextOf(oneStep, 'PRODUCES')" class="d-flex align-center ga-1">
											<v-chip size="x-small" color="success" variant="flat">OUT</v-chip>
											<span class="text-caption">{{ dataTextOf(oneStep, 'PRODUCES') }}</span>
										</div>
									</template>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>

			<!-- ═══ STEPS AND CITATIONS ═══ -->
			<div v-if="activeTab === 'steps'" data-testid="panel-steps">
				<h2 class="text-h6 font-weight-bold mb-2">Steps <span class="text-medium-emphasis text-body-2">({{ stepList.length }}, in reading order)</span></h2>
				<v-table density="compact" class="mb-8" data-testid="forged-use-case-steps">
					<thead>
						<tr><th style="width: 4em;">Step</th><th style="width: 7em;">Kind</th><th style="width: 14em;">Actor</th><th>Action</th><th>Data</th></tr>
					</thead>
					<tbody>
						<tr v-for="oneStep in stepList" :key="oneStep.codedNotation" :data-testid="`step-${oneStep.codedNotation}`">
							<td class="font-weight-bold">{{ oneStep.codedNotation }}</td>
							<td><v-chip size="x-small" variant="tonal" :color="STEP_KIND_COLOUR_BY_KIND[oneStep.stepKind]">{{ oneStep.stepKind }}</v-chip></td>
							<td class="text-body-2">{{ oneStep.actorName }}</td>
							<td class="text-body-2">{{ oneStep.action }}</td>
							<td>
								<v-chip v-for="oneData in oneStep.dataList" :key="`${oneData.dataEdgeType}-${oneData.dataStableId}`" size="x-small" variant="outlined" class="mr-1 mb-1">
									{{ oneData.dataEdgeType === 'PRODUCES' ? 'produces' : 'uses' }}: {{ oneData.dataName || oneData.dataStableId }}
								</v-chip>
							</td>
						</tr>
					</tbody>
				</v-table>

				<h2 class="text-h6 font-weight-bold mb-2">Citations <span class="text-medium-emphasis text-body-2">({{ citationList.length }} data references)</span></h2>
				<div class="d-flex flex-wrap ga-2 mb-3">
					<v-chip v-for="oneState in shownStateCountList" :key="oneState.citationState" size="small" variant="tonal" :color="CITATION_STATE_COLOUR_BY_STATE[oneState.citationState]">{{ oneState.citationCount }} {{ oneState.stateLabel }}</v-chip>
				</div>
				<v-table density="compact" data-testid="forged-use-case-citations">
					<thead>
						<tr><th>Reference</th><th>Cites</th><th>State</th><th>Cited element</th></tr>
					</thead>
					<tbody>
						<tr v-for="oneCitation in citationList" :key="oneCitation.referenceStableId">
							<td class="text-body-2">{{ oneCitation.referenceName || oneCitation.referenceStableId }}</td>
							<td class="text-body-2"><code v-if="citedIdentifierTextOf(oneCitation)">{{ citedIdentifierTextOf(oneCitation) }}</code></td>
							<td><v-chip size="x-small" variant="tonal" :color="CITATION_STATE_COLOUR_BY_STATE[oneCitation.citationState]">{{ oneCitation.citationStateLabel }}</v-chip></td>
							<td class="text-body-2">
								<NuxtLink v-if="oneCitation.citedStableId" :to="explorerLinkOf(oneCitation.citedStableId)" :data-testid="`citation-link-${oneCitation.citedIdentifier}`">{{ oneCitation.citedSource }} {{ oneCitation.citedName }}</NuxtLink>
							</td>
						</tr>
					</tbody>
				</v-table>
				<p class="text-caption text-medium-emphasis mt-2">A citation is the use case author's own reference to another standard's element (a declared correspondence, <code>edc:cites</code>), not a mapping. Open a cited element to see how every other standard maps to it.</p>
			</div>

			<!-- ═══ IMPLEMENTATION GUIDE ═══ -->
			<div v-if="activeTab === 'standards'" data-testid="panel-standards">
				<div class="d-flex align-center justify-space-between mb-2">
					<h2 class="text-h5 font-weight-bold">Implementation Roadmap</h2>
					<v-btn variant="text" size="small" to="/explore/graphicModelExplorer">STANDARDS EXPLORER</v-btn>
				</div>
				<p class="text-body-2 text-medium-emphasis mb-4">
					{{ standardList.length }} standard{{ standardList.length === 1 ? '' : 's' }} hold elements a judge mapped to the {{ citedElementList.length }} element{{ citedElementList.length === 1 ? '' : 's' }} this case cites. Every row is a judged mapping of a CITED element (its relation counted), not of the case.
				</p>
				<div v-if="standardList.length" class="d-flex flex-wrap ga-2 mb-6" data-testid="guide-standard-chips">
					<v-chip
						v-for="oneStandard in standardList"
						:key="oneStandard.standard"
						:variant="isStandardSelected(oneStandard.standard) ? 'flat' : 'outlined'"
						:color="isStandardSelected(oneStandard.standard) ? 'primary' : undefined"
						@click="toggleStandard(oneStandard.standard)"
					>
						<template v-if="!isStandardSelected(oneStandard.standard)">+&nbsp;</template>{{ oneStandard.standard }} &middot; {{ oneStandard.citedElementList.length }}/{{ citedElementList.length }}
					</v-chip>
				</div>
				<v-table density="compact" class="mb-6" data-testid="guide-table">
					<thead><tr><th>Standard</th><th>Cited elements it holds (judged relation, elements)</th></tr></thead>
					<tbody>
						<tr v-for="oneStandard in standardList" :key="oneStandard.standard">
							<td class="font-weight-bold text-body-2">{{ oneStandard.standard }}</td>
							<td class="text-body-2">
								<div v-for="oneHolding in oneStandard.citedElementList" :key="oneHolding.citedStableId">
									<NuxtLink :to="explorerLinkOf(oneHolding.citedStableId)">{{ oneHolding.citedName }}</NuxtLink>
									<span class="text-medium-emphasis">: {{ relationTextOf(oneHolding.relationCountList) }}</span>
								</div>
							</td>
						</tr>
					</tbody>
				</v-table>
				<v-alert v-if="!standardList.length" type="info" variant="tonal" class="mb-4">No cited element of this case resolves to a hub card that another standard is mapped to, so no standard can be listed yet.</v-alert>

				<div v-if="selectedStandardList.length" class="text-center my-6">
					<v-btn color="primary" size="large" prepend-icon="mdi-rocket-launch" data-testid="guide-generate" @click="createImplementationPlan">Generate Implementation Roadmap</v-btn>
					<div class="text-caption text-medium-emphasis mt-2">{{ selectedStandardList.length }} standard{{ selectedStandardList.length > 1 ? 's' : '' }} selected &middot; asks the Data Model Explorer</div>
				</div>

				<div v-if="planResponseText || planLoading || planStatusMsg" class="mt-8">
					<div class="d-flex align-center justify-space-between mb-3">
						<h3 class="text-h6 font-weight-bold">Implementation Plan</h3>
						<v-btn variant="text" size="small" prepend-icon="mdi-open-in-new" :to="{ path: '/dm/explorer' }">Open in Explorer</v-btn>
					</div>
					<v-progress-linear v-if="planLoading" indeterminate color="secondary" height="3" />
					<v-card v-if="planResponseText" variant="outlined" class="plan-response-card">
						<div ref="planResponsePanel" class="plan-response-body prose" v-html="renderedPlanHtml"></div>
					</v-card>
					<v-alert v-if="planStatusMsg" type="error" variant="tonal" class="mt-3">{{ planStatusMsg }}</v-alert>
				</div>
			</div>
		</template>
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
.plan-response-body :deep(table) { border-collapse: collapse; margin: 0.5em 0; width: 100%; }
.plan-response-body :deep(th), .plan-response-body :deep(td) { border: 1px solid var(--edu-gray-100, #EEF1F7); padding: 0.4em 0.6em; text-align: left; }
.plan-response-body :deep(th) { background: var(--edu-gray-50, #F8F9FC); font-weight: 700; }
.plan-response-body :deep(code) { font-size: 0.85em; background: rgba(7,42,108,0.06); padding: 0.15em 0.3em; border-radius: 3px; }
</style>
