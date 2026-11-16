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
//                ⟪meaningsExplorer⟫ and the Meanings explorer's walk: meanings:all, meaningHub:, meaningDomain:, meaning: (⟪meaningsPolish⟫ meaningProperty: is refused by name)
//                (the mapper's meaningSyntheticIdPrefixList); a meaning: node adds tuple, rangePartList, expressedInGroupList and its place
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
// ⟪explorerUris⟫ the URI each citable thing carries, from the standards query core's proved minter
const { readUriMinter, uriFieldsOf, elementListUriFieldsOf } = require('../../lib/explorer-uri-fields');
// ⟪meaningsExplorer⟫ a meaning's tuple, read by the one reader of card tuples
const { hubCardTupleFor } = require('../../../lib/standards-query/hubCardTuple');
// ⟪meaningsClarity, Addendum A⟫ the one reader of an element's meaning facts, shared with the /edc element page
const { elementMeaningFactsFor } = require('../../../lib/edc-resolver/elementMeaningFacts');
// ⟪meaningsPolish⟫ the meanings walk's refusal words (data), and the graph's native-identifier declarations (a domain's id in its hub's standard)
const meaningsWalkWording = require('../../../lib/meanings-walk-wording.json');
const { readNativeIdentifierDeclarations } = require('../../../lib/native-identifier-declarations');
// a wording template's {names} filled from valueByName; a name with no value is a programming error and throws by name, never leaves a blank
const wordingOf = (templateText, valueByName) =>
	templateText.replace(/\{([A-Za-z]+)\}/g, (placeholderText, valueName) => {
		if (valueByName[valueName] === undefined || valueByName[valueName] === null) throw new Error(`standards-neighbourhood: wording '${templateText}' needs a value for '${valueName}'`);
		return String(valueByName[valueName]);
	});

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { neo4jDb, dataMapping, accessPointsDotD } = passThroughParameters;
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

	// ================================================================================
	// ⟪meaningsExplorer, WORKORDER-meaningsExplorer-111026⟫ THE MEANINGS WALK — the hub cards as the subject: meanings:all → a group (today a hub, by the
	// mapper's meaningCatalogGrouping) → its domains → a domain's meanings → one meaning (⟪meaningsPolish⟫ no property level). Each level is a synthetic id (the mapper
	// names them); every level answers the node action's own shape { node, ancestorList, childGroupList, mappingList }, so the Explorer's views draw it.

	const MEANING_CATALOG_NAME = 'Meanings';

	const readMeaningCatalogNode = ({ stableId }, callback) => {
		if (!mapper.isMeaningCatalogId(stableId)) {
			callback(`${moduleName}: '${stableId}' is not the meanings catalog id (expected ${mapper.MEANING_CATALOG_STABLE_ID})`);
			return;
		}
		const grouping = mapper.meaningCatalogGrouping;
		const taskList = new taskListPlus();
		// ⟪meaningsPolish⟫ the graph's hubs first: the catalog's counts match each hub's slot edges by type
		taskList.push((args, next) =>
			runNamedQuery('hubFamilyList', {}, (queryError, hubRecordList) => {
				if (!queryError && !hubRecordList.length) {
					next(`${moduleName}: this graph holds no :HubDefinition, so it holds no meanings`, args);
					return;
				}
				next(queryError, { ...args, hubNameList: (hubRecordList || []).map((oneRecord) => oneRecord.hubName) });
			}),
		);
		taskList.push((args, next) => runNamedQuery(grouping.groupListQueryName, { hubNameList: args.hubNameList }, (queryError, groupRecordList) => next(queryError, { ...args, groupRecordList })));
		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			const itemList = args.groupRecordList.map(mapper.mapMeaningHubItem);
			callback('', {
				node: { stableId, name: MEANING_CATALOG_NAME, kind: 'meaningCatalog', description: '', listedTierList: [...mapper.meaningListTierList] },
				ancestorList: [],
				childGroupList: [{ relationshipType: grouping.relationshipType, count: itemList.length, truncated: false, itemList }],
				mappingList: [],
			});
		});
	};

	// a hub name the graph does not hold is refused, naming the hubs it does
	const refuseUnknownHub = ({ hubName }, callback) =>
		runNamedQuery('hubFamilyList', {}, (queryError, hubRecordList) =>
			callback(queryError || `${moduleName}: no :HubDefinition in this graph has hubName '${hubName}'; hubs present: ${hubRecordList.map((oneRecord) => oneRecord.hubName).join(', ')}`),
		);

	const readMeaningHubNode = ({ stableId, remainderText }, callback) => {
		const hubName = remainderText;
		const taskList = new taskListPlus();

		taskList.push((args, next) =>
			runNamedQuery('meaningHubByName', { hubName }, (queryError, hubRecordList) => {
				if (queryError) {
					next(queryError, args);
					return;
				}
				if (!hubRecordList.length) {
					refuseUnknownHub({ hubName }, (refusalText) => next(refusalText, args));
					return;
				}
				next('', { ...args, hubRecord: hubRecordList[0] });
			}),
		);
		taskList.push((args, next) => readDomainIdentifierDeclarations((declarationError, declarationAnswer) => next(declarationError, { ...args, ...declarationAnswer })));
		taskList.push((args, next) =>
			runNamedQuery('meaningDomainsByHubName', { hubName, declarationList: args.declarationList }, (queryError, domainRecordList) => next(queryError, { ...args, domainRecordList })),
		);

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			const { hubRecord, declarationList, declarationAbsentName } = args;
			const itemList = args.domainRecordList.map((domainRecord) => mapper.mapMeaningDomainItem({ domainRecord, hubName, standardFamily: hubRecord.standardFamily, declarationList, declarationAbsentName }));
			callback('', {
				node: {
					stableId,
					name: hubName,
					kind: 'meaningHub',
					hubName,
					standardFamily: hubRecord.standardFamily || null,
					description: hubRecord.hubTitle || '',
					// ⟪review B1, N8⟫ what this level lists, as the hub's row says it: its domains, and the property meanings they hold
					domainCount: itemList.length,
					meaningCount: itemList.reduce((soFar, oneDomain) => soFar + oneDomain.meaningCount, 0),
				},
				ancestorList: [],
				childGroupList: [mapper.cappedChildGroupOf({ relationshipType: 'HAS_MEANING_DOMAIN', itemList })],
				mappingList: [],
			});
		});
	};

	// ⟪meaningsClarity, Addendum A⟫ an element's meaning facts, read by THE one reader the /edc element page reads too (lib/edc-resolver/elementMeaningFacts.js), on
	// the golden's plain rows
	const runRowsOnGolden = (cypherText, cypherParameters, done) => neo4jDb.runQuery(cypherText, cypherParameters, done);
	const readElementMeaningFacts = ({ elementStableId, withIncomingValueCount }, callback) => elementMeaningFactsFor({ mapper, runRows: runRowsOnGolden, elementStableId, readsInParallel: true, withIncomingValueCount }, callback);

	const readMeaningDomainNode = ({ stableId, remainderText }, callback) => {
		const domainStableId = remainderText;
		const taskList = new taskListPlus();

		taskList.push((args, next) => readDomainIdentifierDeclarations((declarationError, declarationAnswer) => next(declarationError, { ...args, ...declarationAnswer })));
		taskList.push((args, next) =>
			runNamedQuery('meaningDomainContext', { domainStableId, declarationList: args.declarationList }, (queryError, contextRecordList) => {
				if (queryError) {
					next(queryError, args);
					return;
				}
				if (!contextRecordList.length) {
					next(`${moduleName}: no node in this graph has stableId '${domainStableId}'`, args);
					return;
				}
				if (!contextRecordList[0].hubName) {
					next(`${moduleName}: '${domainStableId}' belongs to no hub, so it is no meaning domain`, args);
					return;
				}
				next('', { ...args, domainContext: contextRecordList[0] });
			}),
		);
		// ⟪meaningsPolish⟫ the domain's meanings themselves, one row per property meaning (no property level between); ⟪meaningsClarity, Addendum A⟫ read with its
		// own term and the meanings of other domains that name it by the one reader of an element's meaning facts, so this level and the element's /edc page agree
		taskList.push((args, next) =>
			readElementMeaningFacts({ elementStableId: domainStableId, withIncomingValueCount: true }, (factsError, factsAnswer) => {
				if (!factsError && !factsAnswer.elementMeaningFacts.isMeaningDomain) {
					next(`${moduleName}: no meaning names '${domainStableId}' as its domain`, args);
					return;
				}
				next(factsError, { ...args, factsAnswer });
			}),
		);

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			const { domainContext, declarationList, declarationAbsentName, factsAnswer } = args;
			const { elementMeaningFacts, meaningRowsBySectionName } = factsAnswer;
			// ⟪explorerTidy review N3⟫ a meaning row read without its value count is refused by name, through the callback
			const countRefusal = mapper.meaningCountAbsentRefusalOf([...meaningRowsBySectionName.propertyMeanings, ...meaningRowsBySectionName.ownTerm, ...meaningRowsBySectionName.namingMeanings.itemList.map(mapper.incomingMeaningRecordOf)]);
			if (countRefusal) {
				callback(countRefusal);
				return;
			}
			const meaningItemList = meaningRowsBySectionName.propertyMeanings.map((meaningRecord) => mapper.mapMeaningItem(meaningRecord, domainContext.standardFamily));
			const termItemList = meaningRowsBySectionName.ownTerm.map((meaningRecord) => mapper.mapMeaningItem(meaningRecord, domainContext.standardFamily));
			const incomingRecord = meaningRowsBySectionName.namingMeanings;
			const incomingItemList = incomingRecord.itemList.map((oneIncomingRecord) => mapper.mapIncomingMeaningItem({ incomingRecord: oneIncomingRecord, standardFamily: domainContext.standardFamily }));
			callback('', {
				node: {
					stableId,
					name: domainContext.name,
					kind: 'meaningDomain',
					hubName: domainContext.hubName,
					standardFamily: domainContext.standardFamily || null,
					description: domainContext.description,
					// ⟪review B1⟫ what this level lists, counted as the domain's row counts it (the level's own count and the row are then one thing)
					meaningCount: meaningItemList.length,
					mappedMeaningCount: meaningItemList.filter((oneItem) => oneItem.elementCount > 0).length,
					termMeaningCount: termItemList.length,
					// ⟪meaningsClarity⟫ counted apart from its own meanings, as its row in the hub counts them
					incomingMeaningCount: incomingRecord.itemCount,
					// ⟪review S4⟫ its id in its hub's standard
					...mapper.nativeIdFieldsOf({ sourceKey: domainContext.sourceKey, nativeIdentifier: domainContext.nativeIdentifier, declarationList, declarationAbsentName }),
					// ⟪meaningsClarity, Addendum A⟫ the meanings it takes part in, section by section, as its /edc page says them
					meaningFacts: elementMeaningFacts,
				},
				ancestorList: [],
				childGroupList: [
					mapper.cappedChildGroupOf({ relationshipType: 'HAS_MEANING', itemList: meaningItemList }),
					mapper.cappedChildGroupOf({ relationshipType: 'HAS_TERM_MEANING', itemList: termItemList }),
					// ⟪meaningsClarity⟫ an added group: capped in its query, so its count is the query's true count
					{ relationshipType: 'HAS_INCOMING_MEANING', count: incomingRecord.itemCount, truncated: incomingRecord.itemCount > incomingItemList.length, itemList: incomingItemList },
				].filter((oneGroup) => oneGroup.count > 0),
				mappingList: [],
			});
		});
	};

	// ⟪meaningsPolish⟫ a level the walk no longer has (the mapper's retiredLevel): a link made before TQ's ruling is refused by name, naming the domain it
	// named (⟪review S3⟫ the part of meaningProperty:<domainStableId>@<propertyStableId> before its one '@'; an id without exactly one says so). The words
	// are data (lib/meanings-walk-wording.json).
	const RETIRED_PROPERTY_LEVEL_DIVIDER = '@';
	const retiredMeaningLevelRefusalOf = (stableId) => {
		const partList = (mapper.parseSyntheticId(stableId) || { remainderText: '' }).remainderText.split(RETIRED_PROPERTY_LEVEL_DIVIDER);
		return partList.length === 2 && partList[0]
			? wordingOf(meaningsWalkWording.retiredPropertyLevelWithDomainTemplate, { stableId, domainStableId: partList[0] })
			: wordingOf(meaningsWalkWording.retiredPropertyLevelTemplate, { stableId });
	};
	const refuseRetiredMeaningLevel = ({ stableId }, callback) => callback(`${moduleName}: ${retiredMeaningLevelRefusalOf(stableId)}`);

	// ⟪review S4⟫ the graph's native-identifier declarations, for a domain's id in its hub's standard. A graph that declares none, or declares them
	// wrongly, still walks: its domains say why they carry no id (declarationAbsentName). A failed read is an error.
	const DECLARATION_ABSENT_NAME_LIST = Object.freeze(['nativeIdentifierUnstamped', 'nativeIdentifierDeclarationInvalid']);
	const readDomainIdentifierDeclarations = (callback) =>
		readNativeIdentifierDeclarations({ neo4jDb }, (declarationError, declarationList) => {
			if (!declarationError) {
				callback('', { declarationList, declarationAbsentName: null });
				return;
			}
			const declarationAbsentName = DECLARATION_ABSENT_NAME_LIST.find((oneName) => String(declarationError).startsWith(`${oneName}:`));
			if (declarationAbsentName) {
				callback('', { declarationList: null, declarationAbsentName });
				return;
			}
			callback(declarationError);
		});

	// hubCardTuple reads with a driver session's runCypher(session, cypher, params, done(error, { records })); the golden handle answers rows. This adapts
	// one to the other, so the card's tuple is read by hubCardTuple itself, never by a copy of its Cypher.
	const runCypherOnGolden = (unusedSession, cypherText, cypherParameters, done) =>
		neo4jDb.runQuery(cypherText, cypherParameters, (queryError, rowList) => {
			if (queryError) {
				done(queryError);
				return;
			}
			done('', { records: rowList.map((oneRow) => ({ get: (fieldName) => oneRow[fieldName] })) });
		});

	// the minter's uriForNode, or, with no minter, a uriForElement that says why for every part (a part never goes blank)
	const uriForElementOf = (minterAnswer) => (minterAnswer.uriMinter ? minterAnswer.uriMinter.uriForNode : () => ({ absentReason: minterAnswer.uriAbsentName }));

	const readMeaningNode = ({ stableId, remainderText }, callback) => {
		const cardStableId = remainderText;
		const taskList = new taskListPlus();

		taskList.push((args, next) =>
			runNamedQuery('meaningCardFacts', { cardStableId }, (queryError, factRecordList) => {
				if (queryError) {
					next(queryError, args);
					return;
				}
				if (!factRecordList.length) {
					next(`${moduleName}: no meaning in this graph has stableId '${cardStableId}'`, args);
					return;
				}
				next('', { ...args, cardFacts: factRecordList[0] });
			}),
		);
		taskList.push((args, next) => readUriMinter({ accessPointsDotD }, (minterError, minterAnswer) => next(minterError, { ...args, minterAnswer })));
		taskList.push((args, next) =>
			hubCardTupleFor({ runCypher: runCypherOnGolden, session: null, hubName: args.cardFacts.meaningRow.hubName, cardStableId, uriForElement: uriForElementOf(args.minterAnswer) }, (tupleError, cardTupleFacts) =>
				next(tupleError, { ...args, cardTupleFacts }),
			),
		);
		// "Expressed in": the anchor fan-out (each standard's true count, the Standards Explorer's own read) and each standard's capped element rows
		taskList.push((args, next) => runNamedQuery('anchorFanOutByStableId', { stableId: cardStableId }, (queryError, fanOutRecordList) => next(queryError, { ...args, fanOutRecordList })));
		taskList.push((args, next) =>
			runNamedQuery('meaningExpressionsByCardStableId', { stableId: cardStableId }, (queryError, expressionRecordList) => next(queryError, { ...args, expressionRecordList })),
		);
		// a property meaning holds its value meanings; any other tier holds none
		taskList.push((args, next) => {
			if (args.cardFacts.meaningRow.referenceTier !== mapper.MEANING_PROPERTY_TIER) {
				next('', { ...args, valueRecord: { itemCount: 0, itemList: [] } });
				return;
			}
			// as above: no value card of this property answers no row, a count of 0
			runNamedQuery('valueMeaningsByCardStableId', { cardStableId }, (queryError, valueRecordList) => next(queryError, { ...args, valueRecord: (valueRecordList || [])[0] || { itemCount: 0, valueElementCount: 0, itemList: [] } }));
		});

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			const { cardFacts, cardTupleFacts, fanOutRecordList, expressionRecordList, valueRecord } = args;
			const expressedInGroupList = mapper.mapMeaningExpressionGroupList({ fanOutRecordList, expressionRecordList, cardStableId });
			// ⟪explorerTidy⟫ with the count of the values it holds, which says whether it opens to anything (⟪review N3⟫ refused by name through the callback when absent)
			const focusMeaningRecord = { ...cardFacts.meaningRow, ...(cardFacts.meaningRow.referenceTier === mapper.MEANING_PROPERTY_TIER ? { valueMeaningCount: valueRecord.itemCount, valueElementCount: valueRecord.valueElementCount } : {}) };
			const countRefusal = mapper.meaningCountAbsentRefusalOf([focusMeaningRecord, ...valueRecord.itemList]);
			if (countRefusal) {
				callback(countRefusal);
				return;
			}
			const meaningItem = mapper.mapMeaningItem(focusMeaningRecord, cardFacts.standardFamily);
			const valueItemList = valueRecord.itemList.map((meaningRecord) => mapper.mapMeaningItem(meaningRecord, cardFacts.standardFamily));
			const { tuple, tupleAbsentName, rangePartList, rangeIsIdentity, rangeDatatypeList } = cardTupleFacts;
			callback('', {
				node: {
					...meaningItem,
					stableId,
					hubVersion: cardFacts.hubVersion || null,
					// where it sits in the walk: its group and its domain, as the walk's own ids (a term meaning sits in no domain)
					meaningGroup: mapper.meaningGroupOf({ hubName: meaningItem.hubName }),
					...(cardFacts.domain ? { meaningDomain: { stableId: mapper.meaningDomainIdOf(cardFacts.domain.stableId), name: cardFacts.domain.name } } : {}),
					// its tuple, as hubCardTuple reads it: the role-named slots, each with its kind, native id, label and uri, or the name of why there is none
					...(tuple ? { tuple } : { tupleAbsentName }),
					// the ranges, as hubCardTuple read them; a card it could not read (hubCardNotFound, hubSlotProfileUnreadable) says nothing of its ranges
					...(rangeIsIdentity === undefined ? {} : { rangePartList, rangeIsIdentity, rangeDatatypeList }),
					// "Expressed in": every element mapped to it, one group per standard with its true count, each capped at the mapper's GROUP_ITEM_CAP
					expressionCount: expressedInGroupList.reduce((soFar, oneGroup) => soFar + oneGroup.elementCount, 0),
					expressionsTruncated: expressedInGroupList.some((oneGroup) => oneGroup.elementsTruncated),
					// ⟪meaningsPolish⟫ the per-standard cap, so the panel's capped note names the server's number rather than a copy of it
					expressionGroupItemCap: mapper.GROUP_ITEM_CAP,
					expressedInGroupList,
					// ⟪meaningsClarity⟫ a property meaning says what it holds, as its row in its domain says it: its value meanings and the elements mapped to them
					...(meaningItem.referenceTier === mapper.MEANING_PROPERTY_TIER ? { valueMeaningCount: valueRecord.itemCount, valueElementCount: valueRecord.valueElementCount } : {}),
				},
				ancestorList: [],
				childGroupList: [{ relationshipType: 'HAS_VALUE_MEANING', count: valueRecord.itemCount, truncated: valueRecord.itemCount > valueItemList.length, itemList: valueItemList }].filter((oneGroup) => oneGroup.count > 0),
				mappingList: [],
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
		// ⟪meaningsExplorer⟫ the meanings walk (its grouping level's kind is the mapper's meaningCatalogGrouping.groupNodeKind)
		meaningCatalog: readMeaningCatalogNode,
		meaningHub: readMeaningHubNode,
		meaningDomain: readMeaningDomainNode,
		meaningProperty: refuseRetiredMeaningLevel,
		meaning: readMeaningNode,
	};

	// ⟪meaningsClarity, Addendum A; review S4⟫ an element's meaning facts, as its /edc page says them, asked for apart from its node (action meaningFacts), so a walk step
	// costs what it cost before and the panel reads them after. A synthetic id is no graph element: it answers that by name, with no read
	const MEANING_FACTS_ABSENT_NAME_LIST = Object.freeze(['notAGraphElement']);
	const readMeaningFactsAnswer = ({ stableId }, callback) => {
		if (typeof stableId !== 'string' || stableId.trim() === '') {
			callback(`${moduleName}: meaningFacts requires stableId as a non-empty string (received ${JSON.stringify(stableId)})`);
			return;
		}
		if (mapper.parseSyntheticId(stableId)) {
			callback('', { stableId, meaningFactsAbsentName: MEANING_FACTS_ABSENT_NAME_LIST[0] });
			return;
		}
		readElementMeaningFacts({ elementStableId: stableId, withIncomingValueCount: false }, (factsError, factsAnswer) => callback(factsError, factsError ? undefined : { stableId, meaningFacts: factsAnswer.elementMeaningFacts }));
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

	// ⟪meaningsExplorer⟫ a meanings-walk crumb: graphStableIdOf names the graph node that names it (null: none needed; undefined: the id is malformed),
	// summaryOf builds the crumb from that node's summary
	const meaningCrumbOf = ({ stableId, nodeKind, graphSummary }) => ({ stableId, name: graphSummary.name, kind: nodeKind, hubName: graphSummary.hubName || null, standardFamily: graphSummary.standardFamily || null });
	const meaningSummaryReaderByKind = {
		meaningCatalog: { graphStableIdOf: () => null, summaryOf: ({ stableId }) => ({ stableId, name: MEANING_CATALOG_NAME, kind: 'meaningCatalog' }) },
		meaningHub: {
			graphStableIdOf: (remainderText) => (remainderText ? null : undefined),
			summaryOf: ({ stableId, remainderText, hubFamilyRecordList }) => ({
				stableId,
				name: remainderText,
				kind: 'meaningHub',
				hubName: remainderText,
				standardFamily: (hubFamilyRecordList.find((oneRecord) => oneRecord.hubName === remainderText) || {}).standardFamily || null,
			}),
		},
		meaningDomain: { graphStableIdOf: (remainderText) => remainderText || undefined, summaryOf: ({ stableId, graphSummary }) => meaningCrumbOf({ stableId, nodeKind: 'meaningDomain', graphSummary }) },
		meaning: { graphStableIdOf: (remainderText) => remainderText || undefined, summaryOf: ({ stableId, graphSummary }) => meaningCrumbOf({ stableId, nodeKind: 'meaning', graphSummary }) },
	};

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
		const strayMeaningCatalogIdList = stableIdList.filter((oneId) => (mapper.parseSyntheticId(oneId) || {}).nodeKind === 'meaningCatalog' && !mapper.isMeaningCatalogId(oneId));
		if (strayMeaningCatalogIdList.length) {
			callback(`${moduleName}: ${strayMeaningCatalogIdList.map((oneId) => `'${oneId}'`).join(', ')} is not the meanings catalog id (expected ${mapper.MEANING_CATALOG_STABLE_ID})`);
			return;
		}
		// ⟪meaningsPolish⟫ a crumb of a retired level is refused by name, as the node is
		const retiredMeaningLevelIdList = stableIdList.filter(mapper.isRetiredMeaningLevelId);
		if (retiredMeaningLevelIdList.length) {
			callback(`${moduleName}: ${retiredMeaningLevelIdList.map(retiredMeaningLevelRefusalOf).join('; ')}`);
			return;
		}
		// ⟪meaningsExplorer⟫ a meanings-walk id is named by the graph node it stands for (meaningSummaryReaderByKind); a malformed one is refused here
		const malformedMeaningIdList = stableIdList.filter((oneId) => {
			const syntheticId = mapper.parseSyntheticId(oneId);
			return syntheticId && meaningSummaryReaderByKind[syntheticId.nodeKind] && meaningSummaryReaderByKind[syntheticId.nodeKind].graphStableIdOf(syntheticId.remainderText) === undefined;
		});
		if (malformedMeaningIdList.length) {
			callback(`${moduleName}: ${malformedMeaningIdList.map((oneId) => `'${oneId}'`).join(', ')} is not a well-formed meanings walk id`);
			return;
		}
		const meaningGraphStableIdList = stableIdList
			.map((oneId) => mapper.parseSyntheticId(oneId))
			.filter((syntheticId) => syntheticId && meaningSummaryReaderByKind[syntheticId.nodeKind])
			.map((syntheticId) => meaningSummaryReaderByKind[syntheticId.nodeKind].graphStableIdOf(syntheticId.remainderText))
			.filter(Boolean);
		const graphStableIdList = stableIdList.filter((oneId) => !mapper.parseSyntheticId(oneId)).concat(meaningGraphStableIdList);
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
		// the hubs' families, for a meanings walk's hub crumb (read only when the path has one)
		taskList.push((args, next) => {
			if (!stableIdList.some((oneId) => (mapper.parseSyntheticId(oneId) || {}).nodeKind === 'meaningHub')) {
				next('', { ...args, hubFamilyRecordList: [] });
				return;
			}
			runNamedQuery('hubFamilyList', {}, (queryError, hubFamilyRecordList) => next(queryError, { ...args, hubFamilyRecordList }));
		});
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
			// ⟪review S5⟫ a hub crumb must name a hub the graph holds, as the node action requires
			const unknownHubNameList = stableIdList
				.map((oneId) => mapper.parseSyntheticId(oneId))
				.filter((syntheticId) => syntheticId && syntheticId.nodeKind === 'meaningHub' && !args.hubFamilyRecordList.some((oneRecord) => oneRecord.hubName === syntheticId.remainderText))
				.map((syntheticId) => syntheticId.remainderText);
			if (unknownHubNameList.length) {
				callback(`${moduleName}: no :HubDefinition in this graph has hubName ${unknownHubNameList.map((hubName) => `'${hubName}'`).join(', ')}; hubs present: ${args.hubFamilyRecordList.map((oneRecord) => oneRecord.hubName).join(', ')}`);
				return;
			}
			const nodeSummaryList = stableIdList.map((oneId) => {
				const syntheticId = mapper.parseSyntheticId(oneId);
				if (!syntheticId) {
					return summaryByStableId[oneId];
				}
				if (meaningSummaryReaderByKind[syntheticId.nodeKind]) {
					const graphStableId = meaningSummaryReaderByKind[syntheticId.nodeKind].graphStableIdOf(syntheticId.remainderText);
					return meaningSummaryReaderByKind[syntheticId.nodeKind].summaryOf({ stableId: oneId, remainderText: syntheticId.remainderText, graphSummary: summaryByStableId[graphStableId], hubFamilyRecordList: args.hubFamilyRecordList });
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
	// URIS — ⟪explorerUris, WORKORDER-explorerUris-110926⟫ every object of an answer that names a graph node by its stableId (the node, its children, its
	// ancestors, a mapping's hub card, a breadcrumb's nodes, a version counterpart) gains { uri, uriKind } or, when no URI can be minted, { uriAbsentName };
	// a standard's root also gains its manifest listing of elements (elementListUri). A synthetic id (families:all, family:, release:, standardGroup:) names no
	// graph node and gains nothing; ⟪meaningsExplorer⟫ except a meanings-walk id that stands for one graph node (meaning:, meaningDomain:), which gains that
	// node's URI (mapper.citedGraphStableIdOf). The minter names a node by the standard it belongs to (its _source), read here in one query. Nothing else changes.

	const isPlainObject = (answerValue) => answerValue !== null && typeof answerValue === 'object' && Object.getPrototypeOf(answerValue) === Object.prototype;
	// ⟪meaningsExplorer⟫ a synthetic row that stands for one graph node (a meaning, a meaning domain) cites that node (mapper.citedGraphStableIdOf)
	const isCitableObject = (answerValue) => isPlainObject(answerValue) && typeof answerValue.stableId === 'string' && answerValue.stableId !== '' && mapper.citedGraphStableIdOf(answerValue.stableId) !== null;

	const collectCitableStableIds = (answerValue, stableIdSet) => {
		if (Array.isArray(answerValue)) {
			answerValue.forEach((oneValue) => collectCitableStableIds(oneValue, stableIdSet));
			return stableIdSet;
		}
		if (!isPlainObject(answerValue)) {
			return stableIdSet;
		}
		if (isCitableObject(answerValue)) {
			stableIdSet.add(mapper.citedGraphStableIdOf(answerValue.stableId));
		}
		Object.values(answerValue).forEach((oneValue) => collectCitableStableIds(oneValue, stableIdSet));
		return stableIdSet;
	};

	// a copy of the answer with each citable object's URI fields added
	const withUriFieldsAdded = (answerValue, uriFieldsByStableId) => {
		if (Array.isArray(answerValue)) {
			return answerValue.map((oneValue) => withUriFieldsAdded(oneValue, uriFieldsByStableId));
		}
		if (!isPlainObject(answerValue)) {
			return answerValue;
		}
		const copiedObject = Object.fromEntries(Object.entries(answerValue).map(([fieldName, fieldValue]) => [fieldName, withUriFieldsAdded(fieldValue, uriFieldsByStableId)]));
		return isCitableObject(answerValue) ? { ...copiedObject, ...uriFieldsByStableId[mapper.citedGraphStableIdOf(answerValue.stableId)] } : copiedObject;
	};

	const withUriFields = (actionResult, callback) => {
		const stableIdList = [...collectCitableStableIds(actionResult, new Set())];
		if (!stableIdList.length) {
			callback('', actionResult);
			return;
		}
		const taskList = new taskListPlus();

		taskList.push((args, next) => readUriMinter({ accessPointsDotD }, (minterError, minterAnswer) => next(minterError, { ...args, minterAnswer })));

		// with no minter every node says why the same way, and the standards need not be read
		taskList.push((args, next) => {
			if (!args.minterAnswer.uriMinter) {
				next('', { ...args, sourceRecordList: [] });
				return;
			}
			runNamedQuery('sourceNameByStableIdList', { stableIdList }, (queryError, sourceRecordList) => next(queryError, { ...args, sourceRecordList }));
		});

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			const sourceRecordByStableId = Object.fromEntries(args.sourceRecordList.map((sourceRecord) => [sourceRecord.stableId, sourceRecord]));
			const uriFieldsByStableId = Object.fromEntries(
				stableIdList.map((stableId) => {
					const sourceRecord = sourceRecordByStableId[stableId] || {};
					const uriFields = uriFieldsOf({ minterAnswer: args.minterAnswer, stableId, standardSourceName: sourceRecord.standardSourceName });
					const elementListFields = sourceRecord.isStandardRoot ? elementListUriFieldsOf({ minterAnswer: args.minterAnswer, standardSourceName: sourceRecord.standardSourceName }) : {};
					return [stableId, { ...uriFields, ...elementListFields }];
				}),
			);
			callback('', withUriFieldsAdded(actionResult, uriFieldsByStableId));
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
		// ⟪meaningsClarity review S4⟫
		meaningFacts: (xQuery, callback) => readMeaningFactsAnswer({ stableId: xQuery.stableId }, callback),
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

		// STAGE 4: ⟪explorerUris⟫ every citable thing in the answer carries its EDUcore URI
		taskList.push((args, next) => withUriFields(args.actionResult, (uriError, actionResult) => next(uriError, { ...args, actionResult })));

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
