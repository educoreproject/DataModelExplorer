<script setup>
// One version tile under the detail panel: the selected item as it stands in another version of its message.
// Quieter than the panel above it (context, not focus). Same, Different (with what differs, so two tiles never look
// identical under a "Different" badge), or "Not in <version>" alone. Open takes the walk to it in its own tree.

import { computed, ref, watch } from 'vue';
import { versionMemberNounOf, versionTileRelationByState } from '@/components/standardsExplorer/explorerVocabulary';

const props = defineProps({
	versionEntry: { type: Object, required: true },
	thisVersion: { type: String, required: true },
	thisOccurrenceCount: { type: Number, required: true },
});
const emit = defineEmits(['open-counterpart']);

const counterpart = computed(() => props.versionEntry.counterpart);

// a Same tile over a different number of occurrences: the comparison looks at the definition, never at the count
const occurrenceNoteText = computed(() => {
	if (!counterpart.value || counterpart.value.versionBadgeState !== 'unchanged') return '';
	const counterpartOccurrenceCount = Math.max(1, ...(counterpart.value.mappingList || []).map((oneMapping) => oneMapping.occurrenceCount || 1));
	if (counterpartOccurrenceCount === props.thisOccurrenceCount) return '';
	const timesTextOf = (occurrenceCount) => (occurrenceCount === 1 ? 'once' : `${occurrenceCount} times`);
	return `Defined the same way. It occurs ${timesTextOf(props.thisOccurrenceCount)} in ${props.thisVersion} and ${timesTextOf(counterpartOccurrenceCount)} in ${props.versionEntry.version}; occurrence counts are not compared.`;
});

const relation = computed(() => (counterpart.value ? versionTileRelationByState[counterpart.value.versionBadgeState] : null));

const valueTextOf = (fieldValue) => (fieldValue === null || fieldValue === undefined || fieldValue === '' ? 'none' : String(fieldValue));

// one entry per difference, naming the versions rather than 'here' and 'there': a bold title line and, below it,
// either a detail line (field values) or a name list (members), which folds past COLLAPSED_NAME_COUNT names
const COLLAPSED_NAME_COUNT = 3;

const differenceEntryList = computed(() => {
	if (!counterpart.value) return [];
	const otherVersion = props.versionEntry.version;
	const memberNoun = versionMemberNounOf(counterpart.value.kind);
	return (counterpart.value.differenceList || []).flatMap((oneDifference) => {
		if (oneDifference.differenceKind === 'field') {
			return 'thisValue' in oneDifference
				? [{ titleText: oneDifference.fieldLabel, detailText: `${valueTextOf(oneDifference.thisValue)} in ${props.thisVersion}, ${valueTextOf(oneDifference.counterpartValue)} in ${otherVersion}`, nameList: [] }]
				: [{ titleText: `Its ${oneDifference.fieldLabel} differs`, detailText: '', nameList: [] }];
		}
		if (oneDifference.differenceKind === 'members') {
			return [
				{ titleText: `${memberNoun} only in ${props.thisVersion}`, detailText: '', nameList: oneDifference.addedNameList },
				{ titleText: `${memberNoun} only in ${otherVersion}`, detailText: '', nameList: oneDifference.missingNameList },
				{ titleText: `${memberNoun} defined differently`, detailText: '', nameList: oneDifference.differingNameList },
			].filter((oneEntry) => oneEntry.nameList.length);
		}
		if (oneDifference.differenceKind === 'type') {
			return [{ titleText: oneDifference.counterpartTypeName ? `Its type ${oneDifference.typeName} is defined differently in ${otherVersion}` : `Its type ${oneDifference.typeName} is not in ${otherVersion}`, detailText: '', nameList: [] }];
		}
		return [{ titleText: 'Its definition differs in a part this page does not show', detailText: '', nameList: [] }];
	});
});

// which name lists are open, by title; a different counterpart starts folded again
const expandedTitleSet = ref(new Set());
watch(counterpart, () => {
	expandedTitleSet.value = new Set();
});

const isExpanded = (oneEntry) => expandedTitleSet.value.has(oneEntry.titleText);
const hiddenNameCountOf = (oneEntry) => Math.max(0, oneEntry.nameList.length - COLLAPSED_NAME_COUNT);
const shownNameTextOf = (oneEntry) => (isExpanded(oneEntry) ? oneEntry.nameList : oneEntry.nameList.slice(0, COLLAPSED_NAME_COUNT)).join(', ');

const setExpanded = (oneEntry, shouldExpand) => {
	const nextSet = new Set(expandedTitleSet.value);
	if (shouldExpand) nextSet.add(oneEntry.titleText);
	else nextSet.delete(oneEntry.titleText);
	expandedTitleSet.value = nextSet;
};
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
			<p v-else-if="counterpart.kind === 'property' || counterpart.kind === 'instance'" class="version-tile-note">Not mapped to a hub.</p>

			<ul v-if="differenceEntryList.length" class="version-tile-differences" data-testid="version-tile-differences">
				<li v-for="oneEntry in differenceEntryList" :key="oneEntry.titleText">
					<span class="version-tile-difference-title">{{ oneEntry.titleText }}</span>
					<span v-if="oneEntry.detailText" class="version-tile-difference-detail">{{ oneEntry.detailText }}</span>
					<span v-if="oneEntry.nameList.length" class="version-tile-difference-detail">{{ shownNameTextOf(oneEntry) }}</span>
					<button v-if="hiddenNameCountOf(oneEntry) && !isExpanded(oneEntry)" type="button" class="version-tile-fold" data-testid="version-tile-more" @click="setExpanded(oneEntry, true)">{{ hiddenNameCountOf(oneEntry) }} more</button>
					<button v-if="hiddenNameCountOf(oneEntry) && isExpanded(oneEntry)" type="button" class="version-tile-fold" data-testid="version-tile-less" @click="setExpanded(oneEntry, false)">less</button>
				</li>
			</ul>

			<p v-if="occurrenceNoteText" class="version-tile-note" data-testid="version-tile-occurrence-note">{{ occurrenceNoteText }}</p>

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
.version-tile-differences li + li {
	margin-top: 8px;
}
.version-tile-difference-title {
	display: block;
	font-weight: 700;
}
.version-tile-difference-detail {
	display: block;
}
.version-tile-fold {
	display: block;
	background: none;
	border: none;
	padding: 0;
	margin-top: 2px;
	color: #072a6c;
	font-weight: 600;
	font-size: 12px;
	cursor: pointer;
}
.version-tile-fold:hover {
	text-decoration: underline;
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
