'use strict';
// @concept: [[CompanionPages]]
//
// companion-moment-clock.js — the one clock that stamps companion source uploads (uploadedAt) and compiles (compiledAt).
// companion-compile-history decides which sources a compile used by comparing those stamps ("the newest row of each
// part uploaded at or before compiledAt"), so two stamps must never be equal: an upload and a compile in the same
// millisecond, or two revisions of one part, would tie and the wrong row would be chosen. With better-sqlite3 (sqlite-
// instance 11.0) writes are synchronous and that happened (companion-page-admin.test.js flaked, 2026-11-19).
//
// Each stamp is the current time, or 1 ms after the previous stamp when the clock has not moved on, so stamps from one
// process are strictly increasing in the order the events happened. The order lives in the stamp itself, so it survives
// a copy or VACUUM of the tables (a rowid would not). data-model.js makes ONE clock and hands it to every access point.
//
//   const companionMomentClock = companionMomentClockOf()
//   companionMomentClock.nextMomentText() -> ISO 8601 text, later than every earlier one from this clock

const companionMomentClockOf = () => {
	let lastMomentMs = 0;
	const nextMomentText = () => {
		lastMomentMs = Math.max(Date.now(), lastMomentMs + 1);
		return new Date(lastMomentMs).toISOString();
	};
	return { nextMomentText };
};

module.exports = { companionMomentClockOf };
