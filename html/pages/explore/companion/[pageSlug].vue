<script setup>
// @concept: [[CompanionPages]]
// Explore → a compiled companion page, /explore/companion/<pageSlug> (SPEC-companionPages-102826, Phase 4). The
// explorer's Companion pages cards link here.
//
// The page reads its registry record and its current compile (companionPageStore), always shows what the compile was
// built from (CompanionStampBar, with the out-of-date notice when the compile is not current), and then the panels its
// compiler's registry entry names (companionPanelRegistry.js), one tab each, in that order. Admin and super users also
// get an Administration tab (upload, source and compile history, add or edit page); after an upload or restore the page
// re-reads its compile, which recompiles from the new sources.
//
// The open tab is the ?tab= query, so a tab can be linked to. No ?tab= opens the first tab; a ?tab= that names no tab on
// this page is shown as such, with no tab opened, rather than quietly opening another one.

import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLoginStore } from '@/stores/loginStore';
import { useCompanionPageStore } from '@/stores/companionPageStore';
import { companionPanelListByCompilerName } from '@/components/companionPages/companionPanelRegistry';

definePageMeta({ middleware: 'auth' });

const route = useRoute();
const router = useRouter();
const loginStore = useLoginStore();
const companionPageStore = useCompanionPageStore();

const ADMIN_ROLE_NAME_LIST = ['admin', 'super'];

const pageSlug = computed(() => String(route.params.pageSlug || ''));
watch(pageSlug, (chosenPageSlug) => companionPageStore.loadPage(chosenPageSlug), { immediate: true });

const isAdminViewer = computed(() => ADMIN_ROLE_NAME_LIST.includes(loginStore.loggedInUser.role));

const pageRecord = computed(() => companionPageStore.pageRecord);
const compileAnswer = computed(() => companionPageStore.compileAnswer);
const panelList = computed(() => (pageRecord.value && companionPanelListByCompilerName[pageRecord.value.compilerName]) || null);

const reloadPage = () => companionPageStore.loadPage(pageSlug.value);

const ADMIN_TAB_NAME = 'admin';
// the panels show only with a compile to show; the Administration tab shows whenever the viewer is an admin
const shownPanelList = computed(() => (compileAnswer.value && panelList.value) || []);
const tabNameList = computed(() => [...shownPanelList.value.map((panelEntry) => panelEntry.panelName), ...(isAdminViewer.value ? [ADMIN_TAB_NAME] : [])]);
const requestedTabName = computed(() => (route.query.tab === undefined ? '' : String(route.query.tab)));
const isUnknownTabRequested = computed(() => requestedTabName.value !== '' && tabNameList.value.length > 0 && !tabNameList.value.includes(requestedTabName.value));
const openTabName = computed(() => {
	if (requestedTabName.value === '') return tabNameList.value[0] || null;
	return isUnknownTabRequested.value ? null : requestedTabName.value;
});
const openTab = (chosenTabName) => router.replace({ query: { ...route.query, tab: chosenTabName } });
</script>

<template>
	<div class="companion-page" data-testid="companion-page">
		<NuxtLink to="/explore/graphicModelExplorer" class="companion-back">‹ Standards Explorer</NuxtLink>
		<v-progress-linear v-if="companionPageStore.loading" indeterminate color="primary" class="mt-3" />
		<v-alert v-if="companionPageStore.statusMsg" type="error" variant="tonal" class="mt-3" data-testid="companion-page-error">This page could not be read: {{ companionPageStore.statusMsg }}</v-alert>

		<template v-if="pageRecord">
			<div class="companion-heading">
				<h1 class="companion-title" data-testid="companion-title">{{ pageRecord.title }}</h1>
				<p v-if="pageRecord.summary" class="companion-summary">{{ pageRecord.summary }}</p>
				<p v-if="pageRecord.audienceText" class="companion-audience">For {{ pageRecord.audienceText }}</p>
				<p v-if="!pageRecord.isActive" class="companion-inactive" data-testid="companion-inactive">This page is not active: the explorer does not list it.</p>
			</div>

			<p v-if="pageRecord.targetKind === 'externalUrl'" class="companion-external">
				This page lives elsewhere: <a :href="pageRecord.externalUrl" target="_blank" rel="noopener noreferrer">{{ pageRecord.externalUrl }}</a>
			</p>
			<v-alert v-else-if="companionPageStore.compileUnavailableText" type="warning" variant="tonal" class="mt-3" data-testid="companion-compile-unavailable">
				This page has not been built yet, so there is nothing to show: {{ companionPageStore.compileUnavailableText }}
			</v-alert>
			<template v-else-if="compileAnswer">
				<CompanionPagesCompanionStampBar :compile-answer="compileAnswer" />
				<v-alert v-if="!panelList" type="warning" variant="tonal" class="mt-3" data-testid="companion-no-panels">This site has no panels for pages built by '{{ pageRecord.compilerName }}'.</v-alert>
			</template>

			<template v-if="tabNameList.length > 0">
				<v-tabs :model-value="openTabName" :mandatory="false" color="primary" show-arrows class="companion-tabs" data-testid="companion-tabs" @update:model-value="openTab">
					<v-tab v-for="panelEntry in shownPanelList" :key="panelEntry.panelName" :value="panelEntry.panelName" class="companion-tab" :data-testid="`companion-tab-${panelEntry.panelName}`">
						<span class="companion-tab-label">{{ panelEntry.panelTitle }}<span class="companion-tab-audience">{{ panelEntry.audienceText }}</span></span>
					</v-tab>
					<v-tab v-if="isAdminViewer" :value="ADMIN_TAB_NAME" class="companion-tab" data-testid="companion-tab-admin">
						<span class="companion-tab-label">Administration<span class="companion-tab-audience">admin and super</span></span>
					</v-tab>
				</v-tabs>
				<v-alert v-if="isUnknownTabRequested" type="warning" variant="tonal" class="mt-3" data-testid="companion-unknown-tab">This page has no tab named '{{ requestedTabName }}'. Choose one above.</v-alert>
				<v-window v-if="openTabName" :model-value="openTabName" class="companion-window">
					<v-window-item v-for="panelEntry in shownPanelList" :key="panelEntry.panelName" :value="panelEntry.panelName" eager>
						<CompanionPagesCompanionPanelFrame :id="`companion-panel-${panelEntry.panelName}`" :panel-title="panelEntry.panelTitle" :audience-text="panelEntry.audienceText" :best-used-for-text="panelEntry.bestUsedForText" :panel-test-id="`companion-panel-${panelEntry.panelName}`">
							<component :is="panelEntry.panelComponent" v-bind="panelEntry.propsOf(compileAnswer)" />
						</CompanionPagesCompanionPanelFrame>
					</v-window-item>
					<v-window-item v-if="isAdminViewer" :value="ADMIN_TAB_NAME" eager>
						<CompanionPagesCompanionAdminPanel :page-record="pageRecord" @sources-changed="reloadPage" @page-saved="(savedPage) => savedPage.pageSlug === pageSlug && reloadPage()" />
					</v-window-item>
				</v-window>
			</template>
		</template>
	</div>
</template>

<style scoped>
.companion-page {
	max-width: 1400px;
	margin: 0 auto;
	padding: 24px clamp(16px, 3vw, 40px) 48px;
	color: #111827;
}
.companion-back {
	font-size: 14px;
	color: #072a6c;
	text-decoration: none;
}
.companion-heading {
	margin-top: 8px;
}
.companion-title {
	margin: 0;
	font-family: 'DM Serif Display', Georgia, serif;
	font-weight: 400;
	font-size: 34px;
	color: #072a6c;
}
.companion-summary {
	margin: 6px 0 0;
	max-width: 90ch;
	font-size: 15px;
	line-height: 1.5;
	color: #4b5563;
}
.companion-audience,
.companion-inactive {
	margin: 4px 0 0;
	font-size: 13px;
	color: #6b7280;
}
.companion-inactive {
	color: #9b1c1c;
}
.companion-external {
	margin-top: 16px;
}
.companion-tabs {
	margin-top: 16px;
	border-bottom: 1px solid #e3e7ef;
}
.companion-tab {
	text-transform: none;
	letter-spacing: normal;
	height: auto !important;
	padding-top: 6px;
	padding-bottom: 6px;
}
.companion-tab-label {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	font-weight: 700;
	font-size: 14px;
}
.companion-tab-audience {
	font-weight: 400;
	font-size: 12px;
	color: #6b7280;
}
.companion-window {
	margin-top: 8px;
}
</style>

<style>
/* shared by the companion panels (their own styles are scoped) */
.companion-table {
	width: 100%;
	border-collapse: collapse;
	font-size: 13.5px;
}
.companion-table th,
.companion-table td {
	text-align: left;
	vertical-align: top;
	padding: 8px 10px;
	border-top: 1px solid #eef1f6;
}
.companion-table thead th {
	border-top: none;
	font-size: 12px;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: #6b7280;
}
.companion-path-text {
	white-space: pre-line;
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	font-size: 12px;
	overflow-wrap: anywhere;
}
</style>
