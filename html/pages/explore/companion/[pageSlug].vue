<script setup>
// @concept: [[CompanionPages]]
// Explore → a compiled companion page, /explore/companion/<pageSlug> (SPEC-companionPages-102826, Phase 4). The
// explorer's Companion pages cards link here.
//
// The page reads its registry record and its current compile (companionPageStore), always shows what the compile was
// built from (CompanionStampBar, with the out-of-date notice when the compile is not current), and then the panels its
// compiler's registry entry names (companionPanelRegistry.js), in that order. Admin and super users also see the
// administration panel (upload, source and compile history, add or edit page); after an upload or restore the page
// re-reads its compile, which recompiles from the new sources.

import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useLoginStore } from '@/stores/loginStore';
import { useCompanionPageStore } from '@/stores/companionPageStore';
import { companionPanelListByCompilerName } from '@/components/companionPages/companionPanelRegistry';

definePageMeta({ middleware: 'auth' });

const route = useRoute();
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
				<template v-else>
					<nav class="companion-lens-index" aria-label="Panels on this page">
						<a v-for="panelEntry in panelList" :key="panelEntry.panelName" :href="`#companion-panel-${panelEntry.panelName}`" class="companion-lens-link">{{ panelEntry.panelTitle }}<span class="companion-lens-audience">{{ panelEntry.audienceText }}</span></a>
					</nav>
					<CompanionPagesCompanionPanelFrame v-for="panelEntry in panelList" :id="`companion-panel-${panelEntry.panelName}`" :key="panelEntry.panelName" :panel-title="panelEntry.panelTitle" :audience-text="panelEntry.audienceText" :best-used-for-text="panelEntry.bestUsedForText" :panel-test-id="`companion-panel-${panelEntry.panelName}`">
						<component :is="panelEntry.panelComponent" v-bind="panelEntry.propsOf(compileAnswer)" />
					</CompanionPagesCompanionPanelFrame>
				</template>
			</template>

			<CompanionPagesCompanionAdminPanel v-if="isAdminViewer" :page-record="pageRecord" @sources-changed="reloadPage" @page-saved="(savedPage) => savedPage.pageSlug === pageSlug && reloadPage()" />
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
.companion-lens-index {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 16px;
}
.companion-lens-link {
	display: flex;
	flex-direction: column;
	border: 1px solid #e3e7ef;
	border-radius: 10px;
	padding: 8px 12px;
	background: #fbfcfe;
	text-decoration: none;
	font-weight: 700;
	font-size: 14px;
	color: #072a6c;
}
.companion-lens-link:hover {
	border-color: #072a6c;
}
.companion-lens-audience {
	font-weight: 400;
	font-size: 12px;
	color: #6b7280;
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
