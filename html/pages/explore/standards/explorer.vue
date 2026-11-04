<script setup>
// @concept: [[DataModelExplorer]]
// The Standards view's Explorer tab lived here for a few days before it became the view's own page
// (pages/explore/standards/index.vue). This route is kept for its links: it sends a visitor there with the query it carried.

definePageMeta({
	middleware: [(to) => navigateTo({ path: '/explore/standards', query: to.query, hash: to.hash }, { replace: true })],
});
</script>

<template>
	<div data-testid="standards-explorer-tab-redirect" />
</template>
