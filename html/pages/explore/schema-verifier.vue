<script setup>
// @concept: [[SpecificationViewer]]
// The page was called the Schema Verifier until 2026-10 and lived here.
// Bookmarks and shared links still arrive at /explore/schema-verifier, so this
// route forwards to /explore/specification-viewer, keeping any query string.

const route = useRoute();
await navigateTo({ path: '/explore/specification-viewer', query: route.query, hash: route.hash }, { replace: true });
</script>

<template>
	<div />
</template>
