<script setup>
// /rater/admin/results — moved (WORKORDER-RATER6). Results is a view of the CEDS Rater tab in the main admin page
// (components/tools/ceds-rater-admin.vue); this URL redirects there so old links and bookmarks still land on it.
definePageMeta({
	layout: false,
	middleware: [() => navigateTo({ path: '/admin', query: { tool: 'ceds-rater', view: 'results' } }, { replace: true })],
});
</script>

<template>
	<div />
</template>
