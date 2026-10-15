<script setup>
// /rater/admin — moved (WORKORDER-RATER6). The rater admin lives in the main admin page's CEDS Rater tab
// (components/tools/ceds-rater-admin.vue); this URL redirects there so old links and bookmarks still land on it. /admin's
// own middleware sends anyone not logged in on the main site through its login first.
definePageMeta({
	layout: false,
	middleware: [() => navigateTo({ path: '/admin', query: { tool: 'ceds-rater' } }, { replace: true })],
});
</script>

<template>
	<div />
</template>
