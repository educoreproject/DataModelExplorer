<script setup>
// DynamicField.vue — renders one property based on its manifest spec.
// Two-way binds via v-model; emits change when the user edits.

const props = defineProps({
	modelValue: { default: null },
	spec: { type: Object, required: true }
});
const emit = defineEmits(['update:modelValue']);

const update = (v) => emit('update:modelValue', v);

const stringArrayText = computed({
	get() {
		const v = props.modelValue;
		return Array.isArray(v) ? v.join('\n') : '';
	},
	set(text) {
		const arr = (text || '')
			.split('\n')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
		update(arr);
	}
});

const readOnly = computed(() => props.spec.readOnly === true);
</script>

<template>
	<div class="uce-field mb-4">
		<div class="text-subtitle-2 font-weight-bold mb-1" :class="readOnly ? 'text-grey-darken-1' : ''">
			{{ spec.label || spec.name }}
			<span v-if="spec.required" class="text-red">*</span>
			<span v-if="readOnly" class="text-caption ml-2 text-grey">(read-only)</span>
		</div>
		<div v-if="spec.help" class="text-caption text-grey-darken-1 mb-1">{{ spec.help }}</div>

		<template v-if="spec.type === 'string'">
			<v-text-field
				:model-value="modelValue || ''"
				@update:model-value="update"
				density="compact"
				variant="outlined"
				hide-details
				:readonly="readOnly"
			/>
		</template>

		<template v-else-if="spec.type === 'url'">
			<v-text-field
				:model-value="modelValue || ''"
				@update:model-value="update"
				density="compact"
				variant="outlined"
				hide-details
				type="url"
				:readonly="readOnly"
			/>
		</template>

		<template v-else-if="spec.type === 'integer'">
			<v-text-field
				:model-value="modelValue == null ? '' : String(modelValue)"
				@update:model-value="(v) => update(v === '' ? null : parseInt(v, 10))"
				density="compact"
				variant="outlined"
				hide-details
				type="number"
				:readonly="readOnly"
			/>
		</template>

		<template v-else-if="spec.type === 'boolean'">
			<v-checkbox
				:model-value="modelValue === true"
				@update:model-value="update"
				hide-details
				density="compact"
				:disabled="readOnly"
			/>
		</template>

		<template v-else-if="spec.type === 'markdown'">
			<v-textarea
				:model-value="modelValue || ''"
				@update:model-value="update"
				variant="outlined"
				rows="5"
				auto-grow
				hide-details
				:readonly="readOnly"
			/>
		</template>

		<template v-else-if="spec.type === 'stringArray'">
			<v-textarea
				v-model="stringArrayText"
				variant="outlined"
				rows="3"
				auto-grow
				hide-details
				placeholder="one item per line"
				:readonly="readOnly"
			/>
		</template>

		<template v-else-if="spec.type === 'datetime'">
			<div class="text-body-2 text-grey-darken-2 pa-2" style="background: #f8fafc; border-radius: 4px;">
				{{ modelValue || '—' }}
			</div>
		</template>

		<template v-else>
			<div class="text-caption text-grey">Unsupported type: {{ spec.type }}</div>
			<div class="text-body-2 pa-2" style="background: #f8fafc; border-radius: 4px;">{{ modelValue }}</div>
		</template>
	</div>
</template>
