'use strict';
// @concept: [[Neo4jAbstraction]]
// @concept: [[DataModelExplorer]]

// golden-graph-handle.js — the DME's golden graph as one stable object that exists from startup and connects when it can.
// A handle passed by value to every access point, which is why it must be an object that changes state and not a value
// computed once: until 2026-11-02 data-model.js connected once at startup and handed out null on any failure, so a graph
// or a Docker that was two seconds late left the API answering 200 with no graph until someone restarted it.
//
//   createGoldenGraphHandle({ goldenContainerName, queryTimeoutMs, retryDelayMsList, resolveConnectionFresh, neo4jGen }) -> handle
//     resolveConnectionFresh(containerName, callback('', { boltUri, user, password, error, errorName }))
//     neo4jGen                the neo4j-instance factory's result; initDatabaseInstance opens each connection
//
//   handle.runQuery(cypher, params, callback(errText, rowList))
//       connected: the real read seam. Waiting: refused by name, GOLDEN_GRAPH_NOT_READY_REFUSAL_NAME, naming the container.
//   handle.runTransaction(userFn, callback(errText))   always refused by name: the golden has no write path (W-E-10)
//   handle.graphStateOf() -> { graphState: 'connected' | 'waiting', goldenContainerName }
//   handle.whenFirstConnected(listener)                listener() once, at the first connection this process makes
//   handle.whenEveryConnected(listener)                listener() at each connection, the first and every reconnect: a new golden can come
//                                                      back under the same container name, so what was read from the last one may not hold
//   handle.withReadSession(consumer(session, sessionDone), callback(errText, result))
//       the seam for code written against the driver's session.run: one READ session with the connection's timeout, closed here.
//       Waiting: refused by name, as runQuery is. A consumer's fault is judged by the same ping as a query's.
//   handle.close()                                     stops retrying and closes the driver
//
// Every connection is opened readOnly with queryTimeoutMs and never writeCapable. The handle adds no route around that
// seam: it holds a neo4j-instance connection and delegates to it.
//
// LOSING A CONNECTION: a query that fails while connected is followed by a ping over the same driver. The ping decides,
// so no driver error text is ever parsed: ping answers, the fault was the query's own and is passed on untouched; ping
// fails, the handle goes back to waiting, closes that driver and resolves afresh (the container may have come back on
// another port or with another password). The driver would reconnect by itself to an unchanged port, but health would
// then say connected throughout an outage.
//
// LOGGING: one line at the first failure, one at connection, one on any later loss. An instance pointed at a port with no
// container retries forever, so an attempt is never worth a line by itself.
//
// A configuration fault is not this module's business: data-model.js refuses it before a handle is made, and neo4jDb is
// null. Nothing here waits out a fault that waiting cannot cure.

const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();

const GOLDEN_GRAPH_NOT_READY_REFUSAL_NAME = 'goldenGraphNotReady';
// the delay before each retry; the last one repeats for as long as the graph stays away
const GOLDEN_RETRY_DELAY_MS_LIST = Object.freeze([5000, 10000, 20000, 40000, 60000]);
const DRIVER_FAULT_NAME = 'graphNotAnswering';
const CONNECTION_LOST_FAULT_NAME = 'connectionLost';
const NOT_YET_ATTEMPTED_FAULT_NAME = 'notYetConnected';

const createGoldenGraphHandle = ({ goldenContainerName, queryTimeoutMs, retryDelayMsList, resolveConnectionFresh, neo4jGen }) => {
	if (typeof goldenContainerName !== 'string' || goldenContainerName === '') {
		throw new Error('golden-graph-handle: goldenContainerName is REQUIRED');
	}
	if (!(queryTimeoutMs > 0)) {
		throw new Error(`golden-graph-handle: queryTimeoutMs must be a positive number of milliseconds; got ${queryTimeoutMs}`);
	}
	if (!Array.isArray(retryDelayMsList) || retryDelayMsList.length === 0 || !retryDelayMsList.every((delayMs) => delayMs > 0)) {
		throw new Error('golden-graph-handle: retryDelayMsList must be a list of positive delays');
	}
	if (typeof resolveConnectionFresh !== 'function' || !neo4jGen || typeof neo4jGen.initDatabaseInstance !== 'function') {
		throw new Error('golden-graph-handle: resolveConnectionFresh and neo4jGen are REQUIRED');
	}
	const { xLog } = process.global;

	let activeConnection = null;
	let lastFaultName = NOT_YET_ATTEMPTED_FAULT_NAME;
	let isWaitingAnnounced = false;
	let failedAttemptCount = 0;
	let retryTimer = null;
	let isAttemptRunning = false;
	let isClosed = false;
	let hasEverConnected = false;
	const firstConnectionListenerList = [];
	const everyConnectionListenerList = [];
	let connectionUnderPing = null;
	let pingWaiterList = [];

	const notReadyRefusalText = () => `${GOLDEN_GRAPH_NOT_READY_REFUSAL_NAME}: the golden graph '${goldenContainerName}' is not connected (${lastFaultName}); this server keeps trying and needs no restart`;

	// ================================================================================
	// CONNECTING

	const scheduleAttempt = (delayMs) => {
		if (isClosed || retryTimer || isAttemptRunning) {
			return;
		}
		retryTimer = setTimeout(() => {
			retryTimer = null;
			runConnectionAttempt();
		}, delayMs);
		retryTimer.unref();
	};

	const noteFailedAttempt = (faultName, faultText) => {
		lastFaultName = faultName;
		if (!isWaitingAnnounced) {
			isWaitingAnnounced = true;
			xLog.error(`golden-graph: '${goldenContainerName}' is not connected (${faultName}: ${faultText}); retrying in the background, no further lines until that changes`);
		}
		const delayMs = retryDelayMsList[Math.min(failedAttemptCount, retryDelayMsList.length - 1)];
		failedAttemptCount += 1;
		scheduleAttempt(delayMs);
	};

	const becomeConnected = (openedConnection, boltUri) => {
		if (isClosed) {
			openedConnection.close();
			return;
		}
		activeConnection = openedConnection;
		failedAttemptCount = 0;
		isWaitingAnnounced = false;
		lastFaultName = NOT_YET_ATTEMPTED_FAULT_NAME;
		xLog.status(`golden-graph: connected to '${goldenContainerName}' at ${boltUri}`);
		if (!hasEverConnected) {
			hasEverConnected = true;
			// each on its own tick: this code runs inside the driver's promise, which would swallow a listener's throw
			firstConnectionListenerList.splice(0).forEach((listener) => setImmediate(listener));
		}
		everyConnectionListenerList.forEach((listener) => setImmediate(listener));
	};

	const runConnectionAttempt = () => {
		isAttemptRunning = true;
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			resolveConnectionFresh(goldenContainerName, (unusedError, connection) => {
				if (connection.error) {
					next(connection.error, { ...args, faultName: connection.errorName });
					return;
				}
				next('', { ...args, connection });
			});
		});

		taskList.push((args, next) => {
			const { connection } = args;
			neo4jGen.initDatabaseInstance(
				{ neo4jBoltUri: connection.boltUri, neo4jUser: connection.user, neo4jPassword: connection.password, readOnly: true, queryTimeoutMs, isVerificationQuiet: true },
				(openError, openedConnection) => {
					if (openError) {
						next(openError, { ...args, faultName: DRIVER_FAULT_NAME });
						return;
					}
					next('', { ...args, openedConnection });
				},
			);
		});

		pipeRunner(taskList.getList(), {}, (faultText, args) => {
			isAttemptRunning = false;
			if (faultText) {
				noteFailedAttempt(args.faultName, faultText);
				return;
			}
			becomeConnected(args.openedConnection, args.connection.boltUri);
		});
	};

	// ================================================================================
	// LOSING THE CONNECTION

	const loseConnection = (lostConnection, pingError) => {
		activeConnection = null;
		lastFaultName = CONNECTION_LOST_FAULT_NAME;
		isWaitingAnnounced = true;
		failedAttemptCount = 0;
		xLog.error(`golden-graph: lost the connection to '${goldenContainerName}' (${pingError}); retrying in the background, no further lines until that changes`);
		lostConnection.close();
		scheduleAttempt(0);
	};

	// is this connection still the handle's, and alive? done(isLost). Queries failing together share one ping.
	const judgeConnectionAfterFault = (connectionUsed, done) => {
		if (connectionUsed !== activeConnection) {
			done(true);
			return;
		}
		pingWaiterList.push(done);
		if (connectionUnderPing === connectionUsed) {
			return;
		}
		connectionUnderPing = connectionUsed;
		connectionUsed.verifyConnection((pingError) => {
			const waiterList = pingWaiterList;
			pingWaiterList = [];
			connectionUnderPing = null;
			if (pingError && connectionUsed === activeConnection) {
				loseConnection(connectionUsed, pingError);
			}
			waiterList.forEach((waiter) => waiter(!!pingError));
		});
	};

	// ================================================================================
	// THE SEAM

	const runQuery = (cypher, paramsOrCallback, maybeCallback) => {
		const queryParams = typeof paramsOrCallback === 'function' ? {} : paramsOrCallback;
		const callback = typeof paramsOrCallback === 'function' ? paramsOrCallback : maybeCallback;
		const connectionUsed = activeConnection;
		if (!connectionUsed) {
			setImmediate(() => callback(notReadyRefusalText(), []));
			return;
		}
		connectionUsed.runQuery(cypher, queryParams, (queryError, rowList) => {
			if (!queryError) {
				callback('', rowList);
				return;
			}
			judgeConnectionAfterFault(connectionUsed, (isLost) => callback(isLost ? notReadyRefusalText() : queryError, rowList));
		});
	};

	const graphStateOf = () => ({ graphState: activeConnection ? 'connected' : 'waiting', goldenContainerName });

	const whenFirstConnected = (listener) => {
		if (hasEverConnected) {
			setImmediate(listener);
			return;
		}
		firstConnectionListenerList.push(listener);
	};

	const whenEveryConnected = (listener) => {
		everyConnectionListenerList.push(listener);
		if (activeConnection) {
			setImmediate(listener);
		}
	};

	const withReadSession = (sessionConsumer, callback) => {
		const connectionUsed = activeConnection;
		if (!connectionUsed) {
			setImmediate(() => callback(notReadyRefusalText()));
			return;
		}
		const readSession = connectionUsed.openReadSession();
		sessionConsumer(readSession, (consumerError, consumerResult) => {
			const finish = () => {
				if (!consumerError) {
					callback('', consumerResult);
					return;
				}
				judgeConnectionAfterFault(connectionUsed, () => callback(consumerError));
			};
			readSession.close().then(finish, finish);
		});
	};

	const close = () => {
		isClosed = true;
		if (retryTimer) {
			clearTimeout(retryTimer);
			retryTimer = null;
		}
		if (activeConnection) {
			activeConnection.close();
			activeConnection = null;
		}
	};

	scheduleAttempt(0);

	return { runQuery, runTransaction: neo4jGen.refusedRunTransaction, graphStateOf, whenFirstConnected, whenEveryConnected, withReadSession, close };
};

module.exports = { createGoldenGraphHandle, GOLDEN_GRAPH_NOT_READY_REFUSAL_NAME, GOLDEN_RETRY_DELAY_MS_LIST };
