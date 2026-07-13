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
	// (data-model.js); the multi-tenant user-graph clones write through runQuery
	// (identity marker MERGE, embedding SET, write-executor) and stay unhardened.
	// runTransaction (below) is the explicit WRITE path — the Use Case Editor
	// save depends on it — and is deliberately NOT touched by this hardening.

	const runQueryActual =
		(driver, { readOnly, queryTimeoutMs } = {}) =>
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
					xLog.error(
						`${''.padEnd(50, '-')}\nNeo4j Error: ${err.toString()}\nBad Cypher:\n\t${cypher}\n${''.padEnd(50, '-')}\n`,
					);
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

	const runTransactionActual = (driver) => (userFn, callback) => {
		const session = driver.session();
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
		driver.close();
	};

	// ================================================================================
	// INITIALIZE DATABASE INSTANCE

	const initDatabaseInstance = (config, callback) => {
		const { neo4jBoltUri, neo4jUser, neo4jPassword, readOnly, queryTimeoutMs } =
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

		const runQuery = runQueryActual(driver, {
			readOnly: !!readOnly,
			queryTimeoutMs: parseInt(queryTimeoutMs, 10) || undefined,
		});
		const runTransaction = runTransactionActual(driver);
		const close = closeActual(driver);

		const localCallback = (err) => {
			if (err) {
				xLog.error(`neo4j-instance: connection verification failed: ${err}`);
				callback(err);
				return;
			}
			xLog.status(`neo4j-instance: connected to ${neo4jBoltUri}`);
			callback('', { runQuery, runTransaction, close });
		};

		runQuery('RETURN 1 AS ping', {}, (err, records) => {
			if (err) {
				localCallback(`Connection test failed: ${err}`);
				return;
			}
			localCallback('');
		});
	};

	return { initDatabaseInstance };
};

// END OF moduleFunction() ============================================================

module.exports = moduleFunction;
