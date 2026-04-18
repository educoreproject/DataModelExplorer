<script setup>
// UseCaseForm.vue — orchestrates the right-column form for one UseCase.
// Composes DynamicField for root scalars, ChildCollectionPanel per child
// schema, CategoryPicker, and ExtraPropertiesPanel.

import DynamicField from './DynamicField.vue';
import ChildCollectionPanel from './ChildCollectionPanel.vue';
import CategoryPicker from './CategoryPicker.vue';
import ExtraPropertiesPanel from './ExtraPropertiesPanel.vue';

const props = defineProps({
	schema: { type: Object, required: true },
	current: { type: Object, required: true },
	editableSpecs: { type: Array, required: true },
	readOnlySpecs: { type: Array, required: true },
	childSchemas: { type: Object, required: true }   // { useCaseStep, useCaseActor, dataReference, externalReference } — the manifests
});
const emit = defineEmits(['rootChange', 'collectionChange', 'categoriesChange']);

const onRootChange = (name, value) => emit('rootChange', { name, value });

const onCollectionChange = (key, rows) => emit('collectionChange', { key, rows });
</script>

<template>
	<div class="uce-form">
		<!-- Root scalars — editable -->
		<v-card class="pa-4 mb-3" variant="outlined">
			<div class="text-subtitle-1 mb-2">Core Properties</div>
			<DynamicField
				v-for="spec in editableSpecs"
				:key="spec.name"
				:spec="spec"
				:model-value="current.properties[spec.name]"
				@update:model-value="(v) => onRootChange(spec.name, v)"
			/>
		</v-card>

		<!-- Root scalars — read-only -->
		<v-card class="pa-4 mb-3" variant="outlined">
			<div class="text-subtitle-1 mb-2">Source Metadata (read-only)</div>
			<DynamicField
				v-for="spec in readOnlySpecs"
				:key="spec.name"
				:spec="spec"
				:model-value="current.properties[spec.name]"
				@update:model-value="() => {}"
			/>
		</v-card>

		<!-- Child collections -->
		<ChildCollectionPanel
			title="Steps"
			:rows="current.steps"
			:property-specs="childSchemas.useCaseStep.properties"
			:order-key="'stepNumber'"
			@update="(rows) => onCollectionChange('steps', rows)"
		/>
		<ChildCollectionPanel
			title="Actors"
			:rows="current.actors"
			:property-specs="childSchemas.useCaseActor.properties"
			:shared-dedup="true"
			@update="(rows) => onCollectionChange('actors', rows)"
		/>
		<ChildCollectionPanel
			title="Data References"
			:rows="current.dataRefs"
			:property-specs="childSchemas.dataReference.properties"
			:shared-dedup="true"
			@update="(rows) => onCollectionChange('dataRefs', rows)"
		/>
		<ChildCollectionPanel
			title="External References"
			:rows="current.externalRefs"
			:property-specs="childSchemas.externalReference.properties"
			:shared-dedup="true"
			@update="(rows) => onCollectionChange('externalRefs', rows)"
		/>

		<!-- Categories -->
		<CategoryPicker
			:categories="current.categories"
			@update="(cats) => emit('categoriesChange', cats)"
		/>

		<!-- Extra properties surfacing -->
		<ExtraPropertiesPanel :extras="current.extraProperties" />
	</div>
</template>
