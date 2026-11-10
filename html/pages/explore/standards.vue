<script setup>
// @concept: [[DataModelExplorer]]
// Explore → Standards: the one standards view. One sidebar entry, three tabs, each its own child route so a tab is a
// link to share and each tab keeps its own query (the explorer's ?path=, the downloads' ?family=…):
//   Explorer        /explore/standards                 the specification catalog and the Standards Explorer as one view:
//                                                      the walk, with each family's catalog card (public since
//                                                      2026-11-04; it was signed-in only)
//   Specifications  /explore/standards/specifications  the Specification Viewer (public)
//   Downloads       /explore/standards/downloads       every standard's source and graph zips (public)
// The old routes (/explore/graphicModelExplorer, /explore/standards/explorer, /explore/specification-viewer,
// /explore/schema-verifier, /explore/downloads, /explore/pesc) redirect here with their query, so shared links still
// land on their screen.

import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const STANDARDS_TAB_LIST = [
	{ tabKey: 'explorer', title: 'Explorer', icon: 'mdi-graph-outline', to: '/explore/standards' },
	{ tabKey: 'specifications', title: 'Specifications', icon: 'mdi-table-search', to: '/explore/standards/specifications' },
	{ tabKey: 'downloads', title: 'Downloads', icon: 'mdi-download-box-outline', to: '/explore/standards/downloads' },
];

const activeTabKey = computed(() => {
	const trailingSegment = route.path.replace(/\/$/, '').split('/').pop();
	return STANDARDS_TAB_LIST.find((oneTab) => oneTab.tabKey === trailingSegment)?.tabKey || 'explorer';
});
</script>

<template>
	<div class="standards-view" data-testid="standards-view">
		<ExploreViewBar title-text="Standards">
			<v-tabs :model-value="activeTabKey" color="primary" density="comfortable" show-arrows class="standards-view-tabs" aria-label="Standards sections">
				<v-tab
					v-for="oneTab in STANDARDS_TAB_LIST"
					:key="oneTab.tabKey"
					:value="oneTab.tabKey"
					:to="oneTab.to"
					:exact="oneTab.tabKey === 'explorer'"
					:prepend-icon="oneTab.icon"
					:data-testid="`standards-tab-${oneTab.tabKey}`"
				>
					{{ oneTab.title }}
				</v-tab>
			</v-tabs>
		</ExploreViewBar>
		<NuxtPage />
	</div>
</template>

<style scoped>
.standards-view-tabs {
	flex: 1 1 auto;
	min-width: 0;
}
</style>
