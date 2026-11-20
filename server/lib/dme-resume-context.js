'use strict';
// @concept: [[SessionPersistence]]
// @concept: [[WebSocketGraphTool]]
// @concept: [[SecurityFirstPattern]]
//
// dme-resume-context.js — decides, for one DME prompt, which askMilo conversation it continues and with what context.
// Every askMilo session the DME uses is NAMED BY THE SERVER here, and every resume is decided here (ws-graphinator.js).
//
//   const resumeContext = require('./dme-resume-context')({ resumeProofSecret, limitByName, nowMsOf })
//   resumeContext.newAskMiloSessionNameOf()                     -> 'dme_session_<24 random digits>', not yet on disk
//   resumeContext.resumeProofOf(askMiloSessionName)             -> '<expiresAtSeconds>.<hex HMAC>'
//   resumeContext.isResumeProofValid(askMiloSessionName, proof) -> true only for this server's unexpired proof of that name
//   resumeContext.askMiloSessionTurnCountOf(askMiloSessionName) -> the session's turn count, or null when there is none
//   resumeContext.askMiloSessionSavedSinceOf(askMiloSessionName, sinceMs) -> true when askMilo wrote the session after sinceMs
//   resumeContext.resumeDecisionOf({ promptText, requestedSessionName, resumeProof, savedTurnList, askMiloSessionTurnCountOf })
//        -> { resumeSessionName, newSessionName, priorContextText, rebuiltTurnCount, omittedTurnCount, noticeText, refusalText }
//        refusalText set: run nothing, show it. Otherwise exactly one of resumeSessionName (askMilo --resumeSession) and
//        newSessionName (askMilo --sessionName) is set; priorContextText, when set, goes to askMilo --priorContextText.
//
// WHY THE SERVER NAMES THE SESSION (second review, B2-1). The proof used to be minted for whatever name followed
// "Session saved:" in askMilo's stderr, and stderr echoes text the client controls, so any client could mint a proof
// for any name. Now the name is chosen here, from crypto randomness, before askMilo starts; askMilo is told it; and
// the proof is bound to it. Nothing askMilo prints can choose or mint a name. The random tail also ends the 2,500-name
// guessing space and the race where two runs pick the same free name.
//
// WHY A PROOF. /ws/explorer carries no identity and askMilo sessions no DME user, so the proof is the owner binding:
// only the browser that ran a session receives it (and keeps it inside its own owner-checked dme_sessions row). It is
// keyed by a secret of THIS instance (startApiServer.ini [dmeResumeProof] secret), so a proof from one server means
// nothing on another, and it expires (resumeProofLifetimeDays); an expired proof is not refused: the session is rebuilt.
//
// WHY A TURN COUNT. A session damaged by the pre-fix reload bug can name an askMilo session holding other turns. The
// saved turns say which askMilo session answered each; when askMilo's turn count differs from the number of saved
// turns it answered, it is not this conversation, and the saved turns are rebuilt into a new session instead.

const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// MUST equal SESSION_DIR in data-model/lib/ask-milo-multitool/lib/sessionManager.js, which does not export it.
// test/dme-resume-context.test.js proves the two agree by writing a session through sessionManager and reading it here.
const ASKMILO_SESSION_DIRECTORY = path.join(os.homedir(), 'Library', 'Application Support', 'askMilo', 'sessions');

// askMilo's own names are adjective_noun[_digits]; the server's are dme_session_<digits>. Nothing else reaches a path.
const ASKMILO_SESSION_NAME_PATTERN = /^[a-z]+_[a-z]+(_\d+)?$/;
const RESUME_PROOF_LABEL = 'askMiloResumeProof:';
const RESUME_PROOF_PATTERN = /^(\d{10})\.([0-9a-f]{64})$/;
const CONTROL_OPEN_TEXT = '<control';
const CONTROL_CLOSE_TEXT = '</control>';

const isAskMiloSessionName = (askMiloSessionName) => typeof askMiloSessionName === 'string' && ASKMILO_SESSION_NAME_PATTERN.test(askMiloSessionName);

// the answer text a user saw, without the <control> blocks that drew the right-hand panel. A single forward scan with
// indexOf (second review, B2-2: a lazy regex over the whole string was quadratic on unclosed <control> openings).
const answerTextOf = (stdoutText) => {
	const text = String(stdoutText || '');
	let answerText = '';
	let scanIndex = 0;
	while (scanIndex < text.length) {
		const openIndex = text.indexOf(CONTROL_OPEN_TEXT, scanIndex);
		const tagEndIndex = openIndex === -1 ? -1 : text.indexOf('>', openIndex);
		const closeIndex = tagEndIndex === -1 ? -1 : text.indexOf(CONTROL_CLOSE_TEXT, tagEndIndex);
		if (closeIndex === -1) {
			answerText += text.slice(scanIndex);
			break;
		}
		answerText += text.slice(scanIndex, openIndex);
		scanIndex = closeIndex + CONTROL_CLOSE_TEXT.length;
	}
	return answerText.trim();
};

const SAVED_TURN_TEXT_PROPERTY_LIST = ['prompt', 'stdout', 'askMiloSessionName'];

// -> '' when the list is usable, else why not. Costs one pass; runs before anything else touches the text.
const savedTurnListRefusalOf = (savedTurnList, { savedTurnCountLimit, savedTurnCharacterLimit }) => {
	if (!Array.isArray(savedTurnList)) return 'the saved turns are not a list';
	if (savedTurnList.length > savedTurnCountLimit) return `the saved turns number ${savedTurnList.length}, more than the ${savedTurnCountLimit} allowed`;
	let characterCount = 0;
	for (let turnIndex = 0; turnIndex < savedTurnList.length; turnIndex++) {
		const savedTurn = savedTurnList[turnIndex];
		if (savedTurn === null || typeof savedTurn !== 'object' || Array.isArray(savedTurn)) return `saved turn ${turnIndex + 1} is not a {prompt, stdout} record`;
		for (const propertyName of SAVED_TURN_TEXT_PROPERTY_LIST) {
			if (savedTurn[propertyName] === undefined) continue;
			if (typeof savedTurn[propertyName] !== 'string') return `saved turn ${turnIndex + 1} is not a {prompt, stdout} record`;
			characterCount += savedTurn[propertyName].length;
		}
		if (characterCount > savedTurnCharacterLimit) return `the saved turns hold more than the ${savedTurnCharacterLimit} characters allowed`;
	}
	return '';
};

const turnTextOf = (savedTurn, turnNumber) => [`--- Turn ${turnNumber} ---`, `PROMPT: ${savedTurn.prompt || ''}`, '', `RESPONSE: ${answerTextOf(savedTurn.stdout)}`, ''].join('\n');

// the newest turns whose text fits the budget, oldest first; placeholder turns (sent empty to keep the count) are skipped
const turnTextListWithinBudgetOf = (savedTurnList, characterBudget) => {
	const keptTextList = [];
	let usedCharacterCount = 0;
	for (let turnIndex = savedTurnList.length - 1; turnIndex >= 0; turnIndex--) {
		const savedTurn = savedTurnList[turnIndex];
		if (!savedTurn.prompt && !savedTurn.stdout) break;
		const turnText = turnTextOf(savedTurn, turnIndex + 1);
		if (usedCharacterCount + turnText.length > characterBudget) break;
		usedCharacterCount += turnText.length;
		keptTextList.unshift(turnText);
	}
	return keptTextList;
};

const moduleFunction = ({ resumeProofSecret, limitByName, nowMsOf = Date.now }) => {
	if (!resumeProofSecret) {
		throw new Error(
			'dme-resume-context: the resume proof secret is missing. Add to this instance\'s startApiServer.ini a section [dmeResumeProof] with secret=<64 hex characters>, generated for THIS instance only (never copied from another): node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
		);
	}
	const { rebuiltContextCharacterBudget, savedTurnCountLimit, savedTurnCharacterLimit, resumeProofLifetimeDays } = limitByName || {};
	if (![rebuiltContextCharacterBudget, savedTurnCountLimit, savedTurnCharacterLimit, resumeProofLifetimeDays].every((limitValue) => limitValue > 0)) {
		throw new Error('dme-resume-context: limitByName needs rebuiltContextCharacterBudget, savedTurnCountLimit, savedTurnCharacterLimit and resumeProofLifetimeDays (lib/dme-resume-limits.json)');
	}

	const signatureOf = (askMiloSessionName, expiresAtSecondsText) =>
		crypto.createHmac('sha256', String(resumeProofSecret)).update(`${RESUME_PROOF_LABEL}${askMiloSessionName}:${expiresAtSecondsText}`, 'utf8').digest('hex');

	const resumeProofOf = (askMiloSessionName) => {
		const expiresAtSecondsText = String(Math.floor(nowMsOf() / 1000) + resumeProofLifetimeDays * 86400).padStart(10, '0');
		return `${expiresAtSecondsText}.${signatureOf(askMiloSessionName, expiresAtSecondsText)}`;
	};

	const isResumeProofValid = (askMiloSessionName, resumeProof) => {
		const proofMatch = typeof resumeProof === 'string' ? resumeProof.match(RESUME_PROOF_PATTERN) : null;
		if (!proofMatch || Number(proofMatch[1]) * 1000 < nowMsOf()) return false;
		return crypto.timingSafeEqual(Buffer.from(signatureOf(askMiloSessionName, proofMatch[1]), 'hex'), Buffer.from(proofMatch[2], 'hex'));
	};

	const sessionFilePathOf = (askMiloSessionName) => path.join(ASKMILO_SESSION_DIRECTORY, `${askMiloSessionName}.json`);

	const newAskMiloSessionNameOf = () => {
		for (let attemptCount = 0; attemptCount < 5; attemptCount++) {
			const randomDigitText = BigInt(`0x${crypto.randomBytes(10).toString('hex')}`).toString().padStart(25, '0').slice(-24);
			const askMiloSessionName = `dme_session_${randomDigitText}`;
			if (!fs.existsSync(sessionFilePathOf(askMiloSessionName))) return askMiloSessionName;
		}
		throw new Error('dme-resume-context: five random askMilo session names in a row already exist; the session directory is not what it should be');
	};

	// null when there is no such session. A file that is not a JSON object throws in JSON.parse; ws-graphinator's
	// message boundary turns that into a visible error for this one prompt.
	const askMiloSessionTurnCountOf = (askMiloSessionName) => {
		if (!isAskMiloSessionName(askMiloSessionName) || !fs.existsSync(sessionFilePathOf(askMiloSessionName))) return null;
		const sessionTurnList = JSON.parse(fs.readFileSync(sessionFilePathOf(askMiloSessionName), 'utf8')).turns;
		return Array.isArray(sessionTurnList) ? sessionTurnList.length : null;
	};

	const askMiloSessionSavedSinceOf = (askMiloSessionName, sinceMs) =>
		isAskMiloSessionName(askMiloSessionName) && fs.existsSync(sessionFilePathOf(askMiloSessionName)) && fs.statSync(sessionFilePathOf(askMiloSessionName)).mtimeMs >= sinceMs;

	const plainDecisionOf = (promptText) => ({ resumeSessionName: '', newSessionName: '', priorContextText: '', rebuiltTurnCount: 0, omittedTurnCount: 0, noticeText: '', refusalText: '' });

	const rebuiltDecisionOf = ({ promptText, resumeSessionName, savedTurnList, reasonText }) => {
		const keptTextList = turnTextListWithinBudgetOf(savedTurnList, rebuiltContextCharacterBudget);
		const omittedTurnCount = savedTurnList.length - keptTextList.length;
		const omittedText = omittedTurnCount
			? ` The ${omittedTurnCount} oldest turn${omittedTurnCount === 1 ? ' was' : 's were'} left out to fit; only the newest ${keptTextList.length} ${keptTextList.length === 1 ? 'is' : 'are'} remembered.`
			: '';
		return {
			...plainDecisionOf(promptText),
			resumeSessionName,
			newSessionName: resumeSessionName ? '' : newAskMiloSessionNameOf(),
			priorContextText: ['(rebuilt from the saved DME session)', '', ...keptTextList].join('\n'),
			rebuiltTurnCount: keptTextList.length,
			omittedTurnCount,
			noticeText: `${reasonText}, so the conversation was rebuilt from its ${savedTurnList.length} saved turn${savedTurnList.length === 1 ? '' : 's'}.${omittedText}`,
		};
	};

	const resumeDecisionOf = ({ promptText, requestedSessionName, resumeProof, savedTurnList, askMiloSessionTurnCountOf: turnCountOf = askMiloSessionTurnCountOf }) => {
		const hasSavedTurns = savedTurnList !== undefined && savedTurnList !== null;
		if (hasSavedTurns) {
			const listRefusalText = savedTurnListRefusalOf(savedTurnList, { savedTurnCountLimit, savedTurnCharacterLimit });
			if (listRefusalText) return { ...plainDecisionOf(promptText), refusalText: `This prompt was not run: ${listRefusalText}.` };
		}
		const savedTurnCount = hasSavedTurns ? savedTurnList.length : 0;

		if (!requestedSessionName) {
			return savedTurnCount
				? rebuiltDecisionOf({ promptText, resumeSessionName: '', savedTurnList, reasonText: 'This saved session could not be resumed directly' })
				: { ...plainDecisionOf(promptText), newSessionName: newAskMiloSessionNameOf() };
		}

		if (!isAskMiloSessionName(requestedSessionName) || !isResumeProofValid(requestedSessionName, resumeProof)) {
			return savedTurnCount
				? rebuiltDecisionOf({ promptText, resumeSessionName: '', savedTurnList, reasonText: "The earlier conversation could not be confirmed as this session's" })
				: { ...plainDecisionOf(promptText), refusalText: "This prompt was not run: the conversation it asks to continue could not be confirmed as this session's. Start a new session, or reopen this one from the saved sessions list." };
		}

		if (!savedTurnCount) {
			return { ...plainDecisionOf(promptText), resumeSessionName: requestedSessionName };
		}

		const askMiloTurnCount = turnCountOf(requestedSessionName);
		const answeredTurnCount = savedTurnList.filter((savedTurn) => savedTurn.askMiloSessionName === requestedSessionName).length;
		if (askMiloTurnCount !== null && askMiloTurnCount === answeredTurnCount) {
			return { ...plainDecisionOf(promptText), resumeSessionName: requestedSessionName };
		}
		if (askMiloTurnCount === null) {
			// askMilo starts a NEW session under this name (askMilo.js, session resume logic), so its proof stays valid
			return rebuiltDecisionOf({ promptText, resumeSessionName: requestedSessionName, savedTurnList, reasonText: `The earlier conversation (${requestedSessionName}) was no longer on the server` });
		}
		return rebuiltDecisionOf({
			promptText,
			resumeSessionName: '',
			savedTurnList,
			reasonText: `The earlier conversation (${requestedSessionName}) holds ${askMiloTurnCount} turn${askMiloTurnCount === 1 ? '' : 's'}, not the ${answeredTurnCount} this session says it answered`,
		});
	};

	return { newAskMiloSessionNameOf, resumeProofOf, isResumeProofValid, askMiloSessionTurnCountOf, askMiloSessionSavedSinceOf, resumeDecisionOf };
};

moduleFunction.isAskMiloSessionName = isAskMiloSessionName;
moduleFunction.answerTextOf = answerTextOf;
moduleFunction.ASKMILO_SESSION_DIRECTORY = ASKMILO_SESSION_DIRECTORY;
module.exports = moduleFunction;
