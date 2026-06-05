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
		env: {
			DME_INTERNAL_SECRET: internalAuthSecret,
		},
	};
};

module.exports = { buildUserModeAskmiloContext };
