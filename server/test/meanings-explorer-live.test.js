'use strict';
// meanings-explorer-live.test.js — WORKORDER-meaningsExplorer-111026 gates 1, 2 and 5 on the LIVE golden and the real URI store, the access points built as the
// server builds them (the shared harness lib/explorerLiveHarness.js), nothing stubbed but the usage table:
//   1. meanings:all lists the hubs; a hub lists its domains; a domain lists its properties; a property lists its meanings; a meaning answers its tuple slots
//      with URIs and its "Expressed in" groups; value-tier meanings are absent from the default lists and listed (capped, with their count) inside their
//      property meaning; every meaning's uri EQUALS what the local /edc resolver answers for it (10 sampled); malformed and unknown ids are refused by name;
//   2. the walk's reads are timed: a domain listing under 2 s, a meaning's page under 1 s;
//   5. with BASELINE_SERVER_PATH set (a tree of the branch base), the Standards Explorer's answers walked here are IDENTICAL to the base's.
// Needs the local golden and the qbook config; with no graph it SKIPs by name. Run: node server/test/meanings-explorer-live.test.js
// (SUBJECT_SERVER_PATH=<another tree's server dir> runs the same gates on that tree, eg the branch base, to watch them fail there.)

const { goldenHandle, forgeAdapter, branchLibrary, baselineLibrary, resolveUri, GATE_WAIT_MILLISECONDS, GATE_WAIT_LIMIT, URI_MINTER_ACCESS_POINT_NAME } = require('./lib/explorerLiveHarness');

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};
const finish = () => {
	console.log(`\n${passed} passed, ${failed} failed`);
	process.exit(failed ? 1 : 0);
};

const meaningsNode = (stableId, callback) => branchLibrary['standards-neighbourhood']({ action: 'node', stableId }, callback);
const itemListOf = (neighbourhood) => neighbourhood.childGroupList.flatMap((oneGroup) => oneGroup.itemList);
const groupOf = (neighbourhood, relationshipType) => neighbourhood.childGroupList.find((oneGroup) => oneGroup.relationshipType === relationshipType);
const timeRead = (stableId, callback) => {
	const startMilliseconds = Date.now();
	meaningsNode(stableId, (nodeError, neighbourhood) => callback(nodeError, neighbourhood, Date.now() - startMilliseconds));
};

// the samples this test walks (GOLD_261030_useCases): a CEDS property meaning with 375 elements, a CEDS one with 7,916 value meanings, a CTDL one with ranges
const CEDS_DOMAIN_STABLE_ID = 'https://w3id.org/CEDStandards/terms/C200331';
const CEDS_PROPERTY_STABLE_ID = 'https://w3id.org/CEDStandards/terms/P000043';
const CEDS_CARD_STABLE_ID = 'https://w3id.org/EDUcore/CEDStandards/hub/14.0.0.0/bebeaa38ca66d7ec7825950e0d61d00186be65e3d7a17e938d2f7b7ca6562577';
const CEDS_VALUE_HOLDER_CARD_STABLE_ID = 'https://w3id.org/EDUcore/CEDStandards/hub/14.0.0.0/f364f44fd13e2d51f0101aff6d93a0bf93c7e7950503b7c67a0dbf11bde156fb';
// ⟪review S1-S3⟫ the CTDL "Framework URL" meaning: 1,014 elements, 1,004 of them SIF (most tied at 0.7 and '@Codeset'); one LIF element has no climb from its root
const LARGE_CARD_STABLE_ID = 'https://w3id.org/EDUcore/CTDL/hub/Release_20260927/8f519f13a9ae98e10fd7effb7e228e52c6dca043f68419f630cb782d32ac1e71';
const NO_CLIMB_ELEMENT_STABLE_ID = 'lif:CompetencyFramework/Association/inline/competencyAssociationUri';
const CTDL_CARD_STABLE_ID = 'https://w3id.org/EDUcore/CTDL/hub/Release_20260927/69bea17c82f2d43fa773867bf6adab46d0e2b6aae7cfe7ac7f5a7d75b0792b4c';
const DOMAIN_LISTING_MILLISECOND_LIMIT = 2000;
const MEANING_PAGE_MILLISECOND_LIMIT = 1000;
const URI_SAMPLE_COUNT = 10;

const stepList = [];
const meaningRowSampleList = [];

stepList.push((done) => {
	const waitConnected = (tryCount) => {
		if (goldenHandle.graphStateOf().graphState === 'connected') { done(); return; }
		if (tryCount >= GATE_WAIT_LIMIT) { ok('the golden handle connects within the wait', false, JSON.stringify(goldenHandle.graphStateOf())); finish(); return; }
		setTimeout(() => waitConnected(tryCount + 1), GATE_WAIT_MILLISECONDS);
	};
	waitConnected(0);
});

// the minter's gate must have passed before the URIs can be minted
stepList.push((done) => {
	const askMinter = (tryCount) => branchLibrary[URI_MINTER_ACCESS_POINT_NAME]({}, (minterError, minterAnswer) => {
		if (!minterError && minterAnswer.uriMinter) { done(); return; }
		if (tryCount >= GATE_WAIT_LIMIT) { ok('standards-query-uri-minter: the gate passed within the wait', false, minterError || JSON.stringify(minterAnswer)); finish(); return; }
		setTimeout(() => askMinter(tryCount + 1), GATE_WAIT_MILLISECONDS);
	});
	askMinter(0);
});

// ---- the root lists the hubs
stepList.push((done) => meaningsNode('meanings:all', (nodeError, neighbourhood) => {
	ok('meanings:all answers', !nodeError, nodeError);
	if (nodeError) { done(); return; }
	const hubItemList = itemListOf(neighbourhood);
	ok('meanings:all lists one item per hub, each a meaningHub', hubItemList.length >= 2 && hubItemList.every((oneItem) => oneItem.kind === 'meaningHub'), JSON.stringify(hubItemList.map((oneItem) => oneItem.stableId)));
	['CEDS', 'CTDL'].forEach((hubName) => ok(`meanings:all lists the ${hubName} hub as meaningHub:${hubName}`, hubItemList.some((oneItem) => oneItem.stableId === `meaningHub:${hubName}`)));
	const cedsItem = hubItemList.find((oneItem) => oneItem.hubName === 'CEDS') || {};
	ok('a hub says how many meanings of each tier it holds', (cedsItem.tierCountList || []).some((oneTier) => oneTier.referenceTier === 'value' && oneTier.meaningCount > 0), JSON.stringify(cedsItem));
	ok('meanings:all and its hub items (synthetic, standing for no node) carry no uri', !('uri' in neighbourhood.node) && hubItemList.every((oneItem) => !('uri' in oneItem)));
	done();
}));

// ---- a hub lists its domains (timed)
stepList.push((done) => timeRead('meaningHub:CEDS', (nodeError, neighbourhood, elapsedMilliseconds) => {
	ok('meaningHub:CEDS answers', !nodeError, nodeError);
	if (nodeError) { done(); return; }
	const domainItemList = itemListOf(neighbourhood);
	console.log(`  TIMING: meaningHub:CEDS (${domainItemList.length} domains) ${elapsedMilliseconds} ms`);
	ok('meaningHub:CEDS lists its domains, each a meaningDomain carrying its domain element\'s uri', domainItemList.length > 100 && domainItemList.every((oneItem) => oneItem.kind === 'meaningDomain' && typeof oneItem.uri === 'string'), JSON.stringify(domainItemList[0]).slice(0, 300));
	ok(`meaningHub:CEDS answers its domain listing in under ${DOMAIN_LISTING_MILLISECOND_LIMIT} ms (${elapsedMilliseconds} ms)`, elapsedMilliseconds < DOMAIN_LISTING_MILLISECOND_LIMIT);
	ok('the CEDS domain Postsecondary Program is listed', domainItemList.some((oneItem) => oneItem.stableId === `meaningDomain:${CEDS_DOMAIN_STABLE_ID}`));
	done();
}));

// ---- a domain lists its properties (timed)
stepList.push((done) => timeRead(`meaningDomain:${CEDS_DOMAIN_STABLE_ID}`, (nodeError, neighbourhood, elapsedMilliseconds) => {
	ok('a meaningDomain answers', !nodeError, nodeError);
	if (nodeError) { done(); return; }
	console.log(`  TIMING: meaningDomain:${CEDS_DOMAIN_STABLE_ID} ${elapsedMilliseconds} ms`);
	const propertyGroup = groupOf(neighbourhood, 'HAS_MEANING_PROPERTY');
	ok('the domain lists its properties as meaningProperty items', propertyGroup && propertyGroup.itemList.length > 0 && propertyGroup.itemList.every((oneItem) => oneItem.kind === 'meaningProperty'));
	ok('the domain lists the property P000043 with its own domain in its id', propertyGroup && propertyGroup.itemList.some((oneItem) => oneItem.stableId === `meaningProperty:${CEDS_DOMAIN_STABLE_ID}@${CEDS_PROPERTY_STABLE_ID}`));
	ok(`the domain answers in under ${DOMAIN_LISTING_MILLISECOND_LIMIT} ms (${elapsedMilliseconds} ms)`, elapsedMilliseconds < DOMAIN_LISTING_MILLISECOND_LIMIT);
	ok('no value-tier meaning is listed on a domain', itemListOf(neighbourhood).every((oneItem) => oneItem.referenceTier !== 'value'));
	itemListOf(neighbourhood).filter((oneItem) => oneItem.kind === 'meaning').forEach((oneItem) => meaningRowSampleList.push(oneItem));
	done();
}));

// ---- a property lists its meanings
stepList.push((done) => meaningsNode(`meaningProperty:${CEDS_DOMAIN_STABLE_ID}@${CEDS_PROPERTY_STABLE_ID}`, (nodeError, neighbourhood) => {
	ok('a meaningProperty answers', !nodeError, nodeError);
	if (nodeError) { done(); return; }
	const meaningItemList = itemListOf(neighbourhood);
	ok('the property lists its meanings, each a meaning row carrying the card\'s uri', meaningItemList.length > 0 && meaningItemList.every((oneItem) => oneItem.kind === 'meaning' && oneItem.uri === oneItem.stableId.slice('meaning:'.length)), JSON.stringify(meaningItemList[0]).slice(0, 300));
	ok('the property lists the property meaning of P000043 in C200331', meaningItemList.some((oneItem) => oneItem.stableId === `meaning:${CEDS_CARD_STABLE_ID}` && oneItem.referenceTier === 'property'));
	ok('the property lists its own term meaning beside it', (groupOf(neighbourhood, 'HAS_TERM_MEANING') || { itemList: [] }).itemList.some((oneItem) => oneItem.referenceTier === 'term'));
	ok('no value-tier meaning is listed on a property', meaningItemList.every((oneItem) => oneItem.referenceTier !== 'value'));
	meaningItemList.forEach((oneItem) => meaningRowSampleList.push(oneItem));
	done();
}));

// ---- a meaning: its tuple, with URIs, and its "Expressed in" groups (timed)
stepList.push((done) => timeRead(`meaning:${CEDS_CARD_STABLE_ID}`, (nodeError, neighbourhood, elapsedMilliseconds) => {
	ok('a CEDS meaning answers', !nodeError, nodeError);
	if (nodeError) { done(); return; }
	const meaningNode = neighbourhood.node;
	console.log(`  TIMING: meaning:${CEDS_CARD_STABLE_ID} (${meaningNode.expressionCount} elements) ${elapsedMilliseconds} ms`);
	ok(`the meaning's page answers in under ${MEANING_PAGE_MILLISECOND_LIMIT} ms (${elapsedMilliseconds} ms)`, elapsedMilliseconds < MEANING_PAGE_MILLISECOND_LIMIT);
	ok('the meaning names itself: kind meaning, its tier, its uri the card\'s stableId', meaningNode.kind === 'meaning' && meaningNode.referenceTier === 'property' && meaningNode.uri === CEDS_CARD_STABLE_ID && meaningNode.uriKind === 'edc');
	const slotNameList = Object.keys(meaningNode.tuple || {});
	ok('its tuple holds the role-named slots domain, property and range, in that order', JSON.stringify(slotNameList) === JSON.stringify(['domain', 'property', 'range']), JSON.stringify(meaningNode.tuple || meaningNode.tupleAbsentName));
	ok('every tuple slot carries its kind, native id, label and an EDUcore uri', slotNameList.length > 0 && slotNameList.every((slotName) => { const onePart = meaningNode.tuple[slotName]; return onePart.kind && onePart.nativeId && onePart.label && typeof onePart.uri === 'string' && onePart.uri.startsWith(forgeAdapter.baseIri); }));
	const groupList = meaningNode.expressedInGroupList || [];
	const elementList = groupList.flatMap((oneGroup) => oneGroup.elementList);
	ok(`"Expressed in" groups its ${meaningNode.expressionCount} elements by standard, every one listed`, groupList.length > 1 && elementList.length === meaningNode.expressionCount && !meaningNode.expressionsTruncated, `${groupList.length} groups, ${elementList.length} of ${meaningNode.expressionCount}`);
	ok('each element carries its relation, match basis, confidence, uri and its climb from the root', elementList.every((oneElement) => oneElement.matchKind && oneElement.matchBasis && typeof oneElement.mappingConfidence === 'number' && typeof oneElement.uri === 'string' && oneElement.ancestorList.length > 0 && oneElement.ancestorList[0].kind === 'standard'), JSON.stringify(elementList.find((oneElement) => !oneElement.matchBasis) || {}).slice(0, 300));
	ok('each group names its standard (family, release, version) and is the fan-out\'s standardGroup', groupList.every((oneGroup) => oneGroup.standardFamily && oneGroup.releaseLabel && oneGroup.version && oneGroup.stableId.startsWith('standardGroup:')));
	ok('its place in the walk: its group, domain and property as walk ids', meaningNode.meaningGroup && meaningNode.meaningGroup.stableId === 'meaningHub:CEDS' && meaningNode.meaningDomain.stableId === `meaningDomain:${CEDS_DOMAIN_STABLE_ID}` && meaningNode.meaningProperty.stableId === `meaningProperty:${CEDS_DOMAIN_STABLE_ID}@${CEDS_PROPERTY_STABLE_ID}`);
	ok('a property meaning without codes holds no value meanings', !groupOf(neighbourhood, 'HAS_VALUE_MEANING'));
	done();
}));

// ---- value-tier meanings appear only inside their property meaning, capped, with their count
stepList.push((done) => meaningsNode(`meaning:${CEDS_VALUE_HOLDER_CARD_STABLE_ID}`, (nodeError, neighbourhood) => {
	ok('a CEDS meaning with codes answers', !nodeError, nodeError);
	if (nodeError) { done(); return; }
	const valueGroup = groupOf(neighbourhood, 'HAS_VALUE_MEANING');
	ok('its value meanings are listed, capped at 500, saying they are capped and how many there are', valueGroup && valueGroup.itemList.length === 500 && valueGroup.truncated === true && valueGroup.count > 500, valueGroup ? `${valueGroup.itemList.length} of ${valueGroup.count}` : 'no group');
	ok('every value meaning listed is value tier, carrying its uri', valueGroup && valueGroup.itemList.every((oneItem) => oneItem.referenceTier === 'value' && typeof oneItem.uri === 'string'));
	if (valueGroup) valueGroup.itemList.slice(0, 6).forEach((oneItem) => meaningRowSampleList.push(oneItem));
	done();
}));

// ---- a CTDL meaning: its ranges are description, not identity
stepList.push((done) => meaningsNode(`meaning:${CTDL_CARD_STABLE_ID}`, (nodeError, neighbourhood) => {
	ok('a CTDL meaning answers', !nodeError, nodeError);
	if (nodeError) { done(); return; }
	const meaningNode = neighbourhood.node;
	ok('a CTDL meaning\'s tuple holds domain and property, its ranges outside it', JSON.stringify(Object.keys(meaningNode.tuple || {})) === JSON.stringify(['domain', 'property']) && meaningNode.rangeIsIdentity === false && meaningNode.rangePartList.length === 2, JSON.stringify({ tuple: Object.keys(meaningNode.tuple || {}), rangeIsIdentity: meaningNode.rangeIsIdentity, rangeCount: (meaningNode.rangePartList || []).length }));
	meaningRowSampleList.push({ stableId: meaningNode.stableId, uri: meaningNode.uri });
	done();
}));

// ---- ⟪review S1, S2, S3, S6⟫ a large meaning: true per-standard counts, every standard present, a deterministic order, and honest paths
const tieOrderHolds = (elementList) => elementList.every((oneElement, elementIndex) => {
	if (elementIndex === 0) return true;
	const previous = elementList[elementIndex - 1];
	const rankOf = (oneRow) => ({ exact: 1, close: 2, narrow: 3, broad: 4 })[oneRow.matchKind];
	return rankOf(previous) < rankOf(oneElement)
		|| (rankOf(previous) === rankOf(oneElement) && ((previous.mappingConfidence > oneElement.mappingConfidence)
		|| (previous.mappingConfidence === oneElement.mappingConfidence && (previous.name < oneElement.name || (previous.name === oneElement.name && previous.stableId < oneElement.stableId)))));
});
stepList.push((done) => meaningsNode(`meaning:${LARGE_CARD_STABLE_ID}`, (nodeError, neighbourhood) => branchLibrary['standards-neighbourhood']({ action: 'node', stableId: LARGE_CARD_STABLE_ID }, (anchorError, anchorAnswer) => {
	ok('the large meaning and its Standards Explorer anchor page answer', !nodeError && !anchorError, nodeError || anchorError);
	if (nodeError || anchorError) { done(); return; }
	const groupList = neighbourhood.node.expressedInGroupList;
	const fanOutGroupList = anchorAnswer.childGroupList.find((oneGroup) => oneGroup.relationshipType === 'MAPPED_FROM_STANDARD').itemList;
	ok('S2: every standard the anchor fan-out names is a group of "Expressed in", in the fan-out\'s order', JSON.stringify(groupList.map((oneGroup) => oneGroup.standardKey)) === JSON.stringify(fanOutGroupList.map((oneGroup) => oneGroup.standardKey)), JSON.stringify(groupList.map((oneGroup) => oneGroup.standardKey)));
	ok('S2: each group\'s elementCount is the fan-out\'s true count', groupList.every((oneGroup) => { const fanOutGroup = fanOutGroupList.find((oneFanOut) => oneFanOut.standardKey === oneGroup.standardKey) || {}; return oneGroup.elementCount === fanOutGroup.elementCount; }), JSON.stringify(groupList.map((oneGroup) => [oneGroup.standardKey, oneGroup.elementCount])));
	const sifGroup = groupList.find((oneGroup) => oneGroup.standardKey === 'sif260928') || { elementList: [] };
	ok('S2: the SIF group says 1,004 and shows its capped list, saying so', sifGroup.elementCount === 1004 && sifGroup.elementList.length === 500 && sifGroup.elementsTruncated === true, `${sifGroup.elementCount} / ${sifGroup.elementList.length} / ${sifGroup.elementsTruncated}`);
	ok('S1: within every group, elements come strongest first, then confidence, name and stableId (no planner-chosen ties)', groupList.every((oneGroup) => tieOrderHolds(oneGroup.elementList)));
	const elementList = groupList.flatMap((oneGroup) => oneGroup.elementList);
	const noClimbElement = elementList.find((oneElement) => oneElement.stableId === NO_CLIMB_ELEMENT_STABLE_ID) || {};
	ok('S3: an element with no climb from its root carries no Standards path and says why by name', !noClimbElement.standardsWalkPathStableIdList && noClimbElement.standardsWalkPathAbsentName === 'noClimbFromRoot', JSON.stringify(noClimbElement).slice(0, 300));
	const pathedElementList = elementList.filter((oneElement) => oneElement.stableId !== NO_CLIMB_ELEMENT_STABLE_ID);
	ok('S6: every other element carries its Standards Explorer path from the server, from families:all to itself', pathedElementList.length > 0 && pathedElementList.every((oneElement) => Array.isArray(oneElement.standardsWalkPathStableIdList) && oneElement.standardsWalkPathStableIdList[0] === 'families:all' && oneElement.standardsWalkPathStableIdList.slice(-1)[0] === oneElement.stableId), JSON.stringify(pathedElementList.find((oneElement) => !oneElement.standardsWalkPathStableIdList) || {}).slice(0, 300));
	done();
})));

// ---- ⟪review S6⟫ a server-made Standards path walks: each step is a child (or the mapped-from group) of the one before
stepList.push((done) => meaningsNode(`meaning:${CEDS_CARD_STABLE_ID}`, (nodeError, neighbourhood) => {
	const firstElement = nodeError ? null : neighbourhood.node.expressedInGroupList[0].elementList[0];
	const walkPathList = firstElement ? firstElement.standardsWalkPathStableIdList || [] : [];
	const checkStep = (stepIndex) => {
		if (stepIndex >= walkPathList.length - 1) { ok(`S6: the Standards path of ${firstElement ? firstElement.name : '?'} walks step by step (${walkPathList.length} steps)`, walkPathList.length > 2); done(); return; }
		branchLibrary['standards-neighbourhood']({ action: 'node', stableId: walkPathList[stepIndex] }, (stepError, stepAnswer) => {
			const childIdList = stepError ? [] : stepAnswer.childGroupList.flatMap((oneGroup) => oneGroup.itemList.map((oneItem) => oneItem.stableId));
			if (!childIdList.includes(walkPathList[stepIndex + 1])) { ok(`S6: step ${stepIndex} (${walkPathList[stepIndex]}) lists the next step ${walkPathList[stepIndex + 1]}`, false, stepError || `${childIdList.length} children`); done(); return; }
			checkStep(stepIndex + 1);
		});
	};
	checkStep(0);
}));

// ---- ⟪review S4, S5⟫ a pair no property meaning joins, and an unknown hub in a breadcrumb, are refused by name
stepList.push((done) => meaningsNode('meaningProperty:https://w3id.org/CEDStandards/terms/C200010@https://w3id.org/CEDStandards/terms/P002089', (nodeError) => {
	ok('S4: a domain and property no property meaning joins is refused by name (its term card alone does not make the level)', /no meaning names the property .* in the domain/.test(nodeError || ''), nodeError || 'answered');
	meaningsNode('meaningProperty:ceterms:AssociateDegree@https://w3id.org/CEDStandards/terms/P002089', (crossHubError) => {
		ok('S4: a CEDS property in a CTDL domain is refused by name', /no meaning names the property .* in the domain/.test(crossHubError || ''), crossHubError || 'answered');
		done();
	});
}));
stepList.push((done) => branchLibrary['standards-neighbourhood']({ action: 'pathSummary', stableIdList: ['meanings:all', 'meaningHub:NOSUCHHUB'] }, (summaryError) => {
	ok('S5: a breadcrumb naming a hub the graph does not hold is refused by name', /no :HubDefinition in this graph has hubName 'NOSUCHHUB'/.test(summaryError || ''), summaryError || 'answered');
	done();
}));

// ---- the URI of every sampled meaning equals what the local resolver answers for it
stepList.push((done) => {
	const sampleList = Object.values(Object.fromEntries(meaningRowSampleList.map((oneRow) => [oneRow.stableId, oneRow]))).slice(0, URI_SAMPLE_COUNT);
	ok(`${URI_SAMPLE_COUNT} meanings sampled`, sampleList.length === URI_SAMPLE_COUNT, String(sampleList.length));
	const resolveNext = (sampleIndex) => {
		if (sampleIndex === sampleList.length) { done(); return; }
		const oneRow = sampleList[sampleIndex];
		resolveUri(oneRow.uri || '', ({ httpStatus, body }) => {
			ok(`${oneRow.stableId.slice(0, 90)}: the resolver answers 200 for its uri, naming that same URI as the meaning`, httpStatus === 200 && body.meaning === oneRow.uri && body.kind === 'meaning', `${httpStatus} ${JSON.stringify(body).slice(0, 200)}`);
			resolveNext(sampleIndex + 1);
		});
	};
	resolveNext(0);
});

// ---- malformed and unknown ids are refused by name
[
	['meanings:other', /is not the meanings catalog id/],
	['meaningHub:NOSUCHHUB', /no :HubDefinition in this graph has hubName 'NOSUCHHUB'; hubs present: /],
	[`meaningProperty:${CEDS_DOMAIN_STABLE_ID}`, /is not a meaning property id/],
	['meaning:https://w3id.org/EDUcore/no-such-card', /no meaning in this graph has stableId/],
	[`meaningDomain:${CEDS_PROPERTY_STABLE_ID}`, /no meaning names .* as its domain/],
].forEach(([stableId, refusalPattern]) => stepList.push((done) => meaningsNode(stableId, (nodeError) => {
	ok(`${stableId} is refused by name`, refusalPattern.test(nodeError || ''), nodeError || 'answered');
	done();
})));

// ---- the breadcrumb of a reloaded meanings path names every step
stepList.push((done) => branchLibrary['standards-neighbourhood']({ action: 'pathSummary', stableIdList: ['meanings:all', 'meaningHub:CEDS', `meaningDomain:${CEDS_DOMAIN_STABLE_ID}`, `meaningProperty:${CEDS_DOMAIN_STABLE_ID}@${CEDS_PROPERTY_STABLE_ID}`, `meaning:${CEDS_CARD_STABLE_ID}`] }, (summaryError, pathSummary) => {
	ok('pathSummary names a meanings walk', !summaryError && pathSummary.nodeSummaryList.map((oneSummary) => oneSummary.kind).join(',') === 'meaningCatalog,meaningHub,meaningDomain,meaningProperty,meaning', summaryError || JSON.stringify(pathSummary.nodeSummaryList.map((oneSummary) => [oneSummary.kind, oneSummary.name])));
	ok('every named step carries its hub\'s family (the crumb colour)', !summaryError && pathSummary.nodeSummaryList.slice(1).every((oneSummary) => oneSummary.standardFamily === 'CEDS'));
	done();
}));

// ---- against the branch base: the Standards Explorer answers exactly as before
const STANDARDS_REQUEST_LIST = [
	{ action: 'node', stableId: 'families:all' },
	{ action: 'node', stableId: 'family:CEDS' },
	{ action: 'node', stableId: 'https://w3id.org/CEDStandards/terms/P001157' },
	{ action: 'node', stableId: CEDS_CARD_STABLE_ID },
	{ action: 'node', stableId: `standardGroup:pescacademiceportfolio1v0v0@${CEDS_CARD_STABLE_ID}` },
	// ⟪review S7⟫ a capped group: 500 shown of 1,004, a tie straddling the cut
	{ action: 'node', stableId: `standardGroup:sif260928@${LARGE_CARD_STABLE_ID}` },
	{ action: 'node', stableId: CTDL_CARD_STABLE_ID },
	{ action: 'node', stableId: CEDS_PROPERTY_STABLE_ID },
	{ action: 'pathSummary', stableIdList: ['families:all', 'family:CEDS', 'https://w3id.org/CEDStandards/terms/', 'https://w3id.org/CEDStandards/terms/C200012', 'https://w3id.org/CEDStandards/terms/P001157'] },
];
// standardGroupMembers now orders by (mappingConfidence DESC, element.name, element.stableId): the stableId tie-break (ROMANTIC_PARASOL's ruling (b)) makes the
// order a fact of the data, not of the planner. The base orders by the first two only, so a standard group must agree with the base on every row and on
// the (confidence, name) sequence, and its tied rows must now come in stableId order; everything else must match byte for byte.
const confidenceOf = (oneItem) => (oneItem.mapping ? oneItem.mapping.mappingConfidence : -1);
const tieOrderedItemListOf = (itemList) => [...itemList].sort((left, right) => (confidenceOf(right) - confidenceOf(left)) || (left.name < right.name ? -1 : left.name > right.name ? 1 : 0) || (left.stableId < right.stableId ? -1 : 1));
const tieKeyTextOf = (itemList) => JSON.stringify(itemList.map((oneItem) => [confidenceOf(oneItem), oneItem.name]));
const answersAgreeFor = (oneRequest, branchAnswer, baseAnswer) => {
	if (!String(oneRequest.stableId || '').startsWith('standardGroup:')) return JSON.stringify(branchAnswer) === JSON.stringify(baseAnswer);
	const branchItemList = branchAnswer.childGroupList[0].itemList;
	const baseItemList = baseAnswer.childGroupList[0].itemList;
	const withoutItemsOf = (answerValue) => JSON.stringify({ ...answerValue, childGroupList: answerValue.childGroupList.map(({ itemList, ...groupFields }) => groupFields) });
	const branchInTieOrder = JSON.stringify(branchItemList) === JSON.stringify(tieOrderedItemListOf(branchItemList));
	const sameKeySequence = tieKeyTextOf(branchItemList) === tieKeyTextOf(baseItemList);
	// uncapped: the same rows; capped: which tied rows straddle the cut was the base planner's choice, so only the (confidence, name) sequence must agree
	const sameRowsWhenUncapped = branchAnswer.childGroupList[0].truncated || JSON.stringify(tieOrderedItemListOf(branchItemList)) === JSON.stringify(tieOrderedItemListOf(baseItemList));
	return withoutItemsOf(branchAnswer) === withoutItemsOf(baseAnswer) && branchInTieOrder && sameKeySequence && sameRowsWhenUncapped;
};
stepList.push((done) => {
	if (!baselineLibrary) {
		console.log('  SKIP: BASELINE_SERVER_PATH unset; gate 5 (the Standards Explorer against the branch base) did not run and proved nothing here');
		done();
		return;
	}
	const compareNext = (requestIndex) => {
		if (requestIndex === STANDARDS_REQUEST_LIST.length) { done(); return; }
		const oneRequest = STANDARDS_REQUEST_LIST[requestIndex];
		branchLibrary['standards-neighbourhood'](oneRequest, (branchError, branchAnswer) => baselineLibrary['standards-neighbourhood'](oneRequest, (baseError, baseAnswer) => {
			ok(`against the base: ${oneRequest.action} ${oneRequest.stableId || oneRequest.stableIdList.slice(-1)[0]} answers identically`, !branchError && !baseError && answersAgreeFor(oneRequest, branchAnswer, baseAnswer), branchError || baseError || 'answers differ');
			compareNext(requestIndex + 1);
		}));
	};
	compareNext(0);
});

const runNext = (stepIndex) => {
	if (stepIndex === stepList.length) { finish(); return; }
	stepList[stepIndex](() => runNext(stepIndex + 1));
};
runNext(0);
