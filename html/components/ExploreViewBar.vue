<script setup>
// @concept: [[DataModelExplorer]]
// An Explore view's title bar: the view's name as the page's h1, and whatever the view puts beside it (the Standards view's tabs). Shared by
// pages/explore/standards.vue and pages/explore/meanings.vue (⟪meaningsExplorer review S6⟫: the Meanings page had copied the Standards bar's markup and CSS).

defineProps({
	titleText: { type: String, required: true },
});
</script>

<template>
	<div class="explore-view-bar">
		<h1 class="explore-view-title">{{ titleText }}</h1>
		<slot />
	</div>
</template>

<style scoped>
.explore-view-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: 8px 24px;
	padding: 16px clamp(16px, 3vw, 40px) 0;
	background: var(--edu-surface, #fff);
	border-bottom: 1px solid #e3e7ef;
}
.explore-view-title {
	margin: 0 0 8px;
	font-family: 'DM Serif Display', Georgia, serif;
	font-weight: 400;
	font-size: 30px;
	color: #072a6c;
}
</style>
