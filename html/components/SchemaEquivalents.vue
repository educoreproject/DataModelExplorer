<script setup>
// @concept: [[SchemaVerifier]]
// Resolves a single term (an OpenAPI property name or a crosswalk element) into
// its HR Open equivalent (bundled crosswalk) and its CEDS / cross-standard
// equivalents (live EDUcore graph lookup). Used by the Schema Verifier page in
// both Crosswalk and OpenAPI modes.

import { ref, watch, computed } from 'vue';
import { useSchemaVerifierStore } from '@/stores/schemaVerifierStore';

const store = useSchemaVerifierStore();

const props = defineProps({
	// Free-text term to resolve (property name, element name, or path).
	term: { type: String, default: '' },
	// Optional authoritative HR Open mapping to pin at the top (a crosswalk element).
	hrOpenSeed: { type: Object, default: null },
	// Optional section context ({ id, group, label, title }) the term belongs to.
	// Used to rank crosswalk matches by category proximity (same section / same
	// Organization-vs-Worker group first), reducing cross-category false positives.
	context: { type: Object, default: null },
	// Auto-run the live graph lookup when the term changes (vs. on-demand button).
	auto: { type: Boolean, default: true },
});

const hrMatches = ref([]);
const graphRows = ref([]);
const ran = ref(false);

// ── User-curated equivalence crosswalk ─────────────────────────────
// Every suggestion below (HR Open match, graph node, related chip) can be
// toggled into a per-element curated set, persisted by the store.

const curationKey = computed(() =>
	props.hrOpenSeed?.id || (props.context?.id ? `${props.context.id}::${props.term}` : `term::${props.term}`),
);
const curated = computed(() => store.userEquivalentsFor(curationKey.value));
const isCurated = (item) => store.hasUserEquivalent(curationKey.value, item);
const toggleCurated = (item) => {
	if (isCurated(item)) store.removeUserEquivalent(curationKey.value, item);
	else store.addUserEquivalent(curationKey.value, item);
};

const hrItem = (m) => ({
	standard: 'HR Open',
	name: m.name,
	sourceId: m.id,
	rel: 'crosswalk',
	detail: m.hrOpenProperty,
});
const nodeItem = (row) => ({
	standard: row.standard,
	name: row.name,
	sourceId: row.sourceId || '',
	rel: 'node',
	detail: row.description || '',
});
const relItem = (rel) => ({
	standard: rel.standard,
	name: rel.name,
	rel: rel.rel,
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

// The two broad information types in the dictionary. Colour-coding the group on
// each match makes it obvious at a glance whether a suggestion is an
// Organization-level fact (relatively stable) or a Worker-level one.
const GROUP_COLORS = { Organization: 'blue-darken-1', Worker: 'deep-orange-darken-1' };
const groupColor = (g) => GROUP_COLORS[g] || 'grey';

// CEDS gets pulled to the front — it's the headline equivalence the tool promises.
function groupByStandard(rows) {
	const groups = {};
	for (const r of rows) (groups[r.standard] ||= []).push(r);
	return Object.entries(groups).sort(([a], [b]) =>
		(b === 'CEDS') - (a === 'CEDS') || a.localeCompare(b),
	);
}

const groupedGraph = ref([]);

async function run() {
	const matches = store.findHrOpen(props.term, { context: props.context });
	// Don't echo the element we're already pinning as the authoritative mapping.
	hrMatches.value = props.hrOpenSeed
		? matches.filter((m) => m.id !== props.hrOpenSeed.id)
		: matches;
	graphRows.value = await store.lookupGraph(props.term);
	groupedGraph.value = groupByStandard(graphRows.value);
	ran.value = true;
}

watch(
	() => [props.term, props.context?.id],
	([t]) => {
		hrMatches.value = [];
		graphRows.value = [];
		groupedGraph.value = [];
		ran.value = false;
		if (t && props.auto) run();
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
					v-for="(item, i) in curated"
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
				on any suggestion below (or a match chip) to build this element's equivalence set.
			</p>
		</div>

		<v-divider class="mb-5" />

		<!-- ── HR Open equivalents ───────────────────────────────── -->
		<div class="mb-5">
			<div class="d-flex align-center mb-2">
				<v-icon size="18" color="teal" class="mr-2">mdi-link-variant</v-icon>
				<span class="text-subtitle-2 font-weight-bold">HR Open equivalents</span>
				<v-chip size="x-small" variant="tonal" color="teal" class="ml-2">crosswalk</v-chip>
			</div>

			<!-- Pinned authoritative mapping (when launched from a crosswalk element) -->
			<v-card v-if="hrOpenSeed" variant="tonal" color="teal" class="mb-2">
				<v-card-text class="py-3">
					<div class="d-flex align-center mb-1">
						<v-chip size="x-small" color="teal" variant="flat" class="mr-2">authoritative</v-chip>
						<code class="hr-path">{{ hrOpenSeed.hrOpenProperty }}</code>
					</div>
					<div v-if="hrOpenSeed.hrOpenFilter" class="text-caption text-medium-emphasis mb-1">
						<strong>Filter:</strong> <code>{{ hrOpenSeed.hrOpenFilter }}</code>
					</div>
					<div v-if="hrOpenSeed.hrOpenDescription" class="text-body-2">
						{{ hrOpenSeed.hrOpenDescription }}
					</div>
				</v-card-text>
			</v-card>

			<!-- Name-matched suggestions -->
			<div v-if="hrMatches.length">
				<v-card
					v-for="(m, i) in hrMatches"
					:key="i"
					variant="outlined"
					class="mb-2"
				>
					<v-card-text class="py-2">
						<div class="d-flex align-center flex-wrap ga-1 mb-1">
							<v-chip
								v-if="m.group"
								size="x-small"
								:color="groupColor(m.group)"
								variant="flat"
								label
								:title="`${m.group}-level information`"
							>
								{{ m.group }}
							</v-chip>
							<v-chip size="x-small" variant="tonal">{{ m.id }}</v-chip>
							<span class="text-body-2 font-weight-medium">{{ m.name }}</span>
							<v-chip size="x-small" variant="text" class="ml-auto">{{ m.sectionLabel }}</v-chip>
							<v-chip size="x-small" :color="m.score >= 0.99 ? 'success' : 'grey'" variant="tonal">
								{{ Math.round(m.score * 100) }}% match
							</v-chip>
							<v-btn
								size="x-small"
								variant="text"
								:icon="isCurated(hrItem(m)) ? 'mdi-check-circle' : 'mdi-plus-circle-outline'"
								:color="isCurated(hrItem(m)) ? 'success' : 'deep-purple'"
								:title="isCurated(hrItem(m)) ? 'In your crosswalk — click to remove' : 'Add to your crosswalk'"
								@click="toggleCurated(hrItem(m))"
							/>
						</div>
						<code class="hr-path d-block">{{ m.hrOpenProperty }}</code>
						<div v-if="m.hrOpenFilter" class="text-caption text-medium-emphasis mt-1">
							<strong>Filter:</strong> <code>{{ m.hrOpenFilter }}</code>
						</div>
					</v-card-text>
				</v-card>
			</div>
			<p v-else-if="!hrOpenSeed" class="text-caption text-medium-emphasis">
				No HR Open crosswalk match by name.
			</p>
		</div>

		<v-divider class="mb-5" />

		<!-- ── CEDS / cross-standard equivalents (live graph) ───────── -->
		<div>
			<div class="d-flex align-center mb-2">
				<v-icon size="18" color="indigo" class="mr-2">mdi-graph-outline</v-icon>
				<span class="text-subtitle-2 font-weight-bold">CEDS &amp; cross-standard equivalents</span>
				<v-chip
					size="x-small"
					variant="tonal"
					:color="store.graphSource === 'snapshot' ? 'grey-darken-1' : 'indigo'"
					class="ml-2"
					:title="store.graphSource === 'snapshot'
						? 'The live EDUcore endpoint is unavailable; results come from a bundled snapshot of the graph.'
						: 'Resolved live from the EDUcore knowledge graph.'"
				>
					{{ store.graphSource === 'snapshot'
						? `EDUcore snapshot · ${store.snapshotDate}`
						: 'live · EDUcore graph' }}
				</v-chip>
			</div>

			<v-btn
				v-if="!auto && !ran"
				size="small"
				variant="tonal"
				color="indigo"
				prepend-icon="mdi-magnify"
				:loading="store.graphLoading"
				class="mb-2"
				@click="run"
			>
				Look up in EDUcore
			</v-btn>

			<v-progress-linear v-if="store.graphLoading" indeterminate color="indigo" class="mb-3" />

			<v-alert v-if="store.graphError" type="warning" density="compact" variant="tonal" class="mb-2">
				{{ store.graphError }}
			</v-alert>

			<div v-if="groupedGraph.length">
				<div v-for="[standard, rows] in groupedGraph" :key="standard" class="mb-4">
					<div class="d-flex align-center mb-2">
						<v-chip size="small" :color="stdColor(standard)" variant="flat" label>
							{{ standard }}
						</v-chip>
						<span class="text-caption text-medium-emphasis ml-2">{{ rows.length }} node(s)</span>
					</div>

					<v-card
						v-for="(row, i) in rows"
						:key="i"
						variant="outlined"
						class="mb-2"
						:style="{ borderLeft: `3px solid rgb(var(--v-theme-${stdColor(standard)}))` }"
					>
						<v-card-text class="py-2">
							<div class="d-flex align-center flex-wrap ga-1">
								<span class="text-body-2 font-weight-medium">{{ row.name }}</span>
								<v-chip v-if="row.sourceId" size="x-small" variant="text">{{ row.sourceId }}</v-chip>
								<v-btn
									size="x-small"
									variant="text"
									class="ml-auto"
									:icon="isCurated(nodeItem(row)) ? 'mdi-check-circle' : 'mdi-plus-circle-outline'"
									:color="isCurated(nodeItem(row)) ? 'success' : 'deep-purple'"
									:title="isCurated(nodeItem(row)) ? 'In your crosswalk — click to remove' : 'Add to your crosswalk'"
									@click="toggleCurated(nodeItem(row))"
								/>
							</div>
							<div v-if="row.description" class="text-caption text-medium-emphasis mt-1">
								{{ row.description }}
							</div>

							<!-- cross-standard neighbours of this node -->
							<div v-if="row.related.length" class="mt-2">
								<v-chip
									v-for="(rel, j) in row.related"
									:key="j"
									size="x-small"
									class="mr-1 mb-1 rel-chip"
									:color="isCurated(relItem(rel)) ? 'deep-purple' : (rel.authoritative ? 'success' : 'amber-darken-2')"
									:variant="isCurated(relItem(rel)) ? 'flat' : (rel.authoritative ? 'flat' : 'tonal')"
									:title="(isCurated(relItem(rel))
										? 'In your crosswalk — click to remove. '
										: 'Click to add to your crosswalk. ')
										+ (rel.authoritative
											? 'EXACT_MATCH — hub-verified equivalence'
											: `${rel.rel} — related, not exact`)"
									@click="toggleCurated(relItem(rel))"
								>
									<v-icon start size="12">
										{{ isCurated(relItem(rel))
											? 'mdi-check-circle'
											: (rel.authoritative ? 'mdi-check-decagram' : 'mdi-lightbulb-outline') }}
									</v-icon>
									{{ rel.standard }}: {{ rel.name }}
								</v-chip>
							</div>
						</v-card-text>
					</v-card>
				</div>
			</div>

			<p
				v-else-if="ran && !store.graphLoading && !store.graphError"
				class="text-caption text-medium-emphasis"
			>
				No matching nodes found in the EDUcore graph for
				<code>{{ term }}</code>. Try a broader or differently-worded term.
			</p>
		</div>
	</div>
</template>

<style scoped>
.rel-chip {
	cursor: pointer;
}

.hr-path {
	font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
	font-size: 0.78rem;
	color: #00695c;
	word-break: break-all;
}
</style>
