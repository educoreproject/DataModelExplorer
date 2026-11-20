// edunatorStoreResume.test.mjs — the REAL createEdunatorStore in node (pinia, a recording WebSocket, axios answered
// in-process): what a reopened DME session sends, and when it stops sending its saved turns. Covers the 2026-11-19
// adversarial review's S-5 (a lost first prompt must not leave later prompts without context) and the resume proof
// (P-1) as the browser carries it. No server, no model.
// Run: node html/test/edunatorStoreResume.test.mjs

import { createPinia, setActivePinia } from 'pinia';
import axios from 'axios';
import { createEdunatorStore } from '../stores/createEdunatorStore.js';

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

// a WebSocket that records what the store sends; the test plays the server by calling onmessage
const sentMessageList = [];
class RecordingWebSocket {
	constructor() {
		this.readyState = 1;
		RecordingWebSocket.latest = this;
	}
	send(text) {
		sentMessageList.push(JSON.parse(text));
	}
	close() {}
}
globalThis.WebSocket = RecordingWebSocket;
globalThis.useBackendProfile = () => ({ wsHost: 'localhost:1' });
globalThis.window = { location: { host: 'localhost:1' } };

// the saved session the load answers with: two turns, answered by ivory_tide, with the proof the server issued
const savedSessionData = [
	{ prompt: 'first', stdout: 'one', stderr: '', timestamp: 1, askMiloSessionName: 'ivory_tide', askMiloResumeProof: 'a'.repeat(64) },
	{ prompt: 'second', stdout: 'two', stderr: '', timestamp: 2, askMiloSessionName: 'ivory_tide', askMiloResumeProof: 'b'.repeat(64) },
];
axios.get = async () => ({ data: [{ refId: 'sessionRefIdProbe', sessionName: 'probe', sessionData: savedSessionData }] });
axios.post = async () => ({ data: [{ refId: 'sessionRefIdProbe', sessionName: 'probe' }] });

setActivePinia(createPinia());
const store = createEdunatorStore({ storeId: 'resumeTestStore', sessionEndpoints: { save: '/s', list: '/l', load: '/ld', delete: '/d' } })();
store.connect();
const serverSays = async (message) => RecordingWebSocket.latest.onmessage({ data: JSON.stringify(message) });
const lastSent = () => sentMessageList[sentMessageList.length - 1];

await store.loadSession('sessionRefIdProbe');
check('a loaded session resumes its askMilo session WITH the newest proof', store.settings.resumeSessionName === 'ivory_tide' && store.settings.resumeProof === 'b'.repeat(64) && store.settings.newSession === false, JSON.stringify(store.settings));

store.sendPrompt('third');
check('the first prompt after a load carries the saved turns, the name and the proof', lastSent().savedTurnList && lastSent().savedTurnList.length === 2 && lastSent().settings.resumeSessionName === 'ivory_tide' && lastSent().settings.resumeProof === 'b'.repeat(64), JSON.stringify(lastSent()).slice(0, 300));

// that run never saves (killed by the next prompt, the socket drops, askMilo fails): the next prompt still has the turns
await serverSays({ channel: 'done', exitCode: 1 });
store.sendPrompt('fourth');
check('S-5: a prompt whose run never saved does not use up the saved turns: the next prompt carries them again', lastSent().savedTurnList && lastSent().savedTurnList.length === 2, JSON.stringify(lastSent()).slice(0, 200));

// now askMilo saves, and the server passes on the name with its proof
await serverSays({ channel: 'askMiloSessionSaved', askMiloSessionName: 'ivory_tide', resumeProof: 'c'.repeat(64) });
check('a confirmed save records name and proof on the turn and in the settings', store.responses[store.responses.length - 1].askMiloResumeProof === 'c'.repeat(64) && store.settings.resumeProof === 'c'.repeat(64));
await serverSays({ channel: 'done', exitCode: 0 });
store.sendPrompt('fifth');
check('after a confirmed save the saved turns are no longer sent; the prompt resumes by proof', lastSent().savedTurnList === undefined && lastSent().settings.resumeSessionName === 'ivory_tide' && lastSent().settings.resumeProof === 'c'.repeat(64), JSON.stringify(lastSent()).slice(0, 200));

// a stderr chunk that merely mentions "Session saved:" is not trusted any more: only the server's own message is
await serverSays({ channel: 'stderr', delta: 'Session saved: noble_cedar\n' });
check('a "Session saved:" line in stderr no longer changes what is resumed (only askMiloSessionSaved does)', store.settings.resumeSessionName === 'ivory_tide');

store.startNewSession();
check('a new session forgets name, proof and pending turns', store.settings.resumeSessionName === '' && store.settings.resumeProof === '' && store.settings.newSession === true && store._priorTurnListPending === null);

const failedCount = resultList.filter((passed) => !passed).length;
console.log(`edunatorStoreResume: ${resultList.length - failedCount} passed, ${failedCount} failed`);
process.exit(failedCount ? 1 : 0);
