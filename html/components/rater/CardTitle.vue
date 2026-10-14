<script setup>
// RaterCardTitle — a CEDS card's title for scanning (design rule 4): the class in CEDS teal, a real button that opens
// Browse on that class → the property, bold → the qualifier as a boxed chip. No number, score or rank ever appears.
const props = defineProps({
	card: { type: Object, required: true },
	classIsButton: { type: Boolean, default: true },
});
const emit = defineEmits(['browse-class']);
</script>

<template>
	<div class="rt-card-title">
		<button v-if="props.classIsButton" type="button" class="rt-class-button" title="Browse this class" data-testid="rater-card-class" @click="emit('browse-class', props.card)">{{ props.card.className }}</button>
		<span v-else class="rt-class-text">{{ props.card.className }}</span>
		<span aria-hidden="true" class="rt-arrow">→</span>
		<span class="rt-property">{{ props.card.propertyName }}</span>
		<span v-for="qualifierName in props.card.qualifierNameList" :key="qualifierName" class="rt-qualifier">{{ qualifierName }}</span>
		<slot />
	</div>
</template>

<style scoped>
.rt-card-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.rt-class-button { border: 0; background: transparent; padding: 0; font: inherit; font-size: 16px; font-weight: 600; color: #00797C; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.rt-class-text { font-size: 16px; font-weight: 600; color: #00797C; }
.rt-arrow { color: #6B7280; font-weight: 700; }
.rt-property { font-size: 17px; font-weight: 700; color: #111827; }
</style>
