'use strict';

// grepRegex.js — dme_grep's regex matching, inside a time limit the DME can enforce (lane GREP, 2026-10-11).
//
// WHY NOT Cypher =~: measured on GOLD_EVAL_261010_forgeClean, a backtracking pattern inside one =~ evaluation ignored the
// transaction timeout (asked 3 s) and TERMINATE TRANSACTIONS alike, and held a CPU core until the container was restarted.
// A hostile pattern there is a hung GRAPH, whatever the DME tells the model. Here the graph only reads the field texts (a
// plain scan, bounded by its own transaction timeout), and the pattern runs in a worker thread that is TERMINATED at the
// limit: V8 stops a running regex when its isolate is terminated (measured: a 300-character backtracking match ended at
// the 2 s limit, where Neo4j's ran on).
//
//   matchRowsByRegex({ patternText, flagText, rowFieldTextListList, timeLimitMilliseconds }, callback)
//     callback('', { matchList })        [[rowIndex, [matchedFieldIndex, ...]], ...], rows in input order
//     callback('', { compileErrorText }) the pattern does not compile (V8's own message)
//     callback('', { timedOut: true })   the limit passed first; the worker is terminated before the callback
//     callback(errorText)                the worker failed for any other reason

const path = require('path');
const { Worker } = require('worker_threads');

const WORKER_FILE_PATH = path.join(__dirname, 'grepRegexWorker.js');
const REGEX_COMPILE_ERROR_MESSAGE_PATTERN = /^Invalid regular expression/;

const matchRowsByRegex = ({ patternText, flagText, rowFieldTextListList, timeLimitMilliseconds }, callback) => {
	const regexWorker = new Worker(WORKER_FILE_PATH, { workerData: { patternText, flagText, rowFieldTextListList } });
	// the first of message / error / time limit answers; the worker is always terminated before the callback runs
	let answered = false;
	const answerOnce = (errorText, outcome) => {
		if (answered) {
			return;
		}
		answered = true;
		clearTimeout(limitTimer);
		regexWorker.terminate().then(
			() => callback(errorText, outcome),
			(terminateError) => callback(`terminating the grep regex worker failed: ${terminateError.message}`),
		);
	};
	const limitTimer = setTimeout(() => answerOnce('', { timedOut: true }), timeLimitMilliseconds);
	regexWorker.on('message', (matchList) => answerOnce('', { matchList }));
	regexWorker.on('error', (workerError) =>
		workerError.name === 'SyntaxError' && REGEX_COMPILE_ERROR_MESSAGE_PATTERN.test(workerError.message)
			? answerOnce('', { compileErrorText: workerError.message })
			: answerOnce(`the grep regex worker failed: ${workerError.message}`));
};

module.exports = { matchRowsByRegex };
