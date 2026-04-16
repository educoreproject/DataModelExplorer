<script setup>
// ExtraPropertiesPanel.vue — read-only display of properties present on the
// node but not declared in the schema manifest. Surfaces drift so the author
// can decide whether the manifest needs updating.

const props = defineProps({
	extras: { type: Object, default: () => ({}) }
});

const entries = computed(() => {
	const out = [];
	const obj = props.extras || {};
	for (const key of Object.keys(obj).sort()) {
		out.push({ key, value: obj[key] });
	}
	return out;
});

const format = (v) => {
	if (v == null) { return ''; }
	if (typeof v === 'string') { return v; }
	try { return JSON.stringify(v); } catch (_e) { return String(v); }
};
</script>

<template>
	<v-card v-if="entries.length > 0" variant="outlined" class="mb-3">
		<v-card-title class="text-subtitle-1">
			Extra Properties
			<v-chip size="x-small" color="amber" variant="tonal" class="ml-2">not in schema</v-chip>
		</v-card-title>
		<v-card-text>
			<div class="text-caption text-grey-darken-1 mb-2">
				The graph has properties not declared in the schema manifest. Surfaced here so drift is visible; saves do not touch them.
			</div>
			<div v-for="e in entries" :key="e.key" class="mb-1">
				<strong style="font-family: monospace;">{{ e.key }}</strong>:
				<span class="text-body-2">{{ format(e.value) }}</span>
			</div>
		</v-card-text>
	</v-card>
</template>
