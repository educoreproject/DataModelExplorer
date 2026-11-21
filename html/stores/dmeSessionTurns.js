// @concept: [[SessionPersistence]]
// dmeSessionTurns.js — pure helpers for what a saved DME session carries and how a reopened one resumes.
// No Vue, no Pinia, no axios: createEdunatorStore.js calls these, and html/test/dmeSessionTurns.test.mjs runs them in node.
//
//   ASKMILO_SESSION_SAVED_PATTERN        the line askMilo writes to stderr when it stores a turn
//   askMiloSessionNameOfTurn(turn)       the askMilo session that answered one turn ('' when the turn does not say)
//   resumePlanOf(turnList)               { resumeSessionName, resumeProof, isRebuildNeeded } for a session just loaded
//   savedTurnListOf(turnList)            the turns as they are POSTed to dmeSessionSave (controlHtml left out)
//   priorTurnListOf(turnList)            the prompt and answer of each turn, sent to the server after a reload until a save is confirmed
//   controlStringOf(stdoutText)          a turn's <control> blocks, joined as EdunatorPanel's splitContent joins them
//   turnIndexListNeedingControlHtmlOf(turnList)  turns with control blocks but no controlHtml (unviewed since loading)

export const ASKMILO_SESSION_SAVED_PATTERN = /Session saved:\s*(\S+)/;

// Turns saved after this fix carry askMiloSessionName; older turns only have it in their stderr log.
export const askMiloSessionNameOfTurn = (turn) => {
	if (turn && turn.askMiloSessionName) return turn.askMiloSessionName;
	const sessionMatch = String((turn && turn.stderr) || '').match(ASKMILO_SESSION_SAVED_PATTERN);
	return sessionMatch ? sessionMatch[1] : '';
};

// The askMilo session that answered the NEWEST named turn, with the server's proof for it (askMiloResumeProof): resume
// it. It holds every later turn and, after a rebuild, the earlier ones as prior context; the server still checks that
// askMilo's turn count matches the turns this session says it answered, and rebuilds if not. The newest named turn
// has no proof (saved before proofs existed, or damaged by the pre-fix reload bug): resume none, and the server
// rebuilds the conversation from the saved turns into a new session.
export const resumePlanOf = (turnList) => {
	const newestNamedTurn = [...(turnList || [])].reverse().find((turn) => askMiloSessionNameOfTurn(turn));
	if (newestNamedTurn && newestNamedTurn.askMiloSessionName && newestNamedTurn.askMiloResumeProof) {
		return { resumeSessionName: newestNamedTurn.askMiloSessionName, resumeProof: newestNamedTurn.askMiloResumeProof, isRebuildNeeded: false };
	}
	return { resumeSessionName: '', resumeProof: '', isRebuildNeeded: true };
};

// controlHtml is the right-hand panel serialized from the DOM. EdunatorPanel regenerates it from the <control>
// blocks in stdout whenever a turn is shown, so saving it doubled the payload for nothing (about a quarter of it).
export const savedTurnListOf = (turnList) =>
	(turnList || []).map((turn) => {
		const { controlHtml, ...savedTurn } = turn;
		return savedTurn;
	});

// MUST equal savedTurnCharacterLimit, savedTurnCountLimit and webSocketMaxPayloadBytes in
// server/lib/dme-resume-limits.json (html/test/dmeSessionTurns.test.mjs checks). The server refuses a prompt over any of
// them, so the browser keeps within them: the newest turns whole, older ones as empty placeholders (the server still
// counts every turn an askMilo session answered), a newest turn that alone is too long cut to its newest end, and at
// most the newest SAVED_TURN_COUNT_LIMIT turns.
export const SAVED_TURN_CHARACTER_LIMIT = 800000;
export const SAVED_TURN_COUNT_LIMIT = 1000;
export const WEB_SOCKET_MAX_PAYLOAD_BYTES = 4194304;

export const priorTurnListOf = (turnList) => {
	const newestTurnList = (turnList || []).slice(-SAVED_TURN_COUNT_LIMIT);
	let remainingCharacterCount = SAVED_TURN_CHARACTER_LIMIT;
	const priorTurnList = [];
	for (let turnIndex = newestTurnList.length - 1; turnIndex >= 0; turnIndex--) {
		const turn = newestTurnList[turnIndex];
		const askMiloSessionName = askMiloSessionNameOfTurn(turn);
		const prompt = turn.prompt || '';
		const stdout = turn.stdout || '';
		const characterCount = prompt.length + stdout.length + askMiloSessionName.length;
		const isNewestTurn = priorTurnList.length === 0;
		const isWithinLimit = characterCount <= remainingCharacterCount && (isNewestTurn || priorTurnList[0].prompt || priorTurnList[0].stdout);
		if (isNewestTurn && !isWithinLimit) {
			// room is kept for the session names the older turns still send as placeholders
			const olderNameCharacterCount = newestTurnList.slice(0, turnIndex).reduce((soFar, olderTurn) => soFar + askMiloSessionNameOfTurn(olderTurn).length, 0);
			const roomCharacterCount = SAVED_TURN_CHARACTER_LIMIT - olderNameCharacterCount - askMiloSessionName.length;
			const keptPromptText = prompt.slice(0, Math.floor(roomCharacterCount / 10));
			const keptStdoutText = stdout.slice(Math.max(0, stdout.length - (roomCharacterCount - keptPromptText.length)));
			remainingCharacterCount -= keptPromptText.length + keptStdoutText.length + askMiloSessionName.length;
			priorTurnList.unshift({ prompt: keptPromptText, stdout: keptStdoutText, askMiloSessionName });
			continue;
		}
		remainingCharacterCount -= isWithinLimit ? characterCount : askMiloSessionName.length;
		priorTurnList.unshift(isWithinLimit ? { prompt, stdout, askMiloSessionName } : { prompt: '', stdout: '', askMiloSessionName });
	}
	return priorTurnList;
};

// the bytes a WebSocket message takes, as the server's maxPayload counts them
export const messageByteLengthOf = (messageText) => new TextEncoder().encode(messageText).length;

// '\x00' before each block's inner text, exactly as EdunatorPanel splits stdout for the right-hand panel
export const controlStringOf = (stdoutText) =>
	[...String(stdoutText || '').matchAll(/<control[^>]*>([\s\S]*?)<\/control>/g)].map((controlMatch) => '\x00' + controlMatch[1]).join('');

// Saved sessions do not carry controlHtml, so after a load only the turns viewed have it; Save All draws the rest
export const turnIndexListNeedingControlHtmlOf = (turnList) =>
	(turnList || []).map((turn, turnIndex) => (!turn.controlHtml && controlStringOf(turn.stdout) ? turnIndex : -1)).filter((turnIndex) => turnIndex !== -1);
