<script setup>
// @concept: [[DataModelExplorer]]
// The Standards Explorer's walk (DEV-123; every family since 2026-10-14), the Standards view's Explorer tab
// (pages/explore/standards/index.vue), open to everyone since 2026-11-04 (the walk's endpoint is public).
//
// Opens on every standards family in the graph (the synthetic 'families:all') and walks, one click at a time, down a
// standard to its classes and properties, across to the hub element a property maps to, and out into every other
// standard that maps to the same element. A hub standard is walkable from its own root too. Each level is a diagram or a table
// of the same rows (the store's levelRowList). The URL's ?path= is the whole walk and always begins at
// 'families:all', so a reload or a shared link lands on the same screen; this page is the only thing that reads or
// writes it. /explore/graphicModelExplorer redirects here; /explore/pesc redirects here entered at PESC.
// The detail panel carries the specification catalog's card for the family being walked (SpecificationCard.vue).

import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { displayNameOf, explorerPathOf, kindDisplayNameOf, pathStableIdListOf, pathTextOf } from '@/components/standardsExplorer/explorerVocabulary';

const route = useRoute();
const router = useRouter();
const store = useStandardsNeighbourhoodStore();

// a path that does not begin at the families catalog (hand-written, or older than it) is rewritten to one that
// does, in place, so the breadcrumb always reaches the top
watch(
	() => route.query.path,
	() => {
		const routePathStableIdList = pathStableIdListOf(route.query.path);
		const explorerPathStableIdList = explorerPathOf(routePathStableIdList);
		if (routePathStableIdList.length && explorerPathStableIdList.length !== routePathStableIdList.length) {
			router.replace({ path: route.path, query: { path: pathTextOf(explorerPathStableIdList) } });
			return;
		}
		store.loadPath(explorerPathStableIdList);
	},
	{ immediate: true },
);

// ================================================================================
// NAVIGATION — every move is a new ?path=, so back and forward work

const goToPath = (pathStableIdList) => router.push({ path: route.path, query: { path: pathTextOf(pathStableIdList) } });

const drillInto = (stableId) => {
	if (!stableId) return;
	goToPath([...store.pathStableIdList, stableId]);
};


const shareUrlText = computed(() => (typeof window === 'undefined' ? route.fullPath : `${window.location.origin}${route.fullPath}`));

const copyShareUrl = async () => {
	try {
		await navigator.clipboard.writeText(shareUrlText.value);
	} catch (error) {
		store.statusMsg = `could not copy the link: ${error.message}`;
	}
};

const showLoading = computed(() => store.neighbourhoodLoading);
const showError = computed(() => !store.neighbourhoodLoading && !store.neighbourhood && Boolean(store.statusMsg));
const showLevel = computed(() => !store.neighbourhoodLoading && Boolean(store.neighbourhood));

// ================================================================================
// WHERE THE WALK IS, IN WORDS — the page title, and the level's name for the region holding it, so a screen reader or
// an AI agent reading the page knows which standard and which level it is on without seeing the diagram

const focusNameText = computed(() => (store.focusNode && store.focusNode.kind !== 'familyCatalog' ? displayNameOf(store.focusNode) : ''));
const levelLabelText = computed(() => {
	if (!store.focusNode) return 'Explorer';
	const kindText = store.focusNode.kind === 'familyCatalog' ? 'every standards family' : `${focusNameText.value} (${kindDisplayNameOf(store.focusNode.kind, store.focusNode.hubName)})`;
	if (store.effectiveViewMode === 'schema') return `Explorer: the schema of ${kindText}, in the Schema Viewer`;
	return `Explorer: ${store.levelRowList.length} items in ${kindText}, shown as a ${store.effectiveViewMode}`;
});
useHead(() => ({
	title: focusNameText.value ? `${focusNameText.value} · Standards Explorer` : 'Standards Explorer',
	meta: [{ name: 'description', content: 'Walk the education data standards in the EDUcore graph: each family, its classes and properties, the hub elements they map to, and every other standard that maps there.' }],
}));
</script>

<template>
	<div class="explorer-page" data-testid="standards-explorer">
		<div class="explorer-heading">
			<div>
				<h2 class="explorer-title">Standards Explorer</h2>
				<p class="explorer-intro">Pick a standard, then walk it: click a bubble or a row to see what it is; double-click, or use Open, to go inside it.</p>
			</div>
			<div class="explorer-share">
				<span>Link to this view:</span>
				<code class="explorer-share-url" data-testid="share-url">{{ shareUrlText }}</code>
				<v-btn size="small" variant="outlined" color="primary" @click="copyShareUrl">Copy link</v-btn>
			</div>
		</div>

		<StandardsExplorerBreadcrumb :crumb-list="store.crumbList" />

		<StandardsExplorerCrossingBanner
			v-if="store.crossing && store.crossing.isCrossed"
			:crossing="store.crossing"
		/>

		<StandardsExplorerToolbar />

		<div class="explorer-body">
			<section class="explorer-main" :aria-label="levelLabelText" :aria-busy="showLoading ? 'true' : 'false'" data-testid="explorer-level">
				<StandardsExplorerStateNotice v-if="showLoading" state-name="loading" />
				<StandardsExplorerStateNotice v-else-if="showError" state-name="error" :detail-text="store.statusMsg" @retry="store.retry()" />
				<template v-else-if="showLevel">
					<v-alert
						v-if="store.isLargeLevel && store.effectiveViewMode === 'table'"
						type="info"
						variant="tonal"
						density="compact"
						class="mb-3"
						data-testid="large-level-notice"
					>
						<div class="explorer-large-notice">
							<span>{{ store.levelRowList.length }} items is too many to draw at once, so this level opened as a table.</span>
							<v-btn size="small" variant="outlined" color="primary" data-testid="show-diagram" @click="store.setViewModeChoice('diagram')">Show diagram</v-btn>
						</div>
					</v-alert>
					<template v-if="store.effectiveViewMode === 'diagram'">
						<StandardsExplorerDiagram @drill="drillInto" />
						<StandardsExplorerLevelItemList />
					</template>
					<!-- the standard being walked, in the Specification Viewer; it takes the whole width (no legend, no panel) -->
					<StandardsExplorerSchemaView v-else-if="store.effectiveViewMode === 'schema'" />
					<StandardsExplorerTable v-else @drill="drillInto" />
				</template>
				<StandardsExplorerLegend v-if="store.legendVisible && store.effectiveViewMode !== 'schema'" />
			</section>

			<StandardsExplorerDetailPanel v-if="store.effectiveViewMode !== 'schema'" class="explorer-panel" @drill="drillInto" @go-to-path="goToPath" />
		</div>
	</div>
</template>

<style scoped>
.explorer-page {
	max-width: 1600px;
	margin: 0 auto;
	padding: 24px clamp(16px, 3vw, 40px) 48px;
	color: #111827;
}
.explorer-heading {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 16px;
}
.explorer-title {
	margin: 0;
	font-family: 'DM Serif Display', Georgia, serif;
	font-weight: 400;
	font-size: 26px;
	color: #072a6c;
}
.explorer-intro {
	margin: 4px 0 0;
	font-size: 15px;
	color: #4b5563;
}
.explorer-share {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 13px;
	color: #4b5563;
	flex-wrap: wrap;
}
.explorer-share-url {
	background: #ffffff;
	border: 1px solid #e3e7ef;
	border-radius: 6px;
	padding: 4px 8px;
	font-size: 12px;
	color: #072a6c;
	max-width: 46ch;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.explorer-body {
	display: flex;
	flex-wrap: wrap;
	gap: 16px;
	align-items: flex-start;
}
.explorer-main {
	flex: 999 1 600px;
	min-width: 0;
	background: #ffffff;
	border: 1px solid #e3e7ef;
	border-radius: 12px;
	padding: 16px;
}
.explorer-panel {
	flex: 1 1 300px;
	min-width: 0;
}
.explorer-large-notice {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}
</style>
