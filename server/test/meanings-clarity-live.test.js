'use strict';
// meanings-clarity-live.test.js — WORKORDER-meaningsClarity-111126 gate 1 (and Addendum A) on the LIVE golden, the access points built as the server builds them
// (lib/explorerLiveHarness.js), nothing stubbed but the usage table:
//   1. C200159's meanings level lists the meaning of another domain that names it (Individualized Program's "Has Individualized Program Accessibility Feature", as its
//      range), counted apart, with the walk's path to it in its own domain
//   2. the P000385 meaning holds 48 values: its row in C200159 says so, its own level lists 48, its node says 48
//   3. COUNTS MATCH THE NEXT LEVEL: for C200159 and a sample of CEDS and CTDL domains, each domain's row in its hub counts exactly what its own level lists
//   4. ADDENDUM A: for C200159, P000385 and one of its values (NI000385928242), the explorer's meaning facts (the Standards Explorer's node, and C200159's meanings
//      level) are the URI page's, line for line: every line's name, depth, count and words, and the total
//   5. the reads stay quick: a domain level with 62 meanings and 10,948 values under 2 s, the CTDL hub's 137 domains with their incoming counts under 2 s
// Needs the local golden and the qbook config; with no graph it SKIPs by name. SUBJECT_SERVER_PATH=<another tree's server dir> runs it there (the base, to watch it fail).
// Run: /Users/tqwhite/.local/node/bin/node server/test/meanings-clarity-live.test.js

const { Writable } = require('stream');
const { goldenHandle, branchLibrary, GATE_WAIT_MILLISECONDS, GATE_WAIT_LIMIT } = require('./lib/explorerLiveHarness');

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${String(detailText).slice(0, 700)}` : ''}`);
};
const finish = () => {
	console.log(`\n${passed} passed, ${failed} failed`);
	process.exit(failed ? 1 : 0);
};

const C200159 = 'https://w3id.org/CEDStandards/terms/C200159';
const C200157 = 'https://w3id.org/CEDStandards/terms/C200157';
const P000385 = 'https://w3id.org/CEDStandards/terms/P000385';
const VALUE_ELEMENT = 'https://w3id.org/CEDStandards/terms/NI000385928242';
const LARGE_VALUE_DOMAIN = 'https://w3id.org/CEDStandards/terms/C200228';
const EDC_PATH_BY_ELEMENT = { [C200159]: '/CEDS/14.0.0.0/ceds:C200159', [P000385]: '/CEDS/14.0.0.0/ceds:P000385', [VALUE_ELEMENT]: '/CEDS/14.0.0.0/ceds:NI000385928242' };
// a sample of every hub's domains, as each hub lists them (its first, its middle, its last), plus named ones: Organization is the range of 692 CTDL meanings
const NAMED_SAMPLE_DOMAIN_LIST = [C200159, LARGE_VALUE_DOMAIN, 'ceterms:Organization'];
const DOMAIN_LEVEL_MILLISECOND_LIMIT = 2000;
const HUB_LEVEL_MILLISECOND_LIMIT = 2000;

const timedNode = (stableId, callback) => {
	const startMilliseconds = Date.now();
	branchLibrary['standards-neighbourhood']({ action: 'node', stableId }, (nodeError, neighbourhood) => callback(nodeError, neighbourhood, Date.now() - startMilliseconds));
};
const groupOf = (neighbourhood, relationshipType) => neighbourhood.childGroupList.find((oneGroup) => oneGroup.relationshipType === relationshipType) || { count: 0, itemList: [] };
// the URI page as the resolver renders it, and its meaning lines (data-meaning-line, data-depth, data-count, and the words before the count)
const uriPageLinesOf = (elementStableId, callback) =>
	branchLibrary['edc-resolver']({ edcRequestPath: EDC_PATH_BY_ELEMENT[elementStableId], answerFormat: 'html', whenClientGone: () => {} }, (resolveError, resolverAnswer) => {
		if (resolveError) { callback(resolveError); return; }
		if (resolverAnswer.deliverTo) {
			// an element with many siblings is answered by the resolver's child, streamed as the /edc/ route streams it
			const chunkList = [];
			const responseSink = new Writable({ write: (chunk, encoding, written) => { chunkList.push(chunk); written(); } });
			responseSink.on('finish', () => callback('', linesOfPage(Buffer.concat(chunkList).toString('utf8'))));
			resolverAnswer.deliverTo(responseSink);
			return;
		}
		callback(resolverAnswer.bodyText ? '' : `no page body (HTTP ${resolverAnswer.httpStatus})`, resolverAnswer.bodyText ? linesOfPage(resolverAnswer.bodyText) : null);
	});
const linesOfPage = (pageText) => {
		const lineList = Array.from((pageText.split('data-testid="meaning-lines"')[1] || '').split('</ul>')[0].matchAll(/data-meaning-line="([^"]*)" data-depth="(\d)" data-count="(\d+)">([^<]*) <span class="count">/g))
			.map((lineMatch) => ({ lineName: lineMatch[1], depth: Number(lineMatch[2]), meaningCount: Number(lineMatch[3]), lineText: lineMatch[4].replace(/&#39;/g, "'").replace(/&amp;/g, '&') }));
		const totalCount = Number(((pageText.split('<summary>Meanings it contributes to')[1] || '').match(/^ <span class="count">(\d+)<\/span>/) || [])[1]);
		return { lineList, totalCount };
};
const comparableLinesOf = (meaningFacts) => (meaningFacts && meaningFacts.lineList ? meaningFacts.lineList.map(({ lineName, depth, meaningCount, lineText }) => ({ lineName, depth, meaningCount, lineText })) : null);

const stepList = [];
stepList.push((done) => {
	const waitConnected = (tryCount) => {
		if (goldenHandle.graphStateOf().graphState === 'connected') { done(); return; }
		if (tryCount >= GATE_WAIT_LIMIT) { ok('the golden handle connects within the wait', false, JSON.stringify(goldenHandle.graphStateOf())); finish(); return; }
		setTimeout(() => waitConnected(tryCount + 1), GATE_WAIT_MILLISECONDS);
	};
	waitConnected(0);
});

const levelByStableId = {};
stepList.push((done) => timedNode(`meaningDomain:${C200159}`, (nodeError, domainLevel) => {
	console.log('\n=== 1. C200159: the meaning of another domain that names it ===');
	if (nodeError) { ok('C200159\'s meanings level answers', false, nodeError); done(); return; }
	levelByStableId[C200159] = domainLevel;
	const incomingGroup = groupOf(domainLevel, 'HAS_INCOMING_MEANING');
	ok('its level lists 1 meaning of another domain, and counts it apart', incomingGroup.count === 1 && domainLevel.node.incomingMeaningCount === 1 && domainLevel.node.meaningCount === 4 && domainLevel.node.termMeaningCount === 1,
		JSON.stringify({ incoming: incomingGroup.count, node: { meaningCount: domainLevel.node.meaningCount, termMeaningCount: domainLevel.node.termMeaningCount, incomingMeaningCount: domainLevel.node.incomingMeaningCount } }));
	const incomingItem = incomingGroup.itemList[0] || {};
	ok('it is Has Individualized Program Accessibility Feature, naming it as its range', incomingItem.name === 'Has Individualized Program Accessibility Feature' && JSON.stringify(incomingItem.incomingSlotNameList) === '["range"]', JSON.stringify(incomingItem));
	ok('it carries the walk\'s path to it in its own domain, Individualized Program (C200157)', JSON.stringify((incomingItem.meaningsWalkPathStableIdList || []).slice(0, 3)) === JSON.stringify(['meanings:all', 'meaningHub:CEDS', `meaningDomain:${C200157}`]) && incomingItem.meaningsWalkPathStableIdList[3] === incomingItem.stableId, JSON.stringify(incomingItem.meaningsWalkPathStableIdList));
	done();
}));

stepList.push((done) => {
	console.log('\n=== 2. the P000385 meaning holds 48 values ===');
	const domainLevel = levelByStableId[C200159];
	const valueHolderItem = domainLevel ? groupOf(domainLevel, 'HAS_MEANING').itemList.find((oneItem) => oneItem.name === 'Has Accessibility Feature Type') : null;
	ok('its row in C200159 says 48 values', Boolean(valueHolderItem) && valueHolderItem.valueMeaningCount === 48 && valueHolderItem.valueElementCount === 0, JSON.stringify(valueHolderItem && { valueMeaningCount: valueHolderItem.valueMeaningCount, valueElementCount: valueHolderItem.valueElementCount }));
	if (!valueHolderItem) { done(); return; }
	timedNode(valueHolderItem.stableId, (nodeError, meaningLevel) => {
		ok('its own level lists 48 values and its node says 48', !nodeError && groupOf(meaningLevel, 'HAS_VALUE_MEANING').count === 48 && meaningLevel.node.valueMeaningCount === 48, nodeError || JSON.stringify({ group: groupOf(meaningLevel, 'HAS_VALUE_MEANING').count, node: meaningLevel.node.valueMeaningCount }));
		done();
	});
});

// 3: each sampled domain's row in its hub counts what its level lists
stepList.push((done) => {
	console.log('\n=== 3. every count says what the next level shows ===');
	const rowByDomainStableId = {};
	const sampleDomainList = [...NAMED_SAMPLE_DOMAIN_LIST];
	const readHub = (hubNameList, hubIndex) => {
		if (hubIndex === hubNameList.length) { compareNext(0); return; }
		timedNode(`meaningHub:${hubNameList[hubIndex]}`, (nodeError, hubLevel, elapsedMilliseconds) => {
			if (nodeError) { ok(`the ${hubNameList[hubIndex]} hub answers`, false, nodeError); readHub(hubNameList, hubIndex + 1); return; }
			ok(`the ${hubNameList[hubIndex]} hub's ${hubLevel.childGroupList[0].count} domains, with their incoming counts, read in ${elapsedMilliseconds} ms (under ${HUB_LEVEL_MILLISECOND_LIMIT})`, elapsedMilliseconds < HUB_LEVEL_MILLISECOND_LIMIT);
			const domainItemList = hubLevel.childGroupList[0].itemList;
			domainItemList.forEach((oneItem) => { rowByDomainStableId[oneItem.stableId.slice('meaningDomain:'.length)] = oneItem; });
			[0, Math.floor(domainItemList.length / 2), domainItemList.length - 1].forEach((itemIndex) => sampleDomainList.push(domainItemList[itemIndex].stableId.slice('meaningDomain:'.length)));
			readHub(hubNameList, hubIndex + 1);
		});
	};
	const compareNext = (sampleIndex) => {
		if (sampleIndex === sampleDomainList.length) { done(); return; }
		const domainStableId = sampleDomainList[sampleIndex];
		const domainRow = rowByDomainStableId[domainStableId];
		timedNode(`meaningDomain:${domainStableId}`, (nodeError, domainLevel, elapsedMilliseconds) => {
			if (nodeError || !domainRow) { ok(`${domainStableId}: its row and its level both answer`, false, nodeError || 'no row in its hub'); compareNext(sampleIndex + 1); return; }
			const levelCountList = [groupOf(domainLevel, 'HAS_MEANING').count, groupOf(domainLevel, 'HAS_TERM_MEANING').count, groupOf(domainLevel, 'HAS_INCOMING_MEANING').count];
			const rowCountList = [domainRow.meaningCount, domainRow.termMeaningCount, domainRow.incomingMeaningCount];
			ok(`${domainLevel.node.name} (${domainStableId}): its row counts [meanings, own term, from other domains] ${JSON.stringify(rowCountList)}, as its level lists ${JSON.stringify(levelCountList)}`, JSON.stringify(rowCountList) === JSON.stringify(levelCountList));
			if (domainStableId === LARGE_VALUE_DOMAIN) ok(`${domainLevel.node.name}'s level (${domainRow.meaningCount} meanings and their values) read in ${elapsedMilliseconds} ms (under ${DOMAIN_LEVEL_MILLISECOND_LIMIT})`, elapsedMilliseconds < DOMAIN_LEVEL_MILLISECOND_LIMIT);
			compareNext(sampleIndex + 1);
		});
	};
	readHub(['CEDS', 'CTDL'], 0);
});

// 4: Addendum A — the explorer's facts are the URI page's
stepList.push((done) => {
	console.log('\n=== 4. Addendum A: the explorer and the URI page say the same ===');
	const compareNext = (elementList, elementIndex) => {
		if (elementIndex === elementList.length) { done(); return; }
		const elementStableId = elementList[elementIndex];
		branchLibrary['standards-neighbourhood']({ action: 'meaningFacts', stableId: elementStableId }, (nodeError, factsAnswer) => uriPageLinesOf(elementStableId, (pageError, uriPage) => {
			const explorerFacts = factsAnswer && factsAnswer.meaningFacts;
			const explorerLineList = comparableLinesOf(explorerFacts);
			ok(`${elementStableId.split('/').pop()}: the explorer's facts (action meaningFacts) and the URI page show the same ${uriPage ? uriPage.lineList.length : '?'} lines and total ${uriPage ? uriPage.totalCount : '?'}`,
				!nodeError && !pageError && explorerLineList && explorerLineList.length > 0 && JSON.stringify(explorerLineList) === JSON.stringify(uriPage.lineList) && explorerFacts.takesPartCount === uriPage.totalCount,
				nodeError || pageError || JSON.stringify({ explorer: explorerLineList, uriPage }));
			// the lines' own arithmetic: the section lines sum to the total, and each section's own lines (depth 1) to the section
			const lineList = (explorerFacts && explorerFacts.lineList) || [];
			const sectionLineList = lineList.filter((oneLine) => oneLine.depth === 0);
			const ownLineListOf = (sectionLine) => { const afterList = lineList.slice(lineList.indexOf(sectionLine) + 1); const nextSectionIndex = afterList.findIndex((oneLine) => oneLine.depth === 0); return nextSectionIndex === -1 ? afterList : afterList.slice(0, nextSectionIndex); };
			ok(`${elementStableId.split('/').pop()}: its section lines sum to its total (${explorerFacts ? explorerFacts.takesPartCount : '?'})`, sectionLineList.length > 0 && sectionLineList.reduce((soFar, oneLine) => soFar + oneLine.meaningCount, 0) === explorerFacts.takesPartCount);
			ok(`${elementStableId.split('/').pop()}: each section's own lines sum to the section`, sectionLineList.every((sectionLine) => { const ownLineList = ownLineListOf(sectionLine); return !ownLineList.length || ownLineList.reduce((soFar, oneLine) => soFar + oneLine.meaningCount, 0) === sectionLine.meaningCount; }),
				JSON.stringify(sectionLineList.map((sectionLine) => [sectionLine.lineName, sectionLine.meaningCount, ownLineListOf(sectionLine).map((oneLine) => oneLine.meaningCount)])));
			if (elementStableId === C200159) {
				ok('C200159: its lines put the 48 values under Has Accessibility Feature Type, and the naming meaning in Individualized Program, as its range',
					lineList.some((oneLine) => oneLine.lineName === 'valueGroup' && oneLine.depth === 1 && oneLine.meaningCount === 48 && oneLine.lineText === 'under Has Accessibility Feature Type')
					&& lineList.some((oneLine) => oneLine.lineName === 'namingGroup' && oneLine.depth === 1 && oneLine.meaningCount === 1 && oneLine.lineText === 'in Individualized Program · Has Individualized Program Accessibility Feature · as its range'), JSON.stringify(lineList));
				const domainLevelFacts = levelByStableId[C200159] && levelByStableId[C200159].node.meaningFacts;
				ok('C200159: its meanings level carries the same facts the explorer asks for apart', Boolean(domainLevelFacts) && JSON.stringify(domainLevelFacts) === JSON.stringify(explorerFacts));
				ok('C200159: 4 property meanings, 48 value meanings, 1 of another domain, its own term: 54', explorerFacts && explorerFacts.takesPartCount === 54
					&& JSON.stringify(explorerFacts.sectionList.map((oneSection) => [oneSection.sectionName, oneSection.meaningCount])) === JSON.stringify([['propertyMeanings', 4], ['valueMeanings', 48], ['namingMeanings', 1], ['ownTerm', 1], ['mappedTo', 0]]), JSON.stringify(explorerFacts && explorerFacts.sectionList));
			}
			compareNext(elementList, elementIndex + 1);
		}));
	};
	compareNext([C200159, P000385, VALUE_ELEMENT], 0);
});

// 6: ⟪review S3, S4⟫ every line links to the level that shows its count; a Standards Explorer node reads as fast as the base, its facts asked for apart
const P001637 = 'https://w3id.org/CEDStandards/terms/P001637';
const { baselineLibrary } = require('./lib/explorerLiveHarness');
const STANDARDS_NODE_SPEED_FACTOR_LIMIT = 1.5;
const VALUE_HOLDER_NAME = 'Has Accessibility Feature Type';
stepList.push((done) => {
	console.log('\n=== 6. review S3: every line links where its count is shown ===');
	branchLibrary['standards-neighbourhood']({ action: 'meaningFacts', stableId: C200159 }, (factsError, factsAnswer) => {
		const meaningFacts = factsAnswer && factsAnswer.meaningFacts;
		ok('the facts are asked for apart from the node (action meaningFacts)', !factsError && Boolean(meaningFacts) && meaningFacts.takesPartCount === 54, factsError || JSON.stringify(factsAnswer).slice(0, 200));
		if (!meaningFacts) { done(); return; }
		const valueSection = meaningFacts.sectionList.find((oneSection) => oneSection.sectionName === 'valueMeanings');
		const valueGroup = valueSection.groupList[0];
		ok('C200159: the value-meanings line (48) opens the one meaning holding them, whose level lists 48', JSON.stringify(valueSection.meaningsWalkPathStableIdList) === JSON.stringify(valueGroup.meaningsWalkPathStableIdList) && valueGroup.meaningCount === 48, JSON.stringify(valueSection.meaningsWalkPathStableIdList));
		branchLibrary['standards-neighbourhood']({ action: 'meaningFacts', stableId: P000385 }, (propertyError, propertyAnswer) => {
			const lineList = (propertyAnswer && propertyAnswer.meaningFacts && propertyAnswer.meaningFacts.lineList) || [];
			const holderLineList = lineList.filter((oneLine) => oneLine.lineName === 'namingGroup' && oneLine.lineText.includes(`${VALUE_HOLDER_NAME} and its 48 values`));
			ok(`P000385: each 49 says it is ${VALUE_HOLDER_NAME} and its 48 values`, holderLineList.length > 0 && holderLineList.every((oneLine) => oneLine.meaningCount === 49), JSON.stringify(lineList.map(({ lineText, meaningCount }) => [lineText, meaningCount])));
			const checkNext = (lineIndex) => {
				if (lineIndex === holderLineList.length) { done(); return; }
				const oneLine = holderLineList[lineIndex];
				const pathStableIdList = oneLine.meaningsWalkPathStableIdList || [];
				timedNode(pathStableIdList[pathStableIdList.length - 1], (nodeError, meaningLevel) => {
					ok(`P000385: "${oneLine.lineText}" opens that meaning, whose level lists its 48 values (48 + the meaning = ${oneLine.meaningCount})`, !nodeError && meaningLevel.node.kind === 'meaning' && meaningLevel.node.valueMeaningCount + 1 === oneLine.meaningCount, nodeError || JSON.stringify(pathStableIdList));
					checkNext(lineIndex + 1);
				});
			};
			checkNext(0);
		});
	});
});
stepList.push((done) => {
	console.log('\n=== 7. review S4: a Standards Explorer node reads as fast as the base ===');
	timedNode(P001637, (warmError) => timedNode(P001637, (nodeError, elementNode, branchMilliseconds) => {
		ok('P001637\'s node carries no meaning facts: they are asked for apart, for the panel', !warmError && !nodeError && elementNode.node.meaningFacts === undefined, nodeError || warmError);
		if (!baselineLibrary) {
			console.log(`  SKIP: BASELINE_SERVER_PATH unset; P001637 read in ${branchMilliseconds} ms on the branch, not compared with the base, and proved nothing about speed here`);
			done();
			return;
		}
		const baseNode = (callback) => { const startMilliseconds = Date.now(); baselineLibrary['standards-neighbourhood']({ action: 'node', stableId: P001637 }, (baseError) => callback(baseError, Date.now() - startMilliseconds)); };
		baseNode(() => baseNode((baseError, baseMilliseconds) => {
			ok(`P001637: the branch reads its node in ${branchMilliseconds} ms, within ${STANDARDS_NODE_SPEED_FACTOR_LIMIT}x of the base's ${baseMilliseconds} ms`, !baseError && branchMilliseconds <= Math.max(baseMilliseconds * STANDARDS_NODE_SPEED_FACTOR_LIMIT, baseMilliseconds + 20));
			done();
		}));
	}));
});

const runNext = (stepIndex) => {
	if (stepIndex === stepList.length) { finish(); return; }
	stepList[stepIndex](() => runNext(stepIndex + 1));
};
runNext(0);
