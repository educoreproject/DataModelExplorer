#!/usr/bin/env node
'use strict';

// query-embedding-stable.test.js — the Voyage query embedder is not deterministic (two vectors about 0.001 apart for one
// text, measured 2026-10-23), so two identical searches could order near-tied rows differently. hybridRetrieval.js keeps
// the FIRST vector a query text gets. Hermetic: a fake embedder that alternates between two vectors, as Voyage was seen to.
//   (a) the same text asked twice gets the SAME vector, and the embedder is called once
//   (b) a different text is embedded on its own (the cache never hands one text's vector to another)
//   (c) an embedder failure is reported by name and nothing is kept for that text
// RED TWIN, in memory (the module's text mutated and compiled fresh), observed: cacheBypassed -> (a).
//
//   node cli/lib.d/data-model-explorer/test/query-embedding-stable.test.js

const fs = require('fs');
const path = require('path');
const Module = require('module');

const moduleFilePath = path.join(__dirname, '..', 'lib', 'hybridRetrieval.js');
const moduleText = fs.readFileSync(moduleFilePath, 'utf8');

const compiledModuleOf = (mutationList) => {
	const mutatedText = mutationList.reduce((soFar, { find, replace }) => {
		if (soFar.split(find).length !== 2) {
			throw new Error(`query-embedding-stable.test: twin find-text must match exactly once: ${JSON.stringify(find).slice(0, 100)}`);
		}
		return soFar.replace(find, replace);
	}, moduleText);
	const freshModule = new Module(moduleFilePath, module);
	freshModule.filename = moduleFilePath;
	freshModule.paths = Module._nodeModulePaths(path.dirname(moduleFilePath));
	freshModule._compile(mutatedText, moduleFilePath);
	return freshModule.exports;
};

// alternates between two vectors on every call, the way the live embedder was measured to
const alternatingEmbedderOf = () => {
	const embedder = { callCount: 0 };
	embedder.embed = (textList, callback) => {
		embedder.callCount++;
		callback('', [embedder.callCount % 2 === 1 ? [0.5, 0.5] : [0.501, 0.499]]);
	};
	return embedder;
};
const failingEmbedder = { embed: (textList, callback) => callback('quota exceeded') };

// runs (a), (b), (c) against one compiled module and returns the verdict per conjunct
const conjunctVerdictOf = (hybridRetrieval, callback) => {
	const embedder = alternatingEmbedderOf();
	hybridRetrieval.embedQueryText('student birth date', embedder, (firstError, firstVector) => {
		hybridRetrieval.embedQueryText('student birth date', embedder, (secondError, secondVector) => {
			const sameVector = !firstError && !secondError && JSON.stringify(firstVector) === JSON.stringify(secondVector) && embedder.callCount === 1;
			hybridRetrieval.embedQueryText('course title', embedder, (otherError, otherVector) => {
				const ownVector = !otherError && embedder.callCount === 2 && JSON.stringify(otherVector) !== JSON.stringify(firstVector);
				hybridRetrieval.embedQueryText('never embedded', failingEmbedder, (failError) => {
					hybridRetrieval.embedQueryText('never embedded', embedder, (retryError) => {
						const failureNamedNotKept = /Embedding the query failed: quota exceeded/.test(String(failError)) && !retryError && embedder.callCount === 3;
						callback({ sameVector, ownVector, failureNamedNotKept, callCount: embedder.callCount });
					});
				});
			});
		});
	});
};

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ' — ' + detailText : ''}`);
};

conjunctVerdictOf(compiledModuleOf([]), (verdict) => {
	ok('(a) the same text asked twice gets the same vector, embedded once', verdict.sameVector, JSON.stringify(verdict));
	ok('(b) a different text is embedded on its own', verdict.ownVector, JSON.stringify(verdict));
	ok('(c) an embedder failure is reported by name and nothing is kept for that text', verdict.failureNamedNotKept, JSON.stringify(verdict));
	const cacheBypassed = [{ find: '	if (queryEmbeddingByText.has(queryText)) {', replace: '	if (false) {' }];
	conjunctVerdictOf(compiledModuleOf(cacheBypassed), (twinVerdict) => {
		ok('RED TWIN cacheBypassed -> (a) observed FAIL', !twinVerdict.sameVector, JSON.stringify(twinVerdict));
		console.log(`\n=== query-embedding-stable — Results: ${passed} passed, ${failed} failed ===`);
		process.exit(failed > 0 ? 1 : 0);
	});
});
