#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[Neo4jAbstraction]]
// @concept: [[AccessPointPattern]]

// standards-neighbourhood — the PESC Explorer's graph reads (DEV-123). Input { action, ... }; one handler per action,
// chosen from handlerByActionName:
//   catalog      { standardFamily }            → { standardFamily, releaseList }
//   node         { stableId, compareVersion }  → { node, ancestorList, childGroupList, mappingList, ... }
//   pathSummary  { stableIdList }              → { nodeSummaryList } (the breadcrumb of a reloaded URL)
// Runs on the golden READ-ONLY handle. Refuses by name: an absent or unknown action, an absent or unknown stableId,
// a family the graph does not hold, and a graph lacking a label the mapper reads. Nothing here is PESC-specific.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();
const { makeRequiredLabelProbe } = require('../../lib/required-label-probe');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { neo4jDb, dataMapping } = passThroughParameters;
	const mapper = dataMapping[moduleName];

	const probeRequiredLabels = makeRequiredLabelProbe({
		neo4jDb,
		ownerName: moduleName,
		requiredLabelList: mapper.requiredLabelList,
		absentReason: 'the standards explorer reads the forged standards and their CEDS hub cards',
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
	// NODE — one handler per node kind family: synthetic family, synthetic standard group, CEDS anchor, element

	const readFamilyNode = ({ standardFamily }, callback) => {
		readCatalog({ standardFamily }, (catalogError, catalog) => {
			if (catalogError) {
				callback(catalogError);
				return;
			}
			const itemList = catalog.catalogRecordList.map((oneRecord) => ({
				stableId: oneRecord.stableId,
				name: oneRecord.name,
				kind: 'standard',
				description: oneRecord.description,
				hasChildren: oneRecord.classCount > 0,
				standardKey: oneRecord.standardKey,
				standardFamily: oneRecord.standardFamily,
				releaseLabel: oneRecord.releaseLabel,
				version: oneRecord.version,
				classCount: oneRecord.classCount,
			}));
			callback('', {
				node: { stableId: mapper.familyIdOf(standardFamily), name: standardFamily, kind: 'family', standardFamily, description: '' },
				ancestorList: [],
				childGroupList: [{ relationshipType: 'HAS_STANDARD', count: itemList.length, truncated: false, itemList }],
				mappingList: [],
				releaseList: catalog.releaseList,
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
				if (!anchorRecordList.length || mapper.nodeKindOf(anchorRecordList[0].labelList) !== 'cedsAnchor') {
					next(`${moduleName}: standard group '${stableId}' names no CEDS anchor in this graph`, args);
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
					next(`${moduleName}: no element of standard '${groupIdentity.standardKey}' maps to CEDS anchor '${groupIdentity.anchorStableId}'`, args);
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
					description: `Elements of this standard mapped to the CEDS element ${anchorName}`,
					standardKey: groupIdentity.standardKey,
					version: ownPeer.version || null,
					rootStableId: ownPeer.stableId || null,
					anchor: { stableId: groupIdentity.anchorStableId, name: anchorName },
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
			runNamedQuery('anchorContextByStableId', { stableId: focusNode.stableId }, (queryError, contextRecordList) => next(queryError, { ...args, anchorContext: contextRecordList && contextRecordList[0] })),
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
				contextList.map((oneEntry) => ({ stableId: oneEntry.stableId, name: oneEntry.name, kind: itemKind, description: oneEntry.definition, hasChildren: Boolean(oneEntry.hasStructuralChildren) }));
			const childGroupList = [
				{ relationshipType: 'MAPPED_FROM_STANDARD', count: standardGroupList.length, truncated: false, itemList: standardGroupList },
				{ relationshipType: 'HAS_CEDS_PROPERTY', count: args.anchorContext.cedsPropertyList.length, truncated: false, itemList: contextItemListOf(args.anchorContext.cedsPropertyList, 'cedsProperty') },
				{ relationshipType: 'HAS_CEDS_DOMAIN', count: args.anchorContext.cedsDomainList.length, truncated: false, itemList: contextItemListOf(args.anchorContext.cedsDomainList, 'cedsDomain') },
			].filter((oneGroup) => oneGroup.count > 0);
			callback('', {
				node: { ...focusNode, referenceTier: args.anchorContext.referenceTier, cedsPropertyList: args.anchorContext.cedsPropertyList, cedsDomainList: args.anchorContext.cedsDomainList },
				ancestorList: [],
				childGroupList,
				mappingList: [],
			});
		});
	};

	const readElementNode = ({ focusNode, compareVersion }, callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) =>
			runNamedQuery('childGroupsByStableId', { stableId: focusNode.stableId }, (queryError, groupRecordList) =>
				next(queryError, { ...args, childGroupList: queryError ? [] : mapper.mapChildGroupRecordList(groupRecordList) }),
			),
		);
		taskList.push((args, next) =>
			runNamedQuery('mappingsByStableId', { stableId: focusNode.stableId }, (queryError, mappingRecordList) => next(queryError, { ...args, mappingRecord: mappingRecordList && mappingRecordList[0] })),
		);
		taskList.push((args, next) =>
			runNamedQuery('ancestorChainsByStableId', { stableId: focusNode.stableId }, (queryError, chainRecordList) => next(queryError, { ...args, ancestorList: queryError ? [] : mapper.chooseAncestorChain(chainRecordList) })),
		);

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
				node: args.focusVersionBadge ? { ...focusNode, versionBadge: args.focusVersionBadge } : focusNode,
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
		cedsAnchor: readAnchorNode,
	};

	// the handler for each synthetic id kind (mapper's syntheticIdPrefixList)
	const handlerBySyntheticKind = {
		family: ({ remainderText }, callback) => readFamilyNode({ standardFamily: remainderText }, callback),
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
		const graphStableIdList = stableIdList.filter((oneId) => !mapper.parseSyntheticId(oneId));
		runNamedQuery('nodeSummaryByStableIdList', { stableIdList: graphStableIdList }, (queryError, summaryRecordList) => {
			if (queryError) {
				callback(queryError);
				return;
			}
			const summaryByStableId = {};
			summaryRecordList.forEach((oneRecord) => {
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
				if (syntheticId.nodeKind === 'family') {
					return { stableId: oneId, name: syntheticId.remainderText, kind: 'family', standardFamily: syntheticId.remainderText };
				}
				const groupIdentity = mapper.parseStandardGroupRemainder(syntheticId.remainderText) || {};
				return { stableId: oneId, name: groupIdentity.standardKey, kind: 'standardGroup', standardKey: groupIdentity.standardKey };
			});
			callback('', { nodeSummaryList });
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
