<script setup>
// @concept: [[SpecificationViewer]]
// Explore → Standards → Specifications tab: the whole Specification Viewer (components/SpecificationViewer.vue), with its
// header and both ways in. /explore/specification-viewer and /explore/schema-verifier redirect here. The same viewer,
// opened on one standard, is the Standards Explorer's Schema Viewer view.

import SpecificationViewer from '@/components/SpecificationViewer.vue';

useHead({
	title: 'Specification Viewer',
	meta: [{ name: 'description', content: 'Pick an education data specification and walk its elements, with every element\'s cross-specification mappings; or load your own OpenAPI schema and map its fields.' }],
});
</script>

<template>
	<SpecificationViewer />
</template>
