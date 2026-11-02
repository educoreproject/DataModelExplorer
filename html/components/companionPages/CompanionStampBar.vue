<script setup>
// What a compiled companion page was built from, always shown (SPEC-companionPages-102826, "Freshness"): the golden's
// name, its graph contract, the compile date and compiler version, and each source's file name and document date. When
// the compile is not current, a plain notice says the page is out of date, which stamps differ, and why the recompile
// did not happen.

import { computed } from 'vue';

const props = defineProps({
	compileAnswer: { type: Object, required: true },
});

const STAMP_DISPLAY_NAME_BY_NAME = { graphName: 'golden graph', graphContractSha256: 'graph contract', sourceSetSha256: 'source documents', compilerVersion: 'compiler version' };

const compileRecord = computed(() => props.compileAnswer.compileRecord);
const sourceList = computed(() => [...props.compileAnswer.payload.sourceList].sort((left, right) => `${left.sourceRole}\t${left.sourcePart}`.localeCompare(`${right.sourceRole}\t${right.sourcePart}`, undefined, { numeric: true })));
const staleStampText = computed(() => props.compileAnswer.staleStampList.map((staleStamp) => STAMP_DISPLAY_NAME_BY_NAME[staleStamp.stampName] || staleStamp.stampName).join(', '));
const compiledAtText = computed(() => new Date(compileRecord.value.compiledAt).toLocaleString());
</script>

<template>
	<div class="stamp-bar" data-testid="companion-stamps">
		<v-alert v-if="!compileAnswer.isCurrent" type="warning" variant="tonal" density="compact" class="mb-3" data-testid="companion-out-of-date">
			This page is out of date. It shows the last good build, made {{ compiledAtText }}<template v-if="staleStampText">; since then the {{ staleStampText }} changed</template>. It could not be rebuilt: {{ compileAnswer.recompileErrorText || 'no reason was given' }}
		</v-alert>
		<p class="stamp-line">
			Built from golden <code data-testid="companion-stamp-golden">{{ compileRecord.graphName }}</code> · graph contract <code :title="compileRecord.graphContractSha256">{{ compileRecord.graphContractSha256.slice(0, 12) }}</code> · compiled <span data-testid="companion-stamp-compiled">{{ compiledAtText }}</span> · {{ compileRecord.compilerVersion }}
		</p>
		<ul class="stamp-source-list" data-testid="companion-stamp-sources">
			<li v-for="sourceRecord in sourceList" :key="sourceRecord.refId" :data-testid="`companion-stamp-source-${sourceRecord.sourceRole}-${sourceRecord.sourcePart || 'whole'}`">
				<span class="stamp-source-role">{{ [sourceRecord.sourceRole, sourceRecord.sourcePart].filter(Boolean).join(' ') }}</span>
				{{ sourceRecord.fileName }} · dated {{ sourceRecord.documentDate }}
			</li>
		</ul>
	</div>
</template>

<style scoped>
.stamp-bar {
	margin-top: 10px;
	font-size: 13px;
	color: #6b7280;
}
.stamp-line {
	margin: 0;
	overflow-wrap: anywhere;
}
.stamp-source-list {
	margin: 6px 0 0;
	padding: 0;
	list-style: none;
	columns: 2 420px;
	column-gap: 24px;
	font-size: 12.5px;
}
.stamp-source-role {
	font-weight: 700;
	color: #4b5563;
}
</style>
