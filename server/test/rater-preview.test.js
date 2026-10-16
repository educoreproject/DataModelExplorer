#!/usr/bin/env node
'use strict';

// rater-preview.test.js — revision 8 gate (WORKORDER-RATER8): the admin previews the real rating pages from the Mapping
// Survey tab. Through the real server (harness, scratch store, the named gold):
//   P8.1 previewItem returns, for every item of survey A, exactly what a rater on A gets for that element (element,
//        cards, counts, savedAnswer, progress, the same keys) apart from the card order; preview item N is View items N
//   P8.2 the preview card order is a stable shuffle: the same on a second read, not the sorted order
//   P8.3 no preview payload carries the gold, isMappedInGold, injected marks, scores, ranks, the split, a seed or a name
//   P8.4 previewSearch and previewBrowse answer as the rater's search and browse do, and the preview search is not logged
//   P8.5 every preview action refuses a rater token and an anonymous call (401), and refuses a bad survey / item /
//        element by name
//   P8.6 no rater action (read or write) accepts an admin token; after all of it the store holds no answers, no history
//        and only the rater's own search
//
//   /usr/local/bin/node server/test/rater-preview.test.js

const crypto = require('crypto');
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
		console.log(`  PASS ${testName}`);
	} else {
		failCount++;
		console.log(`  FAIL ${testName}${detailText ? ` — ${detailText}` : ''}`);
	}
};

const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'raterPreviewTest-'));
const raterToolConfig = { goldenContainerName: realRaterToolConfig.goldenContainerName, storeFilePath: path.join(scratchDirPath, 'rater.sqlite3'), frozenInputDirPath: FROZEN_INPUT_DIR_PATH, queryTimeoutMs: realRaterToolConfig.queryTimeoutMs, voyageApiKey: realRaterToolConfig.voyageApiKey };

// passwords are made per run (no password literals in tests: noContainerLiterals.test.js)
const passwordOfRun = () => crypto.randomBytes(12).toString('hex');
const ADMIN_PASSWORD = passwordOfRun();
const RATER_PASSWORD = passwordOfRun();
const PREVIEW_SURVEY_NAME = 'A';
const SURVEY_ITEM_COUNT = 50;

const FORBIDDEN_FIELD_NAME_LIST = ['goldTupleIdList', 'goldInjectedTupleIdList', 'isMappedInGold', 'memberStableIdList', 'memberPathList', 'frameMappedCountByStandard', 'foundByMethod', 'foundBy', 'score', 'rank', 'fusedScore', 'keywordRank', 'vectorRank', 'keywordScore', 'vectorScore', 'hitRank', 'splitHalf', 'kind', 'raterSeedText', 'raterUserName', 'answerCount'];
const fieldNameListDeep = (candidate) => (Array.isArray(candidate) ? candidate.reduce((soFar, entry) => soFar.concat(fieldNameListDeep(entry)), []) : candidate && typeof candidate === 'object' ? Object.keys(candidate).reduce((soFar, fieldName) => soFar.concat([fieldName], fieldNameListDeep(candidate[fieldName])), []) : []);
const sortedCardTextOf = (cardList) => JSON.stringify(cardList.slice().sort((cardA, cardB) => (cardA.cedsTupleId < cardB.cedsTupleId ? -1 : 1)));
// the item order is the viewer's, so the item number and the left-undone list (numbered in that order, revision 14) differ
const withoutCardList = (itemPayload) => JSON.stringify({ ...itemPayload, cardList: null, itemNumber: null, progress: { ...itemPayload.progress, unsavedItemList: null } });

const runSteps = (stepList, finalStep) => {
	const runAt = (stepPosition, state) => (stepPosition >= stepList.length ? finalStep(state) : stepList[stepPosition](state, (nextState) => runAt(stepPosition + 1, nextState)));
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
const login = (state, userName, password, callback) => post(state, '/api/login', { username: userName, password }, null, (response) => callback(response.statusCode === 200 ? response.authtoken : null));
// calls each of requestList in turn, collecting the responses
const postEach = (state, routePath, requestList, authtoken, callback) => {
	const responseList = [];
	const postAt = (position) => (position >= requestList.length ? callback(responseList) : post(state, routePath, requestList[position], authtoken, (response) => {
		responseList.push(response);
		postAt(position + 1);
	}));
	postAt(0);
};
const firstOf = (response) => (response.bodyJson ? response.bodyJson[0] : null);
const itemNumberList = Array.from({ length: SURVEY_ITEM_COUNT }, (unused, position) => position + 1);

const stepList = [
	(state, next) =>
		bootRaterServer({ scratchDirPath, raterToolConfig }, (bootError, harness) => {
			if (bootError) {
				check('the harness boots', false, bootError);
				finish();
				return;
			}
			harness.accessPointByName['admin-create-user']({ username: 'pv-admin', password: ADMIN_PASSWORD, first: 'Preview', last: 'Admin', emailAdr: 'pv-admin@example.org', role: 'admin' }, (createError) => {
				check('a scratch admin account is made', !createError, createError);
				next({ baseUrl: harness.baseUrl, harness });
			});
		}),
	(state, next) => login(state, 'pv-admin', ADMIN_PASSWORD, (adminToken) => next({ ...state, adminToken })),
	(state, next) =>
		post(state, '/api/raterAdmin', { adminAction: 'add', raterUserName: 'pv-rater', whoText: 'Preview test rater', password: RATER_PASSWORD, surveyName: PREVIEW_SURVEY_NAME }, state.adminToken, (response) => {
			check('the admin adds pv-rater on survey A', response.statusCode === 200, response.bodyText.slice(0, 160));
			login(state, 'pv-rater', RATER_PASSWORD, (raterToken) => next({ ...state, raterToken }));
		}),

	// ---------------------------------------------------------------- P8.1 the same payload as a rater's, apart from the order
	(state, next) => {
		console.log('P8.1 preview item = rater item, apart from the card order');
		postEach(state, '/api/raterAdmin', itemNumberList.map((itemNumber) => ({ adminAction: 'previewItem', surveyName: PREVIEW_SURVEY_NAME, itemNumber })), state.adminToken, (previewResponseList) =>
			postEach(state, '/api/raterItemGet', itemNumberList.map((itemNumber) => ({ itemNumber })), state.raterToken, (raterResponseList) =>
				post(state, '/api/raterAdmin', { adminAction: 'surveyItems', surveyName: PREVIEW_SURVEY_NAME }, state.adminToken, (surveyItemsResponse) => {
					const previewItemList = previewResponseList.map(firstOf);
					const raterItemList = raterResponseList.map(firstOf);
					check('the admin reads all 50 preview items of survey A', previewItemList.every((item) => item && item.element) && new Set(previewItemList.map((item) => item.element.elementStableId)).size === SURVEY_ITEM_COUNT, previewResponseList.find((response) => response.statusCode !== 200)?.bodyText);
					const raterItemByStableId = raterItemList.reduce((soFar, item) => ({ ...soFar, [item.element.elementStableId]: item }), {});
					const mismatchList = previewItemList.filter((previewItem) => {
						const raterItem = raterItemByStableId[previewItem.element.elementStableId];
						return !raterItem || withoutCardList(previewItem) !== withoutCardList(raterItem) || sortedCardTextOf(previewItem.cardList) !== sortedCardTextOf(raterItem.cardList);
					});
					check('every preview item is, field for field, the rater payload for that element (cards compared as a set)', mismatchList.length === 0, mismatchList.map((item) => item.element.name).slice(0, 5).join(', '));
					check('the payloads have exactly the same fields', previewItemList.every((previewItem) => JSON.stringify(Object.keys(previewItem)) === JSON.stringify(Object.keys(raterItemByStableId[previewItem.element.elementStableId] || {}))));
					const surveyItemList = firstOf(surveyItemsResponse).itemList;
					check('preview item N is View items N', surveyItemList.every((surveyItem) => previewItemList[surveyItem.itemNumber - 1].element.elementStableId === surveyItem.elementStableId && previewItemList[surveyItem.itemNumber - 1].itemNumber === surveyItem.itemNumber));
					check('preview shows no saved answer and the progress of a rater with none', previewItemList.every((item) => item.savedAnswer === null && item.progress.savedCount === 0 && item.progress.itemCount === SURVEY_ITEM_COUNT && item.progress.savedItemNumberList.length === 0));
					check("preview's left-undone list is every item, numbered in the preview's own order (View items)", previewItemList.every((item) => JSON.stringify(item.progress.unsavedItemList.map((unsavedItem) => [unsavedItem.itemNumber, unsavedItem.name])) === JSON.stringify(previewItemList.map((previewItem) => [previewItem.itemNumber, previewItem.element.name]))));
					next({ ...state, previewItemList, raterItemByStableId });
				})));
	},

	// ---------------------------------------------------------------- P8.2 stable shuffle
	(state, next) => {
		console.log('P8.2 the preview card order is a stable shuffle');
		post(state, '/api/raterAdmin', { adminAction: 'previewItem', surveyName: PREVIEW_SURVEY_NAME, itemNumber: 7 }, state.adminToken, (againResponse) => {
			const cardOrderTextOf = (item) => JSON.stringify(item.cardList.map((card) => card.cedsTupleId));
			check('a second read of item 7 gives the same card order', cardOrderTextOf(firstOf(againResponse)) === cardOrderTextOf(state.previewItemList[6]));
			const shuffledCount = state.previewItemList.filter((item) => cardOrderTextOf(item) !== JSON.stringify(item.cardList.map((card) => card.cedsTupleId).sort())).length;
			check('the preview order is shuffled, not sorted (most items)', shuffledCount > SURVEY_ITEM_COUNT / 2, `${shuffledCount} of ${SURVEY_ITEM_COUNT} shuffled`);
			const raterOrderDiffersCount = state.previewItemList.filter((item) => cardOrderTextOf(item) !== cardOrderTextOf(state.raterItemByStableId[item.element.elementStableId])).length;
			check("the preview order is its own, not the rater's (most items)", raterOrderDiffersCount > SURVEY_ITEM_COUNT / 2, `${raterOrderDiffersCount} of ${SURVEY_ITEM_COUNT} differ`);
			next(state);
		});
	},

	// ---------------------------------------------------------------- P8.3 nothing the rater must not see
	(state, next) => {
		console.log('P8.3 forbidden fields');
		const forbiddenFoundList = FORBIDDEN_FIELD_NAME_LIST.filter((fieldName) => fieldNameListDeep(state.previewItemList).indexOf(fieldName) !== -1);
		check('no preview payload carries the gold, isMappedInGold, foundBy(Method), a score, a rank, the split, the kind, a seed or a name', forbiddenFoundList.length === 0, forbiddenFoundList.join(', '));
		const payloadText = JSON.stringify(state.previewItemList).replace(/GOLD_EVAL_[A-Za-z0-9_]+/g, '');
		check('no preview payload text says gold, injected or preview', !/gold|inject|preview/i.test(payloadText), (payloadText.match(/.{40}(gold|inject|preview).{40}/i) || [])[0]);
		next(state);
	},

	// ---------------------------------------------------------------- P8.4 search and browse
	(state, next) => {
		console.log('P8.4 search and browse');
		const elementStableId = state.previewItemList[4].element.elementStableId;
		const searchRequestList = [
			{ searchMode: 'cedsId', queryText: 'P001572' },
			{ searchMode: 'words', queryText: 'birth date' },
			{ searchMode: 'meaning', queryText: 'the day a student first enrolled in a school' },
		];
		postEach(state, '/api/raterAdmin', searchRequestList.map((searchRequest) => ({ adminAction: 'previewSearch', surveyName: PREVIEW_SURVEY_NAME, elementStableId, ...searchRequest })), state.adminToken, (previewSearchList) =>
			post(state, '/api/raterSearch', { elementStableId, ...searchRequestList[0] }, state.raterToken, (raterSearchResponse) =>
				postEach(state, '/api/raterAdmin', [{ adminAction: 'previewBrowse', browseMode: 'concepts' }, { adminAction: 'previewBrowse', browseMode: 'propertiesOfClass', classCedsId: firstOf(previewSearchList[0])?.cardList[0]?.classCedsId }], state.adminToken, (previewBrowseList) =>
					post(state, '/api/raterBrowse', { browseMode: 'concepts' }, state.raterToken, (raterBrowseResponse) => {
						check('every preview search answers with cards', previewSearchList.every((response) => response.statusCode === 200 && firstOf(response).cardList.length > 0), previewSearchList.map((response) => `${response.statusCode} ${response.bodyText.slice(0, 80)}`).join(' | '));
						check("the preview CEDS ID search is exactly the rater's", JSON.stringify(firstOf(previewSearchList[0])) === JSON.stringify(firstOf(raterSearchResponse)), raterSearchResponse.bodyText.slice(0, 160));
						check('preview browse concepts, then a class, answer with content', previewBrowseList.every((response) => response.statusCode === 200) && firstOf(previewBrowseList[1]).cardList.length > 0, previewBrowseList.map((response) => response.bodyText.slice(0, 80)).join(' | '));
						check("preview browse concepts is exactly the rater's", JSON.stringify(firstOf(previewBrowseList[0])) === JSON.stringify(firstOf(raterBrowseResponse)));
						const forbiddenFoundList = FORBIDDEN_FIELD_NAME_LIST.filter((fieldName) => fieldNameListDeep(previewSearchList.concat(previewBrowseList).map(firstOf)).indexOf(fieldName) !== -1);
						check('no preview search or browse payload carries a forbidden field', forbiddenFoundList.length === 0, forbiddenFoundList.join(', '));
						next({ ...state, searchElementStableId: elementStableId });
					}))));
	},

	// ---------------------------------------------------------------- P8.5 refusals
	(state, next) => {
		console.log('P8.5 refusals');
		const previewRequestList = [
			{ adminAction: 'previewItem', surveyName: PREVIEW_SURVEY_NAME, itemNumber: 1 },
			{ adminAction: 'previewSearch', surveyName: PREVIEW_SURVEY_NAME, elementStableId: state.searchElementStableId, searchMode: 'cedsId', queryText: 'P001572' },
			{ adminAction: 'previewBrowse', browseMode: 'concepts' },
		];
		postEach(state, '/api/raterAdmin', previewRequestList, state.raterToken, (raterResponseList) =>
			postEach(state, '/api/raterAdmin', previewRequestList, null, (anonymousResponseList) => {
				previewRequestList.forEach((previewRequest, position) => {
					check(`${previewRequest.adminAction}: a rater token is refused (401)`, raterResponseList[position].statusCode === 401 && !raterResponseList[position].bodyJson, raterResponseList[position].bodyText.slice(0, 80));
					check(`${previewRequest.adminAction}: an anonymous call is refused (401)`, anonymousResponseList[position].statusCode === 401 && !anonymousResponseList[position].bodyJson, anonymousResponseList[position].bodyText.slice(0, 80));
				});
				const badRequestList = [
					[{ adminAction: 'previewItem', surveyName: 'Z', itemNumber: 1 }, 'surveyNameInvalid'],
					[{ adminAction: 'previewItem', itemNumber: 1 }, 'surveyNameInvalid'],
					[{ adminAction: 'previewItem', surveyName: PREVIEW_SURVEY_NAME, itemNumber: 0 }, 'itemNumberInvalid'],
					[{ adminAction: 'previewItem', surveyName: PREVIEW_SURVEY_NAME, itemNumber: SURVEY_ITEM_COUNT + 1 }, 'itemNumberInvalid'],
					[{ adminAction: 'previewItem', surveyName: PREVIEW_SURVEY_NAME }, 'itemNumberInvalid'],
					[{ adminAction: 'previewSearch', surveyName: 'B', elementStableId: state.searchElementStableId, searchMode: 'words', queryText: 'birth' }, 'elementNotInSurvey'],
					[{ adminAction: 'previewSearch', surveyName: PREVIEW_SURVEY_NAME, elementStableId: state.searchElementStableId, searchMode: 'guess', queryText: 'birth' }, 'searchModeInvalid'],
					[{ adminAction: 'previewBrowse', browseMode: 'everything' }, 'browseModeInvalid'],
				];
				postEach(state, '/api/raterAdmin', badRequestList.map(([badRequest]) => badRequest), state.adminToken, (badResponseList) => {
					badRequestList.forEach(([badRequest, expectedRefusalName], position) => check(`${JSON.stringify(badRequest)} → ${expectedRefusalName}`, refusalNameOf(badResponseList[position]) === expectedRefusalName, badResponseList[position].bodyText.slice(0, 120)));
					next(state);
				});
			}));
	},

	// ---------------------------------------------------------------- P8.6 no rater action takes an admin token; nothing written
	(state, next) => {
		console.log('P8.6 no rater path accepts an admin token; nothing was written');
		const elementStableId = state.searchElementStableId;
		const raterCallList = [
			['/api/raterAnswerSave', { elementStableId, answerKind: 'noMatch' }],
			['/api/raterFinish', {}],
			['/api/raterItemGet', { itemNumber: 1 }],
			['/api/raterSearch', { elementStableId, searchMode: 'cedsId', queryText: 'P001572' }],
			['/api/raterBrowse', { browseMode: 'concepts' }],
			['/api/raterProgress', {}],
		];
		const callAt = (position) => {
			if (position >= raterCallList.length) {
				post(state, '/api/raterAdmin', { adminAction: 'download', downloadFormat: 'json' }, state.adminToken, (downloadResponse) => {
					const downloadDocument = firstOf(downloadResponse) || {};
					const downloadText = JSON.stringify(downloadDocument);
					const storedDocument = JSON.parse(downloadDocument.contentText || '{}');
					check('the store holds no answers', Array.isArray(storedDocument.answerList) && storedDocument.answerList.length === 0, downloadText.slice(0, 200));
					check("the search log holds only the rater's own search (the preview searches were not logged)", Array.isArray(storedDocument.searchLog) && storedDocument.searchLog.length === 1 && storedDocument.searchLog[0].raterName === 'pv-rater', JSON.stringify(storedDocument.searchLog));
					next(state);
				});
				return;
			}
			const [routePath, requestBody] = raterCallList[position];
			post(state, routePath, requestBody, state.adminToken, (response) => {
				check(`${routePath} refuses an admin token (401)`, response.statusCode === 401 && !response.bodyJson, `${response.statusCode} ${response.bodyText.slice(0, 80)}`);
				callAt(position + 1);
			});
		};
		callAt(0);
	},
	(state, next) => {
		state.harness.close();
		next(state);
	},
];

const finish = () => {
	fs.rmSync(scratchDirPath, { recursive: true, force: true });
	console.log(`\n=== rater-preview (revision 8) — Results: ${passCount} passed, ${failCount} failed ===`);
	process.exit(failCount === 0 ? 0 : 1);
};

runSteps(stepList, finish);
