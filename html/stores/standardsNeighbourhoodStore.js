// @concept: [[DataModelExplorer]]
// @concept: [[PiniaStorePattern]]
// @concept: [[AuthenticatedApiCall]]
//
// STANDARDS NEIGHBOURHOOD STORE (DEV-123, the Standards Explorer)
//
// Holds the walk: the navigation path (stableIds, from the URL's ?path=), the focus node's neighbourhood as
// POST /api/standards-neighbourhood answered it, names for every breadcrumb, and the shared view state (Diagram or
// Table, selection, filter, legend). The page owns the URL and the router; this store only loads what a path names.
// Every row the table and the diagram draw comes from the levelRowList getter, so the two views cannot disagree.
// The detail panel's version tiles (the same item in the message's other versions) load lazily, once per stableId,
// into versionTileStateByStableId; a failure there stays in its entry and never blanks the panel.

import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';
import {
	DEFAULT_VIEW_MODE_NAME,
	LARGE_LEVEL_ITEM_COUNT,
	displayNameOf,
	isSecondaryRelationshipType,
	relationshipDisplayNameOf,
	rowWalkPathOf,
	walkLinkOf,
	walkProfileOf,
} from '@/components/standardsExplorer/explorerVocabulary';

const standardsNeighbourhoodStoreInitObject = {
	pathStableIdList: [],
	neighbourhood: null,
	nodeSummaryByStableId: {},
	neighbourhoodLoading: false,
	statusMsg: '',
	// ⟪meaningsPolish review S3⟫ the last neighbourhood request was refused by the server (HTTP 4xx, its words in statusMsg), not left unanswered
	statusIsRefusal: false,
	viewModeChoice: DEFAULT_VIEW_MODE_NAME,
	diagramRequestedForStableId: '',
	selectedStableId: '',
	filterText: '',
	legendVisible: true,
	versionTileStateByStableId: {},
	// ⟪meaningsClarity review S4⟫ an element's meaning facts, asked for apart from its node (action meaningFacts), once per stableId: { loading, meaningFacts, meaningFactsAbsentName, failed }
	meaningFactsStateByStableId: {},
	// ⟪explorerTidy, supervisor's ruling⟫ a selected leaf meaning's own node (its tuple and Expressed-in), read with the request a drill makes, once per stableId: { loading, meaningNode, failed }
	leafMeaningStateByStableId: {},
	// ⟪meaningsExplorer⟫ which walk the views are drawing (explorerVocabulary's walkProfileByName); WalkView sets it from its page on every mount
	walkProfileName: 'standards',
};

const NEIGHBOURHOOD_URL = '/api/standards-neighbourhood';
// the walk is public (BD 2026-11-04): a visitor without a token sends no Authorization header (a 'Bearer undefined' would be
// refused as a malformed token), a signed-in one sends theirs
const authHeadersOf = (loginStore) => (loginStore.authtoken ? { ...loginStore.getAuthTokenProperty } : {});

// a 4xx answer is the server refusing what was asked, by name; anything else (no answer, 5xx) is a failure to answer
const REFUSAL_STATUS_MINIMUM = 400;
const REFUSAL_STATUS_LIMIT = 500;
const isRefusalStatus = (httpStatus) => typeof httpStatus === 'number' && httpStatus >= REFUSAL_STATUS_MINIMUM && httpStatus < REFUSAL_STATUS_LIMIT;
const refusalTextOf = (error, operationName) =>
	(typeof error.response?.data === 'string' && error.response.data) || error.message || `the ${operationName} request failed`;

// the hub a group of a hub's own items is said of: its items name it (hubName); a group of no hub's items names none
const groupHubNameOf = (oneGroup) => ((oneGroup.itemList || []).find((oneItem) => oneItem.hubName) || {}).hubName || null;

// ⟪explorerUris⟫ the URI fields an item carries, copied only when present, so a row says no more than the server did
const URI_FIELD_NAME_LIST = ['uri', 'uriKind', 'uriAbsentName', 'elementListUri'];
const uriFieldsOfItem = (oneItem) => Object.fromEntries(URI_FIELD_NAME_LIST.filter((fieldName) => oneItem[fieldName] !== undefined).map((fieldName) => [fieldName, oneItem[fieldName]]));

// one table/diagram row from one child item
const rowOfItem = ({ oneItem, oneGroup, focusNode }) => ({
	stableId: oneItem.stableId,
	name: oneItem.name,
	displayName: displayNameOf(oneItem),
	kind: oneItem.kind,
	relationshipType: oneGroup.relationshipType,
	groupName: relationshipDisplayNameOf(oneGroup.relationshipType, groupHubNameOf(oneGroup)),
	isSecondary: isSecondaryRelationshipType(oneGroup.relationshipType),
	hubName: oneItem.hubName || null,
	standardFamily: oneItem.standardFamily || focusNode.standardFamily || null,
	standardKey: oneItem.standardKey || null,
	description: oneItem.description || '',
	path: oneItem.path || '',
	ownerName: oneItem.ownerName || '',
	mapping: oneItem.mapping || null,
	versionBadge: oneItem.versionBadge || null,
	hasVersionIdentity: Boolean(oneItem.hasVersionIdentity),
	hasChildren: Boolean(oneItem.hasChildren),
	propertyCount: oneItem.propertyCount,
	mappedPropertyCount: oneItem.mappedPropertyCount,
	occurrenceCount: oneItem.occurrenceCount,
	classCount: oneItem.classCount,
	standardCount: oneItem.standardCount,
	releaseCount: oneItem.releaseCount,
	hubDomainName: oneItem.hubDomainName || '',
	hubElementCount: oneItem.hubElementCount,
	mappedElementCount: oneItem.mappedElementCount,
	elementCount: oneItem.elementCount,
	matchKindCountList: oneItem.matchKindCountList || null,
	strongestMatchKind: oneItem.strongestMatchKind || null,
	versionList: oneItem.versionList || null,
	version: oneItem.version || null,
	releaseLabel: oneItem.releaseLabel || null,
	// ⟪meaningsExplorer⟫ a meaning's tier and what it is about; a meaning group's counts
	referenceTier: oneItem.referenceTier || null,
	termKind: oneItem.termKind || null,
	rangeName: oneItem.rangeName || '',
	qualifierNameList: oneItem.qualifierNameList || null,
	meaningCount: oneItem.meaningCount,
	mappedMeaningCount: oneItem.mappedMeaningCount,
	// ⟪meaningsPolish⟫ what a hub's and a domain's next level lists: a hub's domains; a domain's own term meaning (0 or 1) beside its meanings
	domainCount: oneItem.domainCount,
	termMeaningCount: oneItem.termMeaningCount,
	// ⟪meaningsClarity⟫ a domain's meanings from other domains; a property meaning's values; an incoming meaning's slots and the walk's path to it in its own domain
	incomingMeaningCount: oneItem.incomingMeaningCount,
	// TQ 2026-11-12: the mappings to a domain's own meanings and own term, its Mappings column
	mappingCount: oneItem.mappingCount,
	valueMeaningCount: oneItem.valueMeaningCount,
	valueElementCount: oneItem.valueElementCount,
	incomingSlotNameList: oneItem.incomingSlotNameList || null,
	meaningsWalkPathStableIdList: oneItem.meaningsWalkPathStableIdList || null,
	// ⟪review S4⟫ a domain's id in its hub's standard
	nativeId: oneItem.nativeId || null,
	// ⟪explorerUris⟫ its EDUcore URI as the server minted it, or why there is none (a synthetic row has neither)
	...uriFieldsOfItem(oneItem),
});

// a mapping of the focus is a row too: the hub element it points at, in its hub's family (both named by the server)
const rowOfMapping = ({ oneMapping }) => ({
	stableId: oneMapping.anchor.stableId,
	name: oneMapping.anchor.name,
	displayName: oneMapping.anchor.name,
	kind: 'hubAnchor',
	relationshipType: 'MAPS_TO_HUB',
	groupName: relationshipDisplayNameOf('MAPS_TO_HUB', oneMapping.anchor.hubName),
	isSecondary: false,
	hubName: oneMapping.anchor.hubName || null,
	standardFamily: oneMapping.anchor.standardFamily || null,
	standardKey: null,
	description: '',
	path: '',
	ownerName: '',
	mapping: oneMapping,
	versionBadge: null,
	hasChildren: true,
	occurrenceCount: oneMapping.occurrenceCount,
	...uriFieldsOfItem(oneMapping.anchor),
});

export const useStandardsNeighbourhoodStore = defineStore('standardsNeighbourhoodStore', {
	state: () => ({ ...standardsNeighbourhoodStoreInitObject }),

	getters: {
		focusNode: (state) => (state.neighbourhood ? state.neighbourhood.node : null),

		// ⟪meaningsExplorer⟫ the walk being drawn, and a link to a point of it: every component's Open, crumb and row link goes through here
		walkProfile: (state) => walkProfileOf(state.walkProfileName),
		walkLinkOf: (state) => (pathStableIdList) => walkLinkOf(state.walkProfileName, pathStableIdList),

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

		// the hubs this page names (the focus and its rows), each with its family, in the order met; the legend draws
		// a hub's own bubbles from it
		shownHubList() {
			const hubByName = {};
			[this.focusNode, ...this.levelRowList].filter((oneNode) => oneNode && oneNode.hubName).forEach((oneNode) => {
				hubByName[oneNode.hubName] ||= { hubName: oneNode.hubName, standardFamily: oneNode.standardFamily || null };
			});
			return Object.values(hubByName);
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

		// ⟪meaningsClarity⟫ how many of this level's rows the filter dims (diagram) or hides (table): the filter notice says it whenever it is more than none
		filterUnmatchedRowCount() {
			return this.levelRowList.length - this.filteredRowList.length;
		},

		// ⟪meaningsClarity⟫ the walk's path one step into a row: below this level, or to where the row lives when it carries its own path (an incoming meaning,
		// opened in its own domain). Every drill, Open and item link goes through here
		drillPathOf() {
			return (stableId) => rowWalkPathOf({ walkProfileName: this.walkProfileName, pathStableIdList: this.pathStableIdList, stableId, row: this.levelRowList.find((oneRow) => oneRow.stableId === stableId) || null });
		},

		truncatedGroupList: (state) => (state.neighbourhood ? state.neighbourhood.childGroupList.filter((oneGroup) => oneGroup.truncated) : []),

		isLargeLevel() {
			return this.levelRowList.length > LARGE_LEVEL_ITEM_COUNT;
		},

		// a large level opens in the table unless the person asked for the diagram of THIS level
		// ⟪Schema Viewer, BD 2026-11-04⟫ the standard the walk is in: the focus's own family, else the family the walk began
		// in; none at the families catalog, where there is no one standard to show the schema of
		walkStandard() {
			const focusNode = this.focusNode;
			if (!focusNode || focusNode.kind === 'familyCatalog' || !this.walkProfile.offersSchemaViewer) return null;
			const standardFamily = focusNode.standardFamily || (this.pathStableIdList.find((oneStableId) => oneStableId.indexOf('family:') === 0) || '').slice('family:'.length);
			if (!standardFamily) return null;
			return { standardFamily, standardKey: focusNode.standardKey || null, releaseLabel: focusNode.releaseLabel || null, version: focusNode.version || null };
		},

		// the view shown: the choice, except that a large level opens as a table (unless its diagram was asked for), and the
		// Schema Viewer needs a standard to show (at the families catalog it falls back to the diagram)
		effectiveViewMode() {
			if (this.viewModeChoice === 'schema') return this.walkStandard ? 'schema' : 'diagram';
			if (this.isLargeLevel && this.diagramRequestedForStableId !== this.focusNode?.stableId) return 'table';
			return this.viewModeChoice;
		},

		selectedRow() {
			return this.levelRowList.find((oneRow) => oneRow.stableId === this.selectedStableId) || null;
		},

		// the item whose other versions the panel tiles: the selected row, else the focus. Asked for only when the
		// item carries a version identity and its message has another version (a one-version standard asks nothing)
		versionTileSubject() {
			const focusNode = this.focusNode;
			if (!focusNode || !this.walkProfile.showsStandardSections || !(focusNode.otherVersionList || []).length) return null;
			const subjectNode = this.selectedRow || focusNode;
			const inFocusStandard = !subjectNode.standardKey || subjectNode.standardKey === focusNode.standardKey;
			if (!subjectNode.hasVersionIdentity || !inFocusStandard) return null;
			return { stableId: subjectNode.stableId, standardFamily: focusNode.standardFamily, releaseLabel: focusNode.releaseLabel, version: focusNode.version };
		},

		versionTileState() {
			return this.versionTileSubject ? this.versionTileStateByStableId[this.versionTileSubject.stableId] || null : null;
		},

		// the breadcrumb: one entry per path step, named from what the server told us
		crumbList: (state) =>
			state.pathStableIdList.map((oneStableId, pathIndex) => {
				const nodeSummary = state.nodeSummaryByStableId[oneStableId] || { stableId: oneStableId, name: oneStableId };
				return { stableId: oneStableId, pathIndex, kind: nodeSummary.kind, hubName: nodeSummary.hubName || null, standardFamily: nodeSummary.standardFamily || null, displayName: displayNameOf(nodeSummary) };
			}),

		// the crossing: the path went through a hub element and the focus belongs to another family than the
		// element the person started from
		crossing() {
			const anchorIndex = this.crumbList.map((oneCrumb) => oneCrumb.kind).lastIndexOf('hubAnchor');
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
			this.statusIsRefusal = false;
			try {
				const response = await axios.post(NEIGHBOURHOOD_URL, { action: 'node', stableId, compareVersion: true }, { headers: authHeadersOf(loginStore) });
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
				this.statusIsRefusal = isRefusalStatus(error.response?.status);
				return false;
			} finally {
				this.neighbourhoodLoading = false;
			}
		},

		async fetchPathSummary(stableIdList) {
			const loginStore = useLoginStore();
			try {
				const response = await axios.post(NEIGHBOURHOOD_URL, { action: 'pathSummary', stableIdList }, { headers: authHeadersOf(loginStore) });
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
				hubName: oneNode.hubName || null,
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
				this.nodeSummaryByStableId[oneMapping.anchor.stableId] ||= { stableId: oneMapping.anchor.stableId, name: oneMapping.anchor.name, kind: 'hubAnchor', hubName: oneMapping.anchor.hubName || null, standardFamily: oneMapping.anchor.standardFamily || null };
			});
		},

		// ⟪meaningsExplorer⟫ the page names its walk; a walk not in explorerVocabulary's walkProfileByName is refused there
		setWalkProfileName(walkProfileName) {
			walkProfileOf(walkProfileName);
			this.walkProfileName = walkProfileName;
		},

		retry() {
			return this.loadPath([...this.pathStableIdList]);
		},

		// the version tiles of one item: fetched once, cached by stableId; an error is kept in the entry so the panel
		// can say so in the tile area and offer the request again
		async loadVersionCounterparts(stableId) {
			const existingState = this.versionTileStateByStableId[stableId];
			if (existingState && (existingState.loading || existingState.versionCounterparts)) return Boolean(existingState.versionCounterparts);
			const loginStore = useLoginStore();
			this.versionTileStateByStableId[stableId] = { loading: true, statusMsg: '', versionCounterparts: null };
			try {
				const response = await axios.post(NEIGHBOURHOOD_URL, { action: 'versionCounterparts', stableId }, { headers: authHeadersOf(loginStore) });
				const versionCounterparts = Array.isArray(response.data) ? response.data[0] : null;
				if (!versionCounterparts || !Array.isArray(versionCounterparts.counterpartList)) {
					this.versionTileStateByStableId[stableId] = { loading: false, statusMsg: 'the server answered without version counterparts', versionCounterparts: null };
					return false;
				}
				this.versionTileStateByStableId[stableId] = { loading: false, statusMsg: '', versionCounterparts };
				return true;
			} catch (error) {
				this.versionTileStateByStableId[stableId] = { loading: false, statusMsg: refusalTextOf(error, 'other versions'), versionCounterparts: null };
				return false;
			}
		},

		// ⟪meaningsClarity review S4⟫ the meanings an element takes part in, for the panel: fetched once per stableId, after the node, so a walk step costs what it did.
		// A synthetic id answers meaningFactsAbsentName (notAGraphElement) and the panel says nothing; a failed read is kept, and the panel says so in its own words.
		async loadMeaningFacts(stableId) {
			const existingState = this.meaningFactsStateByStableId[stableId];
			if (existingState && !existingState.failed) return;
			const loginStore = useLoginStore();
			this.meaningFactsStateByStableId[stableId] = { loading: true, meaningFacts: null, meaningFactsAbsentName: '', failed: false };
			try {
				const response = await axios.post(NEIGHBOURHOOD_URL, { action: 'meaningFacts', stableId }, { headers: authHeadersOf(loginStore) });
				const factsAnswer = Array.isArray(response.data) ? response.data[0] : null;
				this.meaningFactsStateByStableId[stableId] = { loading: false, meaningFacts: (factsAnswer && factsAnswer.meaningFacts) || null, meaningFactsAbsentName: (factsAnswer && factsAnswer.meaningFactsAbsentName) || '', failed: !factsAnswer };
			} catch (error) {
				this.meaningFactsStateByStableId[stableId] = { loading: false, meaningFacts: null, meaningFactsAbsentName: '', failed: true };
			}
		},

		// ⟪explorerTidy, supervisor's ruling⟫ a meaning row that opens to nothing has no Open, so its panel shows what its focus would: its own node, read by the same
		// request a drill sends (action node), kept apart from the level on screen. Once per stableId; a failed read is kept, and the panel says so in its own words.
		async loadLeafMeaning(stableId) {
			const existingState = this.leafMeaningStateByStableId[stableId];
			if (existingState && !existingState.failed) return;
			const loginStore = useLoginStore();
			this.leafMeaningStateByStableId[stableId] = { loading: true, meaningNode: null, failed: false };
			try {
				const response = await axios.post(NEIGHBOURHOOD_URL, { action: 'node', stableId }, { headers: authHeadersOf(loginStore) });
				const leafNeighbourhood = Array.isArray(response.data) ? response.data[0] : null;
				this.leafMeaningStateByStableId[stableId] = { loading: false, meaningNode: (leafNeighbourhood && leafNeighbourhood.node) || null, failed: !(leafNeighbourhood && leafNeighbourhood.node) };
			} catch (error) {
				this.leafMeaningStateByStableId[stableId] = { loading: false, meaningNode: null, failed: true };
			}
		},

		selectRow(stableId) {
			this.selectedStableId = stableId;
		},

		setViewModeChoice(viewMode) {
			this.viewModeChoice = viewMode;
			if (viewMode === 'diagram' && this.focusNode) this.diagramRequestedForStableId = this.focusNode.stableId;
		},

		// the "+N more" bubble: back to the table, and a large level opens in the table again next time
		returnToTable() {
			this.viewModeChoice = 'table';
			this.diagramRequestedForStableId = '';
		},

		setFilterText(filterText) {
			this.filterText = filterText || '';
		},

		toggleLegend() {
			this.legendVisible = !this.legendVisible;
		},
	},
});
