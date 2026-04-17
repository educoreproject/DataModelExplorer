<script setup>
import { useSearchStore } from '@/stores/searchStore';
import { useRoute, useRouter } from 'vue-router';
import { ref, watch, onMounted } from 'vue';

const searchStore = useSearchStore();
const route = useRoute();
const router = useRouter();
const searchText = ref(route.query.q || '');
const expandedIdx = ref(null);

const handleSearch = () => {
	const q = searchText.value.trim();
	if (!q) return;
	expandedIdx.value = null;
	router.replace({ path: '/search', query: { q } });
	searchStore.search(q);
};

const handleKeydown = (event) => {
	if (event.key === 'Enter' && !event.shiftKey) {
		event.preventDefault();
		handleSearch();
	}
};

const handleResultClick = (item, idx) => {
	if (item.link) {
		router.push(item.link);
	} else {
		expandedIdx.value = expandedIdx.value === idx ? null : idx;
	}
};

const goToPage = (item) => {
	if (item.link) router.push(item.link);
};

const typeLabel = (type) => {
	const labels = {
		'standard': 'Standard',
		'topic': 'Topic',
		'topic-driver': 'Driver',
		'use-case': 'Use Case',
		'library': 'Specification',
		'field-mapping': 'Field Mapping',
		'field-mapping-spec': 'Spec Mapping',
		'stakeholder-group': 'Stakeholder Group',
		'stakeholder': 'Stakeholder',
		'business-need': 'Business Need',
		'tech-resource-group': 'Resource Category',
		'tech-resource': 'Technical Resource',
		'ceds-use-case': 'CEDS Use Case',
		'ceds-element': 'CEDS Element',
		'ceds-business-need': 'CEDS Need',
	};
	return labels[type] || type;
};

const runFromQueryParam = () => {
	const q = route.query.q;
	if (q) {
		searchText.value = q;
		if (q !== searchStore.query) {
			searchStore.search(q);
		}
	}
};

onMounted(runFromQueryParam);
watch(() => route.query.q, runFromQueryParam);
</script>

<template>
	<v-container fluid class="pa-4">
		<h2 class="text-h5 mb-4">Search</h2>

		<!-- Search input -->
		<v-card variant="outlined" class="mb-5 pa-4">
			<div class="d-flex align-center ga-3">
				<v-text-field
					v-model="searchText"
					placeholder="Search standards, topics, use cases, library..."
					variant="outlined"
					density="comfortable"
					hide-details
					prepend-inner-icon="mdi-magnify"
					clearable
					autofocus
					@keydown="handleKeydown"
				/>
				<v-btn
					color="primary"
					size="large"
					@click="handleSearch"
				>
					Search
				</v-btn>
			</div>
		</v-card>

		<!-- Results count -->
		<div v-if="searchStore.query" class="text-body-2 text-medium-emphasis mb-3">
			{{ searchStore.resultCount }} result{{ searchStore.resultCount === 1 ? '' : 's' }} found
			for "{{ searchStore.query }}"
		</div>

		<!-- Results list -->
		<div v-if="searchStore.hasResults">
			<v-card
				v-for="(item, idx) in searchStore.results"
				:key="idx"
				variant="outlined"
				class="mb-2 search-result-card"
				:class="{ 'result-expandable': !item.link }"
				@click="handleResultClick(item, idx)"
			>
				<v-card-text class="py-3">
					<div class="d-flex align-center">
						<v-icon
							:color="item.color"
							size="small"
							class="mr-3"
						>
							{{ item.icon }}
						</v-icon>
						<div class="flex-grow-1" style="min-width: 0;">
							<div class="d-flex align-center flex-wrap ga-1">
								<span class="text-body-2 font-weight-bold">{{ item.label }}</span>
								<v-chip
									size="x-small"
									variant="outlined"
									:color="item.color"
								>
									{{ typeLabel(item.type) }}
								</v-chip>
								<v-chip
									v-if="item.category"
									size="x-small"
									variant="flat"
									color="grey-lighten-2"
								>
									{{ item.category }}
								</v-chip>
							</div>
							<div v-if="item.description" class="text-caption text-medium-emphasis mt-1">
								{{ item.description.length > 200 ? item.description.slice(0, 200) + '...' : item.description }}
							</div>
						</div>
						<v-icon v-if="item.link" size="small" color="primary" class="ml-2">
							mdi-open-in-new
						</v-icon>
						<v-icon v-else size="small" color="grey" class="ml-2">
							{{ expandedIdx === idx ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
						</v-icon>
					</div>

					<!-- Expanded detail (inline, for items without a page) -->
					<div v-if="expandedIdx === idx && !item.link" class="mt-3 pt-3" style="border-top: 1px solid #eee;">

						<!-- Standard detail -->
						<template v-if="item.type === 'standard' && item.detail">
							<div class="detail-grid">
								<div><span class="detail-label">Organization:</span> {{ item.detail.organization }}</div>
								<div><span class="detail-label">Status:</span> {{ item.detail.status }}</div>
								<div><span class="detail-label">Burden:</span> {{ item.detail.burden }}</div>
							</div>
						</template>

						<!-- Topic detail -->
						<template v-if="item.type === 'topic' && item.detail">
							<div v-if="item.detail.drivers?.length" class="mb-2">
								<span class="detail-label">Drivers:</span>
								<v-chip v-for="d in item.detail.drivers" :key="d" size="x-small" variant="tonal" class="mr-1 mt-1">{{ d }}</v-chip>
							</div>
							<div class="detail-grid">
								<div v-if="item.detail.driverCount"><span class="detail-label">Driver count:</span> {{ item.detail.driverCount }}</div>
								<div v-if="item.detail.useCaseCount"><span class="detail-label">Use cases:</span> {{ item.detail.useCaseCount }}</div>
							</div>
						</template>

						<!-- Use case detail -->
						<template v-if="item.type === 'use-case' && item.detail">
							<div class="detail-grid">
								<div v-if="item.detail.issueNumber"><span class="detail-label">Issue:</span> #{{ item.detail.issueNumber }}</div>
								<div v-if="item.detail.topicId"><span class="detail-label">Topic:</span> {{ item.detail.topicId }}</div>
							</div>
							<div v-if="item.detail.labels?.length" class="mt-1">
								<v-chip v-for="l in item.detail.labels" :key="l" size="x-small" variant="tonal" class="mr-1">{{ l }}</v-chip>
							</div>
						</template>

						<!-- Field mapping detail -->
						<template v-if="item.type === 'field-mapping' && item.detail">
							<div v-if="item.detail.matchStrength" class="mb-2">
								<span class="detail-label">Match strength:</span> {{ item.detail.matchStrength }}
							</div>
							<div v-if="item.detail.specs?.length">
								<span class="detail-label">Spec mappings:</span>
								<v-table density="compact" class="mt-1">
									<thead><tr><th>Spec</th><th>Field</th><th>Path</th></tr></thead>
									<tbody>
										<tr v-for="s in item.detail.specs" :key="s.spec">
											<td class="text-caption">{{ s.spec }}</td>
											<td class="text-caption"><code>{{ s.field }}</code></td>
											<td class="text-caption"><code>{{ s.path }}</code></td>
										</tr>
									</tbody>
								</v-table>
							</div>
						</template>

						<!-- Field mapping spec detail -->
						<template v-if="item.type === 'field-mapping-spec' && item.detail">
							<div class="detail-grid">
								<div><span class="detail-label">Concept:</span> {{ item.detail.concept }}</div>
								<div><span class="detail-label">Spec:</span> {{ item.detail.spec }}</div>
								<div v-if="item.detail.path"><span class="detail-label">Path:</span> <code>{{ item.detail.path }}</code></div>
							</div>
						</template>

						<!-- Stakeholder detail -->
						<template v-if="item.type === 'stakeholder' && item.detail?.businessNeeds?.length">
							<span class="detail-label">Business needs:</span>
							<ul class="text-caption pl-4 mt-1">
								<li v-for="need in item.detail.businessNeeds" :key="need">{{ need }}</li>
							</ul>
						</template>

						<!-- Tech resource detail -->
						<template v-if="item.type === 'tech-resource' && item.detail">
							<div class="detail-grid">
								<div v-if="item.detail.scope"><span class="detail-label">Scope:</span> {{ item.detail.scope }}</div>
								<div v-if="item.detail.url">
									<span class="detail-label">URL:</span>
									<a :href="item.detail.url" target="_blank" class="text-caption">{{ item.detail.url }}</a>
								</div>
							</div>
						</template>

						<!-- CEDS use case detail -->
						<template v-if="item.type === 'ceds-use-case' && item.detail">
							<div v-if="item.detail.domains?.length" class="mb-2">
								<span class="detail-label">CEDS domains:</span>
								<v-chip v-for="d in item.detail.domains" :key="d" size="x-small" variant="tonal" class="mr-1 mt-1">{{ d }}</v-chip>
							</div>
							<div v-if="item.detail.relatedStandards?.length" class="mb-2">
								<span class="detail-label">Related standards:</span>
								<v-chip v-for="s in item.detail.relatedStandards" :key="s" size="x-small" variant="outlined" class="mr-1 mt-1">{{ s }}</v-chip>
							</div>
							<div v-if="item.detail.businessNeeds?.length">
								<span class="detail-label">Business needs:</span>
								<ul class="text-caption pl-4 mt-1">
									<li v-for="n in item.detail.businessNeeds" :key="n">{{ n }}</li>
								</ul>
							</div>
						</template>

						<!-- CEDS element detail -->
						<template v-if="item.type === 'ceds-element' && item.detail">
							<div class="detail-grid">
								<div v-if="item.detail.uri"><span class="detail-label">URI:</span> <code class="text-caption">{{ item.detail.uri }}</code></div>
								<div><span class="detail-label">Use case:</span> {{ item.detail.parentUseCase }}</div>
							</div>
						</template>

						<!-- Library detail -->
						<template v-if="item.type === 'library' && item.detail">
							<div class="detail-grid">
								<div v-if="item.detail.owner"><span class="detail-label">Owner:</span> {{ item.detail.owner }}</div>
								<div v-if="item.detail.version"><span class="detail-label">Version:</span> {{ item.detail.version }}</div>
								<div v-if="item.detail.burden"><span class="detail-label">Burden:</span> {{ item.detail.burden }}</div>
								<div v-if="item.detail.access"><span class="detail-label">Access:</span> {{ item.detail.access }}</div>
							</div>
							<div v-if="item.detail.tags?.length" class="mt-2">
								<v-chip v-for="tag in item.detail.tags.slice(0, 10)" :key="tag" size="x-small" variant="tonal" class="mr-1 mt-1">{{ tag }}</v-chip>
							</div>
							<v-btn
								size="small"
								variant="tonal"
								color="primary"
								class="mt-3"
								prepend-icon="mdi-open-in-new"
								@click.stop="goToPage(item)"
							>
								View on Specifications page
							</v-btn>
						</template>

						<!-- Generic fallback: just show full description -->
						<template v-if="!item.detail && item.description">
							<div class="text-body-2">{{ item.description }}</div>
						</template>
					</div>
				</v-card-text>
			</v-card>
		</div>

		<!-- Empty state -->
		<v-card
			v-if="searchStore.query && !searchStore.hasResults"
			variant="outlined"
			class="pa-6 text-center"
		>
			<v-icon size="48" color="grey-lighten-1" class="mb-3">mdi-magnify-close</v-icon>
			<div class="text-body-1 text-medium-emphasis">
				No results found for "{{ searchStore.query }}"
			</div>
			<div class="text-body-2 text-grey mt-1">
				Try different keywords or check your spelling.
			</div>
		</v-card>
	</v-container>
</template>

<style scoped>
.search-result-card {
	cursor: pointer;
	transition: box-shadow 0.15s;
}
.search-result-card:hover {
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
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
