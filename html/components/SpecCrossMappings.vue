<script setup>
// @concept: [[SchemaVerifier]]
// @concept: [[CedsHub]]
// The right-hand panel of the Schema Verifier's specification browser.
//
// The graph is a hub-and-spoke ontology: no standard's documentation
// crosswalks directly to another's — each maps to CEDS. So the panel reads the
// way the graph is built:
//
//   1. Your crosswalk      — mappings you have accepted for this element.
//   2. CEDS concepts       — the CEDS concept(s) this element lands on, its own
//                            link to each (exact / close), and every OTHER
//                            standard's element on the same concept, which can
//                            be approved as that element → CEDS concept.
//   3. Find a CEDS concept — semantic search starting in CEDS, for elements the
//                            graph has not linked yet (or to propose another).
//
// "Ed-Fi X ≈ SIF Y" is never asserted directly; it is two spokes on one CEDS
// concept, and that is what the panel shows.

import { ref, computed, watch } from 'vue';
import { useSchemaVerifierStore, elementCurationKey } from '@/stores/schemaVerifierStore';

const store = useSchemaVerifierStore();

const props = defineProps({
	// The element being explained: { name, source, standard, kind, description, sourceId, path }.
	element: { type: Object, default: null },
});

// Curated equivalents are keyed by spec + element name, so the set survives
// re-selecting the element, re-picking the spec, and page reloads. CEDS spoke
// approvals use the same key shape for the SPOKE's element, so they appear here
// when that element is browsed.
const curationKey = computed(() => elementCurationKey(props.element));
// The element being mapped FROM, recorded on every accepted mapping so exports
// read as full source → target rows.
const sourceInfo = computed(() =>
	props.element
		? {
				standard: props.element.standard || props.element.source,
				name: props.element.name,
				sourceId: props.element.sourceId || '',
				// dotted graph path — lets the graph-ingestion export resolve the
				// exact node (LIF has an `identifier` on every entity)
				path: props.element.path || '',
			}
		: null,
);
const curatedPanel = ref(null);
const isCurated = (item) => store.hasUserEquivalent(curationKey.value, item);
// Adding a mapping immediately offers a transformation rule for it.
const toggleCurated = (item) => {
	if (isCurated(item)) {
		store.removeUserEquivalent(curationKey.value, item);
		return;
	}
	store.addUserEquivalent(curationKey.value, item, sourceInfo.value);
	curatedPanel.value?.openRuleFor(item, true);
};

// The CEDS search opens by itself when the element has no CEDS concept, since
// that is the only way forward for it; otherwise it waits, collapsed, as
// "map to a different concept".
const hasConcepts = ref(true);
const searchOpen = ref(false);
function onConcepts(list) {
	hasConcepts.value = list.length > 0;
	searchOpen.value = !hasConcepts.value;
}
watch(
	() => (props.element ? `${props.element.source}|${props.element.path || props.element.name}` : ''),
	() => {
		hasConcepts.value = true;
		searchOpen.value = false;
	},
);

const isCedsElement = computed(() => props.element?.source === 'CEDS');
</script>

<template>
	<div>
		<!-- ── 1. Your crosswalk (accepted, with transformation rules) ── -->
		<div class="mb-5">
			<CuratedMappings ref="curatedPanel" :curation-key="curationKey" :source="sourceInfo" />
		</div>

		<v-divider class="mb-5" />

		<!-- ── 2. CEDS concepts: this element's hub(s) and the other spokes on each ── -->
		<CedsConcepts
			:element="element"
			:is-curated="isCurated"
			:toggle="toggleCurated"
			@concepts="onConcepts"
		/>

		<!-- ── 3. Find a CEDS concept (or another standard's element) by meaning ── -->
		<template v-if="!isCedsElement">
			<v-divider class="my-5" />
			<TargetFieldSearch
				:anchor="element"
				:exclude-source="element?.source || ''"
				:is-curated="isCurated"
				:toggle="toggleCurated"
				:open="searchOpen"
				default-target="CEDS"
				:title="hasConcepts ? 'Map to a different CEDS concept' : 'Find a CEDS concept'"
				:intro="`Starts in CEDS, ranked by how close each concept's meaning is to ${element?.name || 'this element'}. Pick another specification in “Search in” to map to it directly instead.`"
			/>
		</template>
	</div>
</template>
