'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[WebSocketGraphTool]]
// @concept: [[SecurityFirstPattern]]
//
// dme-usermode-context.js — builds the User-mode session context that ws-graphinator
// hands to the askMilo subprocess so the dmeUser tools can reach the user's isolated
// graph over HTTP (Option A). Returns nothing unless graphMode==='user' AND a live
// versionRefId is present; Standard mode injects nothing (unchanged behavior).
//
// SECURITY SPLIT (deliberate, see DEVELOPMENT-LOG-askmilo.md Phase 2):
//   - versionRefId + apiBase travel as real askMilo command INPUT (commandValues). They
//     are not secret; TQ's intent is that versionRefId be a first-class askMilo input.
//     The toolHandler (Phase 3) re-exports them to each spawned tool's env.
//   - the internal secret travels as ENV ONLY (never command input). ws-graphinator pipes
//     askMilo's stdout/stderr VERBATIM to the browser, so a value in the command input
//     could be echoed to the client; a value in the spawn env cannot. askMilo inherits the
//     env var and passes it to the spawned tools.

const buildUserModeAskmiloContext = ({ settings = {}, getConfig } = {}) => {
	const empty = { commandValues: {}, env: {} };

	if (settings.graphMode !== 'user') {
		return empty;
	}

	const versionRefId = settings.activeVersionRefId || settings.versionRefId;
	if (!versionRefId) {
		return empty;
	}

	const { internalAuthSecret } =
		(getConfig && getConfig('dmeUserGraphInternalAuth')) || {};
	const apiPort = ((getConfig && getConfig('startApiServer')) || {}).apiPort;
	const apiBase = `http://127.0.0.1:${apiPort}`;

	return {
		commandValues: {
			dmeVersionRefId: versionRefId,
			dmeApiBase: apiBase,
		},
		// The tools read all three of these from the ENVIRONMENT (see the header comment in
		// cli/lib.d/dme-user-read/dmeUserReadTool.js and both provider.json files), and the
		// CANONICAL askMilo already bridges two of them itself — it lifts dmeVersionRefId and
		// dmeApiBase out of its command input into every spawned tool's sessionEnv.
		//
		// This placement is belt-and-braces for the case where the askMilo in use PREDATES that
		// bridge: educore's copy under server/data-model/lib/ask-milo-multitool is a real
		// directory, not a symlink to qbookSuperTool, and as of 2026-08-07 it is an April 15
		// snapshot with no DME_VERSION_REF_ID anywhere in it. A stale copy therefore spawns
		// tools that die on "DME_VERSION_REF_ID is unset" however cleanly the graph opened.
		// Because ws-graphinator spawns askMilo with { ...process.env, ...env }, anything put
		// here is inherited by the tools whether or not askMilo forwards it.
		//
		// They stay in commandValues as well: TQ's intent is that versionRefId be a real
		// askMilo input, and the phase-2 gate asserts it arrives that way.
		env: {
			DME_INTERNAL_SECRET: internalAuthSecret,
			DME_VERSION_REF_ID: versionRefId,
			DME_API_BASE: apiBase,
		},
	};
};

module.exports = { buildUserModeAskmiloContext };
