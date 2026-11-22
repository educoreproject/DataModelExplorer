'use strict';
// @concept: [[DataModelExplorer]]
// render-data-model-diagram — draws a standard's DATA MODEL as an SVG, from what the graph holds about it (BD 2026-11-17: the
// Standards Explorer's Diagram tab "should show a data model view, generated from the graph in the same format as the use case
// model"). Its look follows render-use-case-diagram (the same palette, boxes, legend and text fitting).
//
// Pure: no graph, no I/O. The standard-data-model access point reads the rows and hands them here. Two maps:
//
//   renderStandardDataModel({ standard, classList, linkList })
//     The whole standard: one box per class (its property count and how many of them map to a hub, as a bar), an arrow from a
//     class to each class one of its properties refers to, and a dashed arrow from a class to the class it is a subclass of.
//     Laid out in layers, a class above the classes it refers to; each layer ordered to cross as few lines as it can; classes
//     with no link to another are gathered in a last row.
//
//   renderUseCaseModel({ standard, classList, propertyList, nodeCount })
//     The use-case standard (standardKind useCaseCorpus, BD 2026-11-20): the same entity tables, one per KIND of node (UseCase,
//     UserStory, Actor ...), every kind drawn; a row per relationship (upper case, FK to the kind it reaches) and per own property.
//
//   renderClassDataModel({ focusClass, propertyList, neighbourList, highlightPropertyName })
//     One class and its neighbours: the class in the centre with its properties listed (type, the class a property refers to,
//     required, mapped to a hub); the classes it refers to (and its parent) on the right, each line leaving from the property
//     that refers; the classes that refer to it (and its subclasses) on the left.
//
// Each answers { svgText, width, height, summary }; summary.summaryText is the picture's text alternative. Every text is
// escaped; nothing from the graph is ever written into the SVG as markup.

const { escapeXml, fitText, wrapText } = require('../use-case-diagram/render-use-case-diagram');

// ================================================================================
// THE LOOK — the use case map's palette

const MARGIN = 20;
const FONT_FAMILY = 'Segoe UI, Helvetica, Arial, sans-serif';

const boxStyleByKind = Object.freeze({
	standard: { fill: '#EEEDFE', stroke: '#534AB7', titleColour: '#26215C', textColour: '#3C3489' },
	focusClass: { fill: '#EEEDFE', stroke: '#534AB7', titleColour: '#26215C', textColour: '#3C3489' },
	class: { fill: '#E6F1FB', stroke: '#185FA5', titleColour: '#042C53', textColour: '#185FA5' },
	otherStandardClass: { fill: '#F5F5F3', stroke: '#888780', titleColour: '#2C2C2A', textColour: '#5F5E5A', dashed: true },
});

const lineStyleByKind = Object.freeze({
	refers: { stroke: '#185FA5', markerId: 'm-refers' },
	subclassOf: { stroke: '#534AB7', markerId: 'm-subclass' },
});

const MAPPED_COLOUR = '#0F6E56';
const MAPPED_TRACK_COLOUR = '#E1F5EE';
const REFERENCE_TEXT_COLOUR = '#185FA5';
const PLAIN_TEXT_COLOUR = '#444441';
const MUTED_TEXT_COLOUR = '#5F5E5A';
const HIGHLIGHT_FILL = '#FAEEDA';

const legendEntryList = Object.freeze([
	{ boxKind: 'class', label: 'class' },
	{ boxKind: 'otherStandardClass', label: 'class in another standard' },
	{ lineKind: 'refers', label: 'a property refers to' },
	{ lineKind: 'subclassOf', dashed: true, label: 'subclass of' },
	{ mappedBar: true, label: 'share of properties mapped to a hub (CEDS, CTDL)' },
]);

const markerDefinitionText = [
	`<marker id="m-refers" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="${lineStyleByKind.refers.stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>`,
	`<marker id="m-subclass" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M1 1L9 5L1 9Z" fill="#FFFFFF" stroke="${lineStyleByKind.subclassOf.stroke}" stroke-width="1.2" stroke-linejoin="round"/></marker>`,
].join('\n  ');

// ================================================================================
// SVG PIECES

const textElementOf = ({ x, y, text, fontSize = 12, fontWeight, colour, anchor = 'middle', fontStyle }) =>
	`<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${fontSize}"${fontWeight ? ` font-weight="${fontWeight}"` : ''}${fontStyle ? ` font-style="${fontStyle}"` : ''} fill="${colour}">${escapeXml(text)}</text>`;

const countTextOf = (itemCount, singularText, pluralText) => `${itemCount} ${itemCount === 1 ? singularText : pluralText}`;

// "11 properties · 5 mapped"
const classFactTextOf = ({ propertyCount, mappedPropertyCount }) =>
	`${countTextOf(propertyCount || 0, 'property', 'properties')}${mappedPropertyCount ? ` · ${mappedPropertyCount} mapped` : ''}`;

// the share of a class's properties mapped to a hub, as a thin bar along the box's foot
const mappedBarOf = ({ x, y, width, propertyCount, mappedPropertyCount }) => {
	if (!propertyCount) return '';
	const mappedWidth = Math.round((width * Math.min(mappedPropertyCount || 0, propertyCount)) / propertyCount);
	return [
		`<rect x="${x}" y="${y}" width="${width}" height="4" rx="2" fill="${MAPPED_TRACK_COLOUR}"/>`,
		mappedWidth ? `<rect x="${x}" y="${y}" width="${mappedWidth}" height="4" rx="2" fill="${MAPPED_COLOUR}"/>` : '',
	].join('');
};

// a class box: its name, a line of facts, and (with counts) the mapped bar; answers its SVG and where lines attach
const classBoxOf = ({ x, y, width, height, boxKind, title, subtitle, propertyCount, mappedPropertyCount }) => {
	const boxStyle = boxStyleByKind[boxKind];
	const showsBar = Number.isFinite(propertyCount) && propertyCount > 0;
	const partList = [
		`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="${boxStyle.fill}" stroke="${boxStyle.stroke}" stroke-width="${boxStyle.dashed ? 1 : 0.75}"${boxStyle.dashed ? ' stroke-dasharray="4 3"' : ''}/>`,
		textElementOf({ x: x + width / 2, y: y + (subtitle ? 22 : height / 2 + 5), text: fitText(title, width - 16, 13), fontSize: 13, fontWeight: 600, colour: boxStyle.titleColour }),
	];
	if (subtitle) partList.push(textElementOf({ x: x + width / 2, y: y + 39, text: fitText(subtitle, width - 16, 11), fontSize: 11, colour: boxStyle.textColour }));
	if (showsBar) partList.push(mappedBarOf({ x: x + 12, y: y + height - 11, width: width - 24, propertyCount, mappedPropertyCount }));
	return { svgText: partList.join('\n'), leftX: x, rightX: x + width, topY: y, bottomY: y + height, centreX: x + width / 2, centreY: y + height / 2 };
};

const curveOf = ({ x1, y1, x2, y2, lineKind, dashed = false, width = 1, bendDirection = 'vertical', opacity = 0.75 }) => {
	const lineStyle = lineStyleByKind[lineKind];
	const controlDistance = bendDirection === 'vertical' ? Math.max(30, Math.abs(y2 - y1) / 2) : Math.max(30, Math.abs(x2 - x1) / 2);
	const pathText = bendDirection === 'vertical'
		? `M${x1} ${y1} C${x1} ${y1 + Math.sign(y2 - y1 || 1) * controlDistance}, ${x2} ${y2 - Math.sign(y2 - y1 || 1) * controlDistance}, ${x2} ${y2}`
		: `M${x1} ${y1} C${x1 + Math.sign(x2 - x1 || 1) * controlDistance} ${y1}, ${x2 - Math.sign(x2 - x1 || 1) * controlDistance} ${y2}, ${x2} ${y2}`;
	return `<path d="${pathText}" fill="none" stroke="${lineStyle.stroke}" stroke-opacity="${opacity}" stroke-width="${width}"${dashed ? ' stroke-dasharray="5 4"' : ''} marker-end="url(#${lineStyle.markerId})"/>`;
};

const legendOf = ({ canvasWidth, topY }) => {
	const partList = [];
	let legendX = MARGIN;
	let legendY = topY;
	legendEntryList.forEach((oneEntry) => {
		const entryWidth = 26 + oneEntry.label.length * 6 + 18;
		if (legendX + entryWidth - 18 > canvasWidth - MARGIN) {
			legendX = MARGIN;
			legendY += 22;
		}
		if (oneEntry.boxKind) {
			const legendStyle = boxStyleByKind[oneEntry.boxKind];
			partList.push(`<rect x="${legendX}" y="${legendY - 10}" width="20" height="13" rx="3" fill="${legendStyle.fill}" stroke="${legendStyle.stroke}" stroke-width="0.75"${legendStyle.dashed ? ' stroke-dasharray="3 2"' : ''}/>`);
		} else if (oneEntry.lineKind) {
			const legendLine = lineStyleByKind[oneEntry.lineKind];
			partList.push(`<line x1="${legendX}" y1="${legendY - 4}" x2="${legendX + 20}" y2="${legendY - 4}" stroke="${legendLine.stroke}" stroke-width="1.2"${oneEntry.dashed ? ' stroke-dasharray="4 3"' : ''}/>`);
		} else {
			partList.push(mappedBarOf({ x: legendX, y: legendY - 6, width: 20, propertyCount: 2, mappedPropertyCount: 1 }));
		}
		partList.push(textElementOf({ x: legendX + 26, y: legendY, text: oneEntry.label, fontSize: 11, colour: MUTED_TEXT_COLOUR, anchor: 'start' }));
		legendX += entryWidth;
	});
	return { svgText: partList.join('\n'), bottomY: legendY + 12 };
};

const headerOf = ({ titleText, factText, noteText }) => {
	const partList = [
		textElementOf({ x: MARGIN, y: MARGIN + 18, text: titleText, fontSize: 18, fontWeight: 600, colour: boxStyleByKind.standard.titleColour, anchor: 'start' }),
		textElementOf({ x: MARGIN, y: MARGIN + 40, text: factText, fontSize: 12, colour: MUTED_TEXT_COLOUR, anchor: 'start' }),
	];
	if (noteText) partList.push(textElementOf({ x: MARGIN, y: MARGIN + 58, text: noteText, fontSize: 12, colour: MUTED_TEXT_COLOUR, anchor: 'start', fontStyle: 'italic' }));
	return { svgText: partList.join('\n'), bottomY: MARGIN + (noteText ? 74 : 56) };
};

const svgDocumentOf = ({ width, height, titleText, summaryText, partList }) =>
	[
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT_FAMILY}" role="img" aria-labelledby="dm-diagram-title dm-diagram-desc">`,
		`<title id="dm-diagram-title">${escapeXml(titleText)}</title>`,
		`<desc id="dm-diagram-desc">${escapeXml(`Generated from the EDUcore graph. ${summaryText}`)}</desc>`,
		`<defs>\n  ${markerDefinitionText}\n</defs>`,
		`<rect x="0" y="0" width="${width}" height="${height}" fill="#FFFFFF"/>`,
		...partList,
		'</svg>',
	].join('\n');

const standardNameTextOf = (standard) => [standard.name, standard.version && standard.version !== 'unknown' ? standard.version : ''].filter(Boolean).join(' ');

// ================================================================================
// THE WHOLE STANDARD — its main entities, as tables (BD 2026-11-17: "should look more simple — CF Package, CF Document, CF Item etc.
// … just the big picture pieces", drawn like an entity-relationship diagram)
//
// WHICH CLASSES ARE THE BIG PICTURE, read from the graph alone:
//   - a SUPPORTING type is left out of the boxes: a class with no properties (an extension point), or a small class (at most
//     SUPPORTING_PROPERTY_LIMIT properties) that several classes refer to (a link or value type, such as CASE's LinkURIDType); a
//     property that refers to one shows it as its type instead
//   - an ENVELOPE is left out too: a class of one or two properties that only wrap other classes (an API answer's Set or Single)
//   - a REFERENCE TYPE named for an entity (OneRoster's OrgGUIDRef, for Org) is read as a link to that entity
//   - a standard whose trees together hold less than half its entities shows every tree, largest first
//   - the entities are what the standard's TOP class reaches through its references: the class (that no other entity refers to)
//     reaching the most entities, then any other such class that adds at least SECOND_ROOT_MIN_NEW entities (and a third of the main tree) of its own (so a
//     standard of several separate trees shows each tree, and a wrapper that only repeats the main tree adds nothing)
//   - at most ENTITY_LIMIT entities, nearest the top first; the rest are counted in the header and are all in the explorer's table
// A standard whose classes refer to nothing gets its largest classes, unlinked, so the picture still says what it holds.

const SUPPORTING_PROPERTY_LIMIT = 4;
const SUPPORTING_REFERRER_MIN = 2;
const ENVELOPE_PROPERTY_LIMIT = 2;
// 'OrgGUIDRef' → 'Org': a reference type named for the entity it points at
const REFERENCE_TYPE_NAME_PATTERN = /^(.+?)(?:GUID)?Ref(?:erence)?(?:DType)?$/;
const SECOND_ROOT_MIN_NEW = 3;
// ... and at least this share of the main tree, so a small side tree (CASE's imsx status wrapper) is no part of the big picture
const SECOND_ROOT_MIN_SHARE = 1 / 3;
const ENTITY_LIMIT = 14;
const UNLINKED_ENTITY_LIMIT = 12;

const ENTITY_WIDTH = 290;
const ENTITY_GAP = 30;
const ENTITY_HEADER_HEIGHT = 34;
const ENTITY_ROW_HEIGHT = 24;
const ENTITY_ROW_LIMIT = 7;
const ENTITIES_PER_ROW = 6;
const LAYER_GAP = 118;
const entityColumnList = Object.freeze([
	{ columnName: 'type', width: 96 },
	{ columnName: 'name', width: 112 },
	{ columnName: 'key', width: 30 },
	{ columnName: 'note', width: 52 },
]);
// one soft colour per entity, in turn (the reference drawing's palette)
const entityPaletteList = Object.freeze([
	{ stroke: '#D96FD9', fill: '#FDF0FD' },
	{ stroke: '#2FB7A4', fill: '#ECFAF7' },
	{ stroke: '#EE9A3E', fill: '#FEF5EA' },
	{ stroke: '#9B7FF2', fill: '#F4F1FE' },
	{ stroke: '#2BAFE6', fill: '#EAF8FE' },
	{ stroke: '#3CC870', fill: '#EDFBF2' },
	{ stroke: '#EE6A6A', fill: '#FDF1F1' },
]);
const CONNECTOR_COLOUR = '#2C2C2A';
const IDENTIFIER_NAME_PATTERN = /^(identifier|id|sourcedId|uuid)$/i;

// a class's name for reading: an IMS binding's 'DType' ending is the schema's, not the thing's ('CFPackageDType' → 'CFPackage')
const displayClassNameOf = (className) => String(className || '').replace(/(?<=.)DType$/, '');

// which classes are entities, and the tree (each entity's parent, the link that reached it) they are laid out by
// keepEveryClass (the use-case model): every class is an entity, none is read as a supporting type, an envelope or a reference type
const chooseEntities = ({ classList, propertyList, keepEveryClass = false }) => {
	const classByStableId = Object.fromEntries(classList.map((oneClass) => [oneClass.stableId, oneClass]));
	const propertyListByClassStableId = {};
	propertyList.forEach((oneProperty) => (propertyListByClassStableId[oneProperty.classStableId] ||= []).push(oneProperty));
	const propertyCountOf = (stableId) => (propertyListByClassStableId[stableId] || []).length;
	// an ENVELOPE only wraps other classes for an API answer (CASE's CFDocumentSet, OneRoster's UserSet and SingleUser): one or two
	// properties, every one of them a reference
	const isEnvelope = (stableId) => propertyCountOf(stableId) > 0 && propertyCountOf(stableId) <= ENVELOPE_PROPERTY_LIMIT && propertyListByClassStableId[stableId].every((oneProperty) => oneProperty.referencedClassStableId);
	// who refers to a class, envelopes aside (an envelope wrapping a class does not make it a supporting type)
	const referrerSetByStableId = {};
	propertyList.forEach((oneProperty) => {
		if (oneProperty.referencedClassStableId && classByStableId[oneProperty.referencedClassStableId] && oneProperty.referencedClassStableId !== oneProperty.classStableId && !isEnvelope(oneProperty.classStableId)) (referrerSetByStableId[oneProperty.referencedClassStableId] ||= new Set()).add(oneProperty.classStableId);
	});
	const isSupporting = (stableId) => !keepEveryClass && (propertyCountOf(stableId) === 0 || (propertyCountOf(stableId) <= SUPPORTING_PROPERTY_LIMIT && (referrerSetByStableId[stableId] || new Set()).size >= SUPPORTING_REFERRER_MIN));
	const baseCandidateList = classList.map((oneClass) => oneClass.stableId).filter((stableId) => keepEveryClass || (!isSupporting(stableId) && !isEnvelope(stableId)));

	// a REFERENCE TYPE stands for the entity it is named after (OneRoster's OrgGUIDRef for Org): it is no entity of its own, and a
	// property holding one is a link to that entity (still showing the reference type as its type)
	const baseCandidateByName = Object.fromEntries(baseCandidateList.map((stableId) => [classByStableId[stableId].name, stableId]));
	const namedEntityOf = (stableId) => {
		if (keepEveryClass) return null;
		const nameMatch = String(classByStableId[stableId]?.name || '').match(REFERENCE_TYPE_NAME_PATTERN);
		const entityStableId = nameMatch && baseCandidateByName[nameMatch[1]];
		return entityStableId && entityStableId !== stableId ? entityStableId : null;
	};
	const candidateStableIdList = baseCandidateList.filter((stableId) => !namedEntityOf(stableId));
	const candidateSet = new Set(candidateStableIdList);
	const candidateByName = Object.fromEntries(candidateStableIdList.map((stableId) => [classByStableId[stableId].name, stableId]));
	const referredEntityOf = (referencedStableId) => {
		if (keepEveryClass || !referencedStableId || candidateSet.has(referencedStableId) || !classByStableId[referencedStableId]) return referencedStableId;
		const nameMatch = String(classByStableId[referencedStableId].name).match(REFERENCE_TYPE_NAME_PATTERN);
		return (nameMatch && candidateByName[nameMatch[1]]) || referencedStableId;
	};
	const linkPropertyList = propertyList.map((oneProperty) => {
		const entityStableId = referredEntityOf(oneProperty.referencedClassStableId);
		return entityStableId === oneProperty.referencedClassStableId ? oneProperty : { ...oneProperty, referencedClassStableId: entityStableId, throughReferenceType: true };
	});
	Object.keys(propertyListByClassStableId).forEach((stableId) => {
		propertyListByClassStableId[stableId] = linkPropertyList.filter((oneProperty) => oneProperty.classStableId === stableId);
	});

	// the links between candidates, in the order each class lists its properties
	const childLinkListByStableId = {};
	linkPropertyList.forEach((oneProperty) => {
		const toStableId = oneProperty.referencedClassStableId;
		if (!candidateSet.has(oneProperty.classStableId) || !candidateSet.has(toStableId) || toStableId === oneProperty.classStableId) return;
		(childLinkListByStableId[oneProperty.classStableId] ||= []).push(oneProperty);
	});
	const reachOf = (rootStableId) => {
		const seenSet = new Set([rootStableId]);
		const queueList = [rootStableId];
		while (queueList.length) (childLinkListByStableId[queueList.shift()] || []).forEach((oneLink) => {
			if (seenSet.has(oneLink.referencedClassStableId)) return;
			seenSet.add(oneLink.referencedClassStableId);
			queueList.push(oneLink.referencedClassStableId);
		});
		return seenSet;
	};
	const referredCandidateSet = new Set(Object.values(childLinkListByStableId).flat().map((oneLink) => oneLink.referencedClassStableId));
	const rootCandidateList = candidateStableIdList
		.filter((stableId) => !referredCandidateSet.has(stableId))
		.map((stableId) => ({ stableId, reachSet: reachOf(stableId) }))
		.sort((left, right) => right.reachSet.size - left.reachSet.size || propertyCountOf(right.stableId) - propertyCountOf(left.stableId));

	const chosenRootList = [];
	const coveredSet = new Set();
	rootCandidateList.forEach((oneRoot) => {
		const newCount = [...oneRoot.reachSet].filter((stableId) => !coveredSet.has(stableId)).length;
		if (oneRoot.reachSet.size < 2 || (chosenRootList.length && newCount < Math.max(SECOND_ROOT_MIN_NEW, rootCandidateList[0].reachSet.size * SECOND_ROOT_MIN_SHARE))) return;
		chosenRootList.push(oneRoot.stableId);
		oneRoot.reachSet.forEach((stableId) => coveredSet.add(stableId));
	});
	// a standard of many small trees (its trees together hold less than half its entities) shows every tree, the largest first
	if (coveredSet.size * 2 < candidateStableIdList.length) rootCandidateList.forEach((oneRoot) => {
		if (!chosenRootList.includes(oneRoot.stableId)) chosenRootList.push(oneRoot.stableId);
	});

	// breadth first from the roots: an entity's tree parent is the first entity that reached it
	const entityList = [];
	const entityIndexByStableId = {};
	const queueList = chosenRootList.map((stableId) => ({ stableId, parentStableId: null, depth: 0, viaProperty: null }));
	while (queueList.length && entityList.length < ENTITY_LIMIT) {
		const oneEntry = queueList.shift();
		if (entityIndexByStableId[oneEntry.stableId] !== undefined) continue;
		entityIndexByStableId[oneEntry.stableId] = entityList.length;
		entityList.push(oneEntry);
		(childLinkListByStableId[oneEntry.stableId] || []).forEach((oneLink) => queueList.push({ stableId: oneLink.referencedClassStableId, parentStableId: oneEntry.stableId, depth: oneEntry.depth + 1, viaProperty: oneLink }));
	}
	// a standard whose entities refer to none of one another: its largest classes, on their own
	const isUnlinked = Object.keys(childLinkListByStableId).length === 0;
	if (isUnlinked) {
		entityList.length = 0;
		Object.keys(entityIndexByStableId).forEach((stableId) => delete entityIndexByStableId[stableId]);
		[...candidateStableIdList].sort((left, right) => propertyCountOf(right) - propertyCountOf(left)).slice(0, UNLINKED_ENTITY_LIMIT).forEach((stableId, entityIndex) => {
			entityIndexByStableId[stableId] = entityIndex;
			entityList.push({ stableId, parentStableId: null, depth: Math.floor(entityIndex / ENTITIES_PER_ROW), viaProperty: null });
		});
	}
	const entitySet = new Set(entityList.map((oneEntity) => oneEntity.stableId));
	// every link between two drawn entities (the tree's, and any other)
	const entityLinkList = Object.entries(childLinkListByStableId).flatMap(([fromStableId, linkList]) => (entitySet.has(fromStableId) ? linkList.filter((oneLink) => entitySet.has(oneLink.referencedClassStableId)) : []));
	return { entityList, entitySet, entityLinkList, propertyListByClassStableId, classByStableId, isSupporting, rootStableIdList: chosenRootList, isUnlinked };
};

// the rows an entity shows: its identifier, its links to drawn entities, then required, then mapped; at most rowLimit
// (a row may say it is the identifier itself, isIdentifier, where its name does not)
const entityRowListOf = ({ propertyList, entitySet, isSupporting, rowLimit = ENTITY_ROW_LIMIT }) => {
	const rankOf = (oneProperty) => {
		if (oneProperty.isIdentifier || (IDENTIFIER_NAME_PATTERN.test(oneProperty.name) && oneProperty.isRequired)) return 0;
		if (entitySet.has(oneProperty.referencedClassStableId)) return 1;
		if (oneProperty.isRequired) return 2;
		if (oneProperty.isMapped) return 3;
		return 4;
	};
	// an extension point (a property whose class has no properties) is no part of the picture
	const shownList = propertyList.filter((oneProperty) => !(oneProperty.referencedClassStableId && isSupporting(oneProperty.referencedClassStableId) && !entitySet.has(oneProperty.referencedClassStableId) && /extension/i.test(oneProperty.referencedClassName || '')));
	const sortedList = [...shownList].sort((left, right) => rankOf(left) - rankOf(right) || String(left.name).localeCompare(String(right.name)));
	let identifierMarked = false;
	const rowList = sortedList.slice(0, rowLimit).map((oneProperty) => {
		const isIdentifier = !identifierMarked && rankOf(oneProperty) === 0;
		if (isIdentifier) identifierMarked = true;
		const refersToEntity = entitySet.has(oneProperty.referencedClassStableId);
		const isList = oneProperty.dataType === 'array';
		const typeText = oneProperty.referencedClassName ? `${displayClassNameOf(oneProperty.referencedClassName)}${isList ? '[]' : ''}` : oneProperty.dataType || 'value';
		return {
			oneProperty,
			typeText,
			keyText: isIdentifier ? 'PK' : refersToEntity ? 'FK' : '',
			// a required property's name is bold, so the note says only whether it maps to a hub
			noteText: oneProperty.isMapped ? 'mapped' : '',
		};
	});
	return { rowList, hiddenCount: Math.max(0, shownList.length - rowLimit) };
};

// one entity table: a coloured header with its name, then a row per property in four columns
const entityTableOf = ({ x, y, title, rowList, hiddenCount, palette, hiddenWordList = ['more property', 'more properties'] }) => {
	const height = ENTITY_HEADER_HEIGHT + (rowList.length + (hiddenCount ? 1 : 0)) * ENTITY_ROW_HEIGHT;
	const partList = [
		`<rect x="${x}" y="${y}" width="${ENTITY_WIDTH}" height="${height}" fill="${palette.fill}" stroke="${palette.stroke}" stroke-width="1.5"/>`,
		textElementOf({ x: x + ENTITY_WIDTH / 2, y: y + 22, text: fitText(title, ENTITY_WIDTH - 16, 14), fontSize: 14, fontWeight: 600, colour: '#2C2C2A' }),
	];
	rowList.forEach((oneRow, rowIndex) => {
		const rowTop = y + ENTITY_HEADER_HEIGHT + rowIndex * ENTITY_ROW_HEIGHT;
		partList.push(`<line x1="${x}" y1="${rowTop}" x2="${x + ENTITY_WIDTH}" y2="${rowTop}" stroke="${palette.stroke}" stroke-width="1"/>`);
		let columnX = x;
		entityColumnList.forEach((oneColumn, columnIndex) => {
			if (columnIndex) partList.push(`<line x1="${columnX}" y1="${rowTop}" x2="${columnX}" y2="${rowTop + ENTITY_ROW_HEIGHT}" stroke="${palette.stroke}" stroke-width="1"/>`);
			const cellText = { type: oneRow.typeText, name: oneRow.oneProperty.name, key: oneRow.keyText, note: oneRow.noteText }[oneColumn.columnName];
			if (cellText) partList.push(textElementOf({ x: columnX + 7, y: rowTop + 16, text: fitText(cellText, oneColumn.width - 12, 11), fontSize: 11, fontWeight: oneColumn.columnName === 'name' && oneRow.oneProperty.isRequired ? 600 : undefined, colour: oneColumn.columnName === 'note' || oneColumn.columnName === 'type' ? MUTED_TEXT_COLOUR : PLAIN_TEXT_COLOUR, anchor: 'start' }));
			columnX += oneColumn.width;
		});
	});
	if (hiddenCount) {
		const rowTop = y + ENTITY_HEADER_HEIGHT + rowList.length * ENTITY_ROW_HEIGHT;
		partList.push(`<line x1="${x}" y1="${rowTop}" x2="${x + ENTITY_WIDTH}" y2="${rowTop}" stroke="${palette.stroke}" stroke-width="1"/>`);
		partList.push(textElementOf({ x: x + 7, y: rowTop + 16, text: `+ ${countTextOf(hiddenCount, ...hiddenWordList)}`, fontSize: 11, colour: MUTED_TEXT_COLOUR, anchor: 'start', fontStyle: 'italic' }));
	}
	return { svgText: partList.join('\n'), leftX: x, rightX: x + ENTITY_WIDTH, topY: y, bottomY: y + height, centreX: x + ENTITY_WIDTH / 2 };
};

// the ends of a link, as crow's feet: two bars at the referring end (one), and at the referred end a fork for a list (many) or a bar
// for one, with a circle when the property is optional (zero or ...)
// towardSign is +1 where the line leaves or enters downward (out of a table's foot, into its head) and -1 the other way
const barOf = ({ x, y }) => `<line x1="${x - 7}" y1="${y}" x2="${x + 7}" y2="${y}" stroke="${CONNECTOR_COLOUR}" stroke-width="1.5"/>`;
const parentEndOf = ({ x, y, towardSign = 1 }) => barOf({ x, y: y + towardSign * 6 }) + barOf({ x, y: y + towardSign * 10 });
const childEndOf = ({ x, y, isList, isRequired, towardSign = 1 }) => {
	const partList = [];
	const awayY = (distance) => y - towardSign * distance;
	if (isList) partList.push(`<path d="M${x - 8} ${y} L${x} ${awayY(12)} L${x + 8} ${y} M${x} ${y} L${x} ${awayY(12)}" fill="none" stroke="${CONNECTOR_COLOUR}" stroke-width="1.5"/>`);
	else partList.push(barOf({ x, y: awayY(7) }));
	if (isRequired) partList.push(barOf({ x, y: awayY(17) }));
	else partList.push(`<circle cx="${x}" cy="${awayY(20)}" r="4.5" fill="#FFFFFF" stroke="${CONNECTOR_COLOUR}" stroke-width="1.5"/>`);
	return partList.join('');
};

const erLegendEntryList = Object.freeze([
	{ endKind: 'one', label: 'exactly one' },
	{ endKind: 'zeroOrOne', label: 'zero or one' },
	{ endKind: 'oneOrMany', label: 'one or many' },
	{ endKind: 'zeroOrMany', label: 'zero or many' },
]);
const erLegendOf = ({ canvasWidth, topY, keyText = 'PK identifier · FK refers to another entity · bold: required · mapped: maps to a hub (CEDS, CTDL)' }) => {
	const partList = [textElementOf({ x: MARGIN, y: topY, text: keyText, fontSize: 11, colour: MUTED_TEXT_COLOUR, anchor: 'start' })];
	let legendX = MARGIN;
	const legendY = topY + 34;
	erLegendEntryList.forEach((oneEntry) => {
		const endX = legendX + 8;
		partList.push(`<line x1="${endX}" y1="${legendY - 26}" x2="${endX}" y2="${legendY}" stroke="${CONNECTOR_COLOUR}" stroke-width="1.5"/>`);
		partList.push(childEndOf({ x: endX, y: legendY, isList: /Many/i.test(oneEntry.endKind), isRequired: oneEntry.endKind === 'one' || oneEntry.endKind === 'oneOrMany' }));
		partList.push(textElementOf({ x: legendX + 22, y: legendY - 6, text: oneEntry.label, fontSize: 11, colour: MUTED_TEXT_COLOUR, anchor: 'start' }));
		legendX += 22 + oneEntry.label.length * 6 + 30;
	});
	return { svgText: partList.join('\n'), bottomY: legendY + 10 };
};

// the words and rules of a whole-standard map: a data standard's (classes and their properties), or the use-case model's (the kinds of
// node a use case is made of, and the relationships between them)
const dataStandardLook = Object.freeze({
	keepEveryClass: false,
	mergeParallelLinks: false,
	rowLimit: ENTITY_ROW_LIMIT,
	titleSuffix: 'data model',
	factTextOf: ({ entityCount, classCount, leftOutCount }) => [
		`${countTextOf(entityCount, 'main class', 'main classes')} of ${countTextOf(classCount, 'class', 'classes')}`,
		leftOutCount ? `${leftOutCount} supporting or further classes are in the explorer's table` : '',
	].filter(Boolean).join(' · '),
	linkedNoteOf: (rootNameText) => `Starting from ${rootNameText}: each line is a property of the upper class holding the lower one. Open a class in the explorer to see all its properties.`,
	unlinkedNote: 'Its classes do not refer to one another, so its largest classes are shown on their own.',
	emptyText: 'The graph holds no classes with properties for this standard.',
	summaryLeadText: 'The main classes',
	hiddenWordList: ['more property', 'more properties'],
	legendKeyText: undefined,
});

const useCaseLook = Object.freeze({
	keepEveryClass: true,
	// three relationships from UseCase to Actor are one line, 'HAS_ACTOR +2' (the busiest first); its table lists every one
	mergeParallelLinks: true,
	rowLimit: 22,
	titleSuffix: 'use case model',
	factTextOf: ({ classCount, nodeCount }) => [countTextOf(classCount, 'kind of node', 'kinds of node'), Number.isFinite(nodeCount) ? countTextOf(nodeCount, 'node', 'nodes') : ''].filter(Boolean).join(' · '),
	linkedNoteOf: (rootNameText) => `Starting from ${rootNameText}: each line is a relationship in the graph, from the upper kind of node to the lower one. A use case is not a data standard; it cites other standards' elements.`,
	unlinkedNote: 'Its kinds of node have no relationships to one another, so each is shown on its own.',
	emptyText: 'The graph holds no use cases for this standard.',
	summaryLeadText: 'The kinds of node',
	hiddenWordList: ['more row', 'more rows'],
	legendKeyText: 'PK identifier · FK a relationship to another kind of node · bold: on every node of its kind · UPPER CASE: a relationship, lower case: a property',
});

const renderStandardDataModel = (input) => renderEntityModel(input, dataStandardLook);

// the use-case model (a standard whose standardKind is useCaseCorpus): each kind of node (UseCase, UserStory, Actor ...) is a table,
// its rows its relationships and its own properties; nodeCount is how many nodes the standard holds
const renderUseCaseModel = (input) => renderEntityModel(input, useCaseLook);

// the links between one pair of entities as one link: the first one's, named for it and how many more there are; a list or required
// when any of them is
const mergedLinkListOf = (linkList) => {
	const linkGroupByPair = new Map();
	linkList.forEach((oneLink) => {
		const pairKey = `${oneLink.classStableId}|${oneLink.referencedClassStableId}`;
		if (!linkGroupByPair.has(pairKey)) linkGroupByPair.set(pairKey, []);
		linkGroupByPair.get(pairKey).push(oneLink);
	});
	return [...linkGroupByPair.values()].map((linkGroup) => ({
		...linkGroup[0],
		name: linkGroup.length > 1 ? `${linkGroup[0].name} +${linkGroup.length - 1}` : linkGroup[0].name,
		dataType: linkGroup.some((oneLink) => oneLink.dataType === 'array') ? 'array' : linkGroup[0].dataType,
		isRequired: linkGroup.some((oneLink) => oneLink.isRequired),
	}));
};

const renderEntityModel = ({ standard, classList, propertyList, nodeCount }, look) => {
	const chosen = chooseEntities({ classList: classList || [], propertyList: propertyList || [], keepEveryClass: look.keepEveryClass });
	const { entityList, entitySet, propertyListByClassStableId, classByStableId, isSupporting, rootStableIdList, isUnlinked } = chosen;
	const entityLinkList = look.mergeParallelLinks ? mergedLinkListOf(chosen.entityLinkList) : chosen.entityLinkList;

	// rows of entities: by depth from the top, a depth wider than ENTITIES_PER_ROW wrapping; within a depth, in their parents' order
	const depthCount = Math.max(0, ...entityList.map((oneEntity) => oneEntity.depth)) + 1;
	const rowList = [];
	const placedOrderByStableId = {};
	for (let depthIndex = 0; depthIndex < depthCount; depthIndex += 1) {
		const depthEntityList = entityList
			.filter((oneEntity) => oneEntity.depth === depthIndex)
			.sort((left, right) => (placedOrderByStableId[left.parentStableId] ?? 0) - (placedOrderByStableId[right.parentStableId] ?? 0));
		depthEntityList.forEach((oneEntity, orderIndex) => {
			placedOrderByStableId[oneEntity.stableId] = orderIndex;
		});
		for (let startIndex = 0; startIndex < depthEntityList.length; startIndex += ENTITIES_PER_ROW) rowList.push(depthEntityList.slice(startIndex, startIndex + ENTITIES_PER_ROW));
	}
	const widestRowCount = Math.max(1, ...rowList.map((oneRow) => oneRow.length));
	const canvasWidth = Math.max(760, 2 * MARGIN + widestRowCount * ENTITY_WIDTH + (widestRowCount - 1) * ENTITY_GAP);

	const leftOutCount = (classList || []).length - entityList.length;
	const factText = look.factTextOf({ entityCount: entityList.length, classCount: (classList || []).length, leftOutCount, nodeCount });
	const rootNameText = rootStableIdList.map((stableId) => displayClassNameOf(classByStableId[stableId]?.name)).join(', ');
	const noteText = isUnlinked ? look.unlinkedNote : look.linkedNoteOf(rootNameText);
	const titleText = `${standardNameTextOf(standard)}: ${look.titleSuffix}`;
	const header = headerOf({ titleText, factText, noteText });
	const partList = [header.svgText];

	const tableByStableId = {};
	const rowBottomByRowTop = {};
	let rowTop = header.bottomY + 26;
	let entityOrder = 0;
	rowList.forEach((oneRow) => {
		const rowWidth = oneRow.length * ENTITY_WIDTH + (oneRow.length - 1) * ENTITY_GAP;
		// a row sits under its parents (centred on them, kept inside the canvas); the top row is centred
		const parentCentreList = oneRow.map((oneEntity) => tableByStableId[oneEntity.parentStableId]?.centreX).filter(Number.isFinite);
		const idealLeft = parentCentreList.length ? parentCentreList.reduce((total, centreX) => total + centreX, 0) / parentCentreList.length - rowWidth / 2 : (canvasWidth - rowWidth) / 2;
		const rowLeft = Math.round(Math.min(Math.max(idealLeft, MARGIN), canvasWidth - MARGIN - rowWidth));
		let rowBottom = rowTop;
		oneRow.forEach((oneEntity, columnIndex) => {
			const oneClass = classByStableId[oneEntity.stableId];
			const { rowList: entityRowList, hiddenCount } = entityRowListOf({ propertyList: propertyListByClassStableId[oneEntity.stableId] || [], entitySet, isSupporting, rowLimit: look.rowLimit });
			const table = entityTableOf({ x: rowLeft + columnIndex * (ENTITY_WIDTH + ENTITY_GAP), y: rowTop, title: displayClassNameOf(oneClass.name), rowList: entityRowList, hiddenCount, palette: entityPaletteList[entityOrder % entityPaletteList.length], hiddenWordList: look.hiddenWordList });
			entityOrder += 1;
			tableByStableId[oneEntity.stableId] = table;
			rowBottom = Math.max(rowBottom, table.bottomY);
		});
		rowBottomByRowTop[rowTop] = rowBottom;
		rowTop = rowBottom + LAYER_GAP;
	});

	// the links: down from the referring table's foot, across above the referred table, down into its head; labelled with the property
	const outSlotListByStableId = {};
	entityLinkList.forEach((oneLink, linkIndex) => (outSlotListByStableId[oneLink.classStableId] ||= []).push(linkIndex));
	// each parent's lines into one row run across at their own height, so two parents' lines never lie on one another
	const parentListByRowTop = {};
	entityLinkList.forEach((oneLink) => {
		const fromTable = tableByStableId[oneLink.classStableId];
		const toTable = tableByStableId[oneLink.referencedClassStableId];
		if (!fromTable || !toTable || toTable.topY <= fromTable.bottomY) return;
		const parentList = (parentListByRowTop[toTable.topY] ||= []);
		if (!parentList.includes(oneLink.classStableId)) parentList.push(oneLink.classStableId);
	});
	Object.values(parentListByRowTop).forEach((parentList) => parentList.sort((left, right) => tableByStableId[left].centreX - tableByStableId[right].centreX));
	partList.push('<!-- the links between entities -->');
	const labelList = [];
	const crossCountByRowTop = {};
	entityLinkList.forEach((oneLink, linkIndex) => {
		const fromTable = tableByStableId[oneLink.classStableId];
		const toTable = tableByStableId[oneLink.referencedClassStableId];
		if (!fromTable || !toTable) return;
		const outSlotList = outSlotListByStableId[oneLink.classStableId];
		const slotIndex = outSlotList.indexOf(linkIndex);
		const fromX = outSlotList.length === 1 ? fromTable.centreX : Math.round(fromTable.leftX + 30 + ((ENTITY_WIDTH - 60) * slotIndex) / (outSlotList.length - 1));
		const toX = toTable.centreX;
		const isList = oneLink.dataType === 'array';
		if (toTable.topY > fromTable.bottomY) {
			const parentBandIndex = parentListByRowTop[toTable.topY].indexOf(oneLink.classStableId);
			const turnY = Math.round(toTable.topY - LAYER_GAP + 28 + (parentBandIndex % 4) * 10);
			partList.push(`<path d="M${fromX} ${fromTable.bottomY} V${turnY} H${toX} V${toTable.topY}" fill="none" stroke="${CONNECTOR_COLOUR}" stroke-width="1.5" stroke-linejoin="round"/>`);
			partList.push(parentEndOf({ x: fromX, y: fromTable.bottomY }));
			partList.push(childEndOf({ x: toX, y: toTable.topY, isList, isRequired: oneLink.isRequired }));
			labelList.push({ x: toX, y: turnY + 22, text: oneLink.name });
		} else {
			// a link across or back up (a class this one also refers to, drawn elsewhere in the tree): dashed, in the gap under (across) or above
			// (back up) the referring row, so it never runs through a table; it enters the referred table at its foot
			const sourceRowKey = fromTable.topY;
			const crossIndex = (crossCountByRowTop[sourceRowKey] = (crossCountByRowTop[sourceRowKey] || 0) + 1) - 1;
			const entryX = Math.round(toTable.leftX + 22 + (crossIndex % 5) * 12);
			const dashText = ` fill="none" stroke="${CONNECTOR_COLOUR}" stroke-width="1.2" stroke-dasharray="5 4" stroke-linejoin="round"`;
			if (toTable.topY === fromTable.topY) {
				const runY = rowBottomByRowTop[sourceRowKey] + 18 + (crossIndex % 4) * 8;
				partList.push(`<path d="M${fromX} ${fromTable.bottomY} V${runY} H${entryX} V${toTable.bottomY}"${dashText}/>`);
				partList.push(parentEndOf({ x: fromX, y: fromTable.bottomY }));
				labelList.push({ x: Math.round((fromX + entryX) / 2), y: runY - 4, text: oneLink.name });
			} else {
				const exitX = Math.round(fromTable.rightX - 22 - (crossIndex % 5) * 12);
				const runY = fromTable.topY - 40 - (crossIndex % 3) * 8;
				partList.push(`<path d="M${exitX} ${fromTable.topY} V${runY} H${entryX} V${toTable.bottomY}"${dashText}/>`);
				partList.push(parentEndOf({ x: exitX, y: fromTable.topY, towardSign: -1 }));
				labelList.push({ x: Math.round((exitX + entryX) / 2), y: runY - 4, text: oneLink.name });
			}
			partList.push(childEndOf({ x: entryX, y: toTable.bottomY, isList, isRequired: oneLink.isRequired, towardSign: -1 }));
		}
	});
	partList.push('<!-- entities -->', ...Object.values(tableByStableId).map((oneTable) => oneTable.svgText));
	// labels last, on a white halo, so a line under one does not cross its words
	partList.push('<!-- link labels -->', ...labelList.map((oneLabel) => `<text x="${oneLabel.x}" y="${oneLabel.y}" text-anchor="middle" font-size="12" fill="${PLAIN_TEXT_COLOUR}" stroke="#FFFFFF" stroke-width="4" paint-order="stroke">${escapeXml(oneLabel.text)}</text>`));
	if (!entityList.length) partList.push(textElementOf({ x: MARGIN, y: header.bottomY + 40, text: look.emptyText, fontSize: 13, colour: MUTED_TEXT_COLOUR, anchor: 'start' }));

	const bodyBottom = Math.max(header.bottomY + 40, ...Object.values(tableByStableId).map((oneTable) => oneTable.bottomY));
	const legend = erLegendOf({ canvasWidth, topY: bodyBottom + 36, keyText: look.legendKeyText });
	partList.push('<!-- legend -->', legend.svgText);
	const canvasHeight = Math.ceil(legend.bottomY + 10);

	const entityNameText = entityList.map((oneEntity) => displayClassNameOf(classByStableId[oneEntity.stableId].name)).join(', ');
	const summaryText = `${standardNameTextOf(standard)}: ${factText}. ${look.summaryLeadText}: ${entityNameText || 'none'}.`;
	return {
		svgText: svgDocumentOf({ width: canvasWidth, height: canvasHeight, titleText, summaryText, partList }),
		width: canvasWidth,
		height: canvasHeight,
		summary: { classCount: (classList || []).length, entityCount: entityList.length, entityNameList: entityList.map((oneEntity) => displayClassNameOf(classByStableId[oneEntity.stableId].name)), linkCount: entityLinkList.length, summaryText },
	};
};

// ================================================================================
// ONE CLASS AND ITS NEIGHBOURS — three columns

const CLASS_CANVAS_WIDTH = 1100;
const sideColumnByName = Object.freeze({
	left: { x: MARGIN, width: 260 },
	centre: { x: 350, width: 400 },
	right: { x: 820, width: 260 },
});
const NEIGHBOUR_BOX_HEIGHT = 52;
const NEIGHBOUR_BOX_GAP = 12;
const PROPERTY_ROW_HEIGHT = 19;
const FOCUS_HEADER_HEIGHT = 58;
const PROPERTY_ROW_LIMIT = 40;
const NEIGHBOUR_LIMIT_PER_SIDE = 14;

// what a neighbour is to the focus class, and which side it is drawn on
const neighbourDirectionList = Object.freeze([
	{ direction: 'subclassOf', sideName: 'right', lineKind: 'subclassOf', subtitleOf: () => 'its parent class' },
	{ direction: 'refersTo', sideName: 'right', lineKind: 'refers', subtitleOf: (oneNeighbour) => `via ${oneNeighbour.propertyNameList.join(', ')}` },
	{ direction: 'superclassOf', sideName: 'left', lineKind: 'subclassOf', subtitleOf: () => 'a subclass of it' },
	{ direction: 'referredBy', sideName: 'left', lineKind: 'refers', subtitleOf: (oneNeighbour) => `refers to it via ${oneNeighbour.propertyNameList.join(', ')}` },
]);

// a property row: a mark when it maps to a hub, its name (required ones bold), then its type or the class it refers to
const propertyRowOf = ({ x, y, width, oneProperty, isHighlighted }) => {
	const partList = [];
	if (isHighlighted) partList.push(`<rect x="${x + 4}" y="${y - 13}" width="${width - 8}" height="${PROPERTY_ROW_HEIGHT - 1}" rx="3" fill="${HIGHLIGHT_FILL}"/>`);
	if (oneProperty.isMapped) partList.push(`<circle cx="${x + 14}" cy="${y - 4}" r="3.5" fill="${MAPPED_COLOUR}"/>`);
	else partList.push(`<circle cx="${x + 14}" cy="${y - 4}" r="3.5" fill="none" stroke="#B4B2A9" stroke-width="1"/>`);
	const typeText = oneProperty.referencedClassName ? `→ ${oneProperty.referencedClassName}` : oneProperty.dataType || '';
	const nameWidth = Math.round((width - 30) * (typeText ? 0.55 : 1));
	partList.push(textElementOf({ x: x + 24, y, text: fitText(`${oneProperty.name}${oneProperty.isRequired ? ' *' : ''}`, nameWidth, 12), fontSize: 12, fontWeight: oneProperty.isRequired ? 600 : undefined, colour: PLAIN_TEXT_COLOUR, anchor: 'start' }));
	if (typeText) partList.push(textElementOf({ x: x + width - 10, y, text: fitText(typeText, width - 30 - nameWidth - 8, 11), fontSize: 11, colour: oneProperty.referencedClassName ? REFERENCE_TEXT_COLOUR : MUTED_TEXT_COLOUR, anchor: 'end' }));
	return partList.join('');
};

const renderClassDataModel = ({ standard, focusClass, propertyList, neighbourList, highlightPropertyName }) => {
	const sortedPropertyList = [...(propertyList || [])].sort((left, right) => Number(Boolean(right.isRequired)) - Number(Boolean(left.isRequired)) || String(left.name).localeCompare(String(right.name)));
	const shownPropertyList = sortedPropertyList.slice(0, PROPERTY_ROW_LIMIT);
	if (highlightPropertyName && !shownPropertyList.some((oneProperty) => oneProperty.name === highlightPropertyName)) {
		const highlightedProperty = sortedPropertyList.find((oneProperty) => oneProperty.name === highlightPropertyName);
		if (highlightedProperty) shownPropertyList.splice(shownPropertyList.length - 1, 1, highlightedProperty);
	}
	const hiddenPropertyCount = sortedPropertyList.length - shownPropertyList.length;
	const mappedPropertyCount = sortedPropertyList.filter((oneProperty) => oneProperty.isMapped).length;

	// the neighbours on each side, the most-linked first, at most NEIGHBOUR_LIMIT_PER_SIDE a side
	const neighbourListBySide = { left: [], right: [] };
	neighbourDirectionList.forEach((oneDirection) => {
		(neighbourList || [])
			.filter((oneNeighbour) => oneNeighbour.direction === oneDirection.direction)
			.map((oneNeighbour) => ({ ...oneNeighbour, propertyNameList: oneNeighbour.propertyNameList || [], ...oneDirection }))
			.forEach((oneNeighbour) => neighbourListBySide[oneDirection.sideName].push(oneNeighbour));
	});
	const hiddenNeighbourCountBySide = {};
	Object.keys(neighbourListBySide).forEach((sideName) => {
		const sortedList = neighbourListBySide[sideName].sort((left, right) => (left.direction === 'subclassOf' || left.direction === 'superclassOf' ? -1 : 0) - (right.direction === 'subclassOf' || right.direction === 'superclassOf' ? -1 : 0) || right.propertyNameList.length - left.propertyNameList.length || String(left.name).localeCompare(String(right.name)));
		hiddenNeighbourCountBySide[sideName] = Math.max(0, sortedList.length - NEIGHBOUR_LIMIT_PER_SIDE);
		neighbourListBySide[sideName] = sortedList.slice(0, NEIGHBOUR_LIMIT_PER_SIDE);
	});

	const standardText = standard ? standardNameTextOf(standard) : focusClass.source || '';
	const referToCount = (neighbourList || []).filter((oneNeighbour) => oneNeighbour.direction === 'refersTo').length;
	const referredByCount = (neighbourList || []).filter((oneNeighbour) => oneNeighbour.direction === 'referredBy').length;
	const factText = [
		standardText ? `a class of ${standardText}` : '',
		`${countTextOf(sortedPropertyList.length, 'property', 'properties')} (${mappedPropertyCount} mapped to a hub)`,
		`refers to ${countTextOf(referToCount, 'class', 'classes')}`,
		`referred to by ${countTextOf(referredByCount, 'class', 'classes')}`,
	].filter(Boolean).join(' · ');
	const header = headerOf({ titleText: `${focusClass.name}: data model`, factText, noteText: 'Bold properties are required (*); a filled dot maps to a hub (CEDS, CTDL); → names the class a property refers to.' });
	const bodyTop = header.bottomY + 18;
	const partList = [header.svgText];

	// the focus class, its properties listed
	const centreColumn = sideColumnByName.centre;
	const focusHeight = FOCUS_HEADER_HEIGHT + shownPropertyList.length * PROPERTY_ROW_HEIGHT + (hiddenPropertyCount ? PROPERTY_ROW_HEIGHT : 0) + 12;
	const focusBox = classBoxOf({ x: centreColumn.x, y: bodyTop, width: centreColumn.width, height: focusHeight, boxKind: 'focusClass', title: focusClass.name, subtitle: classFactTextOf({ propertyCount: sortedPropertyList.length, mappedPropertyCount }) });
	const propertyRowYByName = {};
	const focusPartList = [focusBox.svgText, mappedBarOf({ x: centreColumn.x + 12, y: bodyTop + 46, width: centreColumn.width - 24, propertyCount: sortedPropertyList.length, mappedPropertyCount })];
	focusPartList.push(`<line x1="${centreColumn.x}" y1="${bodyTop + FOCUS_HEADER_HEIGHT - 4}" x2="${centreColumn.x + centreColumn.width}" y2="${bodyTop + FOCUS_HEADER_HEIGHT - 4}" stroke="${boxStyleByKind.focusClass.stroke}" stroke-width="0.5"/>`);
	shownPropertyList.forEach((oneProperty, rowIndex) => {
		const rowY = bodyTop + FOCUS_HEADER_HEIGHT + 10 + rowIndex * PROPERTY_ROW_HEIGHT;
		if (propertyRowYByName[oneProperty.name] === undefined) propertyRowYByName[oneProperty.name] = rowY - 4;
		focusPartList.push(propertyRowOf({ x: centreColumn.x, y: rowY, width: centreColumn.width, oneProperty, isHighlighted: oneProperty.name === highlightPropertyName }));
	});
	if (hiddenPropertyCount) focusPartList.push(textElementOf({ x: centreColumn.x + 24, y: bodyTop + FOCUS_HEADER_HEIGHT + 10 + shownPropertyList.length * PROPERTY_ROW_HEIGHT, text: `… and ${countTextOf(hiddenPropertyCount, 'more property', 'more properties')} (all of them are in the explorer's table)`, fontSize: 11, colour: MUTED_TEXT_COLOUR, anchor: 'start', fontStyle: 'italic' }));
	if (!sortedPropertyList.length) focusPartList.push(textElementOf({ x: centreColumn.x + 24, y: bodyTop + FOCUS_HEADER_HEIGHT + 12, text: 'The graph holds no properties for this class.', fontSize: 12, colour: MUTED_TEXT_COLOUR, anchor: 'start' }));

	// the neighbours, each side a column centred on the focus box's middle where it fits
	const neighbourBoxListBySide = {};
	Object.entries(neighbourListBySide).forEach(([sideName, sideNeighbourList]) => {
		const sideColumn = sideColumnByName[sideName];
		const columnHeight = sideNeighbourList.length * NEIGHBOUR_BOX_HEIGHT + Math.max(0, sideNeighbourList.length - 1) * NEIGHBOUR_BOX_GAP;
		const columnTop = Math.max(bodyTop, Math.round(bodyTop + focusHeight / 2 - columnHeight / 2));
		neighbourBoxListBySide[sideName] = sideNeighbourList.map((oneNeighbour, neighbourIndex) => ({
			oneNeighbour,
			box: classBoxOf({
				x: sideColumn.x,
				y: columnTop + neighbourIndex * (NEIGHBOUR_BOX_HEIGHT + NEIGHBOUR_BOX_GAP),
				width: sideColumn.width,
				height: NEIGHBOUR_BOX_HEIGHT,
				boxKind: oneNeighbour.isOtherStandard ? 'otherStandardClass' : 'class',
				title: oneNeighbour.name,
				subtitle: `${oneNeighbour.isOtherStandard && oneNeighbour.source ? `${oneNeighbour.source} · ` : ''}${oneNeighbour.subtitleOf(oneNeighbour)}`,
			}),
		}));
	});

	partList.push('<!-- the links to and from the class -->');
	(neighbourBoxListBySide.right || []).forEach(({ oneNeighbour, box }, neighbourIndex) => {
		// the line leaves from the highest drawn row of a property that refers to this neighbour
		const rowYList = oneNeighbour.propertyNameList.map((onePropertyName) => propertyRowYByName[onePropertyName]).filter((rowY) => rowY !== undefined);
		const fromY = rowYList.length ? Math.min(...rowYList) : bodyTop + 22 + (neighbourIndex % 4) * 6;
		partList.push(curveOf({ x1: focusBox.rightX, y1: fromY, x2: box.leftX - 3, y2: box.centreY, lineKind: oneNeighbour.lineKind, dashed: oneNeighbour.lineKind === 'subclassOf', bendDirection: 'horizontal' }));
	});
	(neighbourBoxListBySide.left || []).forEach(({ oneNeighbour, box }, neighbourIndex) => {
		const toY = bodyTop + 16 + (neighbourIndex % 8) * 4;
		partList.push(curveOf({ x1: box.rightX, y1: box.centreY, x2: focusBox.leftX - 3, y2: toY, lineKind: oneNeighbour.lineKind, dashed: oneNeighbour.lineKind === 'subclassOf', bendDirection: 'horizontal' }));
	});
	partList.push('<!-- the class and its neighbours -->', ...focusPartList);
	Object.values(neighbourBoxListBySide).forEach((sideBoxList) => sideBoxList.forEach(({ box }) => partList.push(box.svgText)));

	// column headings and what was left out
	partList.push(textElementOf({ x: sideColumnByName.left.x, y: bodyTop - 6, text: 'Refer to it', fontSize: 11, fontWeight: 600, colour: MUTED_TEXT_COLOUR, anchor: 'start' }));
	partList.push(textElementOf({ x: sideColumnByName.right.x, y: bodyTop - 6, text: 'It refers to', fontSize: 11, fontWeight: 600, colour: MUTED_TEXT_COLOUR, anchor: 'start' }));
	const sideBottomOf = (sideName) => Math.max(bodyTop, ...(neighbourBoxListBySide[sideName] || []).map(({ box }) => box.bottomY));
	Object.entries(hiddenNeighbourCountBySide).forEach(([sideName, hiddenCount]) => {
		if (!hiddenCount) return;
		partList.push(textElementOf({ x: sideColumnByName[sideName].x, y: sideBottomOf(sideName) + 18, text: `and ${countTextOf(hiddenCount, 'more class', 'more classes')} not drawn`, fontSize: 11, colour: MUTED_TEXT_COLOUR, anchor: 'start', fontStyle: 'italic' }));
	});
	if (!(neighbourList || []).length) partList.push(textElementOf({ x: sideColumnByName.right.x, y: bodyTop + 20, text: 'No other class refers to or from this one.', fontSize: 12, colour: MUTED_TEXT_COLOUR, anchor: 'start' }));

	const bodyBottom = Math.max(focusBox.bottomY, sideBottomOf('left') + 24, sideBottomOf('right') + 24);
	const legend = legendOf({ canvasWidth: CLASS_CANVAS_WIDTH, topY: bodyBottom + 30 });
	partList.push('<!-- legend -->', legend.svgText);
	const canvasHeight = Math.ceil(legend.bottomY + 8);

	const summaryText = `${focusClass.name} is ${factText}.`;
	return {
		svgText: svgDocumentOf({ width: CLASS_CANVAS_WIDTH, height: canvasHeight, titleText: `${focusClass.name}: data model`, summaryText, partList }),
		width: CLASS_CANVAS_WIDTH,
		height: canvasHeight,
		summary: { propertyCount: sortedPropertyList.length, mappedPropertyCount, refersToCount: referToCount, referredByCount, shownNeighbourCount: neighbourListBySide.left.length + neighbourListBySide.right.length, summaryText },
	};
};

module.exports = { renderStandardDataModel, renderUseCaseModel, renderClassDataModel, wrapText };
