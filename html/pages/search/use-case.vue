<script setup>
// search/use-case.vue — Use case detail page reached from search results
// Route: /search/use-case?id=<useCaseId>

import { githubUseCaseData } from '@/data/github-use-cases';
import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

const route = useRoute();
const router = useRouter();

const ucId = computed(() => route.query.id);
const uc = computed(() => githubUseCaseData.useCases.find(u => u.id === ucId.value));

const statusColor = (status) => {
	if (status === 'vetted') return 'success';
	if (status === 'partially-vetted') return 'warning';
	return 'grey';
};

const renderedReferences = computed(() => {
	if (!uc.value?.references) return '';
	return marked.parse(uc.value.references);
});
</script>

<template>
	<v-container class="py-8" style="max-width: 1100px;">
		<!-- Back button -->
		<v-btn variant="text" size="small" prepend-icon="mdi-arrow-left" class="mb-4" @click="router.back()">
			Back to Search
		</v-btn>

		<!-- Not found -->
		<v-card v-if="!uc" variant="outlined" class="pa-8 text-center">
			<v-icon size="48" color="grey">mdi-alert-circle-outline</v-icon>
			<div class="text-h6 mt-3">Use case not found</div>
			<v-btn to="/search" variant="text" class="mt-4">Back to Search</v-btn>
		</v-card>

		<template v-if="uc">
			<!-- Header -->
			<div class="d-flex align-center flex-wrap ga-2 mb-1">
				<span class="text-caption text-medium-emphasis">USE CASE #{{ uc.githubIssue || '—' }}</span>
				<v-chip size="x-small" :color="statusColor(uc.status)" variant="tonal">{{ uc.status }}</v-chip>
			</div>
			<h1 class="text-h4 font-weight-bold mb-2">{{ uc.title }}</h1>
			<div class="text-body-2 text-medium-emphasis mb-4">
				{{ uc.subcategoryLabel }}
			</div>

			<!-- Labels & domains -->
			<div class="d-flex flex-wrap ga-1 mb-6">
				<v-chip v-for="label in uc.labels" :key="label" size="small" variant="tonal">{{ label }}</v-chip>
				<v-chip v-for="domain in uc.cedsDomains" :key="domain" size="small" variant="outlined" color="orange">{{ domain }}</v-chip>
			</div>

			<!-- Link to full detail page -->
			<v-btn
				variant="tonal" color="primary" size="small" class="mb-6"
				prepend-icon="mdi-open-in-new"
				:to="`/explore/use-cases/${uc.id}`"
			>
				View full detail page (tabs, swimlane, standards map)
			</v-btn>

			<!-- Description -->
			<v-card v-if="uc.description" variant="outlined" class="mb-4">
				<v-card-title class="text-subtitle-2">Description</v-card-title>
				<v-card-text class="text-body-2">{{ uc.description }}</v-card-text>
			</v-card>

			<!-- Objectives -->
			<v-card v-if="uc.objectives" variant="outlined" class="mb-4">
				<v-card-title class="text-subtitle-2">Objectives</v-card-title>
				<v-card-text class="text-body-2">{{ uc.objectives }}</v-card-text>
			</v-card>

			<!-- Scenario -->
			<v-card v-if="uc.scenario" variant="outlined" class="mb-4">
				<v-card-title class="text-subtitle-2">Scenario</v-card-title>
				<v-card-text class="text-body-2">{{ uc.scenario }}</v-card-text>
			</v-card>

			<!-- Actors -->
			<v-card v-if="uc.actors?.length" variant="outlined" class="mb-4">
				<v-card-title class="text-subtitle-2">Actors</v-card-title>
				<v-card-text>
					<v-table density="compact">
						<thead><tr><th>Actor</th><th>Role</th></tr></thead>
						<tbody>
							<tr v-for="actor in uc.actors" :key="actor.name">
								<td class="text-body-2 font-weight-medium">{{ actor.name }}</td>
								<td class="text-body-2">{{ actor.role }}</td>
							</tr>
						</tbody>
					</v-table>
				</v-card-text>
			</v-card>

			<!-- Steps -->
			<v-card v-if="uc.steps?.length" variant="outlined" class="mb-4">
				<v-card-title class="text-subtitle-2">Steps</v-card-title>
				<v-card-text>
					<v-table density="compact">
						<thead><tr><th style="width: 40px;">#</th><th>Actor</th><th>Action</th></tr></thead>
						<tbody>
							<tr v-for="step in uc.steps" :key="step.stepNumber">
								<td class="text-body-2 font-weight-bold">{{ step.stepNumber }}</td>
								<td class="text-body-2">{{ step.actor }}</td>
								<td class="text-body-2">{{ step.action }}</td>
							</tr>
						</tbody>
					</v-table>
				</v-card-text>
			</v-card>

			<!-- Swimlane -->
			<v-card v-if="uc.swimlane" variant="outlined" class="mb-4">
				<v-card-title class="text-subtitle-2">Swimlane</v-card-title>
				<v-card-text style="overflow-x: auto;">
					<v-table density="compact">
						<thead>
							<tr>
								<th v-for="h in uc.swimlane.headers" :key="h">{{ h }}</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="(row, rIdx) in uc.swimlane.rows" :key="rIdx">
								<td v-for="(cell, cIdx) in row" :key="cIdx" class="text-body-2">{{ cell }}</td>
							</tr>
						</tbody>
					</v-table>
				</v-card-text>
			</v-card>

			<!-- CEDS Data Elements -->
			<v-card v-if="uc.data?.length" variant="outlined" class="mb-4">
				<v-card-title class="text-subtitle-2">CEDS Data Elements</v-card-title>
				<v-card-text>
					<v-table density="compact">
						<thead><tr><th>Element</th><th>Definition</th></tr></thead>
						<tbody>
							<tr v-for="d in uc.data" :key="d.name">
								<td class="text-body-2 font-weight-medium" style="min-width: 200px;">
									<a v-if="d.url" :href="d.url" target="_blank" style="text-decoration: none;">{{ d.name }}</a>
									<span v-else>{{ d.name }}</span>
								</td>
								<td class="text-body-2">{{ d.def }}</td>
							</tr>
						</tbody>
					</v-table>
				</v-card-text>
			</v-card>

			<!-- Connected Standards -->
			<v-card v-if="uc.connectedStandards?.length" variant="outlined" class="mb-4">
				<v-card-title class="text-subtitle-2">Connected Standards</v-card-title>
				<v-card-text>
					<div class="d-flex flex-wrap ga-2">
						<v-chip v-for="cs in uc.connectedStandards" :key="cs.standard"
							size="small" variant="tonal" :color="cs.implicit ? 'grey' : 'primary'">
							{{ cs.standard }} ({{ cs.count }})
						</v-chip>
					</div>
				</v-card-text>
			</v-card>

			<!-- Key Concepts -->
			<v-card v-if="uc.keyConcepts" variant="outlined" class="mb-4">
				<v-card-title class="text-subtitle-2">Key Concepts</v-card-title>
				<v-card-text class="text-body-2">{{ uc.keyConcepts }}</v-card-text>
			</v-card>

			<!-- Dependencies -->
			<v-card v-if="uc.dependencies" variant="outlined" class="mb-4">
				<v-card-title class="text-subtitle-2">Dependencies</v-card-title>
				<v-card-text class="text-body-2">{{ uc.dependencies }}</v-card-text>
			</v-card>

			<!-- Outcomes -->
			<v-card v-if="uc.outcomes" variant="outlined" class="mb-4">
				<v-card-title class="text-subtitle-2">Outcomes</v-card-title>
				<v-card-text class="text-body-2">{{ uc.outcomes }}</v-card-text>
			</v-card>

			<!-- References -->
			<v-card v-if="uc.references" variant="outlined" class="mb-4">
				<v-card-title class="text-subtitle-2">References</v-card-title>
				<v-card-text class="text-body-2 references-content" v-html="renderedReferences" />
			</v-card>
		</template>
	</v-container>
</template>

<style scoped>
.references-content :deep(a) {
	color: var(--edu-teal, #00B5B8);
}
</style>
