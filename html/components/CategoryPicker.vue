<script setup>
// CategoryPicker.vue — multi-select over the UseCase's current categories.
// Editing category master data is out of scope for v1 (per spec). This picker
// lets the user add/remove edges and flip the isPrimary flag on one edge.

const props = defineProps({
	categories: { type: Array, required: true }   // [{ id, name, isPrimary }]
});
const emit = defineEmits(['update']);

const newName = ref('');

const toggle = (idx) => {
	const arr = props.categories.slice();
	arr[idx] = { ...arr[idx], isPrimary: !arr[idx].isPrimary };
	// Enforce at most one primary.
	if (arr[idx].isPrimary) {
		for (let j = 0; j < arr.length; j++) {
			if (j !== idx) { arr[j] = { ...arr[j], isPrimary: false }; }
		}
	}
	emit('update', arr);
};

const remove = (idx) => {
	const arr = props.categories.slice();
	arr.splice(idx, 1);
	emit('update', arr);
};

const add = () => {
	const name = (newName.value || '').trim();
	if (!name) { return; }
	if (props.categories.some((c) => c.name === name)) { newName.value = ''; return; }
	emit('update', [...props.categories, { name, isPrimary: false }]);
	newName.value = '';
};
</script>

<template>
	<v-card variant="tonal" class="mb-3">
		<v-card-title class="d-flex align-center">
			<span>Categories ({{ categories.length }})</span>
		</v-card-title>
		<v-card-text>
			<div v-for="(c, i) in categories" :key="c.name + '-' + i" class="d-flex align-center ga-2 mb-1">
				<v-chip :color="c.isPrimary ? 'primary' : undefined" variant="tonal">
					{{ c.name }}
					<v-icon v-if="c.isPrimary" size="small" class="ml-1">mdi-star</v-icon>
				</v-chip>
				<v-btn size="x-small" variant="text" @click="toggle(i)">
					{{ c.isPrimary ? 'Unmark primary' : 'Mark primary' }}
				</v-btn>
				<v-btn size="x-small" variant="text" color="red" @click="remove(i)">Remove</v-btn>
			</div>
			<div class="d-flex align-center ga-2 mt-2">
				<v-text-field
					v-model="newName"
					density="compact"
					variant="outlined"
					placeholder="Add category name"
					hide-details
					@keyup.enter="add"
				/>
				<v-btn size="small" variant="tonal" color="primary" @click="add">Add</v-btn>
			</div>
			<div class="text-caption text-grey-darken-1 mt-2">
				New category names are MERGE-ed by exact name on save. Existing category nodes are reused.
			</div>
		</v-card-text>
	</v-card>
</template>
