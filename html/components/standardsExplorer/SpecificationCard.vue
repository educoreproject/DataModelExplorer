<script setup>
// @concept: [[DataModelExplorer]]
// One specification from the catalog (specificationMetadataStore): owner, version, governance, burden and access,
// description, tags, and its implementation details behind an expansion panel. Drawn in the signed-out catalog
// (until 2026-11-04, the signed-out catalog) and, compact, in the Standards Explorer's detail panel for the family being walked.

import { computed } from 'vue';
import { useSpecificationMetadataStore } from '@/stores/specificationMetadataStore';
import { FAMILY_CATALOG_STABLE_ID, explorerLinkOf, explorerComponentWords, wordingOf } from '@/components/standardsExplorer/explorerVocabulary';

const cardWords = explorerComponentWords.specificationCard;

const props = defineProps({
	spec: { type: Object, required: true },
	compact: { type: Boolean, default: false },
	// the card is an article named by its own heading; its level follows the page it sits in (h4 under the catalog's
	// category h3, h3 under the detail panel's h2)
	headingLevel: { type: Number, default: 4 },
});

const specStore = useSpecificationMetadataStore();

// where else this specification lives in the Standards view, as links (not shown compact: the panel it sits in is
// already the explorer, and carries its own Downloads section)
const titleId = computed(() => `spec-card-title-${props.spec.id}`);
const explorerLink = computed(() => (props.spec.graphFamily ? explorerLinkOf([FAMILY_CATALOG_STABLE_ID, `family:${props.spec.graphFamily}`]) : null));
const downloadsLink = computed(() => (props.spec.graphFamily ? { path: '/explore/standards/downloads', query: { family: props.spec.graphFamily } } : null));

const burdenColor = (burden) => {
	if (burden === 'low') return 'success';
	if (burden === 'medium') return 'warning';
	return 'error';
};
</script>

<template>
	<v-card tag="article" variant="outlined" class="spec-card" :aria-labelledby="titleId" :data-testid="`spec-card-${spec.id}`">
		<v-card-title class="d-flex align-center flex-wrap ga-2 pb-1">
			<component :is="`h${headingLevel}`" :id="titleId" class="text-subtitle-1 font-weight-bold spec-card-title">{{ spec.title }}</component>
			<v-chip size="x-small" :color="burdenColor(spec.implementationBurden)" variant="tonal">
				{{ wordingOf(cardWords.burdenTemplate, { burdenText: spec.implementationBurden }) }}
			</v-chip>
			<v-chip size="x-small" :color="spec.accessLevel === 'open' ? 'success' : 'warning'" variant="tonal">
				{{ spec.accessLevel }}
			</v-chip>
		</v-card-title>

		<v-card-subtitle class="pb-2">
			{{ spec.owner }}{{ cardWords.ownerDivider }}{{ /^\d/.test(spec.version) ? cardWords.versionPrefixText + spec.version : spec.version }}
			<template v-if="spec.governanceBody">{{ wordingOf(cardWords.governanceTemplate, { governanceBody: spec.governanceBody }) }}</template>
			<template v-if="spec.lastUpdated">{{ wordingOf(cardWords.updatedTemplate, { lastUpdated: spec.lastUpdated }) }}</template>
		</v-card-subtitle>

		<v-card-text class="pt-0">
			<p class="text-body-2 mb-3" :class="{ 'spec-card-clamp': compact }">{{ spec.description }}</p>

			<!-- Tags -->
			<div class="mb-3">
				<v-chip
					v-for="tag in spec.tags.slice(0, compact ? 5 : 8)"
					:key="tag"
					size="x-small"
					variant="tonal"
					class="mr-1 mb-1"
				>
					{{ tag }}
				</v-chip>
			</div>

			<!-- Expandable details -->
			<v-expansion-panels variant="accordion" flat>
				<v-expansion-panel>
					<v-expansion-panel-title class="text-caption font-weight-bold px-0">
						{{ cardWords.detailsHeadText }}
					</v-expansion-panel-title>
					<v-expansion-panel-text>
						<!-- Burden Rubric -->
						<div v-if="spec.burdenRubric" class="mb-4">
							<h4 class="text-caption font-weight-bold mb-2">{{ cardWords.burdenRubricHeadText }}</h4>
							<div v-if="compact" class="spec-card-rubric">
								<div v-for="(val, key) in spec.burdenRubric" :key="key" class="spec-card-rubric-row">
									<div class="d-flex align-center ga-2">
										<span class="text-capitalize font-weight-medium text-body-2">{{ key }}</span>
										<v-chip size="x-small" :color="burdenColor(val.level === 'moderate' ? 'medium' : val.level)" variant="tonal">{{ val.level }}</v-chip>
									</div>
									<p class="text-body-2 mb-0">{{ val.note }}</p>
								</div>
							</div>
							<v-table v-else density="compact">
								<tbody>
									<tr v-for="(val, key) in spec.burdenRubric" :key="key">
										<td class="text-capitalize font-weight-medium" style="width: 120px;">{{ key }}</td>
										<td>
											<v-chip size="x-small" :color="burdenColor(val.level === 'moderate' ? 'medium' : val.level)" variant="tonal" class="mr-2">
												{{ val.level }}
											</v-chip>
											{{ val.note }}
										</td>
									</tr>
								</tbody>
							</v-table>
						</div>

						<!-- Required Capabilities -->
						<div v-if="spec.requiredCapabilities?.length" class="mb-4">
							<h4 class="text-caption font-weight-bold mb-1">{{ cardWords.requiredCapabilitiesHeadText }}</h4>
							<ul class="text-body-2 pl-4">
								<li v-for="cap in spec.requiredCapabilities" :key="cap">{{ cap }}</li>
							</ul>
						</div>

						<!-- Implementation Guidance -->
						<div v-if="spec.implementationGuidance" class="mb-4">
							<h4 class="text-caption font-weight-bold mb-1">{{ cardWords.guidanceHeadText }}</h4>
							<p class="text-body-2">{{ spec.implementationGuidance }}</p>
						</div>

						<!-- Commonly Paired With -->
						<div v-if="spec.commonlyPairedWith?.length" class="mb-4">
							<h4 class="text-caption font-weight-bold mb-1">{{ cardWords.pairedWithHeadText }}</h4>
							<div>
								<v-chip
									v-for="pairedId in spec.commonlyPairedWith"
									:key="pairedId"
									size="x-small"
									variant="outlined"
									class="mr-1 mb-1"
								>
									{{ specStore.specById(pairedId)?.title || pairedId }}
								</v-chip>
							</div>
						</div>

						<!-- Known Adopters -->
						<div v-if="spec.knownAdopters?.length" class="mb-4">
							<h4 class="text-caption font-weight-bold mb-1">{{ cardWords.adoptersHeadText }}</h4>
							<div>
								<v-chip
									v-for="adopter in spec.knownAdopters"
									:key="adopter"
									size="x-small"
									variant="outlined"
									class="mr-1 mb-1"
								>
									{{ adopter }}
								</v-chip>
							</div>
						</div>

						<!-- Privacy Considerations -->
						<div v-if="spec.privacyConsiderations" class="mb-4">
							<h4 class="text-caption font-weight-bold mb-1">{{ cardWords.privacyHeadText }}</h4>
							<p class="text-body-2">
								<v-chip size="x-small" variant="tonal" class="mr-1"
									:color="spec.privacyConsiderations.level === 'low-concern' ? 'success' : spec.privacyConsiderations.level === 'medium-concern' ? 'warning' : 'error'"
								>
									{{ spec.privacyConsiderations.level }}
								</v-chip>
								{{ spec.privacyConsiderations.notes }}
							</p>
							<div v-if="spec.privacyConsiderations.regulations?.length" class="mt-1">
								<v-chip v-for="reg in spec.privacyConsiderations.regulations" :key="reg" size="x-small" variant="outlined" class="mr-1">{{ reg }}</v-chip>
							</div>
						</div>

						<!-- Equity Considerations -->
						<div v-if="spec.equityConsiderations" class="mb-4">
							<h4 class="text-caption font-weight-bold mb-1">{{ cardWords.equityHeadText }}</h4>
							<p class="text-body-2">
								<v-chip size="x-small" variant="tonal" class="mr-1"
									:color="spec.equityConsiderations.level === 'low-concern' ? 'success' : 'warning'"
								>
									{{ spec.equityConsiderations.level }}
								</v-chip>
								{{ spec.equityConsiderations.notes }}
							</p>
						</div>

						<!-- Sample Payloads -->
						<div v-if="spec.samplePayloads?.length" class="mb-4">
							<h4 class="text-caption font-weight-bold mb-2">{{ cardWords.samplePayloadsHeadText }}</h4>
							<div v-for="payload in spec.samplePayloads" :key="payload.label" class="mb-2">
								<div class="text-caption text-medium-emphasis mb-1">{{ payload.label }}</div>
								<pre class="pa-3 rounded" style="background: #2d2d2d; color: #f8f8f2; font-size: 0.8rem; overflow-x: auto; max-height: 300px;">{{ payload.code }}</pre>
							</div>
						</div>

						<!-- Technical Doc Links -->
						<div v-if="spec.technicalDocLinks?.length">
							<h4 class="text-caption font-weight-bold mb-1">{{ cardWords.documentationHeadText }}</h4>
							<div>
								<v-btn
									v-for="link in spec.technicalDocLinks"
									:key="link.url"
									:href="link.url"
									target="_blank"
									rel="noopener noreferrer"
									size="small"
									variant="text"
									class="mr-2"
									prepend-icon="mdi-open-in-new"
								>
									{{ link.label }}
								</v-btn>
							</div>
						</div>
					</v-expansion-panel-text>
				</v-expansion-panel>
			</v-expansion-panels>
			<div v-if="!compact && (explorerLink || downloadsLink)" class="spec-card-links">
				<v-btn v-if="explorerLink" :to="explorerLink" size="small" variant="tonal" color="primary" prepend-icon="mdi-graph-outline" :aria-label="wordingOf(cardWords.exploreLabelTemplate, { specTitle: spec.title })" :data-testid="`spec-card-explore-${spec.id}`">{{ cardWords.exploreText }}</v-btn>
				<v-btn v-if="downloadsLink" :to="downloadsLink" size="small" variant="text" color="primary" prepend-icon="mdi-download-box-outline" :aria-label="wordingOf(cardWords.downloadsLabelTemplate, { specTitle: spec.title })" :data-testid="`spec-card-downloads-${spec.id}`">{{ cardWords.downloadsText }}</v-btn>
			</div>
		</v-card-text>
	</v-card>
</template>

<style scoped>
.spec-card :deep(.v-card-subtitle) {
	white-space: normal;
}
.spec-card-links {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 12px;
}
.spec-card-title {
	margin: 0;
	flex: 1;
	min-width: 180px;
	white-space: normal;
	line-height: 1.3;
}
.spec-card-rubric {
	display: flex;
	flex-direction: column;
	gap: 10px;
}
.spec-card-rubric-row {
	display: flex;
	flex-direction: column;
	gap: 2px;
}
.spec-card-clamp {
	display: -webkit-box;
	-webkit-line-clamp: 6;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
</style>
