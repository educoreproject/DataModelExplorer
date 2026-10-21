<script setup>
// A node kind as a small swatch plus its name: the table's and the panel's echo of the diagram's shapes.

import { computed } from 'vue';
import { familyStyleOf, kindDisplayNameOf } from '@/components/standardsExplorer/explorerVocabulary';

const props = defineProps({
	nodeKind: { type: String, required: true },
	standardFamily: { type: String, default: null },
	hubName: { type: String, default: null },
	isUnmapped: { type: Boolean, default: false },
});

const swatchStyle = computed(() => {
	const familyStyle = familyStyleOf(props.standardFamily);
	const swatchByKind = {
		familyCatalog: { background: '#072A6C', borderRadius: '50%' },
		family: { background: familyStyle.color, borderRadius: '50%' },
		release: { background: '#FFFFFF', border: `3px solid ${familyStyle.color}`, borderRadius: '50%' },
		standard: { background: '#FFFFFF', border: `3px solid ${familyStyle.color}`, borderRadius: '50%' },
		class: { background: familyStyle.tint, border: `2px solid ${familyStyle.color}`, borderRadius: '50%' },
		property: props.isUnmapped ? { background: '#EEF0F3', borderRadius: '50%' } : { background: '#FFFFFF', border: `2px solid ${familyStyle.color}`, borderRadius: '50%' },
		instance: { background: '#EEF0F4', border: '1px solid #9CA3AF', borderRadius: '50%' },
		optionSet: { background: '#FFF4E0', border: '1px solid #B26A00', borderRadius: '2px 7px 7px 2px' },
		optionValue: { background: '#FFF4E0', border: '1px solid #B26A00', borderRadius: '2px' },
		// a hub's own kinds in its family's colours (the hub's family is the row's standardFamily)
		hubAnchor: { background: familyStyle.fill || familyStyle.color, clipPath: 'polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0 50%)' },
		hubProperty: { background: familyStyle.tint, border: `1px solid ${familyStyle.color}`, borderRadius: '50%' },
		hubDomain: { background: familyStyle.tint, border: `1px solid ${familyStyle.color}`, borderRadius: '4px' },
		standardGroup: { background: familyStyle.tint, border: `2px solid ${familyStyle.color}`, borderRadius: '50%' },
		support: { background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '4px' },
	};
	return swatchByKind[props.nodeKind] || { background: '#F3F4F6', border: '1px dashed #9CA3AF', borderRadius: '4px' };
});
</script>

<template>
	<span class="kind-chip">
		<span aria-hidden="true" class="kind-swatch" :style="swatchStyle" />
		{{ kindDisplayNameOf(nodeKind, hubName) }}
	</span>
</template>

<style scoped>
.kind-chip {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	color: #4b5563;
	font-size: 13px;
}
.kind-swatch {
	width: 14px;
	height: 14px;
	flex: none;
	box-sizing: border-box;
}
</style>
