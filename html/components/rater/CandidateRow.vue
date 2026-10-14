<script setup>
// RaterCandidateRow — one card in the candidate list: Best (radio) and Same (checkbox) in two columns LEFT of the card
// (grid 56px 56px 1fr). Each control cell is a full-height label, so the whole column is the hit area. The radio is in
// the page's one Best group (name="best"), with No match and Unsure. Same is disabled until a card is Best, and always
// on the Best card (SPEC §3; the design's "Same before Best" is overruled by the spec, see DEVLOG-RATER).
import { ref, computed } from 'vue';

const props = defineProps({
	card: { type: Object, required: true },
	isBest: { type: Boolean, default: false },
	isSame: { type: Boolean, default: false },
	sameDisabled: { type: Boolean, default: true },
	isAdded: { type: Boolean, default: false },
	readOnly: { type: Boolean, default: false },
});
const emit = defineEmits(['pick-best', 'toggle-same', 'browse-class']);

const labelText = computed(() => `${props.card.className} → ${props.card.propertyName}${props.card.qualifierNameList.length ? ` (${props.card.qualifierNameList.join(', ')})` : ''}`);
const cardStateClass = computed(() => (props.isBest ? 'rt-card-best' : props.isSame ? 'rt-card-same' : 'rt-card-plain'));
// a long CEDS definition is clamped to two lines (details on demand, so the list stays scannable); one click shows it all
const LONG_DEFINITION_LENGTH = 200;
const definitionIsLong = computed(() => (props.card.definition || '').length > LONG_DEFINITION_LENGTH);
const definitionOpen = ref(false);
const sameTitle = computed(() => (props.isBest ? 'This is your Best' : props.sameDisabled ? 'Choose a Best card first' : 'Pretty much the same (as right as your Best)'));
</script>

<template>
	<div class="rt-row" data-testid="rater-candidate-row" :data-ceds-tuple-id="props.card.cedsTupleId">
		<label title="Best" class="rt-control-cell">
			<input type="radio" name="best" :aria-label="`Best: ${labelText}`" :checked="props.isBest" :disabled="props.readOnly" data-testid="rater-best-radio" @change="emit('pick-best', props.card)" />
		</label>
		<label :title="sameTitle" class="rt-control-cell" :class="{ 'rt-control-off': props.sameDisabled }">
			<input type="checkbox" :aria-label="`Pretty much the same: ${labelText}`" :checked="props.isSame" :disabled="props.sameDisabled || props.readOnly" data-testid="rater-same-checkbox" @change="emit('toggle-same', props.card, $event.target.checked)" />
		</label>
		<article class="rt-card" :class="cardStateClass">
			<RaterCardTitle :card="props.card" @browse-class="emit('browse-class', props.card)">
				<span class="rt-title-spacer"></span>
				<span v-if="props.isAdded" class="rt-chip rt-chip-added">Added by you</span>
				<span v-if="props.isBest" class="rt-chip rt-chip-best">Your Best</span>
				<span v-if="props.isSame" class="rt-chip rt-chip-same">Same as Best</span>
			</RaterCardTitle>
			<p class="rt-card-definition" :class="{ 'rt-clamped': definitionIsLong && !definitionOpen }">{{ props.card.definition }}</p>
			<button v-if="definitionIsLong" type="button" class="rt-definition-toggle" :aria-expanded="definitionOpen" @click="definitionOpen = !definitionOpen">{{ definitionOpen ? 'Show less' : 'Show the whole definition' }}</button>
			<div class="rt-card-foot">
				<span class="rt-mono" data-testid="rater-card-ceds-id">{{ props.card.cedsId ? `CEDS ID ${props.card.cedsId}` : 'CEDS ID not listed' }}</span>
				<a v-if="props.card.cedsUrl" :href="props.card.cedsUrl" target="_blank" rel="noopener" class="rt-ceds-link">ceds.ed.gov ↗</a>
				<details class="rt-more">
					<summary>More about this element</summary>
					<dl class="rt-more-list">
						<dt>Class</dt>
						<dd><b>{{ props.card.className }}</b>: {{ props.card.classDefinition || 'No class definition in CEDS.' }}</dd>
						<template v-if="props.card.optionSetName">
							<dt>Option set</dt>
							<dd>{{ props.card.optionSetName }}: {{ props.card.optionValueList.join('; ') }}</dd>
						</template>
					</dl>
				</details>
			</div>
		</article>
	</div>
</template>

<style scoped>
.rt-row { display: grid; grid-template-columns: 56px 56px minmax(0, 1fr); align-items: stretch; }
.rt-control-cell { display: flex; justify-content: center; align-items: flex-start; padding-top: 14px; cursor: pointer; }
.rt-control-off { cursor: not-allowed; }
.rt-card { border-radius: 10px; padding: 9px 14px; box-sizing: border-box; min-width: 0; line-height: 1.45; }
.rt-card-plain { background: #FFFFFF; border: 2px solid #DCE2EC; }
.rt-card-best { background: #E0F6F6; border: 2px solid #00797C; }
.rt-card-same { background: #F2FAFA; border: 2px solid #5FB7B9; }
.rt-title-spacer { flex: 1 1 auto; }
.rt-chip-added { background: #FFF6E8; color: #8A5200; border: 1px solid #F5C77E; }
.rt-chip-best { background: #00797C; color: #FFFFFF; }
.rt-chip-same { background: #FFFFFF; color: #005E61; border: 1.5px solid #00797C; }
.rt-card-definition { margin: 4px 0 0; font-size: 15px; line-height: 1.45; color: #1F2937; }
.rt-clamped { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rt-definition-toggle { border: 0; background: transparent; padding: 0; font: inherit; font-size: 13px; font-weight: 600; color: #072A6C; text-decoration: underline; cursor: pointer; }
.rt-card-foot { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 16px; margin-top: 4px; font-size: 13px; color: #4B5563; }
.rt-ceds-link { color: #00797C !important; font-weight: 600; }
.rt-more { flex: 1 1 260px; min-width: 0; }
.rt-more summary { cursor: pointer; color: #072A6C; font-weight: 600; width: max-content; }
.rt-more-list { margin: 6px 0 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 12px; font-size: 14px; color: #1F2937; }
.rt-more-list dt { color: #4B5563; }
.rt-more-list dd { margin: 0; }
</style>
