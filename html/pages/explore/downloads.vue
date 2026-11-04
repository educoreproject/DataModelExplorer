<script setup>
// @concept: [[DataModelExplorer]]
// Explore → Downloads moved into the one standards view (pages/explore/standards.vue) as its Downloads tab. This route is kept for
// its links: it sends a visitor to /explore/standards/downloads with the query it carried, so every shared link still lands on its screen.

definePageMeta({
	middleware: [(to) => navigateTo({ path: '/explore/standards/downloads', query: to.query, hash: to.hash }, { replace: true })],
});
</script>

<template>
	<div data-testid="downloads-redirect" />
</template>
