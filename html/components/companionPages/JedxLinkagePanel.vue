<script setup>
// The JEDx page's Linkage panel (SPEC-companionPages-102826): dictionary element -> HR Open property -> JEDx graph node
// -> CEDS / CTDL match, with tier and provenance. All figures are the compile's, read from the golden: the counts at the
// top are payload.countSummary, and each match is the golden's edge with its confidence, method, source and rationale.
//   - FEATURED: the close matches in data/jedxCompanionFeaturedMatchList.ts, each looked up in this compile. One the
//     compile no longer holds is listed as missing, not dropped. Where a featured element's HR Open property serves
//     several dictionary elements, their filter conditions are shown, since they are what tell those elements apart.
//   - EVERY LINKED ELEMENT: a searchable table of the elements with at least one match.
// A JEDx node links to the Standards Explorer, walked from the JEDx root to its class and then the property.

import { computed, ref } from 'vue';
import { jedxCompanionFeaturedMatchList } from '@/data/jedxCompanionFeaturedMatchList';
import { pathTextOf, matchKindOrderList } from '@/components/standardsExplorer/explorerVocabulary';

const props = defineProps({
	payload: { type: Object, required: true },
});

const JEDX_ROOT_PATH_STABLE_ID_LIST = ['families:all', 'family:JEDx', 'jedx:root'];

const explorerLinkOf = (dictionaryElement) => ({
	path: '/explore/graphicModelExplorer',
	query: { path: pathTextOf([...JEDX_ROOT_PATH_STABLE_ID_LIST, `jedx:${dictionaryElement.jedxSchemaName}`, dictionaryElement.jedxStableId]) },
});

const elementByRowId = computed(() => Object.fromEntries(props.payload.elementList.map((dictionaryElement) => [dictionaryElement.elementRowId, dictionaryElement])));
const sharedPropertyByStableId = computed(() => Object.fromEntries(props.payload.sharedPropertyList.map((sharedProperty) => [sharedProperty.jedxStableId, sharedProperty])));

const featuredRowList = computed(() =>
	jedxCompanionFeaturedMatchList.map((featuredMatch) => {
		const candidateList = props.payload.elementList.filter((dictionaryElement) => dictionaryElement.elementId === featuredMatch.elementId);
		const dictionaryElement = candidateList.length === 1 ? candidateList[0] : null;
		const hubMatch = dictionaryElement && dictionaryElement.matchList.find((oneMatch) => oneMatch.hubName === featuredMatch.hubName && oneMatch.matchName === featuredMatch.matchName);
		const sharedProperty = dictionaryElement && sharedPropertyByStableId.value[dictionaryElement.jedxStableId];
		return { featuredMatch, dictionaryElement, hubMatch, sharedProperty, missingText: hubMatch ? '' : `${featuredMatch.elementId} with its ${featuredMatch.hubName} match '${featuredMatch.matchName}' is not in this compile${candidateList.length > 1 ? ` (the element ID appears ${candidateList.length} times)` : ''}.` };
	}),
);

const searchText = ref('');
const chosenMatchKind = ref(null);
const matchKindOptionList = matchKindOrderList.map((matchKind) => ({ title: `${matchKind.toUpperCase()}_MATCH`, value: matchKind }));

const linkedElementList = computed(() => {
	const searchPattern = searchText.value.trim().toLowerCase();
	return props.payload.elementList
		.filter((dictionaryElement) => dictionaryElement.matchList.length)
		.filter((dictionaryElement) => !chosenMatchKind.value || dictionaryElement.matchList.some((oneMatch) => oneMatch.matchKind === chosenMatchKind.value))
		.filter((dictionaryElement) => !searchPattern || [dictionaryElement.elementId, dictionaryElement.elementName, dictionaryElement.jedxStableId, ...dictionaryElement.matchList.map((oneMatch) => oneMatch.matchName)].some((fieldText) => String(fieldText).toLowerCase().includes(searchPattern)));
});

const countSummary = computed(() => props.payload.countSummary);
</script>

<template>
	<div class="linkage-panel">
		<p class="linkage-count" data-testid="linkage-count">
			From the graph: of {{ countSummary.elementCount }} dictionary elements, {{ countSummary.resolvedCount }} reach a JEDx graph node ({{ countSummary.distinctPropertyCount }} distinct JEDx properties), and {{ countSummary.matchedElementCount }} have at least one hub match:
			<template v-for="(matchedCount, hubName, hubIndex) in countSummary.matchedElementCountByHub" :key="hubName">{{ hubIndex ? ', ' : '' }}{{ matchedCount }} to {{ hubName }}</template>.
			The matches are
			<template v-for="(matchKind, kindIndex) in matchKindOrderList" :key="matchKind">{{ kindIndex ? ', ' : '' }}{{ countSummary.matchCountByKind[matchKind] || 0 }} {{ matchKind }}</template>.
		</p>

		<h3 class="linkage-subhead">Featured close matches</h3>
		<div class="linkage-featured-list">
			<article v-for="featuredRow in featuredRowList" :key="`${featuredRow.featuredMatch.elementId}-${featuredRow.featuredMatch.hubName}`" class="linkage-featured" :data-testid="`linkage-featured-${featuredRow.featuredMatch.elementId}`">
				<p v-if="featuredRow.missingText" class="linkage-missing" data-testid="linkage-featured-missing">{{ featuredRow.missingText }}</p>
				<template v-else>
					<div class="linkage-chain">
						<div class="linkage-step">
							<span class="linkage-step-label">Dictionary element</span>
							<span class="linkage-step-value">{{ featuredRow.dictionaryElement.elementId }} {{ featuredRow.dictionaryElement.elementName }}</span>
							<span class="linkage-step-note">{{ featuredRow.dictionaryElement.definition }}</span>
						</div>
						<div class="linkage-step">
							<span class="linkage-step-label">HR Open property</span>
							<span class="companion-path-text">{{ featuredRow.dictionaryElement.hrOpenPath }}</span>
							<span v-if="featuredRow.dictionaryElement.hrOpenFilterCondition" class="linkage-step-note">filter: <span class="companion-path-text">{{ featuredRow.dictionaryElement.hrOpenFilterCondition }}</span></span>
						</div>
						<div class="linkage-step">
							<span class="linkage-step-label">JEDx graph node</span>
							<NuxtLink :to="explorerLinkOf(featuredRow.dictionaryElement)" class="linkage-node-link" data-testid="linkage-node-link"><code>{{ featuredRow.dictionaryElement.jedxStableId }}</code></NuxtLink>
						</div>
						<div class="linkage-step">
							<span class="linkage-step-label">Hub match</span>
							<CompanionPagesCompanionMatchTier :hub-match="featuredRow.hubMatch" :is-rationale-shown="true" />
						</div>
					</div>
					<p class="linkage-why"><span class="linkage-step-label">Why it is featured (EDUcore's note)</span> {{ featuredRow.featuredMatch.whyFeaturedText }}</p>
					<div v-if="featuredRow.sharedProperty" class="linkage-shared" data-testid="linkage-shared">
						<span class="linkage-step-label">{{ featuredRow.sharedProperty.elementList.length }} dictionary elements share this HR Open property; the filter condition says which is which</span>
						<table class="companion-table">
							<tbody>
								<tr v-for="sharingElement in featuredRow.sharedProperty.elementList" :key="sharingElement.elementRowId" :class="{ 'linkage-shared-self': sharingElement.elementRowId === featuredRow.dictionaryElement.elementRowId }">
									<td class="linkage-shared-id">{{ sharingElement.elementId }}</td>
									<td>{{ sharingElement.elementName }}</td>
									<td class="companion-path-text">{{ sharingElement.hrOpenFilterCondition || '(no filter condition given)' }}</td>
								</tr>
							</tbody>
						</table>
					</div>
				</template>
			</article>
		</div>

		<h3 class="linkage-subhead">Every linked element</h3>
		<div class="linkage-filters">
			<v-text-field v-model="searchText" label="Search elements, JEDx properties and hub terms" density="compact" variant="outlined" hide-details clearable data-testid="linkage-search" />
			<v-select v-model="chosenMatchKind" :items="matchKindOptionList" label="Tier" density="compact" variant="outlined" hide-details clearable data-testid="linkage-tier" />
		</div>
		<p class="linkage-table-count" data-testid="linkage-table-count">{{ linkedElementList.length }} of {{ countSummary.matchedElementCount }} linked elements</p>
		<div class="linkage-scroll">
			<table class="companion-table">
				<thead>
					<tr>
						<th scope="col">Dictionary element</th>
						<th scope="col">HR Open property and filter</th>
						<th scope="col">JEDx graph node</th>
						<th scope="col">CEDS / CTDL matches</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="dictionaryElement in linkedElementList" :key="dictionaryElement.elementRowId" :data-testid="`linkage-row-${dictionaryElement.elementRowId}`">
						<td><strong>{{ dictionaryElement.elementId }}</strong> {{ dictionaryElement.elementName }}</td>
						<td>
							<span class="companion-path-text">{{ dictionaryElement.hrOpenPath }}</span>
							<span v-if="dictionaryElement.hrOpenFilterCondition" class="linkage-step-note">filter: <span class="companion-path-text">{{ dictionaryElement.hrOpenFilterCondition }}</span></span>
							<span v-if="dictionaryElement.sharedPropertyElementRowIdList.length" class="linkage-step-note">shared with {{ dictionaryElement.sharedPropertyElementRowIdList.map((elementRowId) => elementByRowId[elementRowId] && elementByRowId[elementRowId].elementId).join(', ') }}</span>
						</td>
						<td><NuxtLink :to="explorerLinkOf(dictionaryElement)" class="linkage-node-link"><code>{{ dictionaryElement.jedxStableId }}</code></NuxtLink></td>
						<td>
							<div class="linkage-match-cell">
								<CompanionPagesCompanionMatchTier v-for="hubMatch in dictionaryElement.matchList" :key="`${hubMatch.hubName}-${hubMatch.matchStableId}`" :hub-match="hubMatch" />
							</div>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>

<style scoped>
.linkage-count,
.linkage-table-count {
	margin: 0 0 8px;
	font-size: 14px;
	color: #374151;
}
.linkage-table-count {
	font-size: 13px;
	color: #6b7280;
}
.linkage-subhead {
	margin: 18px 0 8px;
	font-size: 16px;
	font-weight: 700;
	color: #072a6c;
}
.linkage-featured-list {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(100%, 560px), 1fr));
	gap: 12px;
}
.linkage-featured {
	border: 1px solid #e3e7ef;
	border-radius: 10px;
	padding: 12px;
	background: #fbfcfe;
}
.linkage-chain {
	display: grid;
	grid-template-columns: 1fr;
	gap: 8px;
}
.linkage-step {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding-left: 10px;
	border-left: 3px solid #d7deea;
}
.linkage-step-label {
	font-size: 11px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: #6b7280;
}
.linkage-step-value {
	font-weight: 700;
	color: #111827;
}
.linkage-step-note {
	display: block;
	font-size: 12.5px;
	color: #4b5563;
}
.linkage-why {
	margin: 10px 0 0;
	font-size: 13px;
	color: #374151;
}
.linkage-shared {
	margin-top: 10px;
}
.linkage-shared-id {
	white-space: nowrap;
	font-weight: 700;
}
.linkage-shared-self td {
	background: #eef4ff;
}
.linkage-missing {
	margin: 0;
	color: #9b1c1c;
}
.linkage-node-link code {
	overflow-wrap: anywhere;
	color: #072a6c;
}
.linkage-filters {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
}
.linkage-filters > .v-text-field {
	flex: 2 1 320px;
}
.linkage-filters > .v-select {
	flex: 1 1 180px;
	max-width: 240px;
}
.linkage-scroll {
	max-height: 640px;
	overflow: auto;
	border: 1px solid #eef1f6;
	border-radius: 8px;
}
.linkage-scroll thead th {
	position: sticky;
	top: 0;
	background: #ffffff;
	z-index: 1;
}
.linkage-match-cell {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-width: 280px;
}
</style>
