#!/usr/bin/env node
'use strict';

// public-request-limiter.js — the in-memory abuse limit of the public account endpoints (PLAN-userRegistrationReset-112026
// 4.5): at most requestLimit admissions per subject (a client address, or a username-or-email) in any rolling window of
// windowMinutes. Each access point that needs one builds its own at load, so the counts live in that module's closure,
// never on process.global. A restart forgets them, which is acceptable for a limit meant to slow a script, not to
// account for anyone.
//
//   requestLimiterOf({ requestLimit, windowMinutes }) -> { admissionOf(subjectText, nowMilliseconds), releaseAdmission(subjectText, admittedAtMilliseconds) }
//   admissionOf -> { isAdmitted: true, admittedAtMilliseconds } or { isAdmitted: false, retryAfterSeconds }
//   releaseAdmission -> true when that one admission was found and no longer counts, false when it was not there
//
// A refused request is not counted, so a client that keeps trying is admitted again once its window has moved on.
// releaseAdmission takes back ONE admission (the one admissionOf stamped admittedAtMilliseconds), so a caller can say
// "this request turned out not to count" (WORKORDER-accountMailLooseEnds-112326 E3: a request whose mail failed).

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_SECOND = 1000;
// subjects are pruned once the map grows past this, so a flood of distinct subjects cannot grow it without bound
const PRUNE_AT_SUBJECT_COUNT = 5000;

const requestLimiterOf = ({ requestLimit, windowMinutes }) => {
	if (!Number.isInteger(requestLimit) || requestLimit < 1 || !Number.isInteger(windowMinutes) || windowMinutes < 1) {
		throw new Error(`[${moduleName}] requestLimit and windowMinutes must be positive whole numbers, got ${JSON.stringify({ requestLimit, windowMinutes })}`);
	}
	const windowMilliseconds = windowMinutes * MILLISECONDS_PER_MINUTE;
	const admittedAtListBySubject = new Map();

	const pruneAll = (nowMilliseconds) =>
		[...admittedAtListBySubject.keys()].forEach((subjectText) => {
			const liveList = admittedAtListBySubject.get(subjectText).filter((admittedAt) => nowMilliseconds - admittedAt < windowMilliseconds);
			if (liveList.length) {
				admittedAtListBySubject.set(subjectText, liveList);
			} else {
				admittedAtListBySubject.delete(subjectText);
			}
		});

	const admissionOf = (subjectText, nowMilliseconds = Date.now()) => {
		if (admittedAtListBySubject.size > PRUNE_AT_SUBJECT_COUNT) {
			pruneAll(nowMilliseconds);
		}
		const subjectName = String(subjectText);
		const liveList = (admittedAtListBySubject.get(subjectName) || []).filter((admittedAt) => nowMilliseconds - admittedAt < windowMilliseconds);
		if (liveList.length >= requestLimit) {
			admittedAtListBySubject.set(subjectName, liveList);
			return { isAdmitted: false, retryAfterSeconds: Math.max(1, Math.ceil((liveList[0] + windowMilliseconds - nowMilliseconds) / MILLISECONDS_PER_SECOND)) };
		}
		admittedAtListBySubject.set(subjectName, [...liveList, nowMilliseconds]);
		return { isAdmitted: true, admittedAtMilliseconds: nowMilliseconds };
	};

	const releaseAdmission = (subjectText, admittedAtMilliseconds) => {
		const subjectName = String(subjectText);
		const admittedAtList = admittedAtListBySubject.get(subjectName) || [];
		const releasedPosition = admittedAtList.indexOf(admittedAtMilliseconds);
		if (releasedPosition < 0) {
			return false;
		}
		admittedAtListBySubject.set(subjectName, admittedAtList.filter((admittedAt, position) => position !== releasedPosition));
		return true;
	};

	return { admissionOf, releaseAdmission };
};

module.exports = { requestLimiterOf };
