// @concept: [[DataModelExplorer]]
//
// STANDARDS EXPLORER VOCABULARY (DEV-123)
//
// The visual vocabulary of design/HANDOFF.md as data, shared by the table, the diagram, the legend and the detail
// panel, so a colour or a threshold is written once. Also the ?path= codec, because the page and the store must
// agree on it exactly.

// ================================================================================
// FAMILY COLOURS — a family not listed here is drawn in neutral grey under its own name, so a newly loaded
// standard still works (the page is general; only the entry catalog is PESC's)

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

// "New in 1.8": the major.minor of the version the badge belongs to
export const versionBadgeTextOf = (versionBadge) => {
	if (!versionBadge) return '';
	if (versionBadge.badgeState === 'new') return `New in ${String(versionBadge.thisVersion).split('.').slice(0, 2).join('.')}`;
	if (versionBadge.badgeState === 'changed') return 'Changed';
	return 'unchanged';
};

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
