#!/usr/bin/env node
'use strict';

// hybrid-retrieval-fusion.test.js — lane BM25 (2026-10-10): the pure half of lib/hybridRetrieval.js, which both search verbs
// rank through. Hermetic (no graph, no embedder).
//   (a) fuseRankedLegs is reciprocal rank fusion: fusedScore = sum over the legs that found a node of 1 / (k + rank), the
//       rank 1-based in its leg; a node both legs found outranks one a single leg found at the same rank
//   (b) every fused row carries its provenance: foundByLegList (sorted), each leg's rank and raw score, null where that
//       leg did not find it — a reader can always say which leg found a node
//   (c) the order is total: equal fusedScores go to the better single-leg rank, then to stableId
//   (d) keywordQueryTextFor asks for EVERY word (AND), escapes Lucene's operator characters, and lower-cases a word spelled
//       AND / OR / NOT so the user's text is never parsed as an operator
//   (e) the modes are the declared ones (hybrid = keyword + vector, keyword, vector); anything else names no leg list
//   (f) a missing or negative rrfConstant is refused by name, never defaulted
// RED TWINS, in memory (the module's text mutated and compiled fresh), each observed: scoresFusedNotRanks -> (a);
// provenanceDropped -> (b); tieBreakRemoved -> (c); orNotAnd -> (d); escapeSkipped -> (d); operatorWordPassedThrough -> (d);
// modeTableBypassed -> (e); rrfConstantUnchecked -> (f).
//
//   node cli/lib.d/data-model-explorer/test/hybrid-retrieval-fusion.test.js

const fs = require('fs');
const path = require('path');
const Module = require('module');

const moduleFilePath = path.join(__dirname, '..', 'lib', 'hybridRetrieval.js');
const moduleText = fs.readFileSync(moduleFilePath, 'utf8');

// compile the module's text (mutated or not) as a fresh module in its own directory, so its requires resolve as the real one's
const compiledModuleOf = (mutationList) => {
	const mutatedText = mutationList.reduce((soFar, { find, replace }) => {
		if (soFar.split(find).length !== 2) {
			throw new Error(`hybrid-retrieval-fusion.test: twin find-text must match exactly once: ${JSON.stringify(find).slice(0, 100)}`);
		}
		return soFar.replace(find, replace);
	}, moduleText);
	const freshModule = new Module(moduleFilePath, module);
	freshModule.filename = moduleFilePath;
	freshModule.paths = Module._nodeModulePaths(path.dirname(moduleFilePath));
	freshModule._compile(mutatedText, moduleFilePath);
	return freshModule.exports;
};

const legRowListByName = {
	keyword: [{ stableId: 'k1', name: 'BirthDate', legScore: 12.5 }, { stableId: 'both', name: 'Birthdate', legScore: 9.0 }],
	vector: [{ stableId: 'both', name: 'Birthdate', legScore: 0.91 }, { stableId: 'v2', name: 'Date of Birth', legScore: 0.88 }],
};

const conjunctList = [
	['a_reciprocalRankFusion', (hybrid) => {
		const fusedRowList = hybrid.fuseRankedLegs({ legRowListByName, rrfConstant: 60 });
		const scoreOf = (stableId) => fusedRowList.find((oneRow) => oneRow.stableId === stableId).fusedScore;
		const pass = fusedRowList[0].stableId === 'both' && Math.abs(scoreOf('both') - (1 / 62 + 1 / 61)) < 1e-12 && Math.abs(scoreOf('k1') - 1 / 61) < 1e-12 && Math.abs(scoreOf('v2') - 1 / 62) < 1e-12;
		return { pass, detail: JSON.stringify(fusedRowList.map((oneRow) => [oneRow.stableId, oneRow.fusedScore])) };
	}],
	['b_everyRowCarriesItsProvenance', (hybrid) => {
		const fusedRowList = hybrid.fuseRankedLegs({ legRowListByName, rrfConstant: 60 });
		const rowOf = (stableId) => fusedRowList.find((oneRow) => oneRow.stableId === stableId);
		const both = rowOf('both');
		const keywordOnly = rowOf('k1');
		const vectorOnly = rowOf('v2');
		const pass = JSON.stringify(both.foundByLegList) === '["keyword","vector"]' && both.keywordRank === 2 && both.keywordScore === 9 && both.vectorRank === 1 && both.vectorScore === 0.91
			&& JSON.stringify(keywordOnly.foundByLegList) === '["keyword"]' && keywordOnly.vectorRank === null && keywordOnly.vectorScore === null
			&& JSON.stringify(vectorOnly.foundByLegList) === '["vector"]' && vectorOnly.keywordRank === null && vectorOnly.keywordScore === null
			&& !('legScore' in both) && both.name === 'Birthdate';
		return { pass, detail: JSON.stringify(fusedRowList) };
	}],
	['c_orderIsTotal', (hybrid) => {
		// k1 (keyword rank 1) and v1 (vector rank 1) tie exactly; then x (keyword 2) and y (vector 2) tie: stableId decides
		const tiedRowList = hybrid.fuseRankedLegs({ legRowListByName: { keyword: [{ stableId: 'zk', legScore: 3 }, { stableId: 'x', legScore: 1 }], vector: [{ stableId: 'av', legScore: 0.9 }, { stableId: 'y', legScore: 0.8 }] }, rrfConstant: 60 });
		const pass = JSON.stringify(tiedRowList.map((oneRow) => oneRow.stableId)) === '["av","zk","x","y"]';
		return { pass, detail: JSON.stringify(tiedRowList.map((oneRow) => oneRow.stableId)) };
	}],
	['d_keywordQueryIsEveryWordEscaped', (hybrid) => {
		const queryText = hybrid.keywordQueryTextFor('  Date of  Birth ');
		const escapedText = hybrid.keywordQueryTextFor('Person/BirthDate (x:y)');
		const operatorText = hybrid.keywordQueryTextFor('cats AND dogs NOT OR');
		const pass = queryText === 'Date AND of AND Birth' && escapedText === 'Person\\/BirthDate AND \\(x\\:y\\)' && operatorText === 'cats AND and AND dogs AND not AND or';
		return { pass, detail: `${queryText} | ${escapedText} | ${operatorText}` };
	}],
	['e_modesAreTheDeclaredOnes', (hybrid) => {
		const pass = JSON.stringify(hybrid.searchLegListFor('hybrid')) === '["keyword","vector"]' && JSON.stringify(hybrid.searchLegListFor('keyword')) === '["keyword"]' && JSON.stringify(hybrid.searchLegListFor('vector')) === '["vector"]' && hybrid.searchLegListFor('bm25') === null && hybrid.searchLegListFor('toString') === null;
		return { pass, detail: JSON.stringify(['hybrid', 'keyword', 'vector', 'bm25', 'toString'].map(hybrid.searchLegListFor)) };
	}],
	['f_rrfConstantRequired', (hybrid) => {
		const refusalTextOf = (rrfConstant) => {
			let thrownText = '';
			try { hybrid.fuseRankedLegs({ legRowListByName, rrfConstant }); } catch (fuseError) { thrownText = fuseError.message; }
			return thrownText;
		};
		const pass = /rrfConstant must be a non-negative number; got undefined/.test(refusalTextOf(undefined)) && /got -1/.test(refusalTextOf(-1));
		return { pass, detail: `${refusalTextOf(undefined)} | ${refusalTextOf(-1)}` };
	}],
];

const TWIN_LIST = [
	{ conjunctName: 'a_reciprocalRankFusion', twinName: 'scoresFusedNotRanks', find: 'fusedRow.fusedScore += 1 / (rrfConstant + legRank);', replace: 'fusedRow.fusedScore += plainNumberOf(legScore);' },
	{ conjunctName: 'b_everyRowCarriesItsProvenance', twinName: 'provenanceDropped', find: "\t\t\tfusedRow[`${legName}Rank`] = legRank;\n", replace: '' },
	{ conjunctName: 'c_orderIsTotal', twinName: 'tieBreakRemoved', find: ' || bestLegRankOf(rowA) - bestLegRankOf(rowB) || (rowA.stableId < rowB.stableId ? -1 : rowA.stableId > rowB.stableId ? 1 : 0)', replace: '' },
	{ conjunctName: 'd_keywordQueryIsEveryWordEscaped', twinName: 'orNotAnd', find: ".join(' AND ');", replace: ".join(' ');" },
	{ conjunctName: 'd_keywordQueryIsEveryWordEscaped', twinName: 'escapeSkipped', find: ': escapeLuceneQueryText(oneWord)))', replace: ': oneWord))' },
	{ conjunctName: 'd_keywordQueryIsEveryWordEscaped', twinName: 'operatorWordPassedThrough', find: '(LUCENE_OPERATOR_WORD_PATTERN.test(oneWord) ? oneWord.toLowerCase() :', replace: '(false ? oneWord.toLowerCase() :' },
	{ conjunctName: 'e_modesAreTheDeclaredOnes', twinName: 'modeTableBypassed', find: '(Object.prototype.hasOwnProperty.call(SEARCH_MODE_LEG_LIST_BY_NAME, searchMode) ? SEARCH_MODE_LEG_LIST_BY_NAME[searchMode] : null)', replace: '(SEARCH_MODE_LEG_LIST_BY_NAME[searchMode] || null)' },
	{ conjunctName: 'f_rrfConstantRequired', twinName: 'rrfConstantUnchecked', find: 'if (!Number.isFinite(rrfConstant) || rrfConstant < 0) {', replace: 'if (false) {' },
];

let passed = 0;
let failed = 0;
const assert = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ' — ' + detailText : ''}`);
};

console.log('\n=== hybrid retrieval fusion (lane BM25) ===\n');
const realModule = compiledModuleOf([]);
conjunctList.forEach(([conjunctName, judge]) => {
	const verdict = judge(realModule);
	assert(`${conjunctName}`, verdict.pass, verdict.detail);
});
console.log('\n--- red twins (each must FAIL its conjunct) ---');
assert('every conjunct has a twin', conjunctList.every(([conjunctName]) => TWIN_LIST.some((oneTwin) => oneTwin.conjunctName === conjunctName)));
TWIN_LIST.forEach((oneTwin) => {
	const judge = conjunctList.find(([conjunctName]) => conjunctName === oneTwin.conjunctName)[1];
	const verdict = judge(compiledModuleOf([{ find: oneTwin.find, replace: oneTwin.replace }]));
	assert(`${oneTwin.conjunctName} observed RED under '${oneTwin.twinName}'`, !verdict.pass, verdict.detail);
	console.log(`    RED-OBSERVED ${oneTwin.conjunctName} twin='${oneTwin.twinName}' → ${verdict.pass ? 'STILL PASSING' : 'FAIL'}: ${verdict.detail.slice(0, 160)}`);
});
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
