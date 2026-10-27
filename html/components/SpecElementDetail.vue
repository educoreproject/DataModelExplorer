<script setup>
// @concept: [[SpecificationViewer]]
// What the standard's own STRUCTURE says about the selected element, from the
// graph's structural edges (see build-spec-models.cjs):
//
//   where it sits      its trail (entity › … › parent), shown by the page header
//   what it is         class / property / code, and the standard's own id
//   what it extends    SUBCLASS_OF — "extends Organization"
//   what it holds      a property typed by a class (REFERENCES) — opens that class
//   its code list      HAS_OPTION_SET → HAS_VALUE — the codes, loaded on demand;
//                      a code opens as an element so its CEDS concept shows
//
// Emits: open-type (the property, to jump to its type), select-code (a code as
// an element).

import { ref, computed, watch } from 'vue';
import { useSpecificationViewerStore } from '@/stores/specificationViewerStore';

const store = useSpecificationViewerStore();

const props = defineProps({
	element: { type: Object, default: null },
});
const emit = defineEmits(['open-type', 'select-code']);

const KIND_WORD = { class: 'Class', property: 'Property', value: 'Code' };
const kindWord = computed(() => KIND_WORD[props.element?.kind] || 'Element');

const hasFacts = computed(
	() => !!props.element && (props.element.typeName || props.element.extends || props.element.codeListId || props.element.sourceId),
);

// ── Code list ───────────────────────────────────────────────────────
const codeList = ref(null);
const codesLoading = ref(false);
const codesError = ref('');
const codesOpen = ref(false);
const codeFilter = ref('');
const CODES_SHOWN = 40;
const showAllCodes = ref(false);

async function loadCodes() {
	if (!props.element?.codeListId) return;
	codesLoading.value = true;
	codesError.value = '';
	try {
		codeList.value = await store.loadCodeList(props.element);
	} catch (err) {
		codesError.value = err.message || 'Could not load the code list.';
	} finally {
		codesLoading.value = false;
	}
}

watch(
	() => (props.element ? `${props.element.source}|${props.element.stableId}|${props.element.path}` : ''),
	() => {
		codeList.value = null;
		codeFilter.value = '';
		showAllCodes.value = false;
		// short lists open by themselves; long ones wait for a click
		codesOpen.value = !!props.element?.codeListId && (props.element.codeCount || 0) <= 25;
		if (codesOpen.value) loadCodes();
	},
	{ immediate: true },
);
watch(codesOpen, (open) => {
	if (open && !codeList.value) loadCodes();
});

const filteredCodes = computed(() => {
	const values = codeList.value?.values || [];
	const q = codeFilter.value.trim().toLowerCase();
	return q ? values.filter((v) => v.name.toLowerCase().includes(q) || v.description.toLowerCase().includes(q)) : values;
});
const shownCodes = computed(() => (showAllCodes.value ? filteredCodes.value : filteredCodes.value.slice(0, CODES_SHOWN)));

function openCode(value) {
	emit('select-code', store.codeValueElement(props.element, value));
}
</script>

<template>
	<div v-if="hasFacts" class="spec-element-detail">
		<!-- one line of structural facts -->
		<div class="d-flex align-center flex-wrap ga-2">
			<v-chip size="small" variant="tonal" color="indigo" label>{{ kindWord }}</v-chip>
			<span v-if="element.sourceId" class="text-caption text-medium-emphasis mono" :title="'The standard\'s own identifier'">
				{{ element.sourceId }}
			</span>
			<span v-if="element.extends" class="text-body-2">
				<span class="text-medium-emphasis">extends</span> <strong>{{ element.extends }}</strong>
			</span>
			<span v-if="element.typeName" class="text-body-2 d-inline-flex align-center">
				<span class="text-medium-emphasis mr-1">holds a</span>
				<v-btn
					size="small"
					variant="tonal"
					color="primary"
					append-icon="mdi-arrow-right"
					class="text-none"
					:title="`Open the class ${element.typeName}`"
					@click="emit('open-type', element)"
				>
					{{ element.typeName }}
				</v-btn>
			</span>
		</div>

		<!-- code list -->
		<div v-if="element.codeListId" class="code-list mt-3">
			<div class="d-flex align-center ga-2 code-list-head" @click="codesOpen = !codesOpen">
				<v-icon size="18" color="brown">mdi-format-list-numbered</v-icon>
				<span class="text-subtitle-2 font-weight-bold">Code list</span>
				<span v-if="codeList?.name" class="text-caption text-medium-emphasis">{{ codeList.name }}</span>
				<v-chip size="x-small" variant="tonal" color="brown">{{ element.codeCount }} codes</v-chip>
				<v-spacer />
				<v-btn size="x-small" variant="text" :icon="codesOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'" />
			</div>
			<v-expand-transition>
				<div v-if="codesOpen" class="mt-2">
					<v-progress-linear v-if="codesLoading" indeterminate color="brown" class="mb-2" />
					<v-alert v-if="codesError" type="warning" density="compact" variant="tonal" class="mb-2">{{ codesError }}</v-alert>
					<v-text-field
						v-if="(codeList?.values.length || 0) > 12"
						v-model="codeFilter"
						prepend-inner-icon="mdi-magnify"
						:placeholder="`Filter ${codeList.values.length} codes…`"
						variant="outlined"
						density="compact"
						hide-details
						clearable
						class="mb-2"
					/>
					<div class="code-grid">
						<button
							v-for="v in shownCodes"
							:key="v.name"
							type="button"
							class="code-row text-left"
							:title="`${v.description || v.name} — click to see this code's CEDS concept`"
							@click="openCode(v)"
						>
							<span class="text-body-2">{{ v.name }}</span>
							<span v-if="v.description" class="text-caption text-medium-emphasis code-desc">{{ v.description }}</span>
						</button>
					</div>
					<v-btn
						v-if="filteredCodes.length > CODES_SHOWN"
						size="x-small"
						variant="text"
						class="mt-1"
						@click="showAllCodes = !showAllCodes"
					>
						{{ showAllCodes ? 'Show fewer' : `Show all ${filteredCodes.length}` }}
					</v-btn>
					<p v-if="codeList && !filteredCodes.length" class="text-caption text-medium-emphasis mb-0">No code matches.</p>
				</div>
			</v-expand-transition>
		</div>
	</div>
</template>

<style scoped>
.spec-element-detail {
	border-left: 3px solid rgba(var(--v-theme-indigo), 0.35);
	padding-left: 12px;
}
.code-list-head {
	cursor: pointer;
	user-select: none;
}
.code-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: 4px 12px;
	max-height: 320px;
	overflow-y: auto;
}
.code-row {
	display: flex;
	flex-direction: column;
	padding: 3px 6px;
	border-radius: 6px;
	background: none;
	border: none;
	cursor: pointer;
	transition: background-color 0.15s ease;
}
.code-row:hover {
	background: rgba(var(--v-theme-brown), 0.08);
}
.code-desc {
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
.mono {
	font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
}
</style>
