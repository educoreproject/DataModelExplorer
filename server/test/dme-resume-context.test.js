'use strict';
// dme-resume-context.test.js — lib/dme-resume-context.js names the DME's askMilo sessions and decides which one a
// prompt continues (BRIEF-dmeSessionFixes-111926 defect 1; first review B-1, S-4, P-1, P-2, N-1, N-3; second review
// B2-1 server-chosen names, B2-2 linear stripping and the character cap with a timing gate, S2-2 per-instance key and
// expiry, N2-3 resume the newest proven session). The directory contract writes ONE probe session through askMilo's
// own sessionManager and deletes it again. Calls no model. Run: node server/test/dme-resume-context.test.js

const dmeResumeContextGen = require('../lib/dme-resume-context');
const sessionManager = require('../data-model/lib/ask-milo-multitool/lib/sessionManager');
const realLimitByName = require('../lib/dme-resume-limits.json');

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

const limitByName = { rebuiltContextCharacterBudget: 2000, savedTurnCountLimit: 50, savedTurnCharacterLimit: 100000, resumeProofLifetimeDays: 1 };
let nowMs = Date.parse('2026-11-19T20:00:00Z');
const resumeContext = dmeResumeContextGen({ resumeProofSecret: 'resume-context-test-secret', limitByName, nowMsOf: () => nowMs });
const { resumeProofOf, isResumeProofValid, resumeDecisionOf, askMiloSessionTurnCountOf, askMiloSessionSavedSinceOf, newAskMiloSessionNameOf } = resumeContext;
const { isAskMiloSessionName, answerTextOf } = dmeResumeContextGen;

const savedTurnList = [
	{ prompt: "John's first question", stdout: 'An answer.<control>{"diagram":1}</control> More answer.', askMiloSessionName: 'noble_cedar' },
	{ prompt: 'a follow-up', stdout: 'Second answer.', askMiloSessionName: 'noble_cedar' },
];
const turnCountOf = (turnCountByName) => (askMiloSessionName) => (askMiloSessionName in turnCountByName ? turnCountByName[askMiloSessionName] : null);
const decide = (overrideByName) => resumeDecisionOf({ promptText: 'next?', requestedSessionName: '', resumeProof: '', savedTurnList: undefined, askMiloSessionTurnCountOf: turnCountOf({}), ...overrideByName });

// --- construction refuses absent configuration by name
const constructionErrorOf = (constructionArgs) => {
	let errorText = '';
	try {
		dmeResumeContextGen(constructionArgs);
	} catch (constructionError) {
		errorText = constructionError.message;
	}
	return errorText;
};
const missingSecretText = constructionErrorOf({ limitByName });
check('S2-2: no instance secret: refused at construction, naming the section, the key and how to generate one', /\[dmeResumeProof\]/.test(missingSecretText) && /secret=/.test(missingSecretText) && /randomBytes\(32\)/.test(missingSecretText) && /never copied/.test(missingSecretText), missingSecretText);
check('no limits: refused by name at construction', /limitByName needs/.test(constructionErrorOf({ resumeProofSecret: 'x' })));

// --- B2-1: names come from the server, not from askMilo
const newNameList = Array.from({ length: 5 }, () => newAskMiloSessionNameOf());
check('B2-1: the server names new sessions dme_session_<24 random digits>, all different, all askMilo-valid', newNameList.every((askMiloSessionName) => /^dme_session_\d{24}$/.test(askMiloSessionName) && isAskMiloSessionName(askMiloSessionName)) && new Set(newNameList).size === 5, newNameList.join(' '));
const freshDecision = decide({});
check('a plain new prompt gets a server-chosen new session name and nothing to resume', /^dme_session_\d{24}$/.test(freshDecision.newSessionName) && !freshDecision.resumeSessionName && !freshDecision.refusalText);

// --- the directory contract
const probeSessionName = `zztest_probe_${process.pid}`;
const beforeSaveMs = Date.now() - 5;
sessionManager.saveSession({ sessionName: probeSessionName, turns: [{}, {}, {}] });
check("askMiloSessionTurnCountOf reads a session askMilo's sessionManager just wrote (same directory): 3 turns", askMiloSessionTurnCountOf(probeSessionName) === 3);
check('askMiloSessionSavedSinceOf: written after the moment given, yes; not after a later moment, no', askMiloSessionSavedSinceOf(probeSessionName, beforeSaveMs) === true && askMiloSessionSavedSinceOf(probeSessionName, Date.now() + 60000) === false);
sessionManager.deleteSession(probeSessionName);
check('and reads no session once it is deleted', askMiloSessionTurnCountOf(probeSessionName) === null && askMiloSessionSavedSinceOf(probeSessionName, 0) === false);

// --- names (P-2)
check('a path-like name is not a session name and never reaches the filesystem', !isAskMiloSessionName('../../etc/passwd') && askMiloSessionTurnCountOf('../../etc/passwd') === null);
check('askMilo names and server names are session names; a non-string is not', isAskMiloSessionName('noble_cedar') && isAskMiloSessionName('amber_arch_1763584718000') && !isAskMiloSessionName(['noble_cedar']));

// --- S2-2: the proof
const proof = resumeProofOf('noble_cedar');
check('S2-2: a proof carries its expiry: <10-digit seconds>.<64 hex>', /^\d{10}\.[0-9a-f]{64}$/.test(proof), proof);
check('the proof is valid for its name now', isResumeProofValid('noble_cedar', proof));
check('not for another name', !isResumeProofValid('amber_arch', proof));
check("S2-2: not under another instance's key", !dmeResumeContextGen({ resumeProofSecret: 'another instance', limitByName, nowMsOf: () => nowMs }).isResumeProofValid('noble_cedar', proof));
check('not with its expiry edited (the signature covers it)', !isResumeProofValid('noble_cedar', proof.replace(/^\d{10}/, (secondsText) => String(Number(secondsText) + 86400 * 365))));
nowMs += 2 * 86400 * 1000;
check('S2-2: not after it expires (lifetime 1 day here)', !isResumeProofValid('noble_cedar', proof));
const expiredWithTurns = decide({ requestedSessionName: 'noble_cedar', resumeProof: proof, savedTurnList });
check('an EXPIRED proof with saved turns is not refused: the session is rebuilt into a new one', expiredWithTurns.newSessionName && !expiredWithTurns.resumeSessionName && expiredWithTurns.rebuiltTurnCount === 2 && !expiredWithTurns.refusalText);
nowMs -= 2 * 86400 * 1000;

// --- B-1 / B2-2: validation and the cap
check('B-1: savedTurnList [null] is refused by name', /saved turn 1 is not a \{prompt, stdout\} record/.test(decide({ savedTurnList: [null] }).refusalText));
check('B-1: a non-list, an array turn, a numeric stdout, a non-string askMiloSessionName are refused', [{ notList: true }, [[1]], [{ prompt: 'a', stdout: 5 }], [{ prompt: 'a', askMiloSessionName: 7 }]].every((badList) => decide({ savedTurnList: badList }).refusalText));
check('more turns than the limit is refused by name', /more than the 50 allowed/.test(decide({ savedTurnList: new Array(51).fill({ prompt: 'p', stdout: 's' }) }).refusalText));
check('B2-2: more characters than the limit is refused by name', /more than the 100000 characters allowed/.test(decide({ savedTurnList: [{ prompt: 'p', stdout: 'x'.repeat(100000) }] }).refusalText));

// B2-2: the timing gate, at the REAL cap, with the input that was quadratic: unclosed <control> openings
const realContext = dmeResumeContextGen({ resumeProofSecret: 'timing', limitByName: realLimitByName });
const hostileStdout = '<control>'.repeat(Math.floor((realLimitByName.savedTurnCharacterLimit - 10) / 9));
const startMs = Date.now();
const hostileDecision = realContext.resumeDecisionOf({ promptText: 'q', requestedSessionName: '', resumeProof: '', savedTurnList: [{ prompt: 'p', stdout: hostileStdout }] });
const elapsedMs = Date.now() - startMs;
check(`B2-2: ${hostileStdout.length} characters of unclosed <control> openings (the cap) decide in under 250 ms (took ${elapsedMs} ms)`, elapsedMs < 250 && !hostileDecision.refusalText, `${elapsedMs} ms`);
const closedStdout = 'a<control x="1">b</control>c'.repeat(20000);
const closedStartMs = Date.now();
answerTextOf(closedStdout);
check(`B2-2: ${closedStdout.length} characters of closed blocks strip in under 100 ms (took ${Date.now() - closedStartMs} ms)`, Date.now() - closedStartMs < 100);

// --- P-1: the proof is required
const noProof = decide({ requestedSessionName: 'noble_cedar' });
check('P-1: a name with no proof and no saved turns is refused, nothing resumed', noProof.refusalText && !noProof.resumeSessionName && !noProof.newSessionName);
const proven = decide({ requestedSessionName: 'noble_cedar', resumeProof: resumeProofOf('noble_cedar') });
check('P-1: the proven name, no saved turns (an ordinary follow-up): resumed', proven.resumeSessionName === 'noble_cedar' && !proven.newSessionName && !proven.priorContextText && !proven.refusalText);

// --- reopened sessions
const intact = decide({ requestedSessionName: 'noble_cedar', resumeProof: resumeProofOf('noble_cedar'), savedTurnList, askMiloSessionTurnCountOf: turnCountOf({ noble_cedar: 2 }) });
check('askMilo holds exactly the 2 turns this session says noble_cedar answered: resumed as is, no notice', intact.resumeSessionName === 'noble_cedar' && !intact.priorContextText && !intact.noticeText);

const afterRebuild = [{ prompt: 'old', stdout: 'old answer', askMiloSessionName: 'noble_cedar' }, { prompt: 'q2', stdout: 'a2', askMiloSessionName: 'dme_session_000000000000000000000001' }];
const afterRebuildDecision = decide({ requestedSessionName: 'dme_session_000000000000000000000001', resumeProof: resumeProofOf('dme_session_000000000000000000000001'), savedTurnList: afterRebuild, askMiloSessionTurnCountOf: turnCountOf({ dme_session_000000000000000000000001: 1 }) });
check('N2-3: after a rebuild, the new session (1 turn, answered 1 of the saved turns) is RESUMED on the next reopen, not rebuilt again', afterRebuildDecision.resumeSessionName === 'dme_session_000000000000000000000001' && !afterRebuildDecision.priorContextText, JSON.stringify(afterRebuildDecision).slice(0, 200));

const gone = decide({ requestedSessionName: 'noble_cedar', resumeProof: resumeProofOf('noble_cedar'), savedTurnList });
check('askMilo no longer has it: the same name is kept (askMilo recreates it), the saved turns become priorContextText', gone.resumeSessionName === 'noble_cedar' && gone.rebuiltTurnCount === 2 && gone.priorContextText.includes("PROMPT: John's first question"), gone.priorContextText.slice(0, 200));
check('S2-3: the rebuilt context is NOT put in the prompt (askMilo stores the prompt as the turn)', !('promptText' in gone) || gone.promptText === undefined);
check('the rebuilt context leaves out the <control> panel blocks', !gone.priorContextText.includes('diagram') && gone.priorContextText.includes('An answer. More answer.'));
check('and the user is told, naming the lost conversation', /noble_cedar\) was no longer on the server/.test(gone.noticeText) && /rebuilt from its 2 saved turns/.test(gone.noticeText), gone.noticeText);

const contaminated = decide({ requestedSessionName: 'noble_cedar', resumeProof: resumeProofOf('noble_cedar'), savedTurnList, askMiloSessionTurnCountOf: turnCountOf({ noble_cedar: 7 }) });
check('N-3: askMilo holds 7 turns, the session says 2: NOT resumed, rebuilt into a new server-named session, and said so', !contaminated.resumeSessionName && /^dme_session_\d{24}$/.test(contaminated.newSessionName) && /holds 7 turns, not the 2/.test(contaminated.noticeText), contaminated.noticeText);

const unnamed = decide({ savedTurnList });
check('no name: rebuilt into a new server-named session, and said so', !unnamed.resumeSessionName && unnamed.newSessionName && unnamed.rebuiltTurnCount === 2 && /could not be resumed directly/.test(unnamed.noticeText));

const unusableWithTurns = decide({ requestedSessionName: 'x; rm -rf /', savedTurnList });
check('N-1/P-2: an unusable name WITH saved turns is not refused: rebuilt into a new session', !unusableWithTurns.resumeSessionName && unusableWithTurns.newSessionName && unusableWithTurns.rebuiltTurnCount === 2 && !unusableWithTurns.refusalText);

// --- S-4: the rebuild cap, newest kept; placeholders (sent empty to keep the count) are skipped
const bigTurnList = Array.from({ length: 10 }, (unused, turnIndex) => ({ prompt: `question ${turnIndex + 1}`, stdout: 'a'.repeat(500) }));
const capped = decide({ savedTurnList: bigTurnList });
check('S-4: the rebuilt context stays within its character budget', capped.priorContextText.length < limitByName.rebuiltContextCharacterBudget + 100, `${capped.priorContextText.length}`);
check('S-4: the NEWEST turns are kept, the oldest left out, and the user is told how many', capped.priorContextText.includes('PROMPT: question 10') && !capped.priorContextText.includes('PROMPT: question 1\n') && new RegExp(`The ${capped.omittedTurnCount} oldest turns were left out`).test(capped.noticeText), capped.noticeText);
const withPlaceholders = decide({ savedTurnList: [{ prompt: '', stdout: '', askMiloSessionName: 'noble_cedar' }, { prompt: 'kept', stdout: 'kept answer' }] });
check('a placeholder turn (sent empty) is not written into the rebuilt context', !withPlaceholders.priorContextText.includes('--- Turn 1 ---') && withPlaceholders.priorContextText.includes('PROMPT: kept'));

check('answerTextOf strips a control block with attributes, as EdunatorPanel splits it, and keeps an unclosed one as text', answerTextOf('a<control type="x">b</control>c') === 'ac' && answerTextOf('a<control>b') === 'a<control>b');

const failedCount = resultList.filter((passed) => !passed).length;
console.log(`dme-resume-context: ${resultList.length - failedCount} passed, ${failedCount} failed`);
process.exit(failedCount ? 1 : 0);
