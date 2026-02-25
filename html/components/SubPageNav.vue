<script setup>
const props = defineProps({
	tabs: {
		type: Array,
		required: true,
		// Each tab: { label: 'Lookup', value: 'lookup', icon: 'mdi-magnify' }
	},
	modelValue: {
		type: String,
		required: true,
	},
});

const emit = defineEmits(['update:modelValue']);

const selectTab = (value) => {
	emit('update:modelValue', value);
};
</script>

<template>
	<div class="sub-page-nav">
		<v-btn-toggle
			:model-value="modelValue"
			@update:model-value="selectTab"
			mandatory
			density="compact"
			variant="text"
			color="primary"
		>
			<v-btn
				v-for="tab in tabs"
				:key="tab.value"
				:value="tab.value"
				:prepend-icon="tab.icon"
				size="small"
			>
				{{ tab.label }}
			</v-btn>
		</v-btn-toggle>
	</div>
</template>

<style scoped>
.sub-page-nav {
	padding: 4px 16px;
	border-bottom: 1px solid rgba(0, 0, 0, 0.08);
	background: #fafafa;
	display: flex;
	justify-content: flex-end;
}
</style>
