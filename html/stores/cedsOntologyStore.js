// @concept: [[StandardsIntegration]]
// @concept: [[PiniaStorePattern]]
// @concept: [[AuthenticatedApiCall]]
import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

// -------------------------------------------------------------------------
// Action-to-suggestion list mapping: which list action provides suggestions
// for each user-facing action

const actionSuggestionMap = {
	explore: 'listClasses',
	optionSet: 'listOptionSets',
	property: 'listProperties',
	path: 'listClasses',
	compare: 'listClasses',
	dataSpec: 'listClasses',
};

// -------------------------------------------------------------------------
// Define initial state for the CEDS ontology store

const cedsOntologyStoreInitObject = {
	output: '',
	loading: false,
	statusMsg: '',
	currentAction: 'lookup',
	classSuggestions: [],
	optionSetSuggestions: [],
	propertySuggestions: [],
};

// =========================================================================
// Define the CEDS ontology store using Pinia

export const useCedsOntologyStore = defineStore('cedsOntologyStore', {
	// =========================================================================
	// STATE

	state: () => ({ ...cedsOntologyStoreInitObject }),

	// =========================================================================
	// GETTERS

	getters: {
		// ------------------------------------------------------------
		// Return the suggestions array for the currently selected action

		currentSuggestions: (state) => {
			const map = {
				explore: state.classSuggestions,
				optionSet: state.optionSetSuggestions,
				property: state.propertySuggestions,
				path: state.classSuggestions,
				compare: state.classSuggestions,
				dataSpec: state.classSuggestions,
			};
			return map[state.currentAction] || [];
		},

		// ------------------------------------------------------------
		// Whether the current action has autocomplete suggestions

		hasSuggestions: (state) => {
			return !!actionSuggestionMap[state.currentAction];
		},
	},

	// =========================================================================
	// ACTIONS

	actions: {
		// ------------------------------------------------------------
		// Run a CEDS ontology action via the API

		async runAction(action, args, options) {
			this.loading = true;
			this.statusMsg = '';
			try {
				const response = await axios.post(
					'/api/cedsOntology',
					{
						action: action,
						args: args || [],
						options: options || {},
					},
					{
						headers: {
							'Content-Type': 'application/json',
							...useLoginStore().getAuthTokenProperty,
						},
					},
				);

				// Response is an array containing one object with an "output" property
				const resultData = response.data;
				if (Array.isArray(resultData) && resultData.length > 0) {
					this.output = resultData[0].output || '';
				} else {
					this.output = '';
				}
				return true;
			} catch (error) {
				if (error.response?.data) {
					this.statusMsg =
						typeof error.response.data === 'string'
							? error.response.data
							: JSON.stringify(error.response.data);
				} else if (error.message) {
					this.statusMsg = error.message;
				} else {
					this.statusMsg = 'Failed to run ontology query';
				}
				this.output = '';
				return false;
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// Fetch suggestion list for an action and cache it
		// Only fetches if the action has a mapping and the cache is empty

		async fetchSuggestions(action) {
			const listAction = actionSuggestionMap[action];
			if (!listAction) return; // no suggestions for this action

			// Map list action to the correct state cache
			const cacheMap = {
				listClasses: 'classSuggestions',
				listOptionSets: 'optionSetSuggestions',
				listProperties: 'propertySuggestions',
			};

			const cacheKey = cacheMap[listAction];
			if (!cacheKey) return;

			// Already cached? Skip fetch
			if (this[cacheKey].length > 0) return;

			try {
				const response = await axios.post(
					'/api/cedsOntology',
					{
						action: listAction,
						args: [],
						options: {},
					},
					{
						headers: {
							'Content-Type': 'application/json',
							...useLoginStore().getAuthTokenProperty,
						},
					},
				);

				// Response: [{ output: "[{\"label\":\"...\",\"notation\":\"...\"}]" }]
				const resultData = response.data;
				if (Array.isArray(resultData) && resultData.length > 0) {
					const outputString = resultData[0].output || '[]';
					const items = JSON.parse(outputString);
					this[cacheKey] = items.map((i) => i.label);
				}
			} catch (error) {
				// Suggestion fetch failure is non-critical; log but don't block
				console.warn(
					`Failed to fetch suggestions for ${listAction}:`,
					error.message,
				);
			}
		},

		// ------------------------------------------------------------
		// Fetch help text from the server

		async fetchHelp() {
			return await this.runAction('help', []);
		},

		// ------------------------------------------------------------
		// Clear the output

		clearOutput() {
			this.output = '';
			this.statusMsg = '';
		},
	},
});
