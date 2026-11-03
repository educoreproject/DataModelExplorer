<script setup>
// @concept: [[DataModelExplorer]]
// Explore → Schema Verifier moved into the one standards view (pages/explore/standards.vue) as its Schema tab. This route is kept for
// its links: it sends a visitor to /explore/standards/schema with the query it carried, so every shared link still lands on its screen.

definePageMeta({
	middleware: [(to) => navigateTo({ path: '/explore/standards/schema', query: to.query, hash: to.hash }, { replace: true })],
});
</script>

<template>
	<div data-testid="schema-verifier-redirect" />
</template>
