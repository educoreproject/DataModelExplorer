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

// One askMilo session behind every named turn, and the server's proof for it (askMiloResumeProof, issued with each
// save since 2026-11-19): resume it; the server still rebuilds if askMilo no longer has it or holds other turns.
// No name, more than one (sessions damaged by the pre-fix reload bug), or no proof (turns saved before proofs
// existed): resume none, and the server rebuilds the conversation from the saved turns.
export const resumePlanOf = (turnList) => {
	const namedTurnList = (turnList || []).filter((turn) => askMiloSessionNameOfTurn(turn));
	const distinctNameList = [...new Set(namedTurnList.map(askMiloSessionNameOfTurn))];
	const provenTurn = [...namedTurnList].reverse().find((turn) => turn.askMiloResumeProof);
	if (distinctNameList.length === 1 && provenTurn) {
		return { resumeSessionName: distinctNameList[0], resumeProof: provenTurn.askMiloResumeProof, isRebuildNeeded: false };
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

export const priorTurnListOf = (turnList) => (turnList || []).map((turn) => ({ prompt: turn.prompt || '', stdout: turn.stdout || '' }));

// '\x00' before each block's inner text, exactly as EdunatorPanel splits stdout for the right-hand panel
export const controlStringOf = (stdoutText) =>
	[...String(stdoutText || '').matchAll(/<control[^>]*>([\s\S]*?)<\/control>/g)].map((controlMatch) => '\x00' + controlMatch[1]).join('');

// Saved sessions do not carry controlHtml, so after a load only the turns viewed have it; Save All draws the rest
export const turnIndexListNeedingControlHtmlOf = (turnList) =>
	(turnList || []).map((turn, turnIndex) => (!turn.controlHtml && controlStringOf(turn.stdout) ? turnIndex : -1)).filter((turnIndex) => turnIndex !== -1);
