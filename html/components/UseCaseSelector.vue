<script setup>
// UseCaseSelector.vue — searchable, category-grouped list of use cases.
// Emits `select(id)` when a row is clicked.

const props = defineProps({
	groups: { type: Array, required: true },   // [{ name, items: [{ id, name, primaryCategory }] }]
	selectedId: { type: String, default: '' },
	loading: { type: Boolean, default: false }
});
const emit = defineEmits(['select']);

const filter = ref('');

const visibleGroups = computed(() => {
	const q = filter.value.trim().toLowerCase();
	if (!q) { return props.groups; }
	return props.groups
		.map((g) => ({
			name: g.name,
			items: g.items.filter(
				(i) =>
					(i.name || '').toLowerCase().includes(q) ||
					(i.id || '').toLowerCase().includes(q),
			)
		}))
		.filter((g) => g.items.length > 0);
});

const pick = (id) => emit('select', id);
</script>

<template>
	<div class="uce-selector">
		<v-text-field
			v-model="filter"
			density="compact"
			variant="outlined"
			placeholder="Filter use cases"
			hide-details
			clearable
			class="mb-3"
			prepend-inner-icon="mdi-magnify"
		/>
		<v-progress-linear v-if="loading" indeterminate class="mb-2" />
		<div v-for="group in visibleGroups" :key="group.name" class="mb-3">
			<div class="text-overline text-grey-darken-1 px-2">
				{{ group.name }} ({{ group.items.length }})
			</div>
			<v-list density="compact" class="py-0">
				<v-list-item
					v-for="item in group.items"
					:key="item.id"
					:active="item.id === selectedId"
					@click="pick(item.id)"
				>
					<v-list-item-title class="text-body-2">{{ item.name }}</v-list-item-title>
					<v-list-item-subtitle class="text-caption text-grey-darken-1">{{ item.id }}</v-list-item-subtitle>
				</v-list-item>
			</v-list>
		</div>
		<div v-if="!loading && visibleGroups.length === 0" class="text-caption text-grey-darken-1 pa-2">
			No matching use cases.
		</div>
	</div>
</template>
