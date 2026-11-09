'use strict';
// explorer-uris-live.test.js — WORKORDER-explorerUris-110926 on the LIVE golden and the real URI store: the access points built as the server builds them (the
// standards-query access point, whose core proves the URI promise; standards-neighbourhood; forged-use-cases; edc-resolver), nothing stubbed but the usage table.
//   1. standards-query-uri-minter answers { uriMinter } once the gate has passed;
//   2. walked through the Explorer from families:all, a CEDS, a CTDL and an Ed-Fi element each carry uri, and each URI EQUALS what the local resolver
//      answers for it: the resolver, asked the URI's own path, answers 200 with that same URI as the element it names;
//   3. a mapping's hub card carries its meaning IRI, which the resolver answers as that meaning;
//   4. families:all and a family node, both synthetic, carry no uri field;
//   5. a use case's resolved citations carry citedUri, each resolving to the cited element;
//   6. with BASELINE_SERVER_PATH set (a tree of the branch base), every answer walked here equals the base's answer once the URI fields are taken out:
//      nothing but uri, uriKind, uriAbsentName and elementListUri was added, and nothing changed.
// Needs the local golden and the qbook config; with no graph it SKIPs by name. Run: node server/test/explorer-uris-live.test.js
// (SUBJECT_SERVER_PATH=<another tree's server dir> runs the same gates on that tree's access points.)

const path = require('path');
const { Writable } = require('stream');

const configFileProcessor = require('qtools-config-file-processor');
const qbookConfig = configFileProcessor.getConfig('startApiServer.ini', path.join(__dirname, '..', '..', '..', 'configs', 'instanceSpecific', 'qbook'), { resolve: true });
const EDC_CONFIG_VALUES = { directBlockMaxBytes: 536870912, directBlockTimeoutMilliseconds: 600000, directBlockSqliteCommandPath: '/usr/bin/sqlite3', sizeRefusalContactAddress: 'contact@explorerUris.example', ...qbookConfig['edc-resolver'] }; // the configs tree may predate the block values; nothing here reads a block
// rosetta-fuse and rosetta-judge are left empty, so the access point turns Rosetta off by name and opens no Rosetta store
const configValuesBySection = { 'edc-resolver': EDC_CONFIG_VALUES, 'standards-query-limits': qbookConfig['standards-query-limits'], 'mcp-server': qbookConfig['mcp-server'], 'rosetta-fuse': {}, 'rosetta-judge': {} };
process.global = {
	getConfig: (sectionName) => configValuesBySection[sectionName] || {},
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {}, color: {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const { readGoldenContainerName } = require('./lib/goldenContainerName');
const { resolveContainerConnection } = require('../data-model/lib/user-graph/container-connection-resolver');
const neo4jInstanceFactory = require('../data-model/lib/neo4j-instance/neo4j-instance');
const { createGoldenGraphHandle, GOLDEN_RETRY_DELAY_MS_LIST } = require('../data-model/lib/neo4j-instance/golden-graph-handle');
const { openForgeAdapter } = require('../lib/edc-resolver/forgeAdapter');
const { URI_MINTER_ACCESS_POINT_NAME } = require('../data-model/lib/explorer-uri-fields');

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};
const finish = () => {
	console.log(`\n${passed} passed, ${failed} failed`);
	process.exit(failed ? 1 : 0);
};

const GATE_WAIT_MILLISECONDS = 250;
const GATE_WAIT_LIMIT = 480;
const FAMILY_NAME_LIST = ['CEDS', 'CTDL', 'EdFi'];
const ELEMENT_KIND_LIST = ['property', 'instance', 'hubProperty', 'optionValue'];
const URI_FIELD_NAME_LIST = ['uri', 'uriKind', 'uriAbsentName', 'elementListUri'];
const withoutUriFields = (answerValue) => JSON.parse(JSON.stringify(answerValue, (fieldName, fieldValue) => (URI_FIELD_NAME_LIST.includes(fieldName) ? undefined : fieldValue)));

const goldenContainerName = readGoldenContainerName();
if (resolveContainerConnection(goldenContainerName).error) {
	console.log(`  SKIP: no reachable golden (${goldenContainerName}); this live test proved nothing`);
	process.exit(0);
}
const goldenHandle = createGoldenGraphHandle({ goldenContainerName, queryTimeoutMs: 60000, retryDelayMsList: GOLDEN_RETRY_DELAY_MS_LIST, resolveConnectionFresh: (containerName, callback) => callback('', resolveContainerConnection(containerName)), neo4jGen: neo4jInstanceFactory({ unused: true }) });
const forgeAdapter = openForgeAdapter({ configValues: EDC_CONFIG_VALUES });
if (forgeAdapter.refusalText) {
	console.log(`  FAIL: the forge adapter would not open: ${forgeAdapter.refusalText}`);
	process.exit(1);
}

// the access points as access-points-dot-d builds them, into one library
const accessPointLibraryFor = (serverPath) => {
	const accessPointByName = {};
	const dotD = { logList: [], library: { add: (accessPointName, serviceFunction) => { accessPointByName[accessPointName] = serviceFunction; } } };
	const dataMapping = {
		'standards-neighbourhood': require(path.join(serverPath, 'data-model/data-mapping/mappers/standards-neighbourhood.js'))({}),
		'forged-use-cases': require(path.join(serverPath, 'data-model/data-mapping/mappers/forged-use-cases.js'))({}),
	};
	const passThroughParameters = { neo4jDb: goldenHandle, dataMapping, sqlDb: { getTable: (tableName, callback) => callback('explorer-uris-live: no usage table in this test') }, accessPointsDotD: accessPointByName };
	['standards-query', 'standards-neighbourhood', 'forged-use-cases', 'edc-resolver'].forEach((fileName) => require(path.join(serverPath, 'data-model/access-points-dot-d/accessPoints.d', `${fileName}.js`))({ dotD, passThroughParameters }));
	return accessPointByName;
};
// SUBJECT_SERVER_PATH runs these gates on another tree (eg the branch base, to watch them fail there)
const branchLibrary = accessPointLibraryFor(process.env.SUBJECT_SERVER_PATH || path.join(__dirname, '..'));
const baselineLibrary = process.env.BASELINE_SERVER_PATH ? accessPointLibraryFor(process.env.BASELINE_SERVER_PATH) : null;

const explorerNode = (stableId, callback) => branchLibrary['standards-neighbourhood']({ action: 'node', stableId }, callback);
// the local resolver asked a URI's own path, as the /edc/ route hands it: { httpStatus, body }
const resolveUri = (uriText, callback) => {
	if (!uriText.startsWith(forgeAdapter.baseIri)) {
		callback({ httpStatus: 0, body: { error: `not under the EDUcore base ${forgeAdapter.baseIri}` } });
		return;
	}
	branchLibrary['edc-resolver']({ edcRequestPath: `/${uriText.slice(forgeAdapter.baseIri.length)}`, answerFormat: 'json', whenClientGone: () => {} }, (resolveError, resolverAnswer) => {
		if (resolveError) { callback({ httpStatus: 0, body: { error: resolveError } }); return; }
		if (!resolverAnswer.deliverTo) {
			callback({ httpStatus: resolverAnswer.httpStatus, body: resolverAnswer.bodyText ? JSON.parse(resolverAnswer.bodyText) : {} });
			return;
		}
		// an element with many siblings is answered by the resolver's child, streamed as the /edc/ route streams it
		const chunkList = [];
		const responseSink = new Writable({ write: (chunk, encoding, written) => { chunkList.push(chunk); written(); } });
		responseSink.on('finish', () => callback({ httpStatus: resolverAnswer.httpStatus, body: JSON.parse(Buffer.concat(chunkList).toString('utf8')) }));
		resolverAnswer.deliverTo(responseSink);
	});
};

// steps run one after another
const stepList = [];
const visitedRequestList = [];

// the golden handle connects in the background, as the server's does
stepList.push((done) => {
	const waitConnected = (tryCount) => {
		if (goldenHandle.graphStateOf().graphState === 'connected') { done(); return; }
		if (tryCount >= GATE_WAIT_LIMIT) { ok('the golden handle connects within the wait', false, JSON.stringify(goldenHandle.graphStateOf())); finish(); return; }
		setTimeout(() => waitConnected(tryCount + 1), GATE_WAIT_MILLISECONDS);
	};
	waitConnected(0);
});

// ---- 1. the minter entry, once the gate has passed
stepList.push((done) => {
	if (typeof branchLibrary[URI_MINTER_ACCESS_POINT_NAME] !== 'function') {
		ok('standards-query-uri-minter: registered beside standards-query', false, Object.keys(branchLibrary).join(', '));
		done();
		return;
	}
	const askMinter = (tryCount) => branchLibrary[URI_MINTER_ACCESS_POINT_NAME]({}, (minterError, minterAnswer) => {
		if (!minterError && minterAnswer.uriMinter) {
			ok('standards-query-uri-minter: answers the proved minter once the gate has passed', typeof minterAnswer.uriMinter.uriForNode === 'function');
			done();
			return;
		}
		if (tryCount >= GATE_WAIT_LIMIT) {
			ok('standards-query-uri-minter: the gate passed within the wait', false, minterError || JSON.stringify(minterAnswer));
			finish();
			return;
		}
		setTimeout(() => askMinter(tryCount + 1), GATE_WAIT_MILLISECONDS);
	});
	askMinter(0);
});

// ---- 4. the synthetic nodes
stepList.push((done) => explorerNode('families:all', (nodeError, neighbourhood) => {
	visitedRequestList.push({ action: 'node', stableId: 'families:all' });
	ok('families:all answers', !nodeError, nodeError);
	if (nodeError) { finish(); return; }
	const familyItemList = neighbourhood.childGroupList[0].itemList;
	ok('families:all (synthetic) carries no uri field', !('uri' in neighbourhood.node) && !('uriAbsentName' in neighbourhood.node), JSON.stringify(neighbourhood.node));
	ok('its family items (synthetic) carry no uri field', familyItemList.length > 0 && familyItemList.every((oneItem) => !('uri' in oneItem) && !('uriAbsentName' in oneItem)));
	FAMILY_NAME_LIST.forEach((familyName) => ok(`the graph holds the ${familyName} family`, familyItemList.some((oneItem) => oneItem.name === familyName), familyItemList.map((oneItem) => oneItem.name).join(', ')));
	done();
}));

// ---- 2 and 3. from each family, down the first openable items to an element
const walkToElement = (familyName, done) => {
	const familyStableId = `family:${familyName}`;
	const walkedList = [];
	const descend = (stableId, depth) => explorerNode(stableId, (nodeError, neighbourhood) => {
		visitedRequestList.push({ action: 'node', stableId });
		if (nodeError || depth > 8) { done(nodeError || 'too deep', null); return; }
		walkedList.push(neighbourhood);
		const itemList = neighbourhood.childGroupList.flatMap((oneGroup) => oneGroup.itemList);
		const elementItem = itemList.find((oneItem) => ELEMENT_KIND_LIST.includes(oneItem.kind) && (oneItem.mapping || oneItem.hubElementCount > 0));
		if (elementItem) { done('', { neighbourhood, elementItem, walkedList }); return; }
		const nextItem = itemList.find((oneItem) => oneItem.hasChildren);
		if (!nextItem) { done(`nothing to open under ${stableId}`, null); return; }
		descend(nextItem.stableId, depth + 1);
	});
	descend(familyStableId, 0);
};

const resolvedSampleList = [];
FAMILY_NAME_LIST.forEach((familyName) => stepList.push((done) => walkToElement(familyName, (walkError, walkResult) => {
	ok(`${familyName}: the Explorer reaches a mapped element`, !walkError, walkError);
	if (walkError) { done(); return; }
	const { neighbourhood, elementItem, walkedList } = walkResult;
	ok(`${familyName}: the family node (synthetic) carries no uri`, !('uri' in walkedList[0].node), JSON.stringify(walkedList[0].node).slice(0, 200));
	ok(`${familyName}: the element ${elementItem.stableId} carries an EDUcore uri`, typeof elementItem.uri === 'string' && elementItem.uriKind === 'edc', JSON.stringify(elementItem).slice(0, 300));
	ok(`${familyName}: the focus ${neighbourhood.node.stableId} carries an EDUcore uri`, typeof neighbourhood.node.uri === 'string', JSON.stringify(neighbourhood.node).slice(0, 300));
	const standardNode = walkedList.map((oneNeighbourhood) => oneNeighbourhood.node).find((oneNode) => oneNode.kind === 'standard');
	ok(`${familyName}: its standard's root carries its manifest element listing`, standardNode && /\/manifest\/[^/]+\/standards\/.+\/elements$/.test(standardNode.elementListUri || ''), standardNode ? JSON.stringify(standardNode).slice(0, 300) : 'no standard node walked');
	resolvedSampleList.push({ sampleName: `${familyName} element`, uri: elementItem.uri, answerFieldName: 'element' });
	resolvedSampleList.push({ sampleName: `${familyName} focus`, uri: neighbourhood.node.uri, answerFieldName: 'element' });
	if (elementItem.mapping) {
		resolvedSampleList.push({ sampleName: `${familyName} mapping's hub card`, uri: elementItem.mapping.anchor.uri, answerFieldName: 'meaning' });
		done();
		return;
	}
	// a hub's own property maps to nothing: its hub cards are its children (USED_BY_HUB_ELEMENT)
	explorerNode(elementItem.stableId, (nodeError, elementNeighbourhood) => {
		visitedRequestList.push({ action: 'node', stableId: elementItem.stableId });
		const cardItem = nodeError ? null : elementNeighbourhood.childGroupList.flatMap((oneGroup) => oneGroup.itemList).find((oneItem) => oneItem.kind === 'hubAnchor');
		ok(`${familyName}: the hub property ${elementItem.stableId} lists a hub card that carries a uri`, cardItem && typeof cardItem.uri === 'string', nodeError || JSON.stringify(cardItem || {}).slice(0, 200));
		if (cardItem) {
			resolvedSampleList.push({ sampleName: `${familyName} hub card`, uri: cardItem.uri, answerFieldName: 'meaning' });
		}
		done();
	});
})));

// each URI the Explorer gave EQUALS what the local resolver answers for it
stepList.push((done) => {
	const resolveNext = (sampleIndex) => {
		if (sampleIndex === resolvedSampleList.length) { done(); return; }
		const { sampleName, uri, answerFieldName } = resolvedSampleList[sampleIndex];
		resolveUri(uri || '', ({ httpStatus, body }) => {
			ok(`${sampleName}: the resolver answers 200 for ${uri}, naming that same URI as its ${answerFieldName}`, httpStatus === 200 && body[answerFieldName] === uri, `${httpStatus} ${JSON.stringify(body).slice(0, 300)}`);
			resolveNext(sampleIndex + 1);
		});
	};
	resolveNext(0);
});

// ---- 5. a use case's citations
stepList.push((done) => branchLibrary['forged-use-cases']({ action: 'list' }, (listError, caseListAnswer) => {
	ok('use cases: the list answers', !listError && caseListAnswer.caseList.length > 0, listError);
	if (listError || !caseListAnswer.caseList.length) { done(); return; }
	const caseStableId = caseListAnswer.caseList[0].caseStableId;
	branchLibrary['forged-use-cases']({ action: 'case', caseStableId }, (caseError, caseDetail) => {
		ok(`use case ${caseStableId}: the case answers`, !caseError, caseError);
		if (caseError) { done(); return; }
		const citedList = caseDetail.citationList.filter((oneCitation) => oneCitation.citedStableId);
		ok(`use case ${caseStableId}: every citation that cites an element carries citedUri (${citedList.length})`, citedList.length > 0 && citedList.every((oneCitation) => typeof oneCitation.citedUri === 'string'), JSON.stringify(citedList.find((oneCitation) => !oneCitation.citedUri) || {}).slice(0, 300));
		ok(`use case ${caseStableId}: a citation that cites nothing carries no URI field`, caseDetail.citationList.filter((oneCitation) => !oneCitation.citedStableId).every((oneCitation) => !Object.keys(oneCitation).some((fieldName) => fieldName.startsWith('citedUri'))));
		const resolveNext = (citationIndex) => {
			if (citationIndex === Math.min(citedList.length, 5)) { done(); return; }
			const oneCitation = citedList[citationIndex];
			resolveUri(oneCitation.citedUri || '', ({ httpStatus, body }) => {
				ok(`use case citation ${oneCitation.citedSource} ${oneCitation.citedName}: the resolver answers 200 for ${oneCitation.citedUri}, naming that URI`, httpStatus === 200 && body.element === oneCitation.citedUri, `${httpStatus} ${JSON.stringify(body).slice(0, 200)}`);
				resolveNext(citationIndex + 1);
			});
		};
		resolveNext(0);
	});
}));

// ---- 6. against the branch base: nothing but the URI fields differs
stepList.push((done) => {
	if (!baselineLibrary) {
		console.log('  NOTE: BASELINE_SERVER_PATH unset; the comparison with the branch base did not run');
		done();
		return;
	}
	const compareNext = (requestIndex) => {
		if (requestIndex === visitedRequestList.length) { done(); return; }
		const oneRequest = visitedRequestList[requestIndex];
		branchLibrary['standards-neighbourhood'](oneRequest, (branchError, branchAnswer) => baselineLibrary['standards-neighbourhood'](oneRequest, (baseError, baseAnswer) => {
			ok(`against the base: ${oneRequest.stableId} differs only in the URI fields`, !branchError && !baseError && JSON.stringify(withoutUriFields(branchAnswer)) === JSON.stringify(baseAnswer), branchError || baseError);
			compareNext(requestIndex + 1);
		}));
	};
	compareNext(0);
});

const runNext = (stepIndex) => {
	if (stepIndex === stepList.length) { finish(); return; }
	stepList[stepIndex](() => runNext(stepIndex + 1));
};
runNext(0);
