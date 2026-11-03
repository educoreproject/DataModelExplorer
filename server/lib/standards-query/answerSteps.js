'use strict';

// answerSteps — what the core adds to a verb's answer, one named step per kind of addition; a registry row lists the steps its operation takes (DATA, no branch on the
// operation). The CLI verb knows nothing of these: dataModelExplorerSearch.js gains no store or forge dependency. Every field a step adds is declared in its registry row,
// because G1.1 removes exactly those and requires the rest to equal the CLI's bytes.
//
//   THE STEP INTERFACE: step({ answer, session, facts, registryRow, verbParams, pageNumber, runCypher, storeReads, dmeSearchModule, namedUriList }, done(errText)); it adds to
//   answer in place, on the fresh object the verb built for this request, and pushes every permanent URI it names onto namedUriList (the usage counters read that list).
// A row whose element has no URI carries <field>AbsentReason, so an absence is said rather than left to be mistaken for a mapping that does not exist.

const neo4j = require('neo4j-driver');

// the rule's path 'entryList[].outgoing[]' → every object at it; 'node._source' read from one object
const objectsAtPath = (rootObject, pathText) => {
	if (pathText === '') {
		return [rootObject];
	}
	return pathText.split('.').reduce((objectList, segmentText) => {
		const isList = segmentText.endsWith('[]');
		const fieldName = isList ? segmentText.slice(0, -2) : segmentText;
		return objectList.flatMap((oneObject) => {
			const fieldValue = oneObject === null || oneObject === undefined ? undefined : oneObject[fieldName];
			if (fieldValue === null || fieldValue === undefined) {
				return [];
			}
			return isList ? fieldValue : [fieldValue];
		});
	}, [rootObject]);
};
const fieldAtPath = (oneObject, dottedName) => dottedName.split('.').reduce((soFar, partName) => (soFar === null || soFar === undefined ? soFar : soFar[partName]), oneObject);

// G1.1's inverse: remove what the row declares the core added. Used by the oracle; it lives here so the declaration and its removal cannot part.
const stripCoreAdditions = (answer, registryRow) => {
	const removeField = (oneObject, fieldName) => {
		delete oneObject[fieldName];
		if (/^uri$|Uri$/.test(fieldName)) {
			Object.values(uriCompanionNameListFor(fieldName)).forEach((companionName) => delete oneObject[companionName]);
		}
	};
	(registryRow.uriFieldRuleList || []).forEach(({ pathText, addFieldName }) => objectsAtPath(answer, pathText).forEach((oneObject) => removeField(oneObject, addFieldName)));
	(registryRow.coreAddedFieldList || []).forEach(({ pathText, fieldName }) => objectsAtPath(answer, pathText).forEach((oneObject) => removeField(oneObject, fieldName)));
	[...GLOBAL_ADDED_FIELD_NAME_LIST].forEach((fieldName) => delete answer[fieldName]);
	return answer;
};
const GLOBAL_ADDED_FIELD_NAME_LIST = Object.freeze(['standardElementListByName', 'pageNumber', 'pageSize']);

// the fields that say what a URI is, for a URI field named uri (uriKind, resolvesHere) or <name>Uri (<name>UriKind, <name>ResolvesHere). A URI under the EDUcore base is 'edc' and resolves on
// this instance's /edc/ route. 'ownIri' is the temporary state uriMinter.js describes, said on the row itself so that a reader of one row is not misled.
const uriCompanionNameListFor = (addFieldName) => {
	const prefixText = addFieldName === 'uri' ? '' : addFieldName.replace(/Uri$/, '');
	return { kindFieldName: prefixText ? `${prefixText}UriKind` : 'uriKind', resolvesFieldName: prefixText ? `${prefixText}ResolvesHere` : 'resolvesHere', absentFieldName: `${addFieldName}AbsentReason` };
};
const URI_KIND_OWN_IRI = 'ownIri';
const URI_KIND_EDC = 'edc';
const setUriFields = (targetObject, addFieldName, uriText, isOwnIri) => {
	const { kindFieldName, resolvesFieldName } = uriCompanionNameListFor(addFieldName);
	targetObject[addFieldName] = uriText;
	targetObject[kindFieldName] = isOwnIri ? URI_KIND_OWN_IRI : URI_KIND_EDC;
	targetObject[resolvesFieldName] = !isOwnIri;
};

const nameUri = (uriMinter, targetObject, addFieldName, stableId, standardName, namedUriList) => {
	if (stableId === null || stableId === undefined) {
		return;
	}
	const minted = uriMinter.uriForNode({ stableId, standardName });
	if (minted.uri !== undefined) {
		setUriFields(targetObject, addFieldName, minted.uri, minted.isOwnIri === true);
		namedUriList.push(minted.uri);
		return;
	}
	targetObject[uriCompanionNameListFor(addFieldName).absentFieldName] = minted.absentReason;
};

const COMPUTED_DIRECTION_LIST = Object.freeze(['equivalent', 'candidateEquivalent', 'related']);
const VIA_INSTANCE_DIRECTION = 'outgoingViaInstance';
const ROW_CARD_CYPHER = `UNWIND $rowList AS oneRow
	MATCH (fromNode:ForgedNode {stableId: oneRow.fromStableId})
	MATCH (fromNode)-[:HAS_INSTANCE*0..1]->(edgeOwner:ForgedNode)-[matchEdge]->(card:HubReference {hubName: oneRow.hubName})
	WHERE type(matchEdge) = oneRow.mappingType AND coalesce(card.canonicalKey, card.termIri) = oneRow.toId
	WITH oneRow.rowIndex AS rowIndex, card.stableId AS cardUri, collect(DISTINCT matchEdge.assertionId) AS assertionUriList
	RETURN rowIndex, collect({ cardUri: cardUri, assertionUriList: assertionUriList }) AS cardRowList`;

const addAssertionFields = (targetObject, assertionUriList, namedUriList) => {
	const assertionList = assertionUriList.filter(Boolean).sort();
	namedUriList.push(...assertionList);
	if (assertionList.length === 1) {
		targetObject.assertion = assertionList[0];
	}
	if (assertionList.length > 1) {
		targetObject.assertionList = assertionList;
	}
};

// one card: the row's uri and assertion. Several (only through instances): cardList, and no winner is picked.
const applyCardRowList = (targetRow, cardRowList, namedUriList) => {
	const sortedRowList = cardRowList.slice().sort((left, right) => (left.cardUri < right.cardUri ? -1 : 1));
	namedUriList.push(...sortedRowList.map(({ cardUri }) => cardUri));
	if (sortedRowList.length === 1) {
		setUriFields(targetRow, 'uri', sortedRowList[0].cardUri, false);
		addAssertionFields(targetRow, sortedRowList[0].assertionUriList, namedUriList);
		return;
	}
	if (sortedRowList.length > 1) {
		targetRow.cardList = sortedRowList.map(({ cardUri, assertionUriList }) => {
			const cardEntry = {};
			setUriFields(cardEntry, 'uri', cardUri, false);
			addAssertionFields(cardEntry, assertionUriList, namedUriList);
			return cardEntry;
		});
	}
};

const STEP_BY_NAME = Object.freeze({
	// every rule in the registry row: the walk is data
	mintRuleUris: ({ answer, facts, registryRow, namedUriList }, done) => {
		registryRow.uriFieldRuleList.forEach(({ pathText, stableIdField, standardField, addFieldName }) => objectsAtPath(answer, pathText).forEach((oneObject) => {
			nameUri(facts.uriMinter, oneObject, addFieldName, fieldAtPath(oneObject, stableIdField), fieldAtPath(oneObject, standardField), namedUriList);
		}));
		done('');
	},

	// A3: what each leg of a search reaches, said in the answer
	addSearchScope: ({ answer }, done) => {
		answer.searchScope = { vectorLeg: 'nodes carrying embedding', keywordLeg: 'ForgedNode name and description, instances included' };
		done('');
	},

	addPageFacts: ({ answer, registryRow, pageNumber }, done) => {
		answer.pageNumber = pageNumber;
		answer.pageSize = registryRow.pageSize;
		done('');
	},

	// every answer that names a standard carries its elements listing; the envelope carries the manifest's standards listing
	addStandardListings: ({ answer, facts }, done) => {
		const nameSet = new Set();
		const collectStandardNames = (oneValue, depthLeft) => {
			if (Array.isArray(oneValue)) {
				oneValue.forEach((oneItem) => collectStandardNames(oneItem, depthLeft));
				return;
			}
			if (oneValue === null || typeof oneValue !== 'object' || depthLeft === 0) {
				return;
			}
			Object.keys(oneValue).forEach((fieldName) => {
				if (STANDARD_NAME_FIELD_LIST.includes(fieldName) && facts.standardVersionByName[oneValue[fieldName]] !== undefined) {
					nameSet.add(oneValue[fieldName]);
				}
				collectStandardNames(oneValue[fieldName], depthLeft - 1);
			});
		};
		collectStandardNames(answer, 4);
		const standardElementListByName = {};
		[...nameSet].sort().forEach((standardName) => {
			standardElementListByName[standardName] = facts.uriMinter.elementListUriFor(standardName);
		});
		answer.standardElementListByName = standardElementListByName;
		done('');
	},

	addStandardRowListings: ({ answer, facts }, done) => {
		answer.manifestStandardList = facts.uriMinter.standardListUri();
		answer.standards.forEach((oneRow) => {
			const elementListUri = facts.uriMinter.elementListUriFor(oneRow.source);
			if (elementListUri !== undefined) {
				oneRow.elements = elementListUri;
			}
		});
		done('');
	},

	// a row names toId, and one identifier can stand for many cards (CTDL: up to 117); (element, relation, hub, identifier) reaches exactly one card on a direct edge (measured: all 22,691),
	// several only through instances, and then no winner is picked
	addMappingRowIdentity: ({ answer, session, facts, runCypher, namedUriList }, done) => {
		const rowList = answer.mappingRowList.map((oneRow, rowIndex) => ({ rowIndex: neo4j.int(rowIndex), fromStableId: oneRow.fromStableId, hubName: oneRow.hubName, mappingType: oneRow.mappingType, toId: oneRow.toId }));
		runCypher(session, ROW_CARD_CYPHER, { rowList }, (cardError, cardResult) => {
			if (cardError) {
				done(cardError);
				return;
			}
			const cardRowListByRowIndex = {};
			cardResult.records.forEach((oneRecord) => {
				cardRowListByRowIndex[neo4j.integer.toNumber(oneRecord.get('rowIndex'))] = oneRecord.get('cardRowList');
			});
			const cardUriListByHubAndId = {};
			const viaInstanceCardSetByElement = {};
			answer.mappingRowList.forEach((oneRow, rowIndex) => {
				const cardRowList = cardRowListByRowIndex[rowIndex] || [];
				oneRow.targetKind = 'card';
				if (COMPUTED_DIRECTION_LIST.includes(oneRow.direction)) {
					oneRow.claimKind = 'computed';
				}
				applyCardRowList(oneRow, cardRowList, namedUriList);
				const cardUriList = cardRowList.map(({ cardUri }) => cardUri);
				const hubAndIdText = `${oneRow.hubName}\u0000${oneRow.toId}`;
				cardUriListByHubAndId[hubAndIdText] = [...new Set([...(cardUriListByHubAndId[hubAndIdText] || []), ...cardUriList])];
				if (oneRow.direction === VIA_INSTANCE_DIRECTION) {
					viaInstanceCardSetByElement[oneRow.fromStableId] = new Set([...(viaInstanceCardSetByElement[oneRow.fromStableId] || []), ...cardUriList]);
				}
				const question = facts.uriMinter.questionUriFor({ stableId: oneRow.fromStableId, standardName: oneRow.fromSource });
				if (question.uri !== undefined) {
					oneRow.question = question.uri;
				}
			});
			answer.mappingRowList.forEach((oneRow) => {
				const cardSet = oneRow.direction === VIA_INSTANCE_DIRECTION ? viaInstanceCardSetByElement[oneRow.fromStableId] : undefined;
				if (cardSet && cardSet.size > 1) {
					oneRow.instanceDisagreement = true;
					oneRow.instanceCardUriList = [...cardSet].sort();
				}
			});
			(answer.hubTupleSummaryList || []).forEach((oneSummary) => {
				const cardUriList = cardUriListByHubAndId[`${oneSummary.hubName}\u0000${oneSummary.toId}`];
				if (cardUriList) {
					oneSummary.cardUriList = cardUriList.slice().sort();
				}
			});
			done('');
		});
	},

	// the hit's own mapping rows name a card by its identifier, as the mappings rows do
	addNeighbourhoodCardIdentity: ({ answer, session, runCypher, namedUriList }, done) => {
		const targetRowList = answer.hitList.flatMap((oneHit) => [...(oneHit.mappingsOutgoing || []), ...((oneHit.instanceView && oneHit.instanceView.mappingsViaInstances) || [])].map((oneMapping) => ({ oneMapping, fromStableId: oneHit.node.stableId })));
		const rowList = targetRowList.map(({ oneMapping, fromStableId }, rowIndex) => ({ rowIndex: neo4j.int(rowIndex), fromStableId, hubName: oneMapping.toSource, mappingType: oneMapping.mappingType, toId: oneMapping.toId }));
		runCypher(session, ROW_CARD_CYPHER, { rowList }, (cardError, cardResult) => {
			if (cardError) {
				done(cardError);
				return;
			}
			cardResult.records.forEach((oneRecord) => {
				const { oneMapping } = targetRowList[neo4j.integer.toNumber(oneRecord.get('rowIndex'))];
				oneMapping.targetKind = 'card';
				applyCardRowList(oneMapping, oneRecord.get('cardRowList'), namedUriList);
			});
			done('');
		});
	},

	addMappingStatusByHub: ({ answer, session, facts, verbParams, runCypher, dmeSearchModule, storeReads, namedUriList }, done) => {
		dmeSearchModule.findMappingsMatchedNodeList(session, verbParams.name, (nodeError, matchedNodeList) => {
			if (nodeError) {
				done(nodeError);
				return;
			}
			answer.matchedElementList = matchedNodeList.map((oneNode) => {
				const namedElement = { stableId: oneNode.stableId, name: oneNode.elementName, standard: oneNode.standardName, role: oneNode.role };
				nameUri(facts.uriMinter, namedElement, 'uri', oneNode.stableId, oneNode.standardName, namedUriList);
				return namedElement;
			});
			mappingStatusByHubFor({ session, facts, runCypher, storeReads, matchedNodeList, hubList: answer.hubList }, (statusError, mappingStatusByHub) => {
				if (statusError) {
					done(statusError);
					return;
				}
				answer.mappingStatusByHub = mappingStatusByHub;
				if (answer.matchedNodeCount <= matchedNodeList.length) {
					done('');
					return;
				}
				// past the cap: whether a hub is reached is read over every matched node; an abstention past it cannot be told from no offer, and the answer says so
				answer.mappingStatusNote = `this input matched ${answer.matchedNodeCount} nodes; judgedAbstained and neverOffered were read over the first ${matchedNodeList.length}. Ask by stableId for one element's status`;
				dmeSearchModule.findMappingsMappedHubNameList(session, verbParams.name, (hubError, mappedHubNameList) => {
					if (hubError) {
						done(hubError);
						return;
					}
					mappedHubNameList.forEach((hubName) => {
						mappingStatusByHub[hubName] = 'mapped';
					});
					done('');
				});
			});
		});
	},

	// the option values and the cards they reach: rows name them by text only
	addCodesetRowIdentity: ({ answer, session, facts, runCypher, namedUriList }, done) => {
		const rowList = answer.valueRowList.map((oneRow, rowIndex) => ({ rowIndex: neo4j.int(rowIndex), sourceStandard: oneRow.sourceStandard, optionSetName: oneRow.optionSetName, sourceValue: oneRow.sourceValue, matchType: oneRow.matchType, hubName: oneRow.hubName, hubValueKey: oneRow.hubValueKey }));
		runCypher(session, `UNWIND $rowList AS oneRow
			MATCH (optionSet:ForgedNode {role: 'DmeOptionSet', _source: oneRow.sourceStandard, name: oneRow.optionSetName})-[:HAS_VALUE]->(optionValue:ForgedNode {role: 'DmeOptionValue', name: oneRow.sourceValue})
			OPTIONAL MATCH (optionValue)-[matchEdge]->(card:HubReference {hubName: oneRow.hubName, referenceTier: 'value'}) WHERE type(matchEdge) = oneRow.matchType AND card.canonicalKey = oneRow.hubValueKey
			RETURN oneRow.rowIndex AS rowIndex, min(optionValue.stableId) AS valueStableId, min(card.stableId) AS cardUri, min(matchEdge.assertionId) AS assertionUri`, { rowList }, (identityError, identityResult) => {
			if (identityError) {
				done(identityError);
				return;
			}
			identityResult.records.forEach((oneRecord) => {
				const oneRow = answer.valueRowList[neo4j.integer.toNumber(oneRecord.get('rowIndex'))];
				nameUri(facts.uriMinter, oneRow, 'uri', oneRecord.get('valueStableId'), oneRow.sourceStandard, namedUriList);
				if (oneRecord.get('cardUri')) {
					setUriFields(oneRow, 'cardUri', oneRecord.get('cardUri'), false);
					namedUriList.push(oneRow.cardUri);
				}
				if (oneRecord.get('assertionUri')) {
					oneRow.assertion = oneRecord.get('assertionUri');
					namedUriList.push(oneRow.assertion);
				}
			});
			done('');
		});
	},

	addUnmappedRowIdentity: ({ answer, session, facts, runCypher, namedUriList }, done) => {
		const rowList = answer.unmappedRowList.map((oneRow, rowIndex) => ({ rowIndex: neo4j.int(rowIndex), standard: oneRow.standard, fieldName: oneRow.fieldName, path: oneRow.path }));
		runCypher(session, `UNWIND $rowList AS oneRow
			MATCH (field:ForgedNode {role: 'DmeProperty', _source: oneRow.standard, name: oneRow.fieldName})
			WHERE field.path = oneRow.path OR (field.path IS NULL AND oneRow.path IS NULL)
			RETURN oneRow.rowIndex AS rowIndex, min(field.stableId) AS stableId`, { rowList }, (identityError, identityResult) => {
			if (identityError) {
				done(identityError);
				return;
			}
			identityResult.records.forEach((oneRecord) => {
				const oneRow = answer.unmappedRowList[neo4j.integer.toNumber(oneRecord.get('rowIndex'))];
				nameUri(facts.uriMinter, oneRow, 'uri', oneRecord.get('stableId'), oneRow.standard, namedUriList);
			});
			done('');
		});
	},

	// guide rows name a CEDS class or property by its name
	addGuideRowIdentity: ({ answer, session, facts, runCypher, namedUriList }, done) => {
		const rowList = answer.rowList.map((oneRow, rowIndex) => ({ rowIndex: neo4j.int(rowIndex), name: oneRow.className || oneRow.propertyName, role: oneRow.className ? 'DmeClass' : 'DmeProperty', standard: oneRow.standard || 'CEDS' }));
		runCypher(session, `UNWIND $rowList AS oneRow
			MATCH (guided:ForgedNode {role: oneRow.role, _source: oneRow.standard, name: oneRow.name})
			RETURN oneRow.rowIndex AS rowIndex, oneRow.standard AS standardName, min(guided.stableId) AS stableId`, { rowList }, (identityError, identityResult) => {
			if (identityError) {
				done(identityError);
				return;
			}
			identityResult.records.forEach((oneRecord) => {
				nameUri(facts.uriMinter, answer.rowList[neo4j.integer.toNumber(oneRecord.get('rowIndex'))], 'uri', oneRecord.get('stableId'), oneRecord.get('standardName'), namedUriList);
			});
			done('');
		});
	},
});
const STANDARD_NAME_FIELD_LIST = Object.freeze(['standard', 'source', '_source', 'fromSource', 'sourceStandard', 'targetStandard', 'targetSource']);

// The three meanings of "no mapping" (A1). The graph holds edges only; the store holds abstentions. The answer is per hub, over the nodes the input matched and their instances:
//   mapped: a match edge reaches the hub. notApplicable: every matched node belongs to the hub. judgedAbstained: the manifest's decision blocks hold an abstention toward it.
//   neverOffered: none of those. A store that cannot be read refuses by name rather than letting judgedAbstained read as neverOffered.
const STATUS_INSTANCE_CAP = 500;
const MAPPING_STATUS_UNAVAILABLE_PREFIX = 'mappingStatusUnavailable';
const mappingStatusByHubFor = ({ session, facts, runCypher, storeReads, matchedNodeList, hubList }, callback) => {
	const stableIdList = matchedNodeList.map((oneNode) => oneNode.stableId);
	runCypher(session, `UNWIND $stableIdList AS focusStableId
		MATCH (focus:ForgedNode {stableId: focusStableId})
		OPTIONAL MATCH (focus)-[:HAS_INSTANCE]->(instance:ForgedNode)
		WITH focus, collect(instance)[..$instanceCap] AS instanceList
		UNWIND [focus] + instanceList AS subject
		OPTIONAL MATCH (subject)-[matchEdge:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(card:HubReference)
		RETURN subject.stableId AS subjectStableId, subject._source AS standardName, collect(DISTINCT card.hubName) AS mappedHubNameList`,
		{ stableIdList, instanceCap: neo4j.int(STATUS_INSTANCE_CAP) }, (statusError, statusResult) => {
			if (statusError) {
				callback(statusError);
				return;
			}
			const subjectRowList = statusResult.records.map((oneRecord) => oneRecord.toObject());
			const mappedHubNameSet = new Set(subjectRowList.flatMap((oneRow) => oneRow.mappedHubNameList));
			const abstained = storeReads.abstainedHubNameSetFor({ subjectRowList, decisionBlockHashListByStandard: facts.decisionBlockHashListByStandard });
			if (abstained.error) {
				callback(`${MAPPING_STATUS_UNAVAILABLE_PREFIX}: ${abstained.error}`);
				return;
			}
			const mappingStatusByHub = {};
			hubList.forEach(({ hubName, hubSource }) => {
				if (mappedHubNameSet.has(hubName)) {
					mappingStatusByHub[hubName] = 'mapped';
					return;
				}
				if (matchedNodeList.length > 0 && matchedNodeList.every((oneNode) => oneNode.standardName === hubSource)) {
					mappingStatusByHub[hubName] = 'notApplicable';
					return;
				}
				mappingStatusByHub[hubName] = abstained.hubNameSet.has(hubName) ? 'judgedAbstained' : 'neverOffered';
			});
			callback('', mappingStatusByHub);
		});
};

module.exports = { STEP_BY_NAME, stripCoreAdditions, objectsAtPath, mappingStatusByHubFor, nameUri, setUriFields, MAPPING_STATUS_UNAVAILABLE_PREFIX };
