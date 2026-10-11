'use strict';

/**
 * educoreForge CLI bridge
 *
 * The educore web app must NEVER touch educoreForge's forgeStore.sqlite3 directly
 * (the store has real traps: an absolute --db is required, content-addressing, and
 * save-vs-combine collisions). Instead, the educore server shells out to educoreForge
 * CLI verbs and parses their JSON stdout -- the same pattern the DME askMilo tools use.
 *
 * Two entry scripts:
 *   - manifestEditor.js : -listBlocks / -listManifests / -show / -diff / -combine / -validate
 *                         (EVERY call MUST pass an absolute --db; the tool's default path is wrong)
 *   - edfReplay.js      : -buildGraph (path is hardcoded inside the tool; takes NO --db)
 *
 * All verbs emit indented JSON on stdout via xLog.result; log noise is on stderr; a
 * non-zero exit means failure. Read stdout only.
 *
 * Callback style throughout: cb(err, jsonResult). No async/await, no promises.
 */

const { execFile } = require('child_process');

// ---------------------------------------------------------------------------
// Defaults. Overridable via getConfig('educoreforge-cli-bridge') when present.

const DEFAULTS = {
	manifestEditorScript:
		'/Users/tqwhite/Documents/webdev/educoreForge/system/code/cli/lib.d/manifest-editor/manifestEditor.js',
	edfReplayScript:
		'/Users/tqwhite/Documents/webdev/educoreForge/system/code/cli/lib.d/edf-replay/edfReplay.js',
	forgeDbPath:
		'/Users/tqwhite/Documents/webdev/educoreForge/system/dataStores/forgeStore.sqlite3',
	timeout: 60000,
	maxBuffer: 8 * 1024 * 1024,
};

const getXLog = () =>
	process.global && process.global.xLog
		? process.global.xLog
		: { error: console.error, status: console.error };

const getSettings = () => {
	const getConfig = process.global && process.global.getConfig;
	const override =
		typeof getConfig === 'function'
			? getConfig('educoreforge-cli-bridge') || {}
			: {};
	return { ...DEFAULTS, ...override };
};

// ---------------------------------------------------------------------------
// paramsObj -> ['--key=value', ...]; arrays are comma-joined; empties dropped.

const paramsToArgv = (paramsObj = {}) =>
	Object.keys(paramsObj)
		.filter((key) => {
			const value = paramsObj[key];
			return value !== undefined && value !== null && value !== '';
		})
		.map((key) => {
			const value = paramsObj[key];
			const rendered = Array.isArray(value) ? value.join(',') : value;
			return `--${key}=${rendered}`;
		});

// ---------------------------------------------------------------------------
// Core runner. scriptPath + '-verb' + argv, JSON.parse(stdout) on exit 0.

const runVerb = (scriptPath, verb, argv, cb) => {
	const xLog = getXLog();
	const { timeout, maxBuffer } = getSettings();
	const fullArgs = [scriptPath, `-${verb}`, ...argv];

	execFile(
		'node',
		fullArgs,
		{ env: { ...process.env }, timeout, maxBuffer },
		(err, stdout, stderr) => {
			if (err) {
				const detail =
					(stderr && `${stderr}`.trim()) ||
					err.message ||
					`exit code ${err.code}`;
				xLog.error(`educoreForge -${verb} failed: ${detail}`);
				cb(`educoreForge -${verb} failed: ${detail}`);
				return;
			}

			// Localized guard for the one unavoidable throwing call (JSON.parse).
			// Not flow control -- a malformed stdout is a hard failure we surface.
			let result;
			try {
				result = JSON.parse(stdout);
			} catch (parseErr) {
				xLog.error(
					`educoreForge -${verb} returned non-JSON stdout: ${parseErr.message}`,
				);
				cb(`educoreForge -${verb} JSON parse error: ${parseErr.message}`);
				return;
			}

			cb('', result);
		},
	);
};

// ---------------------------------------------------------------------------
// Public: manifestEditor verbs. ALWAYS append the absolute --db.

const runManifestEditor = (verb, paramsObj, cb) => {
	const { manifestEditorScript, forgeDbPath } = getSettings();
	const argv = paramsToArgv({ ...(paramsObj || {}), db: forgeDbPath });
	runVerb(manifestEditorScript, verb, argv, cb);
};

// ---------------------------------------------------------------------------
// Public: edfReplay verbs. NO --db (edfReplay hardcodes the correct path).

const runEdfReplay = (verb, paramsObj, cb) => {
	const { edfReplayScript } = getSettings();
	const argv = paramsToArgv(paramsObj || {});
	runVerb(edfReplayScript, verb, argv, cb);
};

module.exports = { runManifestEditor, runEdfReplay };
