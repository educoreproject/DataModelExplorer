<script setup>
// The version badge: "Changed" and "New in 1.8" are noticeable; unchanged is nearly invisible.

import { computed } from 'vue';
import { versionBadgeStyleByState, versionBadgeTextOf } from '@/components/standardsExplorer/explorerVocabulary';

const props = defineProps({
	versionBadge: { type: Object, required: true },
});

const badgeStyle = computed(() => versionBadgeStyleByState[props.versionBadge.badgeState]);
</script>

<template>
	<span class="version-badge" :data-badge-state="versionBadge.badgeState" :style="badgeStyle" :title="`compared with ${versionBadge.comparedVersion}`">
		{{ versionBadgeTextOf(versionBadge) }}
	</span>
</template>

<style scoped>
.version-badge {
	display: inline-block;
	border-radius: 999px;
	padding: 1px 8px;
	font-size: 12px;
	font-weight: 700;
	white-space: nowrap;
}
.version-badge[data-badge-state='unchanged'] {
	font-weight: 400;
}
</style>
