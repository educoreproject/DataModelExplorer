'use strict';
// standards-neighbourhood-allFamilies.test.js — the Standards Explorer opened on every family (WORKORDER
// allStandardsExplorer-101426), against the LIVE golden graph (read-only handle), through the same access point and
// mapper the server loads. Every expectation is read from the graph by this test's own Cypher, never written here.
//   1. the families catalog ('families:all') holds one item per standardFamily this test's Cypher counts, with each
//      family's standards and classes as that Cypher counts them; the endpoint answers it 200 as [result];
//   2. every family opens, and every standard of every family opens at its root;
//   3. a two-level drill on SIF, Ed-Fi and CEDS: root › a class this test's Cypher picks › a member of that class,
//      the member's ancestor chain running root › class;
//   4. a CEDS-root walk: CEDS › a CEDS domain › a CEDS property › its CEDS element (anchor) › the standards mapped
//      there, the element counts equal to this test's Cypher, the SIF group drillable; a CEDS domain's mapped count
//      equals this test's Cypher; a CEDS property with code-level anchors lists only its property-tier ones;
//   5. refusals by name: a families: id that is not the catalog (node and pathSummary); the catalog's crumb is named;
//   6. RED TWINS (no graph): a one-standard family carries its version, a many-standard family does not; match kinds
//      count DISTINCT elements and the strongest leads; a CEDS property's CEDS elements make it drillable.
//
// Run: /usr/local/bin/node server/test/standards-neighbourhood-allFamilies.test.js

const path = require('path');

process.global = {
	getConfig: () => ({ secret: 'standards-neighbourhood-test-secret' }),
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const { readGoldenContainerName } = require('./lib/goldenContainerName');
const { resolveContainerConnection } = require('../data-model/lib/user-graph/container-connection-resolver');
const neo4jGen = require('../data-model/lib/neo4j-instance/neo4j-instance')({ unused: true });
// ⟪lane R6⟫ an anchor reaches its property through its OWN hub's slot edge, never a literal edge type
const { cardHubSlotEdgeTypeTextFor } = require('../../cli/lib.d/data-model-explorer/lib/toolPayloadContract');
const propertySlotTextFor = (anchorVariableName) => cardHubSlotEdgeTypeTextFor(anchorVariableName, 'PROPERTY');

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const CODE_ROOT_PATH = path.join(__dirname, '..', '..');
const MAPPER_PATH = path.join(CODE_ROOT_PATH, 'server/data-model/data-mapping/mappers/standards-neighbourhood.js');
const ACCESS_POINT_PATH = path.join(CODE_ROOT_PATH, 'server/data-model/access-points-dot-d/accessPoints.d/standards-neighbourhood.js');
const ENDPOINT_PATH = path.join(CODE_ROOT_PATH, 'server/endpoints-dot-d/qtDotLib.d/standards-neighbourhood.js');
const TOKEN_TOOLS_PATH = path.join(CODE_ROOT_PATH, 'server/lib/access-token-header-tools.js');

const mapper = require(MAPPER_PATH)({});

const MATCH_EDGE_PATTERN_TEXT = 'EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH';
const CEDS_ROOT_STABLE_ID = 'https://w3id.org/CEDStandards/terms/';

// the access point exactly as access-points-dot-d builds it, over the handle given
const loadAccessPoint = (neo4jDb) => {
	const accessPointByName = {};
	require(ACCESS_POINT_PATH)({
		dotD: { logList: [], library: { add: (accessPointName, serviceFunction) => { accessPointByName[accessPointName] = serviceFunction; } } },
		passThroughParameters: { neo4jDb, dataMapping: { 'standards-neighbourhood': mapper } },
	});
	return accessPointByName['standards-neighbourhood'];
};

const runEndpoint = ({ authclaims, requestBody, accessPoint }, callback) => {
	let routeHandler;
	const accessTokenHeaderTools = require(TOKEN_TOOLS_PATH)({ expressApp: {} });
	require(ENDPOINT_PATH)({
		dotD: { logList: [] },
		passThroughParameters: { expressApp: { post: (routePath, handler) => { routeHandler = handler; } }, accessTokenHeaderTools, accessPointsDotD: { 'standards-neighbourhood': accessPoint }, routingPrefix: '/api/' },
	});
	const xReq = { appValueGetter: () => authclaims, qtGetSurePath: () => requestBody };
	const answer = { statusCode: 200 };
	const xRes = { status: (statusCode) => { answer.statusCode = statusCode; return xRes; }, send: (body) => { answer.body = body; callback(answer); } };
	routeHandler(xReq, xRes, () => {});
};

// runs a list of (done) => ... steps in order; a step may push more steps onto the list while it runs
const runInOrder = (stepList, callback) => {
	const runNext = (stepIndex) => {
		if (stepIndex === stepList.length) { callback(); return; }
		stepList[stepIndex](() => runNext(stepIndex + 1));
	};
	runNext(0);
};

const groupOf = (neighbourhood, relationshipType) => ((neighbourhood || {}).childGroupList || []).find((oneGroup) => oneGroup.relationshipType === relationshipType) || { itemList: [], count: 0 };
const itemIn = (neighbourhood, stableId) => ((neighbourhood || {}).childGroupList || []).flatMap((oneGroup) => oneGroup.itemList).find((oneItem) => oneItem.stableId === stableId);

console.log('\n=== Standards Explorer, every family: the families catalog and each family walked ===\n');

// ---- 6. red twins that need no graph
const familyItemList = mapper.mapFamilyCatalogItemList([
	{ standardFamily: 'SIF', standardCount: 1, releaseCount: 1, classCount: 159, versionList: [{ releaseLabel: 'sif', version: '4.3', classCount: 159 }] },
	{ standardFamily: 'PESC', standardCount: 2, releaseCount: 1, classCount: 400, versionList: [{ releaseLabel: 'CT', version: '1.8.0', classCount: 222 }, { releaseLabel: 'CT', version: '1.7.0', classCount: 178 }] },
]);
ok('twin: a one-standard family carries its version; a many-standard family does not', familyItemList[0].version === '4.3' && familyItemList[1].version === undefined && familyItemList[1].versionList.map((oneVersion) => oneVersion.version).join() === '1.7.0,1.8.0', JSON.stringify(familyItemList));
ok('twin: a family item is drillable to family:<name>', familyItemList[0].stableId === 'family:SIF' && familyItemList[0].hasChildren === true);
const matchKindSummary = mapper.matchKindSummaryOf([
	{ matchEdgeType: 'BROAD_MATCH', elementStableId: 'a' },
	{ matchEdgeType: 'CLOSE_MATCH', elementStableId: 'a' },
	{ matchEdgeType: 'CLOSE_MATCH', elementStableId: 'b' },
]);
ok('twin: match kinds count distinct elements, strongest first', matchKindSummary.elementCount === 2 && matchKindSummary.strongestMatchKind === 'close' && matchKindSummary.matchKindCountList.map((oneCount) => `${oneCount.matchKind}${oneCount.elementCount}`).join() === 'close2,broad1', JSON.stringify(matchKindSummary));
const cedsPropertyItem = mapper.mapChildItem({ stableId: 'p', name: 'P', labelList: ['CedsProperty', 'DmeProperty'], hubName: 'CEDS', mappingList: [], hasStructuralChildren: false, hubElementCount: 2, mappedElementCount: 0 });
ok('twin: a CEDS property with CEDS elements is drillable even when nothing below it is structural', cedsPropertyItem.kind === 'hubProperty' && cedsPropertyItem.hasChildren === true && cedsPropertyItem.hubElementCount === 2);
// ⟪lane R6⟫ a hub's own property and domain are named by the hub the node belongs to (hubName, read from the graph), never by a label
const ctdlPropertyItem = mapper.mapChildItem({ stableId: 'c', name: 'C', labelList: ['CtdlProperty', 'DmeProperty'], hubName: 'CTDL', mappingList: [], hasStructuralChildren: false, hubElementCount: 1, mappedElementCount: 0 });
const ctdlClassItem = mapper.mapChildItem({ stableId: 'k', name: 'K', labelList: ['CtdlClass', 'DmeClass'], hubName: 'CTDL', mappingList: [], hasStructuralChildren: true, propertyCount: 3, mappedPropertyCount: 1 });
const edfiPropertyItem = mapper.mapChildItem({ stableId: 'e', name: 'E', labelList: ['EdfiProperty', 'DmeProperty'], hubName: null, mappingList: [], hasStructuralChildren: false, hubElementCount: 0, mappedElementCount: 0 });
ok('twin: a CTDL hub property and class are hubProperty / hubDomain, carrying hubName CTDL; a non-hub property stays property', ctdlPropertyItem.kind === 'hubProperty' && ctdlPropertyItem.hubName === 'CTDL' && ctdlPropertyItem.hubElementCount === 1 && ctdlClassItem.kind === 'hubDomain' && ctdlClassItem.hubName === 'CTDL' && edfiPropertyItem.kind === 'property' && !('hubName' in edfiPropertyItem), JSON.stringify([ctdlPropertyItem, ctdlClassItem, edfiPropertyItem]));
ok('twin: only families:all is the catalog id', mapper.isFamilyCatalogId('families:all') && !mapper.isFamilyCatalogId('families:PESC'));

// ---- 1-5. live
const goldenConnection = resolveContainerConnection(readGoldenContainerName());
if (goldenConnection.error) {
	console.log(`  FAIL: golden connection: ${goldenConnection.error}`);
	process.exit(1);
}

neo4jGen.initDatabaseInstance({ neo4jBoltUri: goldenConnection.boltUri, neo4jUser: goldenConnection.user, neo4jPassword: goldenConnection.password, readOnly: true, queryTimeoutMs: 60000 }, (connectError, goldenDb) => {
	if (connectError) {
		console.log(`  FAIL: golden connect: ${connectError}`);
		process.exit(1);
	}
	const accessPoint = loadAccessPoint(goldenDb);
	const ask = (xQuery, callback) => accessPoint(xQuery, callback);
	const cypher = (cypherText, params, callback) => goldenDb.runQuery(cypherText, params, (queryError, rowList) => {
		if (queryError) { console.log(`  FAIL: test Cypher: ${queryError}`); goldenDb.close(); process.exit(1); }
		callback(rowList);
	});
	const found = {};

	// a two-level drill on one family's root: the class with the most members (ties by stableId) and its first member
	const twoLevelDrillStep = (standardFamily) => (done) =>
		cypher(
			`MATCH (root:DmeStandardRoot {standardFamily: $standardFamily})-[:HAS_CLASS]->(classNode)-[:HAS_PROPERTY|HAS_FIELD]->(member)
			 WITH root, classNode, count(member) AS memberCount, min(member.stableId) AS firstMemberStableId
			 ORDER BY memberCount DESC, classNode.stableId LIMIT 1
			 RETURN root.stableId AS rootStableId, classNode.stableId AS classStableId, firstMemberStableId, memberCount`,
			{ standardFamily },
			(drillRowList) => {
				const drillRow = drillRowList[0] || {};
				ask({ action: 'node', stableId: drillRow.rootStableId, compareVersion: true }, (rootError, rootLevel) => {
					ok(`${standardFamily}: the root lists the class this test's Cypher picked (${drillRow.classStableId})`, !rootError && Boolean(itemIn(rootLevel, drillRow.classStableId)), rootError);
					ask({ action: 'node', stableId: drillRow.classStableId, compareVersion: true }, (classError, classLevel) => {
						const memberGroupCount = ['HAS_PROPERTY', 'HAS_FIELD'].reduce((runningTotal, relationshipType) => runningTotal + groupOf(classLevel, relationshipType).count, 0);
						ok(`${standardFamily}: the class opens with its ${drillRow.memberCount} members (true count) under the root`, !classError && memberGroupCount === drillRow.memberCount && (classLevel.ancestorList[0] || {}).stableId === drillRow.rootStableId, classError || `${memberGroupCount} ${JSON.stringify(classLevel.ancestorList)}`);
						ask({ action: 'node', stableId: drillRow.firstMemberStableId, compareVersion: true }, (memberError, memberLevel) => {
							const ancestorIdText = ((memberLevel || {}).ancestorList || []).map((oneAncestor) => oneAncestor.stableId).join(' › ');
							ok(`${standardFamily}: a member of that class opens, its ancestors root › class`, !memberError && memberLevel.node.stableId === drillRow.firstMemberStableId && ancestorIdText === `${drillRow.rootStableId} › ${drillRow.classStableId}`, memberError || ancestorIdText);
							done();
						});
					});
				});
			},
		);

	const stepList = [
		// ---- 1. the families catalog
		(done) => cypher(
			`MATCH (root:DmeStandardRoot) WHERE root.standardFamily IS NOT NULL
			 RETURN root.standardFamily AS standardFamily, count(root) AS standardCount, sum(COUNT { (root)-[:HAS_CLASS]->() }) AS classCount ORDER BY standardFamily`,
			{},
			(familyRowList) => ask({ action: 'node', stableId: 'families:all' }, (catalogError, catalogLevel) => {
				const familyGroup = groupOf(catalogLevel, 'HAS_FAMILY');
				ok(`families:all: ${familyRowList.length} families, as this test's Cypher counts them`, !catalogError && catalogLevel.node.kind === 'familyCatalog' && familyGroup.count === familyRowList.length && familyGroup.itemList.length === familyRowList.length, catalogError || `${familyGroup.count}`);
				const mismatchList = familyRowList.filter((familyRow) => {
					const familyItem = familyGroup.itemList.find((oneItem) => oneItem.standardFamily === familyRow.standardFamily);
					return !familyItem || familyItem.standardCount !== familyRow.standardCount || familyItem.classCount !== familyRow.classCount || familyItem.stableId !== `family:${familyRow.standardFamily}`;
				});
				ok('families:all: each family\'s standards and classes equal this test\'s Cypher', mismatchList.length === 0, JSON.stringify(mismatchList));
				ok('families:all: SIF, Ed-Fi, CEDS and PESC are among them (read, not listed)', ['SIF', 'EdFi', 'CEDS', 'PESC'].every((standardFamily) => familyGroup.itemList.some((oneItem) => oneItem.standardFamily === standardFamily)));
				found.familyNameList = familyRowList.map((familyRow) => familyRow.standardFamily);
				done();
			}),
		),
		(done) => runEndpoint({ authclaims: { user: { role: 'user' } }, requestBody: { action: 'node', stableId: 'families:all' }, accessPoint }, (answer) => {
			ok('endpoint: families:all is answered 200 as [result]', answer.statusCode === 200 && Array.isArray(answer.body) && answer.body[0].node.kind === 'familyCatalog', `${answer.statusCode}`);
			done();
		}),

		// ---- 2. every family, and every standard root of it, opens
		(done) => cypher('MATCH (root:DmeStandardRoot) WHERE root.standardFamily IS NOT NULL RETURN root.standardFamily AS standardFamily, root.stableId AS stableId, COUNT { (root)-[:HAS_CLASS]->() } AS classCount', {}, (rootRowList) => {
			const failureList = [];
			const familyStepList = found.familyNameList.map((standardFamily) => (familyDone) =>
				ask({ action: 'node', stableId: `family:${standardFamily}` }, (familyError, familyLevel) => {
					if (familyError) failureList.push(`family:${standardFamily}: ${familyError}`);
					familyDone();
				}),
			);
			const rootStepList = rootRowList.map((rootRow) => (rootDone) =>
				ask({ action: 'node', stableId: rootRow.stableId, compareVersion: true }, (rootError, rootLevel) => {
					if (rootError) failureList.push(`${rootRow.stableId}: ${rootError}`);
					else if (rootLevel.node.kind !== 'standard' || groupOf(rootLevel, 'HAS_CLASS').count !== rootRow.classCount) failureList.push(`${rootRow.stableId}: kind ${rootLevel.node.kind}, ${groupOf(rootLevel, 'HAS_CLASS').count} classes against ${rootRow.classCount}`);
					rootDone();
				}),
			);
			runInOrder(familyStepList.concat(rootStepList), () => {
				ok(`every family (${found.familyNameList.length}) and every standard root (${rootRowList.length}) opens, its classes counted as this test's Cypher counts them`, failureList.length === 0, failureList.join(' | '));
				done();
			});
		}),

		// ---- 3. two-level drills
		twoLevelDrillStep('SIF'),
		twoLevelDrillStep('EdFi'),
		twoLevelDrillStep('CEDS'),

		// ---- 4. the CEDS-root walk to an anchor and out to the standards
		(done) => cypher(
			`MATCH (:DmeStandardRoot {stableId: $cedsRootStableId})-[:HAS_CLASS]->(cedsDomain)-[:HAS_PROPERTY]->(cedsProperty)<-[anchorSlotEdge]-(anchor:HubReference {referenceTier: 'property'})
			 WHERE type(anchorSlotEdge) = ${propertySlotTextFor('anchor')} AND EXISTS { MATCH (sifRoot:DmeStandardRoot {standardFamily: 'SIF'}) MATCH (anchor)<-[:${MATCH_EDGE_PATTERN_TEXT}]-(:ForgedNode {_source: sifRoot._source}) }
			 WITH cedsDomain, cedsProperty, anchor, COUNT { MATCH (anchor)<-[:${MATCH_EDGE_PATTERN_TEXT}]-(element) RETURN DISTINCT element } AS elementCount
			 ORDER BY elementCount DESC, anchor.stableId LIMIT 1
			 RETURN cedsDomain.stableId AS cedsDomainStableId, cedsProperty.stableId AS cedsPropertyStableId, anchor.stableId AS anchorStableId, elementCount,
			        COUNT { MATCH (cedsProperty)<-[countSlotEdge]-(countAnchor:HubReference {referenceTier: 'property'}) WHERE type(countSlotEdge) = ${propertySlotTextFor('countAnchor')} } AS cedsElementCount,
			        COUNT { MATCH (cedsDomain)-[:HAS_PROPERTY]->(member) WHERE EXISTS { MATCH (member)<-[memberSlotEdge]-(memberAnchor:HubReference)<-[:${MATCH_EDGE_PATTERN_TEXT}]-() WHERE type(memberSlotEdge) = ${propertySlotTextFor('memberAnchor')} } } AS mappedPropertyCount`,
			{ cedsRootStableId: CEDS_ROOT_STABLE_ID },
			(walkRowList) => {
				const walkRow = walkRowList[0];
				if (!walkRow) { ok('CEDS walk: the graph holds a CEDS property whose element SIF maps to', false, 'none found'); done(); return; }
				ask({ action: 'node', stableId: CEDS_ROOT_STABLE_ID, compareVersion: true }, (rootError, rootLevel) => {
					const domainItem = itemIn(rootLevel, walkRow.cedsDomainStableId) || {};
					ok(`CEDS walk: the CEDS root lists the domain, ${walkRow.mappedPropertyCount} of its properties mapped to (this test's Cypher)`, !rootError && domainItem.kind === 'hubDomain' && domainItem.mappedPropertyCount === walkRow.mappedPropertyCount, rootError || JSON.stringify(domainItem));
					ask({ action: 'node', stableId: walkRow.cedsDomainStableId, compareVersion: true }, (domainError, domainLevel) => {
						const propertyItem = itemIn(domainLevel, walkRow.cedsPropertyStableId) || {};
						ok('CEDS walk: the domain lists the CEDS property, drillable, with its CEDS elements counted', !domainError && propertyItem.kind === 'hubProperty' && propertyItem.hasChildren === true && propertyItem.hubElementCount === walkRow.cedsElementCount, domainError || JSON.stringify(propertyItem));
						ask({ action: 'node', stableId: walkRow.cedsPropertyStableId, compareVersion: true }, (propertyError, propertyLevel) => {
							const elementGroup = groupOf(propertyLevel, 'USED_BY_HUB_ELEMENT');
							const anchorItem = elementGroup.itemList.find((oneItem) => oneItem.stableId === walkRow.anchorStableId) || {};
							ok(`CEDS walk: the CEDS property lists its ${walkRow.cedsElementCount} CEDS elements; the chosen one has ${walkRow.elementCount} elements mapped (this test's Cypher)`, !propertyError && elementGroup.count === walkRow.cedsElementCount && anchorItem.kind === 'hubAnchor' && anchorItem.elementCount === walkRow.elementCount, propertyError || JSON.stringify(anchorItem));
							ok('CEDS walk: the CEDS property\'s ancestors are CEDS › its domain', !propertyError && propertyLevel.ancestorList.map((oneAncestor) => oneAncestor.stableId).join() === `${CEDS_ROOT_STABLE_ID},${walkRow.cedsDomainStableId}`, JSON.stringify((propertyLevel || {}).ancestorList));
							ask({ action: 'node', stableId: walkRow.anchorStableId }, (anchorError, anchorLevel) => {
								const standardGroup = groupOf(anchorLevel, 'MAPPED_FROM_STANDARD');
								const groupElementTotal = standardGroup.itemList.reduce((runningTotal, oneGroup) => runningTotal + oneGroup.elementCount, 0);
								const sifGroup = standardGroup.itemList.find((oneGroup) => oneGroup.standardFamily === 'SIF');
								ok(`CEDS walk: the anchor groups its ${walkRow.elementCount} elements by standard, SIF among them`, !anchorError && standardGroup.count > 0 && groupElementTotal === walkRow.elementCount && Boolean(sifGroup), anchorError || `${groupElementTotal}`);
								ask({ action: 'node', stableId: (sifGroup || {}).stableId || 'standardGroup:none@none' }, (groupError, groupLevel) => {
									ok('CEDS walk: out to SIF: the SIF group opens with its elements', !groupError && groupOf(groupLevel, 'MAPPED_TO_ANCHOR').count === (sifGroup || {}).elementCount, groupError);
									ask({ action: 'pathSummary', stableIdList: ['families:all', 'family:CEDS', CEDS_ROOT_STABLE_ID, walkRow.cedsDomainStableId, walkRow.cedsPropertyStableId, walkRow.anchorStableId, (sifGroup || {}).stableId] }, (summaryError, pathSummary) => {
										const kindText = ((pathSummary || {}).nodeSummaryList || []).map((oneSummary) => oneSummary.kind).join(' › ');
										ok('CEDS walk: the whole path names itself (a reload\'s breadcrumb)', !summaryError && kindText === 'familyCatalog › family › standard › hubDomain › hubProperty › hubAnchor › standardGroup' && pathSummary.nodeSummaryList[0].name === 'Standards', summaryError || kindText);
										done();
									});
								});
							});
						});
					});
				});
			},
		),

		// a CEDS property with code-level (value-tier) anchors lists only its property-tier ones: one per domain
		(done) => cypher(
			`MATCH (cedsProperty:CedsProperty)<-[valueSlotEdge]-(valueAnchor:HubReference {referenceTier: 'value'}) WHERE type(valueSlotEdge) = ${propertySlotTextFor('valueAnchor')}
			 WITH DISTINCT cedsProperty LIMIT 1
			 RETURN cedsProperty.stableId AS cedsPropertyStableId,
			        COUNT { MATCH (cedsProperty)<-[propertyTierSlotEdge]-(propertyTierAnchor:HubReference {referenceTier: 'property'}) WHERE type(propertyTierSlotEdge) = ${propertySlotTextFor('propertyTierAnchor')} } AS propertyTierCount,
			        COUNT { MATCH (cedsProperty)<-[valueTierSlotEdge]-(valueTierAnchor:HubReference {referenceTier: 'value'}) WHERE type(valueTierSlotEdge) = ${propertySlotTextFor('valueTierAnchor')} } AS valueTierCount`,
			{},
			(tierRowList) => {
				const tierRow = tierRowList[0] || {};
				ask({ action: 'node', stableId: tierRow.cedsPropertyStableId }, (propertyError, propertyLevel) => {
					ok(`CEDS property with ${tierRow.valueTierCount} code-level anchors lists only its ${tierRow.propertyTierCount} CEDS elements (property tier)`, !propertyError && groupOf(propertyLevel, 'USED_BY_HUB_ELEMENT').count === tierRow.propertyTierCount, propertyError || `${groupOf(propertyLevel, 'USED_BY_HUB_ELEMENT').count}`);
					done();
				});
			},
		),

		// ---- 5. refusals
		(done) => ask({ action: 'node', stableId: 'families:PESC' }, (refusalText) => { ok('refusal: a families: id that is not the catalog', /'families:PESC' is not the families catalog id \(expected families:all\)/.test(refusalText || ''), refusalText); done(); }),
		(done) => ask({ action: 'pathSummary', stableIdList: ['families:x', 'family:PESC'] }, (refusalText) => { ok('refusal: a path beginning at a families: id that is not the catalog', /'families:x' is not the families catalog id/.test(refusalText || ''), refusalText); done(); }),
	];

	runInOrder(stepList, () => {
		goldenDb.close();
		console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
		process.exit(failed > 0 ? 1 : 0);
	});
});
