<script setup>
// @concept: [[DataModelExplorer]]
// Explore → PESC Explorer (DEV-123).
//
// Opens on the PESC standards and walks, one click at a time, down a standard to its classes and properties, across
// to the CEDS element a property maps to, and out into every other standard that maps to the same element. Each
// level is a diagram or a table of the same rows (the store's levelRowList). The URL's ?path= is the whole walk, so a
// reload or a shared link lands on the same screen; this page is the only thing that reads or writes it.

import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { pathStableIdListOf, pathTextOf } from '@/components/standardsExplorer/explorerVocabulary';

definePageMeta({ middleware: 'auth' });

// the family this page opens on; the rest of the page is general
const ENTRY_FAMILY_STABLE_ID = 'family:PESC';

const route = useRoute();
const router = useRouter();
const store = useStandardsNeighbourhoodStore();

const pathStableIdListOfRoute = () => {
	const pathStableIdList = pathStableIdListOf(route.query.path);
	return pathStableIdList.length ? pathStableIdList : [ENTRY_FAMILY_STABLE_ID];
};

watch(
	() => route.query.path,
	() => store.loadPath(pathStableIdListOfRoute()),
	{ immediate: true },
);

// ================================================================================
// NAVIGATION — every move is a new ?path=, so back and forward work

const goToPath = (pathStableIdList) => router.push({ path: route.path, query: { path: pathTextOf(pathStableIdList) } });

const drillInto = (stableId) => {
	if (!stableId) return;
	goToPath([...store.pathStableIdList, stableId]);
};

const goToCrumb = (pathIndex) => goToPath(store.pathStableIdList.slice(0, pathIndex + 1));

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
</script>

<template>
	<div class="explorer-page" data-testid="pesc-explorer">
		<div class="explorer-heading">
			<div>
				<h1 class="explorer-title">Standards Explorer</h1>
				<p class="explorer-intro">Click a bubble or a row to see what it is. Double-click, or use Open, to go inside it.</p>
			</div>
			<div class="explorer-share">
				<span>Link to this view:</span>
				<code class="explorer-share-url" data-testid="share-url">{{ shareUrlText }}</code>
				<v-btn size="small" variant="outlined" color="primary" @click="copyShareUrl">Copy link</v-btn>
			</div>
		</div>

		<StandardsExplorerBreadcrumb :crumb-list="store.crumbList" @go-to-crumb="goToCrumb" />

		<StandardsExplorerCrossingBanner
			v-if="store.crossing && store.crossing.isCrossed"
			:crossing="store.crossing"
			@go-home="goToCrumb(store.crossing.homeCrumb.pathIndex)"
		/>

		<StandardsExplorerToolbar />

		<div class="explorer-body">
			<section class="explorer-main" aria-label="Explorer">
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
					<StandardsExplorerDiagram v-if="store.effectiveViewMode === 'diagram'" @drill="drillInto" />
					<StandardsExplorerTable v-else @drill="drillInto" />
				</template>
				<StandardsExplorerLegend v-if="store.legendVisible" />
			</section>

			<StandardsExplorerDetailPanel class="explorer-panel" @drill="drillInto" />
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
	font-size: 34px;
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
