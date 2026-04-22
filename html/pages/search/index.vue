<script setup>
import { useSearchStore } from '@/stores/searchStore';
import { useLoginStore } from '@/stores/loginStore';

const searchStore = useSearchStore();
const loginStore = useLoginStore();
const router = useRouter();

onMounted(() => { searchStore.buildIndex(); });

// Ontology detail expansion
const expandedOntoIdx = ref(null);
const ontoDetail = ref(null);
const ontoDetailLoading = ref(false);

const toggleOntoDetail = async (item, idx) => {
	if (expandedOntoIdx.value === idx) {
		expandedOntoIdx.value = null;
		ontoDetail.value = null;
		return;
	}
	expandedOntoIdx.value = idx;
	ontoDetail.value = null;
	ontoDetailLoading.value = true;
	const detail = await searchStore.fetchNodeDetail(item.path);
	ontoDetail.value = detail;
	ontoDetailLoading.value = false;
};

const localQuery = ref(searchStore.query || '');
let debounceTimer = null;
watch(localQuery, (val) => {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => searchStore.search(val), 300);
});

const goToStandard = (specId) => router.push({ path: '/search/standard', query: { id: specId } });
const goToUseCase = (ucId) => router.push({ path: '/search/use-case', query: { id: ucId } });
const goToBurden = (specId, dim) => router.push({ path: '/search/standard', query: { id: specId, tab: 'burden', dim } });

const burdenScoreColor = (score) => {
	if (score === 1) return 'success';
	if (score === 2) return 'warning';
	return 'error';
};

const burdenScoreLabel = (score) => {
	if (score === 1) return 'Low';
	if (score === 2) return 'Moderate';
	return 'High';
};

const statusColor = (status) => {
	if (status === 'vetted') return 'success';
	if (status === 'partially-vetted') return 'warning';
	return 'grey';
};
</script>

<template>
	<v-container class="py-8" style="max-width: 1100px;">
		<h1 class="text-h4 font-weight-bold text-primary mb-2">Search</h1>
		<p class="text-body-1 text-medium-emphasis mb-6">
			Search across standards, use cases, implementation burden indicators, and the ontology knowledge graph.
		</p>

		<!-- Search input -->
		<v-text-field
			v-model="localQuery"
			placeholder="Search..."
			variant="outlined"
			density="comfortable"
			hide-details
			prepend-inner-icon="mdi-magnify"
			clearable
			autofocus
			class="mb-4"
		/>

		<!-- Result count chips -->
		<div v-if="searchStore.query" class="d-flex flex-wrap ga-2 mb-6">
			<v-chip v-if="searchStore.resultCounts.useCases" size="small" variant="tonal" color="orange-darken-2">
				{{ searchStore.resultCounts.useCases }} Use Case{{ searchStore.resultCounts.useCases === 1 ? '' : 's' }}
			</v-chip>
			<v-chip v-if="searchStore.resultCounts.standards" size="small" variant="tonal" color="blue-darken-3">
				{{ searchStore.resultCounts.standards }} Standard{{ searchStore.resultCounts.standards === 1 ? '' : 's' }}
			</v-chip>
			<v-chip v-if="searchStore.resultCounts.burden" size="small" variant="tonal" color="teal">
				{{ searchStore.resultCounts.burden }} Burden Indicator{{ searchStore.resultCounts.burden === 1 ? '' : 's' }}
			</v-chip>
			<v-chip v-if="searchStore.ontologyLoading" size="small" variant="tonal" color="purple">
				<v-progress-circular indeterminate size="12" width="2" class="mr-2" />
				Ontology searching...
			</v-chip>
			<v-chip v-else-if="searchStore.resultCounts.ontology" size="small" variant="tonal" color="purple">
				{{ searchStore.resultCounts.ontology }} Ontology Node{{ searchStore.resultCounts.ontology === 1 ? '' : 's' }}
			</v-chip>
		</div>

		<!-- ═══ Use Cases ═══ -->
		<div v-if="searchStore.useCaseResults.length" class="mb-8">
			<h2 class="text-h6 font-weight-bold mb-3">
				<v-icon size="small" class="mr-1">mdi-lightbulb-on-outline</v-icon>
				Use Cases
			</h2>
			<v-card
				v-for="item in searchStore.useCaseResults" :key="item.id"
				variant="outlined" class="mb-2 search-card" @click="goToUseCase(item.useCaseId)"
			>
				<v-card-text class="py-3">
					<div class="d-flex align-center flex-wrap ga-2">
						<span class="text-body-2 font-weight-bold">{{ item.title }}</span>
						<v-chip size="x-small" variant="tonal" color="orange-darken-2">Use Case</v-chip>
						<v-chip v-for="tag in item.tags.slice(0, 3)" :key="tag" size="x-small" variant="outlined">{{ tag }}</v-chip>
					</div>
					<div class="text-caption text-medium-emphasis mt-1">{{ item.subtitle }}</div>
					<div class="text-caption text-medium-emphasis mt-1">
						{{ item.description.slice(0, 180) }}{{ item.description.length > 180 ? '...' : '' }}
					</div>
				</v-card-text>
			</v-card>
		</div>

		<!-- ═══ Standards ═══ -->
		<div v-if="searchStore.standardResults.length" class="mb-8">
			<h2 class="text-h6 font-weight-bold mb-3">
				<v-icon size="small" class="mr-1">mdi-certificate-outline</v-icon>
				Standards
			</h2>
			<v-card
				v-for="item in searchStore.standardResults" :key="item.id"
				variant="outlined" class="mb-2 search-card" @click="goToStandard(item.specId)"
			>
				<v-card-text class="py-3">
					<div class="d-flex align-center flex-wrap ga-2">
						<span class="text-body-2 font-weight-bold">{{ item.title }}</span>
						<v-chip size="x-small" variant="tonal" color="blue-darken-3">Standard</v-chip>
					</div>
					<div class="text-caption text-medium-emphasis mt-1">{{ item.subtitle }}</div>
					<div class="text-caption text-medium-emphasis mt-1">
						{{ item.description.slice(0, 180) }}{{ item.description.length > 180 ? '...' : '' }}
					</div>
				</v-card-text>
			</v-card>
		</div>

		<!-- ═══ Burden Indicators ═══ -->
		<div v-if="searchStore.burdenResults.length" class="mb-8">
			<h2 class="text-h6 font-weight-bold mb-3">
				<v-icon size="small" class="mr-1">mdi-speedometer-medium</v-icon>
				Implementation Burden Indicators
			</h2>
			<v-card
				v-for="item in searchStore.burdenResults" :key="item.id"
				variant="outlined" class="mb-2 search-card" @click="goToBurden(item.specId, item.burdenDimension)"
			>
				<v-card-text class="py-3">
					<div class="d-flex align-center flex-wrap ga-2">
						<span class="text-body-2 font-weight-bold">{{ item.title }}</span>
						<v-chip size="x-small" variant="tonal" :color="burdenScoreColor(item.burdenScore)">
							{{ burdenScoreLabel(item.burdenScore) }} ({{ item.burdenScore }}/3)
						</v-chip>
					</div>
					<div class="text-caption text-medium-emphasis mt-1">{{ item.subtitle }}</div>
					<div v-if="item.description" class="text-caption text-medium-emphasis mt-1">
						{{ item.description.slice(0, 180) }}{{ item.description.length > 180 ? '...' : '' }}
					</div>
				</v-card-text>
			</v-card>
		</div>

		<!-- ═══ Ontology ═══ -->
		<div v-if="loginStore.validUser && searchStore.query" class="mb-8">
			<h2 class="text-h6 font-weight-bold mb-3">
				<v-icon size="small" class="mr-1">mdi-database</v-icon>
				Ontology (Knowledge Graph)
			</h2>

			<v-card v-if="searchStore.ontologyLoading" variant="flat" class="mb-3 pa-5"
				style="background: linear-gradient(135deg, #f3e8ff 0%, #e8f0fe 100%); border-left: 3px solid #7b1fa2;">
				<div class="d-flex align-center">
					<v-progress-circular indeterminate color="#7b1fa2" size="28" width="3" class="mr-4" />
					<div>
						<div class="text-body-2" style="color: #4a3660;">Searching CEDS and SIF data models...</div>
						<div class="text-caption" style="color: #8a7a9a;">AI-powered search — this can take a minute or two.</div>
					</div>
				</div>
			</v-card>

			<v-alert v-if="searchStore.ontologyError" type="warning" variant="tonal" density="compact" class="mb-3">
				{{ searchStore.ontologyError }}
			</v-alert>

			<v-card
				v-for="(item, idx) in searchStore.ontologyResults" :key="item.id"
				variant="outlined" class="mb-2 search-card"
				@click="toggleOntoDetail(item, idx)"
			>
				<v-card-text class="py-3">
					<div class="d-flex align-center">
						<div class="flex-grow-1" style="min-width: 0;">
							<div class="d-flex align-center flex-wrap ga-2">
								<span class="text-body-2 font-weight-bold">{{ item.title }}</span>
								<v-chip v-if="item.standard" size="x-small" variant="tonal"
									:color="item.standard === 'ceds' ? 'orange' : 'teal'">
									{{ item.standard.toUpperCase() }}
								</v-chip>
								<v-chip v-if="item.nodeType" size="x-small" variant="outlined">{{ item.nodeType }}</v-chip>
							</div>
							<div v-if="item.description" class="text-caption text-medium-emphasis mt-1">
								{{ item.description.slice(0, 200) }}{{ item.description.length > 200 ? '...' : '' }}
							</div>
						</div>
						<v-icon size="small" color="grey" class="ml-2">
							{{ expandedOntoIdx === idx ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
						</v-icon>
					</div>

					<!-- Expanded detail -->
					<div v-if="expandedOntoIdx === idx" class="mt-3 pt-3" style="border-top: 1px solid #eee;">
						<v-progress-linear v-if="ontoDetailLoading" indeterminate color="purple" class="mb-3" />

						<template v-if="ontoDetail && !ontoDetailLoading">
							<!-- Description -->
							<div v-if="ontoDetail.description" class="mb-3">
								<div class="detail-label">Description</div>
								<div class="text-body-2">{{ ontoDetail.description }}</div>
							</div>

							<!-- Properties table -->
							<div class="detail-grid mb-3">
								<div v-if="ontoDetail.xpath"><span class="detail-label">XPath:</span> <code>{{ ontoDetail.xpath }}</code></div>
								<div v-if="ontoDetail.cedsId"><span class="detail-label">CEDS ID:</span> <code>{{ ontoDetail.cedsId }}</code></div>
								<div v-if="ontoDetail.notation"><span class="detail-label">Notation:</span> {{ ontoDetail.notation }}</div>
								<div v-if="ontoDetail.type"><span class="detail-label">Type:</span> {{ ontoDetail.type }}</div>
								<div v-if="ontoDetail.mandatory !== undefined"><span class="detail-label">Mandatory:</span> {{ ontoDetail.mandatory ? 'Yes' : 'No' }}</div>
								<div v-if="ontoDetail.nodeType"><span class="detail-label">Node type:</span> {{ ontoDetail.nodeType }}</div>
								<div v-if="ontoDetail.standard"><span class="detail-label">Standard:</span> {{ ontoDetail.standard }}</div>
							</div>

							<!-- Cross-standard mappings -->
							<div v-if="ontoDetail.mappings?.length" class="mb-3">
								<div class="detail-label mb-1">Cross-Standard Mappings ({{ ontoDetail.mappings.length }})</div>
								<v-table density="compact">
									<thead><tr><th>Standard</th><th>Target</th></tr></thead>
									<tbody>
										<tr v-for="(m, mIdx) in ontoDetail.mappings" :key="mIdx">
											<td>
												<v-chip size="x-small" :color="m.standard === 'CEDS' ? 'orange' : 'teal'" variant="outlined">
													{{ m.standard }}
												</v-chip>
											</td>
											<td class="text-caption">{{ m.target }}</td>
										</tr>
									</tbody>
								</v-table>
							</div>

							<!-- Option values -->
							<div v-if="ontoDetail.optionValues?.length" class="mb-3">
								<div class="detail-label mb-1">Option Values ({{ ontoDetail.optionValues.length }})</div>
								<v-table density="compact">
									<thead><tr><th>ID</th><th>Label</th><th>Description</th></tr></thead>
									<tbody>
										<tr v-for="(ov, ovIdx) in ontoDetail.optionValues.slice(0, 20)" :key="ovIdx">
											<td class="text-caption"><code>{{ ov.cedsId }}</code></td>
											<td class="text-caption">{{ ov.label }}</td>
											<td class="text-caption text-medium-emphasis">{{ ov.description }}</td>
										</tr>
									</tbody>
								</v-table>
								<div v-if="ontoDetail.optionValues.length > 20" class="text-caption text-medium-emphasis mt-1">
									...and {{ ontoDetail.optionValues.length - 20 }} more
								</div>
							</div>

							<!-- Codeset -->
							<div v-if="ontoDetail.codeset" class="mb-3">
								<div class="detail-label mb-1">Codeset ({{ ontoDetail.codeset.valueCount }} values)</div>
								<v-card variant="outlined" class="pa-3">
									<code style="white-space: pre-wrap; font-size: 0.85em">{{ ontoDetail.codeset.values }}</code>
								</v-card>
							</div>
						</template>

						<div v-if="!ontoDetail && !ontoDetailLoading" class="text-caption text-medium-emphasis">
							No additional detail available for this node.
						</div>
					</div>
				</v-card-text>
			</v-card>

			<div v-if="!searchStore.ontologyLoading && !searchStore.ontologyError && !searchStore.ontologyResults.length"
				class="text-body-2 text-medium-emphasis">
				No ontology results found.
			</div>
		</div>

		<!-- ═══ Empty state ═══ -->
		<v-card
			v-if="searchStore.query && !searchStore.hasResults && !searchStore.ontologyLoading"
			variant="outlined" class="pa-6 text-center"
		>
			<v-icon size="48" color="grey-lighten-1" class="mb-3">mdi-magnify-close</v-icon>
			<div class="text-body-1 text-medium-emphasis">No results found for "{{ searchStore.query }}"</div>
			<div class="text-body-2 text-grey mt-1">Try different keywords or check your spelling.</div>
		</v-card>

		<!-- ═══ Initial state ═══ -->
		<v-card v-if="!searchStore.query" variant="flat" color="grey-lighten-4" class="pa-8 text-center" rounded="lg">
			<v-icon size="48" color="grey" class="mb-4">mdi-magnify</v-icon>
			<h3 class="text-h6 font-weight-bold mb-2">What can you search?</h3>
			<div class="d-flex flex-wrap justify-center ga-2 mt-3">
				<v-chip prepend-icon="mdi-lightbulb-on-outline" variant="tonal" color="orange-darken-2">{{ githubUseCaseData.useCases.length }} Use Cases</v-chip>
				<v-chip prepend-icon="mdi-certificate-outline" variant="tonal" color="blue-darken-3">12 Standards</v-chip>
				<v-chip prepend-icon="mdi-speedometer-medium" variant="tonal" color="teal">Burden Indicators</v-chip>
				<v-chip v-if="loginStore.validUser" prepend-icon="mdi-database" variant="tonal" color="purple">CEDS &amp; SIF Ontology</v-chip>
			</div>
		</v-card>
	</v-container>
</template>

<script>
import { githubUseCaseData } from '@/data/github-use-cases';
export default { setup() { return { githubUseCaseData }; } };
</script>

<style scoped>
.search-card {
	cursor: pointer;
	transition: box-shadow 0.15s;
}
.search-card:hover {
	box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}
.detail-label {
	font-weight: 600;
	font-size: 0.85em;
	color: #555;
}
.detail-grid {
	display: flex;
	flex-wrap: wrap;
	gap: 8px 24px;
	font-size: 0.9em;
}
</style>
