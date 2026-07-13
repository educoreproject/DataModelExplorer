#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[SlackIntegration]]

// ============================================================================
// ask-milo-relay — the /dme ask control path (DME/Slack plan v3, task 1.7)
//
// Reuses the EXACT website control path (ws-graphinator.js) with the
// Slack-shaped differences the plan specifies:
//   - spawn the repo's OWN askMilo.js via process.execPath, NO shell
//   - qtools JSON-on-stdin; the question travels ONLY in fileList
//   - singleCallPromptName=DataModelExplorer (the CEDS-anchored prompt config)
//   - DmeUserRead/DmeUserWrite force-suppressed (Standard-mode discipline);
//     never graphMode:'user', never the user-mode env branch
//   - configPath derived from process.global.configurationSourceFilePath
//   - buffered (not streaming): stdout to completion = the answer report
//   - wall-clock timeout: SIGTERM, 10s grace, SIGKILL — no orphan subprocess
//   - actual cost parsed from askMilo's stderr line
//     "Cost: $0.0123 (N input / M output) ..." (askMilo.js:876); the config
//     estimate applies only when that pattern is absent
//   - concurrency accounting (global + per-user) lives here with the spawns
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const qt = require('qtools-functional-library');
const path = require('path');
const { spawn } = require('child_process');

const SUPPRESSED_PROVIDERS = 'DmeUserRead,DmeUserWrite';
const SIGKILL_GRACE_MS = 10000;

// START OF moduleFunction() ============================================================

const moduleFunction = function ({ unused }) {
	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;

	const askMiloJsPath = path.resolve(
		__dirname,
		'../ask-milo-multitool/askMilo.js',
	);

	const askMiloConfigPath = process.global.configurationSourceFilePath
		? path.dirname(process.global.configurationSourceFilePath)
		: undefined;

	// ================================================================================
	// CONCURRENCY ACCOUNTING (owned here, next to the spawns)

	let runningCount = 0;
	const runningByUser = {};

	const getRunningCounts = () => ({
		global: runningCount,
		byUser: { ...runningByUser },
	});

	const acquireSlot = ({ slackUserId, maxConcurrent, maxPerUser }) => {
		if (runningCount >= maxConcurrent) {
			return { acquired: false, reason: 'global' };
		}
		if ((runningByUser[slackUserId] || 0) >= maxPerUser) {
			return { acquired: false, reason: 'user' };
		}
		runningCount += 1;
		runningByUser[slackUserId] = (runningByUser[slackUserId] || 0) + 1;
		return { acquired: true };
	};

	const releaseSlot = ({ slackUserId }) => {
		runningCount = Math.max(0, runningCount - 1);
		runningByUser[slackUserId] = Math.max(0, (runningByUser[slackUserId] || 1) - 1);
		if (!runningByUser[slackUserId]) {
			delete runningByUser[slackUserId];
		}
	};

	// ================================================================================
	// ASK — buffered single-call run

	const askQuestion = (
		{
			question,
			slackUserId,
			timeoutSeconds,
			maxConcurrent,
			maxPerUser,
			verbose,
			askModel,
			askPromptName,
		},
		callback,
	) => {
		const slot = acquireSlot({
			slackUserId,
			maxConcurrent: maxConcurrent || 2,
			maxPerUser: maxPerUser || 1,
		});
		if (!slot.acquired) {
			callback('', { busy: true, busyReason: slot.reason });
			return;
		}

		// prompt selection is config-driven (dmeSlack.ini askPromptName —
		// DataModelExplorerSlack, the Slack-formatted twin); DataModelExplorer
		// is the conservative choice when no name is supplied
		const askMiloInput = {
			switches: {},
			values: {
				singleCallPromptName: [String(askPromptName || 'DataModelExplorer')],
				aiToolsSuppressed: [SUPPRESSED_PROVIDERS],
			},
			fileList: [String(question)],
		};
		if (askModel) {
			// model parity ruling (TQ, 2026-07-13). Code fact: askMilo's
			// single-call runs on agentModel — CLI 'model' maps to it
			// (askMilo.js:461,650); expandModel only feeds the chorus expand
			// stage. Set both so the choice holds whichever pipeline runs.
			// (The WS bridge maps the web's model to expandModel only —
			// ws-graphinator.js:148 — reported upstream as a probable defect.)
			askMiloInput.values.model = [String(askModel)];
			askMiloInput.values.expandModel = [String(askModel)];
		}
		if (verbose) {
			// diagnostics: askMilo then reports its provider registry on stderr
			askMiloInput.switches.verbose = true;
		}
		if (askMiloConfigPath) {
			askMiloInput.values.configPath = [askMiloConfigPath];
		}

		const child = spawn(process.execPath, [askMiloJsPath], {
			env: process.env,
		});

		const startedAt = Date.now();
		let stdoutText = '';
		let stderrText = '';
		let timedOut = false;
		let settled = false;

		const wallClockMs = (timeoutSeconds || 180) * 1000;
		const termTimer = setTimeout(() => {
			timedOut = true;
			child.kill('SIGTERM');
		}, wallClockMs);
		const killTimer = setTimeout(() => {
			if (!settled) {
				child.kill('SIGKILL');
			}
		}, wallClockMs + SIGKILL_GRACE_MS);

		child.stdout.on('data', (chunk) => {
			stdoutText += chunk.toString();
		});
		child.stderr.on('data', (chunk) => {
			stderrText += chunk.toString();
		});

		const settle = (err, result) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(termTimer);
			clearTimeout(killTimer);
			releaseSlot({ slackUserId });
			callback(err, result);
		};

		child.on('error', (err) => {
			settle(`askMilo spawn failed: ${err.message}`, {});
		});

		child.on('close', (exitCode) => {
			const durationMs = Date.now() - startedAt;

			// actual cost from the stderr summary line; estimate handled upstream
			const costMatch = stderrText.match(/Cost:\s*\$([0-9.]+)/);
			const actualCostUsd = costMatch ? parseFloat(costMatch[1]) : null;

			if (timedOut) {
				settle('', {
					timedOut: true,
					exitCode,
					durationMs,
					actualCostUsd,
					childPid: child.pid,
				});
				return;
			}

			if (exitCode !== 0) {
				settle('', {
					failed: true,
					exitCode,
					durationMs,
					actualCostUsd,
					// stderr may carry PII (the question echo) — the caller logs a
					// truncated preview at most; never pass it to Slack verbatim
					stderrPreview: stderrText.slice(0, 400),
				});
				return;
			}

			// the provider registry line (verbose runs) is the tool-suppression
			// evidence: DmeUserRead/DmeUserWrite must never appear in it
			const providerReportMatch = stderrText.match(
				/\[SingleCall\] Providers: (.*)/,
			);

			settle('', {
				answerText: stdoutText.trim(),
				exitCode: 0,
				durationMs,
				actualCostUsd,
				childPid: child.pid,
				providerReport: providerReportMatch ? providerReportMatch[1].trim() : null,
				// server-side diagnostics only (may echo the question) — the
				// dispatch never forwards this to Slack
				stderrTail: stderrText.slice(-1200),
			});
		});

		child.stdin.write(JSON.stringify(askMiloInput));
		child.stdin.end();
	};

	// ================================================================================
	// HEALTH CHECK — spawn askMilo -getDefaults (reads config, exits quickly)

	const checkAskMilo = (callback) => {
		const child = spawn(process.execPath, [askMiloJsPath], {
			env: process.env,
		});
		let stdoutText = '';
		let settled = false;

		const settle = (err, result) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(checkTimer);
			callback(err, result);
		};

		const checkTimer = setTimeout(() => {
			child.kill('SIGKILL');
			settle('askMilo getDefaults check timed out', {});
		}, 20000);

		const checkInput = { switches: { getDefaults: true }, values: {}, fileList: [] };
		if (askMiloConfigPath) {
			checkInput.values.configPath = [askMiloConfigPath];
		}

		child.stdout.on('data', (chunk) => {
			stdoutText += chunk.toString();
		});
		child.on('error', (err) => settle(`askMilo spawn failed: ${err.message}`, {}));
		child.on('close', () => {
			// same malformed-output guard as the WS bridge (ws-graphinator.js:87)
			let defaults;
			try {
				defaults = JSON.parse(stdoutText.trim());
			} catch (parseErr) {
				settle('askMilo getDefaults returned no parseable config', {});
				return;
			}
			settle('', { healthy: true, defaults });
		});

		child.stdin.write(JSON.stringify(checkInput));
		child.stdin.end();
	};

	return { askQuestion, checkAskMilo, getRunningCounts };
};

// END OF moduleFunction() ============================================================

module.exports = moduleFunction;
