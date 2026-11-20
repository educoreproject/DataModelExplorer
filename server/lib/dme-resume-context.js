'use strict';
// @concept: [[SessionPersistence]]
// @concept: [[WebSocketGraphTool]]
// @concept: [[SecurityFirstPattern]]
//
// dme-resume-context.js — decides, for one DME prompt, which askMilo conversation it continues and with what context.
// Every resume passes through here (ws-graphinator.js), so no browser-supplied name reaches askMilo unchecked.
//
//   const resumeContext = require('./dme-resume-context')({ resumeProofSecret, limitByName })
//   resumeContext.resumeProofOf(askMiloSessionName)            -> hex HMAC; sent to the browser when askMilo saves a session
//   resumeContext.askMiloSessionTurnCountOf(askMiloSessionName) -> the session's turn count, or null when there is no such session
//   resumeContext.resumeDecisionOf({ promptText, requestedSessionName, resumeProof, savedTurnList, askMiloSessionTurnCountOf })
//        -> { resumeSessionName, promptText, rebuiltTurnCount, omittedTurnCount, noticeText, refusalText }
//        refusalText set: run nothing, show it. resumeSessionName '': askMilo starts a new session.
//   askMiloSessionNameOfLogLine(stderrLine)                    -> the name in askMilo's "Session saved: NAME" line, or ''
//
// WHY A PROOF. askMilo keeps every session in one directory per OS user, named adjective_noun (about 2,500 names), and
// /ws/explorer carries no identity. Before 2026-11-19 any client could resume any user's conversation by guessing its
// name, and the unchecked name was a path (askMilo writes NAME.json). Now a name is resumed only with the HMAC this
// server issued when that session was saved, which only the browser that received it holds (and keeps inside its own
// owner-checked dme_sessions row). A name without a valid proof is never resumed: the saved turns, if sent, are rebuilt.
//
// WHY A TURN COUNT. A session damaged by the pre-fix reload bug can name an askMilo session holding another saved
// session's turns. When the browser's saved turns and askMilo's turn count disagree, the askMilo session is not this
// conversation, so it is rebuilt from the saved turns instead of resumed.

const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// MUST equal SESSION_DIR in data-model/lib/ask-milo-multitool/lib/sessionManager.js, which does not export it.
// test/dme-resume-context.test.js proves the two agree by writing a session through sessionManager and reading it here.
const ASKMILO_SESSION_DIRECTORY = path.join(os.homedir(), 'Library', 'Application Support', 'askMilo', 'sessions');

// askMilo names sessions adjective_noun, optionally _timestamp; nothing else may reach a path
const ASKMILO_SESSION_NAME_PATTERN = /^[a-z]+_[a-z]+(_\d+)?$/;
const ASKMILO_SESSION_SAVED_PATTERN = /Session saved:\s*([a-z]+_[a-z]+(?:_\d+)?)\b/;
const RESUME_PROOF_LABEL = 'askMiloResumeProof:';

const isAskMiloSessionName = (askMiloSessionName) => typeof askMiloSessionName === 'string' && ASKMILO_SESSION_NAME_PATTERN.test(askMiloSessionName);

const askMiloSessionNameOfLogLine = (stderrLine) => {
	const sessionMatch = String(stderrLine).match(ASKMILO_SESSION_SAVED_PATTERN);
	return sessionMatch ? sessionMatch[1] : '';
};

// the answer text a user saw, without the <control> blocks that drew the right-hand panel
const answerTextOf = (stdoutText) => String(stdoutText || '').replace(/<control[^>]*>[\s\S]*?<\/control>/g, '').trim();

// -> '' when the list is usable, else why not
const savedTurnListRefusalOf = (savedTurnList, savedTurnCountLimit) => {
	if (!Array.isArray(savedTurnList)) return 'the saved turns are not a list';
	if (savedTurnList.length > savedTurnCountLimit) return `the saved turns number ${savedTurnList.length}, more than the ${savedTurnCountLimit} allowed`;
	const badTurnIndex = savedTurnList.findIndex(
		(savedTurn) => savedTurn === null || typeof savedTurn !== 'object' || Array.isArray(savedTurn) || ['prompt', 'stdout'].some((propertyName) => savedTurn[propertyName] !== undefined && typeof savedTurn[propertyName] !== 'string'),
	);
	return badTurnIndex === -1 ? '' : `saved turn ${badTurnIndex + 1} is not a {prompt, stdout} record`;
};

const turnTextOf = (savedTurn, turnNumber) => [`--- Turn ${turnNumber} ---`, `PROMPT: ${savedTurn.prompt || ''}`, '', `RESPONSE: ${answerTextOf(savedTurn.stdout)}`, ''].join('\n');

// the newest turns whose text fits the budget, oldest first
const turnTextListWithinBudgetOf = (savedTurnList, characterBudget) => {
	const keptTextList = [];
	let usedCharacterCount = 0;
	for (let turnIndex = savedTurnList.length - 1; turnIndex >= 0; turnIndex--) {
		const turnText = turnTextOf(savedTurnList[turnIndex], turnIndex + 1);
		if (usedCharacterCount + turnText.length > characterBudget) break;
		usedCharacterCount += turnText.length;
		keptTextList.unshift(turnText);
	}
	return keptTextList;
};

const moduleFunction = ({ resumeProofSecret, limitByName }) => {
	if (!resumeProofSecret) {
		throw new Error('dme-resume-context: resumeProofSecret is required (ws-graphinator passes access-token-header-tools.secret)');
	}
	const { rebuiltContextCharacterBudget, savedTurnCountLimit } = limitByName || {};
	if (!(rebuiltContextCharacterBudget > 0) || !(savedTurnCountLimit > 0)) {
		throw new Error('dme-resume-context: limitByName needs rebuiltContextCharacterBudget and savedTurnCountLimit (lib/dme-resume-limits.json)');
	}

	const resumeProofOf = (askMiloSessionName) => crypto.createHmac('sha256', String(resumeProofSecret)).update(`${RESUME_PROOF_LABEL}${askMiloSessionName}`, 'utf8').digest('hex');

	const isResumeProofValid = (askMiloSessionName, resumeProof) => {
		if (typeof resumeProof !== 'string' || !/^[0-9a-f]{64}$/.test(resumeProof)) return false;
		return crypto.timingSafeEqual(Buffer.from(resumeProofOf(askMiloSessionName), 'hex'), Buffer.from(resumeProof, 'hex'));
	};

	// null when there is no such session. A file that is not a JSON object throws in JSON.parse; ws-graphinator's
	// message boundary turns that into a visible error for this one prompt.
	const askMiloSessionTurnCountOf = (askMiloSessionName) => {
		const sessionFilePath = path.join(ASKMILO_SESSION_DIRECTORY, `${askMiloSessionName}.json`);
		if (!isAskMiloSessionName(askMiloSessionName) || !fs.existsSync(sessionFilePath)) return null;
		const sessionTurnList = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8')).turns;
		return Array.isArray(sessionTurnList) ? sessionTurnList.length : null;
	};

	const rebuiltDecisionOf = ({ promptText, resumeSessionName, savedTurnList, reasonText }) => {
		const keptTextList = turnTextListWithinBudgetOf(savedTurnList, rebuiltContextCharacterBudget);
		const omittedTurnCount = savedTurnList.length - keptTextList.length;
		const rebuiltPromptText = ['=== PRIOR RESEARCH SESSION (rebuilt from the saved DME session) ===', '', ...keptTextList, '=== NEW QUESTION ===', promptText].join('\n');
		const omittedText = omittedTurnCount
			? ` The ${omittedTurnCount} oldest turn${omittedTurnCount === 1 ? ' was' : 's were'} left out to fit; only the newest ${keptTextList.length} ${keptTextList.length === 1 ? 'is' : 'are'} remembered.`
			: '';
		return {
			resumeSessionName,
			promptText: rebuiltPromptText,
			rebuiltTurnCount: keptTextList.length,
			omittedTurnCount,
			refusalText: '',
			noticeText: `${reasonText}, so the conversation was rebuilt from its ${savedTurnList.length} saved turn${savedTurnList.length === 1 ? '' : 's'}.${omittedText}`,
		};
	};

	const resumeDecisionOf = ({ promptText, requestedSessionName, resumeProof, savedTurnList, askMiloSessionTurnCountOf: turnCountOf = askMiloSessionTurnCountOf }) => {
		const plain = { resumeSessionName: '', promptText, rebuiltTurnCount: 0, omittedTurnCount: 0, noticeText: '', refusalText: '' };
		const hasSavedTurns = savedTurnList !== undefined && savedTurnList !== null;

		if (hasSavedTurns) {
			const listRefusalText = savedTurnListRefusalOf(savedTurnList, savedTurnCountLimit);
			if (listRefusalText) return { ...plain, refusalText: `This prompt was not run: ${listRefusalText}.` };
		}
		const savedTurnCount = hasSavedTurns ? savedTurnList.length : 0;

		if (!requestedSessionName) {
			return savedTurnCount ? rebuiltDecisionOf({ promptText, resumeSessionName: '', savedTurnList, reasonText: 'This saved session could not be resumed directly' }) : plain;
		}

		const isNameUsable = isAskMiloSessionName(requestedSessionName) && isResumeProofValid(requestedSessionName, resumeProof);
		if (!isNameUsable) {
			return savedTurnCount
				? rebuiltDecisionOf({ promptText, resumeSessionName: '', savedTurnList, reasonText: "The earlier conversation could not be confirmed as this session's" })
				: { ...plain, refusalText: "This prompt was not run: the conversation it asks to continue could not be confirmed as this session's. Start a new session, or reopen this one from the saved sessions list." };
		}

		if (!savedTurnCount) {
			return { ...plain, resumeSessionName: requestedSessionName };
		}

		const askMiloTurnCount = turnCountOf(requestedSessionName);
		if (askMiloTurnCount === savedTurnCount) {
			return { ...plain, resumeSessionName: requestedSessionName };
		}
		if (askMiloTurnCount === null) {
			// askMilo starts a NEW session under this name (askMilo.js, session resume logic), so its proof stays valid
			return rebuiltDecisionOf({ promptText, resumeSessionName: requestedSessionName, savedTurnList, reasonText: `The earlier conversation (${requestedSessionName}) was no longer on the server` });
		}
		return rebuiltDecisionOf({
			promptText,
			resumeSessionName: '',
			savedTurnList,
			reasonText: `The earlier conversation (${requestedSessionName}) holds ${askMiloTurnCount} turn${askMiloTurnCount === 1 ? '' : 's'}, not this session's ${savedTurnCount}`,
		});
	};

	return { resumeProofOf, isResumeProofValid, askMiloSessionTurnCountOf, resumeDecisionOf };
};

moduleFunction.isAskMiloSessionName = isAskMiloSessionName;
moduleFunction.askMiloSessionNameOfLogLine = askMiloSessionNameOfLogLine;
moduleFunction.answerTextOf = answerTextOf;
moduleFunction.ASKMILO_SESSION_DIRECTORY = ASKMILO_SESSION_DIRECTORY;
module.exports = moduleFunction;
