<script setup>
// RaterCardDefinitions — the two definitions on a CEDS card's face, class first, then element, because a card is an
// element IN a class and the class is what tells apart cards that share an element name (revision 9, TQ's design).
// Each is led by a bold level label, Class: or Property:, not the name again (the title above already names both;
// TQ, 2026-10-16), and read as a pair: same size, weight and colour, neither muted. Each is clamped to
// two lines when long, with its own show-all / show-less control. An empty property definition reads
// "Property: (none in CEDS)", the parenthesis in italic (revision 11). Used by RaterCandidateRow and the Finder's search
// results, so a card reads the same wherever it appears. Props: card (a rater card: className, classDefinition,
// propertyName, definition). No events, no store, no API call.
import { ref, computed } from 'vue';

const props = defineProps({
	card: { type: Object, required: true },
});

// a long definition is clamped to two lines (details on demand, so the list stays scannable); one click shows it all
const LONG_DEFINITION_LENGTH = 200;
// the level labels match the list's column header, CLASS → PROPERTY
const CLASS_LABEL_TEXT = 'Class';
const PROPERTY_LABEL_TEXT = 'Property';
const ABSENT_CLASS_DEFINITION_TEXT = 'No class definition in CEDS.';
// an empty property definition says so in italic after its label (revision 11, TQ's words)
const ABSENT_PROPERTY_DEFINITION_TEXT = '(none in CEDS)';
const classDefinitionText = computed(() => props.card.classDefinition || ABSENT_CLASS_DEFINITION_TEXT);
const classDefinitionIsLong = computed(() => (props.card.classDefinition || '').length > LONG_DEFINITION_LENGTH);
const classDefinitionOpen = ref(false);
const definitionIsLong = computed(() => (props.card.definition || '').length > LONG_DEFINITION_LENGTH);
const definitionOpen = ref(false);
</script>

<template>
	<p class="rt-card-definition" :class="{ 'rt-clamped': classDefinitionIsLong && !classDefinitionOpen }" data-testid="rater-card-class-definition"><b>{{ CLASS_LABEL_TEXT }}:</b> {{ classDefinitionText }}</p>
	<button v-if="classDefinitionIsLong" type="button" class="rt-definition-toggle" :aria-expanded="classDefinitionOpen" data-testid="rater-class-definition-toggle" @click="classDefinitionOpen = !classDefinitionOpen">{{ classDefinitionOpen ? 'Show less' : 'Show the whole class definition' }}</button>
	<p class="rt-card-definition" :class="{ 'rt-clamped': definitionIsLong && !definitionOpen }" data-testid="rater-card-element-definition"><b>{{ PROPERTY_LABEL_TEXT }}:</b> <template v-if="props.card.definition">{{ props.card.definition }}</template><i v-else data-testid="rater-card-property-absent">{{ ABSENT_PROPERTY_DEFINITION_TEXT }}</i></p>
	<button v-if="definitionIsLong" type="button" class="rt-definition-toggle" :aria-expanded="definitionOpen" data-testid="rater-definition-toggle" @click="definitionOpen = !definitionOpen">{{ definitionOpen ? 'Show less' : 'Show the whole definition' }}</button>
</template>

<style scoped>
.rt-card-definition { margin: 4px 0 0; font-size: 15px; line-height: 1.45; color: #1F2937; }
.rt-card-definition b { font-weight: 700; color: #111827; }
.rt-clamped { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rt-definition-toggle { display: block; border: 0; background: transparent; padding: 0; font: inherit; font-size: 13px; font-weight: 600; color: #072A6C; text-decoration: underline; cursor: pointer; }
</style>
