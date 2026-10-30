<script setup>
// @concept: [[DataModelExplorer]]
// Explore → Use Cases → one FORGED use case (use-case forge Phase 5, 2026-10-30).
//
// One case of the EDUcore use-case standard, read from the graph: its steps in reading order (position, then codedNotation,
// so 7a follows 7) with each step's actor and the data it names, and every data reference the case reaches with its state.
// A citation that resolves links to the cited element in the Standards Explorer, where its mappings to every other
// standard are one click away.

import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useForgedUseCaseStore } from '@/stores/forgedUseCaseStore';
import { pathTextOf, FAMILY_CATALOG_STABLE_ID } from '@/components/standardsExplorer/explorerVocabulary';

const route = useRoute();
const store = useForgedUseCaseStore();

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

// step kind and citation state → chip colour; anything the table does not name is drawn plain
const STEP_KIND_COLOUR_BY_KIND = Object.freeze({ main: 'primary', exception: 'error', extension: 'warning' });
const CITATION_STATE_COLOUR_BY_STATE = Object.freeze({ resolved: 'success', gap: 'error', documentAnchored: 'info', wholeStandard: 'info', unresolved: 'warning', corpus: 'grey' });

const explorerLinkOf = (citedStableId) => ({ path: '/explore/graphicModelExplorer', query: { path: pathTextOf([FAMILY_CATALOG_STABLE_ID, citedStableId]) } });
const citedIdentifierTextOf = (oneCitation) => [oneCitation.citedStandard, oneCitation.citedIdentifier].filter(Boolean).join(' ');
</script>

<template>
	<v-container class="py-8" style="max-width: 1100px;" data-testid="forged-use-case-page">
		<v-btn variant="text" size="small" prepend-icon="mdi-arrow-left" to="/explore/use-cases" class="mb-2 px-0">Use Cases</v-btn>

		<v-progress-linear v-if="store.caseLoading" indeterminate color="primary" class="mb-4" />
		<v-alert v-if="store.caseStatusMsg" type="error" variant="tonal" class="mb-4" data-testid="forged-use-case-error">{{ store.caseStatusMsg }}</v-alert>

		<template v-if="useCase">
			<div class="text-overline text-medium-emphasis">{{ useCase.standardName || useCase.standardSource }} &middot; release {{ useCase.releaseVersion }} &middot; format {{ useCase.formatVersion }}</div>
			<h1 class="text-h4 font-weight-bold text-primary mb-1" data-testid="forged-use-case-title">{{ useCase.shortName }}</h1>
			<p class="text-h6 font-weight-regular mb-2">{{ useCase.longName }}</p>
			<div class="d-flex flex-wrap ga-2 mb-4">
				<v-chip size="small" variant="outlined"><code>{{ useCase.caseStableId }}</code></v-chip>
				<v-chip v-if="useCase.primaryActorName" size="small" variant="tonal" prepend-icon="mdi-account">{{ useCase.primaryActorName }}</v-chip>
				<v-chip v-if="useCase.level" size="small" variant="tonal">level: {{ useCase.level }}</v-chip>
				<v-chip v-if="useCase.frequency" size="small" variant="tonal">{{ useCase.frequency }}</v-chip>
			</div>
			<p v-if="useCase.scope" class="text-body-2 text-medium-emphasis mb-6">Scope: {{ useCase.scope }}</p>

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
				<v-chip v-for="oneState in shownStateCountList" :key="oneState.citationState" size="small" variant="tonal" :color="CITATION_STATE_COLOUR_BY_STATE[oneState.citationState]">
					{{ oneState.citationCount }} {{ oneState.stateLabel }}
				</v-chip>
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
							<NuxtLink v-if="oneCitation.citedStableId" :to="explorerLinkOf(oneCitation.citedStableId)" :data-testid="`citation-link-${oneCitation.citedIdentifier}`">
								{{ oneCitation.citedSource }} {{ oneCitation.citedName }}
							</NuxtLink>
						</td>
					</tr>
				</tbody>
			</v-table>
			<p class="text-caption text-medium-emphasis mt-2">A citation is the use case author's own reference to another standard's element (a declared correspondence, <code>edc:cites</code>), not a mapping. Open a cited element to see how every other standard maps to it.</p>
		</template>
	</v-container>
</template>
