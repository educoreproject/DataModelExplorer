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
	// CONNECTION OPTIONS
	//
	// The bolt URI decides encryption, so the driver options have to follow the URI.
	//
	// Self-hosted Neo4j (the docker containers on the droplet: bolt://, neo4j://) serves
	// the bolt connector without TLS, and some driver versions try an encrypted handshake
	// by default, so those URIs must be given { encrypted: false } explicitly.
	//
	// Hosted Neo4j (Aura and friends) uses a +s / +ssc scheme that states encryption in
	// the URI itself. Passing `encrypted` alongside such a URI makes the driver THROW
	// "Encryption/trust can only be configured either through URL or config, not both"
	// before any connection is attempted.
	//
	// So: send { encrypted: false } only for the schemes that do not state it themselves.

	const uriStatesEncryption = (neo4jBoltUri) =>
		/^[a-z0-9]+\+s(sc)?:\/\//i.test((neo4jBoltUri || '').trim());

	const driverOptionsForUri = (neo4jBoltUri) =>
		uriStatesEncryption(neo4jBoltUri) ? {} : { encrypted: false };

	// sessionOptions — hosted Neo4j serves several databases from one URI; `neo4jDatabase`
	// picks one (Aura's is 'neo4j'). Omitted, the server keeps using the connection's
	// default database, which is what every self-hosted container does today.

	const sessionOptions = (neo4jDatabase) =>
		neo4jDatabase ? { database: neo4jDatabase } : {};

	// ================================================================================
	// QUERY EXECUTION

	const runQueryActual = (openSession) => (cypher, params, callback) => {
		if (typeof params === 'function') {
			callback = params;
			params = {};
		}

		const session = openSession();

		session
			.run(cypher, params || {})
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

	const runTransactionActual = (openSession) => (userFn, callback) => {
		const session = openSession();
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
		const { neo4jBoltUri, neo4jUser, neo4jPassword, neo4jDatabase } = config;

		if (!neo4jBoltUri || !neo4jUser || !neo4jPassword) {
			callback('neo4j-instance: missing required config (neo4jBoltUri, neo4jUser, neo4jPassword)');
			return;
		}

		// neo4j.driver() validates the URI synchronously and THROWS on a bad one (an
		// unknown scheme, or a +s URI combined with an `encrypted` option). Catch it here
		// so a misconfigured host reports through the callback like every other failure
		// instead of taking down the caller's pipeline.
		let driver;
		try {
			driver = neo4j.driver(
				neo4jBoltUri,
				neo4j.auth.basic(neo4jUser, neo4jPassword),
				driverOptionsForUri(neo4jBoltUri),
			);
		} catch (err) {
			const message = `neo4j-instance: cannot open driver for ${neo4jBoltUri}: ${err.toString()}`;
			xLog.error(message);
			callback(message);
			return;
		}

		const openSession = () => driver.session(sessionOptions(neo4jDatabase));

		const runQuery = runQueryActual(openSession);
		const runTransaction = runTransactionActual(openSession);
		const close = closeActual(driver);

		const localCallback = (err) => {
			if (err) {
				xLog.error(`neo4j-instance: connection verification failed: ${err}`);
				driver.close();
				callback(err);
				return;
			}
			xLog.status(
				`neo4j-instance: connected to ${neo4jBoltUri}${neo4jDatabase ? ` (database ${neo4jDatabase})` : ''}`,
			);
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
