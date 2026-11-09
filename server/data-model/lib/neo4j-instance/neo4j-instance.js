#!/usr/bin/env node
'use strict';
// @concept: [[Neo4jAbstraction]]
// @concept: [[DataModelExplorer]]

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const qt = require('qtools-functional-library');
const neo4j = require('neo4j-driver');

const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

// the runTransaction of every connection not opened writeCapable: refuses BEFORE the caller's function runs (W-E-10)
const refusedRunTransaction = (userFn, callback) => {
	callback('runTransaction: this connection was opened read-only; pass writeCapable:true by name');
};

// START OF moduleFunction() ============================================================

const moduleFunction = function ({ unused }) {
	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;

	// ================================================================================
	// QUERY EXECUTION
	//
	// runQuery hardening is PER-CONNECTION, opted into via initDatabaseInstance
	// config: readOnly opens sessions with defaultAccessMode READ (Neo4j itself
	// refuses writes even if a write keyword slips past a validator upstream);
	// queryTimeoutMs puts a wall-clock timeout on each auto-commit transaction so
	// a runaway query dies at the server. The golden DME connection sets both
	// (golden-graph-handle.js); the multi-tenant user-graph clones write through runQuery
	// (identity marker MERGE, embedding SET, write-executor) and stay unhardened.
	// runTransaction (below) is the explicit WRITE path, and a connection has it ONLY
	// when it was opened with writeCapable: true BY NAME (W-E-10, X2, 2026-10-06).

	const runQueryActual =
		(driver, { readOnly, queryTimeoutMs, isFaultLogSuppressed } = {}) =>
		(cypher, params, callback) => {
			if (typeof params === 'function') {
				callback = params;
				params = {};
			}

			const session = readOnly
				? driver.session({ defaultAccessMode: neo4j.session.READ })
				: driver.session();

			const transactionConfig = queryTimeoutMs
				? { timeout: queryTimeoutMs }
				: {};

			session
				.run(cypher, params || {}, transactionConfig)
				.then((result) => {
					session.close();
					const records = result.records.map((record) => {
						const obj = {};
						record.keys.forEach((key) => {
							const val = record.get(key);
							obj[key] = neo4jValueToJs(val);
						});
						return obj;
					});
					callback('', records);
				})
				.catch((err) => {
					session.close();
					if (!isFaultLogSuppressed) {
						xLog.error(
							`${''.padEnd(50, '-')}\nNeo4j Error: ${err.toString()}\nBad Cypher:\n\t${cypher}\n${''.padEnd(50, '-')}\n`,
						);
					}
					callback(err.toString(), []);
				});
		};

	// ================================================================================
	// NEO4J VALUE CONVERSION

	const neo4jValueToJs = (val) => {
		if (val === null || val === undefined) {
			return val;
		}

		if (neo4j.isInt(val)) {
			return val.toNumber();
		}

		if (typeof val === 'object' && val.constructor && val.constructor.name === 'Node') {
			const nodeObj = { ...val.properties };
			Object.keys(nodeObj).forEach((key) => {
				nodeObj[key] = neo4jValueToJs(nodeObj[key]);
			});
			nodeObj._labels = val.labels;
			nodeObj._id = neo4j.isInt(val.identity) ? val.identity.toNumber() : val.identity;
			return nodeObj;
		}

		if (typeof val === 'object' && val.constructor && val.constructor.name === 'Relationship') {
			const relObj = { ...val.properties };
			Object.keys(relObj).forEach((key) => {
				relObj[key] = neo4jValueToJs(relObj[key]);
			});
			relObj._type = val.type;
			return relObj;
		}

		if (Array.isArray(val)) {
			return val.map(neo4jValueToJs);
		}

		if (typeof val === 'object' && val !== null) {
			const obj = {};
			Object.keys(val).forEach((key) => {
				obj[key] = neo4jValueToJs(val[key]);
			});
			return obj;
		}

		return val;
	};

	// ================================================================================
	// TRANSACTIONAL WRITES
	//
	// runTransaction(userFn, callback):
	//   userFn is called with (tx, done) where
	//     tx.run(cypher, params, cb)  — a callback-style wrapper around the driver's
	//                                    tx.run that participates in the same transaction.
	//                                    Records go through neo4jValueToJs just like runQuery.
	//     done(err, result)           — call with a truthy err to roll back, or '' + result
	//                                    to commit. Exactly one invocation expected.
	//   callback(err, result)          — fires after commit or rollback completes.
	//
	// This sits alongside runQuery; existing callers of runQuery are unaffected.
	// Used by the Use Case Editor save path for atomic root+children updates.
	//
	// W-E-10 (X2, campaign P0, 2026-10-06): runTransaction exists only on a connection opened with
	// writeCapable: true. Any other connection gets a runTransaction that refuses by name BEFORE the
	// caller's function runs. The golden DME handle (golden-graph-handle.js) never asks, so golden has no write
	// path; until 2026-10-06 its runTransaction opened a default (WRITE) session beside the READ seam,
	// and on a scratch graph a golden-shaped handle committed a CREATE through it (measured).

	const runTransactionActual = (driver) => (userFn, callback) => {
		const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
		let tx;
		try {
			tx = session.beginTransaction();
		} catch (err) {
			session.close();
			callback(`runTransaction: beginTransaction failed: ${err.toString()}`);
			return;
		}

		const txRun = (cypher, params, cb) => {
			if (typeof params === 'function') {
				cb = params;
				params = {};
			}
			tx.run(cypher, params || {})
				.then((result) => {
					const records = result.records.map((record) => {
						const obj = {};
						record.keys.forEach((key) => {
							obj[key] = neo4jValueToJs(record.get(key));
						});
						return obj;
					});
					cb('', records);
				})
				.catch((err) => {
					xLog.error(
						`${''.padEnd(50, '-')}\nNeo4j tx.run Error: ${err.toString()}\nBad Cypher:\n\t${cypher}\n${''.padEnd(50, '-')}\n`,
					);
					cb(err.toString(), []);
				});
		};

		let finished = false;
		const done = (err, result) => {
			if (finished) { return; }
			finished = true;

			if (err) {
				tx.rollback()
					.catch((rbErr) => {
						xLog.error(`runTransaction: rollback failed: ${rbErr.toString()}`);
					})
					.finally(() => {
						session.close();
						callback(err, result);
					});
				return;
			}

			tx.commit()
				.then(() => {
					session.close();
					callback('', result);
				})
				.catch((commitErr) => {
					xLog.error(`runTransaction: commit failed: ${commitErr.toString()}`);
					session.close();
					callback(`runTransaction: commit failed: ${commitErr.toString()}`, result);
				});
		};

		try {
			userFn({ run: txRun }, done);
		} catch (userErr) {
			done(`runTransaction: user function threw: ${userErr.toString()}`);
		}
	};

	// ================================================================================
	// CLOSE CONNECTION

	const closeActual = (driver) => () => {
		driver.close().catch((closeError) => {
			xLog.error(`neo4j-instance: driver close failed: ${closeError.toString()}`);
		});
	};

	// ================================================================================
	// INITIALIZE DATABASE INSTANCE

	const initDatabaseInstance = (config, callback) => {
		const { neo4jBoltUri, neo4jUser, neo4jPassword, readOnly, queryTimeoutMs, writeCapable, isVerificationQuiet } =
			config;

		if (!neo4jBoltUri || !neo4jUser || !neo4jPassword) {
			callback('neo4j-instance: missing required config (neo4jBoltUri, neo4jUser, neo4jPassword)');
			return;
		}

		const driver = neo4j.driver(
			neo4jBoltUri,
			neo4j.auth.basic(neo4jUser, neo4jPassword),
			{ encrypted: false },
		);

		const seamOptions = {
			readOnly: !!readOnly,
			queryTimeoutMs: parseInt(queryTimeoutMs, 10) || undefined,
		};
		const runQuery = runQueryActual(driver, seamOptions);
		// A READ session for code written against the driver's session.run (the DME verbs, standardsQueryService P1). Only a readOnly connection
		// has one, and queryTimeoutMs is its wall: a caller's shorter timeout stands, a longer one or none takes the connection's.
		const openReadSession = () => {
			const driverSession = driver.session({ defaultAccessMode: neo4j.session.READ });
			const timeoutFor = (transactionConfig) => Math.min(transactionConfig && transactionConfig.timeout ? transactionConfig.timeout : Infinity, seamOptions.queryTimeoutMs || Infinity);
			return {
				run: (cypher, params, transactionConfig) => {
					const timeoutMs = timeoutFor(transactionConfig);
					return driverSession.run(cypher, params || {}, timeoutMs === Infinity ? {} : { timeout: timeoutMs });
				},
				close: () => driverSession.close(),
			};
		};
		const runTransaction = writeCapable === true ? runTransactionActual(driver) : refusedRunTransaction;
		const close = closeActual(driver);

		// a ping over the same seam that says nothing in the log: a caller that retries decides for itself what is worth a line
		const runQuietly = runQueryActual(driver, { ...seamOptions, isFaultLogSuppressed: true });
		const verifyConnection = (verifyCallback) => runQuietly('RETURN 1 AS ping', {}, (pingError) => verifyCallback(pingError || ''));

		const localCallback = (err) => {
			if (err) {
				// a driver that never answered is closed here: a caller retrying for days must not leave one behind per attempt
				close();
				if (!isVerificationQuiet) {
					xLog.error(`neo4j-instance: connection verification failed: ${err}`);
				}
				callback(err);
				return;
			}
			if (!isVerificationQuiet) {
				xLog.status(`neo4j-instance: connected to ${neo4jBoltUri}`);
			}
			callback('', { runQuery, runTransaction, close, verifyConnection, ...(seamOptions.readOnly ? { openReadSession } : {}) });
		};

		(isVerificationQuiet ? runQuietly : runQuery)('RETURN 1 AS ping', {}, (err, records) => {
			if (err) {
				localCallback(`Connection test failed: ${err}`);
				return;
			}
			localCallback('');
		});
	};

	return { initDatabaseInstance, refusedRunTransaction };
};

// END OF moduleFunction() ============================================================

module.exports = moduleFunction;
