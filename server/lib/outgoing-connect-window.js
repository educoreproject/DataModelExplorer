#!/usr/bin/env node
'use strict';

// outgoing-connect-window.js — Node's per-address connect window ("happy eyeballs": how long one address may take before
// the next is tried) for EVERY educore Node process that calls out, not only the API server
// (WORKORDER-accountMailLooseEnds-112326 E7). Why: Node's own 250 ms is what lost demo's mail (WORKORDER-
// accountMailFailureAndApprovalNotice-112326 M5) and, measured on demo, half of askMilo's cold connects to Anthropic
// (DEVLOG accountMailLooseEnds-112326 E5). The value is the [email-sender] connectAttemptTimeoutMilliseconds setting
// (default in email-sender-settings.json settingDefaultByName).
//
//   applyOutgoingConnectWindow(connectAttemptTimeoutMilliseconds) -> { appliedMilliseconds }
//       sets the window for THIS process and, by putting --network-family-autoselection-attempt-timeout=N in
//       process.env.NODE_OPTIONS, for every Node process it starts afterwards and theirs (askMilo from ws-graphinator and
//       the slack relay, the DME tools askMilo runs, the educoreForge CLIs, the edc-resolver workers): each inherits the
//       environment and Node applies the flag before any of its code runs. Not a whole number of at least 10 throws by
//       name (the caller validates a configured value first and refuses it by its own name).
//   applyOwnOutgoingConnectWindow() -> { appliedMilliseconds, sourceName }
//       for a program that may be started either from the server or by hand (askMilo, /usr/local/bin/askMilo-demo):
//       sourceName 'inherited' when its NODE_OPTIONS already carries the flag (Node applied it at start), otherwise
//       'settingsDefault': the settings file's default, applied as above.
//
// The process-wide setting and the NODE_OPTIONS entry are the point of this module (one window for the whole process
// tree); nothing else in process.env is touched, and any earlier copy of the flag in NODE_OPTIONS is replaced, not doubled.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const net = require('net');
const path = require('path');

const SETTINGS_FILE_PATH = path.join(__dirname, 'email-sender-settings.json');
const CONNECT_WINDOW_NODE_FLAG_NAME = '--network-family-autoselection-attempt-timeout';
const MINIMUM_WINDOW_MILLISECONDS = 10;
const FLAG_PATTERN = new RegExp(`(^|\\s)${CONNECT_WINDOW_NODE_FLAG_NAME}(=(\\S*))?(?=\\s|$)`, 'g');

const { settingDefaultByName } = require(SETTINGS_FILE_PATH);
const SETTINGS_DEFAULT_MILLISECONDS = (settingDefaultByName || {}).connectAttemptTimeoutMilliseconds;
if (!Number.isInteger(SETTINGS_DEFAULT_MILLISECONDS) || SETTINGS_DEFAULT_MILLISECONDS < MINIMUM_WINDOW_MILLISECONDS) {
	throw new Error(`[${moduleName}] ${SETTINGS_FILE_PATH}: settingDefaultByName.connectAttemptTimeoutMilliseconds must be a whole number of at least ${MINIMUM_WINDOW_MILLISECONDS} (got ${JSON.stringify(SETTINGS_DEFAULT_MILLISECONDS)})`);
}

// the window NODE_OPTIONS hands to child processes, or undefined when it names none
const nodeOptionsWindowOf = (nodeOptionsText) => {
	const flagMatchList = [...String(nodeOptionsText || '').matchAll(FLAG_PATTERN)];
	return flagMatchList.length ? Number(flagMatchList[flagMatchList.length - 1][3]) : undefined;
};

const applyOutgoingConnectWindow = (connectAttemptTimeoutMilliseconds) => {
	if (!Number.isInteger(connectAttemptTimeoutMilliseconds) || connectAttemptTimeoutMilliseconds < MINIMUM_WINDOW_MILLISECONDS) {
		throw new Error(`[${moduleName}] applyOutgoingConnectWindow: the window must be a whole number of milliseconds, at least ${MINIMUM_WINDOW_MILLISECONDS} (got ${JSON.stringify(connectAttemptTimeoutMilliseconds)})`);
	}
	net.setDefaultAutoSelectFamilyAttemptTimeout(connectAttemptTimeoutMilliseconds);
	const otherNodeOptionsText = String(process.env.NODE_OPTIONS || '').replace(FLAG_PATTERN, ' ').trim();
	process.env.NODE_OPTIONS = `${otherNodeOptionsText ? `${otherNodeOptionsText} ` : ''}${CONNECT_WINDOW_NODE_FLAG_NAME}=${connectAttemptTimeoutMilliseconds}`;
	return { appliedMilliseconds: net.getDefaultAutoSelectFamilyAttemptTimeout() };
};

const applyOwnOutgoingConnectWindow = () => {
	const inheritedMilliseconds = nodeOptionsWindowOf(process.env.NODE_OPTIONS);
	if (inheritedMilliseconds !== undefined && inheritedMilliseconds === net.getDefaultAutoSelectFamilyAttemptTimeout()) {
		return { appliedMilliseconds: inheritedMilliseconds, sourceName: 'inherited' };
	}
	return { ...applyOutgoingConnectWindow(SETTINGS_DEFAULT_MILLISECONDS), sourceName: 'settingsDefault' };
};

module.exports = { applyOutgoingConnectWindow, applyOwnOutgoingConnectWindow, nodeOptionsWindowOf, CONNECT_WINDOW_NODE_FLAG_NAME };
