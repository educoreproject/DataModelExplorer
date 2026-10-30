'use strict';
// forged-use-case-structure-live.test.js — the use-case Structure tab's server side (PLAN-useCaseStructureTab-103026 §4,
// gates S1 and S2), through the REAL forged-use-cases access point and mapper on the live golden (read-only handle), and
// the REAL standard-downloads access point reading the qbook [standardDownloads] directory. Every number is checked
// against the test's OWN Cypher, and the plan's measured numbers for uc:ler-issuance are asserted as well.
//   S1 caseStructure for uc:ler-issuance: its 9 steps in reading order (position, then codedNotation); each step's CONSUMES
//      and PRODUCES references exactly; its 14 data references, 7 of them resolved to a cited-element leaf that names its
//      standard; cross-case edges are leaves; no node carries the machinery properties; every edge of every case has
//      plain-word wording; an unknown case and an absent caseStableId are refused by name.
//   S2 for every case: the outline's distinct nodes and edges equal the extracted document's node and edge counts, and both
//      equal the test's own count of the walk; the extracted document is valid JSON; caseSourceFile for two cases answers
//      text whose bytes are identical to the corpus file the forge copied (standardSourceLocation copiedFrom); an unknown
//      case is refused.
//
// Run: node server/test/forged-use-case-structure-live.test.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const configFileProcessor = require('qtools-config-file-processor');

const configBySection = {};
process.global = {
	getConfig: (sectionName) => configBySection[sectionName] || {},
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const { readGoldenContainerName, serverConfigDirPath } = require('./lib/goldenContainerName');
const { resolveContainerConnection } = require('../data-model/lib/user-graph/container-connection-resolver');
const neo4jGen = require('../data-model/lib/neo4j-instance/neo4j-instance')({ unused: true });

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const CODE_ROOT_PATH = path.join(__dirname, '..', '..');
const CORPUS_DIR_PATH = path.join(CODE_ROOT_PATH, '..', 'management', 'zNotesPlansDocs', 'educoreEnhancedCockburn-v.11');
const CASE_STABLE_ID = 'uc:ler-issuance';
const SOURCE_CASE_STABLE_ID_LIST = ['uc:ler-issuance', 'uc:fs002-compilation'];
const MACHINERY_PROPERTY_NAME_LIST = ['embedding', 'searchText', 'embeddingModelVersion'];
const PART_RULE_TEXT = `all(between IN nodes(walk)[1..-1] WHERE NOT between:UcUseCase AND any(labelName IN labels(between) WHERE labelName STARTS WITH 'Uc'))`;

const useCaseMapper = require(path.join(CODE_ROOT_PATH, 'server/data-model/data-mapping/mappers/forged-use-cases.js'))({ baseMappingProcess: () => ({}) });
const downloadsMapper = require(path.join(CODE_ROOT_PATH, 'server/data-model/data-mapping/mappers/standard-downloads.js'))({});

const loadAccessPoint = (accessPointFileName, passThroughParameters) => {
	const accessPointByName = {};
	require(path.join(CODE_ROOT_PATH, 'server/data-model/access-points-dot-d/accessPoints.d', accessPointFileName))({
		dotD: { logList: [], library: { add: (accessPointName, serviceFunction) => { accessPointByName[accessPointName] = serviceFunction; } } },
		passThroughParameters,
	});
	return accessPointByName[accessPointFileName.replace(/\.js$/, '')];
};

// every node of an outline, depth first
const outlineNodeListOf = (outlineNode) => [outlineNode, ...outlineNode.groupList.flatMap((oneGroup) => oneGroup.childList.flatMap((oneChild) => outlineNodeListOf(oneChild.childNode)))];
const outlineEdgeIndexListOf = (outlineNode) => outlineNode.groupList.flatMap((oneGroup) => oneGroup.childList.flatMap((oneChild) => [oneChild.edgeIndex, ...outlineEdgeIndexListOf(oneChild.childNode)]));
const groupOf = (outlineNode, edgeType) => outlineNode.groupList.find((oneGroup) => oneGroup.edgeType === edgeType);
const sortedText = (textList) => JSON.stringify(textList.slice().sort());

const runInOrder = (stepList, callback) => {
	const runNext = (stepIndex) => {
		if (stepIndex === stepList.length) { callback(); return; }
		stepList[stepIndex](() => setImmediate(() => runNext(stepIndex + 1)));
	};
	runNext(0);
};

console.log('\n=== Use-case Structure tab: caseStructure and caseSourceFile (S1, S2) ===\n');

const goldenContainerName = readGoldenContainerName();
const goldenConnection = resolveContainerConnection(goldenContainerName);
if (goldenConnection.error) {
	console.log(`  FAIL: golden connection: ${goldenConnection.error}`);
	process.exit(1);
}
configBySection.standardDownloads = { downloadArtifactsRootDirPath: ((configFileProcessor.getConfig('startApiServer.ini', serverConfigDirPath(), { resolve: true }) || {}).standardDownloads || {}).downloadArtifactsRootDirPath };
configBySection.dataModelExplorerSearch = { goldenContainerName };
console.log(`  golden ${goldenContainerName}; downloads ${configBySection.standardDownloads.downloadArtifactsRootDirPath}\n`);

neo4jGen.initDatabaseInstance({ neo4jBoltUri: goldenConnection.boltUri, neo4jUser: goldenConnection.user, neo4jPassword: goldenConnection.password, readOnly: true, queryTimeoutMs: 60000 }, (connectError, goldenDb) => {
	if (connectError) {
		console.log(`  FAIL: golden connect: ${connectError}`);
		process.exit(1);
	}
	const downloadsAccessPoint = loadAccessPoint('standard-downloads.js', { neo4jDb: goldenDb, dataMapping: { 'standard-downloads': downloadsMapper } });
	const useCaseAccessPoint = loadAccessPoint('forged-use-cases.js', { neo4jDb: goldenDb, dataMapping: { 'forged-use-cases': useCaseMapper }, accessPointsDotD: { 'standard-downloads': downloadsAccessPoint } });
	const testState = {};

	runInOrder([
		// the test's own reading of the case: steps in reading order, each step's data, the references and their resolution
		(done) => goldenDb.runQuery(`MATCH (:UcUseCase {stableId: $caseStableId})-[step:HAS_STEP]->(story)
			OPTIONAL MATCH (story)-[dataEdge:CONSUMES|PRODUCES]->(dataNode)
			WITH step, story, collect(type(dataEdge) + ' ' + dataNode.stableId) AS dataTextList
			RETURN story.stableId AS storyStableId, step.codedNotation AS codedNotation, dataTextList ORDER BY step.position, step.codedNotation`, { caseStableId: CASE_STABLE_ID }, (queryError, stepRowList) => {
			testState.expectedStepRowList = queryError ? [] : stepRowList;
			ok('the test reads the steps of uc:ler-issuance', !queryError && stepRowList.length > 0, queryError);
			done();
		}),
		(done) => goldenDb.runQuery(`MATCH walk = (:UcUseCase {stableId: $caseStableId})-[*1..6]->(reference:UcDataReference) WHERE ${PART_RULE_TEXT}
			WITH DISTINCT reference RETURN count(reference) AS referenceCount, count(CASE WHEN (reference)-[:DECLARED_CORRESPONDENCE]->() THEN 1 END) AS resolvedCount`, { caseStableId: CASE_STABLE_ID }, (queryError, countRowList) => {
			testState.expectedCitation = queryError ? {} : countRowList[0];
			done();
		}),
		(done) => useCaseAccessPoint({ action: 'caseStructure', caseStableId: CASE_STABLE_ID }, (structureError, structure) => {
			ok(`S1 caseStructure answers ${CASE_STABLE_ID}`, !structureError && structure && structure.outline, structureError);
			if (structureError) { done(); return; }
			testState.structure = structure;
			const outline = structure.outline;
			const stepGroup = groupOf(outline, 'HAS_STEP') || { childList: [] };
			const stepNotationText = JSON.stringify(stepGroup.childList.map((oneChild) => oneChild.edgePropertyMap.codedNotation));
			const expectedNotationText = JSON.stringify(testState.expectedStepRowList.map((oneRow) => oneRow.codedNotation));
			ok(`S1 the outline holds its 9 steps in reading order ${expectedNotationText}`, stepGroup.childList.length === 9 && stepNotationText === expectedNotationText, stepNotationText);
			const disagreeingStepList = stepGroup.childList.filter((oneChild, stepIndex) => {
				const outlineDataTextList = ['CONSUMES', 'PRODUCES'].flatMap((edgeType) => ((groupOf(oneChild.childNode, edgeType) || { childList: [] }).childList).map((dataChild) => `${edgeType} ${dataChild.childNode.nodeStableId}`));
				return sortedText(outlineDataTextList) !== sortedText(testState.expectedStepRowList[stepIndex].dataTextList);
			});
			ok('S1 each step carries exactly its CONSUMES and PRODUCES references', disagreeingStepList.length === 0, JSON.stringify(disagreeingStepList.map((oneChild) => oneChild.edgePropertyMap.codedNotation)));
			ok('S1 every step edge shows its codedNotation and position', stepGroup.childList.every((oneChild) => ['codedNotation', 'position'].every((propertyName) => oneChild.edgePropertyList.some((oneProperty) => oneProperty.propertyName === propertyName))), '');
			ok(`S1 14 data references, 7 resolved (the test's Cypher: ${testState.expectedCitation.referenceCount}, ${testState.expectedCitation.resolvedCount})`, structure.citationCount === 14 && structure.resolvedCitationCount === 7 && structure.citationCount === testState.expectedCitation.referenceCount && structure.resolvedCitationCount === testState.expectedCitation.resolvedCount, `${structure.citationCount}, ${structure.resolvedCitationCount}`);
			const outlineNodeList = outlineNodeListOf(outline);
			const citedLeafList = outlineNodeList.flatMap((oneNode) => ((groupOf(oneNode, 'DECLARED_CORRESPONDENCE') || { childList: [] }).childList).map((oneChild) => oneChild.childNode));
			ok('S1 every citation ends in a cited-element LEAF naming its standard', citedLeafList.length >= 7 && new Set(citedLeafList.map((oneLeaf) => oneLeaf.nodeStableId)).size === 7 && citedLeafList.every((oneLeaf) => oneLeaf.nodeKind === 'citedElement' && oneLeaf.standardSource && oneLeaf.groupList.length === 0), JSON.stringify(citedLeafList.map((oneLeaf) => [oneLeaf.nodeKind, oneLeaf.standardSource])).slice(0, 300));
			const siblingGroup = groupOf(outline, 'SIBLING') || { childList: [] };
			ok('S1 cross-case edges are leaves linking to the other case', siblingGroup.childList.length === 2 && siblingGroup.childList.every((oneChild) => oneChild.childNode.nodeKind === 'otherCase' && oneChild.childNode.groupList.length === 0), JSON.stringify(siblingGroup.childList.map((oneChild) => oneChild.childNode.nodeKind)));
			const machineryHolderList = outlineNodeList.filter((oneNode) => oneNode.propertyList.some((oneProperty) => MACHINERY_PROPERTY_NAME_LIST.includes(oneProperty.propertyName)))
				.concat(structure.extractedDocument.nodeList.filter((oneNode) => MACHINERY_PROPERTY_NAME_LIST.some((propertyName) => propertyName in oneNode.propertyMap)));
			ok('S1 no outline or extracted node carries embedding, searchText or embeddingModelVersion', machineryHolderList.length === 0, JSON.stringify(machineryHolderList.map((oneNode) => oneNode.nodeStableId || oneNode.stableId)).slice(0, 200));
			done();
		}),
		(done) => useCaseAccessPoint({ action: 'caseStructure', caseStableId: 'uc:no-such-case' }, (structureError) => {
			ok('S1 a case that is not there is refused by name', /no use case in this graph has stableId 'uc:no-such-case'/.test(`${structureError}`), `${structureError}`);
			done();
		}),
		(done) => useCaseAccessPoint({ action: 'caseStructure' }, (structureError) => {
			ok('S1 an absent caseStableId is refused by name', /caseStructure requires caseStableId/.test(`${structureError}`), `${structureError}`);
			done();
		}),
		// S2: every case, outline against the extracted document against the test's own count
		(done) => goldenDb.runQuery(`MATCH (useCase:UcUseCase) CALL { WITH useCase MATCH walk = (useCase)-[*1..6]->() WHERE ${PART_RULE_TEXT}
			UNWIND relationships(walk) AS walkEdge WITH DISTINCT walkEdge UNWIND [startNode(walkEdge), endNode(walkEdge)] AS endNode
			RETURN count(DISTINCT walkEdge) AS edgeCount, count(DISTINCT endNode) AS nodeCount }
			RETURN useCase.stableId AS caseStableId, edgeCount, nodeCount ORDER BY caseStableId`, {}, (queryError, countRowList) => {
			if (queryError) {
				ok('S2 the test counts every case\'s walk', false, `${queryError}`);
				done();
				return;
			}
			testState.expectedCountRowList = countRowList;
			done();
		}),
		(done) => {
			const countRowList = testState.expectedCountRowList || [];
			const resultList = [];
			const askNext = (caseIndex) => {
				if (caseIndex === countRowList.length) {
					const disagreeingList = resultList.filter((oneResult) => !oneResult.agrees);
					ok(`S2 all ${countRowList.length} cases: outline nodes/edges = extracted nodeCount/edgeCount = the test's count`, countRowList.length === 7 && disagreeingList.length === 0, JSON.stringify(disagreeingList).slice(0, 400));
					const unwordedList = resultList.flatMap((oneResult) => oneResult.unwordedEdgeTypeList);
					ok('S2 every edge type in every case has plain-word wording', resultList.length === 7 && resultList.every((oneResult) => !oneResult.structureError) && unwordedList.length === 0, JSON.stringify([...new Set(unwordedList)]));
					ok('S2 every extracted document survives JSON and names its format', resultList.length === 7 && resultList.every((oneResult) => oneResult.parsesAsJson), '');
					done();
					return;
				}
				const expectedRow = countRowList[caseIndex];
				useCaseAccessPoint({ action: 'caseStructure', caseStableId: expectedRow.caseStableId }, (structureError, structure) => {
					if (structureError) {
						resultList.push({ caseStableId: expectedRow.caseStableId, agrees: false, structureError, unwordedEdgeTypeList: [] });
						setImmediate(() => askNext(caseIndex + 1));
						return;
					}
					const outlineNodeIdCount = new Set(outlineNodeListOf(structure.outline).map((oneNode) => oneNode.nodeStableId)).size;
					const outlineEdgeCount = new Set(outlineEdgeIndexListOf(structure.outline)).size;
					const documentText = JSON.stringify(structure.extractedDocument);
					const reparsedDocument = JSON.parse(documentText);
					resultList.push({
						caseStableId: expectedRow.caseStableId,
						counts: [outlineNodeIdCount, structure.extractedDocument.nodeList.length, structure.extractedDocument.nodeCount, expectedRow.nodeCount, outlineEdgeCount, structure.extractedDocument.edgeList.length, structure.extractedDocument.edgeCount, expectedRow.edgeCount],
						agrees: [structure.extractedDocument.nodeList.length, structure.extractedDocument.nodeCount, expectedRow.nodeCount].every((oneCount) => oneCount === outlineNodeIdCount) && [structure.extractedDocument.edgeList.length, structure.extractedDocument.edgeCount, expectedRow.edgeCount].every((oneCount) => oneCount === outlineEdgeCount),
						unwordedEdgeTypeList: outlineNodeListOf(structure.outline).flatMap((oneNode) => oneNode.groupList.filter((oneGroup) => !oneGroup.isWorded).map((oneGroup) => oneGroup.edgeType)),
						parsesAsJson: reparsedDocument.documentFormat === 'educoreUseCaseSubgraph/1' && reparsedDocument.caseStableId === expectedRow.caseStableId && reparsedDocument.graphName === goldenContainerName,
					});
					setImmediate(() => askNext(caseIndex + 1));
				});
			};
			askNext(0);
		},
		...SOURCE_CASE_STABLE_ID_LIST.map((sourceCaseStableId) => (done) => useCaseAccessPoint({ action: 'caseSourceFile', caseStableId: sourceCaseStableId }, (sourceError, sourceFile) => {
			if (sourceError) {
				ok(`S2 caseSourceFile answers ${sourceCaseStableId}`, false, `${sourceError}`);
				done();
				return;
			}
			const corpusBuffer = fs.readFileSync(path.join(CORPUS_DIR_PATH, sourceFile.sourceFileName));
			const answeredBuffer = Buffer.from(sourceFile.sourceText, 'utf8');
			const corpusSha256 = crypto.createHash('sha256').update(corpusBuffer).digest('hex');
			ok(`S2 ${sourceCaseStableId}: the source JSON (${sourceFile.fileName}) is byte-identical to the corpus file (sha256 ${corpusSha256.slice(0, 12)}…)`, answeredBuffer.equals(corpusBuffer) && sourceFile.sha256 === corpusSha256 && sourceFile.byteSize === corpusBuffer.length, `${sourceFile.sha256} vs ${corpusSha256}`);
			ok(`S2 ${sourceCaseStableId}: the source JSON is valid JSON`, (() => { const parsedSource = JSON.parse(sourceFile.sourceText); return Boolean(parsedSource && typeof parsedSource === 'object'); })(), '');
			done();
		})),
		// the extracted document names its graph: a server that declares no golden is refused by name, never given a null
		(done) => {
			const declaredSection = configBySection.dataModelExplorerSearch;
			configBySection.dataModelExplorerSearch = {};
			useCaseAccessPoint({ action: 'caseStructure', caseStableId: CASE_STABLE_ID }, (structureError) => {
				configBySection.dataModelExplorerSearch = declaredSection;
				ok('S2 caseStructure on a server that declares no golden name is refused by name', /cannot name its graph/.test(`${structureError}`), `${structureError}`);
				done();
			});
		},
		(done) => useCaseAccessPoint({ action: 'caseSourceFile', caseStableId: 'uc:no-such-case' }, (sourceError) => {
			ok('S2 caseSourceFile refuses a case that is not there, by name', /no use case in this graph has stableId 'uc:no-such-case'/.test(`${sourceError}`), `${sourceError}`);
			done();
		}),
	], () => {
		console.log(`\n${passed} passed, ${failed} failed\n`);
		process.exit(failed ? 1 : 0);
	});
});
