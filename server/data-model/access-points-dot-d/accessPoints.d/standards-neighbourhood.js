#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[Neo4jAbstraction]]
// @concept: [[AccessPointPattern]]

// standards-neighbourhood — the Standards Explorer's graph reads (DEV-123; every family since 2026-10-14). Input { action, ... }; one handler per action,
// chosen from handlerByActionName:
//   catalog      { standardFamily }            → { standardFamily, releaseList }
//   node         { stableId, compareVersion }  → { node, ancestorList, childGroupList, mappingList, ... }
//                stableId is a graph stableId or a synthetic id (families:all, family:, release:, standardGroup:; see
//                the mapper); 'families:all' answers one item per standards family the graph holds;
//                compareVersion is optional: true badges a standard's classes or a class's properties against the
//                nearest other version of the same message, anything else leaves badges out
//   pathSummary  { stableIdList }              → { nodeSummaryList } (the breadcrumb of a reloaded URL)
//   versionCounterparts { stableId }           → { stableId, version, versionIdentity, counterpartList }: for every
//                other version of the node's message, { version, standardKey, standardStableId, counterpart } where
//                counterpart is null when that version has no node of the same version identity, else the node with
//                its mappings (summarised as the node action summarises them), versionBadgeState and differenceList
// Runs on the golden READ-ONLY handle. Refuses by name: an absent or unknown action, an absent or unknown stableId,
// a family or release the graph does not hold, a malformed synthetic id, a version-identity collision, and a graph
// lacking a label the mapper reads. Nothing here is PESC-specific.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();
const { makeRequiredLabelProbe } = require('../../lib/required-label-probe');
// ⟪ctdlHub P7, Q1 approved by SCARLET_ARROW 2026-10-21⟫ an anchor page names its context groups by the anchor's OWN hub's slot
// edges (they were the literals HAS_CEDS_PROPERTY / HAS_CEDS_DOMAIN, wrong on a CTDL anchor)
const { hubEdgeTypeFor } = require('../../../../cli/lib.d/data-model-explorer/lib/toolPayloadContract');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { neo4jDb, dataMapping } = passThroughParameters;
	const mapper = dataMapping[moduleName];

	const probeRequiredLabels = makeRequiredLabelProbe({
		neo4jDb,
		ownerName: moduleName,
		requiredLabelList: mapper.requiredLabelList,
		absentReason: 'the standards explorer reads the forged standards and their hub cards',
	});

	// runs one named query; a failure names the query
	const runNamedQuery = (queryName, queryParams, callback) => {
		const queryBundle = mapper.getCypher(queryName, queryParams);
		neo4jDb.runQuery(queryBundle.cypher, queryBundle.params, (queryError, recordList) => {
			if (queryError) {
				callback(`${moduleName}: ${queryName} failed: ${queryError}`);
				return;
			}
			callback('', recordList);
		});
	};

	// ================================================================================
	// CATALOG

	const readCatalog = ({ standardFamily }, callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) =>
			runNamedQuery('catalogByFamily', { standardFamily: args.standardFamily }, (queryError, catalogRecordList) => next(queryError, { ...args, catalogRecordList })),
		);

		// a family with no standards is a wrong name, not an empty family: refuse, naming the families there are
		taskList.push((args, next) => {
			if (args.catalogRecordList.length) {
				next('', args);
				return;
			}
			runNamedQuery('familyNameList', {}, (queryError, familyRecordList) => {
				if (queryError) {
					next(queryError, args);
					return;
				}
				next(`${moduleName}: no standard in this graph belongs to family '${args.standardFamily}'; families present: ${familyRecordList.map((oneRecord) => oneRecord.standardFamily).join(', ')}`, args);
			});
		});

		pipeRunner(taskList.getList(), { standardFamily }, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			callback('', { standardFamily, releaseList: mapper.mapCatalogRecordList(args.catalogRecordList), catalogRecordList: args.catalogRecordList });
		});
	};

	// ================================================================================
	// VERSION BADGES — classes of a standard, or properties of a class, against the comparison version

	const readVersionBadges = ({ focusNode, childGroupList }, callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) =>
			runNamedQuery('versionPeerRoots', { standardKey: focusNode.standardKey }, (queryError, peerList) => {
				if (queryError) {
					next(queryError, args);
					return;
				}
				next('', { ...args, comparisonPeer: mapper.comparisonPeerOf({ version: focusNode.version, peerList }) });
			}),
		);

		// both sides' class digests: the standard level badges them, the class level finds its counterpart in them
		taskList.push((args, next) => {
			if (!args.comparisonPeer) {
				next('', args);
				return;
			}
			runNamedQuery('classDigestsByStandardKey', { standardKey: focusNode.standardKey }, (thisError, classDigestRowList) => {
				if (thisError) {
					next(thisError, args);
					return;
				}
				runNamedQuery('classDigestsByStandardKey', { standardKey: args.comparisonPeer.standardKey }, (peerError, comparisonClassDigestRowList) =>
					next(peerError, { ...args, classDigestRowList, comparisonClassDigestRowList }),
				);
			});
		});

		// at a class: the class's own properties and its counterpart's
		taskList.push((args, next) => {
			if (!args.comparisonPeer || focusNode.kind !== 'class') {
				next('', args);
				return;
			}
			const focusDigestRow = args.classDigestRowList.find((oneRow) => oneRow.stableId === focusNode.stableId);
			const counterpartRow = focusDigestRow ? mapper.versionIdentityMatchOf({ releaseIndependentId: focusDigestRow.releaseIndependentId, comparisonDigestRowList: args.comparisonClassDigestRowList }) : null;
			runNamedQuery('propertyDigestsByClassStableId', { classStableId: focusNode.stableId }, (thisError, propertyDigestRowList) => {
				if (thisError || !counterpartRow) {
					next(thisError, { ...args, propertyDigestRowList, comparisonPropertyDigestRowList: [] });
					return;
				}
				runNamedQuery('propertyDigestsByClassStableId', { classStableId: counterpartRow.stableId }, (peerError, comparisonPropertyDigestRowList) =>
					next(peerError, { ...args, propertyDigestRowList, comparisonPropertyDigestRowList }),
				);
			});
		});

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			if (!args.comparisonPeer) {
				callback('', { versionComparison: null, childGroupList, focusVersionBadge: null });
				return;
			}
			const versionTextPair = { thisVersion: focusNode.version, comparedVersion: args.comparisonPeer.version };
			const classBadges = mapper.versionBadgeByStableId({ digestRowList: args.classDigestRowList, comparisonDigestRowList: args.comparisonClassDigestRowList, ...versionTextPair });
			const childBadges =
				focusNode.kind === 'class'
					? mapper.versionBadgeByStableId({ digestRowList: args.propertyDigestRowList, comparisonDigestRowList: args.comparisonPropertyDigestRowList, ...versionTextPair })
					: classBadges;
			const collisionList = classBadges.collisionList.concat(focusNode.kind === 'class' ? childBadges.collisionList : []);
			if (collisionList.length) {
				callback(`${moduleName}: the version identity collides in ${args.comparisonPeer.standardKey} (${collisionList.slice(0, 5).join(', ')}); refusing to badge rather than guess`);
				return;
			}
			const badgedChildGroupList = childGroupList.map((oneGroup) => ({
				...oneGroup,
				itemList: oneGroup.itemList.map((oneItem) => (childBadges.badgeByStableId[oneItem.stableId] ? { ...oneItem, versionBadge: childBadges.badgeByStableId[oneItem.stableId] } : oneItem)),
			}));
			const badgeStateCountList = ['unchanged', 'changed', 'new'].map((badgeState) => ({
				badgeState,
				itemCount: Object.values(childBadges.badgeByStableId).filter((oneBadge) => oneBadge.badgeState === badgeState).length,
			}));
			callback('', {
				versionComparison: { ...versionTextPair, comparedStandardKey: args.comparisonPeer.standardKey, badgeStateCountList },
				childGroupList: badgedChildGroupList,
				focusVersionBadge: focusNode.kind === 'class' ? classBadges.badgeByStableId[focusNode.stableId] || null : null,
			});
		});
	};

	// ================================================================================
	// NODE — one handler per node kind family: synthetic family, synthetic standard group, hub anchor, element

	const readFamilyNode = ({ standardFamily }, callback) => {
		readCatalog({ standardFamily }, (catalogError, catalog) => {
			if (catalogError) {
				callback(catalogError);
				return;
			}
			const itemList = mapper.mapFamilyItemList(catalog.catalogRecordList);
			callback('', {
				node: { stableId: mapper.familyIdOf(standardFamily), name: standardFamily, kind: 'family', standardFamily, description: '' },
				ancestorList: [],
				childGroupList: [{ relationshipType: 'HAS_STANDARD', count: itemList.length, truncated: false, itemList }],
				mappingList: [],
				releaseList: catalog.releaseList,
			});
		});
	};

	// the explorer's top: every family the graph holds, read from the graph (never a list kept here)
	const readFamilyCatalogNode = ({ stableId }, callback) => {
		if (!mapper.isFamilyCatalogId(stableId)) {
			callback(`${moduleName}: '${stableId}' is not the families catalog id (expected ${mapper.FAMILY_CATALOG_STABLE_ID})`);
			return;
		}
		runNamedQuery('familyCatalog', {}, (queryError, familyRecordList) => {
			if (queryError) {
				callback(queryError);
				return;
			}
			if (!familyRecordList.length) {
				callback(`${moduleName}: no standard in this graph names a standardFamily`);
				return;
			}
			const itemList = mapper.mapFamilyCatalogItemList(familyRecordList);
			callback('', {
				node: { stableId, name: 'Standards', kind: 'familyCatalog', description: '' },
				ancestorList: [],
				childGroupList: [{ relationshipType: 'HAS_FAMILY', count: itemList.length, truncated: false, itemList }],
				mappingList: [],
			});
		});
	};

	const readReleaseNode = ({ stableId, remainderText }, callback) => {
		const releaseIdentity = mapper.parseReleaseRemainder(remainderText);
		if (!releaseIdentity) {
			callback(`${moduleName}: '${stableId}' is not a release id (expected release:<standardFamily>/<releaseLabel>)`);
			return;
		}
		readCatalog({ standardFamily: releaseIdentity.standardFamily }, (catalogError, catalog) => {
			if (catalogError) {
				callback(catalogError);
				return;
			}
			const versionRecordList = catalog.catalogRecordList.filter((oneRecord) => oneRecord.releaseLabel === releaseIdentity.releaseLabel);
			if (!versionRecordList.length) {
				callback(`${moduleName}: family '${releaseIdentity.standardFamily}' has no message '${releaseIdentity.releaseLabel}'`);
				return;
			}
			const itemList = versionRecordList.map(mapper.mapStandardItem).reverse();
			callback('', {
				node: { stableId, name: releaseIdentity.releaseLabel, kind: 'release', standardFamily: releaseIdentity.standardFamily, releaseLabel: releaseIdentity.releaseLabel, description: '' },
				ancestorList: [],
				childGroupList: [{ relationshipType: 'HAS_VERSION', count: itemList.length, truncated: false, itemList }],
				mappingList: [],
			});
		});
	};

	const readStandardGroupNode = ({ stableId, remainderText }, callback) => {
		const groupIdentity = mapper.parseStandardGroupRemainder(remainderText);
		if (!groupIdentity) {
			callback(`${moduleName}: '${stableId}' is not a standard group id (expected standardGroup:<standardKey>@<anchorStableId>)`);
			return;
		}
		const taskList = new taskListPlus();

		taskList.push((args, next) =>
			runNamedQuery('nodeByStableId', { stableId: groupIdentity.anchorStableId }, (queryError, anchorRecordList) => {
				if (queryError) {
					next(queryError, args);
					return;
				}
				if (!anchorRecordList.length || mapper.nodeKindOf(anchorRecordList[0].labelList, anchorRecordList[0].hubName) !== 'hubAnchor') {
					next(`${moduleName}: standard group '${stableId}' names no hub anchor in this graph`, args);
					return;
				}
				next('', { ...args, anchorNode: mapper.mapNodeRecord(anchorRecordList[0]) });
			}),
		);

		taskList.push((args, next) =>
			runNamedQuery('standardGroupMembers', groupIdentity, (queryError, memberRecordList) => {
				if (queryError) {
					next(queryError, args);
					return;
				}
				if (!memberRecordList.length) {
					next(`${moduleName}: no element of standard '${groupIdentity.standardKey}' maps to hub anchor '${groupIdentity.anchorStableId}'`, args);
					return;
				}
				next('', { ...args, memberRecord: memberRecordList[0] });
			}),
		);

		taskList.push((args, next) =>
			runNamedQuery('versionPeerRoots', { standardKey: groupIdentity.standardKey }, (queryError, peerList) => next(queryError, { ...args, peerList })),
		);

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			const anchorName = args.anchorNode.name;
			const itemList = args.memberRecord.itemList.map((oneRecord) => {
				const oneItem = mapper.mapChildItem(oneRecord);
				return { ...oneItem, mapping: oneItem.mapping ? { ...oneItem.mapping, anchor: { stableId: groupIdentity.anchorStableId, name: anchorName } } : null };
			});
			const ownPeer = (args.peerList || []).find((onePeer) => onePeer.standardKey === groupIdentity.standardKey) || {};
			callback('', {
				node: {
					stableId,
					name: groupIdentity.standardKey,
					kind: 'standardGroup',
					description: `Elements of this standard mapped to the ${args.anchorNode.hubName} element ${anchorName}`,
					standardKey: groupIdentity.standardKey,
					standardFamily: ownPeer.standardFamily || null,
					releaseLabel: ownPeer.releaseLabel || null,
					version: ownPeer.version || null,
					rootStableId: ownPeer.stableId || null,
					anchor: { stableId: groupIdentity.anchorStableId, name: anchorName },
					otherVersionList: mapper.otherVersionListOf({ peerList: args.peerList, standardKey: groupIdentity.standardKey }),
				},
				ancestorList: [],
				childGroupList: [{ relationshipType: 'MAPPED_TO_ANCHOR', count: args.memberRecord.itemCount, truncated: args.memberRecord.itemCount > itemList.length, itemList }],
				mappingList: [],
			});
		});
	};

	const readAnchorNode = ({ focusNode }, callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) =>
			runNamedQuery('anchorContextByStableId', { stableId: focusNode.stableId }, (queryError, contextRecordList) => {
				const anchorContext = contextRecordList && contextRecordList[0];
				if (!queryError && (!anchorContext || !anchorContext.hubName)) {
					next(`${moduleName}: the hub anchor '${focusNode.stableId}' names no hubName; its context edges cannot be named`, args);
					return;
				}
				next(queryError, { ...args, anchorContext });
			}),
		);
		taskList.push((args, next) =>
			runNamedQuery('anchorFanOutByStableId', { stableId: focusNode.stableId }, (queryError, fanOutRecordList) => next(queryError, { ...args, fanOutRecordList })),
		);

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			const standardGroupList = mapper.mapAnchorFanOut({ fanOutRecordList: args.fanOutRecordList, anchorStableId: focusNode.stableId });
			const contextItemListOf = (contextList, itemKind) =>
				contextList.map((oneEntry) => ({ stableId: oneEntry.stableId, name: oneEntry.name, kind: itemKind, hubName: args.anchorContext.hubName, description: oneEntry.definition, hasChildren: Boolean(oneEntry.hasStructuralChildren) }));
			const childGroupList = [
				{ relationshipType: 'MAPPED_FROM_STANDARD', count: standardGroupList.length, truncated: false, itemList: standardGroupList },
				{ relationshipType: hubEdgeTypeFor(args.anchorContext.hubName, 'PROPERTY'), count: args.anchorContext.hubPropertyList.length, truncated: false, itemList: contextItemListOf(args.anchorContext.hubPropertyList, 'hubProperty') },
				{ relationshipType: hubEdgeTypeFor(args.anchorContext.hubName, 'DOMAIN'), count: args.anchorContext.hubDomainList.length, truncated: false, itemList: contextItemListOf(args.anchorContext.hubDomainList, 'hubDomain') },
			].filter((oneGroup) => oneGroup.count > 0);
			callback('', {
				node: { ...focusNode, referenceTier: args.anchorContext.referenceTier, hubPropertyList: args.anchorContext.hubPropertyList, hubDomainList: args.anchorContext.hubDomainList },
				ancestorList: [],
				childGroupList,
				mappingList: [],
			});
		});
	};

	// a hub property's way out: its hub elements, which point AT it, so the structural child read cannot see them
	const readHubElementGroup = ({ focusNode }, callback) =>
		runNamedQuery('hubElementsByHubPropertyStableId', { stableId: focusNode.stableId }, (queryError, groupRecordList) => {
			if (queryError) {
				callback(queryError);
				return;
			}
			callback('', groupRecordList.length ? [mapper.mapHubElementGroupRecord(groupRecordList[0])] : []);
		});

	// child groups a node kind has beyond its structural children: kind → reader answering a list of groups
	const extraChildGroupReaderByNodeKind = {
		hubProperty: readHubElementGroup,
	};

	const readElementNode = ({ focusNode, compareVersion }, callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) =>
			runNamedQuery('childGroupsByStableId', { stableId: focusNode.stableId }, (queryError, groupRecordList) =>
				next(queryError, { ...args, childGroupList: queryError ? [] : mapper.mapChildGroupRecordList(groupRecordList) }),
			),
		);
		taskList.push((args, next) => {
			const extraGroupReader = extraChildGroupReaderByNodeKind[focusNode.kind];
			if (!extraGroupReader) {
				next('', args);
				return;
			}
			extraGroupReader({ focusNode }, (readError, extraGroupList) => next(readError, { ...args, childGroupList: readError ? args.childGroupList : extraGroupList.concat(args.childGroupList) }));
		});
		taskList.push((args, next) =>
			runNamedQuery('mappingsByStableId', { stableId: focusNode.stableId }, (queryError, mappingRecordList) => next(queryError, { ...args, mappingRecord: mappingRecordList && mappingRecordList[0] })),
		);
		taskList.push((args, next) =>
			runNamedQuery('ancestorChainsByStableId', { stableId: focusNode.stableId }, (queryError, chainRecordList) => next(queryError, { ...args, ancestorList: queryError ? [] : mapper.chooseAncestorChain(chainRecordList) })),
		);

		// the message's other versions, so the browser knows whether version tiles are worth a request
		taskList.push((args, next) => {
			if (!focusNode.standardKey) {
				next('', { ...args, otherVersionList: [] });
				return;
			}
			runNamedQuery('versionPeerRoots', { standardKey: focusNode.standardKey }, (queryError, peerList) =>
				next(queryError, { ...args, otherVersionList: queryError ? [] : mapper.otherVersionListOf({ peerList, standardKey: focusNode.standardKey }) }),
			);
		});

		// version badges at the two levels the spec badges: a standard's classes, a class's properties
		taskList.push((args, next) => {
			if (!compareVersion || (focusNode.kind !== 'standard' && focusNode.kind !== 'class')) {
				next('', { ...args, versionComparison: null, focusVersionBadge: null });
				return;
			}
			readVersionBadges({ focusNode, childGroupList: args.childGroupList }, (badgeError, badgeResult) => next(badgeError, { ...args, ...badgeResult }));
		});

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			const mappingRowList = args.mappingRecord ? args.mappingRecord.mappingRowList : [];
			const occurrenceStableIdList = args.mappingRecord ? args.mappingRecord.occurrenceStableIdList : [];
			const instanceFolding = focusNode.kind === 'property' ? mapper.instanceFoldingOf({ mappingRowList, occurrenceStableIdList }) : null;
			const childGroupList = instanceFolding ? args.childGroupList.map((oneGroup) => (oneGroup.relationshipType === 'HAS_INSTANCE' ? { ...oneGroup, folded: instanceFolding.folded } : oneGroup)) : args.childGroupList;
			callback('', {
				node: { ...focusNode, otherVersionList: args.otherVersionList, ...(args.focusVersionBadge ? { versionBadge: args.focusVersionBadge } : {}) },
				ancestorList: args.ancestorList,
				childGroupList,
				mappingList: mapper.collapseMappingList(mappingRowList),
				instanceFolding,
				versionComparison: args.versionComparison,
			});
		});
	};

	// the handler for a node kind; every kind not named here is a structural element
	const handlerByNodeKind = {
		hubAnchor: readAnchorNode,
	};

	// the handler for each synthetic id kind (mapper's syntheticIdPrefixList)
	const handlerBySyntheticKind = {
		familyCatalog: readFamilyCatalogNode,
		family: ({ remainderText }, callback) => readFamilyNode({ standardFamily: remainderText }, callback),
		release: readReleaseNode,
		standardGroup: readStandardGroupNode,
	};

	const readNode = ({ stableId, compareVersion }, callback) => {
		if (typeof stableId !== 'string' || stableId.trim() === '') {
			callback(`${moduleName}: node requires stableId as a non-empty string (received ${JSON.stringify(stableId)})`);
			return;
		}
		const syntheticId = mapper.parseSyntheticId(stableId);
		if (syntheticId) {
			handlerBySyntheticKind[syntheticId.nodeKind]({ stableId, remainderText: syntheticId.remainderText }, callback);
			return;
		}
		runNamedQuery('nodeByStableId', { stableId }, (queryError, nodeRecordList) => {
			if (queryError) {
				callback(queryError);
				return;
			}
			if (!nodeRecordList.length) {
				callback(`${moduleName}: no node in this graph has stableId '${stableId}'`);
				return;
			}
			const focusNode = mapper.mapNodeRecord(nodeRecordList[0]);
			const nodeHandler = handlerByNodeKind[focusNode.kind] || readElementNode;
			nodeHandler({ focusNode, compareVersion: compareVersion === true }, callback);
		});
	};

	// ================================================================================
	// PATH SUMMARY — names and kinds for a reloaded breadcrumb; every id must resolve

	const readPathSummary = ({ stableIdList }, callback) => {
		if (!Array.isArray(stableIdList) || stableIdList.length === 0 || stableIdList.some((oneId) => typeof oneId !== 'string' || oneId === '')) {
			callback(`${moduleName}: pathSummary requires stableIdList as a non-empty list of stableIds (received ${JSON.stringify(stableIdList)})`);
			return;
		}
		const strayCatalogIdList = stableIdList.filter((oneId) => (mapper.parseSyntheticId(oneId) || {}).nodeKind === 'familyCatalog' && !mapper.isFamilyCatalogId(oneId));
		if (strayCatalogIdList.length) {
			callback(`${moduleName}: ${strayCatalogIdList.map((oneId) => `'${oneId}'`).join(', ')} is not the families catalog id (expected ${mapper.FAMILY_CATALOG_STABLE_ID})`);
			return;
		}
		const graphStableIdList = stableIdList.filter((oneId) => !mapper.parseSyntheticId(oneId));
		const groupIdentityByStableId = {};
		stableIdList.forEach((oneId) => {
			const syntheticId = mapper.parseSyntheticId(oneId);
			if (syntheticId && syntheticId.nodeKind === 'standardGroup') {
				groupIdentityByStableId[oneId] = mapper.parseStandardGroupRemainder(syntheticId.remainderText) || {};
			}
		});
		const taskList = new taskListPlus();

		taskList.push((args, next) =>
			runNamedQuery('nodeSummaryByStableIdList', { stableIdList: graphStableIdList }, (queryError, summaryRecordList) => next(queryError, { ...args, summaryRecordList })),
		);
		taskList.push((args, next) =>
			runNamedQuery('rootSummaryByStandardKeyList', { standardKeyList: Object.values(groupIdentityByStableId).map((oneIdentity) => oneIdentity.standardKey).filter(Boolean) }, (queryError, rootRecordList) =>
				next(queryError, { ...args, rootRecordList }),
			),
		);

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			const summaryByStableId = {};
			args.summaryRecordList.forEach((oneRecord) => {
				summaryByStableId[oneRecord.stableId] = mapper.mapNodeSummaryRecord(oneRecord);
			});
			const unknownIdList = graphStableIdList.filter((oneId) => !summaryByStableId[oneId]);
			if (unknownIdList.length) {
				callback(`${moduleName}: no node in this graph has stableId ${unknownIdList.map((oneId) => `'${oneId}'`).join(', ')}`);
				return;
			}
			const nodeSummaryList = stableIdList.map((oneId) => {
				const syntheticId = mapper.parseSyntheticId(oneId);
				if (!syntheticId) {
					return summaryByStableId[oneId];
				}
				if (syntheticId.nodeKind === 'familyCatalog') {
					return { stableId: oneId, name: 'Standards', kind: 'familyCatalog' };
				}
				if (syntheticId.nodeKind === 'family') {
					return { stableId: oneId, name: syntheticId.remainderText, kind: 'family', standardFamily: syntheticId.remainderText };
				}
				if (syntheticId.nodeKind === 'release') {
					const releaseIdentity = mapper.parseReleaseRemainder(syntheticId.remainderText) || {};
					return { stableId: oneId, name: releaseIdentity.releaseLabel, kind: 'release', standardFamily: releaseIdentity.standardFamily, releaseLabel: releaseIdentity.releaseLabel };
				}
				const groupIdentity = groupIdentityByStableId[oneId];
				const rootRecord = args.rootRecordList.find((oneRecord) => oneRecord.standardKey === groupIdentity.standardKey) || {};
				return { stableId: oneId, name: groupIdentity.standardKey, kind: 'standardGroup', standardKey: groupIdentity.standardKey, standardFamily: rootRecord.standardFamily || null, releaseLabel: rootRecord.releaseLabel || null, version: rootRecord.version || null };
			});
			callback('', { nodeSummaryList });
		});
	};

	// ================================================================================
	// VERSION COUNTERPARTS — the same item in every other version of its message (the detail panel's version tiles)

	// one counterpart as the panel shows it: the node, its mappings folded as readElementNode folds them, its ancestors
	const readCounterpart = ({ counterpartStableId, focusFacts }, callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) =>
			runNamedQuery('nodeByStableId', { stableId: counterpartStableId }, (queryError, nodeRecordList) => next(queryError, { ...args, counterpartNode: queryError ? null : mapper.mapNodeRecord(nodeRecordList[0]) })),
		);
		taskList.push((args, next) =>
			runNamedQuery('mappingsByStableId', { stableId: counterpartStableId }, (queryError, mappingRecordList) => next(queryError, { ...args, mappingRecord: mappingRecordList && mappingRecordList[0] })),
		);
		taskList.push((args, next) =>
			runNamedQuery('versionComparisonFacts', { stableId: counterpartStableId }, (queryError, factRecordList) => next(queryError, { ...args, counterpartFacts: factRecordList && factRecordList[0] })),
		);
		taskList.push((args, next) =>
			runNamedQuery('ancestorChainsByStableId', { stableId: counterpartStableId }, (queryError, chainRecordList) => next(queryError, { ...args, ancestorList: queryError ? [] : mapper.chooseAncestorChain(chainRecordList) })),
		);

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			const mappingRowList = args.mappingRecord ? args.mappingRecord.mappingRowList : [];
			const occurrenceStableIdList = args.mappingRecord ? args.mappingRecord.occurrenceStableIdList : [];
			const differenceList = mapper.versionDifferenceListOf({ thisFacts: focusFacts, counterpartFacts: args.counterpartFacts });
			callback('', {
				stableId: args.counterpartNode.stableId,
				name: args.counterpartNode.name,
				kind: args.counterpartNode.kind,
				description: args.counterpartNode.description,
				mappingList: mapper.collapseMappingList(mappingRowList),
				instanceFolding: args.counterpartNode.kind === 'property' ? mapper.instanceFoldingOf({ mappingRowList, occurrenceStableIdList }) : null,
				versionBadgeState: differenceList.length ? 'changed' : 'unchanged',
				differenceList,
				ancestorList: args.ancestorList,
			});
		});
	};

	// one other version: find the node of the same version identity there (a second one is a collision, refused)
	const readVersionCounterpart = ({ focusNode, focusRecord, focusFacts, onePeer }, callback) => {
		runNamedQuery('counterpartCandidates', { standardSourceName: onePeer.standardSourceName, name: focusNode.name }, (queryError, candidateList) => {
			if (queryError) {
				callback(queryError);
				return;
			}
			const focusIdentity = mapper.versionIdentityOf(focusRecord.releaseIndependentId);
			const matchList = candidateList.filter((oneCandidate) => mapper.versionIdentityOf(oneCandidate.releaseIndependentId) === focusIdentity);
			const versionEntry = { version: onePeer.version, standardKey: onePeer.standardKey, standardStableId: onePeer.stableId };
			if (matchList.length > 1) {
				callback(`${moduleName}: the version identity '${focusIdentity}' collides in ${onePeer.standardKey} (${matchList.map((oneMatch) => oneMatch.stableId).join(', ')}); refusing to pick a counterpart rather than guess`);
				return;
			}
			if (matchList.length === 0) {
				callback('', { ...versionEntry, counterpart: null });
				return;
			}
			readCounterpart({ counterpartStableId: matchList[0].stableId, focusFacts }, (counterpartError, counterpart) => callback(counterpartError, counterpartError ? undefined : { ...versionEntry, counterpart }));
		});
	};

	const readVersionCounterparts = ({ stableId }, callback) => {
		if (typeof stableId !== 'string' || stableId.trim() === '') {
			callback(`${moduleName}: versionCounterparts requires stableId as a non-empty string (received ${JSON.stringify(stableId)})`);
			return;
		}
		if (mapper.parseSyntheticId(stableId)) {
			callback(`${moduleName}: '${stableId}' is a synthetic id, not a graph node; only graph nodes have version counterparts`);
			return;
		}
		const taskList = new taskListPlus();

		taskList.push((args, next) =>
			runNamedQuery('nodeByStableId', { stableId }, (queryError, nodeRecordList) => {
				if (queryError) {
					next(queryError, args);
					return;
				}
				if (!nodeRecordList.length) {
					next(`${moduleName}: no node in this graph has stableId '${stableId}'`, args);
					return;
				}
				next('', { ...args, focusRecord: nodeRecordList[0], focusNode: mapper.mapNodeRecord(nodeRecordList[0]) });
			}),
		);

		// a node without a version identity, or outside any standard, has no counterparts to look for
		taskList.push((args, next) => {
			if (!args.focusNode.hasVersionIdentity || !args.focusNode.standardKey) {
				next('', { ...args, otherPeerList: [] });
				return;
			}
			runNamedQuery('versionPeerRoots', { standardKey: args.focusNode.standardKey }, (queryError, peerList) => {
				if (queryError) {
					next(queryError, args);
					return;
				}
				const otherStandardKeyList = mapper.otherVersionListOf({ peerList, standardKey: args.focusNode.standardKey }).map((oneVersion) => oneVersion.standardKey);
				next('', { ...args, otherPeerList: otherStandardKeyList.map((standardKey) => peerList.find((onePeer) => onePeer.standardKey === standardKey)) });
			});
		});

		taskList.push((args, next) => {
			if (!args.otherPeerList.length) {
				next('', args);
				return;
			}
			runNamedQuery('versionComparisonFacts', { stableId }, (queryError, factRecordList) => next(queryError, { ...args, focusFacts: factRecordList && factRecordList[0] }));
		});

		// one other version at a time, in newest-first order
		taskList.push((args, next) => {
			const peerTaskList = new taskListPlus();
			args.otherPeerList.forEach((onePeer) =>
				peerTaskList.push((peerArgs, peerNext) =>
					readVersionCounterpart({ focusNode: args.focusNode, focusRecord: args.focusRecord, focusFacts: args.focusFacts, onePeer }, (peerError, versionEntry) =>
						peerNext(peerError, { counterpartList: peerError ? peerArgs.counterpartList : peerArgs.counterpartList.concat([versionEntry]) }),
					),
				),
			);
			pipeRunner(peerTaskList.getList(), { counterpartList: [] }, (peerPipeError, peerArgs) => next(peerPipeError, { ...args, counterpartList: peerPipeError ? [] : peerArgs.counterpartList }));
		});

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			callback('', {
				stableId,
				version: args.focusNode.version || null,
				versionIdentity: mapper.versionIdentityOf(args.focusRecord.releaseIndependentId),
				counterpartList: args.counterpartList || [],
			});
		});
	};

	// ================================================================================
	// SERVICE FUNCTION

	const handlerByActionName = {
		catalog: (xQuery, callback) => {
			if (typeof xQuery.standardFamily !== 'string' || xQuery.standardFamily.trim() === '') {
				callback(`${moduleName}: catalog requires standardFamily as a non-empty string (received ${JSON.stringify(xQuery.standardFamily)})`);
				return;
			}
			readCatalog({ standardFamily: xQuery.standardFamily }, (catalogError, catalog) => callback(catalogError, catalogError ? undefined : { standardFamily: catalog.standardFamily, releaseList: catalog.releaseList }));
		},
		node: (xQuery, callback) => readNode({ stableId: xQuery.stableId, compareVersion: xQuery.compareVersion }, callback),
		pathSummary: (xQuery, callback) => readPathSummary({ stableIdList: xQuery.stableIdList }, callback),
		versionCounterparts: (xQuery, callback) => readVersionCounterparts({ stableId: xQuery.stableId }, callback),
	};

	const serviceFunction = (xQuery, callback) => {
		const taskList = new taskListPlus();

		// STAGE 1: the action is REQUIRED and must be one this access point answers
		taskList.push((args, next) => {
			const actionHandler = handlerByActionName[args.xQuery.action];
			if (!actionHandler) {
				next(`${moduleName}: action '${args.xQuery.action}' is not one of: ${Object.keys(handlerByActionName).join(', ')}`, args);
				return;
			}
			next('', { ...args, actionHandler });
		});

		// STAGE 2: the graph must carry every label the queries read
		taskList.push((args, next) => probeRequiredLabels((probeError) => next(probeError, args)));

		// STAGE 3: the action
		taskList.push((args, next) => args.actionHandler(args.xQuery, (actionError, actionResult) => next(actionError, { ...args, actionResult })));

		pipeRunner(taskList.getList(), { xQuery: xQuery || {} }, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			callback('', args.actionResult);
		});
	};

	// ================================================================================
	// ACCESS POINT REGISTRATION

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
