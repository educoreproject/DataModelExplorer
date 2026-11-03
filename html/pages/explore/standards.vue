<script setup>
// @concept: [[DataModelExplorer]]
// Explore → Standards: the one standards view. One sidebar entry, four tabs, each its own child route so a tab is a
// link to share and each tab keeps its own query (the explorer's ?path=, the downloads' ?family=…):
//   Overview        /explore/standards                the specification catalog (public)
//   Visualizations  /explore/standards/explorer       the Standards Explorer diagrams and tables (signed in)
//   Schema          /explore/standards/schema         the Schema Verifier (public)
//   Downloads       /explore/standards/downloads      every standard's source and graph zips (public)
// The old routes (/explore/graphicModelExplorer, /explore/schema-verifier, /explore/downloads, /explore/pesc)
// redirect here with their query, so shared links still land on their screen.

import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useLoginStore } from '@/stores/loginStore';

const route = useRoute();
const loginStore = useLoginStore();

const STANDARDS_TAB_LIST = [
	{ tabKey: 'overview', title: 'Overview', icon: 'mdi-certificate-outline', to: '/explore/standards' },
	{ tabKey: 'explorer', title: 'Visualizations', icon: 'mdi-graph-outline', to: '/explore/standards/explorer', needsSignIn: true },
	{ tabKey: 'schema', title: 'Schema', icon: 'mdi-table-search', to: '/explore/standards/schema' },
	{ tabKey: 'downloads', title: 'Downloads', icon: 'mdi-download-box-outline', to: '/explore/standards/downloads' },
];

const activeTabKey = computed(() => {
	const trailingSegment = route.path.replace(/\/$/, '').split('/').pop();
	return STANDARDS_TAB_LIST.find((oneTab) => oneTab.tabKey === trailingSegment)?.tabKey || 'overview';
});
</script>

<template>
	<div class="standards-view" data-testid="standards-view">
		<div class="standards-view-bar">
			<h1 class="standards-view-title">Standards</h1>
			<v-tabs :model-value="activeTabKey" color="primary" density="comfortable" show-arrows class="standards-view-tabs">
				<v-tab
					v-for="oneTab in STANDARDS_TAB_LIST"
					:key="oneTab.tabKey"
					:value="oneTab.tabKey"
					:to="oneTab.to"
					:exact="oneTab.tabKey === 'overview'"
					:prepend-icon="oneTab.icon"
					:data-testid="`standards-tab-${oneTab.tabKey}`"
				>
					{{ oneTab.title }}
					<v-icon v-if="oneTab.needsSignIn && !loginStore.validUser" size="14" class="ml-1" title="Sign in to use">mdi-lock-outline</v-icon>
				</v-tab>
			</v-tabs>
		</div>
		<NuxtPage />
	</div>
</template>

<style scoped>
.standards-view-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: 8px 24px;
	padding: 16px clamp(16px, 3vw, 40px) 0;
	background: var(--edu-surface, #fff);
	border-bottom: 1px solid #e3e7ef;
}
.standards-view-title {
	margin: 0 0 8px;
	font-family: 'DM Serif Display', Georgia, serif;
	font-weight: 400;
	font-size: 30px;
	color: #072a6c;
}
.standards-view-tabs {
	flex: 1 1 auto;
	min-width: 0;
}
</style>
