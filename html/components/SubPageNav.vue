<script setup>
import { useRouter } from 'vue-router';

const router = useRouter();

const props = defineProps({
	tabs: {
		type: Array,
		required: true,
		// Each tab: { label: 'Lookup', value: 'lookup', icon: 'mdi-magnify', to: '/path' }
	},
	modelValue: {
		type: String,
		required: true,
	},
});

const emit = defineEmits(['update:modelValue']);

const selectTab = (value) => {
	const tab = props.tabs.find(t => t.value === value);
	if (tab && tab.to) {
		router.push(tab.to);
	} else {
		emit('update:modelValue', value);
	}
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
	border-bottom: 1px solid var(--edu-gray-100, #EEF1F7);
	background: var(--edu-gray-50, #F8F9FC);
	display: flex;
	justify-content: flex-end;
	flex-shrink: 0;
}
</style>
