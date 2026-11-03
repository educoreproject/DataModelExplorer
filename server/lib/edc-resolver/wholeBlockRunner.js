#!/usr/bin/env node
'use strict';

// wholeBlockRunner — spawns resolveOneUri.js for the whole-block kinds and the slow listings: one child at a time, a heap cap, a timeout (edcResolverEndpoint-110226, briefing
// section 4). The API only pipes bytes; it never holds a block.
//
//   wholeBlockRunnerFor({ wholeBlockMaxOldSpaceMegabytes, wholeBlockTimeoutMilliseconds, xLog }) → { isBusy, runOneChild }
//   runOneChild({ childInput, whenClientGone }, callback) → callback once; whenClientGone(handler) registers what stops the child:
//       callback('', { httpStatus, deliverTo(xRes) })     the child's header line arrived; deliverTo pipes the rest and ends xRes
//       callback({ httpStatus, errorText })               it never answered: 504 timed out, 500 died (heap cap, crash), by name
// A child that dies AFTER its header line has already promised a status, so deliverTo destroys the response: the client sees a broken transfer, never
// a truncated body that looks whole. A client that goes away stops the child. Child streams are the one place this module uses events; there is no other way to read them.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const { spawn } = require('child_process');
const path = require('path');

const CHILD_SCRIPT_PATH = path.join(__dirname, 'resolveOneUri.js');
const NEWLINE_BYTE = 10;
const STDERR_KEPT_CHARACTER_COUNT = 2000;

const wholeBlockRunnerFor = ({ wholeBlockMaxOldSpaceMegabytes, wholeBlockTimeoutMilliseconds, xLog }) => {
	let childIsRunning = false;

	const runOneChild = ({ childInput, whenClientGone }, callback) => {
		childIsRunning = true;
		const child = spawn(process.execPath, [`--max-old-space-size=${wholeBlockMaxOldSpaceMegabytes}`, CHILD_SCRIPT_PATH], { stdio: ['pipe', 'pipe', 'pipe'] });
		let hasTimedOut = false;
		let hasAnswered = false;
		let stderrTail = '';
		let headerBuffer = Buffer.alloc(0);
		let responseBeingDelivered = null;

		// a client gone before the header line, or during delivery, stops the child; otherwise it would block on a full pipe until its timeout, holding the one slot
		whenClientGone(() => {
			if (child.exitCode === null && child.signalCode === null) {
				child.kill('SIGKILL');
			}
		});

		const answerOnce = (errorAnswer, answer) => {
			if (!hasAnswered) {
				hasAnswered = true;
				callback(errorAnswer, answer);
			}
		};
		const timeoutTimer = setTimeout(() => {
			hasTimedOut = true;
			child.kill('SIGKILL');
		}, wholeBlockTimeoutMilliseconds);

		child.stderr.setEncoding('utf8');
		child.stderr.on('data', (stderrChunk) => {
			stderrTail = `${stderrTail}${stderrChunk}`.slice(-STDERR_KEPT_CHARACTER_COUNT);
		});
		child.stdin.on('error', () => {}); // a child that died before reading its input is reported by 'close' below
		child.stdin.end(JSON.stringify(childInput));

		const readHeaderChunk = (stdoutChunk) => {
			headerBuffer = Buffer.concat([headerBuffer, stdoutChunk]);
			const newlineIndex = headerBuffer.indexOf(NEWLINE_BYTE);
			if (newlineIndex === -1) {
				return;
			}
			child.stdout.removeListener('data', readHeaderChunk);
			child.stdout.pause();
			const headerMatch = /^\{"httpStatus":([1-5][0-9][0-9])\}$/.exec(headerBuffer.subarray(0, newlineIndex).toString('utf8'));
			if (headerMatch === null) {
				child.kill('SIGKILL');
				answerOnce({ httpStatus: 500, errorText: `${moduleName}: the whole-block child's first line is not its header` });
				return;
			}
			const leadingBuffer = headerBuffer.subarray(newlineIndex + 1);
			answerOnce('', {
				httpStatus: Number(headerMatch[1]),
				deliverTo: (xRes) => {
					responseBeingDelivered = xRes;
					xRes.write(leadingBuffer);
					child.stdout.pipe(xRes, { end: false });
				},
			});
		};
		child.stdout.on('data', readHeaderChunk);

		child.on('error', (spawnError) => {
			answerOnce({ httpStatus: 500, errorText: `${moduleName}: the whole-block child could not start: ${spawnError.message}` });
		});
		child.on('close', (exitCode, signalName) => {
			clearTimeout(timeoutTimer);
			childIsRunning = false;
			if (exitCode !== 0) {
				xLog.error(`${moduleName}: child ended exit=${exitCode} signal=${signalName} timedOut=${hasTimedOut}: ${stderrTail}`);
			}
			if (hasTimedOut) {
				answerOnce({ httpStatus: 504, errorText: `${moduleName}: the whole-block child was stopped at its ${wholeBlockTimeoutMilliseconds} ms timeout` });
			} else {
				answerOnce({ httpStatus: 500, errorText: `${moduleName}: the whole-block child ended without answering (exit ${exitCode}, signal ${signalName}); its heap cap is ${wholeBlockMaxOldSpaceMegabytes} MB` });
			}
			if (responseBeingDelivered !== null) {
				if (exitCode === 0 && !hasTimedOut) {
					responseBeingDelivered.end();
				} else {
					responseBeingDelivered.destroy();
				}
			}
		});
	};

	return { isBusy: () => childIsRunning, runOneChild };
};

module.exports = { wholeBlockRunnerFor, moduleName };
