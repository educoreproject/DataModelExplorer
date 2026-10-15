<script setup>
// @concept: [[SchemaVerifier]]
// Editor for the transformation rule attached to one accepted mapping
// (source element → target element). Opened right after a mapping is added
// ("how does the value get across?") and again from any curated chip to
// revise. The rule is free text whose expected shape depends on the chosen
// type; the hint under the type picker says what to write.

import { ref, watch, computed } from 'vue';
import { TRANSFORM_TYPES } from '@/stores/schemaVerifierStore';

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	// The mapping being described: { standard, name, sourceId?, rel?, detail?, transform? }
	mapping: { type: Object, default: null },
	// The element being mapped FROM: { standard, name, sourceId? }
	source: { type: Object, default: null },
	// True when the dialog opened because the mapping was just added — changes the
	// copy so "Skip" reads as "keep the mapping without a rule", not "cancel".
	justAdded: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'save', 'remove']);

const type = ref('direct');
const rule = ref('');
const notes = ref('');

watch(
	() => [props.modelValue, props.mapping],
	([open]) => {
		if (!open) return;
		const t = props.mapping?.transform || {};
		type.value = t.type || 'direct';
		rule.value = t.rule || '';
		notes.value = t.notes || '';
	},
	{ immediate: true },
);

const activeType = computed(
	() => TRANSFORM_TYPES.find((t) => t.value === type.value) || TRANSFORM_TYPES[0],
);
const needsRule = computed(() => !['direct', 'rename'].includes(type.value));
const canSave = computed(() => !needsRule.value || rule.value.trim().length > 0);

// A value-map is the one type with a checkable syntax; show the parsed pairs so
// the user sees what they wrote is what will be exported.
const valueMapPairs = computed(() => {
	if (type.value !== 'valueMap') return [];
	return rule.value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const m = line.match(/^(.*?)\s*(?:=>|->|→|=|:)\s*(.*)$/);
			return m ? { from: m[1].trim(), to: m[2].trim(), ok: true } : { from: line, to: '', ok: false };
		});
});
const badPairs = computed(() => valueMapPairs.value.filter((p) => !p.ok).length);

function close() {
	emit('update:modelValue', false);
}
function save() {
	if (!canSave.value) return;
	emit('save', { type: type.value, rule: rule.value.trim(), notes: notes.value.trim() });
	close();
}
function remove() {
	emit('remove');
	close();
}
</script>

<template>
	<v-dialog :model-value="modelValue" max-width="640" @update:model-value="emit('update:modelValue', $event)">
		<v-card v-if="mapping">
			<v-card-item>
				<div class="d-flex align-center ga-2">
					<v-icon color="deep-purple">mdi-function-variant</v-icon>
					<span class="text-h6 font-weight-bold">
						{{ justAdded ? 'Mapping added — add a transformation rule?' : 'Transformation rule' }}
					</span>
				</div>
			</v-card-item>

			<v-card-text>
				<!-- The two ends of the mapping -->
				<div class="d-flex align-center flex-wrap ga-2 mb-4 mapping-ends">
					<v-chip v-if="source?.name" size="small" variant="tonal" color="primary" label>
						<strong class="mr-1">{{ source.standard || 'source' }}:</strong> {{ source.name }}
					</v-chip>
					<v-icon size="18" color="grey">mdi-arrow-right</v-icon>
					<v-chip size="small" variant="tonal" color="deep-purple" label>
						<strong class="mr-1">{{ mapping.standard }}:</strong> {{ mapping.name }}
					</v-chip>
					<v-chip v-if="mapping.rel && mapping.rel !== 'node'" size="x-small" variant="text">
						{{ mapping.rel }}
					</v-chip>
				</div>

				<v-select
					v-model="type"
					:items="TRANSFORM_TYPES"
					item-title="title"
					item-value="value"
					label="Transformation type"
					variant="outlined"
					density="comfortable"
					hide-details
					class="mb-1"
				/>
				<p class="text-caption text-medium-emphasis mb-4 hint">{{ activeType.hint }}</p>

				<v-textarea
					v-model="rule"
					:label="needsRule ? 'Rule (required)' : 'Rule (optional)'"
					:placeholder="type === 'valueMap' ? 'M => Male\nF => Female' : ''"
					variant="outlined"
					rows="4"
					auto-grow
					hide-details
					class="mono-area mb-3"
				/>

				<div v-if="type === 'valueMap' && valueMapPairs.length" class="mb-3">
					<div class="text-caption font-weight-bold mb-1">
						Parsed {{ valueMapPairs.length }} pair(s)
						<span v-if="badPairs" class="text-error"> — {{ badPairs }} line(s) not in "a => b" form</span>
					</div>
					<div class="d-flex flex-wrap ga-1">
						<v-chip
							v-for="(p, i) in valueMapPairs"
							:key="i"
							size="x-small"
							:color="p.ok ? 'deep-purple' : 'error'"
							variant="tonal"
							label
						>
							{{ p.from }} <v-icon size="10" class="mx-1">mdi-arrow-right</v-icon> {{ p.to || '?' }}
						</v-chip>
					</div>
				</div>

				<v-textarea
					v-model="notes"
					label="Notes (why, edge cases, language of the expression…)"
					variant="outlined"
					rows="2"
					auto-grow
					hide-details
				/>
			</v-card-text>

			<v-card-actions class="px-6 pb-4">
				<v-btn
					v-if="!justAdded"
					variant="text"
					color="error"
					prepend-icon="mdi-link-off"
					@click="remove"
				>
					Remove mapping
				</v-btn>
				<v-spacer />
				<v-btn variant="text" @click="close">
					{{ justAdded ? 'Skip — keep as direct copy' : 'Cancel' }}
				</v-btn>
				<v-btn color="deep-purple" variant="flat" :disabled="!canSave" @click="save">
					Save rule
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<style scoped>
.hint {
	white-space: pre-line;
}
.mono-area :deep(textarea) {
	font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
	font-size: 0.82rem;
	line-height: 1.5;
}
</style>
