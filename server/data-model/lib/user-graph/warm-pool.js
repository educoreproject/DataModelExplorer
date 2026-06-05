'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[WarmPool]]
//
// warm-pool.js — the warm-pool fast path (design doc 08). A FIFO queue of pre-booted,
// generic clones (copies of the current snapshot, already started, no marker). On Open,
// getUserGraph CLAIMS the oldest warm clone — skipping the cold cp + boot — then injects
// the marker + replays + records live; the queue refills asynchronously toward depth N.
// The pool hides the BOOT, not the copy: locally each warm clone is still a plain copy.
//
// COUNT-TOLERANT (errata #4 / ONYX): treat the pool as a FIFO stack — drain oldest-first,
// refill toward N, TOLERATE transient overshoot, never depend on the exact count. On a
// spike (empty pool) the caller falls back to a cold clone, never an error or a hang.

const cloneManager = require('./clone-manager');

const pool = []; // FIFO: oldest at index 0
let inflightRefills = 0;
let targetDepth = 0;
let warmCounter = 0;

const poolDepth = () => pool.length;
const setTargetDepth = (n) => { targetDepth = Math.max(0, n | 0); };

const nextWarmVersionId = () => {
	warmCounter += 1;
	return `${process.pid}x${warmCounter}x${process.hrtime.bigint().toString()}`;
};

// Provision one generic warm clone (a real booted clone of the current source).
const provisionWarmClone = (callback) => {
	cloneManager.provisionClone(
		{ userRefId: '_warm', versionRefId: nextWarmVersionId() },
		(err, descriptor) => {
			if (err) { callback(err); return; }
			callback('', descriptor);
		},
	);
};

// Refill asynchronously toward targetDepth. Count-tolerant: a transient overshoot
// (concurrent refills completing) is fine — we never assert the exact count.
const refillAsync = () => {
	while (pool.length + inflightRefills < targetDepth) {
		inflightRefills += 1;
		provisionWarmClone((err, descriptor) => {
			inflightRefills -= 1;
			if (err) {
				const { xLog } = process.global;
				if (xLog) xLog.error(`[warm-pool] refill failed: ${err}`);
				return;
			}
			pool.push(descriptor); // may transiently push beyond N — tolerated
		});
	}
};

// primePool(depth, callback) — set the target depth and fill synchronously to it.
const primePool = (depth, callback) => {
	setTargetDepth(depth);
	const cb = typeof callback === 'function' ? callback : () => {};
	const fillOne = () => {
		if (pool.length >= targetDepth) { cb('', { depth: pool.length }); return; }
		provisionWarmClone((err, descriptor) => {
			if (err) { cb(err); return; }
			pool.push(descriptor);
			fillOne();
		});
	};
	fillOne();
};

// claimWarm() — synchronously hand back the OLDEST warm clone (or null on a spike).
// Triggers an async refill toward N. The claimed clone becomes the caller's to own.
const claimWarm = () => {
	const descriptor = pool.length ? pool.shift() : null;
	if (targetDepth > 0) {
		setImmediate(refillAsync);
	}
	return descriptor;
};

// drainPool(callback) — tear down every warm clone (test/shutdown cleanup). Does not
// touch claimed clones (they are owned by their sessions now).
const drainPool = (callback) => {
	const cb = typeof callback === 'function' ? callback : () => {};
	setTargetDepth(0);
	const items = pool.splice(0, pool.length);
	let i = 0;
	const tearNext = () => {
		if (i >= items.length) { cb('', { drained: items.length }); return; }
		const d = items[i++];
		cloneManager.teardownClone({ containerName: d.containerName, cloneDir: d.cloneDir }, () => tearNext());
	};
	tearNext();
};

module.exports = {
	primePool,
	claimWarm,
	refillAsync,
	poolDepth,
	setTargetDepth,
	drainPool,
	provisionWarmClone,
};
