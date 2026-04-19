<script setup>
// @concept: [[DataModelExplorer]]
// LookupBrowser.vue — Tree browser component for Data Model Explorer
//
// Displays breadcrumbs, item list, and detail view.
// Navigation is direct — click handlers call store then update display.

import { useKnowledgeStore } from '@/stores/knowledgeStore';
import { ref, computed, onMounted } from 'vue';

const store = useKnowledgeStore();
const aiSearchText = ref('');
const filterText = ref('');
const filterDescriptions = ref(false);

// Fuzzy filter: split query into words, every word must appear somewhere in searchable fields
const filteredChildren = computed(() => {
	const raw = (filterText.value || '').trim().toLowerCase();
	if (!raw) return store.lookupChildren;

	const words = raw.split(/\s+/);
	return store.lookupChildren.filter(item => {
		const fields = [item.label, item.id, item.nodeType, item.standard];
		if (filterDescriptions.value) fields.push(item.description);
		const haystack = fields.filter(Boolean).join(' ').toLowerCase();
		return words.every(word => haystack.includes(word));
	});
});

// Load root level on mount
onMounted(() => {
	if (store.lookupChildren.length === 0 && !store.lookupLoading) {
		store.fetchLookupChildren({ level: 'standards' });
	}
});

// ----- Event handlers (direct navigation, no watchers)

const handleItemClick = (item) => {
	filterText.value = '';
	store.lookupSelectItem(item);
};

const handleBreadcrumbClick = (index) => {
	filterText.value = '';
	// If navigating back to AI Search breadcrumb, restore cached AI results
	if (store.lookupPath[index] && store.lookupPath[index].level === 'ai') {
		store.lookupPath = store.lookupPath.slice(0, index + 1);
		store.lookupLeafDetail = null;
		store.lookupChildren = [...store.lookupAiResults];
		return;
	}
	store.lookupNavigateTo(index);
};

const handleRootClick = () => {
	store.lookupNavigateTo(-1);
};

const handleAiSearchClick = () => {
	store.lookupEnterAiMode();
};

const handleAiGo = () => {
	if (aiSearchText.value.trim()) {
		store.lookupAiSearch(aiSearchText.value);
	}
};

const handleAiKeydown = (event) => {
	if (event.key === 'Enter' && !event.shiftKey) {
		event.preventDefault();
		handleAiGo();
	}
};

// ----- Icon helpers

const getItemIcon = (item) => {
	if (!item.hasChildren) return 'mdi-information-outline';
	return 'mdi-chevron-right';
};

const getNodeTypeColor = (nodeType) => {
	const colors = {
		ai: '#7b1fa2',
		standard: '#2c5f8a',
		SifObject: '#4a9d8f',
		SifXmlElement: '#6bb5a6',
		SifField: '#4a9d8f',
		CedsClass: '#c17b3a',
		CedsProperty: '#d4994d',
		CedsOptionValue: '#e6b366',
	};
	return colors[nodeType] || '#666';
};

const getNodeTypeIcon = (nodeType) => {
	const icons = {
		ai: 'mdi-brain',
		standard: 'mdi-database',
		SifObject: 'mdi-cube-outline',
		SifXmlElement: 'mdi-xml',
		SifField: 'mdi-text-box-outline',
		CedsClass: 'mdi-shape-outline',
		CedsProperty: 'mdi-tag-outline',
		CedsOptionValue: 'mdi-format-list-bulleted',
	};
	return icons[nodeType] || 'mdi-circle-small';
};
</script>

<template>
	<v-container fluid class="pa-4">
		<!-- Error alert -->
		<v-alert
			v-if="store.statusMsg"
			type="error"
			dismissible
			class="mb-4"
			@click:close="store.statusMsg = ''"
		>
			{{ store.statusMsg }}
		</v-alert>

		<!-- Breadcrumbs -->
		<v-card class="mb-4" variant="outlined">
			<v-card-text class="py-2 px-4">
				<v-breadcrumbs :items="[]" class="pa-0">
					<template #default>
						<v-breadcrumbs-item
							class="breadcrumb-link"
							@click="handleRootClick"
						>
							<v-icon size="small" class="mr-1">mdi-database</v-icon>
							Data Models
						</v-breadcrumbs-item>

						<template v-for="(segment, index) in store.lookupPath" :key="index">
							<v-breadcrumbs-divider>
								<v-icon>mdi-chevron-right</v-icon>
							</v-breadcrumbs-divider>
							<v-breadcrumbs-item
								:class="{ 'breadcrumb-link': index < store.lookupPath.length - 1, 'breadcrumb-current': index === store.lookupPath.length - 1 }"
								@click="index < store.lookupPath.length - 1 ? handleBreadcrumbClick(index) : null"
							>
								{{ segment.label }}
							</v-breadcrumbs-item>
						</template>
					</template>
				</v-breadcrumbs>
			</v-card-text>
		</v-card>

		<!-- AI Search input — reserve space always, show content only in AI mode -->
		<div class="ai-search-slot" :class="{ 'ai-search-active': store.lookupAiMode && !store.isShowingLookupDetail }">
			<v-card v-if="store.lookupAiMode && !store.isShowingLookupDetail" class="mb-0" variant="outlined">
				<v-card-text class="py-2 px-4 d-flex align-center ga-3">
					<v-icon color="#7b1fa2" size="small">mdi-brain</v-icon>
					<v-text-field
						v-model="aiSearchText"
						placeholder="Describe what you're looking for..."
						variant="underlined"
						density="compact"
						hide-details
						class="flex-grow-1"
						@keydown="handleAiKeydown"
					/>
					<v-btn
						icon
						variant="text"
						size="small"
						color="#7b1fa2"
						:loading="store.lookupLoading"
						:disabled="!aiSearchText.trim()"
						@click="handleAiGo"
					>
						<v-icon>mdi-send</v-icon>
					</v-btn>
				</v-card-text>
			</v-card>
		</div>

		<!-- Filter input — shown when a list is visible -->
		<div v-if="!store.isShowingLookupDetail && !store.lookupLoading && store.lookupChildren.length > 0 && store.lookupPath.length > 0" class="d-flex align-center ga-3 mb-3">
			<v-text-field
				v-model="filterText"
				placeholder="Filter this list..."
				variant="outlined"
				density="compact"
				hide-details
				clearable
				autofocus
				prepend-inner-icon="mdi-filter-outline"
				class="flex-grow-1"
			/>
			<v-checkbox
				v-model="filterDescriptions"
				label="Search Descriptions"
				density="compact"
				hide-details
				class="flex-shrink-0"
			/>
		</div>

		<!-- AI search patience panel -->
		<v-card
			v-if="store.lookupLoading && store.lookupAiMode"
			class="mb-4 ai-patience-panel"
			variant="flat"
		>
			<v-card-text class="d-flex align-center pa-5">
				<v-progress-circular
					indeterminate
					color="#7b1fa2"
					size="32"
					width="3"
					class="mr-4"
				/>
				<div>
					<div class="text-body-1" style="color: #4a3660">
						Searching the data standards graph...
					</div>
					<div class="text-body-2 mt-1" style="color: #8a7a9a">
						The AI is examining CEDS and SIF standards to find relevant elements.
						<strong>This can take a couple of minutes or more.</strong>
					</div>
				</div>
			</v-card-text>
		</v-card>

		<!-- Loading indicator (non-AI) -->
		<v-progress-linear
			v-if="store.lookupLoading && !store.lookupAiMode"
			indeterminate
			color="primary"
			class="mb-4"
		/>

		<!-- Detail view -->
		<v-card v-if="store.isShowingLookupDetail && !store.lookupLoading" class="mb-4">
			<v-card-title class="d-flex align-center">
				<v-icon
					:color="getNodeTypeColor(store.lookupLeafDetail.nodeType)"
					class="mr-2"
				>
					{{ getNodeTypeIcon(store.lookupLeafDetail.nodeType) }}
				</v-icon>
				{{ store.lookupLeafDetail.label }}
				<span v-if="store.lookupLeafDetail.cedsId || store.lookupLeafDetail.xpath" class="item-id-hint">({{ store.lookupLeafDetail.cedsId || store.lookupLeafDetail.xpath }})</span>
				<v-chip size="small" class="ml-2" variant="outlined">
					{{ store.lookupLeafDetail.nodeType }}
				</v-chip>
			</v-card-title>

			<v-card-text>
				<!-- Description -->
				<div v-if="store.lookupLeafDetail.description" class="mb-4">
					<div class="text-subtitle-2 text-grey">Description</div>
					<div>{{ store.lookupLeafDetail.description }}</div>
				</div>

				<!-- Properties grid -->
				<v-table density="compact" class="mb-4">
					<tbody>
						<tr v-if="store.lookupLeafDetail.xpath">
							<td class="text-grey" style="width: 150px">XPath</td>
							<td><code>{{ store.lookupLeafDetail.xpath }}</code></td>
						</tr>
						<tr v-if="store.lookupLeafDetail.cedsId">
							<td class="text-grey">CEDS ID</td>
							<td><code>{{ store.lookupLeafDetail.cedsId }}</code></td>
						</tr>
						<tr v-if="store.lookupLeafDetail.notation">
							<td class="text-grey">Notation</td>
							<td>{{ store.lookupLeafDetail.notation }}</td>
						</tr>
						<tr v-if="store.lookupLeafDetail.type">
							<td class="text-grey">Type</td>
							<td>{{ store.lookupLeafDetail.type }}</td>
						</tr>
						<tr v-if="store.lookupLeafDetail.mandatory !== undefined">
							<td class="text-grey">Mandatory</td>
							<td>{{ store.lookupLeafDetail.mandatory ? 'Yes' : 'No' }}</td>
						</tr>
						<tr v-if="store.lookupLeafDetail.depth !== undefined">
							<td class="text-grey">Depth</td>
							<td>{{ store.lookupLeafDetail.depth }}</td>
						</tr>
					</tbody>
				</v-table>

				<!-- Cross-standard mappings -->
				<div v-if="store.lookupLeafDetail.mappings && store.lookupLeafDetail.mappings.length > 0" class="mb-4">
					<div class="text-subtitle-2 text-grey mb-2">
						<v-icon size="small" class="mr-1">mdi-link-variant</v-icon>
						Cross-Standard Mappings ({{ store.lookupLeafDetail.mappings.length }})
					</div>
					<v-table density="compact">
						<thead>
							<tr>
								<th>Standard</th>
								<th>Target</th>
								<th v-if="store.lookupLeafDetail.mappings[0].targetId">ID</th>
								<th v-if="store.lookupLeafDetail.mappings[0].targetClass">Class</th>
								<th v-if="store.lookupLeafDetail.mappings[0].targetObject">Object</th>
								<th v-if="store.lookupLeafDetail.mappings[0].targetXpath">XPath</th>
								<th v-if="store.lookupLeafDetail.mappings[0].source">Source</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="(mapping, mIdx) in store.lookupLeafDetail.mappings" :key="mIdx">
								<td>
									<v-chip size="x-small" :color="mapping.standard === 'CEDS' ? 'orange' : 'teal'" variant="outlined">
										{{ mapping.standard }}
									</v-chip>
								</td>
								<td>{{ mapping.target }}</td>
								<td v-if="store.lookupLeafDetail.mappings[0].targetId">
									<code v-if="mapping.targetId">{{ mapping.targetId }}</code>
								</td>
								<td v-if="store.lookupLeafDetail.mappings[0].targetClass">
									{{ mapping.targetClass }}
								</td>
								<td v-if="store.lookupLeafDetail.mappings[0].targetObject">
									{{ mapping.targetObject }}
								</td>
								<td v-if="store.lookupLeafDetail.mappings[0].targetXpath">
									<code v-if="mapping.targetXpath" style="font-size: 0.85em">{{ mapping.targetXpath }}</code>
								</td>
								<td v-if="store.lookupLeafDetail.mappings[0].source">
									<v-chip size="x-small" variant="flat" color="grey-lighten-2">
										{{ mapping.source }}
									</v-chip>
								</td>
							</tr>
						</tbody>
					</v-table>
				</div>

				<!-- Option values (CEDS) -->
				<div v-if="store.lookupLeafDetail.optionValues && store.lookupLeafDetail.optionValues.length > 0" class="mb-4">
					<div class="text-subtitle-2 text-grey mb-2">
						<v-icon size="small" class="mr-1">mdi-format-list-bulleted</v-icon>
						Option Values ({{ store.lookupLeafDetail.optionValues.length }})
					</div>
					<v-table density="compact">
						<thead>
							<tr>
								<th>ID</th>
								<th>Label</th>
								<th>Description</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="(ov, ovIdx) in store.lookupLeafDetail.optionValues" :key="ovIdx">
								<td><code>{{ ov.cedsId }}</code></td>
								<td>{{ ov.label }}</td>
								<td class="text-grey">{{ ov.description }}</td>
							</tr>
						</tbody>
					</v-table>
				</div>

				<!-- Codeset values (SIF) -->
				<div v-if="store.lookupLeafDetail.codeset" class="mb-4">
					<div class="text-subtitle-2 text-grey mb-2">
						<v-icon size="small" class="mr-1">mdi-code-braces</v-icon>
						Codeset ({{ store.lookupLeafDetail.codeset.valueCount }} values)
					</div>
					<v-card variant="outlined" class="pa-3">
						<code style="white-space: pre-wrap; font-size: 0.85em">{{ store.lookupLeafDetail.codeset.values }}</code>
					</v-card>
				</div>
			</v-card-text>
		</v-card>

		<!-- Item list -->
		<v-card v-if="!store.isShowingLookupDetail && !store.lookupLoading" variant="outlined">
			<v-list density="compact">
				<v-list-item
					v-for="item in filteredChildren.filter(i => !store.lookupPath.some(seg => (seg.nodeId || seg.id) === (i.path || i.id) && seg.nodeType === i.nodeType))"
					:key="item.id"
					@click="handleItemClick(item)"
					class="lookup-item"
				>
					<template #prepend>
						<v-icon
							:color="getNodeTypeColor(item.nodeType)"
							size="small"
						>
							{{ getNodeTypeIcon(item.nodeType) }}
						</v-icon>
					</template>

					<v-list-item-title>
						{{ item.label }}
						<span v-if="item.id && item.id !== item.label" class="item-id-hint">({{ item.id }})</span>
						<v-chip v-if="item.standard" size="x-small" class="ml-2" variant="outlined"
							:color="item.standard === 'ceds' ? 'orange' : 'teal'">
							{{ item.standard.toUpperCase() }}
						</v-chip>
					</v-list-item-title>

					<v-list-item-subtitle v-if="item.description" class="text-caption">
						{{ item.description }}
					</v-list-item-subtitle>

					<v-list-item-subtitle v-else-if="item.childCount > 0" class="text-caption">
						{{ item.childCount }} {{ item.childCount === 1 ? 'child' : 'children' }}
					</v-list-item-subtitle>

					<template #append>
						<v-icon
							size="small"
							:color="item.hasChildren ? 'grey' : 'blue-grey'"
						>
							{{ getItemIcon(item) }}
						</v-icon>
					</template>
				</v-list-item>

				<v-list-item v-if="store.lookupChildren.length === 0 && !store.lookupLoading">
					<v-list-item-title class="text-grey text-center">
						No items found
					</v-list-item-title>
				</v-list-item>
			</v-list>
		</v-card>
	</v-container>
</template>

<style scoped>
.breadcrumb-link {
	cursor: pointer;
	color: #2c5f8a;
}
.breadcrumb-link:hover {
	text-decoration: underline;
}
.breadcrumb-current {
	font-weight: bold;
	color: #333;
}
.lookup-item {
	cursor: pointer;
}
.lookup-item:hover {
	background-color: #f5f5f5;
}
.ai-search-slot {
	height: 0;
	overflow: hidden;
	transition: height 0.2s ease, margin 0.2s ease;
	margin-bottom: 0;
}
.ai-search-active {
	height: auto;
	overflow: visible;
	margin-bottom: 16px;
}
.item-id-hint {
	color: #aaa;
	font-size: 0.85em;
	margin-left: 4px;
}
.ai-patience-panel {
	background: linear-gradient(135deg, #f3e8ff 0%, #e8f0fe 100%);
	border-left: 3px solid #7b1fa2;
}
</style>
