// @concept: [[DataModelExplorer]]
// @concept: [[PiniaStorePattern]]
// @concept: [[AuthenticatedApiCall]]
//
// DME STANDARD LIST STORE (WEL, 2026-10-07)
//
// The Data Model Explorer's welcome screen lists the standards the graph holds RIGHT NOW, read through
// GET /api/dme-list-standards — askMilo's own dme_list_standards verb, run by the server. Nothing here is remembered:
// when the call fails, standardInventory is null and standardListUnavailableReason says why, so the page shows
// "standards list unavailable: <reason>" and never a stale list.

import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

const dmeStandardListStoreInitObject = {
	standardInventory: null,
	standardListLoading: false,
	standardListUnavailableReason: '',
};

export const useDmeStandardListStore = defineStore('dmeStandardListStore', {
	state: () => ({ ...dmeStandardListStoreInitObject }),

	getters: {
		// one entry per standardFamily, the hub's family first: { standardFamily, familyDeclared, isHubFamily, standardList }.
		// A standard whose build declares no family is shown under 'family not declared' — never grouped by its name.
		standardFamilyGroupList: (state) => {
			if (!state.standardInventory) return [];
			const groupByFamily = {};
			state.standardInventory.standards.forEach((oneStandard) => {
				const familyDeclared = Boolean(oneStandard.standardFamily);
				const familyName = familyDeclared ? oneStandard.standardFamily : 'family not declared';
				(groupByFamily[familyName] ||= { standardFamily: familyName, familyDeclared, isHubFamily: false, standardList: [] }).standardList.push(oneStandard);
				if (oneStandard.isHub) groupByFamily[familyName].isHubFamily = true;
			});
			return Object.values(groupByFamily).sort((leftGroup, rightGroup) =>
				(rightGroup.isHubFamily - leftGroup.isHubFamily) || leftGroup.standardFamily.localeCompare(rightGroup.standardFamily));
		},
		loadedFamilyNameList: (state) => (state.standardInventory ? state.standardInventory.standards.map((oneStandard) => oneStandard.standardFamily).filter(Boolean) : []),
	},

	actions: {
		async fetchStandardInventory() {
			const loginStore = useLoginStore();
			this.standardListLoading = true;
			this.standardListUnavailableReason = '';
			this.standardInventory = null;
			try {
				const response = await axios.get('/api/dme-list-standards', { headers: { ...loginStore.getAuthTokenProperty } });
				const standardInventory = Array.isArray(response.data) ? response.data[0] : null;
				if (!standardInventory || !Array.isArray(standardInventory.standards)) {
					this.standardListUnavailableReason = 'the server answered without a standards list';
					return false;
				}
				this.standardInventory = standardInventory;
				return true;
			} catch (error) {
				this.standardListUnavailableReason = (typeof error.response?.data === 'string' && error.response.data) || error.message || 'the standards request failed';
				return false;
			} finally {
				this.standardListLoading = false;
			}
		},
	},
});
