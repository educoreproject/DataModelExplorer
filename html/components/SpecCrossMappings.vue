<script setup>
// @concept: [[SchemaVerifier]]
// The right-hand panel of the Schema Verifier's specification browser.
//
// Given one element of the specification being browsed, shows what every OTHER
// specification in the graph says about it, in the graph's two tiers and never
// blended:
//
//   AUTHORITATIVE — both hub edges are verified. Since no standard's
//   documentation crosswalks directly to another's (each maps to CEDS), these
//   are almost all equivalences between two non-CEDS specs that hold BY
//   COMPOSITION through a shared CEDS hub. The panel names that hub rather than
//   implying a direct assertion.
//
//   IMPLIED — at least one leg is similarity-derived, so the pair is a
//   hypothesis awaiting a human verdict. That verdict is the curated crosswalk,
//   the same per-element set the HR Open view writes to.

import { ref, watch, computed } from 'vue';
import { useSchemaVerifierStore } from '@/stores/schemaVerifierStore';

const store = useSchemaVerifierStore();

const props = defineProps({
	// The element being explained: { name, source, standard, kind, description, sourceId }.
	element: { type: Object, default: null },
});

const authoritativeRows = ref([]);
const impliedRows = ref([]);
const ran = ref(false);

// Curated equivalents are keyed by spec + element name, so the set survives
// re-selecting the element, re-picking the spec, and page reloads.
const curationKey = computed(() =>
	props.element ? `${props.element.source}::${props.element.name}` : '',
);
const curated = computed(() => store.userEquivalentsFor(curationKey.value));
const isCurated = (item) => store.hasUserEquivalent(curationKey.value, item);
const toggleCurated = (item) => {
	if (isCurated(item)) store.removeUserEquivalent(curationKey.value, item);
	else store.addUserEquivalent(curationKey.value, item);
};
const rowItem = (row) => ({
	standard: row.standard,
	name: row.name,
	sourceId: row.sourceId || '',
	rel: row.rel,
	detail: row.description || '',
});

const STANDARD_COLORS = {
	CEDS: 'indigo',
	JEDx: 'teal',
	'Ed-API': 'deep-purple',
	SIF: 'blue',
	'Ed-Fi': 'cyan',
	CTDL: 'green',
	PESC: 'brown',
	SEDM: 'orange',
	LIF: 'pink',
	CLR: 'deep-orange',
	'Open Badges': 'amber',
	CASE: 'blue-grey',
	MedBiquitous: 'purple',
	SOC: 'lime-darken-2',
	CIP: 'light-blue-darken-2',
	CTDLASN: 'green-darken-3',
	CTDLQData: 'teal-darken-3',
	DCTAP: 'grey-darken-1',
};
const stdColor = (s) => STANDARD_COLORS[s] || 'grey';

// How strongly the graph is claiming a correspondence. CLOSE is the useful
// tier; NARROW means the neighbour is a subset of this concept; RELATED is the
// loosest and is worth showing mostly as a lead.
const REL_LABELS = {
	EXACT_MATCH: 'exact',
	CLOSE_MATCH: 'close',
	NARROW_MATCH: 'narrower',
	RELATED_MATCH: 'related',
	HAS_CEDS_PROPERTY: 'CEDS anchor',
	HAS_CEDS_DOMAIN: 'CEDS anchor',
	HAS_CEDS_VALUE: 'CEDS anchor',
};
const relLabel = (rel) => REL_LABELS[rel] || 'implied';

// A correspondence is only as strong as its weaker leg, so that is what the
// chip must say. Labelling the neighbour's edge instead prints "exact" on a row
// sitting under "not authoritative" — a contradiction, and one that flatters
// the graph: the exactness belongs to the hub→neighbour hop, not to the pair.
const REL_STRENGTH = {
	EXACT_MATCH: 0,
	HAS_CEDS_PROPERTY: 0,
	HAS_CEDS_DOMAIN: 0,
	HAS_CEDS_VALUE: 0,
	CLOSE_MATCH: 1,
	NARROW_MATCH: 2,
	RELATED_MATCH: 3,
};
const strengthOf = (rel) => (rel in REL_STRENGTH ? REL_STRENGTH[rel] : 3);

// Ignores an absent selfRel rather than treating it as the weakest — a missing
// edge type is unknown, not loose.
function weakestRel(row) {
	if (!row.selfRel) return row.rel;
	return strengthOf(row.selfRel) >= strengthOf(row.rel) ? row.selfRel : row.rel;
}

function groupByStandard(list) {
	const groups = {};
	for (const r of list) (groups[r.standard] ||= []).push(r);
	// MEANING RANKS FIRST, then the number.
	//
	// The graph's own verdict on a pair — close vs narrower vs related — is a
	// semantic judgement made against the hub concept. A percentage is at best a
	// vector distance and at worst (the lexical fallback) a word-overlap
	// coincidence, so it must not reorder rows across match tiers. Sorting the
	// other way round put a 67% label collision above a genuinely close match.
	for (const rowsForStd of Object.values(groups)) {
		rowsForStd.sort(
			(a, b) => strengthOf(weakestRel(a)) - strengthOf(weakestRel(b)) ||
				b.score - a.score ||
				a.name.localeCompare(b.name),
		);
	}
	// Specifications lead with their best row: strongest tier first, then score
	// within it. CEDS only breaks ties — being the hub language is not itself a
	// reason to outrank a better match elsewhere.
	const bestOf = (rows) =>
		rows.reduce(
			(best, r) => {
				const tier = strengthOf(weakestRel(r));
				if (tier < best.tier || (tier === best.tier && (r.score || 0) > best.score)) {
					return { tier, score: r.score || 0 };
				}
				return best;
			},
			{ tier: 99, score: 0 },
		);
	return Object.entries(groups).sort(([aName, aRows], [bName, bRows]) => {
		const a = bestOf(aRows);
		const b = bestOf(bRows);
		return (
			a.tier - b.tier ||
			b.score - a.score ||
			(bName === 'CEDS') - (aName === 'CEDS') ||
			aName.localeCompare(bName)
		);
	});
}

// The percentage chip. Colour tracks the score so a column of rows is scannable
// without reading the numbers.
const pct = (score) => Math.round((score || 0) * 100);
const scoreColor = (score) => {
	const value = pct(score);
	if (value >= 90) return 'success';
	if (value >= 65) return 'lime-darken-3';
	if (value >= 40) return 'amber-darken-3';
	return 'grey';
};

// A lexical zero means "these labels share no words", which is NOT "these do not
// match" — CASE fullStatement ↔ CEDS Competency Definition is exactly that case,
// and printing 0% there argues against the human who knows better. Show an em
// dash: no signal, no claim.
const hasScore = (row) => row.scoreBasis !== 'similarity' || pct(row.score) > 0;
const scoreText = (row) => (hasScore(row) ? `${pct(row.score)}%` : '—');

const SCORE_BASIS_ICON = {
	semantic: 'mdi-vector-triangle',
	confidence: 'mdi-seal-variant',
	similarity: 'mdi-approximately-equal',
};
const scoreIcon = (row) => SCORE_BASIS_ICON[row.scoreBasis] || '';

// The three bases must never read as the same number.
const scoreTitle = (row) => {
	if (row.scoreBasis === 'semantic') {
		return `${pct(row.score)}% — semantic similarity: cosine distance between the two elements' embeddings. Measures meaning, not spelling.`;
	}
	if (row.scoreBasis === 'confidence') {
		return `${pct(row.score)}% — the graph's own stamped confidence for this path (both hub legs multiplied).`;
	}
	if (!hasScore(row)) {
		return 'No lexical signal — these labels share no words. That is not evidence against the mapping; the graph offered no semantic score to use instead.';
	}
	return `${pct(row.score)}% — label similarity only. No embeddings or stamped confidence were available, so this compares wording, not meaning.`;
};

const groupedAuthoritative = computed(() => groupByStandard(authoritativeRows.value));
const groupedImplied = computed(() => groupByStandard(impliedRows.value));

// The distinct hubs an authoritative claim travelled through. Naming them is
// what keeps "SIF ↔ Ed-Fi" honest: the graph asserts each leg to CEDS, not the
// pair itself.
const authoritativeHubs = computed(() => [
	...new Set(authoritativeRows.value.map((r) => r.hub).filter(Boolean)),
]);

async function run() {
	const { authoritative, implied } = await store.lookupCrossSpec(props.element);
	authoritativeRows.value = authoritative;
	impliedRows.value = implied;
	ran.value = true;
}

watch(
	() => (props.element ? `${props.element.source}|${props.element.name}` : ''),
	(key) => {
		authoritativeRows.value = [];
		impliedRows.value = [];
		ran.value = false;
		if (key) run();
	},
	{ immediate: true },
);
</script>

<template>
	<div>
		<!-- ── Your equivalence crosswalk (user-curated) ─────────── -->
		<div class="mb-5">
			<div class="d-flex align-center mb-2">
				<v-icon size="18" color="deep-purple" class="mr-2">mdi-table-star</v-icon>
				<span class="text-subtitle-2 font-weight-bold">Your equivalence crosswalk</span>
				<v-chip v-if="curated.length" size="x-small" variant="tonal" color="deep-purple" class="ml-2">
					{{ curated.length }} accepted
				</v-chip>
			</div>
			<div v-if="curated.length">
				<v-chip
					v-for="item in curated"
					:key="`${item.standard}|${item.name}`"
					size="small"
					color="deep-purple"
					variant="tonal"
					closable
					class="mr-1 mb-1"
					:title="item.detail || `${item.standard}: ${item.name}`"
					@click:close="store.removeUserEquivalent(curationKey, item)"
				>
					<strong class="mr-1">{{ item.standard }}:</strong> {{ item.name }}
				</v-chip>
			</div>
			<p v-else class="text-caption text-medium-emphasis mb-0">
				Nothing accepted yet — click the <v-icon size="14">mdi-plus-circle-outline</v-icon>
				on any mapping below to promote it into this element&#39;s equivalence set.
			</p>
		</div>

		<v-divider class="mb-5" />

		<!-- Provenance of everything below -->
		<div class="d-flex align-center flex-wrap ga-2 mb-4">
			<v-icon size="18" color="indigo">mdi-graph-outline</v-icon>
			<span class="text-subtitle-2 font-weight-bold">Cross-specification mappings</span>
			<v-chip
				size="x-small"
				variant="tonal"
				:color="store.graphSource === 'snapshot' ? 'grey-darken-1' : 'indigo'"
				:title="store.graphSource === 'snapshot'
					? 'The live EDUcore endpoint is unavailable; results come from a bundled snapshot of the graph.'
					: 'Resolved live from the EDUcore knowledge graph.'"
			>
				{{ store.graphSource === 'snapshot'
					? `EDUcore snapshot · ${store.snapshotDate}`
					: 'live · EDUcore graph' }}
			</v-chip>
		</div>

		<v-progress-linear v-if="store.mappingsLoading" indeterminate color="indigo" class="mb-3" />

		<v-alert v-if="store.mappingsError" type="warning" density="compact" variant="tonal" class="mb-2">
			{{ store.mappingsError }}
		</v-alert>

		<!-- ── Tier 1: authoritative, by composition through a CEDS hub ── -->
		<div class="mb-6">
			<div class="d-flex align-center flex-wrap ga-2 mb-2">
				<v-icon size="18" color="success">mdi-check-decagram</v-icon>
				<span class="text-subtitle-2 font-weight-bold">Authoritative equivalents</span>
				<v-chip size="x-small" variant="flat" color="success">verified · both legs</v-chip>
				<v-chip v-if="authoritativeRows.length" size="x-small" variant="text">
					{{ authoritativeRows.length }} across {{ groupedAuthoritative.length }} spec(s)
				</v-chip>
			</div>

			<p class="text-caption text-medium-emphasis mb-3">
				No standard's documentation crosswalks directly to another's — each maps to
				CEDS — so these hold <strong>by composition</strong>: each of these and the
				{{ element?.standard }} element are verified against
				the same CEDS concept.
				<span v-if="authoritativeHubs.length">
					Via
					<em v-for="(hub, i) in authoritativeHubs.slice(0, 3)" :key="hub">
						{{ hub }}<span v-if="i < Math.min(authoritativeHubs.length, 3) - 1">, </span>
					</em><span v-if="authoritativeHubs.length > 3">
						and {{ authoritativeHubs.length - 3 }} more</span>.
				</span>
			</p>

			<div v-if="groupedAuthoritative.length">
				<div v-for="[standard, list] in groupedAuthoritative" :key="standard" class="mb-4">
					<div class="d-flex align-center mb-2">
						<v-chip size="small" :color="stdColor(standard)" variant="flat" label>
							{{ standard }}
						</v-chip>
						<span class="text-caption text-medium-emphasis ml-2">{{ list.length }} verified</span>
					</div>

					<v-card
						v-for="(row, i) in list"
						:key="i"
						variant="outlined"
						class="mb-2 authoritative-card"
						:style="{ borderLeft: `3px solid rgb(var(--v-theme-${stdColor(standard)}))` }"
					>
						<v-card-text class="py-2">
							<div class="d-flex align-center flex-wrap ga-1">
								<span class="text-body-2 font-weight-medium">{{ row.name }}</span>
								<v-chip
									size="x-small"
									variant="flat"
									color="success"
									:title="`${element?.standard} —${row.selfRel}→ hub —${row.rel}→ ${row.standard}`"
								>
									<v-icon start size="12">mdi-check-decagram</v-icon>
									{{ relLabel(row.rel) }}
								</v-chip>
								<v-chip
									size="x-small"
									:color="hasScore(row) ? scoreColor(row.score) : 'grey'"
									:variant="row.scoreBasis === 'similarity' ? 'tonal' : 'flat'"
									:title="scoreTitle(row)"
								>
									<v-icon v-if="scoreIcon(row)" start size="11">{{ scoreIcon(row) }}</v-icon>
									{{ scoreText(row) }}
								</v-chip>
								<v-chip v-if="row.sourceId" size="x-small" variant="text">{{ row.sourceId }}</v-chip>
								<v-btn
									size="x-small"
									variant="text"
									class="ml-auto"
									:icon="isCurated(rowItem(row)) ? 'mdi-check-circle' : 'mdi-plus-circle-outline'"
									:color="isCurated(rowItem(row)) ? 'success' : 'deep-purple'"
									:title="isCurated(rowItem(row)) ? 'In your crosswalk — click to remove' : 'Add to your crosswalk'"
									@click="toggleCurated(rowItem(row))"
								/>
							</div>
							<div v-if="row.description" class="text-caption text-medium-emphasis mt-1">
								{{ row.description }}
							</div>
							<div v-if="row.hub" class="text-caption text-disabled mt-1">
								via CEDS hub <em>{{ row.hub }}</em>
							</div>
						</v-card-text>
					</v-card>
				</div>
			</div>

			<p
				v-else-if="ran && !store.mappingsLoading && !store.mappingsError"
				class="text-caption text-medium-emphasis"
			>
				No authoritative equivalents — this element's own edge to its hub is not a
				verified match, so nothing beyond it can be asserted.
			</p>
		</div>

		<v-divider class="mb-5" />

		<!-- ── Tier 2: implied, at least one similarity-derived leg ────── -->
		<div>
			<div class="d-flex align-center flex-wrap ga-2 mb-2">
				<v-icon size="18" color="amber-darken-2">mdi-lightbulb-outline</v-icon>
				<span class="text-subtitle-2 font-weight-bold">Implied mappings</span>
				<v-chip size="x-small" variant="tonal" color="amber-darken-2">
					inferred · not authoritative
				</v-chip>
				<v-chip v-if="impliedRows.length" size="x-small" variant="text">
					{{ impliedRows.length }} across {{ groupedImplied.length }} spec(s)
				</v-chip>
			</div>

			<p class="text-caption text-medium-emphasis mb-3">
				Similarity-derived correspondences from every specification other than
				<strong>{{ element?.standard }}</strong> — hypotheses to confirm, not facts
				to trust.
			</p>

			<div v-if="groupedImplied.length">
				<div v-for="[standard, list] in groupedImplied" :key="standard" class="mb-4">
					<div class="d-flex align-center mb-2">
						<v-chip size="small" :color="stdColor(standard)" variant="flat" label>
							{{ standard }}
						</v-chip>
						<span class="text-caption text-medium-emphasis ml-2">{{ list.length }} implied</span>
					</div>

					<v-card
						v-for="(row, i) in list"
						:key="i"
						variant="outlined"
						class="mb-2"
						:style="{ borderLeft: `3px solid rgb(var(--v-theme-${stdColor(standard)}))` }"
					>
						<v-card-text class="py-2">
							<div class="d-flex align-center flex-wrap ga-1">
								<span class="text-body-2 font-weight-medium">{{ row.name }}</span>
								<v-chip
									size="x-small"
									variant="tonal"
									color="amber-darken-2"
									:title="`${element?.standard} —${row.selfRel || 'unknown'}→ hub —${row.rel}→ ${row.standard}. The pair is only as strong as its weaker leg.`"
								>
									{{ relLabel(weakestRel(row)) }}
									<span v-if="row.selfRel && row.selfRel !== row.rel" class="ml-1 text-disabled">
										({{ relLabel(row.selfRel) }} → {{ relLabel(row.rel) }})
									</span>
								</v-chip>
								<v-chip
									size="x-small"
									:color="hasScore(row) ? scoreColor(row.score) : 'grey'"
									:variant="row.scoreBasis === 'similarity' ? 'tonal' : 'flat'"
									:title="scoreTitle(row)"
								>
									<v-icon v-if="scoreIcon(row)" start size="11">{{ scoreIcon(row) }}</v-icon>
									{{ scoreText(row) }}
								</v-chip>
								<v-chip v-if="row.sourceId" size="x-small" variant="text">{{ row.sourceId }}</v-chip>
								<v-btn
									size="x-small"
									variant="text"
									class="ml-auto"
									:icon="isCurated(rowItem(row)) ? 'mdi-check-circle' : 'mdi-plus-circle-outline'"
									:color="isCurated(rowItem(row)) ? 'success' : 'deep-purple'"
									:title="isCurated(rowItem(row)) ? 'In your crosswalk — click to remove' : 'Add to your crosswalk'"
									@click="toggleCurated(rowItem(row))"
								/>
							</div>
							<div v-if="row.description" class="text-caption text-medium-emphasis mt-1">
								{{ row.description }}
							</div>
							<div v-if="row.hub" class="text-caption text-disabled mt-1">
								via hub <em>{{ row.hub }}</em>
							</div>
						</v-card-text>
					</v-card>
				</div>
			</div>

			<p
				v-else-if="ran && !store.mappingsLoading && !store.mappingsError"
				class="text-caption text-medium-emphasis"
			>
				No implied mappings for <code>{{ element?.name }}</code>.
			</p>
		</div>
	</div>
</template>
