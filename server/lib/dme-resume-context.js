'use strict';
// @concept: [[SessionPersistence]]
// @concept: [[WebSocketGraphTool]]
//
// dme-resume-context.js — when a reopened DME session asks to resume an askMilo session that no longer exists
// on this server, rebuild the conversation from the turns the DME saved, so the follow-up is not answered blind.
//
//   askMiloSessionExists(askMiloSessionName)                -> true when askMilo's own session file is present
//   resumedPromptOf({ promptText, resumeSessionName, savedTurnList, askMiloSessionExists })
//        -> { promptText, rebuiltTurnCount, noticeText, refusalText }
//        refusalText is set (and nothing should run) when resumeSessionName is not an askMilo session name.
//        promptText is unchanged (rebuiltTurnCount 0, noticeText '') unless the browser sent saved turns AND either
//        names no askMilo session (the browser found none it could trust in the saved turns) or names one that is
//        missing here; then the saved turns are prepended in askMilo's own prior-session layout.
//
// askMilo, given --resumeSession for a missing session, starts a NEW session under that name (askMilo.js, session
// resume logic), so the rebuilt context lands in turn 1 of the new session and later turns resume it normally.

const os = require('os');
const path = require('path');
const fs = require('fs');

// MUST equal SESSION_DIR in data-model/lib/ask-milo-multitool/lib/sessionManager.js, which does not export it
// (askMilo is out of scope for this change). test/dme-resume-context.test.js proves the two agree by writing a
// session through sessionManager and finding it here. listSessions() is not used: it parses every session file.
const ASKMILO_SESSION_DIRECTORY = path.join(os.homedir(), 'Library', 'Application Support', 'askMilo', 'sessions');

// askMilo names sessions adjective_noun, optionally _timestamp; anything else is refused before it reaches a path
const ASKMILO_SESSION_NAME_PATTERN = /^[a-z]+_[a-z]+(_\d+)?$/;

const isAskMiloSessionName = (askMiloSessionName) => ASKMILO_SESSION_NAME_PATTERN.test(String(askMiloSessionName));

const askMiloSessionExists = (askMiloSessionName) =>
	isAskMiloSessionName(askMiloSessionName) && fs.existsSync(path.join(ASKMILO_SESSION_DIRECTORY, `${askMiloSessionName}.json`));

// the answer text a user saw, without the <control> blocks that drew the right-hand panel
const answerTextOf = (stdoutText) => String(stdoutText || '').replace(/<control[^>]*>[\s\S]*?<\/control>/g, '').trim();

const resumedPromptOf = ({ promptText, resumeSessionName, savedTurnList, askMiloSessionExists }) => {
	const unchanged = { promptText, rebuiltTurnCount: 0, noticeText: '', refusalText: '' };

	if (!Array.isArray(savedTurnList) || savedTurnList.length === 0) {
		return unchanged;
	}
	if (resumeSessionName && !isAskMiloSessionName(resumeSessionName)) {
		return { ...unchanged, refusalText: `The saved conversation name '${resumeSessionName}' is not an askMilo session name, so it cannot be resumed.` };
	}
	if (resumeSessionName && askMiloSessionExists(resumeSessionName)) {
		return unchanged;
	}

	const turnTextList = savedTurnList.map((savedTurn, turnIndex) =>
		[`--- Turn ${turnIndex + 1} ---`, `PROMPT: ${String(savedTurn.prompt || '')}`, '', `RESPONSE: ${answerTextOf(savedTurn.stdout)}`, ''].join('\n'),
	);
	const rebuiltPromptText = [
		`=== PRIOR RESEARCH SESSION: ${resumeSessionName || 'saved DME session'} (rebuilt from the saved DME session) ===`,
		'',
		...turnTextList,
		'=== NEW QUESTION ===',
		promptText,
	].join('\n');

	return {
		promptText: rebuiltPromptText,
		rebuiltTurnCount: savedTurnList.length,
		refusalText: '',
		noticeText: `${resumeSessionName ? `The earlier conversation (${resumeSessionName}) was no longer on the server, so it was` : 'This saved session could not be resumed directly, so the conversation was'} rebuilt from its ${savedTurnList.length} saved turn${savedTurnList.length === 1 ? '' : 's'}.`,
	};
};

module.exports = { askMiloSessionExists, isAskMiloSessionName, resumedPromptOf, answerTextOf };
