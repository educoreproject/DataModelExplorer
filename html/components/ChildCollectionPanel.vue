<script setup>
// ChildCollectionPanel.vue — collapsible editor for a child collection
// (steps, actors, dataRefs, externalRefs). Supports add/remove/reorder.
// Editing a shared (graph-wide-deduped) child surfaces a shareCount badge.

import DynamicField from './DynamicField.vue';

const props = defineProps({
	title: { type: String, required: true },
	rows: { type: Array, required: true },     // [{ id, properties, shareCount? }]
	propertySpecs: { type: Array, required: true },
	sharedDedup: { type: Boolean, default: false },
	orderKey: { type: String, default: '' }    // e.g., 'stepNumber'
});
const emit = defineEmits(['update', 'add', 'remove']);

const open = ref(true);

const onFieldUpdate = (rowIndex, propName, value) => {
	const newRows = props.rows.slice();
	const existing = newRows[rowIndex];
	newRows[rowIndex] = {
		...existing,
		properties: { ...existing.properties, [propName]: value }
	};
	emit('update', newRows);
};

const remove = (rowIndex) => {
	const newRows = props.rows.slice();
	newRows.splice(rowIndex, 1);
	emit('update', newRows);
	emit('remove', rowIndex);
};

const add = () => {
	const blank = {};
	for (const p of props.propertySpecs) {
		if (p.system || p.readOnly || p.derived) { continue; }
		blank[p.name] = p.type === 'stringArray' ? [] : '';
	}
	// Nudge a default stepNumber for steps.
	if (props.orderKey && (blank[props.orderKey] === '' || blank[props.orderKey] == null)) {
		const max = props.rows.reduce((m, r) => Math.max(m, (r.properties[props.orderKey] || 0)), 0);
		blank[props.orderKey] = max + 1;
	}
	emit('add', { id: null, properties: blank });
};
</script>

<template>
	<v-card variant="tonal" class="mb-3">
		<v-card-title class="d-flex align-center ga-2">
			<v-btn icon size="small" variant="text" @click="open = !open">
				<v-icon>{{ open ? 'mdi-chevron-down' : 'mdi-chevron-right' }}</v-icon>
			</v-btn>
			<span>{{ title }} ({{ rows.length }})</span>
			<v-chip v-if="sharedDedup" size="x-small" color="orange" variant="tonal" class="ml-2">
				shared graph-wide
			</v-chip>
			<v-spacer />
			<v-btn size="small" variant="tonal" color="primary" @click="add">
				<v-icon start>mdi-plus</v-icon>Add
			</v-btn>
		</v-card-title>
		<v-card-text v-if="open">
			<div v-if="rows.length === 0" class="text-caption text-grey">No rows.</div>
			<div
				v-for="(row, i) in rows"
				:key="row.id || `new-${i}`"
				class="uce-child-row pa-3 mb-2"
				style="background: #fff; border-radius: 6px; border: 1px solid #e2e8f0;"
			>
				<div class="d-flex align-center ga-2 mb-2">
					<div class="text-caption text-grey-darken-1" style="font-family: monospace;">
						{{ row.id || '(new)' }}
					</div>
					<v-chip
						v-if="sharedDedup && row.shareCount > 0"
						size="x-small"
						color="amber"
						variant="tonal"
					>
						also used by {{ row.shareCount }} other use case<span v-if="row.shareCount !== 1">s</span>
					</v-chip>
					<v-spacer />
					<v-btn
						size="x-small"
						variant="text"
						color="red"
						icon="mdi-delete-outline"
						@click="remove(i)"
					/>
				</div>
				<DynamicField
					v-for="spec in propertySpecs.filter(s => !s.system)"
					:key="spec.name"
					:model-value="row.properties[spec.name]"
					:spec="spec"
					@update:model-value="(v) => onFieldUpdate(i, spec.name, v)"
				/>
			</div>
		</v-card-text>
	</v-card>
</template>
