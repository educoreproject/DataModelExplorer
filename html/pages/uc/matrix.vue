<script setup>
// uc/matrix.vue — EdMatrix Standards Matrix page
//
// Interactive directory of education data standards displayed as a clickable
// SVG matrix (rows x layer columns) with a filterable card list.

definePageMeta({ middleware: 'auth' });

import { onMounted } from 'vue';
import { useKnowledgeStore } from '@/stores/knowledgeStore';

const matrixStore = useKnowledgeStore();

onMounted(() => {
	matrixStore.loadStandards();
});

const activeTab = 'matrix';
</script>

<template>
	<div>
			<SubPageNav
				:model-value="activeTab"
				:tabs="[{ label: 'Standards', value: 'matrix', to: '/uc/matrix' }]"
			/>

			<v-container fluid class="pa-6 pa-md-8">
				<!-- Header -->
				<div class="d-flex align-center ga-6 mb-8 pb-6" style="border-bottom: 1px solid #f1f5f9">
					<div style="width: 80px; height: 80px">
						<svg viewBox="0 0 100 100" style="width: 100%; height: 100%">
							<path d="M20,50 Q35,20 50,50 T80,50" fill="none" stroke="rgb(7, 42, 108)" stroke-width="6" stroke-linecap="round"/>
							<circle cx="20" cy="50" r="6" fill="rgb(0, 181, 184)"/>
							<circle cx="50" cy="50" r="8" fill="rgb(255, 165, 0)"/>
							<circle cx="80" cy="50" r="6" fill="rgb(0, 181, 184)"/>
							<path d="M50,50 L50,80" stroke="rgb(7, 42, 108)" stroke-width="4" stroke-dasharray="4 2"/>
							<circle cx="50" cy="80" r="5" fill="rgb(103, 58, 182)"/>
						</svg>
					</div>
					<div>
						<h1 class="text-h4 font-weight-bold" style="color: rgb(7, 42, 108); letter-spacing: -0.5px">Educore Standards</h1>
						<p class="text-subtitle-1 text-grey-darken-1 mt-1">Interactive Directory of Learning Data and Content Standards</p>
					</div>
				</div>

				<!-- Main layout: matrix + card list -->
				<div class="matrix-layout">
					<!-- Matrix panel -->
					<div class="matrix-panel">
						<v-card class="pa-8" rounded="xl" elevation="4">
							<!-- Controls row -->
							<div class="d-flex justify-space-between align-center flex-wrap ga-4 mb-8">
								<div>
									<div class="text-overline text-grey-darken-1 mb-1" style="font-size: 10px !important">View Matrix By:</div>
									<v-select
										v-model="matrixStore.viewMode"
										:items="[
											{ title: 'Data Category', value: 'dataCategory' },
											{ title: 'Use Case Category', value: 'useCase' },
										]"
										density="compact"
										variant="outlined"
										hide-details
										style="min-width: 220px"
										@update:model-value="matrixStore.resetFilter()"
									/>
								</div>
								<v-chip
									v-if="matrixStore.activeFilter.type"
									color="orange"
									variant="tonal"
									size="small"
									class="font-weight-bold"
								>
									Active: {{ matrixStore.activeFilter.type }}
								</v-chip>
							</div>

							<!-- SVG Matrix -->
							<div style="overflow-x: auto">
								<svg viewBox="0 0 850 550" style="width: 100%; height: auto; min-width: 700px">
									<!-- Column headers -->
									<g v-for="(layer, index) in matrixStore.layerNames" :key="'header-' + layer">
										<text
											:x="220 + (index * 155)"
											y="25"
											font-size="12"
											font-weight="700"
											text-anchor="middle"
											fill="rgb(7, 42, 108)"
										>{{ layer }}</text>
									</g>

									<!-- Rows -->
									<g v-for="(rowLabel, rIdx) in matrixStore.currentRows" :key="'row-' + rowLabel">
										<!-- Row label -->
										<text
											x="0"
											:y="72 + (rIdx * 52)"
											font-size="12"
											font-weight="600"
											fill="rgb(7, 42, 108)"
										>{{ rowLabel }}</text>

										<!-- Cells -->
										<rect
											v-for="(layer, lIdx) in matrixStore.layerNames"
											:key="rowLabel + '-' + layer"
											:x="145 + (lIdx * 155)"
											:y="50 + (rIdx * 52)"
											width="150"
											height="40"
											rx="6"
											:class="['matrix-cell', matrixStore.getCellClass(rowLabel, layer)]"
											@click="matrixStore.toggleFilter(rowLabel, layer)"
										/>

										<!-- Data dots -->
										<template v-for="(layer, lIdx) in matrixStore.layerNames" :key="'dot-' + rowLabel + '-' + layer">
											<circle
												v-if="matrixStore.countMatches(rowLabel, layer) > 0"
												:cx="220 + (lIdx * 155)"
												:cy="70 + (rIdx * 52)"
												r="4"
												:fill="matrixStore.activeFilter.type === rowLabel && matrixStore.activeFilter.layer === layer ? 'white' : 'rgb(0, 181, 184)'"
												class="pointer-events-none"
											/>
										</template>
									</g>
								</svg>
							</div>
						</v-card>
					</div>

					<!-- Card list panel -->
					<div class="cards-panel">
						<!-- Counter card -->
						<v-card class="pa-6 mb-6 text-white" rounded="xl" elevation="4" color="rgb(7, 42, 108)">
							<div class="d-flex justify-space-between align-start">
								<div>
									<h3 class="text-h4 font-weight-bold">{{ matrixStore.filteredStandards.length }}</h3>
									<p class="text-blue-lighten-3 text-body-2">Standards Found</p>
								</div>
								<v-btn
									v-if="matrixStore.activeFilter.type"
									variant="tonal"
									size="x-small"
									color="white"
									@click="matrixStore.resetFilter()"
								>Clear</v-btn>
							</div>
							<div v-if="matrixStore.activeFilter.type" class="mt-4 pt-4" style="border-top: 1px solid rgba(255,255,255,0.15)">
								<div class="text-overline text-blue-lighten-3" style="font-size: 10px !important; letter-spacing: 0.5px">Current Filter</div>
								<div class="font-weight-bold text-body-2">{{ matrixStore.activeFilter.type }} + {{ matrixStore.activeFilter.layer }}</div>
							</div>
						</v-card>

						<!-- Standards list -->
						<div class="standards-list pr-2" style="max-height: calc(100vh - 280px); overflow-y: auto">
							<v-card
								v-for="std in matrixStore.filteredStandards"
								:key="std.name"
								class="standard-card mb-4 pa-5"
								rounded="xl"
								variant="outlined"
								elevation="1"
							>
								<div class="d-flex justify-space-between align-start mb-2">
									<h4 class="text-subtitle-1 font-weight-bold" style="color: rgb(7, 42, 108)">{{ std.name }}</h4>
									<v-chip size="x-small" variant="flat" color="grey-lighten-3" class="text-grey-darken-2 font-weight-bold text-uppercase" style="font-size: 9px; letter-spacing: 0.5px">{{ std.org }}</v-chip>
								</div>
								<div class="text-body-2 text-grey-darken-2 mb-4" style="line-height: 1.6" v-html="std.excerpt"></div>
								<div class="d-flex flex-wrap ga-1 mb-3">
									<v-chip v-for="t in std.types" :key="t" size="x-small" variant="tonal" color="blue" class="font-weight-bold" style="font-size: 9px">{{ t }}</v-chip>
									<v-chip v-for="uc in std.useCaseCategories" :key="uc" size="x-small" variant="tonal" color="purple" class="font-weight-bold font-italic" style="font-size: 9px"># {{ uc }}</v-chip>
								</div>
								<div class="d-flex justify-space-between align-center text-caption font-weight-bold pt-3" style="border-top: 1px solid #f1f5f9">
									<span style="color: rgb(0, 181, 184)">{{ std.uses.filter(u => u !== '').join(', ') || 'N/A' }}</span>
									<a :href="std.url" target="_blank" class="text-grey-darken-1 text-decoration-none text-uppercase" style="letter-spacing: 1.5px; font-size: 10px">Website ↗</a>
								</div>
							</v-card>

							<div v-if="matrixStore.filteredStandards.length === 0" class="text-center py-12 text-grey font-italic">
								No standards match this intersection.
							</div>
						</div>
					</div>
				</div>
			</v-container>
	</div>
</template>

<style scoped>
.matrix-layout {
	display: flex;
	gap: 24px;
}
.matrix-panel {
	flex: 0 0 60vw;
	max-width: 60vw;
}
.cards-panel {
	flex: 1 1 0;
	min-width: 0;
}
.matrix-cell {
	transition: all 0.2s ease;
	cursor: pointer;
	stroke-width: 1;
}
.matrix-cell:hover {
	fill: rgb(103, 58, 183);
	fill-opacity: 0.1;
	stroke: rgb(103, 58, 183);
}
.active-cell {
	fill: rgb(255, 165, 0) !important;
	stroke: rgb(7, 42, 108) !important;
	stroke-width: 2;
}
.has-data {
	fill: white;
	stroke: #e2e8f0;
}
.empty-cell {
	fill: #f9fafb;
	stroke: #f1f5f9;
	opacity: 0.4;
}
.pointer-events-none {
	pointer-events: none;
}
.standard-card:hover {
	border-left: 4px solid rgb(0, 181, 184) !important;
	transform: translateX(4px);
}
.standards-list::-webkit-scrollbar {
	width: 6px;
}
.standards-list::-webkit-scrollbar-thumb {
	background: #e2e8f0;
	border-radius: 10px;
}
</style>
