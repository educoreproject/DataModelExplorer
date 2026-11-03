'use strict';

// requestLimiter — the per-address and global caps of the Query API door (design section 1.7). In this process, keyed on the caller of admit, which passes
// req.ip and NEVER a header read by hand: X-Forwarded-For is the client's to write, and `trust proxy 1` already makes req.ip the address nginx saw.
//
//   createRequestLimiter({ requestsPerMinute, burstPerSecond, nowMs }) → { admit(clientAddress) → { isAdmitted } | { isAdmitted: false, retryAfterSeconds }, trackedAddressCount() }
//
// A sliding minute, not a refilling bucket: the gate is that the 61st request in a minute is refused, and a bucket refilling at one a second lets a paced client
// send far more than requestsPerMinute inside a minute's window while refusing a brief burst below it. burstPerSecond bounds the burst the design's burst=20 meant.

const WINDOW_MILLISECONDS = 60000;
const BURST_WINDOW_MILLISECONDS = 1000;
const PRUNE_AT_ADDRESS_COUNT = 50000;

const createRequestLimiter = ({ requestsPerMinute, burstPerSecond, nowMs }) => {
	[['requestsPerMinute', requestsPerMinute], ['burstPerSecond', burstPerSecond]].forEach(([limitName, limitNumber]) => {
		if (!Number.isInteger(limitNumber) || limitNumber < 1) {
			throw new Error(`requestLimiter: ${limitName} must be a positive integer; got ${limitNumber}`);
		}
	});
	const requestTimeListByAddress = new Map();

	// a spray of addresses must not grow this without bound: past the mark, addresses silent for a whole window go
	const pruneWhenLarge = (currentMs) => {
		if (requestTimeListByAddress.size < PRUNE_AT_ADDRESS_COUNT) {
			return;
		}
		requestTimeListByAddress.forEach((timeList, clientAddress) => {
			if (timeList[timeList.length - 1] <= currentMs - WINDOW_MILLISECONDS) {
				requestTimeListByAddress.delete(clientAddress);
			}
		});
	};

	const admit = (clientAddress) => {
		const currentMs = nowMs();
		pruneWhenLarge(currentMs);
		const windowStartMs = currentMs - WINDOW_MILLISECONDS;
		const timeList = (requestTimeListByAddress.get(clientAddress) || []).filter((requestMs) => requestMs > windowStartMs);
		if (timeList.length >= requestsPerMinute) {
			requestTimeListByAddress.set(clientAddress, timeList);
			return { isAdmitted: false, retryAfterSeconds: Math.max(1, Math.ceil((timeList[0] + WINDOW_MILLISECONDS - currentMs) / 1000)) };
		}
		const burstStartMs = currentMs - BURST_WINDOW_MILLISECONDS;
		if (timeList.filter((requestMs) => requestMs > burstStartMs).length >= burstPerSecond) {
			requestTimeListByAddress.set(clientAddress, timeList);
			return { isAdmitted: false, retryAfterSeconds: 1 };
		}
		requestTimeListByAddress.set(clientAddress, [...timeList, currentMs]);
		return { isAdmitted: true };
	};

	return { admit, trackedAddressCount: () => requestTimeListByAddress.size };
};

module.exports = { createRequestLimiter };
