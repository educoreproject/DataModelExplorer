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
// by wordingOf, which refuses a missing name. A count noun is { one, other }. ⟪meaningsClarity⟫ It imports one module, sharedWording.js beside it (the one wording
// function and meaning-title lookup the server shares); the tests that import this module from a temporary copy copy that module beside it.

import { wordingOf, meaningTitleTextOf, meaningSubtitleTextOf } from './sharedWording.js';
import { pathTextOf, MEANINGS_ROUTE_PATH } from './sharedWalkPath.js';

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

// ⟪meaningsClarity, TQ 2026-11-11: "Clear the filter. Can it be restored when someone goes back? That would be ideal."⟫ THE LEVEL FILTER, shared by both walks. A
// filter belongs to the level it was typed on: it rides in that level's URL (walkFilterQueryName), so a drill, a crumb or an Open (a new URL with no filter) clears it,
// and Back or Forward, or a shared link, brings that level's own text back. While it dims or hides anything the page says so (FilterNotice.vue), in these words.
export const walkFilterVocabulary = Object.freeze({
	walkFilterQueryName: 'filter',
	noticeTemplate: "Filtered by '{filterText}'",
	// the diagram fades what does not match; the table and the item list under the diagram leave it out
	unmatchedTemplateByViewMode: Object.freeze({ diagram: '{unmatchedCountText} dimmed', table: '{unmatchedCountText} hidden' }),
	noticeDivider: ' · ',
	clearText: 'Clear',
	clearLabelText: 'Clear the filter',
});

// ⟪explorerTidy review N6⟫ words more than one component says, written once
export const explorerCommonWords = Object.freeze({
	homeChipText: 'You started here',
	retryText: 'Try again',
	notMappedToHubText: 'Not mapped to a hub.',
});

// ⟪explorerTidy, TQ's standing rule NO MAGIC STRINGS⟫ THE LEVEL'S TABLE (Table.vue), shared by both walks: its column titles, its row controls, and what an empty level
// says. With no filter, an empty level says plainly that nothing is beneath it; with a filter that hides every row, it says so, beside the filter's Clear.
export const walkTableVocabulary = Object.freeze({
	columnTitleByName: Object.freeze({ displayName: 'Name', kind: 'Kind', infoText: 'Detail', countValue: 'Count', confidenceValue: 'Match · confidence', openAction: '' }),
	comparedVersionColumnTemplate: 'vs {comparedVersion}',
	openText: 'Open ›',
	openColumnLabelText: 'Open',
	openLabelTemplate: 'Open {itemName}',
	selectLabelTemplate: 'Select {itemName} ({kindName}) to see its details',
	notMappedText: 'not mapped',
});
// ⟪explorerTidy⟫ an empty level, said the same way by the table and the diagram (a diagram dims what a filter does not match, so only the table empties by filter)
export const walkEmptyLevelVocabulary = Object.freeze({
	emptyLevelText: 'Nothing is beneath this.',
	emptyFilteredTemplate: "Nothing on this level matches '{filterText}'.",
});
// ⟪review N4⟫ which of the two an empty view says: the filter's, only when the level has rows and a filter hid them all
export const emptyLevelOf = ({ levelRowCount, filterText }) => {
	const trimmedFilterText = String(filterText || '').trim();
	return levelRowCount > 0 && trimmedFilterText
		? { isEmptiedByFilter: true, emptyText: wordingOf(walkEmptyLevelVocabulary.emptyFilteredTemplate, { filterText: trimmedFilterText }) }
		: { isEmptiedByFilter: false, emptyText: walkEmptyLevelVocabulary.emptyLevelText };
};

// ⟪explorerTidy, TQ's standing rule NO MAGIC STRINGS⟫ THE EXPLORER COMPONENTS' OWN WORDS, one block per component (both walks), so no word is typed in a template.
// A {name} is filled by wordingOf, which refuses a missing name.
export const explorerComponentWords = Object.freeze({
	breadcrumb: Object.freeze({ navLabelText: 'Breadcrumb', foldLabelTemplate: '{titleText} (hidden steps of the walk)' }),
	companionPages: Object.freeze({ headText: 'Companion pages', unreadTemplate: 'The companion pages could not be read: {statusMsg}', audienceTemplate: 'For {audienceText}' }),
	crossingBanner: Object.freeze({
		crossedTemplate: 'You have crossed into {crossedName}',
		throughTemplate: 'through the {anchorKindName} {anchorName}. Everything below is {crossedName}, not {homeName}.',
		backTemplate: 'Back to {homeName}',
	}),
	downloadEntry: Object.freeze({ facetLabelByName: Object.freeze({ source: 'Source', graph: 'From the graph (experimental)' }), unavailableTemplate: '{facetLabel} not available: {unavailableReason}' }),
	sourceUrlNote: Object.freeze({ notRecordedText: 'Where this source was obtained is not recorded.', linkedFromText: '(linked from', linkedFromCloseText: ')' }),
	levelItemList: Object.freeze({
		navLabelText: 'Items on this level',
		headText: 'On this level',
		selectLabelTemplate: 'Select {itemName} ({kindText})',
		selectLabelWithDetailTemplate: 'Select {itemName} ({kindText}): {detailText}',
		openLabelTemplate: 'Open {itemName}',
	}),
	toolbar: Object.freeze({ diagramText: 'Diagram', tableText: 'Table', schemaText: 'Schema Viewer', filterLabelText: 'Filter', filterPlaceholderText: 'Type a name', hideLegendText: 'Hide legend', showLegendText: 'Show legend' }),
	diagram: Object.freeze({
		sampleNoteTemplate: 'Showing {drawnCount} of {levelCount}. The dashed bubble opens the full list in the table.',
		canvasLabelTemplate: 'Bubble diagram of {drawnCount} of the {levelCount} items in {focusName}. The same items are listed after the diagram as buttons and links, and as rows in the Table view.',
		noFocusNameText: 'this level',
	}),
	matchSummary: Object.freeze({ confidenceLabelTemplate: 'confidence {confidenceText}' }),
	// ⟪review S3⟫ what a row says about itself, under its bubble (Diagram.vue), in its table cells (Table.vue) and in the item list (LevelItemList.vue)
	rowWords: Object.freeze({
		classCountTemplate: '{classCount} classes',
		mappedOfTemplate: '{mappedCount} of {propertyCount} mapped',
		mappedToOfTemplate: '{mappedCount} of {propertyCount} mapped to',
		noPropertiesText: 'no properties',
		versionListTemplate: 'versions {versionListText}',
		versionListDivider: ', ',
		versionCountTemplate: '{versionCount} versions',
		elementCountTemplate: '{elementCount} elements',
		fromOccurrencesTemplate: 'from {occurrenceCount} occurrences',
		inDomainTemplate: 'in {domainName}',
		notMappedText: 'not mapped',
		versionTemplate: 'version {version}',
		mapsToTemplate: 'maps to {anchorName} ({matchKind})',
		partDivider: ' · ',
	}),
	levelSummary: Object.freeze({
		nothingBeneathText: 'nothing beneath this',
		againstTemplate: ' · against {comparedVersion}: {badgeCountText}',
		badgeCountTemplate: '{itemCount} {badgeState}',
		truncatedTemplate: ' · showing the first {shownCountText} of {countText}',
		countDivider: ' / ',
		listDivider: ', ',
	}),
	walkLevelLabel: Object.freeze({
		schemaTemplate: 'Explorer: the schema of {kindText}, in the Schema Viewer',
		levelTemplate: 'Explorer: {itemCount} items in {kindText}, shown as a {viewModeName}',
		copyFailedTemplate: 'could not copy the link: {errorText}',
	}),
	versionBadge: Object.freeze({ comparedTitleTemplate: 'compared with {comparedVersion}' }),
	downloadsSection: Object.freeze({
		headText: 'Downloads',
		catalogNoteText: 'The source of every standard, and each written back out of this graph (experimental).',
		allDownloadsText: 'All downloads ›',
		loadingText: 'Looking for downloads…',
		unreadTemplate: 'The downloads could not be read: {statusMsg}',
		noneText: 'No downloads for this standard in this graph.',
		familyLinkTemplate: '{familyLinkText} ›',
		familyAllTemplate: 'All downloads for {familyName}',
	}),
	versionTile: Object.freeze({
		inVersionTemplate: 'In {version}',
		notInVersionTemplate: 'Not in {version}.',
		onOccurrencesTemplate: 'on {occurrenceCount} occurrences',
		moreTemplate: '{hiddenCount} more',
		lessText: 'less',
		openInVersionTemplate: 'Open in {version} ›',
		onceText: 'once',
		timesTemplate: '{occurrenceCount} times',
		sameDefinitionTemplate: 'Defined the same way. It occurs {thisTimesText} in {thisVersion} and {otherTimesText} in {otherVersion}; occurrence counts are not compared.',
		noValueText: 'none',
		fieldValuesTemplate: '{thisValueText} in {thisVersion}, {otherValueText} in {otherVersion}',
		fieldDiffersTemplate: 'Its {fieldLabel} differs',
		membersOnlyInTemplate: '{memberNoun} only in {version}',
		membersDifferTemplate: '{memberNoun} defined differently',
		typeDiffersTemplate: 'Its type {typeName} is defined differently in {version}',
		typeAbsentTemplate: 'Its type {typeName} is not in {version}',
		otherDifferenceText: 'Its definition differs in a part this page does not show',
	}),
	walkView: Object.freeze({
		shareLabelText: 'Link to this view:',
		copyLinkText: 'Copy link',
		largeLevelTemplate: '{itemCount} items is too many to draw at once, so this level opened as a table.',
		showDiagramText: 'Show diagram',
	}),
	schemaView: Object.freeze({
		sectionLabelTemplate: 'Schema Viewer: {familyName}',
		introLeadText: 'The schema of',
		introTailText: "element by element, with each element's mappings to the other standards. Switch back to Diagram or Table to keep walking.",
		introDivider: ', ',
		unmatchedTemplate: 'The Specification Viewer lists no schema named {standardFamily}. Pick one below.',
	}),
	legend: Object.freeze({
		navigateNoteText: 'Cmd-Click to Navigate',
		bubblesHeadText: 'Bubbles',
		notMappedAsideText: '(not mapped)',
		matchHeadTemplate: 'Match to {hubText}',
		anyHubText: 'a hub',
		confidenceHeadText: 'Confidence',
		confidenceAsideText: 'Thicker and darker means surer. Every mapping is a judgment, not a fact.',
		marksHeadText: 'Marks',
		moreInsideText: 'Has more inside',
		ringTemplate: 'Ring: share mapped to {hubText}',
		versionBadgeAsideText: 'against the other version',
	}),
	specificationCard: Object.freeze({
		burdenTemplate: '{burdenText} burden',
		ownerDivider: ' — ',
		versionPrefixText: 'v',
		governanceTemplate: ' · Governance: {governanceBody}',
		updatedTemplate: ' · Updated {lastUpdated}',
		detailsHeadText: 'Implementation Details',
		burdenRubricHeadText: 'Burden Rubric',
		requiredCapabilitiesHeadText: 'Required Capabilities',
		guidanceHeadText: 'Guidance',
		pairedWithHeadText: 'Commonly Paired With',
		adoptersHeadText: 'Known Adopters',
		privacyHeadText: 'Privacy Considerations',
		equityHeadText: 'Equity Considerations',
		samplePayloadsHeadText: 'Sample Payloads',
		documentationHeadText: 'Documentation',
		exploreText: 'Explore in the Standards Explorer',
		exploreLabelTemplate: 'Explore {specTitle} in the Standards Explorer',
		downloadsText: 'Downloads',
		downloadsLabelTemplate: 'Downloads for {specTitle}',
	}),
	publicationsSection: Object.freeze({
		titleText: 'Mapping sets and hub cards',
		introText: "The mappings in this graph, as SSSOM mapping sets: one set per mapping-layer version, each with its layer's registry and a JSON-LD context per standard; and every hub's cards (its meanings), one file per hub release. Mapping is not distribution: the sets name every standard's elements, including standards whose own files are held above.",
		manifestText: 'Manifest',
		publishedTemplate: '· published {generatedAt}',
		siteRegistryTemplate: 'Site registry ({sizeText})',
		mappingSetsHeadText: 'Mapping sets',
		mappingSetColumnTitleList: Object.freeze(['Layer', 'Version', 'Status', 'Set', 'Contexts']),
		registryText: 'registry',
		sssomTemplate: 'SSSOM ({sizeText})',
		hubCardsHeadText: 'Hub cards',
		hubCardColumnTitleList: Object.freeze(['Hub', 'Release', 'Cards', 'Download']),
		cardFileTemplate: '{formatText} ({sizeText})',
		cardFormatTextByKind: Object.freeze({ hubCardsCsv: 'CSV' }),
		cardFormatOtherText: 'JSON-LD',
	}),
	detailPanel: Object.freeze({
		panelLabelTemplate: 'Details: {itemName}',
		focusRoleText: 'Focus',
		selectedRoleText: 'Selected',
		mapsToTemplate: 'Maps to {hubText}',
		onOccurrencesTemplate: 'on {occurrenceCount} occurrences',
		matchMixHeadText: 'How these elements match',
		matchMixCountTemplate: '{elementCount} elements',
		matchMixNoteText: 'Each element carries its own confidence. Open this group to see them.',
		openTemplate: 'Open {itemName} ›',
		openInMeaningsText: 'Open in Meanings ›',
		useCaseStepsText: 'Steps and citations ›',
		leafText: 'Nothing beneath this one. This is the end of the line.',
		focusNoteText: 'You are here. Click anything on this level for its details.',
		specHeadText: 'About this specification',
		catalogHeadText: 'Specification catalog',
		catalogNoteText: 'Select a family for its catalog card: owner, governance, burden, access and implementation details.',
		notInGraphText: 'In the catalog, not yet walkable in the graph:',
		versionsLabelText: 'Other versions',
		versionsHeadText: 'In other versions',
		versionsLoadingText: 'Looking in the other versions…',
		versionsUnreadTemplate: 'The other versions could not be read: {statusMsg}',
		// ⟪review S3⟫ the facts list (factList): each fact's name, and the words of the facts that are phrases
		factNameByName: Object.freeze({ standard: 'Standard', inside: 'Inside', path: 'Path', propertyOf: 'Property of', holds: 'Holds', properties: 'Properties', occurrences: 'Occurrences', elements: 'Elements', occurrencesShown: 'Occurrences shown' }),
		holdsTemplate: '{familyHoldingText}, {classCount} classes',
		propertiesTemplate: '{propertyCount}, {mappedPropertyCount} {mappedWords}',
		propertiesMappedWordsByKind: Object.freeze({ hubDomain: 'mapped to by a standard' }),
		propertiesMappedOtherWords: 'mapped to a hub',
		hubElementsTemplate: '{hubElementCount}; {hubMappedText}',
		tierFactTemplate: '{hubText} tier',
		occurrencesFoldedText: 'folded: they all map the same way',
		occurrencesUnfoldedText: 'yes: they map differently',
	}),
	stateNotice: Object.freeze({
		loadingText: 'Loading this level…',
		failedTitleText: 'The standards graph did not answer',
		failedGuideText: 'Nothing is wrong with what you clicked. The server could not answer this request. Try again, or go back with the breadcrumb.',
	}),
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
		'A meaning is one idea the standards can express. It is built from one or more terms in an ontology (e.g., CEDS or CTDL), and elements of other standards map to it as a common point. Each meaning has a permanent URI. Sometimes a meaning is a single element of a standard; often it is a tuple, such as a property within a particular CEDS domain. Pick a hub, then a domain; open a meaning to see what it names and every standard element that expresses it.',
	rootLevelText: 'every group of meanings',
	metaDescriptionText: 'Walk the meanings in the EDUcore graph: each hub, its domains, the meanings they name, and every standard element mapped to each meaning.',

	// ---- kinds: a meaning is an EDUcore construct, whatever hub defines it (punch-list item 1)
	meaningKindText: 'EDC meaning',
	meaningKindPluralText: 'EDC meanings',

	// TQ 2026-11-12: the table's button and the breadcrumb name what the next level shows: a hub lists its domains, a domain its meanings, a meaning its values
	openTextByFocusKind: Object.freeze({ meaningHub: 'Show Meanings', meaningDomain: 'Show Values' }),
	openLabelTemplateByFocusKind: Object.freeze({ meaningHub: 'Show the meanings of {itemName}', meaningDomain: 'Show the values of {itemName}' }),
	// TQ 2026-11-12: the meanings tables count two things in two columns: what a row contains (meanings, values) and the mappings to it
	containsColumnTitle: 'Contains',
	mappingColumnTitle: 'Mappings',
	crumbTemplateByKind: Object.freeze({ meaningHub: '{crumbName} Domains', meaningDomain: '{crumbName} Meanings', meaning: '{crumbName} Values' }),
	// ---- counts (punch-list items 3, 4, 5, 7): each says what the next level shows
	domainNoun: Object.freeze({ one: 'domain', other: 'domains' }),
	meaningNoun: Object.freeze({ one: 'meaning', other: 'meanings' }),
	elementNoun: Object.freeze({ one: 'element', other: 'elements' }),
	countedNounTemplate: '{countText} {nounText}',
	countPartDivider: ' · ',
	hubHoldingTemplate: '{domainCountText} · {meaningCountText}',
	// ⟪meaningsClarity⟫ a property meaning that holds value meanings says so ("48 values inside"); one whose values are mapped though it is not says that too
	valueNoun: Object.freeze({ one: 'value', other: 'values' }),
	valuesInsideTemplate: '{valueCountText} inside',
	meaningUnexpressedWithValuesTemplate: 'nothing maps here directly; {elementCountText} map to its values',
	meaningUnexpressedWithValuesOneTemplate: 'nothing maps here directly; {elementCountText} maps to its values',
	// ⟪meaningsClarity⟫ an incoming meaning's line: its own domain, and the slot it names this domain in
	incomingDomainTemplate: 'in {domainName}',
	incomingSlotTemplate: 'names this as its {slotText}',
	incomingSlotWordDivider: ' and ',
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
		// ⟪meaningsClarity⟫
		HAS_INCOMING_MEANING: 'Meanings of other domains that name this one',
	}),

	// ---- ⟪meaningsClarity Addendum B, TQ 2026-11-11: "yes, definitely"⟫ WHAT THE DIAGRAM SHOWS, in a few sentences built from the level's own counts (levelProseOf).
	// One template set per view; a sentence whose subject is absent at this level is not said. Numbers are written as digits, the ones the diagram's labels and the
	// table's counts show. ⟪explorerTidy, TQ 2026-11-11: "Yours is too long and too much detail"⟫ one short sentence per fact: no other domain is named, no property
	// with values is listed, and a domain is never "this domain as its range" (domain is a role a class plays in a tuple, not what the class is). A count's sentence
	// has a one form and an other form ({ one, other }).
	levelProse: Object.freeze({
		// ⟪supervisor's ruling 4⟫ one template set per view: a level shown as a table is described as the table, never as a diagram that is not on screen
		templateSetByViewMode: Object.freeze({
			diagram: Object.freeze({
				catalogTemplate: 'Each circle is a hub, a reference standard whose meanings EDUcore names. Together they hold {meaningCount} meanings.',
				hubTemplate: 'Each square is one of the {domainCount} domains of {hubName}. Together they hold {meaningCount} meanings.',
				domainMeaningsTemplate: Object.freeze({ one: 'This domain contributes to 1 meaning (solid hexagon).', other: 'This domain contributes to {meaningCount} meanings (solid hexagons).' }),
				domainMappedTemplate: Object.freeze({ one: '1 meaning has elements of other standards mapped to it (marked "{expressedSampleText}").', other: '{mappedMeaningCount} meanings have elements of other standards mapped to them (marked "{expressedSampleText}").' }),
				domainOwnTermOnlyText: 'It holds only its own term (dashed hexagon).',
				domainIncomingTemplate: Object.freeze({ one: '1 meaning in another domain names it as its {slotText} (outlined hexagon, dashed arrow).', other: '{incomingMeaningCount} meanings in other domains name it as their {slotText} (outlined hexagons, dashed arrow).' }),
				domainValuesText: 'A › means the meaning holds values; open it to see them.',
				valuesTemplate: Object.freeze({ one: 'This meaning holds 1 value (hexagon), one code.', other: 'This meaning holds {valueCount} values (hexagons), one code each.' }),
				valuesMappedTemplate: Object.freeze({ one: '1 value has elements of other standards mapped to it.', other: '{mappedValueCount} values have elements of other standards mapped to them.' }),
				meaningNoValuesText: 'This meaning holds no values. Its panel says what it names and every element that expresses it.',
				filterTemplate: "The filter '{filterText}' dims {unmatchedCount} of them.",
			}),
			table: Object.freeze({
				catalogTemplate: 'Each row of the table is a hub, a reference standard whose meanings EDUcore names. Together they hold {meaningCount} meanings.',
				hubTemplate: 'Each row of the table is one of the {domainCount} domains of {hubName}. Together they hold {meaningCount} meanings.',
				domainMeaningsTemplate: Object.freeze({ one: 'The table lists the 1 meaning this domain contributes to.', other: 'The table lists the {meaningCount} meanings this domain contributes to.' }),
				domainMappedTemplate: Object.freeze({ one: '1 meaning has elements of other standards mapped to it.', other: '{mappedMeaningCount} meanings have elements of other standards mapped to them.' }),
				domainOwnTermOnlyText: 'It holds only its own term.',
				domainIncomingTemplate: Object.freeze({ one: '1 meaning in another domain names it as its {slotText}.', other: '{incomingMeaningCount} meanings in other domains name it as their {slotText}.' }),
				domainValuesText: 'A meaning with a Show Values button holds values; press it to see them.',
				valuesTemplate: Object.freeze({ one: 'The table lists the 1 value this meaning holds, one code.', other: 'The table lists the {valueCount} values this meaning holds, one code each.' }),
				valuesMappedTemplate: Object.freeze({ one: '1 value has elements of other standards mapped to it.', other: '{mappedValueCount} values have elements of other standards mapped to them.' }),
				meaningNoValuesText: 'This meaning holds no values. Its panel says what it names and every element that expresses it.',
				filterTemplate: "The filter '{filterText}' hides {unmatchedCount} of them.",
			}),
		}),
	}),

	// ---- ⟪meaningsClarity, TQ 2026-11-11: "Add those (a diagram key)"⟫ the Meanings diagram's key (Legend.vue), one entry per mark the diagram draws. markName picks
	// the swatch Legend.vue draws for it; the words are these.
	diagramKey: Object.freeze({
		headText: 'Key',
		entryList: Object.freeze([
			Object.freeze({ markName: 'domainSquare', entryText: 'a domain (square)' }),
			Object.freeze({ markName: 'meaningHexagon', entryText: 'a meaning (solid hexagon)' }),
			Object.freeze({ markName: 'ownTermHexagon', entryText: "the domain's own term (dashed hexagon)" }),
			Object.freeze({ markName: 'incomingMeaning', entryText: 'a meaning of another domain that names this one (outlined hexagon, dashed arrow)' }),
			Object.freeze({ markName: 'moreInside', entryText: 'more inside: open it' }),
			Object.freeze({ markName: 'expressedCount', entryText: 'elements of other standards mapped to it', sampleText: 'N elements map here' }),
			Object.freeze({ markName: 'dimmed', entryText: 'filtered out by the filter box' }),
		]),
	}),

	// ---- one meaning's panel (MeaningSection.vue)
	meaningSection: Object.freeze({
		sectionLabel: 'What this meaning is',
		tierFactName: 'Tier',
		// ⟪meaningsClarity⟫ a property meaning's values, and an incoming meaning's tie to the domain on screen
		valuesFactName: 'Values',
		incomingFactName: 'Here because it',
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
		// ⟪explorerTidy⟫ a selected meaning that opens to nothing reads its own facts into the panel
		leafLoadingText: 'Reading what this meaning names…',
		leafFailedText: 'What this meaning names could not be read just now. Its URI page, above, has it.',
		tupleHeadText: 'What it names',
		// ⟪explorerTidy, Q97⟫ why a meaning has no citable tuple or no range list, in words, on the panel, the /edc meaning page (humanPage.js) and the Rosetta report. The
		// names are the server's (hubCardTuple TUPLE_ABSENT_NAME_LIST, meaningRangeList RANGE_LIST_ABSENT_NAME_LIST) and never shown; a name with no words is refused
		// by name (absentReasonTextOf), and a test holds every declared name to having words.
		tupleAbsentTemplate: 'No citable tuple. {reasonText}',
		rangeListAbsentTemplate: 'No range list. {reasonText}',
		absentReasonTextByName: Object.freeze({
			hubCardNotFound: 'The live graph does not hold this card.',
			cardNotInLiveGraph: 'The live graph does not hold this card.',
			hubSlotProfileUnreadable: "Its hub's list of slots could not be read.",
			hubCardHasNoSlot: 'The card names no element in any slot.',
			hubCardSlotAmbiguous: 'A slot of the card names more than one element.',
			hubElementKindUnknown: 'An element it names is of a kind this site does not know.',
			hubCardTupleUnreadable: 'Its tuple could not be read just now.',
			judgedBeforeTupleRecorded: 'It was judged before tuples were recorded.',
			cardHasNoRange: 'This meaning names no range.',
			rangeListUnreadable: 'Its ranges could not be read just now.',
			noLiveGraph: 'This page was made without the live graph.',
			// ⟪review S4⟫ why an /edc page could not read the live graph (humanPageFacts FACTS_ABSENT_NAME_LIST); noLiveGraph and cardNotInLiveGraph are above
			storeUnreadable: 'The published releases could not be read just now.',
			elementNotInLiveGraph: 'The live graph does not hold this element.',
			graphHoldsAnotherRelease: 'The live graph holds another release of this standard.',
			factsUnreadable: 'The live graph could not be read just now.',
		}),
		// ⟪review S4⟫ why a part has no URI, by the minter's reasons (uriMinter); any other reason (eg one that could not be minted, with its error) is said plainly by
		// uriAbsentOtherText, its words kept for programs in the API and in a data attribute
		uriAbsentTextByReason: Object.freeze({ notInManifestStore: 'not in a published EDUcore release yet', standardNotInManifest: 'its standard is not in a published EDUcore release' }),
		uriAbsentOtherText: 'its URI could not be made',
		factsAbsentTemplate: 'The live graph was not read for this page. {reasonText}',
		tupleNotReadTemplate: '[tuple not read: {reasonText}]',
		// ⟪review N7⟫ a mapping's relation in words, by its SKOS match edge (humanPageRules.matchEdgeTypeList; a test holds every one to having words)
		relationTextByEdgeType: Object.freeze({ EXACT_MATCH: 'exact match', CLOSE_MATCH: 'close match', BROAD_MATCH: 'broad match', NARROW_MATCH: 'narrow match' }),
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
		// ⟪review S4⟫ a reason the words do not name is said plainly, never by the server's name for it
		pathAbsentOtherText: 'the walk does not reach it',
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
// ⟪meaningsClarity, ruling 3⟫ it lives in the one shared wording module (sharedWording.js), which the server loads too; it is re-exported here as it always was
export { wordingOf };

const countNumberFormat = new Intl.NumberFormat(meaningsVocabulary.numberLocaleName);
// a count the server did not send is refused by name, never printed as 'NaN' or read as 0
const countTextOf = (countValue) => {
	if (!Number.isFinite(countValue)) throw new Error(`explorerVocabulary: a meanings count must be a number (received ${JSON.stringify(countValue)})`);
	return countNumberFormat.format(countValue);
};
// "1 meaning", "2,777 meanings": a count noun is { one, other }
const countedNounTextOf = (countValue, nounEntry) => wordingOf(meaningsVocabulary.countedNounTemplate, { countText: countTextOf(countValue), nounText: countValue === 1 ? nounEntry.one : nounEntry.other });

// the meanings a domain's level lists: its own, its own term, and those of other domains that name it (TQ 2026-11-12: one number, matching the next page)
export const meaningTotalCountOf = (domainRow) => domainRow.meaningCount + (domainRow.termMeaningCount || 0) + (domainRow.incomingMeaningCount || 0);
const meaningCountTextReaderByKind = {
	meaningHub: (hubRow) =>
		wordingOf(meaningsVocabulary.hubHoldingTemplate, { domainCountText: countedNounTextOf(hubRow.domainCount, meaningsVocabulary.domainNoun), meaningCountText: countedNounTextOf(hubRow.meaningCount, meaningsVocabulary.meaningNoun) }),
	// TQ 2026-11-12: a domain's row says one number, the meanings its level lists (its own, its own term, and those of other domains that name it), so the count
	// matches the next page; what the meanings are is said on that page, not here
	meaningDomain: (domainRow) => countedNounTextOf(meaningTotalCountOf(domainRow), meaningsVocabulary.meaningNoun),
};
// a count and its noun ('16 values'), for a level whose walk profile names what its rows are (focusCountNounByKind)
export const focusCountTextOf = (countValue, nounEntry) => countedNounTextOf(countValue, nounEntry);
// what a hub's or a domain's row holds, in words; any other row holds no meanings to count
export const meaningCountTextOf = (meaningGroupRow) => {
	const countTextReader = meaningCountTextReaderByKind[meaningGroupRow.kind];
	return countTextReader ? countTextReader(meaningGroupRow) : '';
};

// how many standard elements map to one meaning
// ⟪meaningsClarity⟫ a meaning nothing maps to whose values are mapped says so, so it does not read as empty
export const meaningExpressionTextOf = (meaningRow) => {
	if (!meaningRow.elementCount && meaningRow.valueElementCount) {
		const valueElementCountText = countedNounTextOf(meaningRow.valueElementCount, meaningsVocabulary.elementNoun);
		return wordingOf(meaningRow.valueElementCount === 1 ? meaningsVocabulary.meaningUnexpressedWithValuesOneTemplate : meaningsVocabulary.meaningUnexpressedWithValuesTemplate, { elementCountText: valueElementCountText });
	}
	if (!meaningRow.elementCount) return meaningsVocabulary.meaningUnexpressedText;
	const elementCountText = countedNounTextOf(meaningRow.elementCount, meaningsVocabulary.elementNoun);
	return wordingOf(meaningRow.elementCount === 1 ? meaningsVocabulary.meaningExpressionOneTemplate : meaningsVocabulary.meaningExpressionTemplate, { elementCountText });
};
export const meaningElementCountTextOf = (elementCount) => countedNounTextOf(elementCount, meaningsVocabulary.elementNoun);

// ⟪rosettaReportLegible⟫ a meaning's tuple as its slots, in the server's order (hubCardTuple answers them in its rules' slot order): each slot named in words, its part
// as the server gave it, and its kind and its id in its hub's standard (hubCardTuple's nativeId: { <declared identifier name>: text }), as "property · CEDS id P000128";
// a slot with no id says only its kind. The Meanings panel (MeaningSection.vue) and the Rosetta report (rosettaReportBlocks.js) both draw it.
const tupleSlotHubIdTextOf = ({ slotPart, hubName }) => (slotPart.nativeId ? wordingOf(meaningsVocabulary.meaningSection.hubIdTemplate, { hubName, nativeIdText: Object.values(slotPart.nativeId)[0] }) : '');
// ⟪explorerTidy, supervisor's ruling⟫ A SELECTED LEAF MEANING (a meaning row that opens to nothing) shows in the panel what its focus would: its own node, read by the store
// (loadLeafMeaning, the drill's own request), under the row's own fields. The panel (DetailPanel.vue) reads these three; a test drives them with the store.
export const isLeafMeaningRow = (selectedRow) => Boolean(selectedRow && selectedRow.kind === 'meaning' && !selectedRow.hasChildren);
export const selectedLeafNodeOf = ({ selectedRow, leafMeaningState }) => (leafMeaningState && leafMeaningState.meaningNode ? { ...leafMeaningState.meaningNode, ...selectedRow } : null);
export const leafFactsStateNameOf = (leafMeaningState) => {
	if (!leafMeaningState) return '';
	if (leafMeaningState.loading) return 'loading';
	return leafMeaningState.failed ? 'failed' : 'read';
};

// ⟪explorerTidy, Q97⟫ why a tuple or a range list is absent, in words (meaningSection.absentReasonTextByName); a name with no words is refused by name
export const absentReasonTextOf = (absentName) => {
	const reasonText = meaningsVocabulary.meaningSection.absentReasonTextByName[absentName];
	if (!reasonText) throw new Error(`explorerVocabulary: no words for the absent name '${absentName}' (meaningSection.absentReasonTextByName)`);
	return reasonText;
};
export const uriAbsentTextOf = (uriAbsentReason) => meaningsVocabulary.meaningSection.uriAbsentTextByReason[uriAbsentReason] || meaningsVocabulary.meaningSection.uriAbsentOtherText;
export const factsAbsentTextOf = (factsAbsentName) => wordingOf(meaningsVocabulary.meaningSection.factsAbsentTemplate, { reasonText: absentReasonTextOf(factsAbsentName) });
// a relation the words do not name is a published answer's own value (the forge's), shown as it came, never refused: refusing would take the whole page down
export const relationTextOf = (matchEdgeType) => meaningsVocabulary.meaningSection.relationTextByEdgeType[matchEdgeType] || String(matchEdgeType);
export const tupleAbsentTextOf = (tupleAbsentName) => wordingOf(meaningsVocabulary.meaningSection.tupleAbsentTemplate, { reasonText: absentReasonTextOf(tupleAbsentName) });
export const rangeListAbsentTextOf = (rangeListAbsentName) => wordingOf(meaningsVocabulary.meaningSection.rangeListAbsentTemplate, { reasonText: absentReasonTextOf(rangeListAbsentName) });
// ⟪explorerTidy, Q97⟫ one tuple part's kind and id in words, "class · CEDS id C200159": the panel's slot line, and the /edc meaning page's part rows (humanPage.js requires this module)
export const tuplePartDetailTextOf = ({ slotPart, hubName }) => {
	const sectionWords = meaningsVocabulary.meaningSection;
	return [sectionWords.partKindLabelByKind[slotPart.kind] || slotPart.kind, tupleSlotHubIdTextOf({ slotPart, hubName })].filter(Boolean).join(sectionWords.partDivider);
};
export const meaningTupleSlotListOf = ({ tuple, hubName }) => {
	const sectionWords = meaningsVocabulary.meaningSection;
	return Object.entries(tuple || {}).map(([slotName, slotPart]) => ({
		slotName,
		slotLabel: sectionWords.slotLabelByName[slotName] || slotName,
		...slotPart,
		detailText: tuplePartDetailTextOf({ slotPart, hubName }),
	}));
};

// what one meaning row is about: the domain's own term says so (⟪review S5⟫ known by the group the server listed it in, never by re-deriving the server's
// tier rule); a property meaning says its range and qualifiers (its tier is the level's, so it is not repeated)
export const OWN_TERM_RELATIONSHIP_TYPE = 'HAS_TERM_MEANING';
// a domain's own property meanings (the server's HAS_MEANING group)
export const MEANING_RELATIONSHIP_TYPE = 'HAS_MEANING';
// ⟪meaningsClarity⟫ a meaning of another domain listed on this one (the server's HAS_INCOMING_MEANING group)
export const INCOMING_MEANING_RELATIONSHIP_TYPE = 'HAS_INCOMING_MEANING';
// how an incoming meaning names the domain on screen: "names this as its range"
export const incomingSlotTextOf = (meaningRow) =>
	wordingOf(meaningsVocabulary.incomingSlotTemplate, {
		// ⟪review N1⟫ a slot is said by its slot name (the server's, from hubCardTupleRules), the one word the /edc page uses too
		slotText: (meaningRow.incomingSlotNameList || []).join(meaningsVocabulary.incomingSlotWordDivider),
	});
// ⟪meaningsClarity⟫ the values a property meaning holds: "48 values inside" (none said when it holds none)
export const meaningValuesTextOf = (meaningRow) =>
	meaningRow.valueMeaningCount ? wordingOf(meaningsVocabulary.valuesInsideTemplate, { valueCountText: countedNounTextOf(meaningRow.valueMeaningCount, meaningsVocabulary.valueNoun) }) : '';
export const meaningInfoTextOf = (meaningRow) => {
	if (meaningRow.relationshipType === OWN_TERM_RELATIONSHIP_TYPE) return meaningsVocabulary.domainOwnTermRowText;
	// ⟪meaningsClarity⟫ an incoming meaning says where it lives and how it names this domain (its range IS this domain, so the range is not repeated)
	if (meaningRow.relationshipType === INCOMING_MEANING_RELATIONSHIP_TYPE) {
		return [meaningRow.hubDomainName ? wordingOf(meaningsVocabulary.incomingDomainTemplate, { domainName: meaningRow.hubDomainName }) : '', incomingSlotTextOf(meaningRow), meaningValuesTextOf(meaningRow)]
			.filter(Boolean)
			.join(meaningsVocabulary.countPartDivider);
	}
	return [
		meaningRow.rangeName ? wordingOf(meaningsVocabulary.rangeTemplate, { rangeName: meaningRow.rangeName }) : '',
		(meaningRow.qualifierNameList || []).length ? wordingOf(meaningsVocabulary.qualifierTemplate, { qualifierNameText: meaningRow.qualifierNameList.join(meaningsVocabulary.qualifierNameDivider) }) : '',
		meaningValuesTextOf(meaningRow),
	]
		.filter(Boolean)
		.join(meaningsVocabulary.countPartDivider);
};

// a meaning's line under its bubble: what it is about, then how many elements express it
export const meaningRowSubTextOf = (meaningRow) => [meaningInfoTextOf(meaningRow), meaningExpressionTextOf(meaningRow)].filter(Boolean).join(meaningsVocabulary.countPartDivider);

// ⟪meaningsClarity Addendum B⟫ the meaning panel's visible title and, under it, what the meaning is in words ("a property in the CEDS domain Individualized Program
// Accessibility Feature"). The words are the shared list both pages read (meaningFactsWording.json), passed in: this module imports nothing. A tier the list has no
// words for, or a domain name the node does not carry, says the tier as the server named it.
export const meaningTitleOf = ({ meaningNode, meaningFactsWording }) => meaningTitleTextOf({ meaningName: meaningNode.displayName || meaningNode.name, meaningFactsWording });
export const meaningSubtitleOf = ({ meaningNode, meaningFactsWording }) =>
	meaningSubtitleTextOf({ referenceTier: meaningNode.referenceTier, hubName: meaningNode.hubName, domainName: meaningNode.hubDomainName || (meaningNode.meaningDomain && meaningNode.meaningDomain.name) || '', meaningFactsWording });

// ⟪meaningsClarity Addendum B⟫ WHAT THE DIAGRAM SHOWS, written from the level's own facts: the sentences, and the counts they say (countByName), which are the same
// numbers the diagram's labels and the table's counts show. Only what is true at this level is said; a count of 0 says no sentence. A level kind with no template
// says nothing. ⟪explorerTidy⟫ one sentence per fact, naming no other domain and listing no property.
const proseWords = meaningsVocabulary.levelProse;
// the counts as the page writes numbers ("2,777")
const countTextByNameOf = (countByName) => Object.fromEntries(Object.entries(countByName).map(([countName, countValue]) => [countName, countTextOf(countValue)]));
// the diagram key's entry for a mark, so the prose quotes the key's own sample words ("N elements map here"); a mark the key does not draw is refused by name
const diagramKeyEntryOf = (markName) => {
	const diagramKeyMarkEntry = meaningsVocabulary.diagramKey.entryList.find((oneEntry) => oneEntry.markName === markName);
	if (!diagramKeyMarkEntry) throw new Error(`explorerVocabulary: the diagram key has no mark '${markName}'`);
	return diagramKeyMarkEntry;
};
// a count's sentence, in its one or other form, or none for a count of 0
const countedSentenceOf = ({ templateByCount, countValue, valueByName }) => (countValue ? wordingOf(countValue === 1 ? templateByCount.one : templateByCount.other, valueByName) : '');
const levelProseReaderByKind = {
	meaningCatalog: ({ levelRowList, templateSet }) => {
		const countByName = { meaningCount: levelRowList.reduce((soFar, oneRow) => soFar + (oneRow.meaningCount || 0), 0) };
		return { countByName, sentenceList: [wordingOf(templateSet.catalogTemplate, countTextByNameOf(countByName))] };
	},
	meaningHub: ({ focusNode, templateSet }) => {
		const countByName = { domainCount: focusNode.domainCount, meaningCount: focusNode.meaningCount };
		return { countByName, sentenceList: [wordingOf(templateSet.hubTemplate, { ...countTextByNameOf(countByName), hubName: focusNode.hubName || focusNode.name })] };
	},
	meaningDomain: ({ focusNode, levelRowList, templateSet }) => {
		const incomingRowList = levelRowList.filter((oneRow) => oneRow.relationshipType === INCOMING_MEANING_RELATIONSHIP_TYPE);
		const countByName = { meaningCount: focusNode.meaningCount, mappedMeaningCount: focusNode.mappedMeaningCount, incomingMeaningCount: focusNode.incomingMeaningCount || 0 };
		const countTextByName = countTextByNameOf(countByName);
		const slotText = Array.from(new Set(incomingRowList.flatMap((oneRow) => oneRow.incomingSlotNameList || []))).join(meaningsVocabulary.incomingSlotWordDivider);
		return {
			countByName,
			sentenceList: [
				countedSentenceOf({ templateByCount: templateSet.domainMeaningsTemplate, countValue: countByName.meaningCount, valueByName: countTextByName }),
				countedSentenceOf({ templateByCount: templateSet.domainMappedTemplate, countValue: countByName.mappedMeaningCount, valueByName: { ...countTextByName, expressedSampleText: diagramKeyEntryOf('expressedCount').sampleText } }),
				!countByName.meaningCount && focusNode.termMeaningCount ? templateSet.domainOwnTermOnlyText : '',
				countedSentenceOf({ templateByCount: templateSet.domainIncomingTemplate, countValue: countByName.incomingMeaningCount, valueByName: { ...countTextByName, slotText } }),
				// ⟪review N1⟫ any row drawn with a › says it: its own meanings and the incoming ones, which carry their own value counts
				levelRowList.some((oneRow) => [MEANING_RELATIONSHIP_TYPE, INCOMING_MEANING_RELATIONSHIP_TYPE].includes(oneRow.relationshipType) && oneRow.valueMeaningCount) ? templateSet.domainValuesText : '',
			].filter(Boolean),
		};
	},
	meaning: ({ focusNode, levelRowList, templateSet }) => {
		if (!focusNode.valueMeaningCount) return { countByName: { valueCount: 0 }, sentenceList: [templateSet.meaningNoValuesText] };
		const countByName = { valueCount: focusNode.valueMeaningCount, mappedValueCount: levelRowList.filter((oneRow) => oneRow.elementCount > 0).length };
		const countTextByName = countTextByNameOf(countByName);
		return {
			countByName,
			sentenceList: [
				countedSentenceOf({ templateByCount: templateSet.valuesTemplate, countValue: countByName.valueCount, valueByName: countTextByName }),
				countedSentenceOf({ templateByCount: templateSet.valuesMappedTemplate, countValue: countByName.mappedValueCount, valueByName: countTextByName }),
			].filter(Boolean),
		};
	},
};
export const levelProseOf = ({ focusNode, levelRowList, filterText, filterUnmatchedRowCount, effectiveViewMode }) => {
	const proseReader = focusNode ? levelProseReaderByKind[focusNode.kind] : null;
	if (!proseReader) return { countByName: {}, sentenceList: [] };
	const templateSet = proseWords.templateSetByViewMode[effectiveViewMode];
	if (!templateSet) throw new Error(`explorerVocabulary: no level prose for the view '${effectiveViewMode}' (${Object.keys(proseWords.templateSetByViewMode).join(', ')})`);
	const { countByName, sentenceList } = proseReader({ focusNode, levelRowList, templateSet });
	const filterSentenceList = filterUnmatchedRowCount ? [wordingOf(templateSet.filterTemplate, { filterText: filterText.trim(), unmatchedCount: countTextOf(filterUnmatchedRowCount) })] : [];
	return { countByName: { ...countByName, ...(filterUnmatchedRowCount ? { unmatchedCount: filterUnmatchedRowCount } : {}) }, sentenceList: [...sentenceList, ...filterSentenceList] };
};

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

// ⟪review N4⟫ the codec lives once, in sharedWalkPath.js, which the /edc pages load too; re-exported here as it always was
export { pathTextOf };

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
//   legendShowsMatchColumns ⟪meaningsClarity⟫ the legend's match-kind, confidence and marks columns (the meanings walk draws no mapping edge, so it shows its own key)
//   diagramKey            ⟪meaningsClarity⟫ the diagram's key (meaningsVocabulary.diagramKey), drawn by the legend; null: none
//   showsLevelProse       ⟪meaningsClarity Addendum B⟫ a few sentences above the level saying what its diagram shows (levelProseOf)
//   rowWalkPathFieldName  ⟪meaningsClarity⟫ the row field carrying the walk's own path to a row that lives elsewhere (an incoming meaning, opened in its own domain);
//                         a row without it opens one step below this level. null: every row opens one step below

export const MEANING_CATALOG_STABLE_ID = 'meanings:all';
export { MEANINGS_ROUTE_PATH };

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
		legendShowsMatchColumns: true,
		diagramKey: null,
		showsLevelProse: false,
		rowWalkPathFieldName: null,
		levelTableByFocusKind: Object.freeze({}),
		crumbTemplateByKind: Object.freeze({}),
		countColumnTitle: null,
		mappingColumnTitle: null,
		focusCountNounByKind: Object.freeze({}),
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
		legendShowsMatchColumns: false,
		diagramKey: meaningsVocabulary.diagramKey,
		showsLevelProse: true,
		rowWalkPathFieldName: 'meaningsWalkPathStableIdList',
		// TQ 2026-11-12: a hub's level lists classes only, so Kind and Detail say nothing a click on the row does not; each level's button names what it opens
		levelTableByFocusKind: Object.freeze({
			meaningHub: Object.freeze({ hiddenColumnNameList: Object.freeze(['kind', 'infoText']), openText: meaningsVocabulary.openTextByFocusKind.meaningHub, openLabelTemplate: meaningsVocabulary.openLabelTemplateByFocusKind.meaningHub }),
			meaningDomain: Object.freeze({ hiddenColumnNameList: Object.freeze([]), openText: meaningsVocabulary.openTextByFocusKind.meaningDomain, openLabelTemplate: meaningsVocabulary.openLabelTemplateByFocusKind.meaningDomain }),
			// a meaning's values contain nothing, so its level has no Contains column
			meaning: Object.freeze({ hiddenColumnNameList: Object.freeze(['countValue']) }),
		}),
		countColumnTitle: meaningsVocabulary.containsColumnTitle,
		mappingColumnTitle: meaningsVocabulary.mappingColumnTitle,
		crumbTemplateByKind: meaningsVocabulary.crumbTemplateByKind,
		// TQ 2026-11-12: a meaning's level lists its values, so its toolbar counts values ('16 values'), from the meaning's own count
		focusCountNounByKind: Object.freeze({ meaning: Object.freeze({ countFieldName: 'valueMeaningCount', nounEntry: meaningsVocabulary.valueNoun }) }),
	}),
});

// a walk profile by name; a name not listed is refused, never quietly read as another walk
export const walkProfileOf = (walkProfileName) => {
	const walkProfile = walkProfileByName[walkProfileName];
	if (!walkProfile) throw new Error(`explorerVocabulary: '${walkProfileName}' is not a walk profile (${Object.keys(walkProfileByName).join(', ')})`);
	return walkProfile;
};

// a link to one point of a walk, and a path that begins at the walk's root (explorerLinkOf and explorerPathOf are the standards walk's)
export const walkLinkOf = (walkProfileName, pathStableIdList) => ({ path: walkProfileOf(walkProfileName).routePath, query: walkRouteQueryOf({ pathStableIdList, filterText: '' }) });
// ⟪meaningsClarity⟫ a walk URL's query: its path, and the level's filter text when there is one (walkFilterVocabulary). Every link to another level is made with no
// filter, so moving clears it; WalkView writes the level's own text into its own URL as it is typed, so Back and Forward bring it back
export const walkRouteQueryOf = ({ pathStableIdList, filterText }) => ({
	path: pathTextOf(pathStableIdList),
	...(filterText ? { [walkFilterVocabulary.walkFilterQueryName]: filterText } : {}),
});
// the filter text a walk URL carries: '' when it carries none
// ⟪review S2⟫ a hand-edited or mangled link never takes the page down: a repeated parameter (the router gives a list) reads as its first text, and a parameter that
// is no text reads as no filter. The box then shows what was read, and typing writes one parameter back.
export const walkFilterTextOfRouteQuery = (routeQuery) => {
	const filterValue = (routeQuery || {})[walkFilterVocabulary.walkFilterQueryName];
	const firstFilterValue = Array.isArray(filterValue) ? filterValue[0] : filterValue;
	return typeof firstFilterValue === 'string' ? firstFilterValue : '';
};
// the walk's path one step into a row: below this level, or, for a row that carries the walk's own path to it (rowWalkPathFieldName), that path
// (row: the level's row with that stableId, or null when the id is no row of this level)
export const rowWalkPathOf = ({ walkProfileName, pathStableIdList, stableId, row }) => {
	const rowWalkPathFieldName = walkProfileOf(walkProfileName).rowWalkPathFieldName;
	const rowWalkPathStableIdList = rowWalkPathFieldName && row ? row[rowWalkPathFieldName] : null;
	return rowWalkPathStableIdList && rowWalkPathStableIdList.length ? rowWalkPathStableIdList : [...pathStableIdList, stableId];
};
export const walkPathOf = (walkProfileName, pathStableIdList) => {
	const rootStableId = walkProfileOf(walkProfileName).rootStableId;
	return pathStableIdList[0] === rootStableId ? pathStableIdList : [rootStableId, ...pathStableIdList];
};

// a meaning as the Meanings explorer opens it from elsewhere (the Standards Explorer, a /edc meaning page): the catalog, then the meaning itself
export const MEANING_ID_PREFIX = 'meaning:';
export const meaningsLinkOf = (cardStableId) => walkLinkOf('meanings', [MEANING_CATALOG_STABLE_ID, `${MEANING_ID_PREFIX}${cardStableId}`]);

// ⟪meaningsClarity Addendum C #12⟫ a meaning reached by a deep link ([catalog, meaning], as meaningsLinkOf and the /edc page make it) has no hub or domain crumb to climb
// to; its answer names both (meaningGroup, meaningDomain), so the full path is [catalog, its group, its domain, itself]. null: the path is already whole, or the
// focus is no meaning, or its answer names no group
export const meaningFullPathOf = ({ pathStableIdList, focusNode }) => {
	if (!focusNode || focusNode.kind !== 'meaning' || !focusNode.meaningGroup || pathStableIdList.length !== 2 || pathStableIdList[1] !== focusNode.stableId) return null;
	return [pathStableIdList[0], focusNode.meaningGroup.stableId, ...(focusNode.meaningDomain ? [focusNode.meaningDomain.stableId] : []), focusNode.stableId];
};

// (an element's path in the Standards Explorer is made by the server, from the walk's own rules: an "Expressed in" element's standardsWalkPathStableIdList)

// the site's own page for an EDUcore URI: the /edc resolver answers https://w3id.org/EDUcore/<rest> at /edc/<rest> (edc-resolve.js); another IRI has none
export const EDC_BASE_IRI = 'https://w3id.org/EDUcore/';
export const edcPagePathOf = (edcUri) => (typeof edcUri === 'string' && edcUri.startsWith(EDC_BASE_IRI) ? `/edc/${edcUri.slice(EDC_BASE_IRI.length)}` : '');

export const pathStableIdListOf = (pathText) =>
	typeof pathText === 'string' && pathText !== ''
		? pathText.split(',').filter((onePart) => onePart !== '').map((onePart) => onePart.replace(/%2C/g, ',').replace(/%25/g, '%'))
		: [];
