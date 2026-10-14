// @concept: [[DataModelExplorer]]
//
// STANDARDS EXPLORER VOCABULARY (DEV-123)
//
// The visual vocabulary of design/HANDOFF.md as data, shared by the table, the diagram, the legend and the detail
// panel, so a colour or a threshold is written once. Also the ?path= codec, because the page and the store must
// agree on it exactly.

// ================================================================================
// FAMILY COLOURS — a family not listed here is drawn in neutral grey under its own name, so a newly loaded
// standard still works (the page is general; the list of families comes from the graph, not from here)

export const familyStyleByName = Object.freeze({
	PESC: { color: '#072A6C', tint: '#E7ECF6', displayName: 'PESC' },
	SIF: { color: '#6B3FA0', tint: '#F1EBF8', displayName: 'SIF' },
	EdFi: { color: '#1E7A4C', tint: '#E6F4EC', displayName: 'Ed-Fi' },
	CEDS: { color: '#00797C', fill: '#00B5B8', tint: '#E0F6F6', displayName: 'CEDS' },
});

export const familyStyleOf = (standardFamily) =>
	familyStyleByName[standardFamily] || { color: '#4B5563', tint: '#F3F4F6', displayName: standardFamily || 'Unknown family' };

// ================================================================================
// MATCH KINDS — colour AND line style, never colour alone

export const matchStyleByKind = Object.freeze({
	exact: { color: '#0B6B4E', lineStyle: 'solid', description: 'same meaning' },
	close: { color: '#1F5FBF', lineStyle: 'dashed', description: 'nearly the same' },
	broad: { color: '#B4530F', lineStyle: 'dotted', description: 'CEDS is narrower' },
	narrow: { color: '#7A3E9D', lineStyle: 'double', description: 'CEDS is broader' },
});

export const matchKindOrderList = Object.freeze(['exact', 'close', 'narrow', 'broad']);

// ================================================================================
// CONFIDENCE — a judgment, not a fact: thicker and darker means surer

export const confidenceTierList = Object.freeze([
	{ minimumConfidence: 0.85, edgeWidth: 5, edgeOpacity: 1, tierName: 'High (0.85 and up)' },
	{ minimumConfidence: 0.65, edgeWidth: 4, edgeOpacity: 0.75, tierName: 'Medium (0.65 to 0.84)' },
	{ minimumConfidence: 0, edgeWidth: 3, edgeOpacity: 0.5, tierName: 'Low (below 0.65)' },
]);

export const confidenceTierOf = (mappingConfidence) =>
	confidenceTierList.find((oneTier) => (mappingConfidence || 0) >= oneTier.minimumConfidence);

// ================================================================================
// KINDS AND RELATIONSHIPS — the words a standards person reads

export const kindDisplayNameByKind = Object.freeze({
	familyCatalog: 'All standards',
	family: 'Standards family',
	release: 'Message',
	standard: 'Standard',
	class: 'Class',
	property: 'Property',
	instance: 'Occurrence',
	optionSet: 'Code list',
	optionValue: 'Code',
	cedsAnchor: 'CEDS element',
	cedsProperty: 'CEDS property',
	cedsDomain: 'CEDS domain',
	standardGroup: 'Elements in one standard',
	support: 'Supporting item',
	unclassified: 'Unclassified',
	more: 'More, in the table',
});

export const kindDisplayNameOf = (nodeKind) => kindDisplayNameByKind[nodeKind] || nodeKind;

const pluralKindNameByKind = Object.freeze({
	family: 'standards families',
	class: 'classes',
	property: 'properties',
	cedsProperty: 'CEDS properties',
	cedsAnchor: 'CEDS elements',
	standardGroup: 'standards',
	optionValue: 'codes',
});

export const pluralKindNameOf = (nodeKind) => pluralKindNameByKind[nodeKind] || `${kindDisplayNameOf(nodeKind).replace(/^([A-Z])(?=[a-z])/, (initialLetter) => initialLetter.toLowerCase())}s`;

export const relationshipDisplayNameByType = Object.freeze({
	HAS_FAMILY: 'Standards families',
	HAS_STANDARD: 'Messages',
	HAS_VERSION: 'Versions',
	HAS_CLASS: 'Classes',
	HAS_PROPERTY: 'Properties',
	HAS_FIELD: 'Fields',
	HAS_INSTANCE: 'Occurrences',
	HAS_CHILD: 'Contains',
	HAS_OPTION_SET: 'Code list',
	HAS_VALUE: 'Codes',
	SUBCLASS_OF: 'Subclass of',
	REFERENCES_TYPE: 'Uses type',
	REFERENCES: 'Refers to',
	REFERENCES_OBJECT: 'Refers to object',
	HAS_DEFINITION: 'Defines',
	HAS_SUPPORT: 'Supporting items',
	MAPPED_FROM_STANDARD: 'Standards that map here',
	MAPPED_TO_ANCHOR: 'Mapped elements',
	HAS_CEDS_PROPERTY: 'CEDS property',
	HAS_CEDS_DOMAIN: 'CEDS domain',
	MAPS_TO_CEDS: 'Maps to CEDS',
	USED_BY_CEDS_ELEMENT: 'CEDS elements',
});

export const relationshipDisplayNameOf = (relationshipType) => relationshipDisplayNameByType[relationshipType] || relationshipType;

// structural, quiet relationships drawn and listed after the main ones
export const secondaryRelationshipTypeList = Object.freeze(['SUBCLASS_OF', 'REFERENCES_TYPE', 'REFERENCES', 'REFERENCES_OBJECT', 'HAS_DEFINITION', 'HAS_SUPPORT', 'HAS_CEDS_PROPERTY', 'HAS_CEDS_DOMAIN']);

// ================================================================================
// BADGES AND RULES

export const versionBadgeStyleByState = Object.freeze({
	unchanged: { background: 'transparent', border: 'none', color: '#6B7280' },
	changed: { background: '#FFFFFF', border: '1.5px solid #B26A00', color: '#8A5200' },
	new: { background: '#DDF5F5', border: 'none', color: '#005E61' },
});

const majorMinorOf = (version) => String(version).split('.').slice(0, 2).join('.');

const newerVersionOf = (versionA, versionB) => {
	const partListA = String(versionA).split('.').map(Number);
	const partListB = String(versionB).split('.').map(Number);
	for (let partIndex = 0; partIndex < Math.max(partListA.length, partListB.length); partIndex++) {
		const difference = (partListA[partIndex] || 0) - (partListB[partIndex] || 0);
		if (difference) return difference > 0 ? versionA : versionB;
	}
	return versionA;
};

// "New in 1.8": the version the badge belongs to. "Different in 1.8": the newer of the two
// versions compared, whichever one is on screen, since a change is read as the later version's.
export const versionBadgeTextOf = (versionBadge) => {
	if (!versionBadge) return '';
	if (versionBadge.badgeState === 'new') return `New in ${majorMinorOf(versionBadge.thisVersion)}`;
	if (versionBadge.badgeState === 'changed') return `Different in ${majorMinorOf(newerVersionOf(versionBadge.thisVersion, versionBadge.comparedVersion))}`;
	return 'unchanged';
};

// ================================================================================
// VERSION TILES — the selected item as it stands in the message's other versions (the detail panel)

// the tile's relation to the selected item; 'absent' has no counterpart at all. Colours are the badges' own
export const versionTileRelationByState = Object.freeze({
	unchanged: { relationText: 'Same', badgeStyle: versionBadgeStyleByState.unchanged },
	changed: { relationText: 'Different', badgeStyle: versionBadgeStyleByState.changed },
});

// what a definition's members are called on the tile ("Properties only in 1.8.0: ..."); a kind not listed is
// named by the neutral word, deliberately: the page must read for any standard
const versionMemberNounByKind = Object.freeze({ class: 'Properties', optionSet: 'Codes', support: 'Members' });
export const versionMemberNounOf = (nodeKind) => versionMemberNounByKind[nodeKind] || 'Members';

// ================================================================================
// THE WALK'S TOP — every path begins at the families catalog (a synthetic id the server answers with one item per
// family in the graph); the first family: crumb after it is the family the walk began in

export const FAMILY_CATALOG_STABLE_ID = 'families:all';

// a path as the explorer keeps it: the catalog first, prepended when a path (an /explore/pesc link) lacks it
export const explorerPathOf = (pathStableIdList) =>
	pathStableIdList[0] === FAMILY_CATALOG_STABLE_ID ? pathStableIdList : [FAMILY_CATALOG_STABLE_ID, ...pathStableIdList];

// the family the walk began in: the first family: crumb; none while the walk is still at the catalog
export const homeStandardFamilyOf = (pathStableIdList) => {
	const familyStableId = pathStableIdList.find((oneStableId) => oneStableId.indexOf('family:') === 0);
	return familyStableId ? familyStableId.slice('family:'.length) : '';
};

// the walk to a counterpart in its own version's tree: catalog › family › release › its ancestors › itself
export const counterpartPathOf = ({ standardFamily, releaseLabel, counterpart }) => [
	FAMILY_CATALOG_STABLE_ID,
	`family:${standardFamily}`,
	`release:${standardFamily}/${releaseLabel}`,
	...(counterpart.ancestorList || []).map((oneAncestor) => oneAncestor.stableId),
	counterpart.stableId,
];

// what one family holds, for its bubble and row: its version when it has one standard, else its count of standards
export const familyHoldingTextOf = (familyRow) => {
	if (familyRow.standardCount === 1) return `version ${familyRow.version}`;
	const messageText = familyRow.releaseCount === familyRow.standardCount ? '' : ` in ${familyRow.releaseCount} messages`;
	return `${familyRow.standardCount} standards${messageText}`;
};

// how much maps to CEDS here, in words: a CEDS element counts its distinct elements, a CEDS property the judgments
// reaching it through its CEDS elements
export const cedsMappedTextOf = (cedsRow) => {
	if (cedsRow.elementCount !== undefined) return cedsRow.elementCount ? `${cedsRow.elementCount} elements map here` : 'nothing maps here';
	if (cedsRow.mappedElementCount === undefined) return '';
	return cedsRow.mappedElementCount ? `${cedsRow.mappedElementCount} mappings` : 'nothing maps here';
};

// cmd-click (macOS) or ctrl-click (Windows, Linux) opens an item at once, as its panel's Open button would
export const isOpenAtOnceClick = (domEvent) => Boolean(domEvent && (domEvent.metaKey || domEvent.ctrlKey));

// a level with more items than this opens in the table (spec §6.4)
export const LARGE_LEVEL_ITEM_COUNT = 40;

// ================================================================================
// NAMES — 'CollegeTranscript' reads 'College Transcript'

export const humanizeName = (rawName) =>
	String(rawName || '')
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.trim();

export const displayNameOf = (nodeSummary) => {
	if (!nodeSummary) return '';
	if (nodeSummary.kind === 'family') return familyStyleOf(nodeSummary.standardFamily || nodeSummary.name).displayName;
	if (nodeSummary.kind === 'release') return humanizeName(nodeSummary.releaseLabel || nodeSummary.name);
	if (nodeSummary.kind === 'standard' || nodeSummary.kind === 'standardGroup') {
		const familyName = familyStyleOf(nodeSummary.standardFamily).displayName;
		const releaseText = nodeSummary.releaseLabel && nodeSummary.releaseLabel !== nodeSummary.standardFamily && !/^[a-z]+\d+$/.test(nodeSummary.releaseLabel) ? ` ${humanizeName(nodeSummary.releaseLabel)}` : '';
		const versionText = nodeSummary.version && nodeSummary.kind === 'standard' ? ` ${nodeSummary.version}` : nodeSummary.version && releaseText ? ` ${nodeSummary.version}` : '';
		if (!nodeSummary.standardFamily) return nodeSummary.name;
		return `${familyName}${releaseText}${versionText}`;
	}
	return nodeSummary.name || nodeSummary.stableId;
};

// ================================================================================
// THE ?path= CODEC — stableIds joined by ','. A stableId may itself hold ',' (42 Ed-Fi code values do) or '%',
// so each id writes those two as %2C and %25 before joining; the router's own encoding sits on top and is undone
// by the router, so reading splits on ',' and then restores the two.

export const pathTextOf = (pathStableIdList) => pathStableIdList.map((oneStableId) => oneStableId.replace(/%/g, '%25').replace(/,/g, '%2C')).join(',');

export const pathStableIdListOf = (pathText) =>
	typeof pathText === 'string' && pathText !== ''
		? pathText.split(',').filter((onePart) => onePart !== '').map((onePart) => onePart.replace(/%2C/g, ',').replace(/%25/g, '%'))
		: [];
