<script setup>
// search/standard.vue — Single specification detail page (standalone copy)
// Reached from search results via /search/standard?id=<specId>
// Optional: &tab=burden&dim=engineering to auto-expand burden section

import { useSpecificationMetadataStore } from '@/stores/specificationMetadataStore';

const specStore = useSpecificationMetadataStore();
const route = useRoute();
const router = useRouter();

const specId = computed(() => route.query.id);
const spec = computed(() => specStore.specById(specId.value));
const highlightDim = computed(() => route.query.dim || null);
const showBurden = computed(() => route.query.tab === 'burden');

const burdenColor = (burden) => {
	if (burden === 'low') return 'success';
	if (burden === 'medium' || burden === 'moderate') return 'warning';
	return 'error';
};

const INDICATOR_LABELS = {
	dataFormat: 'Data Format',
	apiSurface: 'API Surface Area',
	dependencyChain: 'Dependency Chain',
	consumerProducerAsymmetry: 'Consumer vs. Producer Asymmetry',
	sdkTooling: 'SDK & Tooling Availability',
	specMaturity: 'Spec Maturity & Stability',
	hosting: 'Hosting / Servers',
	database: 'Database',
	middleware: 'Middleware',
	cryptographic: 'Cryptographic Infrastructure',
	managedServices: 'Managed Service Availability',
	operationalCost: 'Operational Cost & Maintenance',
	specAccess: 'Spec Access & Licensing',
	membership: 'Membership Requirements',
	dataSharingAgreements: 'Data Sharing Agreements',
	regulatoryCompliance: 'Regulatory Compliance',
	ipPatent: 'IP & Patent Considerations',
};

const DIMENSION_LABELS = {
	engineering: 'Engineering Complexity',
	infrastructure: 'Infrastructure Requirements',
	legal: 'Legal & Licensing',
};

const scoreLabel = (v) => v === 1 ? 'Low' : v === 2 ? 'Moderate' : 'High';

// Auto-expand the burden panel if linked from burden search result
const expandedPanels = ref(showBurden.value ? [0, 1] : []);
</script>

<template>
	<v-container class="py-8" style="max-width: 1100px;">
		<!-- Back button -->
		<v-btn variant="text" size="small" prepend-icon="mdi-arrow-left" class="mb-4" @click="router.back()">
			Back to Search
		</v-btn>

		<!-- Not found -->
		<v-card v-if="!spec" variant="outlined" class="pa-8 text-center">
			<v-icon size="48" color="grey">mdi-alert-circle-outline</v-icon>
			<div class="text-h6 mt-3">Specification not found</div>
			<v-btn to="/search" variant="text" class="mt-4">Back to Search</v-btn>
		</v-card>

		<!-- Spec detail card -->
		<v-card v-if="spec" variant="outlined">
			<v-card-title class="d-flex align-center flex-wrap ga-2 pb-1">
				<span class="text-subtitle-1 font-weight-bold" style="flex: 1; min-width: 200px;">{{ spec.title }}</span>
				<v-chip size="x-small" :color="burdenColor(spec.implementationBurden)" variant="tonal">
					{{ spec.implementationBurden }} burden
				</v-chip>
				<v-chip size="x-small" :color="spec.accessLevel === 'open' ? 'success' : 'warning'" variant="tonal">
					{{ spec.accessLevel }}
				</v-chip>
			</v-card-title>

			<v-card-subtitle class="pb-2">
				{{ spec.owner }} &mdash; v{{ spec.version }}
			</v-card-subtitle>

			<v-card-text class="pt-0">
				<p class="text-body-2 mb-3">{{ spec.description }}</p>

				<!-- Tags -->
				<div class="mb-3">
					<v-chip v-for="tag in spec.tags?.slice(0, 8)" :key="tag" size="x-small" variant="tonal" class="mr-1 mb-1">
						{{ tag }}
					</v-chip>
				</div>

				<v-expansion-panels v-model="expandedPanels" variant="accordion" flat multiple>
					<!-- Implementation Details -->
					<v-expansion-panel>
						<v-expansion-panel-title class="text-caption font-weight-bold px-0">
							Implementation Details
						</v-expansion-panel-title>
						<v-expansion-panel-text>
							<!-- Required Capabilities -->
							<div v-if="spec.requiredCapabilities?.length" class="mb-4">
								<h4 class="text-caption font-weight-bold mb-1">Required Capabilities</h4>
								<ul class="text-body-2 pl-4">
									<li v-for="cap in spec.requiredCapabilities" :key="cap">{{ cap }}</li>
								</ul>
							</div>

							<!-- Implementation Guidance -->
							<div v-if="spec.implementationGuidance" class="mb-4">
								<h4 class="text-caption font-weight-bold mb-1">Guidance</h4>
								<p class="text-body-2">{{ spec.implementationGuidance }}</p>
							</div>

							<!-- Commonly Paired With -->
							<div v-if="spec.commonlyPairedWith?.length" class="mb-4">
								<h4 class="text-caption font-weight-bold mb-1">Commonly Paired With</h4>
								<div>
									<v-chip v-for="pairedId in spec.commonlyPairedWith" :key="pairedId"
										size="x-small" variant="outlined" class="mr-1 mb-1">
										{{ specStore.specById(pairedId)?.title || pairedId }}
									</v-chip>
								</div>
							</div>

							<!-- Known Adopters -->
							<div v-if="spec.knownAdopters?.length" class="mb-4">
								<h4 class="text-caption font-weight-bold mb-1">Known Adopters</h4>
								<div>
									<v-chip v-for="adopter in spec.knownAdopters" :key="adopter"
										size="x-small" variant="outlined" class="mr-1 mb-1">{{ adopter }}</v-chip>
								</div>
							</div>

							<!-- Privacy -->
							<div v-if="spec.privacyConsiderations" class="mb-4">
								<h4 class="text-caption font-weight-bold mb-1">Privacy Considerations</h4>
								<p class="text-body-2">
									<v-chip size="x-small" variant="tonal" class="mr-1"
										:color="spec.privacyConsiderations.level === 'low-concern' ? 'success' : spec.privacyConsiderations.level === 'medium-concern' ? 'warning' : 'error'">
										{{ spec.privacyConsiderations.level }}
									</v-chip>
									{{ spec.privacyConsiderations.notes }}
								</p>
							</div>

							<!-- Equity -->
							<div v-if="spec.equityConsiderations" class="mb-4">
								<h4 class="text-caption font-weight-bold mb-1">Equity Considerations</h4>
								<p class="text-body-2">
									<v-chip size="x-small" variant="tonal" class="mr-1"
										:color="spec.equityConsiderations.level === 'low-concern' ? 'success' : 'warning'">
										{{ spec.equityConsiderations.level }}
									</v-chip>
									{{ spec.equityConsiderations.notes }}
								</p>
							</div>

							<!-- Technical Doc Links -->
							<div v-if="spec.technicalDocLinks?.length">
								<h4 class="text-caption font-weight-bold mb-1">Documentation</h4>
								<div>
									<v-btn v-for="link in spec.technicalDocLinks" :key="link.url"
										:href="link.url" target="_blank" size="small" variant="text" class="mr-2"
										prepend-icon="mdi-open-in-new">{{ link.label }}</v-btn>
								</div>
							</div>
						</v-expansion-panel-text>
					</v-expansion-panel>

					<!-- Burden Rubric (granular per-indicator view) -->
					<v-expansion-panel v-if="spec.burdenRubric">
						<v-expansion-panel-title class="text-caption font-weight-bold px-0">
							Burden Rubric (Per-Indicator Detail)
						</v-expansion-panel-title>
						<v-expansion-panel-text>
							<div v-for="(rubric, dim) in spec.burdenRubric" :key="dim" class="mb-5"
								:class="{ 'dim-highlight': highlightDim === dim }">
								<h4 class="text-caption font-weight-bold mb-1">{{ DIMENSION_LABELS[dim] || dim }}</h4>
								<div class="text-caption text-medium-emphasis mb-2">
									<v-chip size="x-small" :color="burdenColor(rubric.level === 'moderate' ? 'medium' : rubric.level)" variant="tonal" class="mr-1">
										{{ rubric.level }}
									</v-chip>
									{{ rubric.note }}
								</div>
								<v-table v-if="rubric.scores" density="compact">
									<thead>
										<tr>
											<th>Indicator</th>
											<th style="width: 100px;">Score</th>
										</tr>
									</thead>
									<tbody>
										<tr v-for="(scoreVal, key) in rubric.scores" :key="key">
											<td class="text-body-2">{{ INDICATOR_LABELS[key] || key }}</td>
											<td>
												<v-chip size="x-small" :color="burdenColor(scoreVal === 2 ? 'medium' : scoreVal === 1 ? 'low' : 'high')" variant="tonal">
													{{ scoreLabel(scoreVal) }} ({{ scoreVal }})
												</v-chip>
											</td>
										</tr>
									</tbody>
								</v-table>
							</div>
						</v-expansion-panel-text>
					</v-expansion-panel>
				</v-expansion-panels>
			</v-card-text>
		</v-card>
	</v-container>
</template>

<style scoped>
.dim-highlight {
	border-left: 3px solid #00B5B8;
	padding-left: 12px;
	background: rgba(0, 181, 184, 0.04);
	border-radius: 4px;
}
</style>
