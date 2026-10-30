<script setup>
// @concept: [[DataModelExplorer]]
// Explore → Topics: the forged use cases grouped by the STANDARD THEY CITE (Phase C2, TQ 2026-10-30: the old catalogue goes
// away). The groups are derived from the graph's own citations (POST /api/forged-use-cases { action: 'byCitedStandard' }),
// never from a hand-kept taxonomy, so a new release of the use-case standard regroups itself.

import { useForgedUseCaseStore } from '@/stores/forgedUseCaseStore';

const forgedUseCaseStore = useForgedUseCaseStore();
onMounted(() => {
	forgedUseCaseStore.fetchCitedStandardList();
});
const forgedCaseLinkOf = (caseStableId) => `/explore/use-cases/forged/${encodeURIComponent(caseStableId)}`;
</script>

<template>
	<v-container class="py-8" style="max-width: 1000px;">
		<h1 class="text-h4 font-weight-bold text-primary mb-2">Topics: use cases by the standard they cite</h1>
		<p class="text-body-1 text-medium-emphasis mb-8">
			Each forged use case cites the standards whose data it needs. Read from the graph's citations.
		</p>

		<v-progress-linear v-if="forgedUseCaseStore.citedStandardListLoading" indeterminate color="primary" class="mb-4" />
		<v-alert v-if="forgedUseCaseStore.citedStandardListStatusMsg" type="warning" variant="tonal" class="mb-4">{{ forgedUseCaseStore.citedStandardListStatusMsg }}</v-alert>

		<v-row data-testid="cited-standard-list">
			<v-col v-for="oneStandard in forgedUseCaseStore.citedStandardList" :key="oneStandard.citedStandard" cols="12" sm="6">
				<v-card class="pa-5 h-100" variant="outlined" :data-testid="`cited-standard-${oneStandard.citedStandard}`">
					<h2 class="text-h6 font-weight-bold mb-1">{{ oneStandard.citedStandard }}</h2>
					<p class="text-caption text-medium-emphasis mb-3">cited by {{ oneStandard.caseCount }} use case{{ oneStandard.caseCount === 1 ? '' : 's' }}</p>
					<v-list density="compact">
						<v-list-item v-for="oneCase in oneStandard.caseList" :key="oneCase.caseStableId" :to="forgedCaseLinkOf(oneCase.caseStableId)">
							<v-list-item-title>{{ oneCase.shortName }}</v-list-item-title>
							<v-list-item-subtitle>{{ oneCase.resolvedReferenceCount }} of {{ oneCase.referenceCount }} citations resolve to an element in the graph</v-list-item-subtitle>
						</v-list-item>
					</v-list>
				</v-card>
			</v-col>
		</v-row>
	</v-container>
</template>
