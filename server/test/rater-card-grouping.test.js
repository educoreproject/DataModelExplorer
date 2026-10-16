#!/usr/bin/env node
'use strict';

// rater-card-grouping.test.js — revision 12 gate (WORKORDER-RATER12): a list's cards are gathered by CEDS property.
// The property identity is the card's cedsId (the CEDS property's P-id) plus its qualifierNameList, the class ignored
// (card-property-identity.js). Each rater keeps their own shuffle; a group sits where its first member falls in it and
// its members follow in shuffled order; singletons are unchanged.
//   G12.1 the pure rule: placement, member order, singletons, the identity (class ignored, qualifiers counted), refusals
//   G12.2 through the real server, every item of two raters on survey B: each property's cards are adjacent, the cards
//         are the suggested set, and the group order differs between the two raters
//   G12.3 the admin preview: the order is exactly gather(the preview seed's shuffle), stable on a second read, grouped
//   G12.4 no rater or preview card gains a field (exactly RATER_CARD_FIELD_LIST) and none carries a forbidden field
//   G12.5 Best and Same inside a group save and read back as before
//
//   /usr/local/bin/node server/test/rater-card-grouping.test.js

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { bootRaterServer, httpPost } = require('./lib/raterServerHarness');
const { propertyIdentityOf, gatherCardsByPropertyIdentity } = require('../data-model/lib/rater-tool/card-property-identity');
const { seededShuffle } = require('../data-model/lib/rater-tool/seeded-draw');
const { RATER_CARD_FIELD_LIST, PREVIEW_SEED_PREFIX } = require('../data-model/lib/rater-tool/rater-tool-service');

const CODE_PATH = path.join(__dirname, '..', '..');
const FROZEN_INPUT_DIR_PATH = path.join(CODE_PATH, 'cli', 'lib.d', 'rater-tool', 'frozenInputs');
const suggestedDocument = JSON.parse(fs.readFileSync(path.join(FROZEN_INPUT_DIR_PATH, 'suggested.json'), 'utf8'));
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

const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'raterCardGroupingTest-'));
const raterToolConfig = { goldenContainerName: realRaterToolConfig.goldenContainerName, storeFilePath: path.join(scratchDirPath, 'rater.sqlite3'), frozenInputDirPath: FROZEN_INPUT_DIR_PATH, queryTimeoutMs: realRaterToolConfig.queryTimeoutMs, voyageApiKey: realRaterToolConfig.voyageApiKey };

// passwords are made per run (no password literals in tests: noContainerLiterals.test.js)
// (redrawn when it breaks the house rule of no more than 3 identical characters in a row, which random hex sometimes does)
const passwordOfRun = () => {
	const passwordText = crypto.randomBytes(12).toString('hex');
	return /(.)\1{3}/.test(passwordText) ? passwordOfRun() : passwordText;
};
const ADMIN_PASSWORD = passwordOfRun();
const RATER_PASSWORD = passwordOfRun();
const GROUPING_SURVEY_NAME = 'B';
const SURVEY_ITEM_COUNT = 50;
const FORBIDDEN_FIELD_NAME_LIST = ['goldTupleIdList', 'goldInjectedTupleIdList', 'isMappedInGold', 'memberStableIdList', 'memberPathList', 'foundByMethod', 'foundBy', 'score', 'rank', 'fusedScore', 'keywordRank', 'vectorRank', 'hitRank', 'splitHalf', 'kind', 'raterSeedText', 'raterUserName', 'propertyIdentity', 'groupSize', 'groupRefId'];

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
const login = (state, userName, password, callback) => post(state, '/api/login', { username: userName, password }, null, (response) => callback(response.statusCode === 200 ? response.authtoken : null));
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

// the identities in list order, one entry per run of equal identities
const identityRunListOf = (cardList) => cardList.map(propertyIdentityOf).filter((propertyIdentity, position, identityList) => position === 0 || identityList[position - 1] !== propertyIdentity);
// every identity occupies ONE run: the cards of a property are adjacent
const isGrouped = (cardList) => {
	const identityRunList = identityRunListOf(cardList);
	return new Set(identityRunList).size === identityRunList.length;
};
const multiMemberRunCountOf = (cardList) => cardList.length - identityRunListOf(cardList).length;
const sortedTupleIdTextOf = (cardList) => JSON.stringify(cardList.map((card) => card.cedsTupleId).sort());
const suggestedCardListOf = (elementStableId) => suggestedDocument.suggestedByElementStableId[elementStableId].cardList;
const fieldNameListDeep = (candidate) => (Array.isArray(candidate) ? candidate.reduce((soFar, entry) => soFar.concat(fieldNameListDeep(entry)), []) : candidate && typeof candidate === 'object' ? Object.keys(candidate).reduce((soFar, fieldName) => soFar.concat([fieldName], fieldNameListDeep(candidate[fieldName])), []) : []);

// the rule written out a second way, so G12.3 does not check gatherCardsByPropertyIdentity against itself: walk the
// shuffle; at each card whose property has not been placed yet, place every card of that property, in shuffled order
const gatheredByHand = (shuffledCardList) => shuffledCardList.reduce((soFar, card) => (soFar.some((placedCard) => propertyIdentityOf(placedCard) === propertyIdentityOf(card)) ? soFar : soFar.concat(shuffledCardList.filter((memberCard) => propertyIdentityOf(memberCard) === propertyIdentityOf(card)))), []);

// ---------------------------------------------------------------- G12.1 the pure rule
const testCardOf = (tupleName, cedsId, className, qualifierNameList = []) => ({ cedsTupleId: `t-${tupleName}`, cedsId, className, qualifierNameList });
const pureRuleChecks = () => {
	console.log('G12.1 the pure rule');
	const shuffledList = [testCardOf('a1', 'P000001', 'K12 School'), testCardOf('b1', 'P000002', 'Person'), testCardOf('a2', 'P000001', 'Organization'), testCardOf('c1', 'P000003', 'Person'), testCardOf('b2', 'P000002', 'Staff'), testCardOf('a3', 'P000001', 'Course')];
	const shuffledText = JSON.stringify(shuffledList);
	const gatheredNameList = gatherCardsByPropertyIdentity(shuffledList).map((card) => card.cedsTupleId.slice(2));
	check(`a group sits at its first member's place, members in shuffled order (${gatheredNameList.join(' ')})`, gatheredNameList.join(' ') === 'a1 a2 a3 b1 b2 c1');
	check('the input list is not changed', JSON.stringify(shuffledList) === shuffledText);
	const singletonList = [testCardOf('x', 'P000009', 'A'), testCardOf('y', 'P000008', 'A'), testCardOf('z', 'P000007', 'A')];
	check('a list of singletons keeps its order', gatherCardsByPropertyIdentity(singletonList).map((card) => card.cedsTupleId).join() === 't-x,t-y,t-z');
	check('an empty list stays empty', gatherCardsByPropertyIdentity([]).length === 0);
	check('the class is ignored', propertyIdentityOf(testCardOf('p', 'P000001', 'Person')) === propertyIdentityOf(testCardOf('q', 'P000001', 'Organization')));
	check('qualifiers count: the same property with another qualifier is another identity', propertyIdentityOf(testCardOf('p', 'P000001', 'Person', ['Student Identifier'])) !== propertyIdentityOf(testCardOf('q', 'P000001', 'Person', ['Staff Member Identifier'])) && propertyIdentityOf(testCardOf('p', 'P000001', 'Person', ['Student Identifier'])) !== propertyIdentityOf(testCardOf('q', 'P000001', 'Person')));
	check('qualifier order does not matter', propertyIdentityOf(testCardOf('p', 'P000001', 'A', ['One', 'Two'])) === propertyIdentityOf(testCardOf('q', 'P000001', 'B', ['Two', 'One'])));
	const refusalTextOf = (card) => {
		try {
			propertyIdentityOf(card);
			return '';
		} catch (identityError) {
			return identityError.message;
		}
	};
	check('a card with no cedsId is refused by name', /cedsId/.test(refusalTextOf({ cedsTupleId: 't-n', className: 'A', qualifierNameList: [] })));
	check('a card with no qualifierNameList is refused by name', /qualifierNameList/.test(refusalTextOf({ cedsTupleId: 't-n', cedsId: 'P000001', className: 'A' })));
	const frozenGroupCount = Object.values(suggestedDocument.suggestedByElementStableId).reduce((soFar, suggestedEntry) => soFar + (multiMemberRunCountOf(gatherCardsByPropertyIdentity(suggestedEntry.cardList)) > 0 ? 1 : 0), 0);
	check(`the frozen lists have properties in several classes to group (${frozenGroupCount} of 150 lists)`, frozenGroupCount > 0);
};

const stepList = [
	(state, next) => {
		pureRuleChecks();
		next(state);
	},
	(state, next) =>
		bootRaterServer({ scratchDirPath, raterToolConfig }, (bootError, harness) => {
			if (bootError) {
				check('the harness boots', false, bootError);
				finish();
				return;
			}
			harness.accessPointByName['admin-create-user']({ username: 'gp-admin', password: ADMIN_PASSWORD, first: 'Grouping', last: 'Admin', emailAdr: 'gp-admin@example.org', role: 'admin' }, (createError) => {
				check('a scratch admin account is made', !createError, createError);
				next({ baseUrl: harness.baseUrl, harness });
			});
		}),
	(state, next) => login(state, 'gp-admin', ADMIN_PASSWORD, (adminToken) => next({ ...state, adminToken })),
	(state, next) =>
		postEach(state, '/api/raterAdmin', ['gp-rater-x', 'gp-rater-y'].map((raterUserName) => ({ adminAction: 'add', raterUserName, whoText: 'Grouping test rater', password: RATER_PASSWORD, surveyName: GROUPING_SURVEY_NAME })), state.adminToken, (responseList) => {
			check('the admin adds two raters on survey B', responseList.every((response) => response.statusCode === 200), responseList.map((response) => response.bodyText.slice(0, 120)).join(' | '));
			login(state, 'gp-rater-x', RATER_PASSWORD, (xToken) => login(state, 'gp-rater-y', RATER_PASSWORD, (yToken) => next({ ...state, xToken, yToken })));
		}),

	// ---------------------------------------------------------------- G12.2 two raters, every item
	(state, next) => {
		console.log('G12.2 every item of two raters: grouped, the suggested cards, group order differs');
		postEach(state, '/api/raterItemGet', itemNumberList.map((itemNumber) => ({ itemNumber })), state.xToken, (xResponseList) =>
			postEach(state, '/api/raterItemGet', itemNumberList.map((itemNumber) => ({ itemNumber })), state.yToken, (yResponseList) => {
				const xItemList = xResponseList.map(firstOf);
				const yItemList = yResponseList.map(firstOf);
				check('both raters read all 50 items', xItemList.concat(yItemList).every((item) => item && item.cardList), xResponseList.concat(yResponseList).find((response) => response.statusCode !== 200)?.bodyText);
				const ungroupedList = xItemList.concat(yItemList).filter((item) => !isGrouped(item.cardList));
				check("in every item, each property's cards are adjacent", ungroupedList.length === 0, ungroupedList.map((item) => item.element.name).slice(0, 5).join(', '));
				const notSuggestedList = xItemList.concat(yItemList).filter((item) => sortedTupleIdTextOf(item.cardList) !== sortedTupleIdTextOf(suggestedCardListOf(item.element.elementStableId)));
				check('every item shows exactly its suggested cards, gold included', notSuggestedList.length === 0, notSuggestedList.map((item) => item.element.name).slice(0, 5).join(', '));
				const groupedItemList = xItemList.filter((item) => multiMemberRunCountOf(item.cardList) > 0);
				check(`survey B has items with a property in several classes (${groupedItemList.length})`, groupedItemList.length > 0);
				const yItemByStableId = yItemList.reduce((soFar, item) => ({ ...soFar, [item.element.elementStableId]: item }), {});
				const differingRunOrderList = groupedItemList.filter((item) => JSON.stringify(identityRunListOf(item.cardList)) !== JSON.stringify(identityRunListOf(yItemByStableId[item.element.elementStableId].cardList)));
				check(`the group order differs between the two raters (${differingRunOrderList.length} of ${groupedItemList.length} grouped items)`, differingRunOrderList.length > 0);
				next({ ...state, xItemList, yItemList, groupedItem: groupedItemList[0] });
			}),
		);
	},

	// ---------------------------------------------------------------- G12.3 the preview
	(state, next) => {
		console.log('G12.3 the preview: gather(the preview shuffle), stable, grouped');
		const previewRequestList = itemNumberList.map((itemNumber) => ({ adminAction: 'previewItem', surveyName: GROUPING_SURVEY_NAME, itemNumber }));
		postEach(state, '/api/raterAdmin', previewRequestList, state.adminToken, (firstResponseList) =>
			postEach(state, '/api/raterAdmin', previewRequestList, state.adminToken, (secondResponseList) => {
				const previewItemList = firstResponseList.map(firstOf);
				check('the admin reads all 50 preview items', previewItemList.every((item) => item && item.cardList), firstResponseList.find((response) => response.statusCode !== 200)?.bodyText);
				const expectedOrderOf = (elementStableId) => gatheredByHand(seededShuffle(suggestedCardListOf(elementStableId).slice().sort((cardA, cardB) => (cardA.cedsTupleId < cardB.cedsTupleId ? -1 : 1)), `${PREVIEW_SEED_PREFIX}${GROUPING_SURVEY_NAME}`, `cards:${elementStableId}`)).map((card) => card.cedsTupleId);
				const misorderedList = previewItemList.filter((item) => JSON.stringify(item.cardList.map((card) => card.cedsTupleId)) !== JSON.stringify(expectedOrderOf(item.element.elementStableId)));
				check('every preview item is in the preview shuffle, gathered: each group at its first member, members in shuffled order', misorderedList.length === 0, misorderedList.map((item) => item.element.name).slice(0, 5).join(', '));
				check('the preview order is the same on a second read', JSON.stringify(firstResponseList.map((response) => response.bodyText)) === JSON.stringify(secondResponseList.map((response) => response.bodyText)));
				check('every preview item is grouped', previewItemList.every((item) => isGrouped(item.cardList)));
				const creditsItem = previewItemList.find((item) => item.cardList.filter((card) => card.propertyName === 'Number of Credits Earned').length === 7);
				const creditsPositionList = creditsItem ? creditsItem.cardList.map((card, position) => (card.propertyName === 'Number of Credits Earned' ? position : null)).filter((position) => position !== null) : [];
				check(`the 7 Number of Credits Earned cards sit together (${creditsPositionList.join(',')})`, creditsPositionList.length === 7 && creditsPositionList[6] - creditsPositionList[0] === 6);
				next({ ...state, previewItemList });
			}),
		);
	},

	// ---------------------------------------------------------------- G12.4 no new or forbidden field
	(state, next) => {
		console.log('G12.4 no card gains a field');
		const allCardList = state.xItemList.concat(state.yItemList, state.previewItemList).reduce((soFar, item) => soFar.concat(item.cardList), []);
		check(`every card has exactly the rater card fields (${allCardList.length} cards)`, allCardList.every((card) => JSON.stringify(Object.keys(card)) === JSON.stringify(RATER_CARD_FIELD_LIST)));
		const forbiddenSeenList = Array.from(new Set(fieldNameListDeep(state.xItemList.concat(state.yItemList, state.previewItemList)).filter((fieldName) => FORBIDDEN_FIELD_NAME_LIST.indexOf(fieldName) !== -1)));
		check('no rater or preview payload carries a forbidden field', forbiddenSeenList.length === 0, forbiddenSeenList.join(', '));
		next(state);
	},

	// ---------------------------------------------------------------- G12.5 Best and Same inside a group
	(state, next) => {
		console.log('G12.5 Best and Same inside a group');
		const item = state.groupedItem;
		const groupMemberList = item.cardList.filter((card) => item.cardList.filter((otherCard) => propertyIdentityOf(otherCard) === propertyIdentityOf(card)).length > 1);
		const groupIdentity = propertyIdentityOf(groupMemberList[0]);
		const sameGroupList = groupMemberList.filter((card) => propertyIdentityOf(card) === groupIdentity);
		const answerSubmission = { elementStableId: item.element.elementStableId, answerKind: 'cards', bestCedsTupleId: sameGroupList[1].cedsTupleId, sameCedsTupleIdList: [sameGroupList[0].cedsTupleId], secondsOnItem: 12, searchesTyped: [] };
		post(state, '/api/raterAnswerSave', answerSubmission, state.xToken, (saveResponse) => {
			check('Best on the second member of a group, Same on the first: saved', saveResponse.statusCode === 200 && firstOf(saveResponse) && firstOf(saveResponse).saved, saveResponse.bodyText.slice(0, 160));
			post(state, '/api/raterItemGet', { itemNumber: item.itemNumber }, state.xToken, (readResponse) => {
				const savedAnswer = firstOf(readResponse) ? firstOf(readResponse).savedAnswer : null;
				check('the item reads back with that Best and Same', savedAnswer && savedAnswer.bestCedsTupleId === sameGroupList[1].cedsTupleId && JSON.stringify(savedAnswer.sameCedsTupleIdList) === JSON.stringify([sameGroupList[0].cedsTupleId]), JSON.stringify(savedAnswer));
				check('and its card order is unchanged by saving', JSON.stringify(firstOf(readResponse).cardList.map((card) => card.cedsTupleId)) === JSON.stringify(item.cardList.map((card) => card.cedsTupleId)));
				next(state);
			});
		});
	},
	(state, next) => {
		state.harness.close();
		next(state);
	},
];

const finish = () => {
	fs.rmSync(scratchDirPath, { recursive: true, force: true });
	console.log(`\n=== rater-card-grouping (revision 12) — Results: ${passCount} passed, ${failCount} failed ===`);
	process.exit(failCount === 0 ? 0 : 1);
};

runSteps(stepList, finish);
