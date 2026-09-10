<script setup>
// @concept: [[SchemaVerifier]]
// "Your equivalence crosswalk" — the per-element set of mappings the user has
// accepted, each with an optional transformation rule. Shared by the
// specification browser (SpecCrossMappings) and the HR Open / OpenAPI view
// (SchemaEquivalents), so the two write to the same store in the same way.
//
// Parents add mappings themselves (they own the suggestion lists) and then call
// openRuleFor(item, true) so the rule editor appears at the moment of mapping.

import { ref, computed } from 'vue';
import { useSchemaVerifierStore } from '@/stores/schemaVerifierStore';

const store = useSchemaVerifierStore();

const props = defineProps({
	curationKey: { type: String, required: true },
	// The element being mapped FROM: { standard, name, sourceId? }
	source: { type: Object, default: null },
});

const curated = computed(() => store.userEquivalentsFor(props.curationKey));

const dialogOpen = ref(false);
const dialogItem = ref(null);
const dialogJustAdded = ref(false);

function openRuleFor(item, justAdded = false) {
	const current = store.getUserEquivalent(props.curationKey, item);
	if (!current) return;
	dialogItem.value = current;
	dialogJustAdded.value = justAdded;
	dialogOpen.value = true;
}

function saveRule(transform) {
	if (!dialogItem.value) return;
	store.setUserEquivalentTransform(props.curationKey, dialogItem.value, transform);
}

function removeFromDialog() {
	if (!dialogItem.value) return;
	store.removeUserEquivalent(props.curationKey, dialogItem.value);
}

const hasRule = (item) => item.transform && item.transform.type && item.transform.type !== 'direct';
const ruleTitle = (item) => {
	if (!hasRule(item)) return 'Direct copy — click to add a transformation rule';
	const t = item.transform;
	return `${t.type}${t.rule ? `: ${t.rule}` : ''}${t.notes ? `\n${t.notes}` : ''}\n(click to edit)`;
};

defineExpose({ openRuleFor });
</script>

<template>
	<div>
		<div class="d-flex align-center mb-2">
			<v-icon size="18" color="deep-purple" class="mr-2">mdi-table-star</v-icon>
			<span class="text-subtitle-2 font-weight-bold">Your equivalence crosswalk</span>
			<v-chip v-if="curated.length" size="x-small" variant="tonal" color="deep-purple" class="ml-2">
				{{ curated.length }} accepted
			</v-chip>
			<v-chip
				v-if="curated.length"
				size="x-small"
				variant="text"
				class="ml-1"
				:color="store.mappingsPersistence === 'server' ? 'success' : 'grey'"
				:prepend-icon="store.mappingsPersistence === 'server' ? 'mdi-cloud-check-outline' : 'mdi-laptop'"
				:title="store.mappingsPersistence === 'server'
					? 'Saved to your account'
					: 'Saved in this browser only — log in to keep mappings with your account'"
			>
				{{ store.mappingsPersistence === 'server' ? 'saved to account' : 'browser only' }}
			</v-chip>
		</div>

		<div v-if="curated.length">
			<v-chip
				v-for="item in curated"
				:key="`${item.standard}|${item.name}`"
				size="small"
				color="deep-purple"
				:variant="hasRule(item) ? 'flat' : 'tonal'"
				closable
				class="mr-1 mb-1 curated-chip"
				:title="ruleTitle(item)"
				@click="openRuleFor(item)"
				@click:close="store.removeUserEquivalent(curationKey, item)"
			>
				<v-icon start size="14">{{ hasRule(item) ? 'mdi-function-variant' : 'mdi-arrow-right-thin' }}</v-icon>
				<strong class="mr-1">{{ item.standard }}:</strong> {{ item.name }}
				<span v-if="hasRule(item)" class="ml-2 text-caption rule-tag">{{ item.transform.type }}</span>
			</v-chip>
			<p class="text-caption text-medium-emphasis mt-1 mb-0">
				Click a mapping to set how its value is transformed.
			</p>
		</div>
		<p v-else class="text-caption text-medium-emphasis mb-0">
			Nothing accepted yet — click the <v-icon size="14">mdi-plus-circle-outline</v-icon>
			on any suggestion below to add it to this element's equivalence set. You'll be
			offered a transformation rule as you go.
		</p>

		<MappingTransformDialog
			v-model="dialogOpen"
			:mapping="dialogItem"
			:source="source"
			:just-added="dialogJustAdded"
			@save="saveRule"
			@remove="removeFromDialog"
		/>
	</div>
</template>

<style scoped>
.curated-chip {
	cursor: pointer;
}
.rule-tag {
	opacity: 0.85;
	font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
}
</style>
