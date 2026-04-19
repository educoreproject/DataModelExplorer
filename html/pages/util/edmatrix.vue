<script setup>
// util/edmatrix.vue — EdMatrix Standards Report page
//
// Displays a filterable data table of education data standards
// from the EdMatrix graph database with expandable detail rows.

definePageMeta({ middleware: 'auth' });

import { useKnowledgeStore } from '@/stores/knowledgeStore';
import { ref, computed, onMounted } from 'vue';

const knowledgeStore = useKnowledgeStore();

const activeTab = 'edmatrix';

// Organization filter
const selectedOrg = ref(null);

// Data table headers
const headers = [
	{ title: 'Name', key: 'name', sortable: true },
	{ title: 'Organization', key: 'organization', sortable: true },
	{ title: 'Types', key: 'types', sortable: false },
	{ title: 'Formats', key: 'formats', sortable: false },
	{ title: 'Layers', key: 'layers', sortable: false },
	{ title: 'URL', key: 'url', sortable: false, width: '60px' },
	{ title: '', key: 'data-table-expand', width: '40px' },
];

// Expanded rows tracking
const expanded = ref([]);

// Data loading
onMounted(() => {
	knowledgeStore.loadStandards();
	knowledgeStore.loadOrganizations();
});

// Filter standards client-side by selected org (the full list comes from one fetch).
const visibleStandards = computed(() => {
	if (!selectedOrg.value) return knowledgeStore.standards;
	return knowledgeStore.standards.filter((s) => s.organization === selectedOrg.value);
});
</script>

<template>
	<div>
			<SubPageNav
				:model-value="activeTab"
				:tabs="[{ label: 'Standards', value: 'edmatrix', to: '/util/edmatrix' }]"
			/>

			<v-container fluid class="pa-6 pa-md-8">
				<!-- Header -->
				<div class="d-flex align-center ga-6 mb-6 pb-4" style="border-bottom: 1px solid #f1f5f9">
					<div style="width: 60px; height: 60px">
						<svg viewBox="0 0 100 100" style="width: 100%; height: 100%">
							<rect x="10" y="10" width="35" height="35" rx="4" fill="rgb(7, 42, 108)" opacity="0.8"/>
							<rect x="55" y="10" width="35" height="35" rx="4" fill="rgb(0, 181, 184)" opacity="0.8"/>
							<rect x="10" y="55" width="35" height="35" rx="4" fill="rgb(0, 181, 184)" opacity="0.6"/>
							<rect x="55" y="55" width="35" height="35" rx="4" fill="rgb(255, 165, 0)" opacity="0.7"/>
						</svg>
					</div>
					<div>
						<h1 class="text-h5 font-weight-bold" style="color: rgb(7, 42, 108); letter-spacing: -0.3px">Educore Standards</h1>
						<p class="text-subtitle-2 text-grey-darken-1 mt-1">{{ knowledgeStore.standardCount }} interoperability standards</p>
					</div>
				</div>

				<!-- Error alert -->
				<v-alert
					v-if="knowledgeStore.statusMsg"
					type="error"
					variant="tonal"
					closable
					class="mb-4"
					@click:close="knowledgeStore.statusMsg = ''"
				>
					{{ knowledgeStore.statusMsg }}
				</v-alert>

				<!-- Filter controls -->
				<div class="d-flex align-center ga-4 mb-4">
					<v-select
						v-model="selectedOrg"
						:items="knowledgeStore.organizationNames"
						label="Filter by Organization"
						clearable
						density="compact"
						variant="outlined"
						hide-details
						style="max-width: 300px"
					/>
				</div>

				<!-- Loading indicator -->
				<v-progress-linear
					v-if="knowledgeStore.standardsLoading"
					indeterminate
					color="primary"
					class="mb-4"
				/>

				<!-- Data table -->
				<v-data-table
					v-model:expanded="expanded"
					:headers="headers"
					:items="visibleStandards"
					:loading="knowledgeStore.standardsLoading"
					item-value="name"
					show-expand
					density="comfortable"
					class="elevation-1 rounded-lg"
					:items-per-page="50"
					:items-per-page-options="[25, 50, -1]"
				>
					<!-- Name column -->
					<template v-slot:item.name="{ item }">
						<span class="font-weight-bold" style="color: rgb(7, 42, 108)">{{ item.name }}</span>
					</template>

					<!-- Organization column -->
					<template v-slot:item.organization="{ item }">
						<span class="text-grey-darken-2">{{ item.organization }}</span>
					</template>

					<!-- Types column - plain chips -->
					<template v-slot:item.types="{ item }">
						<v-chip
							v-for="t in item.types"
							:key="t"
							size="x-small"
							class="mr-1 mb-1"
						>{{ t }}</v-chip>
					</template>

					<!-- Formats column - outlined chips -->
					<template v-slot:item.formats="{ item }">
						<v-chip
							v-for="f in item.formats"
							:key="f"
							size="x-small"
							variant="outlined"
							class="mr-1 mb-1"
						>{{ f }}</v-chip>
					</template>

					<!-- Layers column - tonal primary chips -->
					<template v-slot:item.layers="{ item }">
						<v-chip
							v-for="l in item.layers"
							:key="l"
							size="x-small"
							variant="tonal"
							color="primary"
							class="mr-1 mb-1"
						>{{ l }}</v-chip>
					</template>

					<!-- URL column - external link icon -->
					<template v-slot:item.url="{ item }">
						<a
							v-if="item.url"
							:href="item.url"
							target="_blank"
							rel="noopener noreferrer"
							class="text-grey-darken-1"
						>
							<v-icon size="small">mdi-open-in-new</v-icon>
						</a>
					</template>

					<!-- Expanded row - description -->
					<template v-slot:expanded-row="{ columns, item }">
						<tr>
							<td :colspan="columns.length" class="pa-4" style="background: #f8fafc">
								<div class="text-body-2 text-grey-darken-2" style="max-width: 800px; line-height: 1.6">
									<strong>Description:</strong> {{ item.description || 'No description available.' }}
								</div>
							</td>
						</tr>
					</template>

					<!-- No data -->
					<template v-slot:no-data>
						<div class="text-center py-8 text-grey font-italic">
							No standards found{{ selectedOrg ? ` for ${selectedOrg}` : '' }}.
						</div>
					</template>
				</v-data-table>
			</v-container>
	</div>
</template>

<style scoped>
</style>
