'use strict';

// retrieveCandidates — retrieval stage one (design 4.1): a stranger's texts against a target. The vote RULE is the forge's embedTextVote-v1, through its own pure modules; the DRIVER is this file, because the forge's reads the source by standard name from the graph and holds the whole hub resident, and a stranger has no standard and this server has no room.
//
//   createRetrievalDriver({ candidateRetrievalLib, neo4jIntegerOf, hubEdgeType, baseRoleByBaseKind, runCypher, uriMinter, embeddingModelVersion, textIndexName, retrievalSettingValues })
//     → { poolsForFieldSlice({ session, fieldSlice, target }, done(err, poolByFieldRefId)) }
//   A fieldSlice row is { fieldRefId, textList: [{ textHash, vector, textRoleList: ['name' | 'definition'] }] }, each distinct text once.
//   target: { kind: 'hubCards', hubName, sourceName } | { kind: 'standardElements', standardName } — THE TARGET INTERFACE is POOL_RUNNER_BY_KIND; the stage knows nothing about who called it.
//   A pool: { status: 'candidates' | 'noCandidate', admittedCount, poolSize, candidateList: [{ stableId, uri, label, domain?, cosine, cardTextCosine?, ownVotes, rank, rankByCosine, admittedBy }], cosineRankOneOutsidePool? }
//
// TWO THINGS READING THE G2 PROBE WOULD NOT TELL YOU (measured, runs/P3): 1. db.index.vector.queryNodes answers (1 + cos) / 2, so the forge's minScore of 0.3 on that scale is cos -0.4 and refuses nothing: every score here is turned back into a cosine. 2. The index spans every standard, and the forge's 40 hits are 40 OF THE HUB'S texts: asking for 40 and filtering by _source left 0 to 5 hits. So each text reads a window (indexWindowPerText) and takes the target's first hitsPerText inside it.
// A search memo is what voteCandidatePool reads hits from, and it is seeded here with the graph's hits, with an index holding no vectors: nothing hub-sized is resident. Card vectors are read for the admitted cards only, a slice at a time, for the forge's cardTextCosine.

const STRANGER_SOURCE_ROLE = 'strangerField';
const COSINE_DECIMALS = 4;
const PROPERTY_SLOT_NAME = 'PROPERTY';
const VOTE_ONLY_SLOT_NAME_LIST = Object.freeze(['DOMAIN', 'RANGE']);

const HITS_CYPHER = `UNWIND $textRowList AS textRow
CALL db.index.vector.queryNodes($textIndexName, $indexWindowPerText, textRow.vector) YIELD node, score
WITH textRow.textHash AS textHash, node, 2 * score - 1 AS cosine
WHERE node._source = $sourceName AND cosine >= $minScore
MATCH (node)-[:EMBEDS_TEXT_OF]->(base)
WHERE $baseRoleList IS NULL OR base.role IN $baseRoleList
WITH textHash, node.stableId AS hitTextStableId, cosine, collect(base.stableId) AS baseStableIdList
ORDER BY textHash, cosine DESC, hitTextStableId
WITH textHash, collect({ hitTextStableId: hitTextStableId, cosine: cosine, baseStableIdList: baseStableIdList })[0..$hitsPerText] AS hitList
RETURN textHash, hitList`;

const PROPERTY_SLOT_EDGES_CYPHER = `MATCH (base:ForgedNode) WHERE base.stableId IN $baseStableIdList
MATCH (card:HubReference { hubName: $hubName, referenceTier: 'property' })-[slotEdge]->(base) WHERE type(slotEdge) = $slotName
RETURN DISTINCT card.stableId AS cardStableId, type(slotEdge) AS slot, base.stableId AS baseStableId, base.role AS baseRole`;

const VOTE_ONLY_SLOT_EDGES_CYPHER = `MATCH (card:HubReference) WHERE card.stableId IN $cardStableIdList
MATCH (card)-[slotEdge]->(base) WHERE type(slotEdge) IN $slotNameList AND base.stableId IN $baseStableIdList
RETURN DISTINCT card.stableId AS cardStableId, type(slotEdge) AS slot, base.stableId AS baseStableId, base.role AS baseRole`;

const CARD_FACTS_CYPHER = `MATCH (card:HubReference) WHERE card.stableId IN $cardStableIdList
RETURN card.stableId AS stableId, card.name AS label, card.domainName AS domain, card.embedding AS embedding, card.embeddingModelVersion AS embeddingModelVersion`;

const ELEMENT_FACTS_CYPHER = `MATCH (element:ForgedNode) WHERE element.stableId IN $stableIdList RETURN element.stableId AS stableId, element.name AS label`;

const roundedCosine = (cosineNumber) => Number(cosineNumber.toFixed(COSINE_DECIMALS));
const compareText = (leftText, rightText) => (leftText < rightText ? -1 : leftText > rightText ? 1 : 0);
const distinctOf = (itemList) => [...new Set(itemList)];
const rowsOf = (queryResult) => queryResult.records.map((oneRecord) => oneRecord.toObject());

const createRetrievalDriver = ({ candidateRetrievalLib, neo4jIntegerOf, hubEdgeType, baseRoleByBaseKind, runCypher, uriMinter, embeddingModelVersion, textIndexName, retrievalSettingValues }) => {
	const { hitsPerText, minScore, poolCap, indexWindowPerText } = retrievalSettingValues;

	// every distinct text of the slice, once: { [textHash]: [{ hitTextStableId, cosine, baseStableIdList }] }. A text with no hit is absent from the rows and has an empty list.
	const readHitListByTextHash = ({ session, fieldSlice, sourceName, baseRoleList }, done) => {
		const vectorByTextHash = fieldSlice.flatMap((oneField) => oneField.textList).reduce((soFar, { textHash, vector }) => { soFar.set(textHash, vector); return soFar; }, new Map());
		const textRowList = [...vectorByTextHash.entries()].map(([textHash, vector]) => ({ textHash, vector }));
		runCypher(session, HITS_CYPHER, { textRowList, textIndexName, indexWindowPerText: neo4jIntegerOf(indexWindowPerText), sourceName, minScore, baseRoleList, hitsPerText: neo4jIntegerOf(hitsPerText) }, (queryError, queryResult) => {
			if (queryError) {
				done(`reading text hits from ${sourceName}: ${queryError}`);
				return;
			}
			const hitListByTextHash = textRowList.reduce((soFar, { textHash }) => ({ ...soFar, [textHash]: [] }), {});
			rowsOf(queryResult).forEach(({ textHash, hitList }) => { hitListByTextHash[textHash] = hitList; });
			done('', hitListByTextHash);
		});
	};

	const textRecordOf = ({ oneField, oneText }) => ({
		textStableId: oneText.textHash,
		vector: oneText.vector,
		embeddingModelVersion,
		sourceStableId: oneField.fieldRefId,
		sourceRole: STRANGER_SOURCE_ROLE,
		propertyNameList: oneText.textRoleList,
	});

	const uriFieldsOf = ({ stableId, standardName }) => {
		const minted = uriMinter.uriForNode({ stableId, standardName });
		return minted.uri ? { uri: minted.uri } : { uriAbsentReason: minted.absentReason };
	};

	const emptyPool = () => ({ status: 'noCandidate', admittedCount: 0, poolSize: 0, candidateList: [] });

	const hubCardsPools = ({ session, fieldSlice, target }, done) => {
		const { hubName, sourceName } = target;
		const propertySlotName = hubEdgeType(hubName, PROPERTY_SLOT_NAME);
		readHitListByTextHash({ session, fieldSlice, sourceName, baseRoleList: Object.values(baseRoleByBaseKind) }, (hitError, hitListByTextHash) => {
			if (hitError) {
				done(hitError);
				return;
			}
			const allHitList = Object.values(hitListByTextHash).flat();
			const baseStableIdList = distinctOf(allHitList.flatMap((oneHit) => oneHit.baseStableIdList));
			if (baseStableIdList.length === 0) {
				done('', fieldSlice.reduce((soFar, { fieldRefId }) => ({ ...soFar, [fieldRefId]: emptyPool() }), {}));
				return;
			}
			runCypher(session, PROPERTY_SLOT_EDGES_CYPHER, { baseStableIdList, hubName, slotName: propertySlotName }, (propertyError, propertyResult) => {
				if (propertyError) {
					done(`reading ${hubName} property slots: ${propertyError}`);
					return;
				}
				const propertyEdgeList = rowsOf(propertyResult);
				const cardStableIdList = distinctOf(propertyEdgeList.map((oneEdge) => oneEdge.cardStableId));
				if (cardStableIdList.length === 0) {
					done('', fieldSlice.reduce((soFar, { fieldRefId }) => ({ ...soFar, [fieldRefId]: emptyPool() }), {}));
					return;
				}
				// a class or option-set path adds a vote to a card a property path admitted and never admits one, so these edges are read only for admitted cards: a CTDL class alone stands in a range slot of thousands
				runCypher(session, VOTE_ONLY_SLOT_EDGES_CYPHER, { cardStableIdList, baseStableIdList, slotNameList: VOTE_ONLY_SLOT_NAME_LIST.map((slotName) => hubEdgeType(hubName, slotName)) }, (voteError, voteResult) => {
					if (voteError) {
						done(`reading ${hubName} class slots: ${voteError}`);
						return;
					}
					voteAndRank({ session, fieldSlice, target, hitListByTextHash, cardSlotEdgeList: [...propertyEdgeList, ...rowsOf(voteResult)] }, done);
				});
			});
		});
	};

	const voteAndRank = ({ session, fieldSlice, target, hitListByTextHash, cardSlotEdgeList }, done) => {
		const { hubName } = target;
		const slotted = candidateRetrievalLib.buildCardSlotIndex({
			cardSlotEdgeList,
			slotNameBySlotKind: { property: hubEdgeType(hubName, PROPERTY_SLOT_NAME), domain: hubEdgeType(hubName, 'DOMAIN'), range: hubEdgeType(hubName, 'RANGE') },
			baseRoleByBaseKind,
		});
		if (slotted.error) {
			done(slotted.error.message);
			return;
		}
		const baseStableIdListByTextStableId = new Map(Object.values(hitListByTextHash).flat().map((oneHit) => [oneHit.hitTextStableId, oneHit.baseStableIdList]));
		const memoMade = candidateRetrievalLib.makeSearchMemo({ embedTextIndex: { matrix: new Float64Array(0), baseStableIdListByTextStableId }, hitsPerText, minScore });
		if (memoMade.error) {
			done(memoMade.error.message);
			return;
		}
		fieldSlice.flatMap((oneField) => oneField.textList).forEach(({ textHash, vector }) => {
			memoMade.searchMemo.entryByTextStableId.set(textHash, Object.freeze({ vector, hitList: Object.freeze(hitListByTextHash[textHash].map(({ hitTextStableId, cosine }) => Object.freeze({ hitTextStableId, cosine }))) }));
		});
		const textRecordListByFieldRefId = {};
		const votedByFieldRefId = {};
		for (let fieldIndex = 0; fieldIndex < fieldSlice.length; fieldIndex += 1) {
			const oneField = fieldSlice[fieldIndex];
			textRecordListByFieldRefId[oneField.fieldRefId] = oneField.textList.map((oneText) => textRecordOf({ oneField, oneText }));
			const voted = candidateRetrievalLib.voteCandidatePool({ searchMemo: memoMade.searchMemo, cardSlotIndex: slotted.cardSlotIndex, subjectStableId: oneField.fieldRefId, subjectTextRecordList: textRecordListByFieldRefId[oneField.fieldRefId] });
			if (voted.error) {
				done(voted.error.message);
				return;
			}
			votedByFieldRefId[oneField.fieldRefId] = voted.admittedList;
		}
		const admittedCardStableIdList = distinctOf(Object.values(votedByFieldRefId).flat().map((oneCandidate) => oneCandidate.stableId));
		if (admittedCardStableIdList.length === 0) {
			done('', fieldSlice.reduce((soFar, { fieldRefId }) => ({ ...soFar, [fieldRefId]: emptyPool() }), {}));
			return;
		}
		runCypher(session, CARD_FACTS_CYPHER, { cardStableIdList: admittedCardStableIdList }, (factsError, factsResult) => {
			if (factsError) {
				done(`reading ${hubName} cards: ${factsError}`);
				return;
			}
			const cardFactRowList = rowsOf(factsResult);
			const indexed = candidateRetrievalLib.buildHubVectorIndex({ vectorRecordList: cardFactRowList.map(({ stableId, embedding, embeddingModelVersion: cardModelVersion }) => ({ stableId, embedding, embeddingModelVersion: cardModelVersion })), embeddingModelVersion });
			if (indexed.error) {
				done(indexed.error.message);
				return;
			}
			const cardFactsByStableId = cardFactRowList.reduce((soFar, oneRow) => { soFar[oneRow.stableId] = oneRow; return soFar; }, {});
			const poolByFieldRefId = {};
			for (let fieldIndex = 0; fieldIndex < fieldSlice.length; fieldIndex += 1) {
				const { fieldRefId } = fieldSlice[fieldIndex];
				if (votedByFieldRefId[fieldRefId].length === 0) {
					poolByFieldRefId[fieldRefId] = emptyPool();
					continue;
				}
				const ordered = candidateRetrievalLib.cardTextCosineFor({ admittedList: votedByFieldRefId[fieldRefId], subjectTextRecordList: textRecordListByFieldRefId[fieldRefId], hubVectorIndex: indexed.hubVectorIndex });
				if (ordered.error) {
					done(ordered.error.message);
					return;
				}
				const ranked = candidateRetrievalLib.rankVotedCandidates({ admittedList: ordered.admittedList, k: ordered.admittedList.length });
				if (ranked.error) {
					done(ranked.error.message);
					return;
				}
				poolByFieldRefId[fieldRefId] = poolOfRanked({ rankedList: ranked.rankedList, cardFactsByStableId, sourceName: target.sourceName });
			}
			done('', poolByFieldRefId);
		});
	};

	// the forge's order (votes, then card text, then best cosine) decides the pool. The other order is computed beside it, because vote-first can drop a cosine rank-1 match (peer bridge pilot), so the card with the best cosine is always said even when the pool's cap left it out.
	const poolOfRanked = ({ rankedList, cardFactsByStableId, sourceName }) => {
		const rankByCosineOfStableId = new Map(rankedList.slice().sort((left, right) => (right.bestCosine - left.bestCosine) || compareText(left.stableId, right.stableId)).map((oneCandidate, candidateIndex) => [oneCandidate.stableId, candidateIndex + 1]));
		const candidateOf = (oneCandidate, candidateIndex) => ({
			stableId: oneCandidate.stableId,
			...uriFieldsOf({ stableId: oneCandidate.stableId, standardName: sourceName }),
			label: cardFactsByStableId[oneCandidate.stableId].label,
			domain: cardFactsByStableId[oneCandidate.stableId].domain,
			cosine: roundedCosine(oneCandidate.bestCosine),
			cardTextCosine: roundedCosine(oneCandidate.cardTextCosine),
			ownVotes: oneCandidate.ownVotes,
			rank: candidateIndex + 1,
			rankByCosine: rankByCosineOfStableId.get(oneCandidate.stableId),
			admittedBy: distinctOf(oneCandidate.pathList.flatMap((onePath) => onePath.propertyNameList)).sort(),
		});
		const candidateList = rankedList.slice(0, poolCap).map(candidateOf);
		const cosineRankOneIndex = rankedList.findIndex((oneCandidate) => rankByCosineOfStableId.get(oneCandidate.stableId) === 1);
		return {
			status: 'candidates',
			admittedCount: rankedList.length,
			poolSize: candidateList.length,
			candidateList,
			...(cosineRankOneIndex >= poolCap ? { cosineRankOneOutsidePool: candidateOf(rankedList[cosineRankOneIndex], cosineRankOneIndex) } : {}),
		};
	};

	// the peer bridge's door: a standard's own text nodes, and one EMBEDS_TEXT_OF to the element; no slot, no card
	const standardElementsPools = ({ session, fieldSlice, target }, done) => {
		const { standardName } = target;
		readHitListByTextHash({ session, fieldSlice, sourceName: standardName, baseRoleList: null }, (hitError, hitListByTextHash) => {
			if (hitError) {
				done(hitError);
				return;
			}
			const tallyByElementOfField = fieldSlice.map((oneField) => {
				const tallyByStableId = new Map();
				oneField.textList.forEach(({ textHash, textRoleList }) => hitListByTextHash[textHash].forEach(({ cosine, baseStableIdList }) => baseStableIdList.forEach((elementStableId) => {
					const oneTally = tallyByStableId.get(elementStableId) || { stableId: elementStableId, voterTextHashSet: new Set(), bestCosine: cosine, admittedBySet: new Set() };
					oneTally.voterTextHashSet.add(textHash);
					oneTally.bestCosine = Math.max(oneTally.bestCosine, cosine);
					textRoleList.forEach((textRole) => oneTally.admittedBySet.add(textRole));
					tallyByStableId.set(elementStableId, oneTally);
				})));
				return { fieldRefId: oneField.fieldRefId, tallyList: [...tallyByStableId.values()] };
			});
			const stableIdList = distinctOf(tallyByElementOfField.flatMap(({ tallyList }) => tallyList.map((oneTally) => oneTally.stableId)));
			runCypher(session, ELEMENT_FACTS_CYPHER, { stableIdList }, (factsError, factsResult) => {
				if (factsError) {
					done(`reading ${standardName} elements: ${factsError}`);
					return;
				}
				const labelByStableId = rowsOf(factsResult).reduce((soFar, { stableId, label }) => { soFar[stableId] = label; return soFar; }, {});
				done('', tallyByElementOfField.reduce((soFar, { fieldRefId, tallyList }) => {
					const sortedList = tallyList.slice().sort((left, right) => (right.voterTextHashSet.size - left.voterTextHashSet.size) || (right.bestCosine - left.bestCosine) || compareText(left.stableId, right.stableId));
					const rankByCosineOfStableId = new Map(tallyList.slice().sort((left, right) => (right.bestCosine - left.bestCosine) || compareText(left.stableId, right.stableId)).map((oneTally, tallyIndex) => [oneTally.stableId, tallyIndex + 1]));
					const candidateList = sortedList.slice(0, poolCap).map((oneTally, tallyIndex) => {
						return {
							stableId: oneTally.stableId,
							...uriFieldsOf({ stableId: oneTally.stableId, standardName }),
							label: labelByStableId[oneTally.stableId],
							cosine: roundedCosine(oneTally.bestCosine),
							ownVotes: oneTally.voterTextHashSet.size,
							rank: tallyIndex + 1,
							rankByCosine: rankByCosineOfStableId.get(oneTally.stableId),
							admittedBy: [...oneTally.admittedBySet].sort(),
						};
					});
					return { ...soFar, [fieldRefId]: candidateList.length ? { status: 'candidates', admittedCount: tallyList.length, poolSize: candidateList.length, candidateList } : emptyPool() };
				}, {}));
			});
		});
	};

	const POOL_RUNNER_BY_KIND = Object.freeze({ hubCards: hubCardsPools, standardElements: standardElementsPools });

	const poolsForFieldSlice = ({ session, fieldSlice, target }, done) => POOL_RUNNER_BY_KIND[target.kind]({ session, fieldSlice, target }, done);

	return { poolsForFieldSlice };
};

module.exports = { createRetrievalDriver };
