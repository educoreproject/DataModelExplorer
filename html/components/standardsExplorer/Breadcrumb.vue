<script setup>
// The walk so far, each crumb clickable, with its family's colour. A long walk keeps its first two and last three
// crumbs and folds the middle into one '…' that names what it hides.

import { computed } from 'vue';
import { familyStyleOf } from '@/components/standardsExplorer/explorerVocabulary';

const props = defineProps({
	crumbList: { type: Array, required: true },
});
const emit = defineEmits(['go-to-crumb']);

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
</script>

<template>
	<nav aria-label="Breadcrumb" class="crumb-bar" data-testid="breadcrumb">
		<ol class="crumb-list">
			<li v-for="(oneCrumb, crumbIndex) in shownCrumbList" :key="`${oneCrumb.stableId}-${crumbIndex}`" class="crumb-item">
				<span v-if="crumbIndex > 0" aria-hidden="true" class="crumb-divider">›</span>
				<button
					type="button"
					class="crumb-button"
					:class="{ 'crumb-current': oneCrumb.pathIndex === lastPathIndex && !oneCrumb.isFold }"
					:aria-current="oneCrumb.pathIndex === lastPathIndex && !oneCrumb.isFold ? 'page' : undefined"
					:title="oneCrumb.titleText || oneCrumb.displayName"
					:data-testid="`crumb-${crumbIndex}`"
					@click="emit('go-to-crumb', oneCrumb.pathIndex)"
				>
					<span v-if="!oneCrumb.isFold" aria-hidden="true" class="crumb-dot" :style="{ background: familyStyleOf(oneCrumb.standardFamily).fill || familyStyleOf(oneCrumb.standardFamily).color }" />
					{{ oneCrumb.displayName }}
				</button>
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
