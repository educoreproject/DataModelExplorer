#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]

// ============================================================================
// oauth-throttle.js — login brute-force throttle + lockout for the EDUcore AS
// (dmeMcpOAuth Phase 2.5). Tracks failed login attempts on TWO independent
// axes — per-account (username) and per-IP — and locks a key out once its
// failures within a sliding window cross the threshold. A successful login
// clears the account counter.
//
// In-process state (a Map). For the single educore instance this is correct and
// has zero external dependency; if the AS is ever horizontally scaled, this
// becomes per-node and should move to a shared store — noted, not silently
// assumed away.
//
// Contract: module.exports({ maxFailures, windowMs, lockoutMs })
//   -> { check, recordFailure, recordSuccess, _prune }
//   check({ username, ip })         -> { allowed, reason, retryAfterMs }
//   recordFailure({ username, ip }) -> void   (call on a bad credential)
//   recordSuccess({ username })     -> void   (call on a good credential)
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction = ({
	maxFailures = 5, // failures within the window before lockout
	windowMs = 15 * 60 * 1000, // 15 min sliding window
	lockoutMs = 15 * 60 * 1000, // 15 min lockout once tripped
} = {}) => {
	// key -> { failures: [timestamps], lockedUntil: epochMs }
	const state = new Map();

	const entryFor = (key) => {
		let entry = state.get(key);
		if (!entry) {
			entry = { failures: [], lockedUntil: 0 };
			state.set(key, entry);
		}
		return entry;
	};

	// Drop timestamps older than the window; forget fully-idle keys.
	const pruneEntry = (key, now) => {
		const entry = state.get(key);
		if (!entry) {
			return;
		}
		entry.failures = entry.failures.filter((t) => now - t < windowMs);
		if (entry.failures.length === 0 && entry.lockedUntil <= now) {
			state.delete(key);
		}
	};

	const _prune = (now = Date.now()) => {
		Array.from(state.keys()).forEach((key) => pruneEntry(key, now));
	};

	const keyIsLocked = (key, now) => {
		const entry = state.get(key);
		if (!entry) {
			return 0;
		}
		if (entry.lockedUntil > now) {
			return entry.lockedUntil - now;
		}
		return 0;
	};

	// check returns allowed=false if EITHER axis is locked.
	const check = ({ username, ip } = {}) => {
		const now = Date.now();
		const accountKey = username ? `account:${String(username).toLowerCase()}` : null;
		const ipKey = ip ? `ip:${ip}` : null;

		const accountRemaining = accountKey ? keyIsLocked(accountKey, now) : 0;
		if (accountRemaining > 0) {
			return { allowed: false, reason: 'account temporarily locked', retryAfterMs: accountRemaining };
		}
		const ipRemaining = ipKey ? keyIsLocked(ipKey, now) : 0;
		if (ipRemaining > 0) {
			return { allowed: false, reason: 'too many attempts from this address', retryAfterMs: ipRemaining };
		}
		return { allowed: true, reason: '', retryAfterMs: 0 };
	};

	const bump = (key, now) => {
		const entry = entryFor(key);
		entry.failures = entry.failures.filter((t) => now - t < windowMs);
		entry.failures.push(now);
		if (entry.failures.length >= maxFailures) {
			entry.lockedUntil = now + lockoutMs;
		}
	};

	const recordFailure = ({ username, ip } = {}) => {
		const now = Date.now();
		if (username) {
			bump(`account:${String(username).toLowerCase()}`, now);
		}
		if (ip) {
			bump(`ip:${ip}`, now);
		}
	};

	// A good credential clears the account axis (the legitimate owner is back).
	// The per-IP axis is intentionally NOT cleared — a shared/NAT IP grinding
	// many accounts still accrues toward its own lockout.
	const recordSuccess = ({ username } = {}) => {
		if (username) {
			state.delete(`account:${String(username).toLowerCase()}`);
		}
	};

	return { check, recordFailure, recordSuccess, _prune };
};

module.exports = moduleFunction;
