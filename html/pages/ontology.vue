<script setup>
import { useLoginStore } from '@/stores/loginStore';
import { useCedsOntologyStore } from '@/stores/cedsOntologyStore';
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';

const LoginStore = useLoginStore();
const cedsStore = useCedsOntologyStore();
const router = useRouter();
const route = useRoute();

// -------------------------------------------------------------------------
// Action definitions with descriptive titles

const actions = [
	{
		title: 'Lookup -- Search classes, properties, option sets by name',
		value: 'lookup',
	},
	{
		title: 'Explore -- Show a class with its properties and relationships',
		value: 'explore',
	},
	{
		title: 'Option Set -- List all values in an option set/enumeration',
		value: 'optionSet',
	},
	{
		title: 'Property -- Show details for a specific property',
		value: 'property',
	},
	{
		title: 'Path -- Find relationship path between two classes',
		value: 'path',
	},
	{
		title: 'Search -- Semantic vector search across all descriptions',
		value: 'search',
	},
	{ title: 'Stats -- Show ontology statistics', value: 'stats' },
];

// -------------------------------------------------------------------------
// Reactive state

const selectedAction = ref('stats');
const inputText = ref('');
const inputTextB = ref('');
const showHelp = ref(false);
const restoringState = ref(false);

// -------------------------------------------------------------------------
// Computed properties

const placeholderText = computed(() => {
	const placeholders = {
		lookup: 'Search term (e.g., "student", "assessment")',
		explore: 'Class name (e.g., "K12 Student")',
		optionSet: 'Option set name (e.g., "Sex", "Grade Level")',
		property: 'Property name (e.g., "BirthDate")',
		path: 'First class (e.g., "K12 Student")',
		search: 'Natural language query (e.g., "assessment scores for ELL")',
		stats: '',
	};
	return placeholders[selectedAction.value] || '';
});

const placeholderTextB = computed(() => {
	return 'Second class (e.g., "K12 School")';
});

const isInputDisabled = computed(() => {
	return selectedAction.value === 'stats';
});

const showSecondInput = computed(() => {
	return selectedAction.value === 'path';
});

const useAutocomplete = computed(() => {
	return cedsStore.hasSuggestions;
});

// -------------------------------------------------------------------------
// Auth guard

onMounted(async () => {
	if (!LoginStore.validUser) {
		router.push({ path: '/', query: { redirect: route.fullPath } });
		return;
	}
	// Auto-run stats on first visit only — preserve previous results on return
	if (!cedsStore.output) {
		cedsStore.currentAction = selectedAction.value;
		cedsStore.runAction('stats', []);
	} else {
		// Restore the action that produced the current output
		// Suppress the watcher so it doesn't clear the preserved output
		restoringState.value = true;
		selectedAction.value = cedsStore.currentAction || 'stats';
		await nextTick();
		restoringState.value = false;
	}
});

// -------------------------------------------------------------------------
// Watchers

watch(selectedAction, (newAction) => {
	if (restoringState.value) return;
	cedsStore.clearOutput();
	inputText.value = '';
	inputTextB.value = '';

	// Update the store's currentAction so getters work correctly
	cedsStore.currentAction = newAction;

	// Fetch suggestions for actions that have autocomplete
	cedsStore.fetchSuggestions(newAction);

	// Auto-run stats on selection (no input needed)
	if (newAction === 'stats') {
		runAction();
	}
});

watch(showHelp, (newVal) => {
	if (newVal) {
		cedsStore.fetchHelp();
	} else {
		cedsStore.clearOutput();
	}
});

// -------------------------------------------------------------------------
// Event handlers

const runAction = () => {
	// Don't run if help is showing
	if (showHelp.value) {
		showHelp.value = false;
	}

	const action = selectedAction.value;

	// Build args based on action type
	let args = [];
	if (action === 'path') {
		if (!inputText.value || !inputText.value.trim() || !inputTextB.value || !inputTextB.value.trim()) {
			cedsStore.statusMsg = 'Path requires two class names';
			return;
		}
		args = [inputText.value.trim(), inputTextB.value.trim()];
	} else if (action !== 'stats') {
		if (!inputText.value || !inputText.value.trim()) {
			cedsStore.statusMsg = 'Please enter a search term';
			return;
		}
		args = [inputText.value.trim()];
	}

	cedsStore.runAction(action, args);
};

// Handle autocomplete selection: auto-submit when user picks from dropdown
const onAutocompleteSelect = (value) => {
	if (value) {
		// For path action, only auto-submit if both fields are filled
		if (selectedAction.value === 'path') {
			if (inputText.value && inputTextB.value) {
				runAction();
			}
		} else {
			runAction();
		}
	}
};

const onAutocompleteSelectB = (value) => {
	if (value && inputText.value) {
		runAction();
	}
};
</script>

<template>
	<v-app>
		<generalNavSub />
		<v-main style="padding-top: 65px">
			<v-container fluid class="pa-4">
				<!-- Top bar: action selector + input -->
				<v-row align="center" class="mb-2">
					<v-col cols="12" md="3">
						<v-select
							v-model="selectedAction"
							:items="actions"
							item-title="title"
							item-value="value"
							label="Action"
							variant="outlined"
							density="compact"
							hide-details
						/>
					</v-col>

					<v-col cols="12" :md="showSecondInput ? 3 : 7">
						<!-- Autocomplete for actions with suggestion lists -->
						<v-autocomplete
							v-if="useAutocomplete"
							v-model="inputText"
							:items="cedsStore.currentSuggestions"
							:placeholder="placeholderText"
							variant="outlined"
							density="compact"
							hide-details
							clearable
							hide-no-data
							@keyup.enter="runAction"
							@update:model-value="onAutocompleteSelect"
						/>
						<!-- Plain text field for free-text actions -->
						<v-text-field
							v-else
							v-model="inputText"
							:placeholder="placeholderText"
							:disabled="isInputDisabled"
							variant="outlined"
							density="compact"
							hide-details
							@keyup.enter="runAction"
						/>
					</v-col>

					<v-col v-if="showSecondInput" cols="12" md="3">
						<!-- Path action: second input is also autocomplete with class suggestions -->
						<v-autocomplete
							v-model="inputTextB"
							:items="cedsStore.currentSuggestions"
							:placeholder="placeholderTextB"
							variant="outlined"
							density="compact"
							hide-details
							clearable
							hide-no-data
							@keyup.enter="runAction"
							@update:model-value="onAutocompleteSelectB"
						/>
					</v-col>

					<v-col cols="12" md="2" class="d-flex align-center">
						<v-checkbox
							v-model="showHelp"
							label="Show Help"
							density="compact"
							hide-details
							class="mt-0"
						/>
					</v-col>
				</v-row>

				<!-- Error message -->
				<v-alert
					v-if="cedsStore.statusMsg"
					type="warning"
					density="compact"
					class="mb-3"
					closable
					@click:close="cedsStore.statusMsg = ''"
				>
					{{ cedsStore.statusMsg }}
				</v-alert>

				<!-- Loading indicator -->
				<v-progress-linear
					v-if="cedsStore.loading"
					indeterminate
					color="primary"
					class="mb-3"
				/>

				<!-- Output area -->
				<div v-if="cedsStore.output" class="output-area">
					<pre>{{ cedsStore.output }}</pre>
				</div>
				<div
					v-else-if="!cedsStore.loading"
					class="placeholder-text text-medium-emphasis"
				>
					Select an action and enter a search term to explore the CEDS
					v13 ontology.
				</div>
			</v-container>
		</v-main>
	</v-app>
</template>

<style scoped>
.output-area {
	background-color: #f9f9f6;
	border: 1px solid rgba(0, 0, 0, 0.12);
	border-radius: 4px;
	padding: 16px;
	overflow-x: auto;
	min-height: 200px;
}

.output-area pre {
	font-family: 'Courier New', Courier, monospace;
	font-size: 0.875rem;
	line-height: 1.5;
	margin: 0;
	white-space: pre-wrap;
	word-wrap: break-word;
}

.placeholder-text {
	padding: 40px;
	text-align: center;
	font-size: 1rem;
}
</style>
