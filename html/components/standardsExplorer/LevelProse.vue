<script setup>
// ⟪meaningsClarity Addendum B, TQ 2026-11-11⟫ What the diagram shows, in a few plain sentences written from this level's own counts and names (explorerVocabulary's
// levelProseOf): the same numbers the diagram's labels and the table's counts show. WalkView puts it above the level's view, so on a phone it reads first.

import { computed } from 'vue';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { levelProseOf } from '@/components/standardsExplorer/explorerVocabulary';

const store = useStandardsNeighbourhoodStore();

const levelProse = computed(() =>
	levelProseOf({ focusNode: store.focusNode, levelRowList: store.levelRowList, filterText: store.filterText, filterUnmatchedRowCount: store.filterUnmatchedRowCount, effectiveViewMode: store.effectiveViewMode }),
);
</script>

<template>
	<p v-if="levelProse.sentenceList.length" class="level-prose" data-testid="level-prose">{{ levelProse.sentenceList.join(' ') }}</p>
</template>

<style scoped>
.level-prose {
	overflow-wrap: anywhere;
	margin: 0 0 10px;
	font-size: 14px;
	line-height: 1.5;
	color: #374151;
}
</style>
