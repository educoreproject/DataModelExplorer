<script setup>
// RaterElementPanel — the element being rated, on its standard's tint (design: the rater's only cue to which standard
// they are reading, so the tint, chip and name colour change per item). Revision 10: it sits in the rating screen's left
// column under the finder buttons, and that column is what sticks at >= 1100px (rt-stick), stacked above the list below.
// Absent texts are said, never filled in: "No definition published by <standard>".
// Revision 17: the "How to answer" box ends in a "How to rate" call to action, a pill in the family ink (its fills are
// mixed from the ink in the scoped style, so the three families need no colours of their own beyond the registry's).
// Revision 18: the bullets are TQ's own five sentences from /rater/instructions, word for word (WORKORDER-RATER18; TQ:
// "do it"). They are shorter than the page's lines, so they are kept here literally, and raterBackKeepsPlace.spec.mjs
// checks that every sentence of each is in the page's text. Do not reword them here. How to rate goes to howToRateRoute,
// which on a rater's own item carries that item, so the instructions page's "Back to rating" returns to it.
import { computed } from 'vue';

// howToRateRoute: a path, or a { path, query } route (the rating screen's mode decides which)
const props = defineProps({
	element: { type: Object, required: true },
	howToRateRoute: { type: [String, Object], required: true },
});

// the standard family colours (design Vocabulary): ink, tint, rule
const FAMILY_STYLE_BY_STANDARD = Object.freeze({
	'Ed-Fi': { ink: '#1E7A4C', tint: '#E6F4EC', rule: '#BFE0CC' },
	SIF: { ink: '#6B3FA0', tint: '#F1EBF8', rule: '#D9CCEB' },
	PESC: { ink: '#072A6C', tint: '#E7ECF6', rule: '#C9D3E8' },
});

const familyStyle = computed(() => FAMILY_STYLE_BY_STANDARD[props.element.standard] || FAMILY_STYLE_BY_STANDARD.PESC);
</script>

<template>
	<aside aria-label="The element you are rating" class="rt-element" :style="{ background: familyStyle.tint }" data-testid="rater-element-panel" :data-standard="props.element.standard">
		<div class="rt-element-top">
			<span class="rt-family-chip" :style="{ background: familyStyle.ink }">{{ props.element.standard }} element</span>
			<span class="rt-element-type">type: <b>{{ props.element.dataTypeText }}</b></span>
		</div>
		<h2 class="rt-serif rt-element-name" :style="{ color: familyStyle.ink }" data-testid="rater-element-name">{{ props.element.name }}</h2>
		<p class="rt-element-definition" :class="{ 'rt-absent': !props.element.definition }">{{ props.element.definition || props.element.definitionAbsentReason }}</p>
		<dl class="rt-element-facts" :style="{ borderTop: `1px solid ${familyStyle.rule}` }">
			<dt>Owned by</dt>
			<dd><b>{{ props.element.ownerName }}</b><br /><span :class="{ 'rt-absent': !props.element.ownerDefinition }">{{ props.element.ownerDefinition || props.element.ownerDefinitionAbsentReason }}</span></dd>
			<dt>Path</dt>
			<dd class="rt-mono rt-element-path">{{ props.element.path }}</dd>
			<template v-if="props.element.memberCount > 1">
				<dt>Also at</dt>
				<dd>{{ props.element.memberCount - 1 }} more place(s) in {{ props.element.standard }} with the same name, definition and type</dd>
			</template>
			<template v-if="props.element.optionSetName">
				<dt>Codes</dt>
				<dd>{{ props.element.optionSetName }}<span v-if="props.element.optionValueSampleList.length">: {{ props.element.optionValueSampleList.join('; ') }}</span></dd>
			</template>
		</dl>
		<a v-if="props.element.documentationUrl" :href="props.element.documentationUrl" target="_blank" rel="noopener" class="rt-element-doc" :style="{ color: familyStyle.ink }">{{ props.element.standard }} documentation for {{ props.element.name }} ↗</a>
		<span v-else class="rt-element-doc-absent">{{ props.element.subStandardName }}: no documentation link is recorded for this element.</span>
		<details class="rt-how" :style="{ borderTop: `1px solid ${familyStyle.rule}` }">
			<summary>How to answer</summary>
			<ul>
				<li><b>Best:</b> the card that fits best. One per element.</li>
				<li><b>Same:</b> optional. Any other card that is just as right.</li>
				<li><b>No match in CEDS:</b> nothing in CEDS means the same thing. This is a real answer.</li>
				<li><b>Unsure:</b> you cannot decide. Say why in the note.</li>
				<li><b>The class matters.</b> Choose the class that matches what owns the element in its own standard.</li>
			</ul>
			<NuxtLink :to="props.howToRateRoute" class="rt-how-to-rate" :style="{ '--rt-family-ink': familyStyle.ink }" data-testid="rater-how-to-rate">How to rate<span aria-hidden="true" class="rt-how-to-rate-arrow">→</span></NuxtLink>
		</details>
	</aside>
</template>

<style scoped>
.rt-element { min-width: 0; border-radius: 12px; padding: 18px; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; }
.rt-element-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.rt-family-chip { border-radius: 999px; padding: 3px 12px; font-size: 13px; font-weight: 700; color: #FFFFFF; }
.rt-element-type { font-size: 13px; color: #4B5563; }
.rt-element-type b { color: #111827; }
.rt-element-name { margin: 0; font-size: 32px; line-height: 1.1; overflow-wrap: anywhere; }
.rt-element-definition { margin: 0; font-size: 17px; line-height: 1.5; color: #111827; }
.rt-absent { font-style: italic; color: #4B5563 !important; }
.rt-element-facts { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 12px; font-size: 14px; line-height: 1.45; padding-top: 12px; }
.rt-element-facts dt { color: #4B5563; }
.rt-element-facts dd { margin: 0; color: #374151; min-width: 0; overflow-wrap: anywhere; }
.rt-element-path { font-size: 13px; overflow-wrap: anywhere; }
.rt-element-doc { align-self: flex-start; font-size: 14px; font-weight: 600; }
.rt-element-doc-absent { font-size: 13px; color: #4B5563; }
.rt-how { padding-top: 10px; font-size: 14px; color: #374151; }
.rt-how summary { cursor: pointer; font-weight: 700; color: #072A6C; min-height: 32px; display: list-item; }
.rt-how ul { margin: 8px 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; line-height: 1.45; }
.rt-how-to-rate { display: inline-flex; align-items: center; gap: 8px; margin-top: 14px; min-height: 40px; padding: 0 18px; box-sizing: border-box; border: 1.5px solid var(--rt-family-ink); border-radius: 999px; background: color-mix(in srgb, var(--rt-family-ink) 6%, #FFFFFF); color: var(--rt-family-ink); font-size: 15px; font-weight: 700; text-decoration: none; transition: background-color 120ms ease; }
.rt-how-to-rate:hover,
.rt-how-to-rate:focus-visible { background: color-mix(in srgb, var(--rt-family-ink) 18%, #FFFFFF); color: var(--rt-family-ink); }
.rt-how-to-rate-arrow { font-size: 17px; line-height: 1; transition: transform 120ms ease; }
.rt-how-to-rate:hover .rt-how-to-rate-arrow { transform: translateX(3px); }
@media (max-width: 700px) { .rt-how-to-rate { min-height: 44px; } }
@media (prefers-reduced-motion: reduce) { .rt-how-to-rate, .rt-how-to-rate-arrow { transition: none; } }
</style>
