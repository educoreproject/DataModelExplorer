// @concept: [[DataModelExplorer]]
//
// STANDARDS EXPLORER VOCABULARY (DEV-123)
//
// The visual vocabulary of design/HANDOFF.md as data, shared by the table, the diagram, the legend and the detail
// panel, so a colour or a threshold is written once. Also the ?path= codec, because the page and the store must
// agree on it exactly.
// ⟪meaningsPolish⟫ The Meanings explorer's words are data in meaningsVocabulary, the next block; wordingOf fills a template's {names}.

// ================================================================================
// ⟪meaningsPolish, WORKORDER-meaningsPolish-111026, TQ's standing rule NO MAGIC STRINGS⟫ THE MEANINGS EXPLORER'S WORDS
// Every word a reader sees on the Meanings explorer that is not the Standards Explorer's own: the heading and intro, the kind and count wording, the
// meaning panel's words, and the "What is a meaning?" explainer with its diagram and caption. Data only; the templates' {name} placeholders are filled
// by wordingOf, which refuses a missing name. A count noun is { one, other }. It lives in this file, not a file of its own, because the server suite
// imports this module alone from a temporary copy (standards-explorer-hub-vocabulary.test.js, explorer-hub-family-colour-live.test.js), so it may import
// nothing.

// ⟪review S5⟫ the Cite as line's words (CiteAs.vue), shared by both walks
export const citeAsVocabulary = Object.freeze({
	citeLabel: 'Cite as',
	copyText: 'Copy',
	copiedText: 'Copied',
	copyFailedText: 'Copy failed',
	openOwnIriText: 'Open its own IRI',
	openPageText: 'Open its page',
	listElementsText: 'List its elements',
	ownIriNoteText: "Another publisher's IRI: what this node is, not an EDUcore page.",
});

// the domain's own term card, listed apart from its meanings (TQ: "labelled unmistakably as the domain's own term"): one wording, used for its row, its group
// and its legend chip
const DOMAIN_OWN_TERM_TEXT = "This domain's own term";

export const meaningsVocabulary = Object.freeze({
	// the page's language, for the counts' digit grouping ("2,777")
	numberLocaleName: 'en-US',

	// ---- the page's title bar (ExploreViewBar), and the walk profile's words (WalkView's heading, intro, root level, meta description)
	viewBarTitleText: 'Meanings',
	titleText: 'Meanings Explorer',
	introText:
		'A meaning is one idea the standards can express, named once with a permanent URI. Sometimes a meaning is a single element of a standard; often it is a tuple, such as a property within a particular CEDS domain. Pick a hub, then a domain; open a meaning to see what it names and every standard element that expresses it.',
	rootLevelText: 'every group of meanings',
	metaDescriptionText: 'Walk the meanings in the EDUcore graph: each hub, its domains, the meanings they name, and every standard element mapped to each meaning.',

	// ---- kinds: a meaning is an EDUcore construct, whatever hub defines it (punch-list item 1)
	meaningKindText: 'EDC meaning',
	meaningKindPluralText: 'EDC meanings',

	// ---- counts (punch-list items 3, 4, 5, 7): each says what the next level shows
	domainNoun: Object.freeze({ one: 'domain', other: 'domains' }),
	meaningNoun: Object.freeze({ one: 'meaning', other: 'meanings' }),
	elementNoun: Object.freeze({ one: 'element', other: 'elements' }),
	countedNounTemplate: '{countText} {nounText}',
	countPartDivider: ' · ',
	hubHoldingTemplate: '{domainCountText} · {meaningCountText}',
	domainOwnTermText: '+ its own term',
	domainHoldingTemplate: '{meaningCountText} {ownTermText}',
	// ⟪review S6⟫ a domain no property meaning names: its only meaning is its own term
	domainOwnTermOnlyText: 'its own term only',
	expressedTemplate: '{countText} expressed in other standards',
	meaningExpressionTemplate: '{elementCountText} map here',
	meaningExpressionOneTemplate: '{elementCountText} maps here',
	meaningUnexpressedText: 'nothing maps here',
	domainOwnTermRowText: DOMAIN_OWN_TERM_TEXT,
	rangeTemplate: 'range {rangeName}',
	qualifierTemplate: 'qualified by {qualifierNameText}',
	qualifierNameDivider: ', ',

	// ---- the detail panel's facts for a hub and a domain
	domainsFactName: 'Domains',
	meaningsFactName: 'Meanings',
	// ⟪review S4⟫ a domain's id in its hub's standard, as a fact: "CEDS id" C200012
	hubIdFactNameTemplate: '{hubName} id',

	// ---- ⟪review S3⟫ a walk step the server refused (HTTP 4xx): its own words beneath, never "did not answer" or "Try again"
	refusalTitleText: 'This step of the walk was refused',
	refusalGuideText: 'The server says why, below. Go back with the breadcrumb.',

	// ---- ⟪review N2⟫ the legend's chip for the domain's own term
	ownTermLegendKindText: DOMAIN_OWN_TERM_TEXT,

	// ---- the relationship groups a meanings level lists
	relationshipDisplayNameByType: Object.freeze({
		HAS_MEANING_HUB: 'Hubs',
		HAS_MEANING_DOMAIN: 'Domains',
		HAS_MEANING: 'Meanings',
		HAS_TERM_MEANING: DOMAIN_OWN_TERM_TEXT,
		HAS_VALUE_MEANING: 'Value meanings',
	}),

	// ---- one meaning's panel (MeaningSection.vue)
	meaningSection: Object.freeze({
		sectionLabel: 'What this meaning is',
		tierFactName: 'Tier',
		tierTemplate: '{referenceTier} tier ({tierWords})',
		tierWithTermKindTemplate: '{referenceTier} tier ({tierWords}; a {termKind})',
		tierWordsByTier: Object.freeze({ property: 'a property in a domain', value: 'one code of a property in a domain', term: 'one term, meant on its own' }),
		slotLabelByName: Object.freeze({ domain: 'Domain', property: 'Property', range: 'Range', value: 'Value', qualifier: 'Qualifier', term: 'Term' }),
		partKindLabelByKind: Object.freeze({ class: 'class', property: 'property', optionSet: 'code list', option: 'code' }),
		// a slot's own id in its hub's standard: "CEDS id P000043" (punch-list item 8)
		hubIdTemplate: '{hubName} id {nativeIdText}',
		partDivider: ' · ',
		openNoteExpressedTemplate: 'Expressed in {elementCountText}. ',
		openNoteText: 'Open this meaning for its tuple and every element that expresses it.',
		tupleHeadText: 'What it names',
		tupleAbsentText: 'No citable tuple:',
		rangesSummaryText: 'Ranges',
		rangesAsideText: '(description, not part of what it names)',
		datatypeTemplate: 'Datatype: {datatypeText}',
		datatypeRangeTemplate: 'Datatype range: {datatypeText}',
		datatypeDivider: ', ',
		expressedInHeadText: 'Expressed in',
		unexpressedText: 'No element of any standard is mapped to this meaning.',
		expressionsCappedTemplate: 'Showing {shownCount} of {expressionCount}: each standard lists at most its first {groupItemCap}, strongest first.',
		groupCappedTemplate: '{elementCount}, showing {shownCount}',
		elementLinkTitleTemplate: 'Open {elementName} in the Standards Explorer',
		elementOwnerTemplate: 'of {ownerName}',
		pathAbsentTextByName: Object.freeze({ noClimbFromRoot: "no walk reaches it from its standard's root" }),
	}),

	// ---- the JSON-LD the page carries for agents (pages/explore/meanings.vue)
	jsonLd: Object.freeze({
		catalogName: 'EDUcore meanings',
		focusNameTemplate: 'EDUcore meanings: {focusName}',
		description: 'Meanings named by the EDUcore hubs, each with a permanent EDUcore URI and the standard elements mapped to it.',
		termCodeTemplate: '{hubName} {referenceTier} meaning',
	}),

	// ---- "What is a meaning?" (punch-list item 9; TQ-approved text, 2026-11-10, VERBATIM). Each paragraph is a list of runs; an emphasised run is italic.
	explainer: Object.freeze({
		openButtonLabel: 'What is a meaning?',
		closeButtonLabel: 'Close',
		titleText: 'What is a meaning?',
		paragraphList: Object.freeze([
			Object.freeze([{ text: 'A meaning is one complete idea that a data element can carry, such as "a staff member\'s identifier", recorded once in EDUcore with a permanent URI.' }]),
			Object.freeze([
				{ text: 'To say what a data element means, you point it at a reference standard (an ontology, such as CEDS). Often one pointer is enough: "First Name" points at First Name. Often it is not. A staff ID and a student ID both point at "Identifier". What separates them is the second pointer: one is the identifier ' },
				{ text: 'of a staff member', isEmphasis: true },
				{ text: ', the other the identifier ' },
				{ text: 'of a student', isEmphasis: true },
				{ text: '. The complete idea takes two ontology elements together, a class and a property.' },
			]),
			Object.freeze([
				{ text: 'If each data element simply kept two separate pointers, mapping would break down. A staff ID pointing at "Staff Member" and at "Identifier" looks, link by link, like any other element that touches either one, and nothing records that the two pointers belong together. There is no single place to look up "everything that means a staff member\'s identifier", and so nothing to translate through.' },
			]),
			Object.freeze([
				{ text: 'EDUcore solves this by giving the pair a node of its own: the meaning. In ontology terms the combination is reified, made into a thing that can be named and pointed at. The meaning points to the ontology elements that define it, and data elements from any standard point to the meaning.' },
			]),
			Object.freeze([
				{ text: "That is what makes a meaning useful for mapping. A SIF element, an Ed-Fi element and a PESC element that all point to the same meaning express the same idea, so the meaning translates between them. Your own database's columns can point to it in the same way." },
			]),
		]),
		// the diagram: illustrative, generic labels only (TQ's ruling 2026-11-10, after the CEDS check found no "Staff Member" class or "Identifier" property)
		diagramLabel: 'Diagram: a SIF element, an Ed-Fi element and a PESC element each point to one meaning, which points to an ontology class and an ontology property.',
		standardElementLabelList: Object.freeze(['SIF element', 'Ed-Fi element', 'PESC element']),
		meaningLabel: 'Meaning',
		ontologyElementLabelList: Object.freeze(['Ontology class', 'Ontology property']),
		captionText: 'Three standards, one meaning, two ontology elements (illustrative).',
	}),
});

// ================================================================================
// FAMILY COLOURS — a family not listed here is drawn in neutral grey under its own name, so a newly loaded
// standard still works (the page is general; the list of families comes from the graph, not from here)

export const familyStyleByName = Object.freeze({
	PESC: { color: '#072A6C', tint: '#E7ECF6', displayName: 'PESC' },
	SIF: { color: '#6B3FA0', tint: '#F1EBF8', displayName: 'SIF' },
	EdFi: { color: '#1E7A4C', tint: '#E6F4EC', displayName: 'Ed-Fi' },
	CEDS: { color: '#00797C', fill: '#00B5B8', tint: '#E0F6F6', displayName: 'CEDS' },
	// ⟪lane zbE, E2-5⟫ a hub needs `fill` (its anchors are drawn with it); crimson, clear of the four families and the four
	// match-kind colours. Chosen by the builder; the hue is TQ's to change.
	CTDL: { color: '#A3195B', fill: '#D6337F', tint: '#FBE8F1', displayName: 'CTDL' },
});

export const familyStyleOf = (standardFamily) =>
	familyStyleByName[standardFamily] || { color: '#4B5563', tint: '#F3F4F6', displayName: standardFamily || 'Unknown family' };

// ================================================================================
// MATCH KINDS — colour AND line style, never colour alone

// a description is the same for every hub, or is said OF the hub (hubComparisonText: '<hub> is narrower than the element').
// The direction is the forge judge's (educoreForge jevJudge.ini): broad = the hub concept covers everything the element
// covers, and more; narrow = it covers only part. Pinned by html/tests/standardsExplorer/matchDirectionWording.test.mjs
export const matchStyleByKind = Object.freeze({
	exact: { color: '#0B6B4E', lineStyle: 'solid', description: 'same meaning' },
	close: { color: '#1F5FBF', lineStyle: 'dashed', description: 'nearly the same' },
	broad: { color: '#B4530F', lineStyle: 'dotted', hubComparisonText: 'is broader than the element' },
	narrow: { color: '#7A3E9D', lineStyle: 'double', hubComparisonText: 'is narrower than the element' },
});

// ================================================================================
// HUBS — a hub is named by the data (the row's hubName); a row naming none says 'hub', never a stand-in hub's name

export const hubNameTextOf = (hubName) => hubName || 'hub';

export const matchDescriptionOf = (matchKind, hubName) => {
	const matchStyle = matchStyleByKind[matchKind];
	return matchStyle.hubComparisonText ? `${hubName || 'the hub'} ${matchStyle.hubComparisonText}` : matchStyle.description;
};

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
	standardGroup: 'Elements in one standard',
	support: 'Supporting item',
	useCase: 'Use case',
	// ⟪meaningsExplorer⟫ the meanings walk's top and its groups (its domains are a hub's own kind, below)
	meaningCatalog: 'All meanings',
	meaningHub: 'Hub',
	// ⟪meaningsPolish⟫ a meaning is an EDUcore construct, whichever hub defines it (punch-list item 1)
	meaning: meaningsVocabulary.meaningKindText,
	meaningOwnTerm: meaningsVocabulary.ownTermLegendKindText,
	unclassified: 'Unclassified',
	more: 'More, in the table',
});

// a hub's own kinds: '<hub> element', '<hub> property', '<hub> domain'
// ⟪meaningsExplorer⟫ and in the meanings walk, '<hub> domain' (⟪meaningsPolish⟫ a meaning is 'EDC meaning', above; the walk has no property level)
const hubKindNounByKind = Object.freeze({ hubAnchor: 'element', hubProperty: 'property', hubDomain: 'domain', meaningDomain: 'domain' });
const hubKindPluralNounByKind = Object.freeze({ hubAnchor: 'elements', hubProperty: 'properties', hubDomain: 'domains', meaningDomain: 'domains' });

export const kindDisplayNameOf = (nodeKind, hubName) => (hubKindNounByKind[nodeKind] ? `${hubNameTextOf(hubName)} ${hubKindNounByKind[nodeKind]}` : kindDisplayNameByKind[nodeKind] || nodeKind);

const pluralKindNameByKind = Object.freeze({
	family: 'standards families',
	class: 'classes',
	property: 'properties',
	standardGroup: 'standards',
	optionValue: 'codes',
	useCase: 'use cases',
	meaningHub: 'hubs',
	meaning: meaningsVocabulary.meaningKindPluralText,
});

export const pluralKindNameOf = (nodeKind, hubName) =>
	hubKindPluralNounByKind[nodeKind]
		? `${hubNameTextOf(hubName)} ${hubKindPluralNounByKind[nodeKind]}`
		: pluralKindNameByKind[nodeKind] || `${kindDisplayNameOf(nodeKind).replace(/^([A-Z])(?=[a-z])/, (initialLetter) => initialLetter.toLowerCase())}s`;

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
	HAS_USE_CASE: 'Use cases',
	MAPPED_FROM_STANDARD: 'Standards that map here',
	MAPPED_TO_ANCHOR: 'Mapped elements',
	// ⟪meaningsExplorer, meaningsPolish⟫ the meanings walk's groups, in its own vocabulary
	...meaningsVocabulary.relationshipDisplayNameByType,
});

// the relationships said OF a hub: the explorer's own mapping groups, and a hub anchor's context groups, whose types
// follow the graph contract's rule HAS_<HUB>_<SLOT> (toolPayloadContract hubEdgeTypeFor). The hub is the row's hubName.
const hubRelationshipTextOfByType = Object.freeze({
	MAPS_TO_HUB: (hubName) => `Maps to ${hubNameTextOf(hubName)}`,
	USED_BY_HUB_ELEMENT: (hubName) => `${hubNameTextOf(hubName)} elements`,
});
const HUB_CONTEXT_SLOT_NOUN_BY_SLOT_NAME = Object.freeze({ PROPERTY: 'property', DOMAIN: 'domain' });
const hubContextSlotNameOf = (relationshipType) => {
	const slotMatch = /^HAS_[A-Z0-9]+_([A-Z]+)$/.exec(relationshipType || '');
	return slotMatch && HUB_CONTEXT_SLOT_NOUN_BY_SLOT_NAME[slotMatch[1]] ? slotMatch[1] : null;
};

export const relationshipDisplayNameOf = (relationshipType, hubName) => {
	if (hubRelationshipTextOfByType[relationshipType]) return hubRelationshipTextOfByType[relationshipType](hubName);
	const hubContextSlotName = hubContextSlotNameOf(relationshipType);
	if (hubContextSlotName) return `${hubNameTextOf(hubName)} ${HUB_CONTEXT_SLOT_NOUN_BY_SLOT_NAME[hubContextSlotName]}`;
	return relationshipDisplayNameByType[relationshipType] || relationshipType;
};

// structural, quiet relationships drawn and listed after the main ones: these, and a hub anchor's context groups
const secondaryRelationshipTypeList = Object.freeze(['SUBCLASS_OF', 'REFERENCES_TYPE', 'REFERENCES', 'REFERENCES_OBJECT', 'HAS_DEFINITION', 'HAS_SUPPORT']);
export const isSecondaryRelationshipType = (relationshipType) => secondaryRelationshipTypeList.includes(relationshipType) || Boolean(hubContextSlotNameOf(relationshipType));

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
// ⟪meaningsExplorer review S6⟫ the standards walk's case of walkPathOf (below)
export const explorerPathOf = (pathStableIdList) => walkPathOf('standards', pathStableIdList);

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

// how much maps to a hub here, in words: a hub element counts its distinct elements, a hub property the judgments
// reaching it through its hub elements
export const hubMappedTextOf = (hubRow) => {
	if (hubRow.elementCount !== undefined) return hubRow.elementCount ? `${hubRow.elementCount} elements map here` : 'nothing maps here';
	if (hubRow.mappedElementCount === undefined) return '';
	return hubRow.mappedElementCount ? `${hubRow.mappedElementCount} mappings` : 'nothing maps here';
};

// ================================================================================
// ⟪meaningsPolish⟫ THE MEANINGS WALK'S WORDS — from the meaningsVocabulary block at the top of this file. Every count says what the next level shows (TQ's ruling on punch-list items 3
// and 4): a hub, its domains and the meanings they hold; a domain, its meanings, its own term apart, and how many are expressed in other standards.

// a template's {names} filled from valueByName; a name with no value is refused by name, never left blank
export const wordingOf = (templateText, valueByName) =>
	templateText.replace(/\{([A-Za-z]+)\}/g, (placeholderText, valueName) => {
		if (valueByName[valueName] === undefined || valueByName[valueName] === null) throw new Error(`explorerVocabulary: wording '${templateText}' needs a value for '${valueName}'`);
		return String(valueByName[valueName]);
	});

const countNumberFormat = new Intl.NumberFormat(meaningsVocabulary.numberLocaleName);
// a count the server did not send is refused by name, never printed as 'NaN' or read as 0
const countTextOf = (countValue) => {
	if (!Number.isFinite(countValue)) throw new Error(`explorerVocabulary: a meanings count must be a number (received ${JSON.stringify(countValue)})`);
	return countNumberFormat.format(countValue);
};
// "1 meaning", "2,777 meanings": a count noun is { one, other }
const countedNounTextOf = (countValue, nounEntry) => wordingOf(meaningsVocabulary.countedNounTemplate, { countText: countTextOf(countValue), nounText: countValue === 1 ? nounEntry.one : nounEntry.other });

const meaningCountTextReaderByKind = {
	meaningHub: (hubRow) =>
		wordingOf(meaningsVocabulary.hubHoldingTemplate, { domainCountText: countedNounTextOf(hubRow.domainCount, meaningsVocabulary.domainNoun), meaningCountText: countedNounTextOf(hubRow.meaningCount, meaningsVocabulary.meaningNoun) }),
	meaningDomain: (domainRow) => {
		const meaningCountText = countedNounTextOf(domainRow.meaningCount, meaningsVocabulary.meaningNoun);
		const holdingText = !domainRow.termMeaningCount
			? meaningCountText
			: domainRow.meaningCount
				? wordingOf(meaningsVocabulary.domainHoldingTemplate, { meaningCountText, ownTermText: meaningsVocabulary.domainOwnTermText })
				: meaningsVocabulary.domainOwnTermOnlyText;
		const expressedText = domainRow.mappedMeaningCount ? wordingOf(meaningsVocabulary.expressedTemplate, { countText: countTextOf(domainRow.mappedMeaningCount) }) : '';
		return [holdingText, expressedText].filter(Boolean).join(meaningsVocabulary.countPartDivider);
	},
};
// what a hub's or a domain's row holds, in words; any other row holds no meanings to count
export const meaningCountTextOf = (meaningGroupRow) => {
	const countTextReader = meaningCountTextReaderByKind[meaningGroupRow.kind];
	return countTextReader ? countTextReader(meaningGroupRow) : '';
};

// how many standard elements map to one meaning
export const meaningExpressionTextOf = (meaningRow) => {
	if (!meaningRow.elementCount) return meaningsVocabulary.meaningUnexpressedText;
	const elementCountText = countedNounTextOf(meaningRow.elementCount, meaningsVocabulary.elementNoun);
	return wordingOf(meaningRow.elementCount === 1 ? meaningsVocabulary.meaningExpressionOneTemplate : meaningsVocabulary.meaningExpressionTemplate, { elementCountText });
};
export const meaningElementCountTextOf = (elementCount) => countedNounTextOf(elementCount, meaningsVocabulary.elementNoun);

// ⟪rosettaReportLegible⟫ a meaning's tuple as its slots, in the server's order (hubCardTuple answers them in its rules' slot order): each slot named in words, its part
// as the server gave it, and its kind and its id in its hub's standard (hubCardTuple's nativeId: { <declared identifier name>: text }), as "property · CEDS id P000128";
// a slot with no id says only its kind. The Meanings panel (MeaningSection.vue) and the Rosetta report (rosettaReportBlocks.js) both draw it.
const tupleSlotHubIdTextOf = ({ slotPart, hubName }) => (slotPart.nativeId ? wordingOf(meaningsVocabulary.meaningSection.hubIdTemplate, { hubName, nativeIdText: Object.values(slotPart.nativeId)[0] }) : '');
export const meaningTupleSlotListOf = ({ tuple, hubName }) => {
	const sectionWords = meaningsVocabulary.meaningSection;
	return Object.entries(tuple || {}).map(([slotName, slotPart]) => ({
		slotName,
		slotLabel: sectionWords.slotLabelByName[slotName] || slotName,
		...slotPart,
		detailText: [sectionWords.partKindLabelByKind[slotPart.kind] || slotPart.kind, tupleSlotHubIdTextOf({ slotPart, hubName })].filter(Boolean).join(sectionWords.partDivider),
	}));
};

// what one meaning row is about: the domain's own term says so (⟪review S5⟫ known by the group the server listed it in, never by re-deriving the server's
// tier rule); a property meaning says its range and qualifiers (its tier is the level's, so it is not repeated)
export const OWN_TERM_RELATIONSHIP_TYPE = 'HAS_TERM_MEANING';
export const meaningInfoTextOf = (meaningRow) => {
	if (meaningRow.relationshipType === OWN_TERM_RELATIONSHIP_TYPE) return meaningsVocabulary.domainOwnTermRowText;
	return [
		meaningRow.rangeName ? wordingOf(meaningsVocabulary.rangeTemplate, { rangeName: meaningRow.rangeName }) : '',
		(meaningRow.qualifierNameList || []).length ? wordingOf(meaningsVocabulary.qualifierTemplate, { qualifierNameText: meaningRow.qualifierNameList.join(meaningsVocabulary.qualifierNameDivider) }) : '',
	]
		.filter(Boolean)
		.join(meaningsVocabulary.countPartDivider);
};

// a meaning's line under its bubble: what it is about, then how many elements express it
export const meaningRowSubTextOf = (meaningRow) => [meaningInfoTextOf(meaningRow), meaningExpressionTextOf(meaningRow)].filter(Boolean).join(meaningsVocabulary.countPartDivider);

// the detail panel's facts for a hub (its domains and its meanings) and for a domain (its row's count text)
const meaningFactListReaderByKind = {
	meaningHub: (hubRow) => [
		{ factName: meaningsVocabulary.domainsFactName, factText: countTextOf(hubRow.domainCount) },
		{ factName: meaningsVocabulary.meaningsFactName, factText: countTextOf(hubRow.meaningCount) },
	],
	meaningDomain: (domainRow) => [
		{ factName: meaningsVocabulary.meaningsFactName, factText: meaningCountTextOf(domainRow) },
		// ⟪review S4⟫ its id in its hub's standard, as the server read it (nativeId: { <declared identifier name>: text })
		...(domainRow.nativeId ? [{ factName: wordingOf(meaningsVocabulary.hubIdFactNameTemplate, { hubName: domainRow.hubName }), factText: Object.values(domainRow.nativeId)[0] }] : []),
	],
};
export const meaningFactListOf = (meaningGroupNode) => {
	const factListReader = meaningFactListReaderByKind[meaningGroupNode.kind];
	return factListReader && meaningGroupNode.meaningCount !== undefined ? factListReader(meaningGroupNode) : [];
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

// the route the explorer lives at, and a link to one walk on it: every drill, crumb and Open is a real link with an href
// built here, so it can be followed, opened in a new tab, shared, or read by an AI agent without clicking
export const EXPLORER_ROUTE_PATH = '/explore/standards';
// ⟪meaningsExplorer review S6⟫ the standards walk's case of walkLinkOf (below)
export const explorerLinkOf = (pathStableIdList) => walkLinkOf('standards', pathStableIdList);

// ================================================================================
// ⟪meaningsExplorer, WORKORDER-meaningsExplorer-111026⟫ THE WALKS — the Explorer's views walk more than one graph from one set of components. Each walk
// is a profile here, chosen by the page (WalkView's walkProfileName) and held by the store; a component asks the store for a link (store.walkLinkOf) and
// never names a route itself. The Standards Explorer is the 'standards' profile, exactly as it was; the Meanings explorer is 'meanings'.
//   rootStableId          the synthetic id every path begins with (prepended when a path lacks it)
//   offersSchemaViewer    the Schema Viewer view, for a walk inside one standard
//   showsStandardSections the detail panel's sections about a standard: its catalog card, its version tiles, its companion pages and downloads
//   legendNodeKindList    the legend's bubbles, drawn once per hub the page names; null: the Standards Explorer's own legend (Legend.vue)
//   legendSharedNodeKindList ⟪review N2⟫ legend bubbles drawn once, not once per hub (the meanings walk's meaning and own-term chips)
//   showsRefusalsByName   ⟪review S3⟫ a step the server refuses (HTTP 4xx) shows the server's words as a refusal, not as a failure to answer
//   countTextWraps        ⟪meaningsPolish⟫ the table's Count column wraps (the meanings walk's counts are phrases, not numbers)
//   citesUriAsLink        ⟪meaningsPolish⟫ the Cite as line's URI is itself the link to its page, with no second "Open its page" link beside the panel's
//                         Open (punch-list item 2: one Open link, the one that names its target)

export const MEANING_CATALOG_STABLE_ID = 'meanings:all';
export const MEANINGS_ROUTE_PATH = '/explore/meanings';

export const walkProfileByName = Object.freeze({
	standards: Object.freeze({
		walkProfileName: 'standards',
		routePath: EXPLORER_ROUTE_PATH,
		rootStableId: FAMILY_CATALOG_STABLE_ID,
		titleText: 'Standards Explorer',
		introText: 'Pick a standard, then walk it: click a bubble or a row to see what it is; double-click, or use Open, to go inside it.',
		rootLevelText: 'every standards family',
		metaDescriptionText: 'Walk the education data standards in the EDUcore graph: each family, its classes and properties, the hub elements they map to, and every other standard that maps there.',
		offersSchemaViewer: true,
		showsStandardSections: true,
		legendNodeKindList: null,
		citesUriAsLink: false,
		countTextWraps: false,
		legendSharedNodeKindList: null,
		showsRefusalsByName: false,
	}),
	// ⟪meaningsPolish⟫ its words are meaningsVocabulary's; its walk is hub → domain → meaning (no property level)
	meanings: Object.freeze({
		walkProfileName: 'meanings',
		routePath: MEANINGS_ROUTE_PATH,
		rootStableId: MEANING_CATALOG_STABLE_ID,
		titleText: meaningsVocabulary.titleText,
		introText: meaningsVocabulary.introText,
		rootLevelText: meaningsVocabulary.rootLevelText,
		metaDescriptionText: meaningsVocabulary.metaDescriptionText,
		offersSchemaViewer: false,
		showsStandardSections: false,
		legendNodeKindList: Object.freeze(['meaningHub', 'meaningDomain']),
		legendSharedNodeKindList: Object.freeze(['meaning', 'meaningOwnTerm']),
		citesUriAsLink: true,
		countTextWraps: true,
		showsRefusalsByName: true,
	}),
});

// a walk profile by name; a name not listed is refused, never quietly read as another walk
export const walkProfileOf = (walkProfileName) => {
	const walkProfile = walkProfileByName[walkProfileName];
	if (!walkProfile) throw new Error(`explorerVocabulary: '${walkProfileName}' is not a walk profile (${Object.keys(walkProfileByName).join(', ')})`);
	return walkProfile;
};

// a link to one point of a walk, and a path that begins at the walk's root (explorerLinkOf and explorerPathOf are the standards walk's)
export const walkLinkOf = (walkProfileName, pathStableIdList) => ({ path: walkProfileOf(walkProfileName).routePath, query: { path: pathTextOf(pathStableIdList) } });
export const walkPathOf = (walkProfileName, pathStableIdList) => {
	const rootStableId = walkProfileOf(walkProfileName).rootStableId;
	return pathStableIdList[0] === rootStableId ? pathStableIdList : [rootStableId, ...pathStableIdList];
};

// a meaning as the Meanings explorer opens it from elsewhere (the Standards Explorer, a /edc meaning page): the catalog, then the meaning itself
export const MEANING_ID_PREFIX = 'meaning:';
export const meaningsLinkOf = (cardStableId) => walkLinkOf('meanings', [MEANING_CATALOG_STABLE_ID, `${MEANING_ID_PREFIX}${cardStableId}`]);

// (an element's path in the Standards Explorer is made by the server, from the walk's own rules: an "Expressed in" element's standardsWalkPathStableIdList)

// the site's own page for an EDUcore URI: the /edc resolver answers https://w3id.org/EDUcore/<rest> at /edc/<rest> (edc-resolve.js); another IRI has none
export const EDC_BASE_IRI = 'https://w3id.org/EDUcore/';
export const edcPagePathOf = (edcUri) => (typeof edcUri === 'string' && edcUri.startsWith(EDC_BASE_IRI) ? `/edc/${edcUri.slice(EDC_BASE_IRI.length)}` : '');

export const pathStableIdListOf = (pathText) =>
	typeof pathText === 'string' && pathText !== ''
		? pathText.split(',').filter((onePart) => onePart !== '').map((onePart) => onePart.replace(/%2C/g, ',').replace(/%25/g, '%'))
		: [];
