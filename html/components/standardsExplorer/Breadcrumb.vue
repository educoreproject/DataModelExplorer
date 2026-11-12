<script setup>
// The walk so far, each crumb a link (an href to that point of the walk), with its family's colour. A long walk keeps its first two and last three
// crumbs and folds the middle into one '…' that names what it hides.

import { computed } from 'vue';
import { explorerComponentWords, familyStyleOf, wordingOf } from '@/components/standardsExplorer/explorerVocabulary';

const crumbWords = explorerComponentWords.breadcrumb;
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';

const props = defineProps({
	crumbList: { type: Array, required: true },
});
const store = useStandardsNeighbourhoodStore();

// the walk up to and including a crumb, as a link
const crumbLinkOf = (oneCrumb) => store.walkLinkOf(store.pathStableIdList.slice(0, oneCrumb.pathIndex + 1));

const FOLD_ABOVE_CRUMB_COUNT = 6;

const shownCrumbList = computed(() => {
	if (props.crumbList.length <= FOLD_ABOVE_CRUMB_COUNT) return props.crumbList;
	const hiddenCrumbList = props.crumbList.slice(2, -3);
	return [
		...props.crumbList.slice(0, 2),
		{ stableId: 'folded', isFold: true, displayName: '…', titleText: hiddenCrumbList.map((oneCrumb) => oneCrumb.displayName).join(' › '), pathIndex: hiddenCrumbList[hiddenCrumbList.length - 1].pathIndex },
		...props.crumbList.slice(-3),
	];
});

const lastPathIndex = computed(() => props.crumbList.length - 1);
// TQ 2026-11-12: a walk may name a crumb by what its level lists ('CEDS Domains', 'Adult Education Course Meanings'); a fold keeps its own words
const crumbTextOf = (oneCrumb) => {
	const crumbTemplate = !oneCrumb.isFold && store.walkProfile.crumbTemplateByKind[oneCrumb.kind];
	return crumbTemplate ? wordingOf(crumbTemplate, { crumbName: oneCrumb.displayName }) : oneCrumb.displayName;
};
</script>

<template>
	<nav :aria-label="crumbWords.navLabelText" class="crumb-bar" data-testid="breadcrumb">
		<ol class="crumb-list">
			<li v-for="(oneCrumb, crumbIndex) in shownCrumbList" :key="`${oneCrumb.stableId}-${crumbIndex}`" class="crumb-item">
				<span v-if="crumbIndex > 0" aria-hidden="true" class="crumb-divider">›</span>
				<NuxtLink
					:to="crumbLinkOf(oneCrumb)"
					class="crumb-button"
					:class="{ 'crumb-current': oneCrumb.pathIndex === lastPathIndex && !oneCrumb.isFold }"
					:aria-current="oneCrumb.pathIndex === lastPathIndex && !oneCrumb.isFold ? 'page' : undefined"
					:title="oneCrumb.titleText || oneCrumb.displayName"
					:aria-label="oneCrumb.isFold ? wordingOf(crumbWords.foldLabelTemplate, { titleText: oneCrumb.titleText }) : undefined"
					:data-testid="`crumb-${crumbIndex}`"
				>
					<span v-if="!oneCrumb.isFold" aria-hidden="true" class="crumb-dot" :style="{ background: familyStyleOf(oneCrumb.standardFamily).fill || familyStyleOf(oneCrumb.standardFamily).color }" />
					{{ crumbTextOf(oneCrumb) }}
				</NuxtLink>
			</li>
		</ol>
	</nav>
</template>

<style scoped>
.crumb-bar {
	background: #ffffff;
	border: 1px solid #e3e7ef;
	border-radius: 10px;
	padding: 8px 12px;
	margin-bottom: 12px;
}
.crumb-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px;
}
.crumb-item {
	display: flex;
	align-items: center;
	gap: 4px;
}
.crumb-divider {
	color: #9ca3af;
	padding: 0 4px;
}
.crumb-button {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-height: 36px;
	padding: 0 10px;
	border: 0;
	border-radius: 8px;
	font: inherit;
	font-size: 14px;
	cursor: pointer;
	background: transparent;
	color: #072a6c;
	text-decoration: none;
}
.crumb-button:hover {
	background: #f3f5fa;
}
.crumb-current {
	background: #e7ecf6;
	font-weight: 700;
}
.crumb-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
}
</style>
