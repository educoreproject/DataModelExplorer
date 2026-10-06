#!/usr/bin/env node
'use strict';

// user-layer-contract.test.js — gate for campaign P2 W-E-5/6/7 (V2-C19/C20/C21; V2-S30..S36; ruling A12: a user links by
// stableId to a declaration role, the user layer is TEXT-ONLY, the four match relation types are REFUSED to users).
// HERMETIC: a Neo4j double records every statement and answers from fixtures; the rules are read from the DME's shipped
// contract/graphContract.json, so the gate cannot drift from the contract it tests.
//
// PROVES:
//   (a) connectToStandard binds (s:ForgedNode {stableId}) filtered by the contract's linkableRoleList, with any standard's
//       stableId (an Ed-Fi one here)
//   (b) a payload carrying uri / standardUri / standardKey is refused by name, as is selector.uri on modify and delete
//   (c) EXACT_MATCH / CLOSE_MATCH / BROAD_MATCH / NARROW_MATCH are refused on both link verbs before any statement runs
//   (d) both link verbs SET the declared stamp — exactly userEdgeStampFieldList, userAuthored true, the signed-in
//       userRefId — and refuse when userRefId is absent
//   (e) createNode writes no vector and needs no Voyage key; the embedding migration refuses, naming textOnly
//   (f) re-emit captures edges BY STAMP (a standard->standard user edge survives), names standards by stableId on
//       :ForgedNode, carries no vector, writes 'standardKeyName: stableId', and refuses without goldenVersionAuthoredAgainst
//   (g) replay of a serializer-1 script (standardKeyName: uri) rewrites its standard endpoints to :ForgedNode {stableId},
//       stamps the legacy unstamped edges with the owner, strips old vectors; an unknown key or a key-less script is refused
//   (h) the user read/write provider texts name stableId, the linkable roles and the refused relations, and never '18',
//       'voyage' or a uri; the write CLI sends standardStableId
//   (i) dme-user-graph-save records the clone passport's manifestRefId as goldenVersionAuthoredAgainst (refusing when the
//       passport names none) and stamps the text-only policy, not a model
// RED TWINS (in memory, test/lib/moduleWithStubs.js), one per conjunct:
//   roleFilterDropped (a), retiredPayloadAccepted (b), matchRelationAllowed (c), stampLacksUserAuthored (d),
//   vectorStampWritten (e), captureByEndpointLabel (f), retiredKeyNotRewritten (g), cliSendsUri (h),
//   goldenVersionNotRecorded (i).
//
//   node server/test/user-layer-contract.test.js

const fs = require('fs');
const path = require('path');
const { loadWithStubs } = require('./lib/moduleWithStubs');

const REPO_ROOT_PATH = path.join(__dirname, '..', '..');
const USER_GRAPH_DIR_PATH = path.join(REPO_ROOT_PATH, 'server', 'data-model', 'lib', 'user-graph');
const MODULE_PATH_BY_TARGET = {
	contract: path.join(USER_GRAPH_DIR_PATH, 'user-layer-contract.js'),
	writeExecutor: path.join(USER_GRAPH_DIR_PATH, 'write-executor.js'),
	reEmit: path.join(USER_GRAPH_DIR_PATH, 're-emit.js'),
	migration: path.join(USER_GRAPH_DIR_PATH, 'embedding-migration.js'),
	saveAccessPoint: path.join(REPO_ROOT_PATH, 'server', 'data-model', 'access-points-dot-d', 'accessPoints.d', 'dme-user-graph-save.js'),
};
const TEXT_PATH_BY_TARGET = {
	writeProvider: path.join(REPO_ROOT_PATH, 'cli', 'lib.d', 'dme-user-write', 'provider.json'),
	readProvider: path.join(REPO_ROOT_PATH, 'cli', 'lib.d', 'dme-user-read', 'provider.json'),
	writeCli: path.join(REPO_ROOT_PATH, 'cli', 'lib.d', 'dme-user-write', 'dmeUserWriteTool.js'),
};
const { contract } = require('../../cli/lib.d/data-model-explorer/lib/graphContract');
const LINK_RULE = contract.userLinkTargetRule;
const STAMP_FIELD_LIST = contract.userEdgeStampFieldList;
const MATCH_RELATION_TYPE_LIST = contract.userEdgeRule.matchRelationTypeList;

if (!process.global) {
	process.global = { xLog: { status: () => {}, error: () => {}, verbose: () => {} }, getConfig: () => ({}) };
}

// ---------------------------------------------------------------------------
// module assembly: a target with mutations is compiled in memory; the contract module, when mutated, is handed to its
// consumers as a stub so the twin reaches them. With no mutations every module loads for real.
const mutationsFor = (mutationList, target) => mutationList.filter((oneMutation) => oneMutation.target === target);
const modulesFor = (mutationList) => {
	const contractMutationList = mutationsFor(mutationList, 'contract');
	const contractStubMap = contractMutationList.length > 0 ? { './user-layer-contract': loadWithStubs({ modulePath: MODULE_PATH_BY_TARGET.contract, mutationList: contractMutationList }) } : {};
	const loadTarget = (target, stubByRequestPath) => {
		const ownMutationList = mutationsFor(mutationList, target);
		return ownMutationList.length === 0 && Object.keys(stubByRequestPath).length === 0
			? require(MODULE_PATH_BY_TARGET[target])
			: loadWithStubs({ modulePath: MODULE_PATH_BY_TARGET[target], mutationList: ownMutationList, stubByRequestPath });
	};
	const writeExecutor = loadTarget('writeExecutor', contractStubMap);
	const reEmit = loadTarget('reEmit', contractStubMap);
	return { writeExecutor, reEmit, loadTarget, contractStubMap };
};
const textFor = (mutationList, target) => mutationsFor(mutationList, target).reduce((soFar, oneMutation) => soFar.replace(oneMutation.find, () => oneMutation.replace), fs.readFileSync(TEXT_PATH_BY_TARGET[target], 'utf8'));

// a Neo4j double: records each statement, answers from responder(cypher, params)
const fakeDbFor = (responder) => {
	const statementList = [];
	return {
		statementList,
		runQuery: (cypher, params, callback) => {
			statementList.push({ cypher, params });
			const rowList = responder(cypher, params);
			setImmediate(() => callback('', rowList));
		},
		close: () => {},
	};
};
const linkedRowResponder = () => [{ relType: 'ALIGNS_WITH', targetStableId: 'edfi-stable-1', isUser: true }];

// run a list of executeWrite calls in order, collecting { err, result, statementList } each
const writeEach = (writeExecutor, callList, done) => {
	const outcomeList = [];
	const nextCall = (callIndex) => {
		if (callIndex >= callList.length) { done(outcomeList); return; }
		const fakeDb = fakeDbFor(linkedRowResponder);
		writeExecutor.executeWrite({ userGraphDb: fakeDb, ...callList[callIndex] }, (err, result) => {
			outcomeList.push({ err: err || '', result, statementList: fakeDb.statementList });
			nextCall(callIndex + 1);
		});
	};
	nextCall(0);
};

// ---------------------------------------------------------------------------
// fixtures
const STAMP_FIXTURE = { userAuthored: true, userRefId: 'owner1', userEdgeRefId: 'edge1', authoredAt: '2026-10-06T00:00:00.000Z' };
const NODE_ROW_LIST = [
	{ userNodeId: 'graphInit', labels: ['UserContent', 'UserGraphIdentity'], props: { userNodeId: 'graphInit', name: 'v1' } },
	{ userNodeId: 'u1', labels: ['UserContent', 'Course'], props: { userNodeId: 'u1', name: 'Algebra', embedding: [0.1, 0.2], embeddingModelVersion: 'voyage-3' } },
];
const REL_ROW_LIST = [
	{ aUser: 'u1', aKey: null, aIsUser: true, relType: 'ALIGNS_WITH', relProps: STAMP_FIXTURE, bUser: null, bKey: 'edfi-stable-1', bIsUser: false },
	{ aUser: 'u1', aKey: null, aIsUser: true, relType: 'PART_OF', relProps: STAMP_FIXTURE, bUser: 'graphInit', bKey: null, bIsUser: true },
	{ aUser: null, aKey: 'ceds-stable-1', aIsUser: false, relType: 'USER_SAYS_RELATED', relProps: STAMP_FIXTURE, bUser: null, bKey: 'sif-stable-1', bIsUser: false },
];
const layerResponder = (cypher) => {
	if (/MATCH \(n:UserContent\) RETURN n\.userNodeId/.test(cypher)) return NODE_ROW_LIST;
	if (/MATCH \(a\)-\[r\]->\(b\)/.test(cypher) && /RETURN a\.userNodeId/.test(cypher)) return REL_ROW_LIST;
	if (/GraphProvenance/.test(cypher)) return [{ manifestRefId: 'e17fc74ef4bfcf6fefabc41a29ace48647ed5da677a9877f66af54c35f82d421' }];
	return [];
};
const CEDS_URI = 'http://ceds.ed.gov/terms#P000033';
const SERIALIZER_ONE_SCRIPT = [
	'// === USER GRAPH STATE SCRIPT ===',
	'// serializerVersion: 1',
	'// embeddingModelVersion: voyage-3',
	'// goldenVersionAuthoredAgainst: ',
	'// userNodeCount: 1',
	'// relationshipCount: 1',
	'// standardKeyName: uri',
	"MERGE (n:Course:UserContent {userNodeId:'u1'}) SET n += {embedding:[0.1,0.2], embeddingModelVersion:'voyage-3', name:'Algebra'}",
	'/*STMT-BOUNDARY*/',
	`MATCH (a:UserContent {userNodeId:'u1'}) OPTIONAL MATCH (b {uri:'${CEDS_URI}'}) FOREACH (_ IN CASE WHEN b IS NULL THEN [] ELSE [1] END | MERGE (a)-[r:ALIGNS_WITH]->(b) SET r += {}) RETURN '${CEDS_URI}' AS danglingKey, (b IS NULL) AS dangling, 'u1' AS fromUserNodeId, 'ALIGNS_WITH' AS relType`,
].join('\n');
const replayResponder = (cypher) => (/r\.userAuthored IS NULL/.test(cypher) ? [{ relElementId: '5:x:1' }] : /stampedCount/.test(cypher) ? [{ stampedCount: 1 }] : /strippedCount/.test(cypher) ? [{ strippedCount: 1 }] : [{ danglingKey: CEDS_URI, dangling: false, fromUserNodeId: 'u1', relType: 'ALIGNS_WITH', danglingKeyList: [] }]);

// ---------------------------------------------------------------------------
// the conjuncts
const conjunctJudgeByRefId = {
	a_linksByStableIdToDeclaredRoles: (mutationList, done) => {
		const { writeExecutor } = modulesFor(mutationList);
		writeEach(writeExecutor, [{ userRefId: 'owner1', action: 'connectToStandard', params: { userNodeId: 'u1', relType: 'ALIGNS_WITH', standardStableId: 'edfi-stable-1' } }], ([outcome]) => {
			const linkStatement = outcome.statementList[0] || { cypher: '', params: {} };
			const expectedMatchText = `MATCH (s:${LINK_RULE.targetLabel} {${LINK_RULE.standardKeyName}:$standardStableId}) WHERE s.role IN $linkableRoleList`;
			const pass = !outcome.err && linkStatement.cypher.indexOf(expectedMatchText) !== -1 && linkStatement.params.standardStableId === 'edfi-stable-1' &&
				JSON.stringify(linkStatement.params.linkableRoleList) === JSON.stringify(LINK_RULE.linkableRoleList);
			done({ pass, detail: outcome.err || linkStatement.cypher.slice(0, 200) });
		});
	},
	b_retiredKeyRefusedByName: (mutationList, done) => {
		const { writeExecutor } = modulesFor(mutationList);
		writeEach(writeExecutor, [
			{ userRefId: 'owner1', action: 'connectToStandard', params: { userNodeId: 'u1', relType: 'ALIGNS_WITH', uri: CEDS_URI } },
			{ userRefId: 'owner1', action: 'connectToStandard', params: { userNodeId: 'u1', relType: 'ALIGNS_WITH', standardUri: CEDS_URI } },
			{ userRefId: 'owner1', action: 'modifyNode', params: { selector: { uri: CEDS_URI }, properties: { name: 'x' } } },
			{ userRefId: 'owner1', action: 'deleteNode', params: { selector: { uri: CEDS_URI } } },
		], (outcomeList) => {
			const unrefusedList = outcomeList.map((outcome, callIndex) => (/retired key/.test(outcome.err) && outcome.statementList.length === 0 ? '' : `call ${callIndex}: '${outcome.err}'`)).filter(Boolean);
			done({ pass: unrefusedList.length === 0, detail: unrefusedList.join(' | ') || 'all four refused naming the retired key' });
		});
	},
	c_matchRelationsRefused: (mutationList, done) => {
		const { writeExecutor } = modulesFor(mutationList);
		const callList = MATCH_RELATION_TYPE_LIST.map((relType) => ({ userRefId: 'owner1', action: 'connectToStandard', params: { userNodeId: 'u1', relType, standardStableId: 'edfi-stable-1' } }))
			.concat([{ userRefId: 'owner1', action: 'connectUserNodes', params: { fromUserNodeId: 'u1', toUserNodeId: 'u2', relType: 'EXACT_MATCH' } }]);
		writeEach(writeExecutor, callList, (outcomeList) => {
			const unrefusedList = outcomeList.map((outcome, callIndex) => (/judge relation/.test(outcome.err) && outcome.statementList.length === 0 ? '' : `call ${callIndex}: '${outcome.err}' (${outcome.statementList.length} statements)`)).filter(Boolean);
			done({ pass: unrefusedList.length === 0, detail: unrefusedList.join(' | ') || `${callList.length} refused before any statement` });
		});
	},
	d_userEdgesCarryTheDeclaredStamp: (mutationList, done) => {
		const { writeExecutor } = modulesFor(mutationList);
		writeEach(writeExecutor, [
			{ userRefId: 'owner1', action: 'connectToStandard', params: { userNodeId: 'u1', relType: 'ALIGNS_WITH', standardStableId: 'edfi-stable-1' } },
			{ userRefId: 'owner1', action: 'connectUserNodes', params: { fromUserNodeId: 'u1', toUserNodeId: 'u2', relType: 'PART_OF' } },
			{ action: 'connectUserNodes', params: { fromUserNodeId: 'u1', toUserNodeId: 'u2', relType: 'PART_OF' } },
		], ([standardOutcome, userOutcome, ownerlessOutcome]) => {
			const stampFaultFor = (outcome) => {
				const linkStatement = outcome.statementList[0] || { cypher: '', params: {} };
				const userEdgeStamp = linkStatement.params.userEdgeStamp || {};
				const fieldText = Object.keys(userEdgeStamp).sort().join(',');
				return !outcome.err && /SET r \+= \$userEdgeStamp/.test(linkStatement.cypher) && fieldText === STAMP_FIELD_LIST.slice().sort().join(',') && userEdgeStamp.userAuthored === true && userEdgeStamp.userRefId === 'owner1'
					? '' : `err '${outcome.err}', stamp fields [${fieldText}]`;
			};
			const faultList = [stampFaultFor(standardOutcome), stampFaultFor(userOutcome), /userRefId is required/.test(ownerlessOutcome.err) ? '' : `ownerless link not refused: '${ownerlessOutcome.err}'`].filter(Boolean);
			done({ pass: faultList.length === 0, detail: faultList.join(' | ') || 'both verbs stamp exactly the declared fields; ownerless refused' });
		});
	},
	e_userLayerIsTextOnly: (mutationList, done) => {
		const { writeExecutor, loadTarget, contractStubMap } = modulesFor(mutationList);
		writeEach(writeExecutor, [{ userRefId: 'owner1', action: 'createNode', params: { labels: ['Course'], properties: { name: 'Algebra', embedding: [1], embeddingModelVersion: 'x' } } }], ([outcome]) => {
			const createStatement = outcome.statementList[0] || { cypher: '', params: {} };
			const vectorFaultList = [/embedding/i.test(createStatement.cypher) ? 'cypher names a vector' : '', /embedding/i.test(JSON.stringify(createStatement.params)) ? 'params carry a vector' : '', outcome.err ? `err '${outcome.err}'` : ''].filter(Boolean);
			const migration = loadTarget('migration', contractStubMap);
			migration.migrateVersion({ newModelVersion: 'voyage-4-large' }, (migrationErr) => {
				const migrationFault = /text-only/.test(migrationErr || '') && /textOnly/.test(migrationErr || '') ? '' : `migration did not refuse by policy: '${migrationErr}'`;
				const faultList = vectorFaultList.concat(migrationFault ? [migrationFault] : []);
				done({ pass: faultList.length === 0, detail: faultList.join(' | ') || 'no vector written; migration refused naming textOnly' });
			});
		});
	},
	f_reEmitCapturesByStampKeyedOnStableId: (mutationList, done) => {
		const { reEmit } = modulesFor(mutationList);
		const fakeDb = fakeDbFor(layerResponder);
		reEmit.reEmit({ userGraphDb: fakeDb, goldenVersionAuthoredAgainst: 'manifestA', embeddingModelVersion: 'voyage-3' }, (err, result) => {
			const stateScript = (result || {}).stateScript || '';
			const relQueryText = (fakeDb.statementList[1] || { cypher: '' }).cypher;
			const keyName = LINK_RULE.standardKeyName;
			const label = LINK_RULE.targetLabel;
			const faultList = [
				err ? `err '${err}'` : '',
				/r\.userAuthored = true/.test(relQueryText) ? '' : 'edges not captured by stamp',
				stateScript.indexOf(`// standardKeyName: ${keyName}`) !== -1 ? '' : 'header does not name the contract key',
				stateScript.indexOf(`(b:${label} {${keyName}:'edfi-stable-1'})`) !== -1 ? '' : 'user->standard endpoint not keyed on the contract',
				stateScript.indexOf(`(a:${label} {${keyName}:'ceds-stable-1'})`) !== -1 && stateScript.indexOf(`(b:${label} {${keyName}:'sif-stable-1'})`) !== -1 ? '' : 'standard->standard user edge not carried',
				/embedding/.test(stateScript) ? 'script carries a vector' : '',
				(result || {}).relationshipCount === 3 ? '' : `relationshipCount ${(result || {}).relationshipCount}`,
			].filter(Boolean);
			reEmit.reEmit({ userGraphDb: fakeDbFor(layerResponder), embeddingModelVersion: 'voyage-3' }, (unversionedErr) => {
				const allFaultList = faultList.concat(/goldenVersionAuthoredAgainst is required/.test(unversionedErr || '') ? [] : [`unversioned re-emit not refused: '${unversionedErr}'`]);
				done({ pass: allFaultList.length === 0, detail: allFaultList.join(' | ') || 'stamp capture, stableId endpoints, no vector, refusal' });
			});
		});
	},
	g_replayReadsRetiredKeyAndNormalizes: (mutationList, done) => {
		const { reEmit } = modulesFor(mutationList);
		const fakeDb = fakeDbFor(replayResponder);
		const keyName = LINK_RULE.standardKeyName;
		reEmit.replayStateScript({ userGraphDb: fakeDb, stateScript: SERIALIZER_ONE_SCRIPT, userRefId: 'owner1' }, (err) => {
			const statementTextList = fakeDb.statementList.map((one) => one.cypher);
			const stampStatement = fakeDb.statementList.find((one) => /UNWIND \$stampRowList/.test(one.cypher)) || { params: {} };
			const stampRow = ((stampStatement.params || {}).stampRowList || [])[0] || {};
			const faultList = [
				err ? `err '${err}'` : '',
				statementTextList.some((one) => one.indexOf(`(b:${LINK_RULE.targetLabel} {${keyName}:'${CEDS_URI}'})`) !== -1) ? '' : 'retired endpoint not rewritten',
				statementTextList.some((one) => /\{uri:/.test(one)) ? 'a statement still binds uri' : '',
				stampRow.relElementId === '5:x:1' && (stampRow.userEdgeStamp || {}).userRefId === 'owner1' && (stampRow.userEdgeStamp || {}).userAuthored === true ? '' : 'legacy edge not stamped with the owner',
				statementTextList.some((one) => /REMOVE n\.embedding/.test(one)) ? '' : 'old vectors not stripped',
			].filter(Boolean);
			const refusalCaseList = [
				{ caseName: 'unknown key', stateScript: SERIALIZER_ONE_SCRIPT.replace('// standardKeyName: uri', '// standardKeyName: sourceUri'), userRefId: 'owner1', expected: /sourceUri/ },
				{ caseName: 'key-less script', stateScript: SERIALIZER_ONE_SCRIPT.replace('// standardKeyName: uri\n', ''), userRefId: 'owner1', expected: /names no standardKeyName/ },
				{ caseName: 'ownerless replay', stateScript: SERIALIZER_ONE_SCRIPT, userRefId: '', expected: /userRefId is required/ },
			];
			const refusalFaultList = [];
			const nextCase = (caseIndex) => {
				if (caseIndex >= refusalCaseList.length) {
					const allFaultList = faultList.concat(refusalFaultList);
					done({ pass: allFaultList.length === 0, detail: allFaultList.join(' | ') || 'uri rewritten, legacy stamped, vectors stripped, three refusals' });
					return;
				}
				const oneCase = refusalCaseList[caseIndex];
				reEmit.replayStateScript({ userGraphDb: fakeDbFor(replayResponder), stateScript: oneCase.stateScript, userRefId: oneCase.userRefId }, (caseErr) => {
					if (!oneCase.expected.test(caseErr || '')) { refusalFaultList.push(`${oneCase.caseName} not refused: '${caseErr}'`); }
					nextCase(caseIndex + 1);
				});
			};
			nextCase(0);
		});
	},
	h_providerTextsNameTheContract: (mutationList, done) => {
		const writeProviderText = textFor(mutationList, 'writeProvider');
		const readProviderText = textFor(mutationList, 'readProvider');
		const writeCliText = textFor(mutationList, 'writeCli');
		const connectTool = JSON.parse(writeProviderText).tools.find((oneTool) => oneTool.definition.name === 'dme_user_connect_to_standard');
		const connectDescription = connectTool.definition.description;
		const faultList = [
			connectTool.definition.input_schema.properties.standardStableId && !connectTool.definition.input_schema.properties.standardUri ? '' : 'connect tool input is not standardStableId',
			connectTool.cli.flagArgs.standardStableId === '--standardStableId' ? '' : 'connect tool flag is not --standardStableId',
			LINK_RULE.linkableRoleList.every((oneRole) => connectDescription.indexOf(oneRole) !== -1) ? '' : 'connect description omits a linkable role',
			MATCH_RELATION_TYPE_LIST.every((relType) => connectDescription.indexOf(relType) !== -1) ? '' : 'connect description omits a refused relation',
			/need\('standardStableId'\)/.test(writeCliText) && !/standardUri/.test(writeCliText) ? '' : 'write CLI does not send standardStableId',
			[writeProviderText, readProviderText].some((oneText) => /\b18\b|voyage|\buri\b/i.test(oneText)) ? "a provider still says '18', voyage or uri" : '',
		].filter(Boolean);
		done({ pass: faultList.length === 0, detail: faultList.join(' | ') || 'provider texts and CLI carry the contract' });
	},
	i_saveRecordsTheGoldenVersion: (mutationList, done) => {
		const { reEmit, contractStubMap } = modulesFor(mutationList);
		const accessPointFor = (responder, savedArgsList) => {
			const fakeDb = fakeDbFor(responder);
			const library = {};
			const accessPointModule = loadWithStubs({
				modulePath: MODULE_PATH_BY_TARGET.saveAccessPoint,
				mutationList: mutationsFor(mutationList, 'saveAccessPoint'),
				stubByRequestPath: {
					...contractStubMap,
					'../../lib/user-graph/re-emit': reEmit,
					'../../lib/user-graph/user-graph': {
						readVersionRow: (opts, callback) => callback('', { liveBoltUri: 'bolt://double:7687' }),
						setLiveDirty: (opts, callback) => callback(''),
						liveCloneConnectionFor: () => ({ neo4jBoltUri: 'bolt://double:7687' }),
					},
					'../../lib/neo4j-instance/neo4j-instance': () => ({ initDatabaseInstance: (connection, callback) => callback('', fakeDb) }),
				},
			});
			accessPointModule({
				dotD: { logList: [], library: { add: (name, serviceFunction) => { library.serviceFunction = serviceFunction; } } },
				passThroughParameters: { sqlDb: {}, dataMapping: {}, accessPointsDotD: { 'graph-state-version-save': (args, callback) => { savedArgsList.push(args); callback('', {}); } } },
			});
			return library.serviceFunction;
		};
		const savedArgsList = [];
		accessPointFor(layerResponder, savedArgsList)({ userRefId: 'owner1', versionRefId: 'v1' }, (err) => {
			const savedArgs = savedArgsList[0] || {};
			const manifestRefId = layerResponder('GraphProvenance')[0].manifestRefId;
			const faultList = [
				err ? `err '${err}'` : '',
				savedArgs.goldenVersionAuthoredAgainst === manifestRefId ? '' : `goldenVersionAuthoredAgainst '${savedArgs.goldenVersionAuthoredAgainst}'`,
				savedArgs.embeddingModelVersion === contract.userEmbeddingRule.userVectorPolicy ? '' : `embeddingModelVersion '${savedArgs.embeddingModelVersion}'`,
				(savedArgs.stateScript || '').indexOf(`// goldenVersionAuthoredAgainst: ${manifestRefId}`) !== -1 ? '' : 'script header lacks the golden version',
			].filter(Boolean);
			const passportlessResponder = (cypher) => (/GraphProvenance/.test(cypher) ? [] : layerResponder(cypher));
			accessPointFor(passportlessResponder, [])({ userRefId: 'owner1', versionRefId: 'v1' }, (passportlessErr) => {
				const allFaultList = faultList.concat(/manifestRefId/.test(passportlessErr || '') ? [] : [`passport-less save not refused: '${passportlessErr}'`]);
				done({ pass: allFaultList.length === 0, detail: allFaultList.join(' | ') || 'golden version recorded; passport-less save refused' });
			});
		});
	},
};

const TWIN_LIST = [
	{ conjunctRefId: 'a_linksByStableIdToDeclaredRoles', twinName: 'roleFilterDropped', target: 'writeExecutor', find: 'WHERE s.role IN $linkableRoleList ', replace: '' },
	{ conjunctRefId: 'b_retiredKeyRefusedByName', twinName: 'retiredPayloadAccepted', target: 'writeExecutor', find: '		if (retiredNameList.length > 0) {', replace: '		if (retiredNameList.length < 0) {' },
	{ conjunctRefId: 'c_matchRelationsRefused', twinName: 'matchRelationAllowed', target: 'contract', find: "	if (!isMatchRelationType(relType)) {\n\t\treturn '';", replace: "	if (true) {\n\t\treturn '';" },
	{ conjunctRefId: 'd_userEdgesCarryTheDeclaredStamp', twinName: 'stampLacksUserAuthored', target: 'contract', find: 'contract.userEdgeStampFieldList.slice()', replace: "contract.userEdgeStampFieldList.filter((oneFieldName) => oneFieldName !== 'userAuthored')" },
	{ conjunctRefId: 'e_userLayerIsTextOnly', twinName: 'vectorStampWritten', target: 'writeExecutor', find: '{userNodeId:$userNodeId}) SET n += $props', replace: "{userNodeId:$userNodeId, embeddingModelVersion:'voyage-3'}) SET n += $props" },
	{ conjunctRefId: 'f_reEmitCapturesByStampKeyedOnStableId', twinName: 'captureByEndpointLabel', target: 'reEmit', find: '`WHERE r.userAuthored = true ` +', replace: '`WHERE (a:UserContent OR b:UserContent) ` +' },
	{ conjunctRefId: 'g_replayReadsRetiredKeyAndNormalizes', twinName: 'retiredKeyNotRewritten', target: 'reEmit', find: '(wholeMatch, alias) => `(${alias}:${targetLabel} {${standardKeyName}:`', replace: '(wholeMatch) => wholeMatch' },
	{ conjunctRefId: 'h_providerTextsNameTheContract', twinName: 'cliSendsUri', target: 'writeCli', find: "need('standardStableId')", replace: "need('standardUri')" },
	{ conjunctRefId: 'i_saveRecordsTheGoldenVersion', twinName: 'goldenVersionNotRecorded', target: 'saveAccessPoint', find: 'const goldenVersionAuthoredAgainst = manifestRefIdList[0];', replace: "const goldenVersionAuthoredAgainst = 'unrecorded';" },
];

// ---------------------------------------------------------------------------
// runner: a conjunct that THROWS (e.g. a module this gate names does not exist yet) is recorded red, not fatal
let passCount = 0;
let failCount = 0;
const record = (label, pass, detail) => {
	if (pass) { passCount += 1; } else { failCount += 1; }
	console.log(`  ${pass ? 'PASS' : 'FAIL'}: ${label} — ${detail}`);
};
let pendingStep = null;
process.on('uncaughtException', (thrown) => {
	if (!pendingStep) { console.log(`UNCAUGHT outside a conjunct: ${thrown.stack}`); process.exit(1); }
	pendingStep({ pass: false, detail: `THREW: ${String(thrown.message).split('\n')[0]}` });
});
// a sequence that stalls never prints Results; leaving without them is a failure, never a quiet exit 0
let resultsReported = false;
process.on('exit', () => {
	if (!resultsReported) { console.log('\nINCOMPLETE: the gate stopped before reporting results'); process.exitCode = 1; }
});
const runSequence = (stepList, whenDone) => {
	const nextStep = (stepIndex) => {
		if (stepIndex >= stepList.length) { whenDone(); return; }
		stepList[stepIndex](() => setImmediate(() => nextStep(stepIndex + 1)));
	};
	nextStep(0);
};
const judgeStep = (conjunctRefId, mutationList, onVerdict) => (stepDone) => {
	const finishOnce = (verdict) => { if (pendingStep !== finishOnce) { return; } pendingStep = null; onVerdict(verdict); stepDone(); };
	pendingStep = finishOnce;
	setImmediate(() => conjunctJudgeByRefId[conjunctRefId](mutationList, finishOnce));
};

const refIdList = Object.keys(conjunctJudgeByRefId);
console.log('\n=== W-E-5/6/7 the user layer reads graph-contract §14 ===\n');
console.log('BASELINE — the real modules pass every conjunct');
runSequence(
	refIdList.map((oneRefId) => judgeStep(oneRefId, [], (verdict) => record(`${oneRefId}`, verdict.pass, verdict.detail))),
	() => {
		console.log('\nTHE TWIN SWEEP — every conjunct OBSERVED RED under an in-memory double');
		record('every conjunct has exactly one twin', TWIN_LIST.map((oneTwin) => oneTwin.conjunctRefId).sort().join(',') === refIdList.slice().sort().join(','), `${TWIN_LIST.length} twins for ${refIdList.length} conjuncts`);
		runSequence(
			TWIN_LIST.map((oneTwin) => judgeStep(oneTwin.conjunctRefId, [{ target: oneTwin.target, find: oneTwin.find, replace: oneTwin.replace }], (verdict) => {
				record(`${oneTwin.conjunctRefId} observed RED under '${oneTwin.twinName}'`, !verdict.pass, verdict.detail);
			})),
			() => {
				resultsReported = true;
				console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===`);
				process.exit(failCount === 0 ? 0 : 1);
			},
		);
	},
);
