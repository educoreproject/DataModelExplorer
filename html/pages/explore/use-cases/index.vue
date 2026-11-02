<script setup>
// @concept: [[DataModelExplorer]]
// Explore → Use Cases (use-case forge Phase 5, 2026-10-30). The EDUcore use-case standard as the GRAPH holds it: every forged
// case, each opening on its own page with its steps in order and its citations. TQ ruled the same day that the old static
// catalogue (the GitHub-issue matrix and its editor) goes away and is replaced by these, so this page reads the graph only.

import { useForgedUseCaseStore } from '@/stores/forgedUseCaseStore';

const forgedUseCaseStore = useForgedUseCaseStore();
onMounted(() => {
	forgedUseCaseStore.fetchCaseList();
});
const forgedCaseLinkOf = (caseStableId) => `/explore/use-cases/forged/${encodeURIComponent(caseStableId)}`;
</script>

<template>
	<v-container class="py-8" style="max-width: 1000px;">
		<h1 class="text-h4 font-weight-bold text-primary mb-2">Use Cases</h1>
		<p class="text-body-1 text-medium-emphasis mb-6">
			The EDUcore use-case standard: vetted cases in the Enhanced Cockburn format, forged into the standards graph. Each opens with its steps in order and its citations of other standards' elements.
			<NuxtLink to="/explore/topics">Use cases by the standard they cite ›</NuxtLink>
		</p>

		<v-card variant="outlined" data-testid="forged-use-cases">
			<v-card-text>
				<v-progress-linear v-if="forgedUseCaseStore.caseListLoading" indeterminate color="primary" class="mb-2" />
				<v-alert v-if="forgedUseCaseStore.caseListStatusMsg" type="warning" variant="tonal" density="compact">{{ forgedUseCaseStore.caseListStatusMsg }}</v-alert>
				<v-list v-if="forgedUseCaseStore.caseList.length" density="compact">
					<v-list-item
						v-for="oneCase in forgedUseCaseStore.caseList"
						:key="oneCase.caseStableId"
						:to="forgedCaseLinkOf(oneCase.caseStableId)"
						:data-testid="`forged-case-${oneCase.caseStableId}`"
					>
						<v-list-item-title class="font-weight-bold">{{ oneCase.shortName }}</v-list-item-title>
						<v-list-item-subtitle>{{ oneCase.longName }}</v-list-item-subtitle>
						<template #append>
							<span class="text-caption text-medium-emphasis">{{ oneCase.stepCount }} steps &middot; {{ oneCase.resolvedReferenceCount }} of {{ oneCase.referenceCount }} references cite an element</span>
						</template>
					</v-list-item>
				</v-list>
			</v-card-text>
		</v-card>
	</v-container>
</template>
