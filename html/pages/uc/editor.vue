<script setup>
// uc/editor.vue — Use Case Editor page. Two-column layout: a searchable,
// category-grouped selector on the left; a DynamicForm-driven editor on
// the right. Dirty-state guard on route leave.

definePageMeta({ middleware: 'auth' });

import UseCaseSelector from '@/components/UseCaseSelector.vue';
import UseCaseForm from '@/components/UseCaseForm.vue';
import UseCaseExplorer from '@/components/UseCaseExplorer.vue';
import { useUseCaseEditorStore } from '@/stores/useCaseEditorStore';
import { useUserDataStore } from '@/stores/userDataStore';

const userDataStore = useUserDataStore();
const canEdit = computed(() => {
	const roles = (userDataStore.loggedInUser?.role || '').split(',').map((r) => r.trim());
	return roles.includes('admin') || roles.includes('super');
});

const mode = ref('explore'); // 'edit' | 'explore' — default to the gentler view

// The child schemas are not separately fetched in Phase 6 — the root manifest
// carries the children list, and each child schema is known by filename on the
// server. We mirror only what the form needs here; if the manifest diverges we
// can fetch them later.
const childSchemas = {
	useCaseStep: {
		label: 'UseCaseStep',
		properties: [
			{ name: 'stepNumber',  type: 'integer',  required: true, label: 'Step #' },
			{ name: 'actionText',  type: 'markdown', label: 'Action' },
			{ name: 'actorName',   type: 'string',   label: 'Actor Name' },
			{ name: 'name',        type: 'string',   label: 'Name' },
			{ name: 'description', type: 'markdown', label: 'Description' }
		]
	},
	useCaseActor: {
		label: 'UseCaseActor',
		properties: [
			{ name: 'name',        type: 'string',   required: true, label: 'Actor Name' },
			{ name: 'description', type: 'markdown', label: 'Description' }
		]
	},
	dataReference: {
		label: 'DataReference',
		properties: [
			{ name: 'name',        type: 'string',   label: 'Name' },
			{ name: 'description', type: 'markdown', label: 'Description' },
			{ name: 'url',         type: 'url',      label: 'URL' }
		]
	},
	externalReference: {
		label: 'ExternalReference',
		properties: [
			{ name: 'name',        type: 'string',   required: true, label: 'Title' },
			{ name: 'description', type: 'markdown', label: 'Description' },
			{ name: 'url',         type: 'url',      label: 'URL' }
		]
	}
};

const store = useUseCaseEditorStore();
const router = useRouter();
const confirmOpen = ref(false);

onMounted(async () => {
	await Promise.all([store.loadSchema(), store.loadList()]);
});

const onSelect = async (id) => {
	if (store.dirty) {
		const ok = window.confirm('You have unsaved changes. Discard and load a different use case?');
		if (!ok) { return; }
	}
	await store.loadUseCase(id);
};

const onRootChange = ({ name, value }) => {
	if (!store.current) { return; }
	store.current.properties[name] = value;
	store.markDirty();
};
const onCollectionChange = ({ key, rows }) => {
	if (!store.current) { return; }
	store.current[key] = rows;
	store.markDirty();
};
const onCategoriesChange = (cats) => {
	if (!store.current) { return; }
	store.current.categories = cats;
	store.markDirty();
};

const saveChanges = async () => {
	confirmOpen.value = false;
	await store.saveCurrent();
};

// Dirty-state guard: global leave protection (browser + Nuxt route changes).
if (import.meta.client) {
	window.addEventListener('beforeunload', (e) => {
		if (store.dirty) {
			e.preventDefault();
			e.returnValue = '';
		}
	});
}
onBeforeRouteLeave((_to, _from, next) => {
	if (!store.dirty) { return next(); }
	const ok = window.confirm('You have unsaved changes. Leave anyway?');
	next(ok);
});
</script>

<template>
	<v-container fluid class="pa-6">
		<!-- Banner (edit-mode only) -->
		<v-alert v-if="mode === 'edit'" type="warning" variant="tonal" density="compact" class="mb-4">
			Edits here are not pushed back to GitHub. Running the forge will overwrite them.
			After significant edits, re-run the forge's re-embed step or vector search will go stale.
		</v-alert>

		<div class="d-flex align-center ga-4 mb-4">
			<h1 class="text-h5 font-weight-bold">Use Case Editor</h1>
			<v-chip v-if="store.dirty" color="orange" variant="tonal" size="small">Unsaved changes</v-chip>
		</div>

		<v-alert v-if="store.error" type="error" variant="tonal" density="compact" closable class="mb-4"
			@click:close="store._clearError()"
		>{{ store.error }}</v-alert>
		<v-alert v-if="store.statusMsg" type="success" variant="tonal" density="compact" closable class="mb-4"
			@click:close="store._clearError()"
		>{{ store.statusMsg }}</v-alert>

		<div class="uce-layout">
			<div class="uce-left">
				<UseCaseSelector
					:groups="store.listGroupedByCategory"
					:selected-id="store.current ? store.current.id : ''"
					:loading="store.loading && store.list.length === 0"
					@select="onSelect"
				/>
			</div>
			<div class="uce-right">
				<!-- Mode controls sit directly above the content so they are impossible to miss.
				Admin/super only — plain users see no toggle and only the Explore view. -->
				<div v-if="store.current && canEdit" class="uce-mode-row">
					<v-btn-toggle
						v-model="mode"
						mandatory
						density="comfortable"
						color="primary"
						variant="outlined"
					>
						<v-btn value="edit" size="small">Edit</v-btn>
						<v-btn value="explore" size="small">Explore</v-btn>
					</v-btn-toggle>
					<v-btn
						v-if="mode === 'edit'"
						color="primary"
						size="small"
						:disabled="!store.dirty || store.saving"
						:loading="store.saving"
						@click="confirmOpen = true"
					>
						Save
					</v-btn>
				</div>
				<div v-if="store.loading && !store.current" class="pa-4 text-center text-grey">
					<v-progress-circular indeterminate />
					<div class="mt-2">Loading…</div>
				</div>
				<div v-else-if="!store.current" class="pa-4 text-center text-grey">
					Pick a use case on the left to begin editing.
				</div>
				<UseCaseExplorer
					v-else-if="mode === 'explore' || !canEdit"
					:current="store.current"
				/>
				<UseCaseForm
					v-else-if="store.schema && canEdit"
					:schema="store.schema"
					:current="store.current"
					:editable-specs="store.editableRootProperties"
					:read-only-specs="store.readOnlyRootProperties"
					:child-schemas="childSchemas"
					@root-change="onRootChange"
					@collection-change="onCollectionChange"
					@categories-change="onCategoriesChange"
				/>
			</div>
		</div>

		<!-- Save confirmation modal -->
		<v-dialog v-model="confirmOpen" max-width="540">
			<v-card>
				<v-card-title>Confirm save</v-card-title>
				<v-card-text>
					<div>
						You are about to save changes to
						<strong>{{ store.current && store.current.properties.name }}</strong>.
					</div>
					<v-alert
						v-if="store.current && (store.current.actors.some(a => a.shareCount > 0) || store.current.dataRefs.some(d => d.shareCount > 0) || store.current.externalRefs.some(e => e.shareCount > 0))"
						type="warning"
						variant="tonal"
						density="compact"
						class="mt-3"
					>
						Some shared references are used by other use cases. Property edits on those nodes will affect every use case that references them.
					</v-alert>
					<v-alert type="info" variant="tonal" density="compact" class="mt-3">
						Embedding will go stale until the forge is re-run.
					</v-alert>
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="confirmOpen = false">Cancel</v-btn>
					<v-btn color="primary" :loading="store.saving" @click="saveChanges">Save</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-container>
</template>

<style scoped>
.uce-layout {
	display: grid;
	grid-template-columns: 320px 1fr;
	gap: 16px;
	align-items: start;
}
.uce-left {
	position: sticky;
	top: 16px;
	max-height: calc(100vh - 140px);
	overflow-y: auto;
	border-right: 1px solid #e2e8f0;
	padding-right: 12px;
}
.uce-right {
	min-width: 0;
}
.uce-mode-row {
	display: flex;
	justify-content: flex-end;
	align-items: center;
	gap: 12px;
	margin-bottom: 10px;
	/* Match the UseCaseExplorer/UseCaseForm content width so the controls sit
	   directly above the top-right corner of the card, not way off to the side. */
	max-width: 920px;
}
</style>
