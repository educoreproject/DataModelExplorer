<script setup>
// @concept: [[SchemaVerifier]]
// @concept: [[SemanticSearch]]
//
// Search for a TARGET field to map to. Two ways to ask:
//
//   Similar to this element — available when the thing being mapped is a graph
//     element: candidates are ranked by cosine similarity between its embedding
//     and theirs (no embedding API; the anchor is the element's own vector).
//   By text — type what you are looking for ("grade level", "date of birth"):
//     the server embeds the phrase with the graph's model and ranks by meaning,
//     so wording need not match. Works for anything, including HR Open and
//     OpenAPI terms that have no graph node.
//
// Either way the text box narrows candidates by name / description / path and
// any hit can be accepted into the crosswalk. Used by SpecCrossMappings (both
// modes) and SchemaEquivalents (text mode).

import { ref, computed, watch, onMounted } from 'vue';
import { useSchemaVerifierStore } from '@/stores/schemaVerifierStore';

const store = useSchemaVerifierStore();

const props = defineProps({
	// Graph element being mapped ({ source, name, path }) — enables "similar" mode.
	anchor: { type: Object, default: null },
	// Spec code to leave out of results (the source side of the mapping).
	excludeSource: { type: String, default: '' },
	// Seed for the text box in text mode (e.g. the OpenAPI property name).
	defaultQuery: { type: String, default: '' },
	// Curation hooks from the parent (they own the curation key).
	isCurated: { type: Function, required: true },
	toggle: { type: Function, required: true },
	// Start expanded.
	open: { type: Boolean, default: false },
});

const isOpen = ref(props.open);
watch(() => props.open, (v) => { if (v) isOpen.value = true; });

const mode = ref(props.anchor ? 'similar' : 'text'); // 'similar' | 'text'
const target = ref(''); // '' = every other specification
const query = ref(props.defaultQuery || '');
const kinds = ref('property,class');
const rows = ref([]);
const basis = ref(''); // 'semantic' | 'lexical' | 'similarity' (snapshot)
const loading = ref(false);
const ran = ref(false);
const error = ref('');

const targetItems = computed(() => [
	{ title: 'All other specifications', value: '', subtitle: 'ranked across the whole graph' },
	...store.specs
		.filter((s) => s.source !== props.excludeSource)
		.map((s) => ({ title: s.standard, value: s.source, subtitle: s.organization })),
]);

const canRun = computed(() => (mode.value === 'similar' ? !!props.anchor : query.value.trim().length >= 2));

async function run() {
	if (!canRun.value) {
		rows.value = [];
		ran.value = false;
		return;
	}
	loading.value = true;
	error.value = '';
	try {
		const result =
			mode.value === 'similar'
				? await store.searchSpecElements({
						element: props.anchor,
						target: target.value,
						q: query.value.trim(),
						kinds: kinds.value,
					})
				: await store.searchTargetFields({
						q: query.value.trim(),
						target: target.value,
						exclude: props.excludeSource,
						kinds: kinds.value,
					});
		rows.value = result.rows;
		basis.value = result.basis;
		ran.value = true;
	} catch (err) {
		error.value = err.message || 'Search failed.';
	} finally {
		loading.value = false;
	}
}

let timer = null;
const schedule = () => {
	if (!isOpen.value) return;
	clearTimeout(timer);
	timer = setTimeout(run, 350);
};
watch([target, query, kinds, mode], schedule);
watch(isOpen, (open) => {
	if (open) {
		if (!store.specs.length) store.loadSpecifications();
		if (!ran.value) run();
	}
});
// A new anchor (or a new term) is a new question.
watch(
	() => [props.anchor?.source, props.anchor?.name, props.anchor?.path, props.defaultQuery],
	() => {
		rows.value = [];
		ran.value = false;
		error.value = '';
		if (!props.anchor && mode.value === 'similar') mode.value = 'text';
		if (props.defaultQuery && mode.value === 'text' && !query.value) query.value = props.defaultQuery;
		if (isOpen.value) run();
	},
);
onMounted(() => {
	if (isOpen.value) {
		if (!store.specs.length) store.loadSpecifications();
		run();
	}
});

const toItem = (row) => ({
	standard: row.standard,
	name: row.name,
	sourceId: row.sourceId || '',
	targetPath: row.path || '',
	rel: 'manual',
	detail: row.description || '',
});

const STANDARD_COLORS = {
	CEDS: 'indigo', JEDx: 'teal', 'Ed-API': 'deep-purple', SIF: 'blue', 'Ed-Fi': 'cyan', CTDL: 'green',
	PESC: 'brown', SEDM: 'orange', LIF: 'pink', CLR: 'deep-orange', 'Open Badges': 'amber', CASE: 'blue-grey',
	MedBiquitous: 'purple', SOC: 'lime-darken-2', CIP: 'light-blue-darken-2', CTDLASN: 'green-darken-3',
	CTDLQData: 'teal-darken-3', DCTAP: 'grey-darken-1',
};
const stdColor = (s) => STANDARD_COLORS[s] || 'grey';
const KIND_COLORS = { class: 'indigo', property: 'blue-grey', value: 'brown' };
const kindColor = (k) => KIND_COLORS[k] || 'grey';

const pct = (row) => `${Math.round((row.score || 0) * 100)}%`;
const scoreColor = (row) => {
	const v = Math.round((row.score || 0) * 100);
	if (row.scoreBasis !== 'semantic') return v >= 60 ? 'lime-darken-3' : 'grey';
	if (v >= 88) return 'success';
	if (v >= 80) return 'lime-darken-3';
	if (v >= 70) return 'amber-darken-3';
	return 'grey';
};
const scoreTitle = (row) =>
	row.scoreBasis === 'semantic'
		? `${pct(row)} — cosine similarity of embeddings (meaning, not spelling)`
		: `${pct(row)} — label match only`;

const BASIS_LABEL = { semantic: 'semantic · live', lexical: 'text match · live', similarity: 'text match · snapshot' };
const BASIS_ICON = { semantic: 'mdi-vector-triangle', lexical: 'mdi-format-letter-matches', similarity: 'mdi-approximately-equal' };
const basisTitle = computed(() => ({
	semantic: 'Ranked by meaning using the graph\'s embeddings.',
	lexical: 'The embedding service was unavailable; ranked by label match against the live graph.',
	similarity: 'Live graph unavailable; label match over the bundled snapshot.',
}[basis.value] || ''));
</script>

<template>
	<div>
		<div class="d-flex align-center flex-wrap ga-2 mb-2 tfs-header" @click="isOpen = !isOpen">
			<v-icon size="18" color="deep-purple">mdi-text-search-variant</v-icon>
			<span class="text-subtitle-2 font-weight-bold">Find a target field</span>
			<v-chip
				v-if="basis"
				size="x-small"
				variant="tonal"
				:color="basis === 'semantic' ? 'deep-purple' : 'grey-darken-1'"
				:title="basisTitle"
			>
				<v-icon start size="11">{{ BASIS_ICON[basis] }}</v-icon>
				{{ BASIS_LABEL[basis] }}
			</v-chip>
			<v-spacer />
			<v-btn size="x-small" variant="text" :icon="isOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'" />
		</div>

		<v-expand-transition>
			<div v-if="isOpen">
				<p class="text-caption text-medium-emphasis mb-3">
					Search any specification for the field this should map to. Results are ordered by how
					close their <em>meaning</em> is, so the best candidate is usually first even when the
					wording differs. Accept one with <v-icon size="14">mdi-plus-circle-outline</v-icon>.
				</p>

				<div class="d-flex flex-wrap align-center ga-2 mb-3">
					<v-btn-toggle
						v-if="anchor"
						v-model="mode"
						mandatory
						density="compact"
						variant="outlined"
						color="deep-purple"
					>
						<v-btn value="similar" size="small" title="Rank by similarity to the selected element">
							<v-icon start size="14">mdi-vector-triangle</v-icon> Similar to this
						</v-btn>
						<v-btn value="text" size="small" title="Rank by similarity to what you type">
							<v-icon start size="14">mdi-form-textbox</v-icon> By text
						</v-btn>
					</v-btn-toggle>

					<v-autocomplete
						v-model="target"
						:items="targetItems"
						item-title="title"
						item-value="value"
						label="Search in"
						prepend-inner-icon="mdi-book-open-variant"
						variant="outlined"
						density="compact"
						hide-details
						:loading="store.specsLoading"
						style="min-width: 220px; flex: 1 1 220px;"
					>
						<template #item="{ props: itemProps, item }">
							<v-list-item v-bind="itemProps" :subtitle="item.raw.subtitle" />
						</template>
					</v-autocomplete>

					<v-text-field
						v-model="query"
						:label="mode === 'text' ? 'What are you looking for? (e.g. grade level, date of birth)' : 'Narrow by name, description or path (optional)'"
						prepend-inner-icon="mdi-magnify"
						variant="outlined"
						density="compact"
						hide-details
						clearable
						autofocus
						style="min-width: 260px; flex: 2 1 300px;"
						@keyup.enter="run"
					/>

					<v-btn-toggle v-model="kinds" mandatory density="compact" variant="outlined" color="deep-purple">
						<v-btn value="property,class" size="small" title="Properties and classes">Fields</v-btn>
						<v-btn value="value" size="small" title="Code-list values">Values</v-btn>
					</v-btn-toggle>
				</div>

				<v-progress-linear v-if="loading" indeterminate color="deep-purple" class="mb-3" />
				<v-alert v-if="error" type="warning" density="compact" variant="tonal" class="mb-2">{{ error }}</v-alert>

				<div v-if="rows.length">
					<v-card
						v-for="row in rows"
						:key="`${row.source}|${row.path || row.name}`"
						variant="outlined"
						class="mb-2"
						:style="{ borderLeft: `3px solid rgb(var(--v-theme-${stdColor(row.standard)}))` }"
					>
						<v-card-text class="py-2">
							<div class="d-flex align-center flex-wrap ga-1">
								<v-chip size="x-small" :color="stdColor(row.standard)" variant="flat" label>{{ row.standard }}</v-chip>
								<v-chip size="x-small" variant="tonal" :color="kindColor(row.kind)">{{ row.kind }}</v-chip>
								<span class="text-body-2 font-weight-medium">{{ row.name }}</span>
								<v-chip
									size="x-small"
									:color="scoreColor(row)"
									:variant="row.scoreBasis === 'semantic' ? 'flat' : 'tonal'"
									:title="scoreTitle(row)"
								>
									<v-icon start size="11">{{ row.scoreBasis === 'semantic' ? 'mdi-vector-triangle' : 'mdi-approximately-equal' }}</v-icon>
									{{ pct(row) }}
								</v-chip>
								<v-chip v-if="row.sourceId" size="x-small" variant="text">{{ row.sourceId }}</v-chip>
								<v-btn
									size="x-small"
									variant="text"
									class="ml-auto"
									:icon="isCurated(toItem(row)) ? 'mdi-check-circle' : 'mdi-plus-circle-outline'"
									:color="isCurated(toItem(row)) ? 'success' : 'deep-purple'"
									:title="isCurated(toItem(row)) ? 'In your crosswalk — click to remove' : 'Add to your crosswalk'"
									@click="toggle(toItem(row))"
								/>
							</div>
							<div v-if="row.path && row.path !== row.name" class="text-caption text-disabled mono mt-1">{{ row.path }}</div>
							<div v-if="row.description" class="text-caption text-medium-emphasis mt-1">{{ row.description }}</div>
						</v-card-text>
					</v-card>
				</div>
				<p v-else-if="ran && !loading && !error" class="text-caption text-medium-emphasis">
					No candidates<span v-if="query"> for <code>{{ query }}</code></span>
					{{ target ? 'in that specification' : 'in any other specification' }}. Try a broader phrase or a
					different specification.
				</p>
				<p v-else-if="!canRun && mode === 'text'" class="text-caption text-medium-emphasis">
					Type at least two characters to search.
				</p>
			</div>
		</v-expand-transition>
	</div>
</template>

<style scoped>
.tfs-header {
	cursor: pointer;
	user-select: none;
}
.mono {
	font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
}
</style>
