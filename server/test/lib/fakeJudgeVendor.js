'use strict';
// fakeJudgeVendor — Anthropic's side of the forge client's network seam (its componentOverrides.postOnce), for gates: no socket, no key, no spend. The real client, judgeOne, renderer and store all run.
//   fakeJudgeVendorFor({ answerFor?, faultScript? }) → { postOnce, callLog, setFaultScript(list), holdNextCall() }
//   answerFor({ payload, callIndex }) → { choice, category, rationale, predicate } ; by default the first candidate, strong. faultScript: answers given before any judging, each { status, body } or { transportError } in turn.

const TOOL_NAME = 'select_candidate';

const INPUT_TOKENS = 4053;
const OUTPUT_TOKENS = 316;
const PICK_PREDICATE_BY_CATEGORY = Object.freeze({ strong: 'exactMatch', moderate: 'closeMatch', weakButReal: 'broadMatch' });
const pickOf = (choice, category, rationale) => ({ choice, category, rationale, predicate: PICK_PREDICATE_BY_CATEGORY[category] });
const abstentionOf = (rationale) => ({ choice: 'NONE', category: 'none', rationale, predicate: 'none' });

const fakeJudgeVendorFor = ({ answerFor = () => pickOf('1', 'strong', 'The first candidate means the same thing.'), answerDelayMs = 0 } = {}) => {
	const callLog = [];
	let faultScriptList = [];
	let heldCallList = null;
	const answerNow = ({ payload, callIndex }, callback) => {
		const oneFault = faultScriptList.shift();
		if (oneFault) {
			if (oneFault.transportError) {
				callback(oneFault.transportError, null, 0);
				return;
			}
			callback('', oneFault.body, oneFault.status);
			return;
		}
		callback('', { content: [{ type: 'tool_use', name: TOOL_NAME, input: answerFor({ payload, callIndex }) }], usage: { input_tokens: INPUT_TOKENS, output_tokens: OUTPUT_TOKENS }, stop_reason: 'tool_use' }, 200);
	};
	const postOnce = ({ payload }, callback) => {
		const callIndex = callLog.length;
		callLog.push({ maxTokens: payload.max_tokens, model: payload.model, userPrompt: payload.messages[0].content, systemPrompt: payload.system, atMs: Date.now() });
		if (heldCallList) {
			heldCallList.push(() => answerNow({ payload, callIndex }, callback));
			return;
		}
		if (answerDelayMs) {
			setTimeout(() => answerNow({ payload, callIndex }, callback), answerDelayMs);
			return;
		}
		answerNow({ payload, callIndex }, callback);
	};
	return {
		postOnce,
		callLog,
		setFaultScript: (oneList) => { faultScriptList = [...oneList]; },
		holdCalls: () => { heldCallList = []; },
		heldCallCount: () => (heldCallList ? heldCallList.length : 0),
		releaseCalls: () => {
			const releaseList = heldCallList || [];
			heldCallList = null;
			releaseList.forEach((releaseOne) => releaseOne());
		},
	};
};

module.exports = { fakeJudgeVendorFor, pickOf, abstentionOf, INPUT_TOKENS, OUTPUT_TOKENS };
