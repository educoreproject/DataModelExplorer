'use strict';

// mcpSessionKeeper — how many MCP sessions one account may hold, and when an idle one goes (standardsQueryService design, P2). A session holds a transport and an McpServer in this
// process's memory, so without this every initialize a client forgets to DELETE stays until restart.
//
//   createMcpSessionKeeper({ sessionCapPerSub, sessionIdleTtlMilliseconds, nowMs, closeSessionByRefId })
//     → { reserveSession(subjectRefId) → { isAdmitted: true, sessionOpened(sessionRefId), release() } | { isAdmitted: false, retryAfterSeconds },
//         touchSession(sessionRefId), sessionClosed(sessionRefId), sweepIdleSessions(), openSessionCountFor(subjectRefId) }
//
// A RESERVATION, not a count of open sessions, is what is tested: a session is not open until the transport has answered initialize, so ten initializes arriving together would each
// see room. An empty subject is the loopback path, which has no sub: it is not capped, because a machine's own clients are not strangers, and its sessions still go when idle.

const MILLISECONDS_PER_SECOND = 1000;

const createMcpSessionKeeper = ({ sessionCapPerSub, sessionIdleTtlMilliseconds, nowMs, closeSessionByRefId }) => {
	[['sessionCapPerSub', sessionCapPerSub], ['sessionIdleTtlMilliseconds', sessionIdleTtlMilliseconds]].forEach(([limitName, limitNumber]) => {
		if (!Number.isInteger(limitNumber) || limitNumber < 1) {
			throw new Error(`mcpSessionKeeper: ${limitName} must be a positive integer; got ${limitNumber}`);
		}
	});

	const sessionFactsByRefId = new Map();
	const reservedCountBySubject = new Map();

	const openSessionCountFor = (subjectRefId) => [...sessionFactsByRefId.values()].filter((sessionFacts) => sessionFacts.subjectRefId === subjectRefId).length;
	const changeReservedCount = (subjectRefId, changeCount) => reservedCountBySubject.set(subjectRefId, (reservedCountBySubject.get(subjectRefId) || 0) + changeCount);

	const secondsUntilOneGoes = (subjectRefId) => {
		const lastUsedList = [...sessionFactsByRefId.values()].filter((sessionFacts) => sessionFacts.subjectRefId === subjectRefId).map((sessionFacts) => sessionFacts.lastUsedMs);
		const soonestGoneMs = lastUsedList.length > 0 ? Math.min(...lastUsedList) + sessionIdleTtlMilliseconds : nowMs() + sessionIdleTtlMilliseconds;
		return Math.max(1, Math.ceil((soonestGoneMs - nowMs()) / MILLISECONDS_PER_SECOND));
	};

	const reserveSession = (subjectRefId) => {
		const isCapped = subjectRefId !== '';
		if (isCapped && openSessionCountFor(subjectRefId) + (reservedCountBySubject.get(subjectRefId) || 0) >= sessionCapPerSub) {
			return { isAdmitted: false, retryAfterSeconds: secondsUntilOneGoes(subjectRefId) };
		}
		changeReservedCount(subjectRefId, 1);
		let isReservationHeld = true;
		const release = () => {
			if (isReservationHeld) {
				isReservationHeld = false;
				changeReservedCount(subjectRefId, -1);
			}
		};
		return {
			isAdmitted: true,
			sessionOpened: (sessionRefId) => {
				sessionFactsByRefId.set(sessionRefId, { subjectRefId, lastUsedMs: nowMs() });
				release();
			},
			release,
		};
	};

	const touchSession = (sessionRefId) => {
		const sessionFacts = sessionFactsByRefId.get(sessionRefId);
		if (sessionFacts) {
			sessionFacts.lastUsedMs = nowMs();
		}
	};

	const sweepIdleSessions = () => {
		const oldestAllowedMs = nowMs() - sessionIdleTtlMilliseconds;
		[...sessionFactsByRefId.entries()].filter(([, sessionFacts]) => sessionFacts.lastUsedMs <= oldestAllowedMs).forEach(([sessionRefId]) => {
			sessionFactsByRefId.delete(sessionRefId);
			closeSessionByRefId(sessionRefId);
		});
	};

	return {
		reserveSession,
		touchSession,
		sessionClosed: (sessionRefId) => sessionFactsByRefId.delete(sessionRefId),
		sweepIdleSessions,
		openSessionCountFor,
	};
};

module.exports = { createMcpSessionKeeper };
