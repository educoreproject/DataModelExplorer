'use strict';
// explorer-uris.test.js — WORKORDER-explorerUris-110926, the parts that need no graph: the Standards Explorer and the forged use-case pages carry the EDUcore URI
// of every citable thing they show, minted by the standards query core's proved minter (reached through the 'standards-query-uri-minter' access point).
//   1. explorer-uri-fields: an EDUcore URI, a node's own IRI, each named absence, the cited-element prefix, a standard's element listing;
//   2. the standards-neighbourhood access point, on a scripted graph and a stub minter: an element node, its children, its mapping's hub card and its ancestors
//      carry uri; a synthetic node (families:all, a family) carries no uri field at all; a node the minter cannot name says why (uriAbsentName); a server
//      without the minter entry says so by name on every citable node; no field other than the URI fields changes;
//   3. the forged-use-cases access point: each citation that cites an element carries citedUri; one that cites nothing carries no URI field;
//   4. standards-query-uri-minter: before the URI promise gate has passed, it refuses by name (uriServiceNotReady).
// The live twin, explorer-uris-live.test.js, proves the URIs equal the resolver's on the golden. Run: node server/test/explorer-uris.test.js

const path = require('path');

process.global = {
	getConfig: () => ({}),
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {}, color: {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const SERVER_PATH = path.join(__dirname, '..');
const uriFieldsLib = require(path.join(SERVER_PATH, 'data-model/lib/explorer-uri-fields'));
const neighbourhoodMapper = require(path.join(SERVER_PATH, 'data-model/data-mapping/mappers/standards-neighbourhood.js'))({});
const useCaseMapper = require(path.join(SERVER_PATH, 'data-model/data-mapping/mappers/forged-use-cases.js'))({});

// ---- a stub minter with the real one's interface (uriMinter.js): a card's stableId is its meaning IRI; CEDS mints; anything else is not in the manifest
const CARD_STABLE_ID = 'https://w3id.org/EDUcore/CEDStandards/hub/14.0.0.0/0000aaaa';
const FOREIGN_IRI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#Property';
const stubUriMinter = {
	uriForNode: ({ stableId, standardName }) => {
		if (stableId.startsWith('https://w3id.org/EDUcore/') && stableId.includes('/hub/')) return { uri: stableId };
		if (stableId === FOREIGN_IRI) return { uri: stableId, isOwnIri: true };
		if (standardName === 'CEDS') return { uri: `https://w3id.org/EDUcore/CEDS/14.0.0.0/${stableId}` };
		if (standardName === 'Refused') return { absentReason: 'notMintable: the segment value "" is forbidden' };
		return { absentReason: 'standardNotInManifest' };
	},
	elementListUriFor: (standardName) => (standardName === 'CEDS' ? 'https://w3id.org/EDUcore/manifest/testLabel/standards/CEDS/14.0.0.0/elements' : undefined),
};
const readyMinterAnswer = { uriMinter: stubUriMinter };
const minterAccessPointsDotD = { [uriFieldsLib.URI_MINTER_ACCESS_POINT_NAME]: (unusedQuery, callback) => callback('', readyMinterAnswer) };

console.log('\n=== explorerUris: EDUcore URIs in the Standards Explorer and the use-case citations ===\n');

// ---- 1. the fields
ok('an element of a standard: its EDUcore URI, kind edc', JSON.stringify(uriFieldsLib.uriFieldsOf({ minterAnswer: readyMinterAnswer, stableId: 'ceds:P000001', standardSourceName: 'CEDS' })) === JSON.stringify({ uri: 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:P000001', uriKind: 'edc' }));
ok('a hub card: its meaning IRI, with no standard needed', uriFieldsLib.uriFieldsOf({ minterAnswer: readyMinterAnswer, stableId: CARD_STABLE_ID, standardSourceName: undefined }).uri === CARD_STABLE_ID);
ok('another publisher\'s IRI: carried as its own, kind ownIri', uriFieldsLib.uriFieldsOf({ minterAnswer: readyMinterAnswer, stableId: FOREIGN_IRI, standardSourceName: 'CEDS' }).uriKind === 'ownIri');
ok('a standard the manifest does not hold: uriAbsentName standardNotInManifest, no uri', JSON.stringify(uriFieldsLib.uriFieldsOf({ minterAnswer: readyMinterAnswer, stableId: 'x:1', standardSourceName: 'Other' })) === JSON.stringify({ uriAbsentName: 'standardNotInManifest' }));
ok('a refused mint: the name before the forge\'s words (notMintable)', uriFieldsLib.uriFieldsOf({ minterAnswer: readyMinterAnswer, stableId: 'x:1', standardSourceName: 'Refused' }).uriAbsentName === 'notMintable');
ok('a stableId the graph does not hold: notInGraph', uriFieldsLib.uriFieldsOf({ minterAnswer: readyMinterAnswer, stableId: 'x:1', standardSourceName: undefined }).uriAbsentName === 'notInGraph');
ok('a minter not yet proved: its own name passes through', uriFieldsLib.uriFieldsOf({ minterAnswer: { uriAbsentName: 'uriServiceNotReady' }, stableId: 'ceds:P000001', standardSourceName: 'CEDS' }).uriAbsentName === 'uriServiceNotReady');
ok('a cited element: the same fields, named cited*', JSON.stringify(uriFieldsLib.prefixedUriFieldsOf('cited', { uri: 'u', uriKind: 'edc' })) === JSON.stringify({ citedUri: 'u', citedUriKind: 'edc' }) && JSON.stringify(uriFieldsLib.prefixedUriFieldsOf('cited', { uriAbsentName: 'notInGraph' })) === JSON.stringify({ citedUriAbsentName: 'notInGraph' }));
ok('a standard\'s manifest listing of its elements', uriFieldsLib.elementListUriFieldsOf({ minterAnswer: readyMinterAnswer, standardSourceName: 'CEDS' }).elementListUri.endsWith('/standards/CEDS/14.0.0.0/elements') && JSON.stringify(uriFieldsLib.elementListUriFieldsOf({ minterAnswer: readyMinterAnswer, standardSourceName: 'Other' })) === '{}');
uriFieldsLib.readUriMinter({ accessPointsDotD: {} }, (minterError, minterAnswer) => ok('a server with no minter entry: uriMinterNotLoaded, by name', !minterError && minterAnswer.uriAbsentName === 'uriMinterNotLoaded'));

// ---- a scripted graph: each named query's Cypher text answers its canned rows
const scriptedGraphFor = (mapper, rowListByQueryName, sampleParamsByQueryName) => {
	const queryNameByCypher = {};
	Object.keys(rowListByQueryName).forEach((queryName) => {
		queryNameByCypher[mapper.getCypher(queryName, sampleParamsByQueryName[queryName] || {}).cypher] = queryName;
	});
	return {
		runQuery: (cypher, params, callback) => {
			if (/db\.labels\(\)/.test(cypher)) { callback('', mapper.requiredLabelList.map((label) => ({ label }))); return; }
			const queryName = queryNameByCypher[cypher];
			if (!queryName) { callback(`scripted graph: no script for this Cypher: ${cypher.slice(0, 120)}`); return; }
			const rowList = rowListByQueryName[queryName];
			callback('', typeof rowList === 'function' ? rowList(params) : rowList);
		},
	};
};
const loadAccessPoint = ({ accessPointFileName, moduleName, neo4jDb, mapper, accessPointsDotD }) => {
	const accessPointByName = {};
	require(path.join(SERVER_PATH, 'data-model/access-points-dot-d/accessPoints.d', accessPointFileName))({
		dotD: { logList: [], library: { add: (accessPointName, serviceFunction) => { accessPointByName[accessPointName] = serviceFunction; } } },
		passThroughParameters: { neo4jDb, dataMapping: { [moduleName]: mapper }, accessPointsDotD },
	});
	return accessPointByName[moduleName];
};

// ---- 2. the Explorer
const elementRecord = { stableId: 'ceds:P000001', name: 'First Name', labelList: ['ForgedNode', 'DmeProperty'], hubName: null, description: 'A name.', path: null, contextText: null, releaseIndependentId: null, definitionDigest: 'd', rootStableId: 'https://w3id.org/CEDStandards/terms/', rootName: 'CEDS', standardKey: 'ceds', standardFamily: 'CEDS', releaseLabel: 'CEDS', version: '14.0.0.0' };
const childRecord = (stableId, name) => ({ stableId, name, labelList: ['ForgedNode', 'DmeOptionValue'], hubName: null, description: '', hasStructuralChildren: false, releaseIndependentId: null, mappingList: [] });
const sourceRowList = [
	{ stableId: 'ceds:P000001', standardSourceName: 'CEDS' },
	{ stableId: 'ceds:P000002', standardSourceName: 'CEDS' },
	{ stableId: 'other:1', standardSourceName: 'Other' },
	{ stableId: 'https://w3id.org/CEDStandards/terms/', standardSourceName: 'CEDS', isStandardRoot: true },
	{ stableId: 'ceds:C000001', standardSourceName: 'CEDS' },
];
const neighbourhoodRows = {
	familyCatalog: [{ standardFamily: 'CEDS', standardCount: 1, releaseCount: 1, classCount: 2, versionList: [{ releaseLabel: 'CEDS', version: '14.0.0.0', classCount: 2 }] }],
	nodeByStableId: [elementRecord],
	childGroupsByStableId: [{ relationshipType: 'HAS_VALUE', itemCount: 3, itemList: [childRecord('ceds:P000002', 'Child'), childRecord('other:1', 'Unmintable'), childRecord('ghost:1', 'Not in the graph')] }],
	mappingsByStableId: [{ mappingRowList: [{ matchEdgeType: 'EXACT_MATCH', mappingConfidence: 0.9, mappingSource: 'test', anchorStableId: CARD_STABLE_ID, anchorName: 'First Name', anchorHubName: 'CEDS', anchorStandardFamily: 'CEDS', subjectStableId: 'ceds:P000001' }], occurrenceStableIdList: [] }],
	ancestorChainsByStableId: [{ chainNodeList: [{ stableId: 'https://w3id.org/CEDStandards/terms/', name: 'CEDS', labelList: ['DmeStandardRoot'], hubName: 'CEDS' }, { stableId: 'ceds:C000001', name: 'Person', labelList: ['DmeClass'], hubName: 'CEDS' }, { stableId: 'ceds:P000001', name: 'First Name', labelList: ['DmeProperty'], hubName: 'CEDS' }] }],
	versionPeerRoots: [],
	sourceNameByStableIdList: (params) => sourceRowList.filter((oneRow) => params.stableIdList.includes(oneRow.stableId)),
};
const neighbourhoodSampleParams = { nodeByStableId: { stableId: 'x' }, childGroupsByStableId: { stableId: 'x' }, mappingsByStableId: { stableId: 'x' }, ancestorChainsByStableId: { stableId: 'x' }, versionPeerRoots: { standardKey: 'x' }, sourceNameByStableIdList: { stableIdList: [] } };

const explorerAccessPointWith = (accessPointsDotD) => loadAccessPoint({ accessPointFileName: 'standards-neighbourhood.js', moduleName: 'standards-neighbourhood', neo4jDb: scriptedGraphFor(neighbourhoodMapper, neighbourhoodRows, neighbourhoodSampleParams), mapper: neighbourhoodMapper, accessPointsDotD });
const explorerAccessPoint = explorerAccessPointWith(minterAccessPointsDotD);
const URI_FIELD_NAME_LIST = ['uri', 'uriKind', 'uriAbsentName', 'elementListUri'];
const withoutUriFields = (answerValue) => JSON.parse(JSON.stringify(answerValue, (fieldName, fieldValue) => (URI_FIELD_NAME_LIST.includes(fieldName) ? undefined : fieldValue)));

const stepList = [
	(done) => explorerAccessPoint({ action: 'node', stableId: 'ceds:P000001' }, (nodeError, neighbourhood) => {
		ok('explorer: the node action answers', !nodeError, nodeError);
		if (nodeError) { done(); return; }
		const childList = neighbourhood.childGroupList[0].itemList;
		ok('explorer: an element node carries its EDUcore URI', neighbourhood.node.uri === 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:P000001' && neighbourhood.node.uriKind === 'edc', JSON.stringify(neighbourhood.node));
		ok('explorer: a child item carries its URI', childList[0].uri === 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:P000002');
		ok('explorer: a child the minter cannot name says why, with no uri', childList[1].uri === undefined && childList[1].uriAbsentName === 'standardNotInManifest');
		ok('explorer: a child the graph does not hold says notInGraph', childList[2].uriAbsentName === 'notInGraph');
		ok('explorer: a mapping\'s hub card carries its meaning IRI', neighbourhood.mappingList[0].anchor.uri === CARD_STABLE_ID);
		ok('explorer: the ancestors carry their URIs', neighbourhood.ancestorList.length === 2 && neighbourhood.ancestorList.every((oneAncestor) => typeof oneAncestor.uri === 'string'), JSON.stringify(neighbourhood.ancestorList));
		ok('explorer: a standard root carries its manifest element listing', neighbourhood.ancestorList[0].kind === 'standard' && /\/elements$/.test(neighbourhood.ancestorList[0].elementListUri || ''), JSON.stringify(neighbourhood.ancestorList[0]));
		explorerAccessPointWith({})({ action: 'node', stableId: 'ceds:P000001' }, (plainError, plainNeighbourhood) => {
			ok('explorer: with and without a minter the answers differ only in the URI fields', !plainError && JSON.stringify(withoutUriFields(neighbourhood)) === JSON.stringify(withoutUriFields(plainNeighbourhood)) && !JSON.stringify(withoutUriFields(neighbourhood)).includes('w3id.org/EDUcore/CEDS/'), plainError);
			done();
		});
	}),
	(done) => explorerAccessPoint({ action: 'node', stableId: neighbourhoodMapper.FAMILY_CATALOG_STABLE_ID }, (catalogError, neighbourhood) => {
		ok('explorer: families:all answers', !catalogError, catalogError);
		if (catalogError) { done(); return; }
		const familyItem = neighbourhood.childGroupList[0].itemList[0];
		ok('explorer: a synthetic node (families:all) carries no uri field at all', !('uri' in neighbourhood.node) && !('uriAbsentName' in neighbourhood.node), JSON.stringify(neighbourhood.node));
		ok('explorer: a synthetic item (family:CEDS) carries no uri field at all', familyItem.stableId === 'family:CEDS' && !('uri' in familyItem) && !('uriAbsentName' in familyItem), JSON.stringify(familyItem));
		done();
	}),
	(done) => explorerAccessPointWith({})({ action: 'node', stableId: 'ceds:P000001' }, (nodeError, neighbourhood) => {
		ok('explorer: with no minter entry every citable node says uriMinterNotLoaded, and the page still answers', !nodeError && neighbourhood.node.uriAbsentName === 'uriMinterNotLoaded' && neighbourhood.childGroupList[0].itemList.every((oneItem) => oneItem.uriAbsentName === 'uriMinterNotLoaded'), nodeError || JSON.stringify(neighbourhood.node));
		done();
	}),
	(done) => explorerAccessPointWith({ [uriFieldsLib.URI_MINTER_ACCESS_POINT_NAME]: (unusedQuery, callback) => callback('', { uriAbsentName: 'uriServiceNotReady' }) })({ action: 'node', stableId: 'ceds:P000001' }, (nodeError, neighbourhood) => {
		ok('explorer: before the gate passes, every citable node says uriServiceNotReady', !nodeError && neighbourhood.node.uriAbsentName === 'uriServiceNotReady' && neighbourhood.mappingList[0].anchor.uriAbsentName === 'uriServiceNotReady', nodeError || JSON.stringify(neighbourhood.node));
		done();
	}),

	// ---- 3. the use cases
	(done) => {
		const useCaseRows = {
			caseByStableId: [{ caseStableId: 'uc:case-1', caseName: 'A case' }],
			caseStepList: [],
			caseCitationList: [
				{ referenceStableId: 'uc:ref-1', referenceName: 'First name', citedStandard: 'CEDS', citedIdentifier: 'P000001', citedStableId: 'ceds:P000001', citedName: 'First Name', citedSource: 'CEDS', reachedByList: [] },
				{ referenceStableId: 'uc:ref-2', referenceName: 'Shoe size', citedStandard: 'CEDS', citedIdentifier: 'P999999', citedStableId: null, citedName: null, citedSource: null, reachedByList: [] },
			],
			caseContextList: [],
			caseImplementationGuide: [{ citedStableId: 'ceds:P000001', citedName: 'First Name', citedRole: 'DmeProperty', citedSource: 'CEDS', standard: 'EdFi', relation: 'EXACT_MATCH', elementCount: 2 }],
		};
		const caseParams = { caseStableId: 'x' };
		const useCaseAccessPoint = loadAccessPoint({ accessPointFileName: 'forged-use-cases.js', moduleName: 'forged-use-cases', neo4jDb: scriptedGraphFor(useCaseMapper, useCaseRows, { caseByStableId: caseParams, caseStepList: caseParams, caseCitationList: caseParams, caseContextList: caseParams, caseImplementationGuide: caseParams }), mapper: useCaseMapper, accessPointsDotD: minterAccessPointsDotD });
		useCaseAccessPoint({ action: 'case', caseStableId: 'uc:case-1' }, (caseError, caseDetail) => {
			ok('use case: the case action answers', !caseError, caseError);
			if (caseError) { done(); return; }
			ok('use case: a citation that cites an element carries citedUri', caseDetail.citationList[0].citedUri === 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:P000001' && caseDetail.citationList[0].citedUriKind === 'edc', JSON.stringify(caseDetail.citationList[0]));
			ok('use case: a citation that cites nothing carries no URI field', !Object.keys(caseDetail.citationList[1]).some((fieldName) => fieldName.startsWith('citedUri')), JSON.stringify(caseDetail.citationList[1]));
			ok('use case: the implementation guide\'s cited elements carry citedUri', caseDetail.implementationGuide.citedElementList[0].citedUri === 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:P000001' && caseDetail.implementationGuide.standardList[0].citedElementList[0].citedUri === 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:P000001', JSON.stringify(caseDetail.implementationGuide));
			done();
		});
	},

	// ---- 4. the minter entry, before the gate: the access point is built with a forge config that will not open, so its gate never runs
	(done) => {
		const accessPointByName = {};
		require(path.join(SERVER_PATH, 'data-model/access-points-dot-d/accessPoints.d/standards-query.js'))({
			dotD: { logList: [], library: { add: (accessPointName, serviceFunction) => { accessPointByName[accessPointName] = serviceFunction; } } },
			passThroughParameters: { neo4jDb: null, sqlDb: { getTable: (tableName, callback) => callback('no table in this test') } },
		});
		const minterEntry = accessPointByName[uriFieldsLib.URI_MINTER_ACCESS_POINT_NAME];
		ok('standards-query-uri-minter: registered beside standards-query', typeof minterEntry === 'function' && typeof accessPointByName['standards-query'] === 'function', Object.keys(accessPointByName).join(', '));
		if (typeof minterEntry !== 'function') { done(); return; }
		minterEntry({}, (minterError, minterAnswer) => {
			ok('standards-query-uri-minter: before the gate passes it refuses by name (uriServiceNotReady), with no minter', !minterError && minterAnswer.uriAbsentName === 'uriServiceNotReady' && minterAnswer.uriMinter === undefined, minterError || JSON.stringify(minterAnswer));
			done();
		});
	},
];

const runNext = (stepIndex) => {
	if (stepIndex === stepList.length) {
		console.log(`\n${passed} passed, ${failed} failed`);
		process.exit(failed ? 1 : 0);
	}
	stepList[stepIndex](() => runNext(stepIndex + 1));
};
runNext(0);
