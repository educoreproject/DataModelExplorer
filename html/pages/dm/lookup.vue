<script setup>
// @concept: [[DataModelExplorer]]
// dm/lookup.vue — Lookup Browser page under Data Models

definePageMeta({ middleware: 'auth' });

const activeTab = 'lookup';
</script>

<template>
	<div>
		<SubPageNav :model-value="activeTab" :tabs="[{ label: 'Explore', value: 'explore', to: '/dm/explorer' }, { label: 'Lookup', value: 'lookup', to: '/dm/lookup' }]" />
		<LookupBrowser />
	</div>
</template>
