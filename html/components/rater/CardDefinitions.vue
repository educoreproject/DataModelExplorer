<script setup>
// RaterCardDefinitions — the definitions on a CEDS card's face, class first, then property, because a card is a
// property IN a class and the class is what tells apart cards that share a property name (revision 9, TQ's design).
// Each is a RaterDefinitionLine, led by a bold level label, Class: or Property:, not the name again (the title above
// already names both; TQ, 2026-10-16), and read as a pair: same size, weight and colour, neither muted. Each is clamped
// to two lines when long, with its own show-all / show-less control. An empty property definition reads
// "Property: (none in CEDS)", the parenthesis in italic (revision 11). Used by RaterCandidateRow and the Finder's search
// results, so a card reads the same wherever it appears. Revision 15: inside a property group the Property line, the
// same on every card of the group, is gray ('repeated' tone), so the Class line that tells the cards apart stands out
// (TQ, 2026-10-18: both lines on every card, the repeated one gray).
// Props: card (a rater card: className, classDefinition, propertyName, definition); propertyToneName ('full', or
// 'repeated' for a card inside a property group). No events, no store, no API call.
const props = defineProps({
	card: { type: Object, required: true },
	propertyToneName: { type: String, required: true },
});

const CLASS_TEST_ID_BY_PART = { line: 'rater-card-class-definition', toggle: 'rater-class-definition-toggle', absent: 'rater-card-class-absent' };
const PROPERTY_TEST_ID_BY_PART = { line: 'rater-card-element-definition', toggle: 'rater-definition-toggle', absent: 'rater-card-property-absent' };
</script>

<template>
	<RaterDefinitionLine level-name="class" tone-name="full" :definition-text="props.card.classDefinition || ''" :test-id-by-part="CLASS_TEST_ID_BY_PART" />
	<RaterDefinitionLine level-name="property" :tone-name="props.propertyToneName" :definition-text="props.card.definition || ''" :test-id-by-part="PROPERTY_TEST_ID_BY_PART" />
</template>
