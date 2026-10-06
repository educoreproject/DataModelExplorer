'use strict';

// stopReason.js — why the model stopped, carried with every single-call answer (W-D-21 / W-E-3, campaign P1, 2026-10-06).
// The tools driver used to treat every non-tool_use stop as a finished answer, so a reply cut off at the output limit
// reached Slack and the web as if it were whole. Every single-call driver now returns through finalAnswerFor: the answer
// names its stopReason, and a stop listed here is a CUT-OFF answer — answerCutOff is set and the marker is appended to
// the text, so whoever reads it is told. The table is data: a new kind of incomplete stop is one more row.

const ANSWER_STOP_REASON_MARKER_BY_REASON = Object.freeze({
	max_tokens: '[answer cut off at the model output limit — ask for the remainder]',
	maxToolIterations: '[stopped at the tool-call limit before an answer was reached — ask a narrower question]',
});

const finalAnswerFor = ({ responseText, cost, stopReason }) => {
	if (typeof stopReason !== 'string' || stopReason === '') {
		throw new Error('finalAnswerFor: stopReason is required (why the model stopped); a driver must pass it');
	}
	const cutOffMarker = ANSWER_STOP_REASON_MARKER_BY_REASON[stopReason];
	return {
		responseText: cutOffMarker ? `${responseText}\n\n${cutOffMarker}` : responseText,
		cost,
		stopReason,
		answerCutOff: !!cutOffMarker,
	};
};

module.exports = Object.freeze({ ANSWER_STOP_REASON_MARKER_BY_REASON, finalAnswerFor });
