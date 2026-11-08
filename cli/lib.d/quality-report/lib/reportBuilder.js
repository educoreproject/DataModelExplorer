'use strict';

// reportBuilder.js — the quality report's words and tables, as DocumentBlocks (documentRenderer.js), from reportData only.
// Tone (TQ, WORKORDER-qualityReport-110826): honest, soft-pedalled. Every figure drawn from a sample prints its sample size
// beside it; nothing is extrapolated from the human sample to the whole graph; what cannot be measured says so and says
// what would measure it. Each hub is named on every mapping figure (hubs are peers; elements correspond through ONE card).
//
//   buildReportDocument({ reportData, rules }) -> { titleText, blockList }
//   stampBlockOf(reportData) and the small block helpers are shared with certificateBuilder.js

const { countText, percentText, shareWithCountText, intervalText } = require('./numberText');
const { sumOf } = require('./graphFigures');

const heading = (headingLevel, text) => ({ blockKind: 'heading', headingLevel, text });
const paragraph = (text) => ({ blockKind: 'paragraph', text });
const bulletList = (itemTextList) => ({ blockKind: 'list', itemTextList });
const callout = (text) => ({ blockKind: 'callout', text });
const table = (columnSpecList, rowList) => ({ blockKind: 'table', columnList: columnSpecList.map(([titleText, alignName]) => ({ titleText, alignName })), rowList });

const shortHashText = (hashText) => (hashText ? `${hashText.slice(0, 12)}…` : 'absent');

const stampBlockOf = (reportData) => {
	const { graphStamp, generatorCommit, inputFingerprintList } = reportData;
	const raterSnapshot = inputFingerprintList[0];
	return {
		blockKind: 'stamp',
		fieldList: [
			{ labelText: 'Graph', valueText: graphStamp.graphName === graphStamp.goldenContainerName ? `\`${graphStamp.graphName}\`` : `\`${graphStamp.graphName}\` (container \`${graphStamp.goldenContainerName}\`)` },
			{ labelText: 'Manifest', valueText: `${graphStamp.manifestLabel} (\`${shortHashText(graphStamp.manifestRefId)}\`)` },
			{ labelText: 'Graph built', valueText: graphStamp.builtAt },
			{ labelText: 'Graph contract', valueText: `\`${shortHashText(graphStamp.graphContractSha256)}\`` },
			{ labelText: 'Human judgments', valueText: `CEDS Rater store snapshot \`${raterSnapshot.fileName}\` (sha256 \`${shortHashText(raterSnapshot.sha256)}\`)` },
			{ labelText: 'Generator', valueText: generatorCommit.commitRefId ? `\`cli/lib.d/quality-report\` at \`${generatorCommit.commitRefId.slice(0, 10)}\`${generatorCommit.isWorkingTreeClean ? '' : ' **with uncommitted changes**'}` : `commit unknown (${generatorCommit.commitAbsentReason})` },
		],
	};
};

// an origin's printed label, looked up by the graph's own mappingKind (the stored vocabulary), never by the label text
const originLabelOfKind = (rules, mappingKind) => rules.mappingOriginList.find((oneOrigin) => oneOrigin.mappingKind === mappingKind).originLabel;
const machineLabelOf = (rules) => originLabelOfKind(rules, 'inferred');
const publisherLabelOf = (rules) => originLabelOfKind(rules, 'authored');

const relationLabelList = (rules) => rules.relationList.map((oneRelation) => oneRelation.relationLabel);
const bandLabelList = (rules) => rules.confidenceBandList.map((oneBand) => oneBand.bandLabel);
const hubNamesText = (hubList) => hubList.map((oneHub) => `${oneHub.hubName} ${oneHub.hubVersion}`).join(' and ');

const verdictCountOf = (scored, verdictName) => scored.verdictCountByName[verdictName];
const graphMappedScoredCountOf = (scored) => ['bothChoseSameCard', 'sameCedsPropertyOtherCard', 'differentCard', 'graphMappedHumanNoMatch'].reduce((soFar, verdictName) => soFar + verdictCountOf(scored, verdictName), 0);
const graphAbstainedScoredCountOf = (scored) => verdictCountOf(scored, 'bothSayNoMatch') + verdictCountOf(scored, 'graphAbstainedHumanChose');

const bandLabelOfConfidence = (rules, mappingConfidence) => {
	const matchedBand = rules.confidenceBandList.find((oneBand) => oneBand.mappingConfidence === mappingConfidence);
	return matchedBand ? matchedBand.bandLabel : 'graph maps nothing';
};

// ---------------------------------------------------------------- sections

const atAGlanceBlocks = ({ reportData, rules }) => {
	const { overall, humanAgreement, consistency } = reportData;
	const { scored } = humanAgreement;
	const machineCount = overall.edgeMixAll.originCount[machineLabelOf(rules)];
	const publisherCount = overall.edgeMixAll.originCount[publisherLabelOf(rules)];
	const strongGroup = scored.ratesByGraphConfidence.find((oneGroup) => oneGroup.groupValue === rules.confidenceBandList[0].mappingConfidence);
	const weakGroup = scored.ratesByGraphConfidence.find((oneGroup) => oneGroup.groupValue === rules.confidenceBandList[rules.confidenceBandList.length - 1].mappingConfidence);
	return [
		heading(2, '1. At a glance'),
		table([['Measure', 'left'], ['Figure', 'left'], ['Drawn from', 'left']], [
			['Standards loaded', countText(overall.standardCount), 'every standard root in the graph (`standards_standards`)'],
			['Graph nodes', countText(overall.nodeCount), 'every node, by standard (`standards_stats`)'],
			['Non-hub properties mapped to at least one hub', shareWithCountText(overall.coverage.mappedProperties, overall.coverage.totalProperties), `\`standards_stats\` coverage, all ${countText(reportData.standardList.filter((oneStandard) => oneStandard.coverage).length)} non-hub standards with properties`],
			...overall.hubList.map((oneHub) => [`… mapped to ${oneHub.hubName}`, shareWithCountText(overall.coverage.mappedPropertyCountByHub[oneHub.hubName], overall.coverage.totalProperties), `the ${oneHub.hubName} hub only`]),
			['Mappings (match edges)', countText(overall.edgeMixAll.edgeCount), relationLabelList(rules).map((relationLabel) => `${countText(overall.edgeMixAll.relationCount[relationLabel])} ${relationLabel}`).join(', ')],
			['Publisher-stated mappings', shareWithCountText(publisherCount, overall.edgeMixAll.edgeCount), 'edges whose source is the standard\'s own document'],
			['Machine-proposed mappings', shareWithCountText(machineCount, overall.edgeMixAll.edgeCount), 'edges chosen by the AI judge'],
			['Human-reviewed mappings in the graph', '0', 'no edge records a review yet (see section 4)'],
			['Agreement with human raters, same CEDS card', `${shareWithCountText(scored.rateByName.cardAgreement.successCount, scored.rateByName.cardAgreement.trialCount)} answers; 95% interval ${intervalText(scored.rateByName.cardAgreement.interval)}`, `a first sample: ${countText(humanAgreement.storeFacts.raterWithCountedAnswerCount)} raters, ${countText(scored.elementCount)} elements of Ed-Fi, SIF and PESC, CEDS hub only`],
			['… where the judge was confident (strong)', strongGroup ? shareWithCountText(strongGroup.rateByName.cardAgreement.successCount, strongGroup.scoredAnswerCount) : 'not measured', 'answers whose element the graph maps with strong confidence'],
			['… where the judge was least sure (weak)', weakGroup ? shareWithCountText(weakGroup.rateByName.cardAgreement.successCount, weakGroup.scoredAnswerCount) : 'not measured', 'answers whose element the graph maps with weak-but-real confidence'],
			['Same hub property wherever one element recurs', shareWithCountText(consistency.instanceAgreementTotal.onePropertyDeclarationCount, consistency.instanceAgreementTotal.declarationCount), 'SIF and PESC elements judged separately in two or more places, both hubs'],
		]),
	];
};

const readingBlocks = ({ reportData, rules }) => [
	heading(2, '2. How to read the figures'),
	bulletList([
		`**Hubs.** This build has two hubs, ${hubNamesText(reportData.overall.hubList)}. Other standards' elements are mapped onto hub **cards** (a hub class, property and qualifiers). The hubs are peers: two elements correspond only through one card of one hub, never across hubs, so every mapping figure below names its hub.`,
		'**Properties and edges are different units.** A *property* is one element of a standard (a SIF Question or a PESC element declaration counts once, however many places it appears). An *edge* is one mapping in the graph. SIF and PESC carry their mappings on each place an element appears, so one property can own many edges.',
		`**Relations** (SKOS): ${rules.relationList.map((oneRelation) => `**${oneRelation.relationLabel}**, ${oneRelation.meaningText}`).join('; ')}.`,
		`**Confidence** is the AI judge's own confidence in its pick, stored in three bands: ${rules.confidenceBandList.map((oneBand) => `**${oneBand.bandLabel}** (${oneBand.meaningText})`).join('; ')}. It is the judge's view of itself, not a measured accuracy; section 5 compares it with human answers.`,
		'**Every count here is read from the graph or the rater store named on the stamp above.** The overall counts are the same answers the public `standards_stats` and `standards_standards` tools give for this graph; each per-standard table was checked to add up to them (appendix).',
	]),
];

const coverageBlocks = ({ reportData }) => {
	const { overall, standardList } = reportData;
	const hubNameList = overall.hubList.map((oneHub) => oneHub.hubName);
	const nonHubList = standardList.filter((oneStandard) => !oneStandard.isHub && oneStandard.coverage);
	const noPropertyList = standardList.filter((oneStandard) => !oneStandard.isHub && !oneStandard.coverage);
	return [
		heading(2, '3. Coverage'),
		paragraph(`Of the ${countText(overall.coverage.totalProperties)} properties of the non-hub standards, **${shareWithCountText(overall.coverage.mappedProperties, overall.coverage.totalProperties)}** are mapped to at least one hub card. ${hubNameList.map((hubName) => `${countText(overall.coverage.mappedPropertyCountByHub[hubName])} are mapped to ${hubName}`).join(' and ')}; a property mapped to both counts once in the total. The hubs' own ${countText(overall.coverage.hubPropertyCount)} properties are counted apart: a hub is not mapped to itself.`),
		paragraph('An unmapped property is not necessarily a gap. Many have no counterpart in either hub (a standard\'s internal identifiers, message plumbing, or concepts the hubs do not model), and the judge is allowed to decline. How much of the unmapped share is a true miss is not yet measured; section 5 gives the first evidence from human raters.'),
		table([['Standard', 'left'], ['Version', 'left'], ['Properties', 'right'], ['Mapped to any hub', 'right'], ...hubNameList.map((hubName) => [`to ${hubName}`, 'right'])],
			nonHubList.map((oneStandard) => [oneStandard.source, oneStandard.version, countText(oneStandard.coverage.totalPropertyCount), shareWithCountText(oneStandard.coverage.mappedPropertyCount, oneStandard.coverage.totalPropertyCount), ...hubNameList.map((hubName) => countText(oneStandard.coverage.mappedPropertyCountByHub[hubName]))])),
		paragraph(`Not counted for coverage: ${noPropertyList.map((oneStandard) => `${oneStandard.source} (${oneStandard.standardKind}, ${countText(oneStandard.nodeCount)} nodes, no properties of its own)`).join('; ') || 'none'}. Loaded but not yet mapped: ${nonHubList.filter((oneStandard) => oneStandard.coverage.mappedPropertyCount === 0).map((oneStandard) => oneStandard.source).join(', ') || 'none'}.`),
	];
};

const relationBlocks = ({ reportData, rules }) => {
	const { overall, standardList } = reportData;
	const hubNameList = overall.hubList.map((oneHub) => oneHub.hubName);
	const relationRowList = [];
	standardList.forEach((oneStandard) => hubNameList.forEach((hubName) => {
		const edgeMix = oneStandard.edgeMixByHub[hubName];
		if (edgeMix.edgeCount > 0) {
			relationRowList.push([oneStandard.source, hubName, countText(edgeMix.edgeCount), ...relationLabelList(rules).map((relationLabel) => `${countText(edgeMix.relationCount[relationLabel])} (${percentText(edgeMix.relationCount[relationLabel] / edgeMix.edgeCount, 0)})`)]);
		}
	}));
	return [
		heading(2, '4. Relation mix, mapping origin and confidence'),
		heading(3, '4.1 Relation mix'),
		table([['Relation', 'left'], ...hubNameList.map((hubName) => [`${hubName} edges`, 'right']), ['All edges', 'right'], ['Meaning', 'left']],
			rules.relationList.map((oneRelation) => [oneRelation.relationLabel, ...hubNameList.map((hubName) => shareWithCountText(overall.edgeMixByHub[hubName].relationCount[oneRelation.relationLabel], overall.edgeMixByHub[hubName].edgeCount)), shareWithCountText(overall.edgeMixAll.relationCount[oneRelation.relationLabel], overall.edgeMixAll.edgeCount), oneRelation.meaningText])),
		paragraph('Only exact and close mappings are offered as equivalents by the query tools, and an equivalence composed of two exact mappings is still labelled a composition of two judgments. Broad and narrow mappings say an element and a card are related, not that they are interchangeable. Per standard and hub, in edges:'),
		table([['Standard', 'left'], ['Hub', 'left'], ['Edges', 'right'], ...relationLabelList(rules).map((relationLabel) => [relationLabel, 'right'])], relationRowList),
	];
};

const originBlocks = ({ reportData, rules }) => {
	const { overall, standardList } = reportData;
	const hubNameList = overall.hubList.map((oneHub) => oneHub.hubName);
	const confidenceRowList = [];
	standardList.forEach((oneStandard) => hubNameList.forEach((hubName) => {
		const edgeMix = oneStandard.edgeMixByHub[hubName];
		const machineCount = edgeMix.originCount[machineLabelOf(rules)];
		if (machineCount > 0) {
			confidenceRowList.push([oneStandard.source, hubName, countText(machineCount), ...bandLabelList(rules).map((bandLabel) => `${countText(edgeMix.confidenceCount[bandLabel])} (${percentText(edgeMix.confidenceCount[bandLabel] / machineCount, 0)})`)]);
		}
	}));
	const sourceRowList = Object.keys(overall.edgeMixAll.mappingSourceCount).sort().map((mappingSource) => [`\`${mappingSource}\``, countText(overall.edgeMixAll.mappingSourceCount[mappingSource])]);
	return [
		heading(3, '4.2 Who made each mapping'),
		table([['Origin', 'left'], ...hubNameList.map((hubName) => [hubName, 'right']), ['All', 'right'], ['Meaning', 'left']], [
			...rules.mappingOriginList.map((oneOrigin) => [oneOrigin.originLabel, ...hubNameList.map((hubName) => countText(overall.edgeMixByHub[hubName].originCount[oneOrigin.originLabel])), shareWithCountText(overall.edgeMixAll.originCount[oneOrigin.originLabel], overall.edgeMixAll.edgeCount), oneOrigin.meaningText]),
			['human-reviewed', ...hubNameList.map(() => '0'), '0', 'a person confirmed the mapping in the graph'],
		]),
		callout(rules.humanReviewedNoteText),
		paragraph('The recorded source of each edge (`mappingSource`), in edges:'),
		table([['mappingSource', 'left'], ['Edges', 'right']], sourceRowList),
		heading(3, '4.3 The judge\'s confidence'),
		paragraph(`Publisher-stated edges carry no confidence (${countText(overall.edgeMixAll.confidenceNotApplicableCount)} edges); the machine-proposed ones, by band:`),
		table([['Band', 'left'], ...hubNameList.map((hubName) => [hubName, 'right']), ['All machine-proposed', 'right']],
			rules.confidenceBandList.map((oneBand) => [`${oneBand.bandLabel} (${oneBand.mappingConfidence})`, ...hubNameList.map((hubName) => shareWithCountText(overall.edgeMixByHub[hubName].confidenceCount[oneBand.bandLabel], overall.edgeMixByHub[hubName].originCount[machineLabelOf(rules)])), shareWithCountText(overall.edgeMixAll.confidenceCount[oneBand.bandLabel], overall.edgeMixAll.originCount[machineLabelOf(rules)])])),
		paragraph('Per standard and hub, machine-proposed edges by band:'),
		table([['Standard', 'left'], ['Hub', 'left'], ['Machine edges', 'right'], ...bandLabelList(rules).map((bandLabel) => [bandLabel, 'right'])], confidenceRowList),
	];
};

const humanBlocks = ({ reportData, rules }) => {
	const { humanAgreement } = reportData;
	const { scored, sampleFacts, storeFacts, interRater, graphCardListing, sampleGraphMappingCount } = humanAgreement;
	const mappedScoredCount = graphMappedScoredCountOf(scored);
	const abstainedScoredCount = graphAbstainedScoredCountOf(scored);
	const rateRow = (rateLabel, rate) => [rateLabel, shareWithCountText(rate.successCount, rate.trialCount), intervalText(rate.interval)];
	return [
		heading(2, `5. Agreement with human judgment (${humanAgreement.hubName} hub)`),
		callout(`This is a first sample, and it is small. ${countText(scored.answerCount)} answers from ${countText(storeFacts.raterWithCountedAnswerCount)} raters, on ${countText(scored.elementCount)} elements of three standards, compared with this graph's ${humanAgreement.hubName} mappings. It is reported as a baseline for the method, not as the accuracy of the graph's ${countText(reportData.overall.edgeMixAll.edgeCount)} mappings; the interval beside each rate shows how far a sample this size can move.`),
		heading(3, '5.1 What the raters were asked'),
		paragraph(`The CEDS Rater shows a person one element of a standard, with its definition and context, beside up to 20 candidate CEDS cards found by meaning and by words; the rater can also search all of CEDS. The rater picks the **Best** card, may tick other cards as the **Same**, or answers **No match in CEDS** or **Unsure**. For an element the graph maps, the graph's own card was always among the candidates, unmarked: raters were not told which card the graph had chosen.`),
		paragraph(`The sample is ${countText(sampleFacts.sampleElementCount)} elements, ${countText(sampleFacts.perStandardDrawCount)} each from ${sampleFacts.standardList.join(', ')}: per standard ${countText(sampleFacts.drawCountByPart.mapped)} elements the sampling build had mapped and ${countText(sampleFacts.drawCountByPart.unmapped)} it had not, each part stratified by kind of element (identifier, code, date, number, indicator, free text). It was drawn from \`${sampleFacts.sampleGoldenContainerName}\` with seed \`${sampleFacts.sampleSeedText}\` and dealt into surveys ${sampleFacts.surveyNameList.join(', ')}. This graph maps ${countText(sampleGraphMappingCount.mappedInThisGraph)} of the ${countText(sampleFacts.sampleElementCount)} sample elements; the sampling build mapped ${countText(sampleGraphMappingCount.mappedInSampleGold)}, and ${countText(sampleGraphMappingCount.mappedInBoth)} are mapped in both. Of the ${countText(graphCardListing.graphMappedAnsweredElementCount)} answered elements this graph maps, ${countText(graphCardListing.graphCardOffListElementCount)} had a card of this graph's missing from the rater's list.`),
		heading(3, '5.2 What exists so far'),
		bulletList([
			`${countText(storeFacts.storedAnswerCount)} current answers (${countText(storeFacts.historyRowCount)} saves in all, counting edits), saved between ${storeFacts.firstSavedAt.slice(0, 10)} and ${storeFacts.lastSavedAt.slice(0, 10)}.`,
			`${countText(storeFacts.raterWithCountedAnswerCount)} raters answered; ${countText(storeFacts.finishedRaterCount)} finished a whole survey. ${countText(storeFacts.raterAccountCount)} rater accounts exist.`,
			`Surveys answered: ${storeFacts.answeredSurveyNameList.join(' and ')}. The remaining survey has not been answered yet.`,
			`${countText(scored.answerCount)} answers counted, on ${countText(scored.elementCount)} elements; ${countText(verdictCountOf(scored, 'humanUnsure'))} were Unsure and are not scored, leaving **${countText(scored.scoredAnswerCount)} scored answers**.`,
		]),
		heading(3, '5.3 How the graph and the raters compare'),
		table([['Outcome', 'left'], ['Answers', 'right'], ['What it means', 'left']], [
			['same card', countText(verdictCountOf(scored, 'bothChoseSameCard')), 'the rater\'s Best card is the graph\'s card'],
			['same CEDS property, other class', countText(verdictCountOf(scored, 'sameCedsPropertyOtherCard')), 'the same CEDS property and qualifiers, placed in a different CEDS class'],
			['different card', countText(verdictCountOf(scored, 'differentCard')), 'both chose a card, and they are different CEDS properties'],
			['graph maps, rater says no match', countText(verdictCountOf(scored, 'graphMappedHumanNoMatch')), 'the rater found nothing in CEDS that fits; the graph maps the element anyway'],
			['both say no match', countText(verdictCountOf(scored, 'bothSayNoMatch')), 'the graph maps nothing, and the rater found nothing that fits'],
			['graph maps nothing, rater chose a card', countText(verdictCountOf(scored, 'graphAbstainedHumanChose')), 'a possible gap in the graph'],
			['unsure (not scored)', countText(verdictCountOf(scored, 'humanUnsure')), 'the rater could not decide'],
		]),
		table([['Agreement', 'left'], ['Scored answers', 'right'], ['95% interval', 'left']], [
			rateRow('same card, or both say no match', scored.rateByName.cardAgreement),
			rateRow('same CEDS property (class aside), or both say no match', scored.rateByName.propertyAgreement),
		]),
		paragraph(`Seen from the graph's side: where the graph maps the element (${countText(mappedScoredCount)} scored answers), the rater chose the graph's card ${shareWithCountText(verdictCountOf(scored, 'bothChoseSameCard'), mappedScoredCount)} of the time, and accepted it as Best or Same in ${shareWithCountText(scored.acceptsGraphCardCount, mappedScoredCount)}. Where the graph maps nothing (${countText(abstainedScoredCount)} scored answers), the rater agreed nothing fits in ${shareWithCountText(verdictCountOf(scored, 'bothSayNoMatch'), abstainedScoredCount)}.`),
		heading(3, '5.4 Agreement follows the judge\'s confidence'),
		paragraph('The judge\'s confidence band, read from the graph\'s edge for each answered element (its strongest edge, where it has several), against the raters\' answers. Agreement is the same card; on the last row, where the graph maps nothing, it is the rater also finding nothing that fits. The bands rank the way they should; the samples behind each are small.'),
		table([['Graph\'s confidence', 'left'], ['Scored answers', 'right'], ['Agreement', 'right'], ['95% interval', 'left']],
			scored.ratesByGraphConfidence.map((oneGroup) => [bandLabelOfConfidence(rules, oneGroup.groupValue), countText(oneGroup.scoredAnswerCount), shareWithCountText(oneGroup.rateByName.cardAgreement.successCount, oneGroup.rateByName.cardAgreement.trialCount), intervalText(oneGroup.rateByName.cardAgreement.interval)])),
		heading(3, '5.5 By standard'),
		table([['Standard (sample)', 'left'], ['Scored answers', 'right'], ['Same card or both no match', 'right'], ['95% interval', 'left'], ['Same property or both no match', 'right']],
			scored.ratesByStandard.map((oneGroup) => [oneGroup.groupValue, countText(oneGroup.scoredAnswerCount), shareWithCountText(oneGroup.rateByName.cardAgreement.successCount, oneGroup.rateByName.cardAgreement.trialCount), intervalText(oneGroup.rateByName.cardAgreement.interval), shareWithCountText(oneGroup.rateByName.propertyAgreement.successCount, oneGroup.rateByName.propertyAgreement.trialCount)])),
		paragraph(`The sample is split in two: a dev half that may be looked at while the judge is tuned, and a sealed half that is scored only for reports such as this one, never for tuning. Agreement (same card, or both say no match): ${scored.ratesBySplitHalf.map((oneGroup) => `${oneGroup.groupValue} half ${shareWithCountText(oneGroup.rateByName.cardAgreement.successCount, oneGroup.scoredAnswerCount)} (interval ${intervalText(oneGroup.rateByName.cardAgreement.interval)})`).join('; ')}.`),
		heading(3, '5.6 Rater with rater'),
		paragraph(`${countText(interRater.multiRatedElementCount)} elements have answers from two raters; they chose the same Best card on ${countText(interRater.sameCardElementCount)}. That is too few to say how often people agree with each other, which bounds how well any judge can be expected to agree with one person. It will be measured once each survey has a second rater.`),
	];
};

const consistencyBlocks = ({ reportData, rules }) => {
	const { overall, consistency } = reportData;
	const hubNameList = overall.hubList.map((oneHub) => oneHub.hubName);
	const bucketWidth = rules.judgeCertaintyBucketWidth;
	const bucketLabelOf = (bucketIndex) => `${(bucketIndex * bucketWidth).toFixed(1)}–${((bucketIndex + 1) * bucketWidth).toFixed(1)}`;
	const bucketCount = Math.round(1 / bucketWidth);
	return [
		heading(2, '6. Automatic consistency signals'),
		paragraph('These need no human and are recomputed on every build. None of them is accuracy: each says whether the judge is consistent with itself or with what the standards publish.'),
		heading(3, '6.1 One element, many places'),
		paragraph('A SIF Question or a PESC element declaration appears in many places (SIF objects, PESC document sections), and the judge was asked about each place on its own. Where two or more places are mapped onto one hub, did every place get the same card? The same hub property? A different class in a different place can be right, since the class follows the context, so the property column is the fairer one.'),
		table([['Standard', 'left'], ['Hub', 'left'], ['Elements in 2+ mapped places', 'right'], ['Same card everywhere', 'right'], ['Same property everywhere', 'right']],
			consistency.instanceAgreementRowList.map((oneRow) => [oneRow.standardSource, oneRow.hubName, countText(oneRow.declarationCount), shareWithCountText(oneRow.oneCardDeclarationCount, oneRow.declarationCount), shareWithCountText(oneRow.onePropertyDeclarationCount, oneRow.declarationCount)])),
		paragraph(`All together: the same property everywhere for ${shareWithCountText(consistency.instanceAgreementTotal.onePropertyDeclarationCount, consistency.instanceAgreementTotal.declarationCount)} elements, the same card for ${shareWithCountText(consistency.instanceAgreementTotal.oneCardDeclarationCount, consistency.instanceAgreementTotal.declarationCount)}.`),
		heading(3, '6.2 How decided the judge was'),
		paragraph(`For each machine-proposed edge the judge recorded the probability it gave its chosen card. Edges by that probability, and the "close calls", where the runner-up card was within ${bucketWidth} of the winner:`),
		table([['Top probability', 'left'], ...hubNameList.map((hubName) => [hubName, 'right'])], [
			...Array.from({ length: bucketCount }, (unusedValue, bucketIndex) => [bucketLabelOf(bucketIndex), ...hubNameList.map((hubName) => (overall.judgeCertaintyByHub[hubName] ? countText(overall.judgeCertaintyByHub[hubName].edgeCountByBucket[bucketIndex]) : '0'))]),
			['close calls', ...hubNameList.map((hubName) => (overall.judgeCertaintyByHub[hubName] ? shareWithCountText(overall.judgeCertaintyByHub[hubName].closeCallEdgeCount, overall.judgeCertaintyByHub[hubName].edgeCount) : 'none'))],
		]),
		heading(3, '6.3 Triangulation across the hubs: not yet measurable'),
		paragraph('Where an element maps to a card on one hub and a card on the other, the hubs\' own published correspondences could confirm or contradict the pair. This build cannot check that yet:'),
		bulletList(consistency.triangulationRowList.map((oneRow) => `${oneRow.fromHubName} publishes ${countText(oneRow.declaredCorrespondenceCount)} correspondences to ${oneRow.toHubName}; ${countText(oneRow.mappedFromCardCount)} of them sit under a card any element is mapped to, so ${countText(oneRow.checkablePairCount)} pairs can be checked${oneRow.checkablePairCount > 0 ? ` and ${countText(oneRow.agreeingPairCount)} agree` : ''}.`)),
		paragraph(`(CTDL's published correspondences to CEDS are between code values, and this build's judge maps at the property level.) Meanwhile ${countText(consistency.triangulationRowList[0] ? consistency.triangulationRowList[0].bothHubElementCount : 0)} mapped places (edge owners) reach a card on both hubs: the population a property-level crosswalk between the hubs would let us check.`),
	];
};

const priorBlocks = ({ reportData }) => [
	heading(2, '7. Earlier measurements (not of this graph)'),
	paragraph('Two earlier experiments compared the judge with a publisher\'s own crosswalk. They measured earlier builds and earlier judge configurations, and are cited for their method, not as this graph\'s accuracy.'),
	table([['When', 'left'], ['What was measured', 'left'], ['Result', 'left'], ['Build', 'left'], ['Source', 'left']],
		reportData.priorMeasurementList.map((onePrior) => [onePrior.measuredOn, onePrior.measuredWhatText, onePrior.resultText, onePrior.buildText, `\`${onePrior.sourceText}\``])),
];

const methodBlocks = ({ reportData }) => [
	heading(2, '8. Method and limits'),
	bulletList([
		'**Coverage** counts DmeProperty nodes of non-hub standards; a property is mapped when it, or one of its instances, has an edge into a hub card (the rule `standards_stats` uses). It says a mapping exists, not that it is right.',
		'**Relation, origin and confidence** count match edges, read from each edge\'s `mappingKind`, `mappingSource` and `mappingConfidence`. Confidence is the judge\'s self-assessment.',
		`**Agreement with human judgment** compares each rater's current answer (edits replace earlier ones) with the ${reportData.humanAgreement.hubName} cards this graph maps the element to, by the CEDS Rater's own rules for "the graph's card" and "the same property". An answer counts only while its rater is still assigned to the element's survey. The rate is over scored answers (Unsure excluded); the interval is a 95% Wilson interval.`,
		'**The human sample is not the population.** It is stratified (80% elements the sampling build had mapped, 20% it had not, by kind), covers three standards and one hub, and is not re-weighted to the graph. Its rates describe these answers, and they are not extrapolated to the graph as a whole.',
		'**One rater per element**, almost everywhere. Where a rater and the graph disagree, either may be wrong; the rater\'s answer is treated as the reference only because it is the human one.',
		'**The raters judged cards, not relations.** Whether a mapping is exact, close, broad or narrow is not yet checked by people.',
		'**Consistency signals** say the judge agrees with itself; a judge can be consistently wrong.',
		'**Reproducible.** The generator reads only what the stamp names. Rerun it on the same graph and the same rater snapshot and it writes the same files.',
	]),
];

const notYetBlocks = () => [
	heading(2, '9. Not yet measured, and what would measure it'),
	table([['Not yet measured', 'left'], ['What would measure it', 'left']], [
		['Accuracy of the graph\'s mappings as a whole', 'a human gold set large enough, and drawn widely enough, to weight to the population: the remaining survey, more raters, more standards'],
		['How often people agree with each other', 'a second rater on every element of a survey'],
		['Agreement on the CTDL hub', 'a rater survey of CTDL cards, as the CEDS Rater does for CEDS'],
		['The other loaded standards', 'samples from CASE, CLR, JEDx, LIF, MedBiquitous, OneRoster, Open Badges, EduAPI and the rest'],
		['Whether the relation (exact, close, broad, narrow) is right', 'a relation question in the rater tool'],
		['Recall: mappings the graph is missing', 'rerunning the earlier Ed-Fi crosswalk comparison against this graph, and the "graph maps nothing, rater chose a card" count as the human sample grows'],
		['Run-to-run variance of the judge', 're-judging a fixed sample with the judgment cache bypassed; the cache returns the same verdict for the same prompt, so a rebuild alone does not measure it'],
		['Triangulation across the hubs', 'a property-level crosswalk between CEDS and CTDL, or judging at the code-value level where CTDL publishes its CEDS correspondences'],
		['Accuracy of AI answers grounded in EDUcore', 'the evaluation harness: real questions with expert-verified answers, asked with and without EDUcore'],
	]),
];

const appendixBlocks = ({ reportData }) => {
	const { crossCheckList } = reportData;
	const headlineCheckList = crossCheckList.filter((oneCheck) => !/^standards\./.test(oneCheck.checkName));
	return [
		heading(2, 'Appendix: the breakdowns add up to the public tools\' figures'),
		paragraph(`Every per-standard breakdown in this report was summed and compared with the answer of the handler behind \`standards_stats\` or \`standards_standards\` on the same graph: ${countText(crossCheckList.filter((oneCheck) => oneCheck.isEqual).length)} of ${countText(crossCheckList.length)} checks equal (the generator refuses to write a report when any is not). The overall ones:`),
		table([['Figure', 'left'], ['Public tool', 'right'], ['Sum of breakdown', 'right']], headlineCheckList.map((oneCheck) => [`\`${oneCheck.checkName}\``, countText(oneCheck.mcpFigure), countText(oneCheck.breakdownFigure)])),
	];
};

const buildReportDocument = ({ reportData, rules }) => {
	const { graphStamp } = reportData;
	return {
		titleText: 'EDUcore mapping-quality report: the first baseline',
		blockList: [
			stampBlockOf(reportData),
			paragraph(`This is the first published measurement of the mappings in EDUcore, for one build: \`${graphStamp.graphName}\`, manifest ${graphStamp.manifestLabel}. It reports what can be counted today and states the size of every sample beside the figure drawn from it. Most of the graph's mappings were proposed by an AI judge and have not been reviewed by people; a first sample of human judgments exists, and it is reported here as a baseline to measure against as the human gold set grows, ahead of the evaluation harness that is the next step.`),
			...atAGlanceBlocks({ reportData, rules }),
			...readingBlocks({ reportData, rules }),
			...coverageBlocks({ reportData, rules }),
			...relationBlocks({ reportData, rules }),
			...originBlocks({ reportData, rules }),
			...humanBlocks({ reportData, rules }),
			...consistencyBlocks({ reportData, rules }),
			...priorBlocks({ reportData, rules }),
			...methodBlocks({ reportData, rules }),
			...notYetBlocks({ reportData, rules }),
			...appendixBlocks({ reportData, rules }),
			paragraph(`Each loaded standard has its own one-page certificate drawn from the same figures, in \`certificates/\` beside this report.`),
		],
	};
};

module.exports = { buildReportDocument, machineLabelOf, publisherLabelOf, stampBlockOf, heading, paragraph, bulletList, callout, table, bandLabelOfConfidence, relationLabelList, bandLabelList, graphMappedScoredCountOf, sumOf };
