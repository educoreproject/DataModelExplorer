<script setup>
// Phase 3 replaces this with the Cytoscape diagram; until then the diagram view says so and offers the table.
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
const store = useStandardsNeighbourhoodStore();
defineEmits(['drill']);
</script>

<template>
	<div class="diagram-pending" data-testid="diagram-pending">
		<span>The diagram is not built yet.</span>
		<v-btn size="small" variant="outlined" color="primary" @click="store.setViewModeChoice('table')">Show table</v-btn>
	</div>
</template>
