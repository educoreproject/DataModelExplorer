'use strict';
// dme-resume-context.test.js — a reopened DME session whose askMilo session is missing (or untrustworthy) is answered
// WITH its saved turns as context, and says so (BRIEF-dmeSessionFixes-111926, defect 1). lib/dme-resume-context.js.
// The directory contract writes ONE probe session, 'zztest_probe_<pid>', through askMilo's own
// sessionManager and deletes it again. Calls no model. Run: node server/test/dme-resume-context.test.js

const { askMiloSessionExists, isAskMiloSessionName, resumedPromptOf, answerTextOf } = require('../lib/dme-resume-context');
const sessionManager = require('../data-model/lib/ask-milo-multitool/lib/sessionManager');

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

const savedTurnList = [
	{ prompt: "John's first question", stdout: 'An answer.<control>{"diagram":1}</control> More answer.' },
	{ prompt: 'a follow-up', stdout: 'Second answer.' },
];
const alwaysMissing = () => false;
const alwaysPresent = () => true;

// the directory contract: what sessionManager writes, askMiloSessionExists finds
const probeSessionName = `zztest_probe_${process.pid}`;
sessionManager.saveSession({ sessionName: probeSessionName, turns: [] });
check("askMiloSessionExists finds a session askMilo's sessionManager just wrote (same directory)", askMiloSessionExists(probeSessionName) === true);
sessionManager.deleteSession(probeSessionName);
check('and does not find it once deleted', askMiloSessionExists(probeSessionName) === false);

check('a path-like name is not a session name and never reaches the filesystem', isAskMiloSessionName('../../etc/passwd') === false && askMiloSessionExists('../../etc/passwd') === false);
check('askMilo names are session names (noble_cedar, amber_arch_1763584718000)', isAskMiloSessionName('noble_cedar') && isAskMiloSessionName('amber_arch_1763584718000'));

const present = resumedPromptOf({ promptText: 'next?', resumeSessionName: 'noble_cedar', savedTurnList, askMiloSessionExists: alwaysPresent });
check('askMilo still has the session: the prompt goes as typed, no notice (askMilo resumes it)', present.promptText === 'next?' && present.rebuiltTurnCount === 0 && present.noticeText === '');

const noTurns = resumedPromptOf({ promptText: 'next?', resumeSessionName: 'noble_cedar', savedTurnList: undefined, askMiloSessionExists: alwaysMissing });
check('no saved turns sent (every prompt after the first): the prompt goes as typed', noTurns.promptText === 'next?' && noTurns.rebuiltTurnCount === 0);

const missing = resumedPromptOf({ promptText: 'next?', resumeSessionName: 'noble_cedar', savedTurnList, askMiloSessionExists: alwaysMissing });
check('the session is gone: both saved turns are prepended, the new question last', missing.rebuiltTurnCount === 2 && missing.promptText.includes("PROMPT: John's first question") && missing.promptText.includes('RESPONSE: Second answer.') && missing.promptText.endsWith('=== NEW QUESTION ===\nnext?'), missing.promptText);
check('the rebuilt context leaves out the <control> panel blocks', !missing.promptText.includes('diagram') && missing.promptText.includes('An answer. More answer.'));
check('and the user is told, naming the lost session', /noble_cedar/.test(missing.noticeText) && /rebuilt from its 2 saved turns/.test(missing.noticeText), missing.noticeText);
check('the notice cannot be mistaken for askMilo\'s own "Session saved:" line', !/Session saved:/.test(missing.noticeText));

const unnamed = resumedPromptOf({ promptText: 'next?', resumeSessionName: '', savedTurnList, askMiloSessionExists: alwaysPresent });
check('no trustworthy name (a session damaged before the fix): rebuilt anyway, and said so', unnamed.rebuiltTurnCount === 2 && /could not be resumed directly/.test(unnamed.noticeText), unnamed.noticeText);

const refused = resumedPromptOf({ promptText: 'next?', resumeSessionName: 'x; rm -rf /', savedTurnList, askMiloSessionExists: alwaysMissing });
check('a name that is not an askMilo name is refused by name, nothing rebuilt', /is not an askMilo session name/.test(refused.refusalText) && refused.rebuiltTurnCount === 0);

check('answerTextOf strips a control block with attributes, as EdunatorPanel splits it', answerTextOf('a<control type="x">b</control>c') === 'ac');

const failedCount = resultList.filter((passed) => !passed).length;
console.log(`dme-resume-context: ${resultList.length - failedCount} passed, ${failedCount} failed`);
process.exit(failedCount ? 1 : 0);
