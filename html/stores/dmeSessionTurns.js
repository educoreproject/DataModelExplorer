// @concept: [[SessionPersistence]]
// dmeSessionTurns.js — pure helpers for what a saved DME session carries and how a reopened one resumes.
// No Vue, no Pinia, no axios: createEdunatorStore.js calls these, and html/test/dmeSessionTurns.test.mjs runs them in node.
//
//   ASKMILO_SESSION_SAVED_PATTERN        the line askMilo writes to stderr when it stores a turn
//   askMiloSessionNameOfTurn(turn)       the askMilo session that answered one turn ('' when the turn does not say)
//   resumePlanOf(turnList)               { resumeSessionName, isRebuildNeeded } for a session just loaded
//   savedTurnListOf(turnList)            the turns as they are POSTed to dmeSessionSave (controlHtml left out)
//   priorTurnListOf(turnList)            the prompt and answer of each turn, sent once to the server after a reload

export const ASKMILO_SESSION_SAVED_PATTERN = /Session saved:\s*(\S+)/;

// Turns saved after this fix carry askMiloSessionName; older turns only have it in their stderr log.
export const askMiloSessionNameOfTurn = (turn) => {
	if (turn && turn.askMiloSessionName) return turn.askMiloSessionName;
	const sessionMatch = String((turn && turn.stderr) || '').match(ASKMILO_SESSION_SAVED_PATTERN);
	return sessionMatch ? sessionMatch[1] : '';
};

// One askMilo session behind every named turn: resume it (the server rebuilds it if it is gone).
// No name, or more than one (sessions damaged by the pre-fix reload bug, where follow-ups went to a new
// askMilo session): resume none, and have the server rebuild the conversation from the saved turns.
export const resumePlanOf = (turnList) => {
	const distinctNameList = [...new Set((turnList || []).map(askMiloSessionNameOfTurn).filter(Boolean))];
	if (distinctNameList.length === 1) {
		return { resumeSessionName: distinctNameList[0], isRebuildNeeded: false };
	}
	return { resumeSessionName: '', isRebuildNeeded: true };
};

// controlHtml is the right-hand panel serialized from the DOM. EdunatorPanel regenerates it from the <control>
// blocks in stdout whenever a turn is shown, so saving it doubled the payload for nothing (about a quarter of it).
export const savedTurnListOf = (turnList) =>
	(turnList || []).map((turn) => {
		const { controlHtml, ...savedTurn } = turn;
		return savedTurn;
	});

export const priorTurnListOf = (turnList) => (turnList || []).map((turn) => ({ prompt: turn.prompt || '', stdout: turn.stdout || '' }));
