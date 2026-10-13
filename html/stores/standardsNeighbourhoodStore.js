// @concept: [[DataModelExplorer]]
// @concept: [[PiniaStorePattern]]
// @concept: [[AuthenticatedApiCall]]
//
// STANDARDS NEIGHBOURHOOD STORE (DEV-123, the PESC Explorer)
//
// Holds the walk: the navigation path (stableIds, from the URL's ?path=), the focus node's neighbourhood as
// POST /api/standards-neighbourhood answered it, names for every breadcrumb, and the shared view state (Diagram or
// Table, selection, filter, legend). The page owns the URL and the router; this store only loads what a path names.
// Every row the table and the diagram draw comes from the levelRowList getter, so the two views cannot disagree.

import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';
import {
	LARGE_LEVEL_ITEM_COUNT,
	displayNameOf,
	relationshipDisplayNameOf,
	secondaryRelationshipTypeList,
} from '@/components/standardsExplorer/explorerVocabulary';

const standardsNeighbourhoodStoreInitObject = {
	pathStableIdList: [],
	neighbourhood: null,
	nodeSummaryByStableId: {},
	neighbourhoodLoading: false,
	statusMsg: '',
	viewModeChoice: 'diagram',
	diagramRequestedForStableId: '',
	selectedStableId: '',
	filterText: '',
	legendVisible: true,
};

const NEIGHBOURHOOD_URL = '/api/standards-neighbourhood';

const refusalTextOf = (error, operationName) =>
	(typeof error.response?.data === 'string' && error.response.data) || error.message || `the ${operationName} request failed`;

// one table/diagram row from one child item
const rowOfItem = ({ oneItem, oneGroup, focusNode }) => ({
	stableId: oneItem.stableId,
	name: oneItem.name,
	displayName: displayNameOf(oneItem),
	kind: oneItem.kind,
	relationshipType: oneGroup.relationshipType,
	groupName: relationshipDisplayNameOf(oneGroup.relationshipType),
	isSecondary: secondaryRelationshipTypeList.includes(oneGroup.relationshipType),
	standardFamily: oneItem.standardFamily || focusNode.standardFamily || null,
	standardKey: oneItem.standardKey || null,
	description: oneItem.description || '',
	path: oneItem.path || '',
	ownerName: oneItem.ownerName || '',
	mapping: oneItem.mapping || null,
	versionBadge: oneItem.versionBadge || null,
	hasChildren: Boolean(oneItem.hasChildren),
	propertyCount: oneItem.propertyCount,
	mappedPropertyCount: oneItem.mappedPropertyCount,
	occurrenceCount: oneItem.occurrenceCount,
	classCount: oneItem.classCount,
	elementCount: oneItem.elementCount,
	matchKindCountList: oneItem.matchKindCountList || null,
	strongestMatchKind: oneItem.strongestMatchKind || null,
	versionList: oneItem.versionList || null,
	version: oneItem.version || null,
	releaseLabel: oneItem.releaseLabel || null,
});

// a mapping of the focus is a row too: the CEDS element it points at
const rowOfMapping = ({ oneMapping }) => ({
	stableId: oneMapping.anchor.stableId,
	name: oneMapping.anchor.name,
	displayName: oneMapping.anchor.name,
	kind: 'cedsAnchor',
	relationshipType: 'MAPS_TO_CEDS',
	groupName: relationshipDisplayNameOf('MAPS_TO_CEDS'),
	isSecondary: false,
	standardFamily: 'CEDS',
	standardKey: null,
	description: '',
	path: '',
	ownerName: '',
	mapping: oneMapping,
	versionBadge: null,
	hasChildren: true,
	occurrenceCount: oneMapping.occurrenceCount,
});

export const useStandardsNeighbourhoodStore = defineStore('standardsNeighbourhoodStore', {
	state: () => ({ ...standardsNeighbourhoodStoreInitObject }),

	getters: {
		focusNode: (state) => (state.neighbourhood ? state.neighbourhood.node : null),

		// every row of this level: mappings first, then children by group; folded occurrence groups are left out
		levelRowList: (state) => {
			if (!state.neighbourhood) return [];
			const focusNode = state.neighbourhood.node;
			const mappingRowList = (state.neighbourhood.mappingList || []).map((oneMapping) => rowOfMapping({ oneMapping }));
			const childRowList = (state.neighbourhood.childGroupList || [])
				.filter((oneGroup) => !oneGroup.folded)
				.flatMap((oneGroup) => oneGroup.itemList.map((oneItem) => rowOfItem({ oneItem, oneGroup, focusNode })));
			return mappingRowList.concat(childRowList);
		},

		filteredRowList() {
			const filterText = this.filterText.trim().toLowerCase();
			if (!filterText) return this.levelRowList;
			return this.levelRowList.filter((oneRow) => `${oneRow.displayName} ${oneRow.name}`.toLowerCase().includes(filterText));
		},

		rowMatchesFilter() {
			const filterText = this.filterText.trim().toLowerCase();
			return (oneRow) => !filterText || `${oneRow.displayName} ${oneRow.name}`.toLowerCase().includes(filterText);
		},

		truncatedGroupList: (state) => (state.neighbourhood ? state.neighbourhood.childGroupList.filter((oneGroup) => oneGroup.truncated) : []),

		isLargeLevel() {
			return this.levelRowList.length > LARGE_LEVEL_ITEM_COUNT;
		},

		// a large level opens in the table unless the person asked for the diagram of THIS level
		effectiveViewMode() {
			if (this.isLargeLevel && this.diagramRequestedForStableId !== this.focusNode?.stableId) return 'table';
			return this.viewModeChoice;
		},

		selectedRow() {
			return this.levelRowList.find((oneRow) => oneRow.stableId === this.selectedStableId) || null;
		},

		// the breadcrumb: one entry per path step, named from what the server told us
		crumbList: (state) =>
			state.pathStableIdList.map((oneStableId, pathIndex) => {
				const nodeSummary = state.nodeSummaryByStableId[oneStableId] || { stableId: oneStableId, name: oneStableId };
				return { stableId: oneStableId, pathIndex, kind: nodeSummary.kind, standardFamily: nodeSummary.standardFamily || null, displayName: displayNameOf(nodeSummary) };
			}),

		// the crossing: the path went through a CEDS element and the focus belongs to another family than the
		// element the person started from
		crossing() {
			const anchorIndex = this.crumbList.map((oneCrumb) => oneCrumb.kind).lastIndexOf('cedsAnchor');
			if (anchorIndex < 1) return null;
			const homeCrumb = this.crumbList[anchorIndex - 1];
			const anchorCrumb = this.crumbList[anchorIndex];
			const focusCrumb = this.crumbList[this.crumbList.length - 1];
			const focusFamily = this.focusNode?.standardFamily || focusCrumb.standardFamily;
			return {
				homeCrumb,
				anchorCrumb,
				homeStandardKey: (this.nodeSummaryByStableId[homeCrumb.stableId] || {}).standardKey || null,
				isCrossed: focusCrumb.pathIndex > anchorIndex && Boolean(focusFamily) && focusFamily !== homeCrumb.standardFamily,
				crossedFamily: focusFamily,
			};
		},
	},

	actions: {
		// loads what a path names: the last stableId's neighbourhood, and names for any crumb not yet known
		async loadPath(pathStableIdList) {
			this.pathStableIdList = pathStableIdList;
			this.selectedStableId = '';
			const unknownStableIdList = pathStableIdList.filter((oneStableId) => !this.nodeSummaryByStableId[oneStableId]);
			const neighbourhoodLoaded = await this.fetchNeighbourhood(pathStableIdList[pathStableIdList.length - 1]);
			if (!neighbourhoodLoaded || unknownStableIdList.length === 0) return neighbourhoodLoaded;
			return this.fetchPathSummary(unknownStableIdList);
		},

		async fetchNeighbourhood(stableId) {
			const loginStore = useLoginStore();
			this.neighbourhoodLoading = true;
			this.statusMsg = '';
			try {
				const response = await axios.post(NEIGHBOURHOOD_URL, { action: 'node', stableId, compareVersion: true }, { headers: { ...loginStore.getAuthTokenProperty } });
				const neighbourhood = Array.isArray(response.data) ? response.data[0] : null;
				if (!neighbourhood || !neighbourhood.node) {
					this.statusMsg = 'the server answered without a neighbourhood';
					this.neighbourhood = null;
					return false;
				}
				this.neighbourhood = neighbourhood;
				this.rememberSummaries(neighbourhood);
				return true;
			} catch (error) {
				this.neighbourhood = null;
				this.statusMsg = refusalTextOf(error, 'standards graph');
				return false;
			} finally {
				this.neighbourhoodLoading = false;
			}
		},

		async fetchPathSummary(stableIdList) {
			const loginStore = useLoginStore();
			try {
				const response = await axios.post(NEIGHBOURHOOD_URL, { action: 'pathSummary', stableIdList }, { headers: { ...loginStore.getAuthTokenProperty } });
				const pathSummary = Array.isArray(response.data) ? response.data[0] : null;
				(pathSummary?.nodeSummaryList || []).forEach((oneSummary) => {
					this.nodeSummaryByStableId[oneSummary.stableId] = oneSummary;
				});
				return true;
			} catch (error) {
				this.statusMsg = refusalTextOf(error, 'breadcrumb');
				return false;
			}
		},

		// every node a response names becomes a known crumb, so a click needs no second request for its name
		rememberSummaries(neighbourhood) {
			const summaryOf = (oneNode) => ({
				stableId: oneNode.stableId,
				name: oneNode.name,
				kind: oneNode.kind,
				standardKey: oneNode.standardKey || null,
				standardFamily: oneNode.standardFamily || null,
				releaseLabel: oneNode.releaseLabel || null,
				version: oneNode.version || null,
			});
			const focusNode = neighbourhood.node;
			this.nodeSummaryByStableId[focusNode.stableId] = summaryOf(focusNode);
			(neighbourhood.ancestorList || []).forEach((oneAncestor) => {
				const rootFieldList = oneAncestor.kind === 'standard' ? { standardKey: focusNode.standardKey, releaseLabel: focusNode.releaseLabel, version: focusNode.version } : {};
				this.nodeSummaryByStableId[oneAncestor.stableId] ||= summaryOf({ ...oneAncestor, ...rootFieldList, standardFamily: focusNode.standardFamily });
			});
			(neighbourhood.childGroupList || []).forEach((oneGroup) =>
				oneGroup.itemList.forEach((oneItem) => {
					// an item without its own standard lives in the focus's (a class's properties, a property's occurrences)
					const inheritedFieldList = oneItem.standardKey ? {} : { standardKey: focusNode.standardKey, releaseLabel: focusNode.releaseLabel, version: focusNode.version };
					this.nodeSummaryByStableId[oneItem.stableId] = summaryOf({ ...inheritedFieldList, ...oneItem, standardFamily: oneItem.standardFamily || focusNode.standardFamily });
				}),
			);
			(neighbourhood.mappingList || []).forEach((oneMapping) => {
				this.nodeSummaryByStableId[oneMapping.anchor.stableId] ||= { stableId: oneMapping.anchor.stableId, name: oneMapping.anchor.name, kind: 'cedsAnchor', standardFamily: 'CEDS' };
			});
		},

		retry() {
			return this.loadPath([...this.pathStableIdList]);
		},

		selectRow(stableId) {
			this.selectedStableId = stableId;
		},

		setViewModeChoice(viewMode) {
			this.viewModeChoice = viewMode;
			if (viewMode === 'diagram' && this.focusNode) this.diagramRequestedForStableId = this.focusNode.stableId;
		},

		setFilterText(filterText) {
			this.filterText = filterText || '';
		},

		toggleLegend() {
			this.legendVisible = !this.legendVisible;
		},
	},
});
