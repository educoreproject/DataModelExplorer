<script setup>
// @concept: [[DataModelExplorer]]
// Explore → Specification Viewer moved into the one standards view (pages/explore/standards.vue) as its Specifications tab. This route is kept for
// its links: it sends a visitor to /explore/standards/specifications with the query it carried, so every shared link still lands on its screen.

definePageMeta({
	middleware: [(to) => navigateTo({ path: '/explore/standards/specifications', query: to.query, hash: to.hash }, { replace: true })],
});
</script>

<template>
	<div data-testid="specification-viewer-redirect" />
</template>
