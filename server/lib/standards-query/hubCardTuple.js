'use strict';

// hubCardTuple — a hub card read as the tuple of elements it names (WORKORDER-P7a-rosettaPayloadShape-110926, TQ Q61-Q65). "To correctly reference an idea requires a
// CEDS tuple": a card decomposes through its slot edges (HAS_<HUB>_DOMAIN, _PROPERTY, _RANGE, _VALUE, _QUALIFIER, _TERM) to the elements it stands for, and each of those
// is a PART: { kind, nativeId, label, uri }. Two readers use it: the Rosetta runner, which stores a proposal's tuple at judge time, and the /edc meaning answer, which lists
// a card's ranges (Addendum 1, Q65).
//
//   hubCardTupleFor({ runCypher, session, hubName, cardStableId, uriForElement }, done)
//     uriForElement({ stableId, standardName }) → { uri, isOwnIri? } | { absentReason }   (uriMinter.uriForNode's interface)
//     → done(errorText) when a read fails, else done('', cardTupleFacts), cardTupleFacts being
//       { tuple: { <slotName>: part, ... } }  OR  { tupleAbsentName }       the IDENTITY slots, in hubCardTupleRules slot order, only those the card has
//       rangePartList: [part, ...]                                         every RANGE part, identity or not (the meaning page lists them all)
//       rangeIsIdentity: boolean                                           false when the hub's slotProfile addresses its range as meaning (CTDL today)
//       rangeDatatypeList: [text, ...]                                     the card's datatype range(s) as written, [] when it has none
//     part: { kind, nativeId: { <declared identifier name>: text } | nativeIdAbsentName, label, uri | uriAbsentReason }
//
// WHAT IS A SLOT OF THE TUPLE. Domain, property, value, qualifier and term name the card. The range names it only where the hub ADDRESSES its range: a hub whose slotProfile
// gives a field rangeAddressing 'rangeAsMeaning' holds its ranges as description (CTDL: up to 74 per card), so they are not in the tuple (ROMANTIC_PARASOL's ruling,
// 2026-11-09). A slot that is part of the tuple and holds two elements is not a tuple anyone can cite: the whole tuple is refused by name, never one element picked.
// THE PART'S KIND comes from the element's graph label (partKindByGraphLabel), never from the hub's name; its nativeId from the standard's own declaration
// (lib/nativeIdentifier.js, as P7 reads it: no property name is written here); its uri from the minter, which checks the manifest store holds the element.

const { NATIVE_IDENTIFIER_DECLARATION_CYPHER, nativeIdentifierDeclarationVerdictFor, nativeIdentifierCypherTextFor } = require('../../../cli/lib.d/data-model-explorer/lib/nativeIdentifier');
const { hubEdgeTypeFor } = require('../../../cli/lib.d/data-model-explorer/lib/toolPayloadContract');
const hubCardTupleRules = require('./hubCardTupleRules.json');

const TUPLE_ABSENT_NAME_LIST = Object.freeze([
	'hubCardNotFound', // no card by this stableId in this hub, in the graph that answered
	'hubSlotProfileUnreadable', // the hub's HubDefinition.slotProfile is absent or not JSON
	'hubCardHasNoSlot', // the card reaches no element through any slot
	'hubCardSlotAmbiguous', // a tuple slot reaches more than one element
	'hubElementKindUnknown', // an element carries no label partKindByGraphLabel knows
	'hubCardTupleUnreadable', // the read failed (set by a caller that keeps the rest of its work)
	'judgedBeforeTupleRecorded', // a Rosetta proposal written before P7a (set by rosettaReport)
]);
// the P7 names for an element with no native identifier, as hubElementIdentity and nativeIdentifier.js name them
const NATIVE_ID_ABSENT_NAME_LIST = Object.freeze(['nativeIdentifierUnstamped', 'nativeIdentifierDeclarationInvalid', 'hubStandardDeclaresNoNativeIdentifier', 'hubElementCarriesNoNativeIdentifier']);

const tupleAbsentOf = (absentName) => {
	if (!TUPLE_ABSENT_NAME_LIST.includes(absentName)) {
		throw new Error(`hubCardTuple: '${absentName}' is not a declared tuple absent name (${TUPLE_ABSENT_NAME_LIST.join(', ')})`);
	}
	return { tupleAbsentName: absentName };
};

const SLOT_NAME_BY_EDGE_SLOT_NAME = Object.freeze(hubCardTupleRules.slotList.reduce((soFar, oneSlot) => ({ ...soFar, [oneSlot.edgeSlotName]: oneSlot.slotName }), {}));
const slotNameOfEdgeType = (edgeType) => SLOT_NAME_BY_EDGE_SLOT_NAME[edgeType.split('_').slice(2).join('_')];

// the card, its hub's slotProfile, its datatype range fields and every slot element, in ONE read. The native identifier column is written from the graph's own
// declarations (checked against the identifier grammar by nativeIdentifier.js); when they are refused the column is null and every part says why.
const cardCypherFor = (declarationList) => `MATCH (card:HubReference { stableId: $cardStableId }) WHERE card.hubName = $hubName
OPTIONAL MATCH (hub:HubDefinition { hubName: card.hubName })
WITH card, head(collect(hub.slotProfile)) AS slotProfileText
OPTIONAL MATCH (card)-[slotEdge]->(element:ForgedNode) WHERE type(slotEdge) IN $slotEdgeTypeList
RETURN slotProfileText, [datatypeFieldName IN $datatypeFieldNameList | { fieldName: datatypeFieldName, written: card[datatypeFieldName] }] AS datatypeFieldList,
	collect(CASE WHEN element IS NULL THEN null ELSE { edgeType: type(slotEdge), graphLabelList: labels(element), stableId: element.stableId, standardName: element._source, label: element.name,
		nativeIdentifier: ${declarationList ? nativeIdentifierCypherTextFor('element', declarationList) : 'null'} } END) AS slotRowList`;

// the one boundary where graph text becomes an object: a slotProfile that is not JSON is an absence by name, never a throw into the runner
const slotProfileOf = (slotProfileText) => {
	if (typeof slotProfileText !== 'string') {
		return { error: 'absent' };
	}
	let slotProfile;
	try {
		slotProfile = JSON.parse(slotProfileText);
	} catch (parseException) {
		return { error: parseException.message };
	}
	return Array.isArray(slotProfile.fieldList) ? { slotProfile } : { error: 'no fieldList' };
};

// a datatype written as one string or as a list (the forge's loader writes a one-element list as a plain string), each kept as written
const writtenTextListOf = (written) => (Array.isArray(written) ? written : [written]).filter((oneText) => typeof oneText === 'string' && oneText !== '');

const partOf = ({ slotRow, declarationVerdict, uriForElement }) => {
	const kindLabel = slotRow.graphLabelList.find((oneLabel) => hubCardTupleRules.partKindByGraphLabel[oneLabel] !== undefined);
	if (!kindLabel) {
		return { kindUnknown: true };
	}
	const declaration = declarationVerdict.declarationList ? declarationVerdict.declarationList.find((oneDeclaration) => oneDeclaration.sourceKey === slotRow.standardName) : undefined;
	const nativeIdFields = (() => {
		if (declarationVerdict.refusalName) {
			return { nativeIdAbsentName: declarationVerdict.refusalName };
		}
		if (!declaration) {
			return { nativeIdAbsentName: 'hubStandardDeclaresNoNativeIdentifier' };
		}
		// a standard may publish a number as its identifier: it is carried as its text, as a reader would cite it
		const isCarried = slotRow.nativeIdentifier !== null && slotRow.nativeIdentifier !== undefined && String(slotRow.nativeIdentifier) !== '';
		return isCarried ? { nativeId: { [declaration.nativeIdentifierPropertyName]: String(slotRow.nativeIdentifier) } } : { nativeIdAbsentName: 'hubElementCarriesNoNativeIdentifier' };
	})();
	const minted = uriForElement({ stableId: slotRow.stableId, standardName: slotRow.standardName });
	return {
		part: {
			kind: hubCardTupleRules.partKindByGraphLabel[kindLabel],
			...nativeIdFields,
			label: slotRow.label,
			...(minted.uri === undefined ? { uriAbsentReason: minted.absentReason } : { uri: minted.uri }),
		},
	};
};

// PURE: the read's rows → cardTupleFacts. Exported so a gate can drive every branch without a graph.
const cardTupleFactsOf = ({ cardRowList, declarationVerdict, uriForElement }) => {
	if (cardRowList.length === 0) {
		return tupleAbsentOf('hubCardNotFound');
	}
	const [{ slotProfileText, datatypeFieldList, slotRowList }] = cardRowList;
	const slotProfileRead = slotProfileOf(slotProfileText);
	if (slotProfileRead.error) {
		return tupleAbsentOf('hubSlotProfileUnreadable');
	}
	const profileFieldList = slotProfileRead.slotProfile.fieldList;
	const rangeIsIdentity = !profileFieldList.some((oneField) => oneField.rangeAddressing === hubCardTupleRules.rangeAsMeaningAddressingName);
	const profileFieldNameList = profileFieldList.map((oneField) => oneField.fieldName);
	const rangeDatatypeList = datatypeFieldList.filter((oneField) => profileFieldNameList.includes(oneField.fieldName)).flatMap((oneField) => writtenTextListOf(oneField.written));
	if (slotRowList.length === 0) {
		return { ...tupleAbsentOf('hubCardHasNoSlot'), rangePartList: [], rangeIsIdentity, rangeDatatypeList };
	}
	const partRowList = slotRowList.map((slotRow) => ({ slotName: slotNameOfEdgeType(slotRow.edgeType), stableId: slotRow.stableId, ...partOf({ slotRow, declarationVerdict, uriForElement }) }));
	if (partRowList.some((partRow) => partRow.kindUnknown)) {
		return { ...tupleAbsentOf('hubElementKindUnknown'), rangePartList: [], rangeIsIdentity, rangeDatatypeList };
	}
	// ranges in their stableId order, so two reads of one card answer the same list
	const rangePartList = partRowList.filter((partRow) => partRow.slotName === hubCardTupleRules.rangeSlotName).sort((left, right) => (left.stableId < right.stableId ? -1 : left.stableId > right.stableId ? 1 : 0)).map((partRow) => partRow.part);
	const tupleSlotNameList = hubCardTupleRules.slotList.map((oneSlot) => oneSlot.slotName).filter((slotName) => rangeIsIdentity || slotName !== hubCardTupleRules.rangeSlotName);
	const tuplePartRowList = partRowList.filter((partRow) => tupleSlotNameList.includes(partRow.slotName));
	const isAmbiguous = tupleSlotNameList.some((slotName) => tuplePartRowList.filter((partRow) => partRow.slotName === slotName).length > 1);
	if (isAmbiguous) {
		return { ...tupleAbsentOf('hubCardSlotAmbiguous'), rangePartList, rangeIsIdentity, rangeDatatypeList };
	}
	if (tuplePartRowList.length === 0) {
		return { ...tupleAbsentOf('hubCardHasNoSlot'), rangePartList, rangeIsIdentity, rangeDatatypeList };
	}
	const tuple = tupleSlotNameList.reduce((soFar, slotName) => {
		const partRow = tuplePartRowList.find((onePartRow) => onePartRow.slotName === slotName);
		return partRow ? { ...soFar, [slotName]: partRow.part } : soFar;
	}, {});
	return { tuple, rangePartList, rangeIsIdentity, rangeDatatypeList };
};

const hubCardTupleFor = ({ runCypher, session, hubName, cardStableId, uriForElement }, done) => {
	if (typeof cardStableId !== 'string' || !cardStableId) {
		done(`hubCardTuple: cardStableId must be a stableId (got ${JSON.stringify(cardStableId)})`);
		return;
	}
	if (typeof uriForElement !== 'function') {
		done('hubCardTuple: uriForElement must be the minter\'s uriForNode; a part with no uri would be a blank');
		return;
	}
	const slotEdgeTypeList = hubCardTupleRules.slotList.map((oneSlot) => hubEdgeTypeFor(hubName, oneSlot.edgeSlotName));
	runCypher(session, NATIVE_IDENTIFIER_DECLARATION_CYPHER, {}, (declarationError, declarationResult) => {
		if (declarationError) {
			done(`hubCardTuple: the native identifier declarations would not read: ${declarationError}`);
			return;
		}
		const declarationVerdict = nativeIdentifierDeclarationVerdictFor(declarationResult.records.map((oneRecord) => ({ sourceKey: oneRecord.get('sourceKey'), nativeIdentifierPropertyName: oneRecord.get('nativeIdentifierPropertyName') })));
		const cardParameters = { cardStableId, hubName, slotEdgeTypeList, datatypeFieldNameList: hubCardTupleRules.datatypeRangeFieldNameList };
		runCypher(session, cardCypherFor(declarationVerdict.declarationList), cardParameters, (cardError, cardResult) => {
			if (cardError) {
				done(`hubCardTuple: the card ${cardStableId} would not read: ${cardError}`);
				return;
			}
			const cardRowList = cardResult.records.map((oneRecord) => ({ slotProfileText: oneRecord.get('slotProfileText'), datatypeFieldList: oneRecord.get('datatypeFieldList'), slotRowList: oneRecord.get('slotRowList') }));
			done('', cardTupleFactsOf({ cardRowList, declarationVerdict, uriForElement }));
		});
	});
};

// the identity ids of a tuple in slot order, as the summary bracket shows them: [C200296 · P002040]. A part with no identifier shows its slot and the reason.
const tupleBracketTextOf = ({ tuple, tupleAbsentName }) => {
	if (!tuple) {
		return `[no tuple: ${tupleAbsentName}]`;
	}
	const idTextList = hubCardTupleRules.slotList.map((oneSlot) => oneSlot.slotName).filter((slotName) => tuple[slotName]).map((slotName) => {
		const { nativeId, nativeIdAbsentName } = tuple[slotName];
		return nativeId ? Object.values(nativeId)[0] : `${slotName}: ${nativeIdAbsentName}`;
	});
	return `[${idTextList.join(' · ')}]`;
};

module.exports = { hubCardTupleFor, cardTupleFactsOf, tupleAbsentOf, tupleBracketTextOf, TUPLE_ABSENT_NAME_LIST, NATIVE_ID_ABSENT_NAME_LIST };
