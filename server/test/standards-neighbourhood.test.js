'use strict';
// standards-neighbourhood.test.js — DEV-123 Phase 1: the PESC Explorer's graph reads, against the LIVE golden graph
// (read-only handle), through the same access point and mapper the server loads.
//   1. catalog: the PESC family as this test's own Cypher sees it; College Transcript in two versions;
//   2. the version oracle (spec §4): College Transcript 1.8.0 classes 206 unchanged / 4 changed / 12 new against
//      1.7.0, 0 only-in-1.7, and the spec's own key cross-checked here with this test's Cypher;
//   3. NameType: every property's strongest mapping equals this test's Cypher; all four match kinds present;
//      property-level badges answer (no collision refusal); FirstName folds, CompositeName does not;
//   4. the First Name anchor: grouped by owning standard, SIF + EdFi + PESC present, Σ elements = this test's Cypher;
//      drilling the SIF group lists exactly its elements;
//   5. an Ed-Fi element reached through the anchor resolves, with property-level mappings and an EdFi ancestor chain;
//   6. refusals by name: no action, unknown action, empty / unknown stableId, unknown family, malformed group id,
//      an unknown id in a path summary; the endpoint is logged-in only and answers 401 / 400;
//   7. RED TWINS (no graph): a version-identity collision is reported; the spec's key without the position strip
//      misreads moved properties; an unknown action is refused before any query runs.
//
// Run: /usr/local/bin/node server/test/standards-neighbourhood.test.js

const fs = require('fs');
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

// the access point exactly as access-points-dot-d builds it, over the handle given
const loadAccessPoint = (neo4jDb) => {
	const accessPointByName = {};
	require(ACCESS_POINT_PATH)({
		dotD: { logList: [], library: { add: (accessPointName, serviceFunction) => { accessPointByName[accessPointName] = serviceFunction; } } },
		passThroughParameters: { neo4jDb, dataMapping: { 'standards-neighbourhood': mapper } },
	});
	return accessPointByName['standards-neighbourhood'];
};

// runs a list of (done) => ... steps in order
const runInOrder = (stepList, callback) => {
	const runNext = (stepIndex) => {
		if (stepIndex === stepList.length) { callback(); return; }
		stepList[stepIndex](() => runNext(stepIndex + 1));
	};
	runNext(0);
};

const groupOf = (neighbourhood, relationshipType) => (neighbourhood.childGroupList || []).find((oneGroup) => oneGroup.relationshipType === relationshipType) || { itemList: [], count: 0 };
const badgeCountOf = (neighbourhood, badgeState) => ((neighbourhood.versionComparison || {}).badgeStateCountList || []).find((oneCount) => oneCount.badgeState === badgeState) || {};

console.log('\n=== DEV-123 standards-neighbourhood: the PESC Explorer reads the graph ===\n');

// ---- 7. red twins that need no graph
const collisionTwin = mapper.versionBadgeByStableId({
	digestRowList: [{ stableId: 'a', releaseIndependentId: 'type/urn:x:v1.0.0#T', definitionDigest: 'd1' }],
	comparisonDigestRowList: [
		{ stableId: 'b', releaseIndependentId: 'type/urn:x:v0.9.0#T', definitionDigest: 'd1' },
		{ stableId: 'c', releaseIndependentId: 'type/urn:x:v0.8.0#T', definitionDigest: 'd2' },
	],
	thisVersion: '1.0',
	comparedVersion: '0.9',
});
ok('red twin: two comparison rows with one version identity are reported as a collision', collisionTwin.collisionList.length === 1);
ok('version identity strips namespace versions and the element position', mapper.versionIdentityOf('type/urn:org:pesc:core:CoreMain:v1.19.0#NameType/el/3:FirstName') === 'type/urn:org:pesc:core:CoreMain#NameType/el/FirstName');
const movedPropertyBadges = mapper.versionBadgeByStableId({
	digestRowList: [{ stableId: 'new', releaseIndependentId: 'type/urn:x:v1.1.0#T/el/5:Moved', definitionDigest: 'same' }],
	comparisonDigestRowList: [{ stableId: 'old', releaseIndependentId: 'type/urn:x:v1.0.0#T/el/4:Moved', definitionDigest: 'same' }],
	thisVersion: '1.1',
	comparedVersion: '1.0',
});
ok('red twin: a property that only moved position reads unchanged, not new', movedPropertyBadges.badgeByStableId.new.badgeState === 'unchanged');
ok('comparison peer: the nearest lower version; the lowest compares with the nearest higher', mapper.comparisonPeerOf({ version: '1.8.0', peerList: [{ version: '1.7.0' }, { version: '1.8.0' }, { version: '1.10.0' }] }).version === '1.7.0' && mapper.comparisonPeerOf({ version: '1.7.0', peerList: [{ version: '1.7.0' }, { version: '1.8.0' }] }).version === '1.8.0' && mapper.comparisonPeerOf({ version: '1.0', peerList: [{ version: '1.0' }] }) === null);
const rankedMappingList = mapper.collapseMappingList([
	{ matchEdgeType: 'BROAD_MATCH', mappingConfidence: 0.9, anchorStableId: 'h1', anchorName: 'H1', subjectStableId: 's1' },
	{ matchEdgeType: 'NARROW_MATCH', mappingConfidence: 0.9, anchorStableId: 'h2', anchorName: 'H2', subjectStableId: 's1' },
	{ matchEdgeType: 'EXACT_MATCH', mappingConfidence: 0.5, anchorStableId: 'h3', anchorName: 'H3', subjectStableId: 's1' },
	{ matchEdgeType: 'CLOSE_MATCH', mappingConfidence: 0.7, anchorStableId: 'h4', anchorName: 'H4', subjectStableId: 's1' },
]);
ok('strength order: exact > close > narrow > broad, whatever the confidence', rankedMappingList.map((oneMapping) => oneMapping.matchKind).join() === 'exact,close,narrow,broad');
const cappedGroup = mapper.mapChildGroupRecordList([{ relationshipType: 'HAS_CLASS', itemCount: 501, itemList: [{ stableId: 'x', name: 'x', labelList: ['DmeClass'], mappingList: [] }] }])[0];
ok('a group whose true count exceeds its items reports truncated, with the true count', cappedGroup.truncated === true && cappedGroup.count === 501);
let twinQueryCount = 0;
loadAccessPoint({ runQuery: (cypher, params, callback) => { twinQueryCount++; callback('', []); } })({ action: 'drop' }, (refusalText) => {
	ok('red twin: an unknown action is refused by name before any query runs', /action 'drop' is not one of: catalog, node, pathSummary/.test(refusalText || '') && twinQueryCount === 0, refusalText);
});

// ---- 6. the endpoint, read as text and run with the real validator
const endpointText = fs.readFileSync(ENDPOINT_PATH, 'utf8');
ok('endpoint: logged-in roles only (user/client/admin, never public)', /getValidator\(\['user', 'client', 'admin'\]\)/.test(endpointText) && !/getValidator\(\[[^\]]*'public'/.test(endpointText));
ok('endpoint: the browser sends no Cypher (no cypher field read from the body)', !/body\.cypher|requestBody\.cypher/.test(endpointText));

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

// ---- 1-6. live
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

	const stepList = [
		// ---- 1. catalog
		(done) => cypher('MATCH (root:DmeStandardRoot {standardFamily: "PESC"}) RETURN root.releaseLabel AS releaseLabel, root.version AS version, root.stableId AS stableId', {}, (rootRowList) => {
			ask({ action: 'catalog', standardFamily: 'PESC' }, (catalogError, catalog) => {
				ok('catalog: answers the PESC family', !catalogError && catalog && Array.isArray(catalog.releaseList), catalogError);
				const releaseList = (catalog || {}).releaseList || [];
				const versionCount = releaseList.reduce((runningTotal, oneRelease) => runningTotal + oneRelease.versionList.length, 0);
				const expectedLabelCount = new Set(rootRowList.map((oneRow) => oneRow.releaseLabel)).size;
				ok(`catalog: ${expectedLabelCount} messages, ${rootRowList.length} versions, as this test's Cypher counts them`, releaseList.length === expectedLabelCount && versionCount === rootRowList.length, `${releaseList.length} messages / ${versionCount} versions`);
				const collegeTranscript = releaseList.find((oneRelease) => oneRelease.releaseLabel === 'CollegeTranscript') || { versionList: [] };
				ok('catalog: College Transcript offers 1.7.0 and 1.8.0, in version order', collegeTranscript.versionList.map((oneVersion) => oneVersion.version).join() === '1.7.0,1.8.0');
				found.ct18RootStableId = (collegeTranscript.versionList[1] || {}).stableId;
				found.ct17RootStableId = (collegeTranscript.versionList[0] || {}).stableId;
				done();
			});
		}),
		(done) => ask({ action: 'node', stableId: 'family:PESC' }, (familyError, family) => {
			const itemList = groupOf(family || {}, 'HAS_STANDARD').itemList;
			const releaseItem = itemList.find((oneItem) => oneItem.kind === 'release') || {};
			ok('family node: one item per message; a one-version message is its standard', !familyError && itemList.length === 7 && itemList.filter((oneItem) => oneItem.kind === 'standard').length === 6, familyError || `${itemList.length}`);
			ok('family node: College Transcript is a release offering 1.7.0 and 1.8.0', releaseItem.stableId === 'release:PESC/CollegeTranscript' && releaseItem.versionList.map((oneVersion) => oneVersion.version).join() === '1.7.0,1.8.0');
			done();
		}),
		(done) => ask({ action: 'node', stableId: 'release:PESC/CollegeTranscript' }, (releaseError, release) => {
			const versionList = groupOf(release || {}, 'HAS_VERSION').itemList;
			ok('release node: the version picker lists 1.8.0 then 1.7.0, each a drillable standard', !releaseError && versionList.map((oneItem) => oneItem.version).join() === '1.8.0,1.7.0' && versionList.every((oneItem) => oneItem.kind === 'standard' && oneItem.hasChildren), releaseError);
			done();
		}),
		(done) => ask({ action: 'node', stableId: 'release:PESC/NoSuchMessage' }, (refusalText) => { ok('refusal: a release the family does not have', /family 'PESC' has no message 'NoSuchMessage'/.test(refusalText || ''), refusalText); done(); }),

		// ---- 2. the version oracle
		(done) => ask({ action: 'node', stableId: found.ct18RootStableId, compareVersion: true }, (nodeError, standardLevel) => {
			ok('College Transcript 1.8.0: answers its standard level', !nodeError && standardLevel.node.kind === 'standard', nodeError);
			const classGroup = groupOf(standardLevel || {}, 'HAS_CLASS');
			ok(`College Transcript 1.8.0: ${classGroup.count} classes, none truncated`, classGroup.count === 222 && classGroup.truncated === false && classGroup.itemList.length === 222, `${classGroup.count}`);
			const badgeText = ['unchanged', 'changed', 'new'].map((badgeState) => badgeCountOf(standardLevel || {}, badgeState).itemCount).join('/');
			ok('ORACLE: 1.8.0 classes against 1.7.0 = 206 unchanged / 4 changed / 12 new', badgeText === '206/4/12' && standardLevel.versionComparison.comparedVersion === '1.7.0', badgeText);
			ok('ORACLE: every class carries its badge', classGroup.itemList.every((oneItem) => oneItem.versionBadge && oneItem.versionBadge.thisVersion === '1.8.0'));
			ok('class items carry propertyCount and mappedPropertyCount for the pie ring', classGroup.itemList.every((oneItem) => Number.isInteger(oneItem.propertyCount) && Number.isInteger(oneItem.mappedPropertyCount) && oneItem.mappedPropertyCount <= oneItem.propertyCount));
			found.nameTypeStableId = (classGroup.itemList.find((oneItem) => oneItem.name === 'NameType' && /CoreMain/.test(oneItem.stableId)) || {}).stableId;
			done();
		}),
		(done) => ask({ action: 'node', stableId: found.ct17RootStableId, compareVersion: true }, (nodeError, standardLevel) => {
			const badgeText = ['unchanged', 'changed', 'new'].map((badgeState) => badgeCountOf(standardLevel || {}, badgeState).itemCount).join('/');
			ok('ORACLE: 1.7.0 classes against 1.8.0 = 206 / 4 / 0 only-in-1.7', !nodeError && badgeText === '206/4/0' && standardLevel.versionComparison.comparedVersion === '1.8.0', nodeError || badgeText);
			done();
		}),
		// the spec's key, computed here without the mapper: strip ':vX.Y.Z' and compare digests
		(done) => cypher(
			`MATCH (root:DmeStandardRoot)-[:HAS_CLASS]->(classNode) WHERE root.standardKey IN ['pesccollegetranscript1v8v0', 'pesccollegetranscript1v7v0']
			 RETURN root.standardKey AS standardKey, classNode.releaseIndependentId AS releaseIndependentId, classNode.definitionDigest AS definitionDigest`,
			{},
			(classRowList) => {
				const specKeyOf = (releaseIndependentId) => releaseIndependentId.split(/:v[0-9]+\.[0-9]+\.[0-9]+/).join('');
				const digestByKeyOf = (standardKey) => {
					const digestByKey = new Map();
					classRowList.filter((oneRow) => oneRow.standardKey === standardKey).forEach((oneRow) => digestByKey.set(specKeyOf(oneRow.releaseIndependentId), oneRow.definitionDigest));
					return digestByKey;
				};
				const newer = digestByKeyOf('pesccollegetranscript1v8v0');
				const older = digestByKeyOf('pesccollegetranscript1v7v0');
				let unchangedCount = 0, changedCount = 0, newCount = 0;
				newer.forEach((definitionDigest, specKey) => { if (!older.has(specKey)) newCount++; else if (older.get(specKey) === definitionDigest) unchangedCount++; else changedCount++; });
				const onlyOlderCount = [...older.keys()].filter((specKey) => !newer.has(specKey)).length;
				const collisionCount = classRowList.length - newer.size - older.size;
				ok('ORACLE (independent Cypher, the spec\'s key): 206 / 4 / 12 / 0, 0 collisions', `${unchangedCount}/${changedCount}/${newCount}/${onlyOlderCount}/${collisionCount}` === '206/4/12/0/0', `${unchangedCount}/${changedCount}/${newCount}/${onlyOlderCount}/${collisionCount}`);
				done();
			},
		),

		// ---- 3. NameType
		(done) => ask({ action: 'node', stableId: found.nameTypeStableId, compareVersion: true }, (nodeError, classLevel) => {
			ok('NameType: answers its class level (property badges did not collide)', !nodeError && classLevel.node.kind === 'class' && classLevel.node.name === 'NameType', nodeError);
			const propertyGroup = groupOf(classLevel || {}, 'HAS_PROPERTY');
			found.nameTypeProperties = propertyGroup.itemList;
			ok('NameType: the ancestor chain is the 1.8.0 root', (classLevel.ancestorList || []).map((oneAncestor) => oneAncestor.kind).join() === 'standard' && classLevel.ancestorList[0].stableId === found.ct18RootStableId);
			ok('NameType: property badges are computed against 1.7.0', classLevel.versionComparison && classLevel.versionComparison.comparedVersion === '1.7.0' && propertyGroup.itemList.every((oneItem) => oneItem.versionBadge));
			ok('NameType: the class itself carries a version badge', classLevel.node.versionBadge && ['unchanged', 'changed', 'new'].indexOf(classLevel.node.versionBadge.badgeState) !== -1);
			done();
		}),
		(done) => cypher(
			`MATCH (:DmeClass {stableId: $classStableId})-[:HAS_PROPERTY]->(propertyNode)
			 OPTIONAL MATCH (propertyNode)-[:HAS_INSTANCE*0..1]->()-[matchEdge:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(anchor:HubReference)
			 RETURN propertyNode.name AS propertyName, collect({ edgeType: type(matchEdge), mappingConfidence: matchEdge.mappingConfidence, anchorName: anchor.name, anchorStableId: anchor.stableId }) AS judgmentList`,
			{ classStableId: found.nameTypeStableId },
			(propertyRowList) => {
				const rankByEdgeType = { EXACT_MATCH: 1, CLOSE_MATCH: 2, NARROW_MATCH: 3, BROAD_MATCH: 4 };
				const disagreementList = [];
				propertyRowList.forEach((oneRow) => {
					const judgmentList = oneRow.judgmentList.filter((oneJudgment) => oneJudgment.edgeType).sort((left, right) => rankByEdgeType[left.edgeType] - rankByEdgeType[right.edgeType] || right.mappingConfidence - left.mappingConfidence);
					const item = found.nameTypeProperties.find((oneItem) => oneItem.name === oneRow.propertyName) || {};
					const expectedText = judgmentList.length ? `${judgmentList[0].edgeType.split('_')[0].toLowerCase()}|${judgmentList[0].mappingConfidence}|${judgmentList[0].anchorName}` : 'unmapped';
					const answeredText = item.mapping ? `${item.mapping.matchKind}|${item.mapping.mappingConfidence}|${item.mapping.anchor.name}` : 'unmapped';
					if (expectedText !== answeredText) disagreementList.push(`${oneRow.propertyName}: ${answeredText} vs Cypher ${expectedText}`);
				});
				ok(`NameType: each of ${propertyRowList.length} properties' strongest mapping equals this test's Cypher`, disagreementList.length === 0 && found.nameTypeProperties.length === propertyRowList.length, disagreementList.join('; '));
				const kindSet = new Set(found.nameTypeProperties.filter((oneItem) => oneItem.mapping).map((oneItem) => oneItem.mapping.matchKind));
				ok('NameType: all four match kinds present (exact, close, narrow, broad)', ['exact', 'close', 'narrow', 'broad'].every((matchKind) => kindSet.has(matchKind)), [...kindSet].join());
				ok('NameType: an unmapped property reads mapping null', found.nameTypeProperties.some((oneItem) => oneItem.mapping === null));
				const firstNameItem = found.nameTypeProperties.find((oneItem) => oneItem.name === 'FirstName') || {};
				found.firstNamePropertyStableId = firstNameItem.stableId;
				found.firstNameAnchorStableId = firstNameItem.mapping && firstNameItem.mapping.anchor.stableId;
				found.compositeNameStableId = (found.nameTypeProperties.find((oneItem) => oneItem.name === 'CompositeName') || {}).stableId;
				done();
			},
		),
		(done) => ask({ action: 'node', stableId: found.firstNamePropertyStableId }, (nodeError, propertyLevel) => {
			ok('FirstName: occurrences map identically, so they fold; its mapping is close to First Name', !nodeError && propertyLevel.instanceFolding.folded === true && propertyLevel.instanceFolding.occurrenceCount > 1 && propertyLevel.mappingList[0].matchKind === 'close' && propertyLevel.mappingList[0].anchor.name === 'First Name', nodeError || JSON.stringify(propertyLevel.instanceFolding));
			ok('FirstName: the ancestor chain runs root › NameType', (propertyLevel.ancestorList || []).map((oneAncestor) => oneAncestor.name).join(' › ').endsWith('NameType'));
			ok('FirstName: the folded occurrence group is flagged folded', groupOf(propertyLevel, 'HAS_INSTANCE').folded === true);
			done();
		}),
		(done) => ask({ action: 'node', stableId: found.compositeNameStableId }, (nodeError, propertyLevel) => {
			ok('CompositeName: occurrences map differently, so they are shown', !nodeError && propertyLevel.instanceFolding.folded === false && groupOf(propertyLevel, 'HAS_INSTANCE').folded === false, nodeError || JSON.stringify(propertyLevel.instanceFolding));
			done();
		}),

		// ---- 4. the First Name anchor
		(done) => cypher(
			`MATCH (anchor:HubReference {stableId: $anchorStableId})<-[matchEdge:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]-(element)
			 MATCH (root:DmeStandardRoot {_source: element._source})
			 WITH root, element, min(CASE type(matchEdge) WHEN 'EXACT_MATCH' THEN 1 WHEN 'CLOSE_MATCH' THEN 2 WHEN 'NARROW_MATCH' THEN 3 ELSE 4 END) AS strengthRank
			 RETURN root.standardKey AS standardKey, root.standardFamily AS standardFamily, count(DISTINCT element) AS elementCount,
			        ['exact', 'close', 'narrow', 'broad'][min(strengthRank) - 1] AS strongestMatchKind`,
			{ anchorStableId: found.firstNameAnchorStableId },
			(fanOutRowList) => {
				ask({ action: 'node', stableId: found.firstNameAnchorStableId }, (nodeError, anchorLevel) => {
					ok('First Name: answers a CEDS anchor with its CEDS property and domain', !nodeError && anchorLevel.node.kind === 'cedsAnchor' && anchorLevel.node.cedsPropertyList.length > 0 && anchorLevel.node.cedsDomainList.length > 0, nodeError);
					const standardGroupList = groupOf(anchorLevel || {}, 'MAPPED_FROM_STANDARD').itemList;
					const familySet = new Set(standardGroupList.map((oneGroup) => oneGroup.standardFamily));
					ok('First Name: groups by owning standard with SIF, EdFi and PESC present', ['SIF', 'EdFi', 'PESC'].every((familyName) => familySet.has(familyName)), [...familySet].join());
					const disagreementList = fanOutRowList.filter((oneRow) => ((standardGroupList.find((oneGroup) => oneGroup.standardKey === oneRow.standardKey) || {}).elementCount) !== oneRow.elementCount).map((oneRow) => oneRow.standardKey);
					ok(`First Name: ${fanOutRowList.length} standard groups whose element counts equal this test's Cypher`, disagreementList.length === 0 && standardGroupList.length === fanOutRowList.length, disagreementList.join());
					const strongestDisagreementList = fanOutRowList.filter((oneRow) => ((standardGroupList.find((oneGroup) => oneGroup.standardKey === oneRow.standardKey) || {}).strongestMatchKind) !== oneRow.strongestMatchKind).map((oneRow) => oneRow.standardKey);
					ok('First Name: each group\'s strongest match kind equals this test\'s Cypher, with per-kind counts', strongestDisagreementList.length === 0 && standardGroupList.every((oneGroup) => oneGroup.matchKindCountList.reduce((runningTotal, oneCount) => runningTotal + oneCount.elementCount, 0) >= oneGroup.elementCount), strongestDisagreementList.join());
					found.sifGroup = standardGroupList.find((oneGroup) => oneGroup.standardFamily === 'SIF');
					found.edfiGroup = standardGroupList.find((oneGroup) => oneGroup.standardFamily === 'EdFi');
					done();
				});
			},
		),
		(done) => ask({ action: 'node', stableId: found.sifGroup.stableId }, (nodeError, groupLevel) => {
			const memberGroup = groupOf(groupLevel || {}, 'MAPPED_TO_ANCHOR');
			ok(`SIF group: lists exactly its ${found.sifGroup.elementCount} elements, each with a mapping to First Name`, !nodeError && memberGroup.count === found.sifGroup.elementCount && memberGroup.itemList.every((oneItem) => oneItem.mapping && oneItem.mapping.anchor.name === 'First Name'), nodeError || `${memberGroup.count}`);
			found.sifElement = memberGroup.itemList.find((oneItem) => /FirstName/.test(oneItem.name)) || memberGroup.itemList[0];
			done();
		}),
		(done) => ask({ action: 'node', stableId: found.sifElement.stableId }, (nodeError, elementLevel) => {
			ok(`SIF element ${found.sifElement.name}: resolves with its mapping and a SIF ancestor chain`, !nodeError && elementLevel.mappingList.length > 0 && elementLevel.node.standardFamily === 'SIF' && (elementLevel.ancestorList[0] || {}).kind === 'standard', nodeError);
			done();
		}),

		// ---- 5. Ed-Fi through the anchor
		(done) => ask({ action: 'node', stableId: found.edfiGroup.stableId }, (groupError, groupLevel) => {
			const edfiElement = groupOf(groupLevel || {}, 'MAPPED_TO_ANCHOR').itemList[0] || {};
			ask({ action: 'node', stableId: edfiElement.stableId }, (nodeError, elementLevel) => {
				ok(`Ed-Fi element ${edfiElement.name}: a property mapped at property level, drillable, under the EdFi root`, !groupError && !nodeError && elementLevel.node.kind === 'property' && elementLevel.node.standardFamily === 'EdFi' && elementLevel.mappingList.some((oneMapping) => oneMapping.anchor.stableId === found.firstNameAnchorStableId) && (elementLevel.ancestorList[0] || {}).name === 'EdFi', groupError || nodeError);
				done();
			});
		}),

		// ---- path summary
		(done) => ask({ action: 'pathSummary', stableIdList: ['family:PESC', 'release:PESC/CollegeTranscript', found.ct18RootStableId, found.nameTypeStableId, found.firstNameAnchorStableId, found.sifGroup.stableId] }, (summaryError, summary) => {
			ok('pathSummary: names and kinds every crumb of a crossing path', !summaryError && summary.nodeSummaryList.map((oneSummary) => oneSummary.kind).join() === 'family,release,standard,class,cedsAnchor,standardGroup' && summary.nodeSummaryList[5].standardFamily === 'SIF', summaryError || JSON.stringify(summary));
			done();
		}),

		// ---- 6. refusals
		(done) => ask({}, (refusalText) => { ok('refusal: no action', /action 'undefined' is not one of/.test(refusalText || ''), refusalText); done(); }),
		(done) => ask({ action: 'node', stableId: '' }, (refusalText) => { ok('refusal: empty stableId', /node requires stableId as a non-empty string/.test(refusalText || ''), refusalText); done(); }),
		(done) => ask({ action: 'node', stableId: 'no:such:node' }, (refusalText) => { ok('refusal: unknown stableId, named', /no node in this graph has stableId 'no:such:node'/.test(refusalText || ''), refusalText); done(); }),
		(done) => ask({ action: 'catalog', standardFamily: 'NOPE' }, (refusalText) => { ok('refusal: unknown family, naming the families present', /no standard in this graph belongs to family 'NOPE'; families present: .*PESC/.test(refusalText || ''), refusalText); done(); }),
		(done) => ask({ action: 'node', stableId: 'standardGroup:nogroup' }, (refusalText) => { ok('refusal: malformed standard group id', /is not a standard group id/.test(refusalText || ''), refusalText); done(); }),
		(done) => ask({ action: 'pathSummary', stableIdList: [found.ct18RootStableId, 'no:such:node'] }, (refusalText) => { ok('refusal: a path with an unknown id', /no node in this graph has stableId 'no:such:node'/.test(refusalText || ''), refusalText); done(); }),
		(done) => runEndpoint({ authclaims: { user: { role: 'public' } }, requestBody: { action: 'catalog', standardFamily: 'PESC' }, accessPoint }, (answer) => {
			ok('endpoint: a public (not logged-in) caller is answered 401', answer.statusCode === 401, `${answer.statusCode}`);
			done();
		}),
		(done) => runEndpoint({ authclaims: { user: { role: 'user' } }, requestBody: { action: 'node', stableId: 'no:such:node' }, accessPoint }, (answer) => {
			ok('endpoint: a logged-in refusal is answered 400 with its reason', answer.statusCode === 400 && /no node in this graph has stableId/.test(answer.body), `${answer.statusCode} ${answer.body}`);
			done();
		}),
		(done) => runEndpoint({ authclaims: { user: { role: 'user' } }, requestBody: { action: 'catalog', standardFamily: 'PESC' }, accessPoint }, (answer) => {
			ok('endpoint: a logged-in catalog request is answered 200 as [result]', answer.statusCode === 200 && Array.isArray(answer.body) && answer.body[0].releaseList.length > 0, `${answer.statusCode}`);
			done();
		}),
	];

	runInOrder(stepList, () => {
		goldenDb.close();
		console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
		process.exit(failed > 0 ? 1 : 0);
	});
});
