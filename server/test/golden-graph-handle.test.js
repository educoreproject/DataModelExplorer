#!/usr/bin/env node
'use strict';

// golden-graph-handle.test.js — the golden handle over a scripted docker and a scripted driver: no docker, no graph, and
// retry delays of a few milliseconds. The real process against a real container is the gate driver in
// zNotesPlansDocs/graphStartupRetry-110226/runs/gateDriver.sh; this one pins what is awkward to stage there.
//
//   node server/test/golden-graph-handle.test.js

const logLineList = [];
process.global = {
	xLog: {
		status: (lineText) => logLineList.push(`status ${lineText}`),
		error: (lineText) => logLineList.push(`error ${lineText}`),
		verbose: () => {},
	},
	getConfig: () => ({}),
};

const fs = require('fs');
const path = require('path');
const { createGoldenGraphHandle, GOLDEN_GRAPH_NOT_READY_REFUSAL_NAME } = require('../data-model/lib/neo4j-instance/golden-graph-handle');
const realNeo4jGen = require('../data-model/lib/neo4j-instance/neo4j-instance')({ unused: true });
const makeSchemaProvider = require('../lib/schema-provider');
const { makeRequiredLabelProbe } = require('../data-model/lib/required-label-probe');

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const CONTAINER_NAME = 'DEV_scriptedGolden';
const SCRIPTED_PASSWORD_TEXT = 'scriptedSecretText';
const GOOD_CONNECTION = { boltUri: 'bolt://localhost:1', user: 'neo4j', password: SCRIPTED_PASSWORD_TEXT, error: null, errorName: null };
const dockerDown = { error: 'docker is not up', errorName: 'dockerInspectFailed' };

// the world the handle sees: world.dockerAnswer, world.isGraphUp; every open and every query is counted
const makeWorld = () => {
	const world = { dockerAnswer: dockerDown, isGraphUp: false, resolveCount: 0, openConfigList: [], closedCount: 0, liveConnectionList: [], queryAnswer: () => ({ errorText: '', rowList: [{ ping: 1 }] }) };
	world.resolveConnectionFresh = (containerName, callback) => {
		world.resolveCount += 1;
		setImmediate(() => callback('', world.dockerAnswer));
	};
	world.neo4jGen = {
		refusedRunTransaction: realNeo4jGen.refusedRunTransaction,
		initDatabaseInstance: (config, callback) => {
			world.openConfigList.push(config);
			setImmediate(() => {
				if (!world.isGraphUp) {
					callback('Connection test failed: refused');
					return;
				}
				const connection = {
					runQuery: (cypher, params, queryCallback) => setImmediate(() => {
						if (!world.isGraphUp) { queryCallback('Neo4jError: connection closed', []); return; }
						const { errorText, rowList } = world.queryAnswer(cypher, params);
						queryCallback(errorText, rowList);
					}),
					verifyConnection: (pingCallback) => setImmediate(() => pingCallback(world.isGraphUp ? '' : 'Neo4jError: refused')),
					close: () => { world.closedCount += 1; },
					openReadSession: () => {
						world.openedSessionCount = (world.openedSessionCount || 0) + 1;
						return { run: () => Promise.resolve({ records: [] }), close: () => { world.closedSessionCount = (world.closedSessionCount || 0) + 1; return Promise.resolve(); } };
					},
				};
				world.liveConnectionList.push(connection);
				callback('', connection);
			});
		},
	};
	return world;
};

const handleOver = (world, retryDelayMsList = [2, 4, 8]) => createGoldenGraphHandle({ goldenContainerName: CONTAINER_NAME, queryTimeoutMs: 1234, retryDelayMsList, resolveConnectionFresh: world.resolveConnectionFresh, neo4jGen: world.neo4jGen });

// waits on a ref'd timer (the handle's own are unref'd): check() true, or give up after a second
const waitUntil = (check, callback) => {
	const startedAt = Date.now();
	const tick = () => {
		if (check() || Date.now() - startedAt > 1000) { callback(); return; }
		setTimeout(tick, 2);
	};
	tick();
};

const steps = [];

steps.push((next) => {
	console.log('\n--- waiting, then connected ---');
	const world = makeWorld();
	logLineList.length = 0;
	const handle = handleOver(world);
	ok('a handle exists before anything has been resolved (startup does not wait)', world.resolveCount === 0 && handle.graphStateOf().graphState === 'waiting');
	handle.runQuery('RETURN 1', {}, (queryError, rowList) => {
		ok('runQuery refuses by name while waiting', queryError.startsWith(`${GOLDEN_GRAPH_NOT_READY_REFUSAL_NAME}:`) && queryError.includes(CONTAINER_NAME), queryError);
		ok('the refusal has the row-list shape consumers read', Array.isArray(rowList) && rowList.length === 0);
		ok('the refusal carries no credential', !queryError.includes(GOOD_CONNECTION.password));
		waitUntil(() => world.resolveCount >= 5, () => {
			ok('it keeps retrying the resolution while docker is down', world.resolveCount >= 5, `resolveCount=${world.resolveCount}`);
			const faultLineList = logLineList.filter((lineText) => lineText.startsWith('error '));
			ok('five failures, one log line', faultLineList.length === 1 && faultLineList[0].includes('dockerInspectFailed'), JSON.stringify(logLineList));
			handle.runQuery('RETURN 1', (shortFormError) => {
				ok('the refusal names what it is waiting on', shortFormError.includes('dockerInspectFailed'), shortFormError);
				world.dockerAnswer = GOOD_CONNECTION;
				waitUntil(() => world.openConfigList.length >= 3, () => {
					ok('docker up, graph down: the driver path retries too', world.openConfigList.length >= 3);
					ok('still one log line (a change of fault while waiting is not a state change)', logLineList.filter((lineText) => lineText.startsWith('error ')).length === 1);
					world.isGraphUp = true;
					waitUntil(() => handle.graphStateOf().graphState === 'connected', () => {
						ok('it connects with no restart', handle.graphStateOf().graphState === 'connected');
						ok('exactly one line for the connection', logLineList.filter((lineText) => lineText.startsWith('status ') && lineText.includes('connected to')).length === 1);
						handle.runQuery('RETURN 1', {}, (answerError, answerRowList) => {
							ok('the same handle now answers', answerError === '' && answerRowList[0].ping === 1, answerError);
							ok('every connection was asked for READ with the query timeout, none for writes', world.openConfigList.every((config) => config.readOnly === true && config.queryTimeoutMs === 1234 && !('writeCapable' in config)));
							handle.close();
							next();
						});
					});
				});
			});
		});
	});
});

steps.push((next) => {
	console.log('\n--- the backoff ---');
	const world = makeWorld();
	const attemptTimeList = [];
	const originalResolve = world.resolveConnectionFresh;
	world.resolveConnectionFresh = (containerName, callback) => { attemptTimeList.push(Date.now()); originalResolve(containerName, callback); };
	const handle = handleOver(world, [10, 40, 80]);
	waitUntil(() => attemptTimeList.length >= 6, () => {
		handle.close();
		const gapList = attemptTimeList.slice(1).map((attemptTime, gapPosition) => attemptTime - attemptTimeList[gapPosition]);
		ok('delays rise and then hold at the cap', gapList[0] >= 8 && gapList[1] >= 35 && gapList[2] >= 70 && gapList[3] >= 70 && gapList[4] >= 70 && gapList[4] < 200, `gaps ${gapList.join(',')}`);
		const countAtClose = attemptTimeList.length;
		setTimeout(() => {
			ok('close() stops the retrying', attemptTimeList.length === countAtClose);
			next();
		}, 120);
	});
});

steps.push((next) => {
	console.log('\n--- the connection is lost, and comes back ---');
	const world = makeWorld();
	world.dockerAnswer = GOOD_CONNECTION;
	world.isGraphUp = true;
	const handle = handleOver(world);
	waitUntil(() => handle.graphStateOf().graphState === 'connected', () => {
		world.queryAnswer = () => ({ errorText: 'Neo4jError: Invalid input', rowList: [] });
		handle.runQuery('RETURN nonsense', {}, (cypherError) => {
			ok('a query\'s own fault passes through untouched', cypherError === 'Neo4jError: Invalid input', cypherError);
			ok('and the handle stays connected (the ping answered)', handle.graphStateOf().graphState === 'connected');
			world.queryAnswer = () => ({ errorText: '', rowList: [{ ping: 1 }] });
			world.isGraphUp = false;
			logLineList.length = 0;
			let answeredCount = 0;
			const answerList = [];
			const collect = (queryError) => { answeredCount += 1; answerList.push(queryError); };
			handle.runQuery('RETURN 1', {}, collect);
			handle.runQuery('RETURN 2', {}, collect);
			waitUntil(() => answeredCount === 2, () => {
				ok('queries caught by the outage are refused by name', answerList.every((queryError) => queryError.startsWith(GOLDEN_GRAPH_NOT_READY_REFUSAL_NAME)), JSON.stringify(answerList));
				ok('the handle says waiting', handle.graphStateOf().graphState === 'waiting');
				ok('one line for the loss, though two queries failed', logLineList.filter((lineText) => lineText.includes('lost the connection')).length === 1, JSON.stringify(logLineList));
				ok('the lost driver was closed', world.closedCount === 1, `closed ${world.closedCount}`);
				world.dockerAnswer = { ...GOOD_CONNECTION, boltUri: 'bolt://localhost:2' };
				const opensBefore = world.openConfigList.length;
				waitUntil(() => world.openConfigList.length >= opensBefore + 2, () => {
					ok('reconnecting resolves afresh (a recreated container\'s new port is used)', world.openConfigList[world.openConfigList.length - 1].neo4jBoltUri === 'bolt://localhost:2');
					ok('no extra line per attempt during the outage', logLineList.filter((lineText) => lineText.startsWith('error ')).length === 1, JSON.stringify(logLineList));
					world.isGraphUp = true;
					waitUntil(() => handle.graphStateOf().graphState === 'connected', () => {
						handle.runQuery('RETURN 1', {}, (answerError) => {
							ok('it answers again', answerError === '', answerError);
							handle.close();
							ok('close() closes the driver', world.closedCount === 2, `closed ${world.closedCount}`);
							next();
						});
					});
				});
			});
		});
	});
});

steps.push((next) => {
	console.log('\n--- no write path, in any state ---');
	const world = makeWorld();
	const handle = handleOver(world);
	let isUserFunctionRun = false;
	handle.runTransaction(() => { isUserFunctionRun = true; }, (waitingError) => {
		ok('runTransaction refuses by name while waiting', /^runTransaction: .*read-only/.test(waitingError), waitingError);
		world.dockerAnswer = GOOD_CONNECTION;
		world.isGraphUp = true;
		waitUntil(() => handle.graphStateOf().graphState === 'connected', () => {
			handle.runTransaction(() => { isUserFunctionRun = true; }, (connectedError) => {
				ok('runTransaction refuses by name while connected', /^runTransaction: .*read-only/.test(connectedError), connectedError);
				ok('the caller\'s function never ran', !isUserFunctionRun);
				handle.close();
				const handleText = fs.readFileSync(path.join(__dirname, '..', 'data-model', 'lib', 'neo4j-instance', 'golden-graph-handle.js'), 'utf8');
				ok('the handle source opens nothing writeCapable', !/writeCapable\s*:/.test(handleText));
				next();
			});
		});
	});
});

steps.push((next) => {
	console.log('\n--- first-connection listeners ---');
	const world = makeWorld();
	const handle = handleOver(world);
	let earlyCount = 0;
	let lateCount = 0;
	handle.whenFirstConnected(() => { earlyCount += 1; });
	world.dockerAnswer = GOOD_CONNECTION;
	world.isGraphUp = true;
	waitUntil(() => earlyCount === 1, () => {
		ok('a listener runs at the first connection', earlyCount === 1);
		world.isGraphUp = false;
		handle.runQuery('RETURN 1', {}, () => {
			world.isGraphUp = true;
			waitUntil(() => handle.graphStateOf().graphState === 'connected', () => {
				ok('and not again at a reconnection (priming can quiesce the golden: a loop if it re-ran)', earlyCount === 1, `ran ${earlyCount}`);
				handle.whenFirstConnected(() => { lateCount += 1; });
				waitUntil(() => lateCount === 1, () => {
					ok('a listener registered after the first connection runs at once', lateCount === 1);
					handle.close();
					next();
				});
			});
		});
	});
});

steps.push((next) => {
	console.log('\n--- no consumer remembers a not-ready answer ---');
	const world = makeWorld();
	const handle = handleOver(world);
	const probe = makeRequiredLabelProbe({ neo4jDb: handle, ownerName: 'scriptedOwner', requiredLabelList: ['Wanted'] });
	world.queryAnswer = (cypher) => ({ errorText: '', rowList: /db\.labels/.test(cypher) ? [{ label: 'Wanted' }] : [] });
	probe((waitingError) => {
		ok('required-label-probe refuses by name while waiting', String(waitingError).includes(GOLDEN_GRAPH_NOT_READY_REFUSAL_NAME), waitingError);
		const getSchemaDescription = makeSchemaProvider({ neo4jDb: handle });
		getSchemaDescription((schemaWaitingError) => {
			ok('schema-provider refuses by name while waiting', String(schemaWaitingError).includes(GOLDEN_GRAPH_NOT_READY_REFUSAL_NAME), schemaWaitingError);
			world.dockerAnswer = GOOD_CONNECTION;
			world.isGraphUp = true;
			waitUntil(() => handle.graphStateOf().graphState === 'connected', () => {
				probe((connectedError) => {
					ok('required-label-probe answers after connection', connectedError === '', connectedError);
					// the schema text needs a real graph; here what matters is that the provider asks the graph again
					let isGraphAskedAgain = false;
					world.queryAnswer = (cypher) => { isGraphAskedAgain = true; return { errorText: '', rowList: [] }; };
					getSchemaDescription(() => {
						ok('schema-provider asks the graph again (the refusal was not cached)', isGraphAskedAgain);
						handle.close();
						next();
					});
				});
			});
		});
	});
});

steps.push((next) => {
	console.log('\n--- /api/health\'s report ---');
	const library = {};
	const loadHealth = (neo4jDb) => {
		require('../data-model/access-points-dot-d/accessPoints.d/health')({ dotD: { logList: [], library: { add: (accessPointName, serviceFunction) => { library[accessPointName] = serviceFunction; } } }, passThroughParameters: { neo4jDb } });
		return library.health;
	};
	const world = makeWorld();
	const handle = handleOver(world);
	const reportOf = (neo4jDb, callback) => loadHealth(neo4jDb)({}, (unusedError, healthReport) => callback(healthReport));
	reportOf(null, (notConfiguredReport) => {
		ok('no handle: notConfigured', JSON.stringify(notConfiguredReport) === '{"graphState":"notConfigured"}', JSON.stringify(notConfiguredReport));
		reportOf(handle, (waitingReport) => {
			ok('waiting, with the container name', JSON.stringify(waitingReport) === `{"graphState":"waiting","goldenContainerName":"${CONTAINER_NAME}"}`, JSON.stringify(waitingReport));
			world.dockerAnswer = GOOD_CONNECTION;
			world.isGraphUp = true;
			waitUntil(() => handle.graphStateOf().graphState === 'connected', () => {
				reportOf(handle, (connectedReport) => {
					ok('connected', JSON.stringify(connectedReport) === '{"graphState":"connected"}', JSON.stringify(connectedReport));
					handle.close();
					next();
				});
			});
		});
	});
});

steps.push((next) => {
	console.log('\n--- warm pool priming waits for the first connection ---');
	const warmPool = require('../data-model/lib/user-graph/warm-pool');
	const cloneManager = require('../data-model/lib/user-graph/clone-manager');
	const originalDescribe = cloneManager.describeWarmContainers;
	const originalProvision = cloneManager.provisionClone;
	let describeCount = 0;
	cloneManager.describeWarmContainers = () => { describeCount += 1; return []; };
	cloneManager.provisionClone = (provisionRequest, callback) => setImmediate(() => callback('scripted: no provisioning in this test'));
	const world = makeWorld();
	const handle = handleOver(world);
	warmPool.primeWhenGoldenConnects({ goldenGraphHandle: handle, warmPoolDepth: 1 });
	setTimeout(() => {
		ok('nothing touches docker for the pool while the golden is waiting', describeCount === 0, `describeCount=${describeCount}`);
		world.dockerAnswer = GOOD_CONNECTION;
		world.isGraphUp = true;
		waitUntil(() => describeCount === 1, () => {
			ok('priming runs at the first connection', describeCount === 1, `describeCount=${describeCount}`);
			warmPool.primeWhenGoldenConnects({ goldenGraphHandle: null, warmPoolDepth: 0 });
			ok('depth 0 still turns the pool off', describeCount === 1);
			warmPool.primeWhenGoldenConnects({ goldenGraphHandle: null, warmPoolDepth: 1 });
			ok('no handle (a config fault) primes at once, as it always did', describeCount === 2, `describeCount=${describeCount}`);
			handle.close();
			setImmediate(() => {
				warmPool.setTargetDepth(0);
				cloneManager.describeWarmContainers = originalDescribe;
				cloneManager.provisionClone = originalProvision;
				next();
			});
		});
	}, 30);
});

steps.push((next) => {
	console.log('\n--- configuration faults reach no retry, and the handle refuses a bad build ---');
	const world = makeWorld();
	const throwOf = (overrideByName) => {
		try {
			createGoldenGraphHandle({ goldenContainerName: CONTAINER_NAME, queryTimeoutMs: 1, retryDelayMsList: [1], resolveConnectionFresh: world.resolveConnectionFresh, neo4jGen: world.neo4jGen, ...overrideByName });
			return '';
		} catch (buildError) {
			return buildError.message;
		}
	};
	ok('no container name throws, naming it', throwOf({ goldenContainerName: '' }).includes('goldenContainerName'));
	ok('a non-positive timeout throws, naming it', throwOf({ queryTimeoutMs: 0 }).includes('queryTimeoutMs'));
	ok('no delays throws, naming them', throwOf({ retryDelayMsList: [] }).includes('retryDelayMsList'));
	const dataModelText = fs.readFileSync(path.join(__dirname, '..', 'data-model', 'data-model.js'), 'utf8');
	ok('data-model.js refuses all three faults with neo4jDb null before a handle exists', (dataModelText.slice(dataModelText.indexOf('THE GOLDEN GRAPH HANDLE'), dataModelText.indexOf('createGoldenGraphHandle({')).match(/neo4jDb: null/g) || []).length === 3);
	next();
});

steps.push((next) => {
	console.log('\n--- withReadSession and whenEveryConnected (standardsQueryService P1) ---');
	const world = makeWorld();
	const handle = handleOver(world);
	let connectionHeardCount = 0;
	handle.whenEveryConnected(() => { connectionHeardCount += 1; });
	handle.withReadSession(() => ok('withReadSession does not open a session while waiting', false), (waitingError) => {
		ok('withReadSession refuses by name while waiting, as runQuery does', waitingError.startsWith(`${GOLDEN_GRAPH_NOT_READY_REFUSAL_NAME}:`) && !world.openedSessionCount, waitingError);
		world.dockerAnswer = GOOD_CONNECTION;
		world.isGraphUp = true;
		waitUntil(() => connectionHeardCount === 1, () => {
			ok('whenEveryConnected hears the first connection', connectionHeardCount === 1, `${connectionHeardCount}`);
			handle.withReadSession((session, sessionDone) => sessionDone('', 'an answer'), (sessionError, sessionResult) => {
				ok('withReadSession answers the consumer\'s result and closes its session', sessionError === '' && sessionResult === 'an answer' && world.openedSessionCount === 1 && world.closedSessionCount === 1, `${sessionError} ${sessionResult} ${world.openedSessionCount} ${world.closedSessionCount}`);
				handle.withReadSession((session, sessionDone) => sessionDone('a query fault of its own'), (faultError) => {
					ok('a consumer\'s fault with the graph up is passed on, the connection kept', faultError === 'a query fault of its own' && handle.graphStateOf().graphState === 'connected' && world.closedSessionCount === 2);
					world.isGraphUp = false;
					handle.withReadSession((session, sessionDone) => sessionDone('connection closed'), () => {
						ok('a consumer\'s fault with the graph gone sends the handle back to waiting', handle.graphStateOf().graphState === 'waiting');
						world.isGraphUp = true;
						waitUntil(() => connectionHeardCount === 2, () => {
							ok('whenEveryConnected hears the reconnect (a new golden can come back under one name)', connectionHeardCount === 2, `${connectionHeardCount}`);
							let lateHeardCount = 0;
							handle.whenEveryConnected(() => { lateHeardCount += 1; });
							waitUntil(() => lateHeardCount === 1, () => {
								ok('a listener registered while connected hears at once', lateHeardCount === 1);
								handle.close();
								next();
							});
						});
					});
				});
			});
		});
	});
});

steps.push((next) => {
	console.log('\n--- the Slack bridge\'s maintenance message still recognises a graph that is down ---');
	const dispatchText = fs.readFileSync(path.join(__dirname, '..', 'data-model', 'access-points-dot-d', 'accessPoints.d', 'dme-slack-dispatch.js'), 'utf8');
	ok('dme-slack-dispatch tests for the refusal name', /includes\(GOLDEN_GRAPH_NOT_READY_REFUSAL_NAME\)/.test(dispatchText));
	next();
});

const runStep = (stepPosition) => {
	if (stepPosition >= steps.length) {
		console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
		process.exit(failed ? 1 : 0);
		return;
	}
	steps[stepPosition](() => runStep(stepPosition + 1));
};
console.log('\n=== golden graph handle: a graph or a Docker that is late ===');
runStep(0);
