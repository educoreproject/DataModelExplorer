'use strict';
// rater-tool-server.test.js — Phase 3 gates for the CEDS Rater server (lane RATER, 2026-10-14), through the real
// endpoints, access points, token middleware and sqlite store on SCRATCH files, against the live named gold
// (lib/raterServerHarness.js boots them):
//   T3.1  the save matrix: 4 valid answers accepted, 6 invalid ones refused by name
//   T3.2  history: three saves of one item → one current row, three history rows, in order
//   T3.3  lock: after Finish, a save is refused and the answers are unchanged
//   T3.4  isolation: a rater cannot read or write another rater's answers; a rater cannot call admin; no token → 401
//   T3.5  shuffle: two raters on one survey get different item and card orders; one rater gets the same order on reload
//   T3.6  never shown: item and search payloads carry no foundByMethod / score / rank / split / kind / other rater
//   T3.7  search: CEDS ID P001572 → Person Identifier cards with qualifiers; words → cards; meaning → cards
//   T3.8  browse: 8 concepts whose counts sum to the class total; Claim → an empty list, no error; a class → its cards
//   T3.9  refuse by name: a config naming another gold → frozenInputsFromAnotherGold; a named gold that does not
//         exist → raterGoldenContainerUnresolvable on every graph read; never data from another graph
//   T3.10 passwords hashed: the test passwords appear in no sqlite file
//   T3.11 download: JSON and CSV carry every saved answer, with foundBy and history
//
//   /usr/local/bin/node server/test/rater-tool-server.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { bootRaterServer, httpPost } = require('./lib/raterServerHarness');

const CODE_PATH = path.join(__dirname, '..', '..');
const FROZEN_INPUT_DIR_PATH = path.join(CODE_PATH, 'cli', 'lib.d', 'rater-tool', 'frozenInputs');
const configFileProcessor = require(require.resolve('qtools-config-file-processor', { paths: [path.join(__dirname, '..')] }));
const realRaterToolConfig = configFileProcessor.getConfig('raterTool.ini', path.join(CODE_PATH, '..', 'configs', 'instanceSpecific', 'qbook') + '/', { resolve: true }).raterTool;

let passCount = 0;
let failCount = 0;
const check = (testName, condition, detailText) => {
	if (condition) {
		passCount++;
		console.log(`  PASS: ${testName}`);
		return;
	}
	failCount++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'raterServerTest-'));
const ADMIN_PASSWORD = 'harbor lantern quietly 4471';
const RESET_PASSWORD = 'indigo pebble harvest 6620';
const RATER_PASSWORD_BY_NAME = { 'rater-x': 'amber meadow falcon 2210', 'rater-y': 'cobalt river thistle 9081', 'rater-z': 'saffron glacier pivot 5532' };
const configOf = (overrideObject) => ({ goldenContainerName: realRaterToolConfig.goldenContainerName, storeFilePath: path.join(scratchDirPath, 'main', 'rater.sqlite3'), frozenInputDirPath: FROZEN_INPUT_DIR_PATH, queryTimeoutMs: realRaterToolConfig.queryTimeoutMs, voyageApiKey: realRaterToolConfig.voyageApiKey, ...overrideObject });

// a tiny sequential runner: each step is (state, next(state)); a thrown or failed step stops with a FAIL line
const runSteps = (stepList, finalStep) => {
	const runAt = (stepPosition, state) => {
		if (stepPosition >= stepList.length) {
			finalStep(state);
			return;
		}
		stepList[stepPosition](state, (nextState) => runAt(stepPosition + 1, nextState));
	};
	runAt(0, {});
};

const post = (state, routePath, requestBody, authtoken, callback) =>
	httpPost({ baseUrl: state.baseUrl, routePath, requestBody, authtoken }, (postError, response) => {
		if (postError) {
			check(`HTTP ${routePath}`, false, postError);
			callback({ statusCode: 0, bodyText: postError, bodyJson: null });
			return;
		}
		callback(response);
	});
const refusalNameOf = (response) => (response.statusCode === 400 ? response.bodyText.split(':')[0] : `status ${response.statusCode}`);
const keyListDeep = (candidate) => (Array.isArray(candidate) ? candidate.reduce((soFar, entry) => soFar.concat(keyListDeep(entry)), []) : candidate && typeof candidate === 'object' ? Object.keys(candidate).reduce((soFar, fieldName) => soFar.concat([fieldName], keyListDeep(candidate[fieldName])), []) : []);
const FORBIDDEN_KEY_LIST = ['foundByMethod', 'score', 'rank', 'fusedScore', 'keywordRank', 'vectorRank', 'keywordScore', 'vectorScore', 'hitRank', 'splitHalf', 'kind', 'raterSeedText', 'raterUserName', 'answerCount'];

// every response carries an authtoken header (refreshauthtoken runs on every request, a failed login included), so a
// sign-in counts only on HTTP 200
const login = (state, userName, password, callback) => post(state, '/api/login', { username: userName, password }, null, (response) => callback(response.statusCode === 200 ? response.authtoken : null));

const stepList = [
	// ---------------------------------------------------------------- boot, admin, three raters
	(state, next) =>
		bootRaterServer({ scratchDirPath: path.join(scratchDirPath, 'main'), raterToolConfig: configOf({}) }, (bootError, harness) => {
			if (bootError) {
				check('the harness boots', false, bootError);
				finish(state);
				return;
			}
			harness.accessPointByName['admin-create-user']({ username: 'test-admin', password: ADMIN_PASSWORD, first: 'Test', last: 'Admin', emailAdr: 'test-admin@example.org', role: 'admin' }, (createError) => {
				check('a scratch admin account is made', !createError, createError);
				next({ ...state, ...harness, baseUrl: harness.baseUrl, harness });
			});
		}),
	(state, next) => login(state, 'test-admin', ADMIN_PASSWORD, (adminToken) => next({ ...state, adminToken })),
	(state, next) => {
		const raterNameList = Object.keys(RATER_PASSWORD_BY_NAME);
		const addAt = (position) => {
			if (position >= raterNameList.length) {
				next(state);
				return;
			}
			const raterUserName = raterNameList[position];
			post(state, '/api/raterAdmin', { adminAction: 'add', raterUserName, whoText: `Test ${raterUserName}, Example University`, emailAdr: `${raterUserName}@example.org`, password: RATER_PASSWORD_BY_NAME[raterUserName], surveyName: 'A' }, state.adminToken, (response) => {
				check(`admin adds ${raterUserName} on survey A`, response.statusCode === 200 && response.bodyJson[0].added === true, response.bodyText);
				addAt(position + 1);
			});
		};
		addAt(0);
	},
	(state, next) => login(state, 'rater-x', RATER_PASSWORD_BY_NAME['rater-x'], (xToken) => login(state, 'rater-y', RATER_PASSWORD_BY_NAME['rater-y'], (yToken) => login(state, 'rater-z', RATER_PASSWORD_BY_NAME['rater-z'], (zToken) => next({ ...state, xToken, yToken, zToken })))),

	// ---------------------------------------------------------------- T3.5 shuffle (and the items the rest use)
	(state, next) => {
		console.log('T3.5 shuffle');
		const itemListByRater = {};
		const fetchAll = (raterUserName, authtoken, done) => {
			const itemList = [];
			const fetchAt = (itemNumber) => {
				if (itemNumber > 50) {
					itemListByRater[raterUserName] = itemList;
					done();
					return;
				}
				post(state, '/api/raterItemGet', { itemNumber }, authtoken, (response) => {
					itemList.push(response.bodyJson ? response.bodyJson[0] : { failed: response.bodyText });
					fetchAt(itemNumber + 1);
				});
			};
			fetchAt(1);
		};
		fetchAll('rater-x', state.xToken, () => fetchAll('rater-y', state.yToken, () => {
			const xOrder = itemListByRater['rater-x'].map((item) => item.element && item.element.elementStableId);
			const yOrder = itemListByRater['rater-y'].map((item) => item.element && item.element.elementStableId);
			check('rater-x reads all 50 items', xOrder.filter(Boolean).length === 50 && new Set(xOrder).size === 50);
			check('two raters on survey A see the same 50 elements', JSON.stringify(xOrder.slice().sort()) === JSON.stringify(yOrder.slice().sort()));
			check('two raters on survey A get different item orders', JSON.stringify(xOrder) !== JSON.stringify(yOrder));
			const sharedStableId = xOrder[0];
			const yItem = itemListByRater['rater-y'].find((item) => item.element.elementStableId === sharedStableId);
			const xCardOrder = itemListByRater['rater-x'][0].cardList.map((card) => card.cedsTupleId);
			const yCardOrder = yItem.cardList.map((card) => card.cedsTupleId);
			check('the same element shows the same cards to both', JSON.stringify(xCardOrder.slice().sort()) === JSON.stringify(yCardOrder.slice().sort()) && xCardOrder.length > 0);
			check('two raters get different card orders for that element', JSON.stringify(xCardOrder) !== JSON.stringify(yCardOrder));
			post(state, '/api/raterItemGet', { itemNumber: 1 }, state.xToken, (reloadResponse) => {
				const reloadItem = reloadResponse.bodyJson[0];
				check('on reload rater-x gets the same item 1 and the same card order', reloadItem.element.elementStableId === xOrder[0] && JSON.stringify(reloadItem.cardList.map((card) => card.cedsTupleId)) === JSON.stringify(xCardOrder));
				next({ ...state, itemListByRater });
			});
		}));
	},

	// ---------------------------------------------------------------- T3.6 never shown (item payloads)
	(state, next) => {
		console.log('T3.6 never shown (items)');
		const allItemKeyList = keyListDeep(state.itemListByRater['rater-x']);
		const forbiddenFoundList = FORBIDDEN_KEY_LIST.filter((forbiddenKey) => allItemKeyList.indexOf(forbiddenKey) !== -1);
		check('no item payload carries foundByMethod, a score, a rank, the split, the kind, a seed or a rater name', forbiddenFoundList.length === 0, forbiddenFoundList.join(', '));
		check('no suggested card in an item payload carries foundBy', !state.itemListByRater['rater-x'].some((item) => item.cardList.some((card) => card.foundBy !== undefined)));
		next(state);
	},

	// ---------------------------------------------------------------- T3.1 the save matrix
	(state, next) => {
		console.log('T3.1 the save matrix');
		const itemOf = (position) => state.itemListByRater['rater-x'][position];
		const stableIdOf = (position) => itemOf(position).element.elementStableId;
		const tupleOf = (position, cardPosition) => itemOf(position).cardList[cardPosition].cedsTupleId;
		const caseList = [
			{ caseName: 'valid Best', body: { elementStableId: stableIdOf(0), answerKind: 'cards', bestCedsTupleId: tupleOf(0, 0) }, expected: 'saved' },
			{ caseName: 'Best + 2 Same', body: { elementStableId: stableIdOf(1), answerKind: 'cards', bestCedsTupleId: tupleOf(1, 0), sameCedsTupleIdList: [tupleOf(1, 1), tupleOf(1, 2)] }, expected: 'saved' },
			{ caseName: 'No match', body: { elementStableId: stableIdOf(2), answerKind: 'noMatch' }, expected: 'saved' },
			{ caseName: "Unsure + note (with an apostrophe: it's)", body: { elementStableId: stableIdOf(3), answerKind: 'unsure', note: "Two classes fit and I can't tell which; it's a judgment call." }, expected: 'saved' },
			{ caseName: 'nothing', body: { elementStableId: stableIdOf(4) }, expected: 'answerKindInvalid' },
			{ caseName: 'Unsure without note', body: { elementStableId: stableIdOf(4), answerKind: 'unsure', note: '   ' }, expected: 'unsureWithoutNote' },
			{ caseName: 'Same without Best', body: { elementStableId: stableIdOf(4), answerKind: 'cards', sameCedsTupleIdList: [tupleOf(4, 0)] }, expected: 'sameWithoutBest' },
			{ caseName: 'Same on the Best card', body: { elementStableId: stableIdOf(4), answerKind: 'cards', bestCedsTupleId: tupleOf(4, 0), sameCedsTupleIdList: [tupleOf(4, 0)] }, expected: 'sameOnBest' },
			{ caseName: 'two Bests', body: { elementStableId: stableIdOf(4), answerKind: 'cards', bestCedsTupleId: [tupleOf(4, 0), tupleOf(4, 1)] }, expected: 'bestNotOne' },
			{ caseName: 'secondsOnItem not a non-negative number', body: { elementStableId: stableIdOf(4), answerKind: 'noMatch', secondsOnItem: -5 }, expected: 'secondsOnItemInvalid' },
			{ caseName: 'searchesTyped not a list of text', body: { elementStableId: stableIdOf(4), answerKind: 'noMatch', searchesTyped: 'birth date' }, expected: 'searchesTypedInvalid' },
			{ caseName: 'a card not in the list', body: { elementStableId: stableIdOf(4), answerKind: 'cards', bestCedsTupleId: tupleOf(5, 0) === tupleOf(4, 0) ? 'https://example.org/not-a-tuple' : tupleOf(5, 0) }, expected: 'bestNotInList' },
		];
		const runCaseAt = (position) => {
			if (position >= caseList.length) {
				next(state);
				return;
			}
			const testCase = caseList[position];
			post(state, '/api/raterAnswerSave', testCase.body, state.xToken, (response) => {
				const outcomeName = response.statusCode === 200 && response.bodyJson[0].saved ? 'saved' : refusalNameOf(response);
				check(`${testCase.caseName} → ${testCase.expected}`, outcomeName === testCase.expected, `${outcomeName}: ${response.bodyText.slice(0, 160)}`);
				runCaseAt(position + 1);
			});
		};
		runCaseAt(0);
	},
	(state, next) => {
		post(state, '/api/raterItemGet', { itemNumber: 4 }, state.xToken, (response) => {
			const savedAnswer = response.bodyJson[0].savedAnswer;
			check("the Unsure note comes back exactly, apostrophes single (the sqlite-instance doubling trap)", savedAnswer && savedAnswer.note === "Two classes fit and I can't tell which; it's a judgment call.", savedAnswer && savedAnswer.note);
			next(state);
		});
	},

	// ---------------------------------------------------------------- T3.7 search (and an added card)
	(state, next) => {
		console.log('T3.7 search');
		const elementStableId = state.itemListByRater['rater-x'][5].element.elementStableId;
		post(state, '/api/raterSearch', { elementStableId, searchMode: 'cedsId', queryText: 'P001572' }, state.xToken, (idResponse) => {
			const idCardList = idResponse.bodyJson ? idResponse.bodyJson[0].cardList : [];
			const qualifierList = idCardList.map((card) => card.qualifierNameList.join(', '));
			check('CEDS ID P001572 → Person Identification › Person Identifier cards', idCardList.length >= 2 && idCardList.every((card) => card.propertyName === 'Person Identifier' && card.cedsId === 'P001572'), idResponse.bodyText.slice(0, 200));
			check('…with their qualifiers (Student Identifier, Staff Member Identifier among them)', qualifierList.indexOf('Student Identifier') !== -1 && qualifierList.indexOf('Staff Member Identifier') !== -1, JSON.stringify(qualifierList));
			post(state, '/api/raterSearch', { elementStableId, searchMode: 'words', queryText: 'birth date' }, state.xToken, (wordsResponse) => {
				const wordsCardList = wordsResponse.bodyJson ? wordsResponse.bodyJson[0].cardList : [];
				check('a words search ("birth date") returns cards', wordsCardList.length > 0 && wordsCardList.some((card) => /birth/i.test(card.propertyName)), wordsResponse.bodyText.slice(0, 160));
				post(state, '/api/raterSearch', { elementStableId, searchMode: 'meaning', queryText: 'the day a student first enrolled in a school' }, state.xToken, (meaningResponse) => {
					const meaningCardList = meaningResponse.bodyJson ? meaningResponse.bodyJson[0].cardList : [];
					check('a meaning search returns cards', meaningCardList.length > 0, meaningResponse.bodyText.slice(0, 160));
					post(state, '/api/raterSearch', { elementStableId, searchMode: 'cedsId', queryText: 'C200291' }, state.xToken, (badIdResponse) => {
						check('a malformed CEDS ID is refused by name (cedsIdInvalid)', refusalNameOf(badIdResponse) === 'cedsIdInvalid', badIdResponse.bodyText);
						console.log('T3.6 never shown (search)');
						const searchKeyList = keyListDeep([idResponse.bodyJson, wordsResponse.bodyJson, meaningResponse.bodyJson]);
						const forbiddenFoundList = FORBIDDEN_KEY_LIST.concat(['foundBy']).filter((forbiddenKey) => searchKeyList.indexOf(forbiddenKey) !== -1);
						check('no search payload carries foundBy(Method), a score or a rank', forbiddenFoundList.length === 0, forbiddenFoundList.join(', '));
						next({ ...state, searchedCard: idCardList.find((card) => card.qualifierNameList.join(', ') === 'Student Identifier'), searchElementStableId: elementStableId });
					});
				});
			});
		});
	},
	(state, next) => {
		const addedCard = state.searchedCard;
		post(state, '/api/raterAnswerSave', { elementStableId: state.searchElementStableId, answerKind: 'cards', bestCedsTupleId: addedCard.cedsTupleId, addedCardList: [{ cedsTupleId: addedCard.cedsTupleId, foundBy: 'search' }], searchesTyped: ['P001572'], secondsOnItem: 42 }, state.xToken, (response) => {
			check('a card added from Search can be saved as Best', response.statusCode === 200 && response.bodyJson[0].saved, response.bodyText.slice(0, 160));
			post(state, '/api/raterAnswerSave', { elementStableId: state.searchElementStableId, answerKind: 'cards', bestCedsTupleId: addedCard.cedsTupleId, addedCardList: [{ cedsTupleId: 'https://example.org/forged-tuple', foundBy: 'search' }] }, state.xToken, (forgedResponse) => {
				check('an added card that is not a CEDS card in the gold is refused', ['addedCardInvalid', 'bestNotInList'].indexOf(refusalNameOf(forgedResponse)) !== -1, forgedResponse.bodyText.slice(0, 160));
				next(state);
			});
		});
	},

	// ---------------------------------------------------------------- T3.8 browse
	(state, next) => {
		console.log('T3.8 browse');
		post(state, '/api/raterBrowse', { browseMode: 'concepts' }, state.xToken, (conceptResponse) => {
			const conceptAnswer = conceptResponse.bodyJson ? conceptResponse.bodyJson[0] : {};
			const conceptList = conceptAnswer.conceptList || [];
			const countSum = conceptList.reduce((soFar, concept) => soFar + concept.classCount, 0);
			check('8 concepts', conceptList.length === 8, JSON.stringify(conceptList.map((concept) => concept.conceptName)));
			check(`their class counts sum to the class total with a concept (${countSum} = ${conceptAnswer.classWithConceptTotal}; CEDS classes in all ${conceptAnswer.classTotal})`, countSum === conceptAnswer.classWithConceptTotal && countSum > 0 && countSum <= conceptAnswer.classTotal);
			post(state, '/api/raterBrowse', { browseMode: 'classesOfConcept', conceptName: 'Claim' }, state.xToken, (claimResponse) => {
				check('Claim → an empty class list, without error', claimResponse.statusCode === 200 && Array.isArray(claimResponse.bodyJson[0].classList) && claimResponse.bodyJson[0].classList.length === 0, claimResponse.bodyText.slice(0, 160));
				post(state, '/api/raterBrowse', { browseMode: 'classesOfConcept', conceptName: 'Person' }, state.xToken, (personResponse) => {
					const personClassList = personResponse.bodyJson ? personResponse.bodyJson[0].classList : [];
					const identification = personClassList.find((cedsClass) => cedsClass.className === 'Person Identification');
					check('Person → 92 classes, Person Identification among them', personClassList.length === 92 && identification, `${personClassList.length}`);
					post(state, '/api/raterBrowse', { browseMode: 'propertiesOfClass', classCedsId: identification ? identification.classCedsId : 'none' }, state.xToken, (classResponse) => {
						const classAnswer = classResponse.bodyJson ? classResponse.bodyJson[0] : {};
						check('Person Identification → its cards, P001572 among them, with its concept for the breadcrumb', (classAnswer.cardList || []).some((card) => card.cedsId === 'P001572') && classAnswer.conceptName === 'Person', classResponse.bodyText.slice(0, 160));
						post(state, '/api/raterBrowse', { browseMode: 'classesOfConcept', conceptName: 'Nonsense' }, state.xToken, (unknownResponse) => {
							check('an unknown concept is refused by name (unknownConcept)', refusalNameOf(unknownResponse) === 'unknownConcept', unknownResponse.bodyText);
							next(state);
						});
					});
				});
			});
		});
	},

	// ---------------------------------------------------------------- T3.2 history
	(state, next) => {
		console.log('T3.2 history');
		const item = state.itemListByRater['rater-y'][0];
		const elementStableId = item.element.elementStableId;
		const bodyList = [
			{ elementStableId, answerKind: 'noMatch', note: 'first' },
			{ elementStableId, answerKind: 'cards', bestCedsTupleId: item.cardList[0].cedsTupleId, note: 'second' },
			{ elementStableId, answerKind: 'unsure', note: 'third' },
		];
		const saveAt = (position) => {
			if (position >= bodyList.length) {
				post(state, '/api/raterAdmin', { adminAction: 'download', downloadFormat: 'json' }, state.adminToken, (response) => {
					const downloadDocument = JSON.parse(response.bodyJson[0].contentText);
					const currentList = downloadDocument.answerList.filter((record) => record.raterName === 'rater-y' && record.elementStableId === elementStableId);
					const history = currentList[0] ? currentList[0].history : [];
					check('one current row', currentList.length === 1, `${currentList.length}`);
					check('three history rows, in order (noMatch, cards, unsure; sequence 1, 2, 3)', history.length === 3 && history.map((entry) => entry.answerKind).join(',') === 'noMatch,cards,unsure' && history.map((entry) => entry.historySequence).join(',') === '1,2,3', JSON.stringify(history.map((entry) => [entry.historySequence, entry.answerKind])));
					check('the current row is the third save', currentList[0] && currentList[0].answerKind === 'unsure' && currentList[0].note === 'third');
					next(state);
				});
				return;
			}
			post(state, '/api/raterAnswerSave', bodyList[position], state.yToken, (response) => {
				check(`rater-y save ${position + 1}`, response.statusCode === 200, response.bodyText.slice(0, 120));
				saveAt(position + 1);
			});
		};
		saveAt(0);
	},

	// ---------------------------------------------------------------- T3.4 isolation
	(state, next) => {
		console.log('T3.4 isolation');
		const yFirstStableId = state.itemListByRater['rater-y'][0].element.elementStableId;
		const xPosition = state.itemListByRater['rater-x'].findIndex((item) => item.element.elementStableId === yFirstStableId);
		post(state, '/api/raterItemGet', { itemNumber: xPosition + 1, raterUserName: 'rater-y' }, state.xToken, (response) => {
			const item = response.bodyJson[0];
			check("rater-x asking (even naming rater-y) for the element rater-y answered sees no answer of rater-y's", item.element.elementStableId === yFirstStableId && (item.savedAnswer === null || item.savedAnswer.note !== 'third'), JSON.stringify(item.savedAnswer));
			check('…and nothing in the payload names rater-y', response.bodyText.indexOf('rater-y') === -1);
			post(state, '/api/raterAnswerSave', { elementStableId: yFirstStableId, answerKind: 'noMatch', note: 'written by x', raterUserName: 'rater-y' }, state.xToken, () => {
				post(state, '/api/raterAdmin', { adminAction: 'download', downloadFormat: 'json' }, state.adminToken, (downloadResponse) => {
					const downloadDocument = JSON.parse(downloadResponse.bodyJson[0].contentText);
					const yRecord = downloadDocument.answerList.find((record) => record.raterName === 'rater-y' && record.elementStableId === yFirstStableId);
					const xRecord = downloadDocument.answerList.find((record) => record.raterName === 'rater-x' && record.elementStableId === yFirstStableId);
					check("rater-x's save naming rater-y lands on rater-x, rater-y's answer is untouched", yRecord && yRecord.note === 'third' && xRecord && xRecord.note === 'written by x');
					post(state, '/api/raterAdmin', { adminAction: 'list' }, state.xToken, (adminResponse) => {
						check('a rater calling the admin endpoint → 401', adminResponse.statusCode === 401, `${adminResponse.statusCode}`);
						post(state, '/api/raterItemGet', { itemNumber: 1 }, null, (anonymousResponse) => {
							check('no token → 401', anonymousResponse.statusCode === 401, `${anonymousResponse.statusCode}`);
							post(state, '/api/raterItemGet', { itemNumber: 1 }, state.adminToken, (adminAsRaterResponse) => {
								check('an admin with no rater record is refused by name on rater endpoints (notARater or 401)', ['notARater', 'status 401'].indexOf(refusalNameOf(adminAsRaterResponse)) !== -1, adminAsRaterResponse.bodyText.slice(0, 120));
								next(state);
							});
						});
					});
				});
			});
		});
	},

	// ---------------------------------------------------------------- T3.3 lock (rater-z rates all 50, then finishes)
	(state, next) => {
		console.log('T3.3 lock');
		post(state, '/api/raterFinish', {}, state.zToken, (earlyResponse) => {
			check('Finish before every item is saved is refused (notAllItemsSaved)', refusalNameOf(earlyResponse) === 'notAllItemsSaved', earlyResponse.bodyText.slice(0, 120));
			const zOrderedList = [];
			const fetchAndSaveAt = (itemNumber) => {
				if (itemNumber > 50) {
					post(state, '/api/raterFinish', {}, state.zToken, (finishResponse) => {
						check('Finish after all 50 are saved', finishResponse.statusCode === 200 && finishResponse.bodyJson[0].finishedAt, finishResponse.bodyText.slice(0, 160));
						post(state, '/api/raterAdmin', { adminAction: 'download', downloadFormat: 'json' }, state.adminToken, (beforeResponse) => {
							const beforeList = JSON.parse(beforeResponse.bodyJson[0].contentText).answerList.filter((record) => record.raterName === 'rater-z');
							post(state, '/api/raterAnswerSave', { elementStableId: zOrderedList[0], answerKind: 'unsure', note: 'after the lock' }, state.zToken, (lockedResponse) => {
								check('a save after Finish is refused (answersLocked)', refusalNameOf(lockedResponse) === 'answersLocked', lockedResponse.bodyText.slice(0, 120));
								post(state, '/api/raterAdmin', { adminAction: 'download', downloadFormat: 'json' }, state.adminToken, (afterResponse) => {
									const afterList = JSON.parse(afterResponse.bodyJson[0].contentText).answerList.filter((record) => record.raterName === 'rater-z');
									check("rater-z's 50 answers are unchanged by the refused save", beforeList.length === 50 && JSON.stringify(beforeList) === JSON.stringify(afterList));
									next(state);
								});
							});
						});
					});
					return;
				}
				post(state, '/api/raterItemGet', { itemNumber }, state.zToken, (itemResponse) => {
					const elementStableId = itemResponse.bodyJson[0].element.elementStableId;
					zOrderedList.push(elementStableId);
					post(state, '/api/raterAnswerSave', { elementStableId, answerKind: 'noMatch' }, state.zToken, () => fetchAndSaveAt(itemNumber + 1));
				});
			};
			fetchAndSaveAt(1);
		});
	},

	// ---------------------------------------------------------------- T3.11 download
	(state, next) => {
		console.log('T3.11 download');
		post(state, '/api/raterAdmin', { adminAction: 'download', downloadFormat: 'json' }, state.adminToken, (jsonResponse) => {
			const downloadDocument = JSON.parse(jsonResponse.bodyJson[0].contentText);
			const answerList = downloadDocument.answerList;
			// what the store holds, read straight from the access point's own list action
			post(state, '/api/raterAdmin', { adminAction: 'list' }, state.adminToken, (listResponse) => {
				const storedAnswerCount = listResponse.bodyJson[0].raterList.reduce((soFar, rater) => soFar + rater.answerCount, 0);
				check(`JSON: every saved answer (${answerList.length} = ${storedAnswerCount} in the store)`, answerList.length === storedAnswerCount && storedAnswerCount >= 56);
				const cardRecordList = answerList.filter((record) => record.answerKind === 'cards');
				check('JSON: every chosen card carries foundBy, and the added card says search', cardRecordList.length > 0 && cardRecordList.every((record) => record.cards.every((card) => ['suggested', 'search', 'browseFromCard', 'browseFromConcept'].indexOf(card.foundBy) !== -1)) && cardRecordList.some((record) => record.cards.some((card) => card.foundBy === 'search')));
				check('JSON: every answer carries its history (at least one entry, the last equal to the current answer)', answerList.every((record) => record.history.length >= 1 && record.history[record.history.length - 1].answerKind === record.answerKind));
				check('JSON: no foundByMethod anywhere in the download either (it is the analysis field of suggested.json only)', jsonResponse.bodyJson[0].contentText.indexOf('foundByMethod') === -1);
				post(state, '/api/raterAdmin', { adminAction: 'download', downloadFormat: 'csv' }, state.adminToken, (csvResponse) => {
					const csvText = csvResponse.bodyJson[0].contentText;
					const headerList = csvText.split('\n')[0].split(',');
					const dataLineCount = csvResponse.bodyJson[0].recordCount;
					check(`CSV: one row per saved answer (${dataLineCount})`, dataLineCount === answerList.length);
					check('CSV: has bestFoundBy, sameCards, addedCards, historyCount and historyJson columns', ['bestFoundBy', 'sameCards', 'addedCards', 'historyCount', 'historyJson'].every((columnName) => headerList.indexOf(columnName) !== -1));
					check('CSV: the search-added card is there with [search]', /\[search\]|,search,/.test(csvText));
					next(state);
				});
			});
		});
	},

	// ---------------------------------------------------------------- admin: survey change, password reset
	(state, next) => {
		console.log('admin actions');
		post(state, '/api/raterAdmin', { adminAction: 'surveyChange', raterUserName: 'rater-x', surveyName: 'B' }, state.adminToken, (refusedResponse) => {
			check('survey change once answers exist is refused (surveyChangeWithAnswers)', refusalNameOf(refusedResponse) === 'surveyChangeWithAnswers', refusedResponse.bodyText.slice(0, 120));
			post(state, '/api/raterAdmin', { adminAction: 'passwordReset', raterUserName: 'rater-y', password: RESET_PASSWORD }, state.adminToken, (resetResponse) => {
				check('password reset', resetResponse.statusCode === 200, resetResponse.bodyText.slice(0, 120));
				login(state, 'rater-y', RESET_PASSWORD, (newToken) => {
					check('the new password signs in', !!newToken);
					RATER_PASSWORD_BY_NAME['rater-y-new'] = RESET_PASSWORD;
					post(state, '/api/raterAdmin', { adminAction: 'add', raterUserName: 'rater-w', whoText: 'Issued-password test', surveyName: 'C' }, state.adminToken, (issuedResponse) => {
						const issuedPassword = issuedResponse.bodyJson ? issuedResponse.bodyJson[0].issuedPassword : null;
						check('an add without a password issues one (shown once)', typeof issuedPassword === 'string' && issuedPassword.length >= 16, issuedResponse.bodyText.slice(0, 120));
						login(state, 'rater-w', issuedPassword, (issuedToken) => {
							check('the issued password signs in', !!issuedToken);
							RATER_PASSWORD_BY_NAME['rater-w'] = issuedPassword;
							next(state);
						});
					});
				});
			});
		});
	},

	// ---------------------------------------------------------------- T3.10 hashed passwords
	(state, next) => {
		console.log('T3.10 passwords stored hashed');
		const sqliteFilePathList = fs.readdirSync(path.join(scratchDirPath, 'main')).filter((fileName) => /\.sqlite3$/.test(fileName)).map((fileName) => path.join(scratchDirPath, 'main', fileName));
		const passwordList = [ADMIN_PASSWORD, ...Object.values(RATER_PASSWORD_BY_NAME)];
		const plainFoundList = sqliteFilePathList.reduce((soFar, filePath) => {
			const fileBuffer = fs.readFileSync(filePath);
			return soFar.concat(passwordList.filter((password) => fileBuffer.indexOf(Buffer.from(password, 'utf8')) !== -1).map((password) => `${path.basename(filePath)}:${password.slice(0, 4)}…`));
		}, []);
		check(`no test password appears in ${sqliteFilePathList.length} sqlite files`, sqliteFilePathList.length === 2 && plainFoundList.length === 0, plainFoundList.join(', '));
		// red twin: a known plain value written by the tool IS found by the same scan (the scan can see text)
		const storeBuffer = fs.readFileSync(path.join(scratchDirPath, 'main', 'rater.sqlite3'));
		check('red twin: the same scan finds a known plain text the tool stored ("written by x")', storeBuffer.indexOf(Buffer.from('written by x', 'utf8')) !== -1);
		next(state);
	},

	// ---------------------------------------------------------------- admin remove
	(state, next) => {
		post(state, '/api/raterAdmin', { adminAction: 'remove', raterUserName: 'rater-z' }, state.adminToken, (removeResponse) => {
			check('admin removes rater-z', removeResponse.statusCode === 200 && removeResponse.bodyJson[0].removed, removeResponse.bodyText.slice(0, 120));
			login(state, 'rater-z', RATER_PASSWORD_BY_NAME['rater-z'], (goneToken) => {
				check('rater-z can no longer sign in', !goneToken);
				post(state, '/api/raterAdmin', { adminAction: 'list' }, state.adminToken, (listResponse) => {
					check("rater-z's rows are gone from the store", !listResponse.bodyJson[0].raterList.some((rater) => rater.raterUserName === 'rater-z'));
					state.harness.close();
					next(state);
				});
			});
		});
	},

	// ---------------------------------------------------------------- T3.9 refuse by name
	(state, next) => {
		console.log('T3.9 refuse by name');
		bootRaterServer({ scratchDirPath: path.join(scratchDirPath, 'otherGold'), raterToolConfig: configOf({ goldenContainerName: 'GOLD_EVAL_raterTest_noSuchContainer', storeFilePath: path.join(scratchDirPath, 'otherGold', 'rater.sqlite3') }) }, (bootError, harness) => {
			check('a server whose config names another gold still boots', !bootError, bootError);
			check('…and its rater tool is off with frozenInputsFromAnotherGold', harness && harness.raterToolAccess.setupRefusal && harness.raterToolAccess.setupRefusal.refusalName === 'frozenInputsFromAnotherGold');
			harness.accessPointByName['rater-search']({ raterUserName: 'anyone', elementStableId: 'x', searchMode: 'words', queryText: 'birth' }, (searchError, searchAnswer) => {
				check('…and its search refuses by that name, returning no cards', !searchError && searchAnswer.refusal && searchAnswer.refusal.refusalName === 'frozenInputsFromAnotherGold' && !searchAnswer.cardList);
				harness.close();
				next(state);
			});
		});
	},
	(state, next) => {
		// frozen inputs that say they came from the unreachable gold, so the graph read itself is what refuses
		const frozenCopyDirPath = path.join(scratchDirPath, 'unreachableFrozen');
		fs.mkdirSync(frozenCopyDirPath, { recursive: true });
		['sample.json', 'suggested.json'].forEach((fileName) => {
			const frozenDocument = JSON.parse(fs.readFileSync(path.join(FROZEN_INPUT_DIR_PATH, fileName), 'utf8'));
			fs.writeFileSync(path.join(frozenCopyDirPath, fileName), JSON.stringify({ ...frozenDocument, goldenContainerName: 'GOLD_EVAL_raterTest_noSuchContainer' }));
		});
		bootRaterServer({ scratchDirPath: path.join(scratchDirPath, 'unreachable'), raterToolConfig: configOf({ goldenContainerName: 'GOLD_EVAL_raterTest_noSuchContainer', frozenInputDirPath: frozenCopyDirPath, storeFilePath: path.join(scratchDirPath, 'unreachable', 'rater.sqlite3') }) }, (bootError, harness) => {
			check('a server naming a gold that does not exist boots', !bootError, bootError);
			harness.accessPointByName['admin-create-user']({ username: 'test-admin', password: ADMIN_PASSWORD, first: 'Test', last: 'Admin', emailAdr: 'test-admin@example.org', role: 'admin' }, () => {
				const unreachableState = { baseUrl: harness.baseUrl };
				login(unreachableState, 'test-admin', ADMIN_PASSWORD, (adminToken) => {
					post(unreachableState, '/api/raterAdmin', { adminAction: 'add', raterUserName: 'rater-u', whoText: 'U', password: RATER_PASSWORD_BY_NAME['rater-x'], surveyName: 'B' }, adminToken, () => {
						login(unreachableState, 'rater-u', RATER_PASSWORD_BY_NAME['rater-x'], (raterToken) => {
							post(unreachableState, '/api/raterItemGet', { itemNumber: 1 }, raterToken, (itemResponse) => {
								const elementStableId = itemResponse.bodyJson ? itemResponse.bodyJson[0].element.elementStableId : 'none';
								const graphCallList = [
									['words search', '/api/raterSearch', { elementStableId, searchMode: 'words', queryText: 'birth date' }],
									['meaning search', '/api/raterSearch', { elementStableId, searchMode: 'meaning', queryText: 'birth date' }],
									['CEDS ID search', '/api/raterSearch', { elementStableId, searchMode: 'cedsId', queryText: 'P001572' }],
									['browse concepts', '/api/raterBrowse', { browseMode: 'concepts' }],
									['save with an added card', '/api/raterAnswerSave', { elementStableId, answerKind: 'cards', bestCedsTupleId: 't', addedCardList: [{ cedsTupleId: 't', foundBy: 'search' }] }],
								];
								const callAt = (position) => {
									if (position >= graphCallList.length) {
										harness.close();
										next(state);
										return;
									}
									const [callName, routePath, requestBody] = graphCallList[position];
									post(unreachableState, routePath, requestBody, raterToken, (response) => {
										check(`${callName} → raterGoldenContainerUnresolvable (HTTP 400, no cards)`, refusalNameOf(response) === 'raterGoldenContainerUnresolvable' && response.bodyText.indexOf('cedsTupleId') === -1, response.bodyText.slice(0, 160));
										callAt(position + 1);
									});
								};
								callAt(0);
							});
						});
					});
				});
			});
		});
	},
];

const finish = () => {
	fs.rmSync(scratchDirPath, { recursive: true, force: true });
	console.log(`\n=== rater-tool-server (Phase 3) — Results: ${passCount} passed, ${failCount} failed ===`);
	process.exit(failCount === 0 ? 0 : 1);
};

runSteps(stepList, finish);
