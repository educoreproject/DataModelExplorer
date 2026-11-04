'use strict';
// @concept: [[DataModelExplorer]]
// render-use-case-diagram — draws ONE forged use case as an SVG, from what the graph holds about it (TQ/BD 2026-11-04: "on
// the Overview page of all published use cases add a generated graphic … to show established connections between user
// stories/steps and CEDS elements"; modelled on docs/use-case-model/transcript-exchange.svg on the use_case branch).
//
// Pure: no graph, no I/O. The forged-use-cases access point reads the case (caseByStableId, caseContextList, caseStepList,
// caseCitationList, caseStepDataLinkList) and hands the rows here; this answers { svgText, width, height, summary }.
//
// Layout, top to bottom:
//   header   value drivers and subjects (left) · the case and its own facts (centre) · interested parties and related
//            cases (right)
//   body     actors (left) — PERFORMED_BY → steps in reading order, extensions and exceptions indented and dashed (centre)
//            — CONSUMES (reads) / PRODUCES (writes) → the data each step names, drawn as the element it cites (right);
//            data reached through a part of what the step names (COMPRISES / HAS_CONSTITUENT) is drawn dashed
//   footer   the case's data no step names (required by the case as a whole), then the legend
// A data box is coloured by the reference's citation state (the mapper's citationStateRuleList): a CEDS element, another
// standard's element, a confirmed gap, an element the graph does not hold, a whole standard, or data the cases define.
// Every text is escaped; nothing from the graph is ever written into the SVG as markup.

// ================================================================================
// THE LOOK — one place for colours and sizes

const CANVAS_WIDTH = 1100;
const MARGIN = 20;
const FONT_FAMILY = 'Segoe UI, Helvetica, Arial, sans-serif';

const columnByName = Object.freeze({
	context: { x: MARGIN, width: 220 },
	caseBox: { x: 300, width: 480 },
	party: { x: 820, width: 260 },
	actor: { x: MARGIN, width: 190 },
	step: { x: 260, width: 280 },
	data: { x: 820, width: 260 },
});

const STEP_HEIGHT = 56;
const STEP_GAP = 22;
const VARIANT_STEP_INDENT = 30;
const DATA_HEIGHT = 48;
const DATA_GAP = 14;
const ACTOR_HEIGHT = 48;
const ACTOR_GAP = 12;
const CONTEXT_BOX_HEIGHT = 50;
const CONTEXT_BOX_GAP = 14;
const CHAR_WIDTH_BY_FONT_SIZE = { 15: 8.2, 14: 7.6, 13: 7.0, 12: 6.5, 11: 6.0 };

// a box's look by what it is; dashed boxes are the ones that are not established fact (a variant step, a gap, an
// element the graph does not hold)
const boxStyleByKind = Object.freeze({
	useCase: { fill: '#EEEDFE', stroke: '#534AB7', titleColour: '#26215C', textColour: '#3C3489' },
	context: { fill: '#F1EFE8', stroke: '#888780', titleColour: '#2C2C2A', textColour: '#5F5E5A' },
	party: { fill: '#FAECE7', stroke: '#993C1D', titleColour: '#712B13', textColour: '#993C1D' },
	relatedCase: { fill: '#EEEDFE', stroke: '#534AB7', titleColour: '#26215C', textColour: '#534AB7', dashed: true },
	actor: { fill: '#FAECE7', stroke: '#993C1D', titleColour: '#712B13', textColour: '#993C1D' },
	step: { fill: '#FFFFFF', stroke: '#888780', titleColour: '#2C2C2A', textColour: '#5F5E5A' },
	variantStep: { fill: '#FFFFFF', stroke: '#B4B2A9', titleColour: '#2C2C2A', textColour: '#5F5E5A', dashed: true },
	cedsElement: { fill: '#E1F5EE', stroke: '#0F6E56', titleColour: '#04342C', textColour: '#0F6E56' },
	otherElement: { fill: '#E6F1FB', stroke: '#185FA5', titleColour: '#042C53', textColour: '#185FA5' },
	gap: { fill: '#FAEEDA', stroke: '#BA7517', titleColour: '#633806', textColour: '#854F0B', dashed: true },
	unresolved: { fill: '#F5F5F3', stroke: '#888780', titleColour: '#2C2C2A', textColour: '#5F5E5A', dashed: true },
	wholeStandard: { fill: '#EEEDFE', stroke: '#7F77DD', titleColour: '#26215C', textColour: '#534AB7' },
	corpus: { fill: '#F1EFE8', stroke: '#888780', titleColour: '#2C2C2A', textColour: '#5F5E5A' },
	footer: { fill: '#F1EFE8', stroke: '#888780', titleColour: '#2C2C2A', textColour: '#444441' },
});

const lineStyleByKind = Object.freeze({
	performs: { stroke: '#993C1D', markerId: 'm-actor' },
	sequence: { stroke: '#5F5E5A', markerId: 'm-dark' },
	writes: { stroke: '#D85A30', markerId: 'm-write' },
	reads: { stroke: '#888780', markerId: 'm-read' },
	context: { stroke: '#5F5E5A', markerId: 'm-dark' },
});

// the legend, in the order it is read
const legendEntryList = Object.freeze([
	{ boxKind: 'useCase', label: 'use case' },
	{ boxKind: 'actor', label: 'actor' },
	{ boxKind: 'step', label: 'step (user story)' },
	{ boxKind: 'variantStep', label: 'extension / exception' },
	{ boxKind: 'cedsElement', label: 'CEDS element' },
	{ boxKind: 'otherElement', label: 'other standard' },
	{ boxKind: 'gap', label: 'standards gap' },
	{ boxKind: 'unresolved', label: 'not in the graph' },
	{ lineKind: 'writes', label: 'writes' },
	{ lineKind: 'reads', label: 'reads' },
	{ lineKind: 'reads', dashed: true, label: 'through a part' },
]);

// ================================================================================
// TEXT — escaped, and fitted to a width by characters (a font-free estimate, generous enough not to overrun)

const escapeXml = (rawText) =>
	String(rawText === undefined || rawText === null ? '' : rawText)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');

const maxCharCountOf = (pixelWidth, fontSize) => Math.max(4, Math.floor(pixelWidth / (CHAR_WIDTH_BY_FONT_SIZE[fontSize] || fontSize * 0.55)));

const fitText = (rawText, pixelWidth, fontSize) => {
	const plainText = String(rawText || '').replace(/\s+/g, ' ').trim();
	const maxCharCount = maxCharCountOf(pixelWidth, fontSize);
	return plainText.length <= maxCharCount ? plainText : `${plainText.slice(0, maxCharCount - 1).trimEnd()}…`;
};

// words into at most lineLimit lines of the width; the last line ends '…' when words are left over
const wrapText = (rawText, pixelWidth, fontSize, lineLimit) => {
	const maxCharCount = maxCharCountOf(pixelWidth, fontSize);
	const wordList = String(rawText || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
	const lineList = [];
	let currentLine = '';
	wordList.forEach((oneWord) => {
		const candidateLine = currentLine ? `${currentLine} ${oneWord}` : oneWord;
		if (candidateLine.length <= maxCharCount) {
			currentLine = candidateLine;
			return;
		}
		if (currentLine) lineList.push(currentLine);
		currentLine = oneWord;
	});
	if (currentLine) lineList.push(currentLine);
	if (lineList.length <= lineLimit) return lineList.map((oneLine) => fitText(oneLine, pixelWidth, fontSize));
	const keptLineList = lineList.slice(0, lineLimit);
	keptLineList[lineLimit - 1] = fitText(`${keptLineList[lineLimit - 1]} ${lineList.slice(lineLimit).join(' ')}`, pixelWidth, fontSize);
	return keptLineList;
};

// ================================================================================
// SVG PIECES

const textElementOf = ({ x, y, text, fontSize = 12, fontWeight, colour, anchor = 'middle' }) =>
	`<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${fontSize}"${fontWeight ? ` font-weight="${fontWeight}"` : ''} fill="${colour}">${escapeXml(text)}</text>`;

// a box with a title and an optional subtitle, centred; answers its SVG and where lines attach
const boxOf = ({ x, y, width, height, boxKind, title, subtitle, titleLineLimit = 1 }) => {
	const boxStyle = boxStyleByKind[boxKind];
	const titleLineList = wrapText(title, width - 16, 14, titleLineLimit);
	const lineHeight = 17;
	const contentHeight = titleLineList.length * lineHeight + (subtitle ? 16 : 0);
	const firstBaseline = y + (height - contentHeight) / 2 + 13;
	const partList = [
		`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="${boxStyle.fill}" stroke="${boxStyle.stroke}" stroke-width="${boxStyle.dashed ? 1 : 0.75}"${boxStyle.dashed ? ' stroke-dasharray="4 3"' : ''}/>`,
		...titleLineList.map((oneLine, lineIndex) => textElementOf({ x: x + width / 2, y: firstBaseline + lineIndex * lineHeight, text: oneLine, fontSize: 14, fontWeight: 600, colour: boxStyle.titleColour })),
	];
	if (subtitle) partList.push(textElementOf({ x: x + width / 2, y: firstBaseline + titleLineList.length * lineHeight + 1, text: fitText(subtitle, width - 16, 12), fontSize: 12, colour: boxStyle.textColour }));
	return { svgText: partList.join('\n'), leftX: x, rightX: x + width, centreY: y + height / 2, topY: y, bottomY: y + height, centreX: x + width / 2 };
};

const lineOf = ({ x1, y1, x2, y2, lineKind, dashed = false, width = 1 }) => {
	const lineStyle = lineStyleByKind[lineKind];
	return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${lineStyle.stroke}" stroke-width="${width}"${dashed ? ' stroke-dasharray="5 4"' : ''} marker-end="url(#${lineStyle.markerId})"/>`;
};

// an elbow (right, down or up, right) for a line that must clear the column it starts in
const elbowOf = ({ x1, y1, x2, y2, bendX, lineKind, dashed = false }) => {
	const lineStyle = lineStyleByKind[lineKind];
	return `<path d="M${x1} ${y1} H${bendX} V${y2} H${x2}" fill="none" stroke="${lineStyle.stroke}" stroke-width="1"${dashed ? ' stroke-dasharray="5 4"' : ''} marker-end="url(#${lineStyle.markerId})"/>`;
};

const markerDefinitionText = Object.entries({ 'm-dark': '#5F5E5A', 'm-read': '#888780', 'm-write': '#D85A30', 'm-actor': '#993C1D' })
	.map(([markerId, colour]) => `<marker id="${markerId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="${colour}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>`)
	.join('\n  ');

// ================================================================================
// WHAT THE DIAGRAM SHOWS — the rows, shaped into steps, actors, data and links

const isVariantStep = (oneStep) => Boolean(oneStep.stepKind) && oneStep.stepKind !== 'main';

// a data box's kind and wording, from the citation row (the mapper's citationState) or, for data no reference stands for,
// from what the step names
const dataBoxOf = (citationRow, namedDataName) => {
	if (!citationRow) return { boxKind: 'corpus', title: namedDataName || 'unnamed data', subtitle: 'data the step names' };
	const identifierText = [citationRow.citedStandard, citationRow.citedIdentifier].filter(Boolean).join(' ');
	const subtitleByState = {
		resolved: [citationRow.citedSource || citationRow.citedStandard, citationRow.citedIdentifier].filter(Boolean).join(' '),
		gap: `${citationRow.citedStandard ? `${citationRow.citedStandard} · ` : ''}standards gap`,
		unresolved: `${identifierText || 'element'} · not in the graph`,
		wholeStandard: `${citationRow.citedStandard || 'standard'} · whole standard`,
		documentAnchored: `${citationRow.citedStandard || 'standard'} · published document`,
		corpus: `${citationRow.referenceKind || 'data'} · defined by the use cases`,
	};
	const boxKindByState = { resolved: /^CEDS/i.test(citationRow.citedSource || citationRow.citedStandard || '') ? 'cedsElement' : 'otherElement', gap: 'gap', unresolved: 'unresolved', wholeStandard: 'wholeStandard', documentAnchored: 'wholeStandard', corpus: 'corpus' };
	return {
		boxKind: boxKindByState[citationRow.citationState] || 'unresolved',
		title: citationRow.citedName || citationRow.referenceName || 'unnamed reference',
		subtitle: subtitleByState[citationRow.citationState] || citationRow.citationStateLabel || '',
	};
};

const shapeDiagramContent = ({ useCase, stepList, citationList, stepDataLinkList }) => {
	const citationByReferenceStableId = Object.fromEntries((citationList || []).map((oneCitation) => [oneCitation.referenceStableId, oneCitation]));
	const orderedStepList = (stepList || []).map((oneStep, stepIndex) => ({ ...oneStep, stepIndex }));
	const stepIndexByCodedNotation = Object.fromEntries(orderedStepList.map((oneStep) => [oneStep.codedNotation, oneStep.stepIndex]));

	// one data box per reference (or per named data that is no reference), keyed so a box is drawn once
	const dataByKey = {};
	const linkList = [];
	(stepDataLinkList || []).forEach((linkRow) => {
		const stepIndex = stepIndexByCodedNotation[linkRow.codedNotation];
		if (stepIndex === undefined) return;
		const dataKey = linkRow.referenceStableId || `named:${linkRow.namedDataStableId}`;
		if (!dataByKey[dataKey]) dataByKey[dataKey] = { dataKey, firstStepIndex: stepIndex, ...dataBoxOf(linkRow.referenceStableId ? citationByReferenceStableId[linkRow.referenceStableId] : null, linkRow.namedDataName) };
		dataByKey[dataKey].firstStepIndex = Math.min(dataByKey[dataKey].firstStepIndex, stepIndex);
		const isPart = linkRow.partHopCount > 0;
		// one line per step, data and edge type; a direct naming wins over the same data reached through a part
		const existingLink = linkList.find((oneLink) => oneLink.stepIndex === stepIndex && oneLink.dataKey === dataKey && oneLink.dataEdgeType === linkRow.dataEdgeType);
		if (existingLink) {
			existingLink.isPart = existingLink.isPart && isPart;
			return;
		}
		linkList.push({ stepIndex, dataKey, dataEdgeType: linkRow.dataEdgeType, isPart, viaName: isPart ? linkRow.namedDataName : '' });
	});
	// the data column in the order steps first reach it, so lines cross as little as they can
	const stepDataList = Object.values(dataByKey).sort((left, right) => left.firstStepIndex - right.firstStepIndex || left.title.localeCompare(right.title));
	// the case's data no step names: required by the case as a whole
	const linkedReferenceStableIdSet = new Set(Object.keys(dataByKey));
	const caseOnlyDataList = (citationList || []).filter((oneCitation) => !linkedReferenceStableIdSet.has(oneCitation.referenceStableId)).map((oneCitation) => ({ dataKey: oneCitation.referenceStableId, ...dataBoxOf(oneCitation) }));

	// actors in the order they first act; the primary actor is marked
	const actorList = [];
	orderedStepList.forEach((oneStep) => {
		if (!oneStep.actorName || actorList.some((oneActor) => oneActor.actorName === oneStep.actorName)) return;
		actorList.push({ actorName: oneStep.actorName, firstStepIndex: oneStep.stepIndex, isPrimary: oneStep.actorName === (useCase || {}).primaryActorName });
	});

	return { orderedStepList, stepDataList, caseOnlyDataList, linkList, actorList };
};

// ================================================================================
// THE DRAWING

const renderUseCaseDiagram = ({ useCase, contextBySection = {}, stepList = [], citationList = [], stepDataLinkList = [] }) => {
	if (!useCase || !useCase.caseStableId) throw new Error('render-use-case-diagram: a useCase with its caseStableId is required');
	const contextOf = (sectionName) => contextBySection[sectionName] || [];
	const { orderedStepList, stepDataList, caseOnlyDataList, linkList, actorList } = shapeDiagramContent({ useCase, stepList, citationList, stepDataLinkList });
	const partList = [];

	// ---- header: the case
	const caseColumn = columnByName.caseBox;
	const caseTitleLineList = wrapText(useCase.longName || useCase.shortName || useCase.caseStableId, caseColumn.width - 36, 15, 2);
	const guaranteeTextOf = (edgeRole) => contextOf('guarantee').filter((oneGuarantee) => (oneGuarantee.edgeRole || '').toLowerCase() === edgeRole).map((oneGuarantee) => oneGuarantee.targetName).join('; ');
	const otherGuaranteeText = contextOf('guarantee').filter((oneGuarantee) => !['success', 'minimal'].includes((oneGuarantee.edgeRole || '').toLowerCase())).map((oneGuarantee) => oneGuarantee.targetName).join('; ');
	const factList = [
		['Scope', useCase.scope],
		['Level', [useCase.level, useCase.frequency ? `Frequency: ${useCase.frequency}` : ''].filter(Boolean).join(' · ')],
		['Primary actor', useCase.primaryActorName],
		['Starts when', contextOf('trigger').map((oneTrigger) => oneTrigger.targetName).join('; ')],
		['Assumes', contextOf('precondition').map((oneCondition) => oneCondition.targetName).join('; ')],
		['Success', guaranteeTextOf('success')],
		['Minimal guarantee', guaranteeTextOf('minimal')],
		['Guarantees', otherGuaranteeText],
	].filter(([, factText]) => factText);
	const caseBoxHeight = 30 + caseTitleLineList.length * 19 + 22 + factList.length * 18 + 8;
	const caseTop = 20;
	const caseStyle = boxStyleByKind.useCase;
	partList.push('<!-- the use case -->');
	partList.push(`<rect x="${caseColumn.x}" y="${caseTop}" width="${caseColumn.width}" height="${caseBoxHeight}" rx="8" fill="${caseStyle.fill}" stroke="${caseStyle.stroke}" stroke-width="0.75"/>`);
	caseTitleLineList.forEach((oneLine, lineIndex) => partList.push(textElementOf({ x: caseColumn.x + caseColumn.width / 2, y: caseTop + 24 + lineIndex * 19, text: oneLine, fontSize: 15, fontWeight: 600, colour: caseStyle.titleColour })));
	const identityText = [`use case ${useCase.caseStableId}`, [useCase.standardName, useCase.releaseVersion].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
	partList.push(textElementOf({ x: caseColumn.x + caseColumn.width / 2, y: caseTop + 24 + caseTitleLineList.length * 19, text: fitText(identityText, caseColumn.width - 36, 12), fontSize: 12, colour: '#534AB7' }));
	factList.forEach(([factName, factText], factIndex) => {
		const baseline = caseTop + 30 + caseTitleLineList.length * 19 + 22 + factIndex * 18;
		const valueText = fitText(factText, caseColumn.width - 36 - (factName.length + 2) * 6.6, 12);
		partList.push(`<text x="${caseColumn.x + 18}" y="${baseline}" font-size="12" fill="${caseStyle.textColour}"><tspan font-weight="600">${escapeXml(factName)}:</tspan> ${escapeXml(valueText)}</text>`);
	});
	const caseBottom = caseTop + caseBoxHeight;

	// ---- header: what it serves and is about (left), who has a stake and the cases it relates to (right)
	const contextColumn = columnByName.context;
	const contextEntryList = [
		...contextOf('valueDriver').map((oneDriver) => ({ title: oneDriver.targetName, subtitle: 'value driver (ALIGNS_WITH)' })),
		...contextOf('subject').filter((oneSubject) => oneSubject.targetName).slice(0, 3).map((oneSubject) => ({ title: oneSubject.targetName, subtitle: 'subject (HAS_SUBJECT)' })),
	].slice(0, 4);
	partList.push('<!-- what the case serves and is about -->');
	contextEntryList.forEach((oneEntry, entryIndex) => {
		const contextBox = boxOf({ x: contextColumn.x, y: caseTop + entryIndex * (CONTEXT_BOX_HEIGHT + CONTEXT_BOX_GAP), width: contextColumn.width, height: CONTEXT_BOX_HEIGHT, boxKind: 'context', title: oneEntry.title, subtitle: oneEntry.subtitle });
		partList.push(contextBox.svgText);
		partList.push(lineOf({ x1: caseColumn.x, y1: contextBox.centreY, x2: contextBox.rightX + 4, y2: contextBox.centreY, lineKind: 'context' }));
	});
	const partyColumn = columnByName.party;
	const partyEntryList = [
		...contextOf('interestedParty').map((oneParty) => ({ boxKind: 'party', title: oneParty.targetName, subtitle: [oneParty.partyKind, oneParty.interest].filter(Boolean).join(' · ') || 'interested party' })),
		...contextOf('relatedCase').map((oneRelated) => ({ boxKind: 'relatedCase', title: oneRelated.targetShortName || oneRelated.targetName, subtitle: `related case (${oneRelated.edgeType})` })),
	].slice(0, 4);
	partList.push('<!-- who has a stake, and the cases it relates to -->');
	partyEntryList.forEach((oneEntry, entryIndex) => {
		const partyBox = boxOf({ x: partyColumn.x, y: caseTop + entryIndex * (CONTEXT_BOX_HEIGHT + CONTEXT_BOX_GAP), width: partyColumn.width, height: CONTEXT_BOX_HEIGHT, boxKind: oneEntry.boxKind, title: oneEntry.title, subtitle: oneEntry.subtitle });
		partList.push(partyBox.svgText);
		partList.push(lineOf({ x1: caseColumn.x + caseColumn.width, y1: partyBox.centreY, x2: partyBox.leftX - 4, y2: partyBox.centreY, lineKind: 'context' }));
	});
	const headerBottom = Math.max(caseBottom, caseTop + contextEntryList.length * (CONTEXT_BOX_HEIGHT + CONTEXT_BOX_GAP), caseTop + partyEntryList.length * (CONTEXT_BOX_HEIGHT + CONTEXT_BOX_GAP));

	// ---- body: column heads
	const bodyTop = headerBottom + 56;
	partList.push('<!-- column heads -->');
	[['actor', 'Actors (PERFORMED_BY)'], ['step', 'Steps, in reading order'], ['data', 'Data used (CONSUMES / PRODUCES)']].forEach(([columnName, headText]) =>
		partList.push(textElementOf({ x: columnByName[columnName].x, y: bodyTop - 14, text: headText, fontSize: 12, fontWeight: 600, colour: '#444441', anchor: 'start' })),
	);

	// ---- body: steps
	const stepColumn = columnByName.step;
	const stepBoxList = orderedStepList.map((oneStep, stepIndex) => {
		const indentX = isVariantStep(oneStep) ? VARIANT_STEP_INDENT : 0;
		return boxOf({
			x: stepColumn.x + indentX,
			y: bodyTop + stepIndex * (STEP_HEIGHT + STEP_GAP),
			width: stepColumn.width - indentX,
			height: STEP_HEIGHT,
			boxKind: isVariantStep(oneStep) ? 'variantStep' : 'step',
			title: `${oneStep.codedNotation || stepIndex + 1} · ${oneStep.action || 'unnamed step'}`,
			subtitle: [isVariantStep(oneStep) ? oneStep.stepKind : '', oneStep.intention || oneStep.benefit].filter(Boolean).join(' · '),
		});
	});

	// ---- body: actors, each beside the first step it performs (pushed down when that would overlap the one above)
	const actorColumn = columnByName.actor;
	let nextFreeActorY = bodyTop;
	const actorBoxByName = {};
	actorList.forEach((oneActor) => {
		const wantedY = stepBoxList[oneActor.firstStepIndex].centreY - ACTOR_HEIGHT / 2;
		const actorY = Math.max(wantedY, nextFreeActorY);
		nextFreeActorY = actorY + ACTOR_HEIGHT + ACTOR_GAP;
		actorBoxByName[oneActor.actorName] = boxOf({ x: actorColumn.x, y: actorY, width: actorColumn.width, height: ACTOR_HEIGHT, boxKind: 'actor', title: oneActor.actorName, subtitle: oneActor.isPrimary ? 'primary actor' : 'actor' });
	});

	// ---- body: data, in the order steps first reach it
	const dataColumn = columnByName.data;
	const dataBoxByKey = {};
	stepDataList.forEach((oneData, dataIndex) => {
		dataBoxByKey[oneData.dataKey] = boxOf({ x: dataColumn.x, y: bodyTop + dataIndex * (DATA_HEIGHT + DATA_GAP), width: dataColumn.width, height: DATA_HEIGHT, boxKind: oneData.boxKind, title: oneData.title, subtitle: oneData.subtitle });
	});

	// lines first, so boxes sit on top of them
	partList.push('<!-- who performs each step -->');
	orderedStepList.forEach((oneStep, stepIndex) => {
		const actorBox = actorBoxByName[oneStep.actorName];
		if (!actorBox) return;
		const stepBox = stepBoxList[stepIndex];
		if (Math.abs(actorBox.centreY - stepBox.centreY) < 1) {
			partList.push(lineOf({ x1: actorBox.rightX, y1: actorBox.centreY, x2: stepBox.leftX - 4, y2: stepBox.centreY, lineKind: 'performs', dashed: isVariantStep(oneStep) }));
			return;
		}
		partList.push(elbowOf({ x1: actorBox.rightX, y1: actorBox.centreY, x2: stepBox.leftX - 4, y2: stepBox.centreY, bendX: actorBox.rightX + 22 + (stepIndex % 3) * 8, lineKind: 'performs', dashed: isVariantStep(oneStep) }));
	});
	partList.push('<!-- the order of the main steps -->');
	let previousMainStepBox = null;
	orderedStepList.forEach((oneStep, stepIndex) => {
		if (isVariantStep(oneStep)) return;
		const stepBox = stepBoxList[stepIndex];
		if (previousMainStepBox) partList.push(lineOf({ x1: previousMainStepBox.leftX + 16, y1: previousMainStepBox.bottomY, x2: stepBox.leftX + 16, y2: stepBox.topY - 3, lineKind: 'sequence' }));
		previousMainStepBox = stepBox;
	});
	partList.push('<!-- the data each step reads or writes -->');
	linkList.forEach((oneLink) => {
		const stepBox = stepBoxList[oneLink.stepIndex];
		const dataBox = dataBoxByKey[oneLink.dataKey];
		if (!stepBox || !dataBox) return;
		partList.push(lineOf({ x1: stepBox.rightX, y1: stepBox.centreY, x2: dataBox.leftX - 4, y2: dataBox.centreY, lineKind: oneLink.dataEdgeType === 'PRODUCES' ? 'writes' : 'reads', dashed: oneLink.isPart }));
	});
	partList.push('<!-- boxes -->');
	stepBoxList.forEach((oneBox) => partList.push(oneBox.svgText));
	Object.values(actorBoxByName).forEach((oneBox) => partList.push(oneBox.svgText));
	Object.values(dataBoxByKey).forEach((oneBox) => partList.push(oneBox.svgText));
	if (!orderedStepList.length) partList.push(textElementOf({ x: stepColumn.x, y: bodyTop + 20, text: 'The graph holds no steps for this case.', fontSize: 13, colour: '#5F5E5A', anchor: 'start' }));

	const bodyBottom = Math.max(
		bodyTop + 10,
		...stepBoxList.map((oneBox) => oneBox.bottomY),
		...Object.values(actorBoxByName).map((oneBox) => oneBox.bottomY),
		...Object.values(dataBoxByKey).map((oneBox) => oneBox.bottomY),
	);

	// ---- footer: the case's data no step names, then the legend
	let footerTop = bodyBottom + 30;
	if (caseOnlyDataList.length) {
		partList.push('<!-- data the case requires as a whole -->');
		partList.push(textElementOf({ x: MARGIN, y: footerTop, text: 'Data the case requires as a whole (no single step names it)', fontSize: 12, fontWeight: 600, colour: '#444441', anchor: 'start' }));
		const chipWidth = (CANVAS_WIDTH - 2 * MARGIN - 3 * 12) / 4;
		caseOnlyDataList.forEach((oneData, dataIndex) => {
			const chipBox = boxOf({ x: MARGIN + (dataIndex % 4) * (chipWidth + 12), y: footerTop + 12 + Math.floor(dataIndex / 4) * (DATA_HEIGHT + 10), width: chipWidth, height: DATA_HEIGHT, boxKind: oneData.boxKind, title: oneData.title, subtitle: oneData.subtitle });
			partList.push(chipBox.svgText);
		});
		footerTop += 12 + Math.ceil(caseOnlyDataList.length / 4) * (DATA_HEIGHT + 10) + 20;
	}
	partList.push('<!-- legend -->');
	let legendX = MARGIN;
	let legendY = footerTop + 10;
	legendEntryList.forEach((oneEntry) => {
		// an entry that would run past the right edge starts a new row
		const entryWidth = 26 + oneEntry.label.length * 6 + 18;
		if (legendX + entryWidth - 18 > CANVAS_WIDTH - MARGIN) {
			legendX = MARGIN;
			legendY += 22;
		}
		if (oneEntry.boxKind) {
			const legendStyle = boxStyleByKind[oneEntry.boxKind];
			partList.push(`<rect x="${legendX}" y="${legendY - 10}" width="20" height="13" rx="3" fill="${legendStyle.fill}" stroke="${legendStyle.stroke}" stroke-width="0.75"${legendStyle.dashed ? ' stroke-dasharray="3 2"' : ''}/>`);
		} else {
			const legendLine = lineStyleByKind[oneEntry.lineKind];
			partList.push(`<line x1="${legendX}" y1="${legendY - 4}" x2="${legendX + 20}" y2="${legendY - 4}" stroke="${legendLine.stroke}" stroke-width="1.2"${oneEntry.dashed ? ' stroke-dasharray="4 3"' : ''}/>`);
		}
		partList.push(textElementOf({ x: legendX + 26, y: legendY, text: oneEntry.label, fontSize: 11, colour: '#5F5E5A', anchor: 'start' }));
		legendX += entryWidth;
	});
	const canvasHeight = Math.ceil(legendY + 20);

	// ---- the words a reader of the page gets in place of the picture
	const resolvedDataCount = stepDataList.filter((oneData) => ['cedsElement', 'otherElement'].includes(oneData.boxKind)).length;
	const gapDataCount = [...stepDataList, ...caseOnlyDataList].filter((oneData) => oneData.boxKind === 'gap').length;
	const summary = {
		stepCount: orderedStepList.length,
		actorCount: actorList.length,
		stepDataCount: stepDataList.length,
		caseOnlyDataCount: caseOnlyDataList.length,
		linkCount: linkList.length,
		resolvedDataCount,
		gapDataCount,
		summaryText: `${orderedStepList.length} steps performed by ${actorList.length} actors; the steps read or write ${stepDataList.length} data items (${resolvedDataCount} cite an element in a standard${gapDataCount ? `, ${gapDataCount} a standards gap` : ''}) over ${linkList.length} links${caseOnlyDataList.length ? `; ${caseOnlyDataList.length} more the case requires as a whole` : ''}.`,
	};
	const titleText = `Use case: ${useCase.longName || useCase.shortName || useCase.caseStableId}`;
	const svgText = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${canvasHeight}" viewBox="0 0 ${CANVAS_WIDTH} ${canvasHeight}" font-family="${FONT_FAMILY}" role="img" aria-labelledby="uc-diagram-title uc-diagram-desc">`,
		`<title id="uc-diagram-title">${escapeXml(titleText)}</title>`,
		`<desc id="uc-diagram-desc">${escapeXml(`Generated from the EDUcore graph. ${summary.summaryText}`)}</desc>`,
		`<defs>\n  ${markerDefinitionText}\n</defs>`,
		`<rect x="0" y="0" width="${CANVAS_WIDTH}" height="${canvasHeight}" fill="#FFFFFF"/>`,
		...partList,
		'</svg>',
	].join('\n');
	return { svgText, width: CANVAS_WIDTH, height: canvasHeight, summary };
};

module.exports = { renderUseCaseDiagram, escapeXml, wrapText, fitText, shapeDiagramContent, boxStyleByKind };
