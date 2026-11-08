'use strict';

// certificateBuilder.js — one page per loaded standard ("certificates for everyone", TQ 2026-11-08; working reading: a
// per-standard quality certificate a publisher can be handed). Drawn from the same reportData as the report, so a
// certificate never says a number the report does not. Three page kinds, chosen by the standard's role in the graph:
//   mappedStandard  a non-hub standard with properties: coverage, relations, origin, confidence, human agreement
//   hub             a hub: how many properties of the other standards are mapped onto it, and how
//   noProperties    a corpus or other standard with no properties of its own: what it holds, and that coverage does not apply
//
//   buildCertificateDocument({ reportData, standardEntry, rules }) -> { titleText, blockList }
//   certificateFileStemOf(standardEntry) -> a file-name-safe stem (the standard's source)

const { countText, percentText, shareWithCountText, intervalText } = require('./numberText');
const { stampBlockOf, heading, paragraph, callout, table, relationLabelList, bandLabelList } = require('./reportBuilder');

const HUMAN_ABSENT_TEXT_BY_REASON = Object.freeze({
	noSampleOfThisStandard: () => 'Not yet measured: no human rater sample covers this standard yet. A rater survey drawn from it would measure it.',
	familySampledFromOtherReleases: (standardEntry) => `Not yet measured for this release. The first rater sample drew its ${standardEntry.standardFamily} elements from ${standardEntry.familyDrawSourceList.join(', ')}; this release was not among them.`,
});

const certificateFileStemOf = (standardEntry) => standardEntry.source.replace(/[^A-Za-z0-9._-]/g, '_');

const pageKindOf = (standardEntry) => (standardEntry.isHub ? 'hub' : standardEntry.coverage ? 'mappedStandard' : 'noProperties');

const relationRowListOf = ({ standardEntry, hubNameList, rules }) => hubNameList
	.filter((hubName) => standardEntry.edgeMixByHub[hubName].edgeCount > 0)
	.map((hubName) => {
		const edgeMix = standardEntry.edgeMixByHub[hubName];
		return [hubName, countText(edgeMix.edgeCount), ...relationLabelList(rules).map((relationLabel) => `${countText(edgeMix.relationCount[relationLabel])} (${percentText(edgeMix.relationCount[relationLabel] / edgeMix.edgeCount, 0)})`)];
	});

const mappedStandardBlocks = ({ reportData, standardEntry, rules }) => {
	const hubNameList = reportData.overall.hubList.map((oneHub) => oneHub.hubName);
	const { coverage } = standardEntry;
	const humanEntry = standardEntry.humanAgreement;
	const instanceRowList = reportData.consistency.instanceAgreementRowList.filter((oneRow) => oneRow.standardSource === standardEntry.source);
	const originRowList = hubNameList.filter((hubName) => standardEntry.edgeMixByHub[hubName].edgeCount > 0).map((hubName) => {
		const edgeMix = standardEntry.edgeMixByHub[hubName];
		const machineCount = edgeMix.originCount['machine-proposed'];
		return [hubName, countText(edgeMix.originCount['publisher-stated']), countText(machineCount), '0', ...bandLabelList(rules).map((bandLabel) => (machineCount > 0 ? `${countText(edgeMix.confidenceCount[bandLabel])} (${percentText(edgeMix.confidenceCount[bandLabel] / machineCount, 0)})` : '–'))];
	});
	const blockList = [
		heading(2, 'Coverage'),
		table([['Measure', 'left'], ['Figure', 'right']], [
			['Properties in this standard', countText(coverage.totalPropertyCount)],
			['Mapped to at least one hub', shareWithCountText(coverage.mappedPropertyCount, coverage.totalPropertyCount)],
			...hubNameList.map((hubName) => [`Mapped to ${hubName}`, shareWithCountText(coverage.mappedPropertyCountByHub[hubName], coverage.totalPropertyCount)]),
		]),
	];
	if (standardEntry.edgeCount === 0) {
		blockList.push(callout('No property of this standard is mapped to a hub in this build yet. It is loaded and searchable; its mappings are still to come.'));
	} else {
		blockList.push(
			heading(2, 'How it is mapped'),
			paragraph('Mappings (match edges), by hub and relation. A property that appears in many places carries one edge per place.'),
			table([['Hub', 'left'], ['Edges', 'right'], ...relationLabelList(rules).map((relationLabel) => [relationLabel, 'right'])], relationRowListOf({ standardEntry, hubNameList, rules })),
			paragraph('Who made them, and the judge\'s confidence in the machine-proposed ones:'),
			table([['Hub', 'left'], ['Publisher-stated', 'right'], ['Machine-proposed', 'right'], ['Human-reviewed', 'right'], ...bandLabelList(rules).map((bandLabel) => [bandLabel, 'right'])], originRowList),
		);
	}
	if (instanceRowList.length > 0) {
		blockList.push(
			heading(2, 'Consistency'),
			table([['Hub', 'left'], ['Elements mapped in 2+ places', 'right'], ['Same hub property everywhere', 'right']], instanceRowList.map((oneRow) => [oneRow.hubName, countText(oneRow.declarationCount), shareWithCountText(oneRow.onePropertyDeclarationCount, oneRow.declarationCount)])),
		);
	}
	blockList.push(heading(2, 'Agreement with human judgment'));
	if (humanEntry) {
		blockList.push(
			paragraph(`From the first CEDS Rater sample, ${reportData.humanAgreement.hubName} hub only${humanEntry.drawSourceList && humanEntry.drawSourceList.length > 1 ? `, pooled across the ${countText(humanEntry.drawSourceList.length)} ${humanEntry.sampleStandardName} schemas the sample was drawn from (${humanEntry.drawSourceList.join(', ')})` : ''}: the rater and the graph chose the same card, or both said nothing fits, in **${shareWithCountText(humanEntry.rateByName.cardAgreement.successCount, humanEntry.rateByName.cardAgreement.trialCount)}** scored answers (95% interval ${intervalText(humanEntry.rateByName.cardAgreement.interval)}). The same CEDS property, class aside: ${shareWithCountText(humanEntry.rateByName.propertyAgreement.successCount, humanEntry.rateByName.propertyAgreement.trialCount)}.`),
			callout('A small first sample: a baseline for the method, not a measured accuracy for this standard\'s mappings.'),
		);
	} else {
		blockList.push(paragraph(HUMAN_ABSENT_TEXT_BY_REASON[standardEntry.humanAgreementAbsentReason](standardEntry)));
	}
	return blockList;
};

const hubBlocks = ({ reportData, standardEntry, rules }) => {
	const hubName = standardEntry.source;
	const ontoHubRowList = reportData.standardList
		.filter((oneStandard) => oneStandard.coverage && oneStandard.coverage.mappedPropertyCountByHub[hubName] > 0)
		.sort((standardA, standardB) => standardB.coverage.mappedPropertyCountByHub[hubName] - standardA.coverage.mappedPropertyCountByHub[hubName])
		.map((oneStandard) => [oneStandard.source, shareWithCountText(oneStandard.coverage.mappedPropertyCountByHub[hubName], oneStandard.coverage.totalPropertyCount), countText(oneStandard.edgeMixByHub[hubName].edgeCount)]);
	const hubMix = reportData.overall.edgeMixByHub[hubName];
	return [
		paragraph(`${hubName} is a **hub** in this build: other standards are mapped onto its cards, and it is not mapped to itself. ${countText(reportData.overall.coverage.mappedPropertyCountByHub[hubName])} properties of ${countText(ontoHubRowList.length)} standards are mapped onto it, through ${countText(hubMix.edgeCount)} mappings.`),
		heading(2, 'Mappings onto this hub'),
		table([['Relation', 'left'], ['Edges', 'right']], rules.relationList.map((oneRelation) => [oneRelation.relationLabel, shareWithCountText(hubMix.relationCount[oneRelation.relationLabel], hubMix.edgeCount)])),
		table([['Origin', 'left'], ['Edges', 'right']], [...rules.mappingOriginList.map((oneOrigin) => [oneOrigin.originLabel, shareWithCountText(hubMix.originCount[oneOrigin.originLabel], hubMix.edgeCount)]), ['human-reviewed', '0']]),
		heading(2, 'Standards mapped onto it'),
		table([['Standard', 'left'], ['Its properties mapped here', 'right'], ['Edges', 'right']], ontoHubRowList),
	];
};

const noPropertyBlocks = ({ standardEntry }) => [
	paragraph(`${standardEntry.source} is loaded as a ${standardEntry.standardKind} with ${countText(standardEntry.nodeCount)} nodes and no properties of its own, so coverage and mapping figures do not apply to it.`),
];

const BLOCKS_BY_PAGE_KIND = Object.freeze({ mappedStandard: mappedStandardBlocks, hub: hubBlocks, noProperties: noPropertyBlocks });

const buildCertificateDocument = ({ reportData, standardEntry, rules }) => {
	const pageKindName = pageKindOf(standardEntry);
	return {
		titleText: `Quality certificate: ${standardEntry.source}${standardEntry.version && standardEntry.version !== 'unknown' ? ` (version ${standardEntry.version})` : ''}`,
		blockList: [
			paragraph(`How ${standardEntry.source} is represented and mapped in one EDUcore build, measured from the graph itself. ${countText(standardEntry.nodeCount)} nodes of this standard are loaded.`),
			...BLOCKS_BY_PAGE_KIND[pageKindName]({ reportData, standardEntry, rules }),
			heading(2, 'Measured on'),
			stampBlockOf(reportData),
			paragraph('Every figure is defined, with its limits, in the full EDUcore mapping-quality report for this build (`qualityReport.md`).'),
		],
	};
};

module.exports = { buildCertificateDocument, certificateFileStemOf, BLOCKS_BY_PAGE_KIND };
