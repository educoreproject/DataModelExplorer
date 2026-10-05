<script setup>
// @concept: [[SchemaVerifier]]
// @concept: [[CedsHub]]
//
// The selected element seen the way the graph is built: no standard maps to
// another directly — each maps to CEDS. So the pane shows
//
//   selected element ──▶ CEDS concept(s)          (the element's own link)
//                           ◀── other specs' elements on the same concept
//
// and an approval means what the graph means:
//   • "Map to this concept" records   selected element → CEDS concept
//   • approving a spoke records       that spoke's element → CEDS concept
// never spoke → selected element. A spoke approval is keyed by the spoke's own
// element, so it shows up in that element's crosswalk when you browse it.
//
// Each concept can be searched for more elements (semantic, anchored on the
// CEDS element), approved the same way.

import { ref, computed, watch } from 'vue';
import { useSchemaVerifierStore, elementCurationKey } from '@/stores/schemaVerifierStore';

const store = useSchemaVerifierStore();

const props = defineProps({
	// { source, name, path, standard, description, sourceId, kind }
	element: { type: Object, default: null },
	// Curation hooks for the SELECTED element (its key is owned by the parent).
	isCurated: { type: Function, required: true },
	toggle: { type: Function, required: true },
});

const emit = defineEmits(['concepts']);

const concepts = ref([]);
const loading = ref(false);
const loaded = ref(false);
const error = ref('');

async function load() {
	if (!props.element) return;
	loading.value = true;
	error.value = '';
	try {
		concepts.value = await store.lookupCedsConcepts(props.element);
	} catch (err) {
		concepts.value = [];
		error.value = err.message || 'Could not load CEDS concepts.';
	} finally {
		loading.value = false;
		loaded.value = true;
		emit('concepts', concepts.value);
	}
}

watch(
	() => (props.element ? `${props.element.source}|${props.element.path || props.element.name}` : ''),
	(key) => {
		concepts.value = [];
		loaded.value = false;
		openSpokes.value = {};
		openSearch.value = {};
		if (key) load();
	},
	{ immediate: true },
);

const isCedsElement = computed(() => props.element?.source === 'CEDS');

// ── The CEDS side of every approval ─────────────────────────────────
const cedsItem = (concept) => ({
	standard: 'CEDS',
	name: concept.anchor.name,
	sourceId: concept.anchor.id || '',
	targetPath: concept.anchor.path || (concept.domain ? `${concept.domain.name}.${concept.anchor.name}` : ''),
	rel: concept.selfRel || 'manual',
	detail: concept.anchor.desc || '',
});

// Selected element → CEDS concept (uses the parent's key and opens the rule
// editor, like any accepted mapping of the selected element).
const mappedToConcept = (concept) => props.isCurated(cedsItem(concept));
const toggleConcept = (concept) => props.toggle(cedsItem(concept));

// Spoke → CEDS concept. Keyed by the spoke's own element.
const spokeKey = (spoke) => elementCurationKey(spoke);
const spokeSource = (spoke) => ({ standard: spoke.standard, name: spoke.name, sourceId: spoke.sourceId || '', path: spoke.path || '' });
const spokeApproved = (concept, spoke) => store.hasUserEquivalent(spokeKey(spoke), cedsItem(concept));
function toggleSpoke(concept, spoke) {
	const key = spokeKey(spoke);
	const item = { ...cedsItem(concept), rel: spoke.rel || 'manual' };
	if (store.hasUserEquivalent(key, item)) store.removeUserEquivalent(key, item);
	else store.addUserEquivalent(key, item, spokeSource(spoke));
}
const approvedCount = (concept) => concept.spokes.filter((s) => spokeApproved(concept, s)).length;
function approveAllExact(concept) {
	for (const spoke of concept.spokes) {
		if (spoke.rel === 'EXACT_MATCH' && !spokeApproved(concept, spoke)) toggleSpoke(concept, spoke);
	}
}
const exactPending = (concept) =>
	concept.spokes.filter((s) => s.rel === 'EXACT_MATCH' && !spokeApproved(concept, s)).length;

// Spokes are grouped by specification inside each concept; long concepts
// (Ed-Fi alone can put dozens on one) show the first few per spec.
const SPOKES_PER_SPEC = 4;
const openSpokes = ref({}); // conceptKey|standard -> true
function spokeGroups(concept) {
	const groups = new Map();
	for (const s of concept.spokes) {
		if (!groups.has(s.standard)) groups.set(s.standard, []);
		groups.get(s.standard).push(s);
	}
	return [...groups.entries()].map(([standard, rows]) => {
		const k = `${concept.key}|${standard}`;
		return { standard, rows, shown: openSpokes.value[k] ? rows : rows.slice(0, SPOKES_PER_SPEC), more: rows.length - SPOKES_PER_SPEC, k };
	});
}
const toggleMore = (k) => (openSpokes.value = { ...openSpokes.value, [k]: !openSpokes.value[k] });

// "Find more for this concept" — a semantic search anchored on the CEDS
// element; hits are approved as spokes (their element → this concept).
const openSearch = ref({});
const toggleSearch = (concept) =>
	(openSearch.value = { ...openSearch.value, [concept.key]: !openSearch.value[concept.key] });
const searchAnchor = (concept) => ({
	source: 'CEDS',
	name: concept.anchor.name,
	path: concept.anchor.path || '',
	standard: 'CEDS',
});
const searchRowAsSpoke = (item) => ({
	source: item.sourceCode,
	standard: item.standard,
	name: item.name,
	path: item.path || item.targetPath || '',
	rel: 'manual',
	sourceId: item.sourceId || '',
});
const searchIsCurated = (concept) => (item) => spokeApproved(concept, searchRowAsSpoke(item));
const searchToggle = (concept) => (item) => toggleSpoke(concept, searchRowAsSpoke(item));

// ── Presentation ───────────────────────────────────────────────────
const REL = {
	EXACT_MATCH: { label: 'exact', color: 'success', icon: 'mdi-check-decagram', title: 'Authored crosswalk — the standard\'s own documentation maps it to this CEDS concept' },
	CLOSE_MATCH: { label: 'close', color: 'amber-darken-2', icon: 'mdi-lightbulb-outline', title: 'Inferred by similarity — a hypothesis to confirm' },
	NARROW_MATCH: { label: 'narrower', color: 'orange-darken-2', icon: 'mdi-lightbulb-outline', title: 'Inferred: a subset of this CEDS concept' },
	RELATED_MATCH: { label: 'related', color: 'grey', icon: 'mdi-lightbulb-outline', title: 'Inferred: loosely related' },
	manual: { label: 'manual', color: 'deep-purple', icon: 'mdi-account-check-outline', title: 'Chosen by a person' },
};
const rel = (r) => REL[r] || REL.RELATED_MATCH;
const pct = (c) => (c ? `${Math.round(c * 100)}%` : '');

const STANDARD_COLORS = {
	CEDS: 'indigo', JEDx: 'teal', 'Ed-API': 'deep-purple', SIF: 'blue', 'Ed-Fi': 'cyan', CTDL: 'green',
	PESC: 'brown', SEDM: 'orange', LIF: 'pink', CLR: 'deep-orange', 'Open Badges': 'amber', CASE: 'blue-grey',
	MedBiquitous: 'purple', SOC: 'lime-darken-2', CIP: 'light-blue-darken-2', CTDLASN: 'green-darken-3',
	CTDLQData: 'teal-darken-3', DCTAP: 'grey-darken-1',
};
const stdColor = (s) => STANDARD_COLORS[s] || 'grey';
const crumb = (path) => (path || '').split('.').slice(0, -1).join(' › ');

defineExpose({ concepts, reload: load });
</script>

<template>
	<div>
		<div class="d-flex align-center flex-wrap ga-2 mb-1">
			<v-icon size="18" color="indigo">mdi-hub-outline</v-icon>
			<span class="text-subtitle-2 font-weight-bold">
				{{ isCedsElement ? 'This CEDS concept' : 'CEDS concepts' }}
			</span>
			<v-chip v-if="concepts.length" size="x-small" variant="tonal" color="indigo">{{ concepts.length }}</v-chip>
			<v-chip size="x-small" variant="tonal" color="grey-darken-1" :title="`Concepts and matches from the EDUcore graph as of ${store.snapshotDate}`">
				EDUcore graph · {{ store.snapshotDate }}
			</v-chip>
		</div>
		<p class="text-caption text-medium-emphasis mb-3">
			<template v-if="isCedsElement">
				Every standard's elements matched to this CEDS concept. Approving one records
				<em>that element → this CEDS concept</em>.
			</template>
			<template v-else>
				Where <strong>{{ element?.name }}</strong> lands in CEDS, and what other standards map to the same
				concept. Approvals record <em>element → CEDS concept</em>, never element → {{ element?.name }}.
			</template>
		</p>

		<v-progress-linear v-if="loading" indeterminate color="indigo" class="mb-3" />
		<v-alert v-if="error" type="warning" density="compact" variant="tonal" class="mb-3">{{ error }}</v-alert>

		<v-fade-transition group>
			<v-card
				v-for="concept in concepts"
				:key="concept.key"
				variant="outlined"
				class="concept-card mb-4"
			>
				<!-- ── The CEDS concept, and the selected element's link to it ── -->
				<div class="concept-head pa-3">
					<div class="d-flex align-start flex-wrap ga-2">
						<v-chip size="small" color="indigo" variant="flat" label>CEDS</v-chip>
						<div class="flex-grow-1" style="min-width: 0;">
							<div class="text-caption text-medium-emphasis">
								<span v-if="concept.domain">{{ concept.domain.name }}</span>
								<template v-if="concept.value && concept.property">
									<v-icon size="12" class="mx-1">mdi-chevron-right</v-icon>{{ concept.property.name }}
								</template>
							</div>
							<div class="text-body-1 font-weight-bold">
								{{ concept.anchor.name }}
								<span v-if="concept.anchor.id" class="text-caption text-disabled ml-1">{{ concept.anchor.id }}</span>
							</div>
							<div v-if="concept.anchor.desc" class="text-caption text-medium-emphasis mt-1">{{ concept.anchor.desc }}</div>
						</div>
					</div>

					<!-- selected element → this concept -->
					<div v-if="!concept.isSelf" class="self-link d-flex align-center flex-wrap ga-2 mt-3">
						<v-chip size="x-small" :color="stdColor(element.standard)" variant="flat" label>{{ element.standard }}</v-chip>
						<span class="text-body-2 font-weight-medium">{{ element.name }}</span>
						<v-icon size="16" color="grey">mdi-arrow-right</v-icon>
						<v-chip size="x-small" :color="rel(concept.selfRel).color" variant="tonal" :title="rel(concept.selfRel).title">
							<v-icon start size="12">{{ rel(concept.selfRel).icon }}</v-icon>
							{{ rel(concept.selfRel).label }}<span v-if="pct(concept.selfConfidence)" class="ml-1">{{ pct(concept.selfConfidence) }}</span>
						</v-chip>
						<v-spacer />
						<v-btn
							size="small"
							:variant="mappedToConcept(concept) ? 'flat' : 'tonal'"
							:color="mappedToConcept(concept) ? 'success' : 'deep-purple'"
							:prepend-icon="mappedToConcept(concept) ? 'mdi-check-circle' : 'mdi-plus-circle-outline'"
							@click="toggleConcept(concept)"
						>
							{{ mappedToConcept(concept) ? 'Mapped' : 'Map to this concept' }}
						</v-btn>
					</div>
				</div>

				<!-- ── Other standards on the same concept ── -->
				<div class="pa-3 pt-2">
					<div class="d-flex align-center flex-wrap ga-2 mb-2">
						<span class="text-caption font-weight-bold text-medium-emphasis">
							{{ concept.spokes.length ? `Also mapped to this concept (${concept.spokes.length})` : 'No other standard maps here yet' }}
						</span>
						<v-chip v-if="approvedCount(concept)" size="x-small" color="success" variant="tonal">
							{{ approvedCount(concept) }} approved
						</v-chip>
						<v-spacer />
						<v-btn
							v-if="exactPending(concept) > 1"
							size="x-small"
							variant="text"
							color="success"
							prepend-icon="mdi-check-all"
							:title="'Approve every authored (exact) match on this concept'"
							@click="approveAllExact(concept)"
						>
							Approve {{ exactPending(concept) }} exact
						</v-btn>
					</div>

					<div v-for="g in spokeGroups(concept)" :key="g.k" class="spoke-group mb-2">
						<div class="d-flex align-center mb-1">
							<v-chip size="x-small" :color="stdColor(g.standard)" variant="flat" label>{{ g.standard }}</v-chip>
							<span class="text-caption text-medium-emphasis ml-2">{{ g.rows.length }}</span>
						</div>
						<div
							v-for="s in g.shown"
							:key="`${s.source}|${s.path || s.name}`"
							class="spoke-row d-flex align-center ga-2"
							:class="{ 'spoke-row--approved': spokeApproved(concept, s) }"
						>
							<v-btn
								size="x-small"
								variant="text"
								:icon="spokeApproved(concept, s) ? 'mdi-check-circle' : 'mdi-plus-circle-outline'"
								:color="spokeApproved(concept, s) ? 'success' : 'deep-purple'"
								:title="spokeApproved(concept, s)
									? `Approved: ${g.standard} ${s.name} → CEDS ${concept.anchor.name}. Click to withdraw.`
									: `Approve ${g.standard} ${s.name} → CEDS ${concept.anchor.name}`"
								@click="toggleSpoke(concept, s)"
							/>
							<div class="flex-grow-1" style="min-width: 0;">
								<span class="text-body-2">{{ s.name }}</span>
								<span v-if="crumb(s.path)" class="text-caption text-disabled ml-2 mono">{{ crumb(s.path) }}</span>
							</div>
							<v-chip size="x-small" :color="rel(s.rel).color" variant="tonal" :title="rel(s.rel).title">
								{{ rel(s.rel).label }}<span v-if="pct(s.confidence)" class="ml-1">{{ pct(s.confidence) }}</span>
							</v-chip>
						</div>
						<v-btn v-if="g.more > 0" size="x-small" variant="text" class="ml-6" @click="toggleMore(g.k)">
							{{ openSpokes[g.k] ? 'Show fewer' : `Show ${g.more} more` }}
						</v-btn>
					</div>

					<!-- find more elements for this concept -->
					<v-btn
						size="x-small"
						variant="text"
						color="deep-purple"
						:prepend-icon="openSearch[concept.key] ? 'mdi-chevron-up' : 'mdi-text-search-variant'"
						class="mt-1 px-1 text-none"
						@click="toggleSearch(concept)"
					>
						{{ openSearch[concept.key] ? 'Hide search' : 'Find more elements for this concept' }}
					</v-btn>
					<v-expand-transition>
						<div v-if="openSearch[concept.key]" class="mt-2 concept-search">
							<TargetFieldSearch
								:anchor="searchAnchor(concept)"
								exclude-source="CEDS"
								:is-curated="searchIsCurated(concept)"
								:toggle="searchToggle(concept)"
								:open="true"
								:title="`Elements that mean ${concept.anchor.name}`"
								:intro="`Ranked by similarity to the CEDS concept. Approving one records that element → CEDS ${concept.anchor.name}.`"
							/>
						</div>
					</v-expand-transition>
				</div>
			</v-card>
		</v-fade-transition>

		<div v-if="loaded && !loading && !concepts.length && !error" class="no-concept pa-4 mb-2">
			<div class="d-flex align-center ga-2 mb-1">
				<v-icon size="18" color="indigo">mdi-hub-outline</v-icon>
				<span class="text-body-2 font-weight-bold">Not linked to CEDS yet</span>
			</div>
			<p class="text-caption text-medium-emphasis mb-0">
				The graph has no CEDS concept for <strong>{{ element?.name }}</strong>. Find one below — the search
				starts in CEDS and ranks by meaning.
			</p>
		</div>
	</div>
</template>

<style scoped>
.concept-card {
	border-left: 4px solid rgb(var(--v-theme-indigo));
	overflow: hidden;
}
.concept-head {
	background: rgba(var(--v-theme-indigo), 0.04);
}
.self-link {
	border-top: 1px dashed rgba(var(--v-theme-indigo), 0.25);
	padding-top: 10px;
}
.spoke-row {
	border-radius: 6px;
	padding: 1px 4px 1px 0;
	transition: background-color 0.15s ease;
}
.spoke-row:hover {
	background: rgba(var(--v-theme-on-surface), 0.04);
}
.spoke-row--approved {
	background: rgba(var(--v-theme-success), 0.07);
}
.concept-search {
	border-left: 2px solid rgba(var(--v-theme-deep-purple), 0.3);
	padding-left: 10px;
}
.no-concept {
	border: 1px dashed rgba(var(--v-theme-indigo), 0.35);
	border-radius: 8px;
}
.mono {
	font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
}
</style>
