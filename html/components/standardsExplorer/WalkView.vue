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
// ⟪meaningsExplorer⟫ The same walk draws the Meanings explorer (pages/explore/meanings.vue): the page names its walk (walkProfileName, a profile of
// explorerVocabulary's walkProfileByName), which gives the root the path begins at, the route its links go to, and the heading's words.
// ⟪meaningsPolish⟫ A page may put something beside the heading in the titleAside slot (the Meanings page's ⓘ explainer); with nothing there the heading is
// drawn exactly as it was.

import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { displayNameOf, kindDisplayNameOf, pathStableIdListOf, pathTextOf, meaningFullPathOf, walkFilterTextOfRouteQuery, walkFilterVocabulary, walkPathOf, walkProfileOf, walkRouteQueryOf, explorerComponentWords, wordingOf } from '@/components/standardsExplorer/explorerVocabulary';

const walkWords = explorerComponentWords.walkView;

const props = defineProps({
	// the Standards Explorer's page passes none; any other walk names itself
	walkProfileName: { type: String, default: 'standards' },
});

const route = useRoute();
const router = useRouter();
const store = useStandardsNeighbourhoodStore();
const walkProfile = walkProfileOf(props.walkProfileName);
store.setWalkProfileName(props.walkProfileName);

// a path that does not begin at the families catalog (hand-written, or older than it) is rewritten to one that
// does, in place, so the breadcrumb always reaches the top
watch(
	() => route.query.path,
	() => {
		const routePathStableIdList = pathStableIdListOf(route.query.path);
		const explorerPathStableIdList = walkPathOf(walkProfile.walkProfileName, routePathStableIdList);
		if (routePathStableIdList.length && explorerPathStableIdList.length !== routePathStableIdList.length) {
			router.replace({ path: route.path, query: { path: pathTextOf(explorerPathStableIdList) } });
			return;
		}
		store.loadPath(explorerPathStableIdList);
	},
	{ immediate: true },
);

// ⟪meaningsClarity⟫ THE LEVEL'S FILTER LIVES IN ITS URL (walkFilterVocabulary): the URL's text is the box's on every visit, so a move to another level (whose URL
// carries none) clears it, and Back or Forward to a level brings its own text back. A URL carrying the parameter twice reads as its first text (⟪review S2⟫).
const FILTER_QUERY_NAME = walkFilterVocabulary.walkFilterQueryName;
watch(
	() => route.query[FILTER_QUERY_NAME],
	() => store.setFilterText(walkFilterTextOfRouteQuery(route.query)),
	{ immediate: true },
);
// what is typed goes into this level's own URL, replacing it (typing is not a move, so it adds no history entry); the URL then says what the box says
watch(
	() => store.filterText,
	(filterText) => {
		if (walkFilterTextOfRouteQuery(route.query) === filterText) return;
		const { [FILTER_QUERY_NAME]: replacedFilterText, ...otherQueryByName } = route.query;
		router.replace({ path: route.path, query: { ...otherQueryByName, ...walkRouteQueryOf({ pathStableIdList: pathStableIdListOf(route.query.path), filterText }) } });
	},
);

// ⟪meaningsClarity Addendum C #12⟫ a meaning reached by a deep link gets its hub and domain crumbs: the URL is rewritten in place to the meaning's whole path,
// which its own answer names (meaningFullPathOf), so the person can climb up
watch(
	() => store.focusNode,
	(focusNode) => {
		const fullPathStableIdList = meaningFullPathOf({ pathStableIdList: store.pathStableIdList, focusNode });
		if (fullPathStableIdList) router.replace({ path: route.path, query: { ...route.query, path: pathTextOf(fullPathStableIdList) } });
	},
);

// ================================================================================
// NAVIGATION — every move is a new ?path=, so back and forward work; a move carries no filter, so it clears the box (⟪meaningsClarity⟫)

const goToPath = (pathStableIdList) => router.push({ path: route.path, query: walkRouteQueryOf({ pathStableIdList, filterText: '' }) });

// ⟪meaningsClarity⟫ one step into a row: below this level, or, for a row that lives elsewhere (an incoming meaning), to it in its own place (store.drillPathOf)
const drillInto = (stableId) => {
	if (!stableId) return;
	goToPath(store.drillPathOf(stableId));
};


const shareUrlText = computed(() => (typeof window === 'undefined' ? route.fullPath : `${window.location.origin}${route.fullPath}`));

const copyShareUrl = async () => {
	try {
		await navigator.clipboard.writeText(shareUrlText.value);
	} catch (error) {
		store.statusMsg = wordingOf(explorerComponentWords.walkLevelLabel.copyFailedTemplate, { errorText: error.message });
	}
};

const showLoading = computed(() => store.neighbourhoodLoading);
const showError = computed(() => !store.neighbourhoodLoading && !store.neighbourhood && Boolean(store.statusMsg));
const showLevel = computed(() => !store.neighbourhoodLoading && Boolean(store.neighbourhood));

// ================================================================================
// WHERE THE WALK IS, IN WORDS — the page title, and the level's name for the region holding it, so a screen reader or
// an AI agent reading the page knows which standard and which level it is on without seeing the diagram

const isAtRoot = computed(() => Boolean(store.focusNode) && store.focusNode.stableId === walkProfile.rootStableId);
const focusNameText = computed(() => (store.focusNode && !isAtRoot.value ? displayNameOf(store.focusNode) : ''));
const levelLabelText = computed(() => {
	if (!store.focusNode) return 'Explorer';
	const kindText = isAtRoot.value ? walkProfile.rootLevelText : `${focusNameText.value} (${kindDisplayNameOf(store.focusNode.kind, store.focusNode.hubName)})`;
	if (store.effectiveViewMode === 'schema') return wordingOf(explorerComponentWords.walkLevelLabel.schemaTemplate, { kindText });
	return wordingOf(explorerComponentWords.walkLevelLabel.levelTemplate, { itemCount: store.levelRowList.length, kindText, viewModeName: store.effectiveViewMode });
});
useHead(() => ({
	title: focusNameText.value ? `${focusNameText.value} · ${walkProfile.titleText}` : walkProfile.titleText,
	meta: [{ name: 'description', content: walkProfile.metaDescriptionText }],
}));
</script>

<template>
	<div class="explorer-page" data-testid="standards-explorer" :data-walk-profile="walkProfile.walkProfileName">
		<div class="explorer-heading">
			<div>
				<div v-if="$slots.titleAside" class="explorer-title-row">
					<h2 class="explorer-title">{{ walkProfile.titleText }}</h2>
					<slot name="titleAside" />
				</div>
				<h2 v-else class="explorer-title">{{ walkProfile.titleText }}</h2>
				<p class="explorer-intro">{{ walkProfile.introText }}</p>
			</div>
			<div class="explorer-share">
				<span>{{ walkWords.shareLabelText }}</span>
				<code class="explorer-share-url" data-testid="share-url">{{ shareUrlText }}</code>
				<v-btn size="small" variant="outlined" color="primary" @click="copyShareUrl">{{ walkWords.copyLinkText }}</v-btn>
			</div>
		</div>

		<StandardsExplorerBreadcrumb :crumb-list="store.crumbList" />

		<StandardsExplorerCrossingBanner
			v-if="store.crossing && store.crossing.isCrossed"
			:crossing="store.crossing"
		/>

		<StandardsExplorerToolbar />

		<div class="explorer-body">
			<section v-show="!store.panelFullWidth" class="explorer-main" :aria-label="levelLabelText" :aria-busy="showLoading ? 'true' : 'false'" data-testid="explorer-level">
				<StandardsExplorerStateNotice v-if="showLoading" state-name="loading" />
				<StandardsExplorerStateNotice v-else-if="showError" :state-name="store.walkProfile.showsRefusalsByName && store.statusIsRefusal ? 'refusal' : 'error'" :detail-text="store.statusMsg" @retry="store.retry()" />
				<template v-else-if="showLevel">
					<StandardsExplorerLevelProse v-if="store.walkProfile.showsLevelProse && store.effectiveViewMode !== 'schema'" />
					<StandardsExplorerFilterNotice v-if="store.filterUnmatchedRowCount > 0 && store.effectiveViewMode !== 'schema'" />
					<v-alert
						v-if="store.isLargeLevel && store.effectiveViewMode === 'table'"
						type="info"
						variant="tonal"
						density="compact"
						class="mb-3"
						data-testid="large-level-notice"
					>
						<div class="explorer-large-notice">
							<span>{{ wordingOf(walkWords.largeLevelTemplate, { itemCount: store.levelRowList.length }) }}</span>
							<v-btn size="small" variant="outlined" color="primary" data-testid="show-diagram" @click="store.setViewModeChoice('diagram')">{{ walkWords.showDiagramText }}</v-btn>
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

			<StandardsExplorerDetailPanel v-if="store.effectiveViewMode !== 'schema'" class="explorer-panel" :class="{ 'explorer-panel-full': store.panelFullWidth }" @drill="drillInto" @go-to-path="goToPath" />
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
.explorer-title-row {
	display: flex;
	align-items: center;
	gap: 4px;
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
/* TQ 2026-11-12: given the page's whole width, the panel is no longer pinned beside a list */
.explorer-panel.explorer-panel-full {
	flex: 1 1 100%;
	position: static;
	max-height: none;
	overflow-y: visible;
}
/* Beside the list (wide screens), the panel stays in view while the list scrolls, below the app bar (--v-layout-top, set by v-main); a panel taller than the window scrolls on its own. */
@media (min-width: 1100px) {
	.explorer-panel {
		position: sticky;
		top: calc(var(--v-layout-top, 0px) + 12px);
		max-height: calc(100vh - var(--v-layout-top, 0px) - 24px);
		overflow-y: auto;
		overscroll-behavior: contain;
	}
}
.explorer-large-notice {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}
</style>
