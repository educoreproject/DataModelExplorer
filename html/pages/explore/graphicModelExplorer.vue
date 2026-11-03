<script setup>
// @concept: [[DataModelExplorer]]
// Explore → Standards Explorer moved into the one standards view (pages/explore/standards.vue) as its Explorer tab. This route is kept for
// its links: it sends a visitor to /explore/standards with the query it carried, so every shared link still lands on its screen.

definePageMeta({
	middleware: [(to) => navigateTo({ path: '/explore/standards', query: to.query, hash: to.hash }, { replace: true })],
});
</script>

<template>
	<div data-testid="standards-explorer-redirect" />
</template>
