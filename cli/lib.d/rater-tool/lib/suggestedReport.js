'use strict';

// suggestedReport.js — suggested-report.md: list sizes, overlap between the two methods, collapse counts and (revision 3)
// the gold injection per standard. No clock.
//
//   writeSuggestedReport({ reportFilePath, suggestedDocument, legReportList, sampleDocument })

const fs = require('fs');

const tableOf = (headerList, rowList) =>
	[`| ${headerList.join(' | ')} |`, `|${headerList.map((headerText, position) => (position === 0 ? ':---' : '---:')).join('|')}|`, ...rowList.map((cellList) => `| ${cellList.join(' | ')} |`)].join('\n');

const writeSuggestedReport = ({ reportFilePath, suggestedDocument, legReportList, sampleDocument }) => {
	const entryList = Object.values(suggestedDocument.suggestedByElementStableId);
	const standardNameList = Array.from(new Set(sampleDocument.elementList.map((element) => element.standard)));
	const standardOf = sampleDocument.elementList.reduce((soFar, element) => ({ ...soFar, [element.elementStableId]: element.standard }), {});
	const cardCountDistribution = entryList.reduce((soFar, entry) => ({ ...soFar, [entry.cardCount]: (soFar[entry.cardCount] || 0) + 1 }), {});
	const methodShareOf = (filterFunction) => {
		const cardList = entryList.filter(filterFunction).reduce((soFar, entry) => soFar.concat(entry.cardList), []);
		const countWhere = (testFunction) => cardList.filter(testFunction).length;
		return [cardList.length, countWhere((card) => card.foundByMethod.length === 2), countWhere((card) => card.foundByMethod.length === 1 && card.foundByMethod[0] === 'meaning'), countWhere((card) => card.foundByMethod.length === 1 && card.foundByMethod[0] === 'words')];
	};
	const goldRowOf = (filterFunction, rowName) => {
		const mappedLegReportList = legReportList.filter((legReport) => legReport.isMappedInGold && filterFunction(legReport));
		const sumWhere = (fieldName) => mappedLegReportList.reduce((soFar, legReport) => soFar + legReport[fieldName], 0);
		const onSearchListCount = mappedLegReportList.filter((legReport) => legReport.goldTupleCount - legReport.goldInjectedTupleCount > 0).length;
		return [rowName, mappedLegReportList.length, onSearchListCount, mappedLegReportList.length - onSearchListCount, mappedLegReportList.filter((legReport) => legReport.goldInjectedTupleCount > 0).length, sumWhere('goldTupleCount'), sumWhere('goldInjectedTupleCount'), sumWhere('goldInjectedCardCount'), sumWhere('displacedCardCount'), mappedLegReportList.filter((legReport) => legReport.goldCardOverCapCount > 0).length];
	};
	const sumOf = (fieldName) => legReportList.reduce((soFar, legReport) => soFar + legReport[fieldName], 0);
	const sectionList = [
		'# CEDS Rater: suggested candidate lists report',
		'',
		`*Written by \`raterTool.js -buildSuggested\`. Gold: \`${suggestedDocument.goldenContainerName}\`. Sample seed: \`${suggestedDocument.sampleSeedText}\`. ${entryList.length} elements.*`,
		'',
		'## 1. The rules',
		'',
		suggestedDocument.suggestRules._comment,
		'',
		`Per method: top ${suggestedDocument.suggestRules.perMethodCount}. Cap: ${suggestedDocument.suggestRules.cardCap} cards. Interleave order: ${suggestedDocument.suggestRules.methodOrderList.join(', ')}. Words join: ${suggestedDocument.suggestRules.wordJoinName.toUpperCase()}.`,
		'',
		'## 2. List sizes',
		'',
		tableOf(['cards in the list', 'elements'], Object.keys(cardCountDistribution).map(Number).sort((countA, countB) => countA - countB).map((cardCount) => [cardCount, cardCountDistribution[cardCount]])),
		'',
		tableOf(['method', 'elements with a full top 15', 'elements with fewer', 'elements with none'], ['meaning', 'words'].map((methodName) => [
			methodName,
			legReportList.filter((legReport) => legReport.rankedCountByMethod[methodName] >= suggestedDocument.suggestRules.perMethodCount).length,
			legReportList.filter((legReport) => legReport.rankedCountByMethod[methodName] > 0 && legReport.rankedCountByMethod[methodName] < suggestedDocument.suggestRules.perMethodCount).length,
			legReportList.filter((legReport) => legReport.rankedCountByMethod[methodName] === 0).length,
		])),
		'',
		'## 3. Overlap between the methods (cards kept)',
		'',
		tableOf(['standard', 'cards', 'found by both', 'meaning only', 'words only'], [...standardNameList.map((standardName) => [standardName, ...methodShareOf((entry) => standardOf[entry.elementStableId] === standardName)]), ['all', ...methodShareOf(() => true)]]),
		'',
		'## 4. Merging',
		'',
		`- the same tuple found by both methods (counted once): ${sumOf('duplicateTupleCount')}`,
		`- a different tuple with an identical card (same class + property + qualifiers), collapsed into the card: ${sumOf('collapsedTupleCount')}`,
		`- distinct search cards ranked beyond the cap of ${suggestedDocument.suggestRules.cardCap} (before the gold injection): ${sumOf('overCapCount')}`,
		`- cards carrying more than one tuple id: ${entryList.reduce((soFar, entry) => soFar + entry.cardList.filter((card) => card.cedsTupleIdList.length > 1).length, 0)}`,
		`- cards with a qualifier: ${entryList.reduce((soFar, entry) => soFar + entry.cardList.filter((card) => card.qualifierNameList.length > 0).length, 0)}`,
		`- cards without a CEDS ID: ${entryList.reduce((soFar, entry) => soFar + entry.cardList.filter((card) => !card.cedsId).length, 0)}`,
		'',
		'## 5. Gold injection (revision 3)',
		'',
		'TQ-approved exception to "no machine results": every property-tier tuple the gold maps a mapped element to is on that element\'s list. A gold tuple the searches had not put on the list is injected as an ordinary card; when the list then passes the cap, the lowest-ranked non-gold cards (the last taken in interleave order) leave. "Gold on the search list" counts mapped items whose search-built list (revision 2) already held at least one gold tuple. A gold tuple ranked by a search but beyond the cap counts as injected.',
		'',
		tableOf(['standard', 'mapped items', 'gold on the search list', 'none on it', 'items touched', 'gold tuples', 'tuples injected', 'cards injected', 'cards displaced', 'gold cards over the cap'], [...standardNameList.map((standardName) => goldRowOf((legReport) => legReport.standard === standardName, standardName)), goldRowOf(() => true, 'all')]),
		'',
		`- gold tuples that are not property-tier (not cards; reported, not injected): ${legReportList.reduce((soFar, legReport) => soFar + legReport.goldNonCardTupleIdList.length, 0)}`,
		`- unmapped items: no gold tuple is asked for; their lists are the search-built lists unchanged`,
		'',
	];
	fs.writeFileSync(reportFilePath, `${sectionList.join('\n')}\n`);
};

module.exports = { writeSuggestedReport };
