'use strict';

// grepRegexWorker.js — the worker thread dme_grep's regex mode matches in (lane GREP, 2026-10-11). It runs in a worker so
// the DME can STOP it: a backtracking pattern can spend minutes on one string, and only terminating the thread ends that
// (lib/grepRegex.js holds the time limit). workerData: { patternText, flagText, rowFieldTextListList } where each row is the
// list of its field texts in field order, a text being a string, a list of strings (one CEDS description is a list), or null.
// Posts [[rowIndex, [matchedFieldIndex, ...]], ...] for the rows any field matched.
//
// An invalid pattern makes `new RegExp` throw a SyntaxError here; the parent reads it from the worker's 'error' event and
// answers invalidRegex. That is the compile check: there is no other way to ask V8 whether a pattern compiles.

const { parentPort, workerData } = require('worker_threads');

const { patternText, flagText, rowFieldTextListList } = workerData;
const compiledPattern = new RegExp(patternText, flagText);

const fieldTextMatches = (fieldText) => (Array.isArray(fieldText) ? fieldText.some((oneText) => typeof oneText === 'string' && compiledPattern.test(oneText)) : typeof fieldText === 'string' && compiledPattern.test(fieldText));

const matchList = [];
rowFieldTextListList.forEach((fieldTextList, rowIndex) => {
	const matchedFieldIndexList = [];
	fieldTextList.forEach((fieldText, fieldIndex) => {
		if (fieldTextMatches(fieldText)) {
			matchedFieldIndexList.push(fieldIndex);
		}
	});
	if (matchedFieldIndexList.length > 0) {
		matchList.push([rowIndex, matchedFieldIndexList]);
	}
});
parentPort.postMessage(matchList);
