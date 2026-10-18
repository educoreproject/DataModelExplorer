<script setup>
// RaterDefinitionLine — one CEDS definition line, led by its bold level label (Class: or Property:), clamped to two
// lines when long, with its own show-all / show-less control. The one place a definition line is drawn (revision 15):
// a card's face (RaterCardDefinitions, both levels) and a property group's lead (RaterRatingScreen, Property only)
// use it, so the two read alike. What differs between the levels is data, DEFINITION_LEVEL_BY_NAME: the label, the
// notice for an empty definition (the Property notice is italic, revision 11) and the control's words.
// Props: levelName ('class' | 'property'; anything else throws by name), definitionText (the CEDS text; '' when CEDS
// has none), testIdByPart ({ line, toggle, absent }: the host's data-testids, so each host keeps its own). No events,
// no store, no API call.
import { ref, computed } from 'vue';

const props = defineProps({
	levelName: { type: String, required: true },
	definitionText: { type: String, required: true },
	testIdByPart: { type: Object, required: true },
});

// a long definition is clamped to two lines (details on demand, so the list stays scannable); one click shows it all
const LONG_DEFINITION_LENGTH = 200;
// the level labels match the list's column header, CLASS → PROPERTY
const DEFINITION_LEVEL_BY_NAME = {
	class: { labelText: 'Class', absentText: 'No class definition in CEDS.', absentIsItalic: false, toggleOpenText: 'Show the whole class definition' },
	property: { labelText: 'Property', absentText: '(none in CEDS)', absentIsItalic: true, toggleOpenText: 'Show the whole definition' },
};
const definitionLevel = DEFINITION_LEVEL_BY_NAME[props.levelName];
if (!definitionLevel) {
	throw new Error(`RaterDefinitionLine: unknown levelName '${props.levelName}' (known: ${Object.keys(DEFINITION_LEVEL_BY_NAME).join(', ')})`);
}
// every host names all three parts, so no line, control or notice goes untagged without anyone noticing
const TEST_ID_PART_NAME_LIST = ['line', 'toggle', 'absent'];
const missingPartNameList = TEST_ID_PART_NAME_LIST.filter((partName) => !props.testIdByPart[partName]);
if (missingPartNameList.length > 0) {
	throw new Error(`RaterDefinitionLine: testIdByPart has no ${missingPartNameList.join(', ')} (it needs ${TEST_ID_PART_NAME_LIST.join(', ')})`);
}
const definitionIsLong = computed(() => props.definitionText.length > LONG_DEFINITION_LENGTH);
const definitionOpen = ref(false);
</script>

<template>
	<p class="rt-definition-line" :class="{ 'rt-clamped': definitionIsLong && !definitionOpen }" :data-testid="props.testIdByPart.line"><b>{{ definitionLevel.labelText }}:</b> <template v-if="props.definitionText">{{ props.definitionText }}</template><i v-else-if="definitionLevel.absentIsItalic" :data-testid="props.testIdByPart.absent">{{ definitionLevel.absentText }}</i><template v-else>{{ definitionLevel.absentText }}</template></p>
	<button v-if="definitionIsLong" type="button" class="rt-definition-toggle" :aria-expanded="definitionOpen" :data-testid="props.testIdByPart.toggle" @click="definitionOpen = !definitionOpen">{{ definitionOpen ? 'Show less' : definitionLevel.toggleOpenText }}</button>
</template>

<style scoped>
.rt-definition-line { margin: 4px 0 0; font-size: 15px; line-height: 1.45; color: #1F2937; }
.rt-definition-line b { font-weight: 700; color: #111827; }
.rt-clamped { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rt-definition-toggle { display: block; border: 0; background: transparent; padding: 0; font: inherit; font-size: 13px; font-weight: 600; color: #072A6C; text-decoration: underline; cursor: pointer; }
</style>
