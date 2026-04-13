'use strict';
const fs = require('fs');
const path = require('path');

// Lightweight timing instrumentation for askMilo pipeline.
// Gated by config.timingLog (default: true in askMilo.ini).
// Appends JSONL entries to askMilo-timing.jsonl in the configured log directory.

const createTimingLog = ({ enabled = true, sessionName = 'unknown', logDir } = {}) => {
	if (!enabled) {
		return { mark: () => {} };
	}

	if (!logDir) {
		logDir = '/tmp/askMilo-timing';
	}

	if (!fs.existsSync(logDir)) {
		fs.mkdirSync(logDir, { recursive: true });
	}

	const logPath = path.join(logDir, 'askMilo-timing.jsonl');
	const runStart = Date.now();
	const runId = new Date(runStart).toISOString();

	const mark = (stage, event, extra = {}) => {
		const entry = {
			ts: new Date().toISOString(),
			elapsedMs: Date.now() - runStart,
			runId,
			sessionName,
			stage,
			event,
			...extra,
		};
		try {
			fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
		} catch (e) {
			// don't let logging errors break the pipeline
		}
	};

	return { mark };
};

module.exports = { createTimingLog };
