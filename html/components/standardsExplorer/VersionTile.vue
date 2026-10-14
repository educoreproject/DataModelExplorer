<script setup>
// One version tile under the detail panel: the selected item as it stands in another version of its message.
// Quieter than the panel above it (context, not focus). Same, Different (with what differs, so two tiles never look
// identical under a "Different" badge), or "Not in <version>" alone. Open takes the walk to it in its own tree.

import { computed } from 'vue';
import { versionMemberNounOf, versionTileRelationByState } from '@/components/standardsExplorer/explorerVocabulary';

const props = defineProps({
	versionEntry: { type: Object, required: true },
	thisVersion: { type: String, required: true },
});
const emit = defineEmits(['open-counterpart']);

const counterpart = computed(() => props.versionEntry.counterpart);
const relation = computed(() => (counterpart.value ? versionTileRelationByState[counterpart.value.versionBadgeState] : null));

const valueTextOf = (fieldValue) => (fieldValue === null || fieldValue === undefined || fieldValue === '' ? 'none' : String(fieldValue));

// one sentence per difference, naming the versions rather than 'here' and 'there'
const differenceTextList = computed(() => {
	if (!counterpart.value) return [];
	const otherVersion = props.versionEntry.version;
	const memberNoun = versionMemberNounOf(counterpart.value.kind);
	return (counterpart.value.differenceList || []).flatMap((oneDifference) => {
		if (oneDifference.differenceKind === 'field') {
			return 'thisValue' in oneDifference
				? [`${oneDifference.fieldLabel}: ${valueTextOf(oneDifference.thisValue)} in ${props.thisVersion}, ${valueTextOf(oneDifference.counterpartValue)} in ${otherVersion}`]
				: [`Its ${oneDifference.fieldLabel} differs`];
		}
		if (oneDifference.differenceKind === 'members') {
			return [
				oneDifference.addedNameList.length ? `${memberNoun} only in ${props.thisVersion}: ${oneDifference.addedNameList.join(', ')}` : '',
				oneDifference.missingNameList.length ? `${memberNoun} only in ${otherVersion}: ${oneDifference.missingNameList.join(', ')}` : '',
				oneDifference.differingNameList.length ? `${memberNoun} defined differently: ${oneDifference.differingNameList.join(', ')}` : '',
			].filter(Boolean);
		}
		if (oneDifference.differenceKind === 'type') {
			return [oneDifference.counterpartTypeName ? `Its type ${oneDifference.typeName} is defined differently in ${otherVersion}` : `Its type ${oneDifference.typeName} is not in ${otherVersion}`];
		}
		return [`Its definition differs in a part this page does not show`];
	});
});
</script>

<template>
	<article class="version-tile" :data-relation="counterpart ? counterpart.versionBadgeState : 'absent'" data-testid="version-tile">
		<div class="version-tile-head">
			<span class="version-tile-version">In {{ versionEntry.version }}</span>
			<span v-if="relation" class="version-tile-relation" :style="relation.badgeStyle" data-testid="version-tile-relation">{{ relation.relationText }}</span>
		</div>

		<p v-if="!counterpart" class="version-tile-absent" data-testid="version-tile-absent">Not in {{ versionEntry.version }}.</p>

		<template v-else>
			<h3 class="version-tile-name">{{ counterpart.name }}</h3>
			<p v-if="counterpart.description" class="version-tile-definition">{{ counterpart.description }}</p>

			<div v-if="counterpart.mappingList.length" class="version-tile-mappings">
				<div v-for="oneMapping in counterpart.mappingList" :key="`${oneMapping.matchKind}-${oneMapping.anchor.stableId}`" class="version-tile-mapping">
					<span class="version-tile-target">{{ oneMapping.anchor.name }}</span>
					<StandardsExplorerMatchSummary :match-kind="oneMapping.matchKind" :mapping-confidence="oneMapping.mappingConfidence" />
					<span v-if="oneMapping.occurrenceCount > 1" class="version-tile-note">on {{ oneMapping.occurrenceCount }} occurrences</span>
				</div>
			</div>
			<p v-else-if="counterpart.kind === 'property' || counterpart.kind === 'instance'" class="version-tile-note">Not mapped to CEDS.</p>

			<ul v-if="differenceTextList.length" class="version-tile-differences" data-testid="version-tile-differences">
				<li v-for="differenceText in differenceTextList" :key="differenceText">{{ differenceText }}</li>
			</ul>

			<button type="button" class="version-tile-open" data-testid="version-tile-open" @click="emit('open-counterpart', versionEntry)">Open in {{ versionEntry.version }} ›</button>
		</template>
	</article>
</template>

<style scoped>
.version-tile {
	border: 1px solid #e3e7ef;
	border-radius: 10px;
	padding: 12px;
	display: flex;
	flex-direction: column;
	gap: 8px;
	background: #fbfcfe;
	font-size: 14px;
}
.version-tile[data-relation='changed'] {
	border-left: 3px solid #b26a00;
}
.version-tile-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}
.version-tile-version {
	font-size: 12px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: #6b7280;
}
.version-tile-relation {
	display: inline-block;
	border-radius: 999px;
	padding: 1px 8px;
	font-size: 12px;
	font-weight: 700;
}
.version-tile-absent {
	margin: 0;
	color: #4b5563;
}
.version-tile-name {
	margin: 0;
	font-family: 'DM Serif Display', Georgia, serif;
	font-weight: 400;
	font-size: 18px;
	line-height: 1.2;
	color: #072a6c;
	overflow-wrap: anywhere;
}
.version-tile-definition {
	margin: 0;
	line-height: 1.45;
	color: #374151;
}
.version-tile-mappings {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.version-tile-mapping {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}
.version-tile-target {
	font-weight: 700;
}
.version-tile-note {
	margin: 0;
	font-size: 13px;
	color: #6b7280;
}
.version-tile-differences {
	margin: 0;
	padding-left: 18px;
	color: #8a5200;
	font-size: 13px;
	line-height: 1.45;
}
.version-tile-open {
	align-self: flex-start;
	background: none;
	border: none;
	padding: 0;
	color: #072a6c;
	font-weight: 600;
	font-size: 13px;
	cursor: pointer;
}
.version-tile-open:hover {
	text-decoration: underline;
}
</style>
