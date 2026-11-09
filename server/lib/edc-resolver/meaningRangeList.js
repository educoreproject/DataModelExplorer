'use strict';

// meaningRangeList — a card's /edc meaning answer gains the card's ranges (WORKORDER-P7a-rosettaPayloadShape-110926, Addendum 1, TQ Q65). A lean Rosetta answer gives a card's
// uri and leaves a hub's descriptive ranges out of the tuple; a reader must still reach them from that uri, so the meaning page lists them.
//
//   meaningRangeListFieldsFor({ withReadSession, runCypher, uriForElementFor, meaningBody, xLog }, done) → done(rangeFields), never an error: every way of not knowing is named (a failed read's text goes to the log, not the answer)
//     withReadSession(work(session, sessionDone), afterSession(errorText, result))   the golden graph's read session (golden-graph-handle), or null when this instance has none
//     uriForElementFor({ hubName, hubVersion }) → uriForElement({ stableId, standardName }) → { uri } | { absentReason }
//     meaningBody: the forge's kind 'meaning' answer (it names the card by meaning, hubName and hubVersion)
//     rangeFields: { rangeList: [part, ...], rangeDatatypeList?: [text, ...] } | { rangeListAbsentName }
//   withMeaningRangeList(meaningBody, rangeFields) → the body with the range fields placed after its domain (at the end when it has none)
//
// WHERE THE RANGES COME FROM. The forge answers a meaning from the uriContract store, which holds no RANGE edges and no native-identifier declarations, so this reads the
// live golden through the same reader the Rosetta tuple uses (hubCardTuple), with element uris minted at the card's own hubVersion. Every RANGE part is listed, whether the
// hub addresses its range (CEDS: one, also in the tuple) or describes it (CTDL: up to 74). A datatype range is not an element and has no uri: it is carried as written.
// A card the live graph does not hold (one only an older manifest lists) says so; it is not answered from elsewhere.

const { hubCardTupleFor } = require('../standards-query/hubCardTuple');

const RANGE_LIST_ABSENT_NAME_BY_TUPLE_ABSENT_NAME = Object.freeze({ hubCardNotFound: 'cardNotInLiveGraph', hubSlotProfileUnreadable: 'hubSlotProfileUnreadable', hubElementKindUnknown: 'hubElementKindUnknown' });
const RANGE_LIST_ABSENT_NAME_LIST = Object.freeze(['cardNotInLiveGraph', 'cardHasNoRange', 'rangeListUnreadable', 'noLiveGraph', 'hubSlotProfileUnreadable', 'hubElementKindUnknown']);
const RANGE_FIELD_NAME_LIST = Object.freeze(['rangeList', 'rangeDatatypeList', 'rangeListAbsentName']);
const PLACED_AFTER_FIELD_NAME = 'domain';

const rangeListAbsentOf = (absentName) => {
	if (!RANGE_LIST_ABSENT_NAME_LIST.includes(absentName)) {
		throw new Error(`meaningRangeList: '${absentName}' is not a declared range list absent name (${RANGE_LIST_ABSENT_NAME_LIST.join(', ')})`);
	}
	return { rangeListAbsentName: absentName };
};

// PURE: what the card's tuple read says about its ranges
const rangeFieldsOf = (cardTupleFacts) => {
	const mappedAbsentName = RANGE_LIST_ABSENT_NAME_BY_TUPLE_ABSENT_NAME[cardTupleFacts.tupleAbsentName];
	if (mappedAbsentName) {
		return rangeListAbsentOf(mappedAbsentName);
	}
	const { rangePartList, rangeDatatypeList } = cardTupleFacts;
	if (rangePartList.length === 0 && rangeDatatypeList.length === 0) {
		return rangeListAbsentOf('cardHasNoRange');
	}
	return { rangeList: rangePartList, ...(rangeDatatypeList.length ? { rangeDatatypeList } : {}) };
};

const meaningRangeListFieldsFor = ({ withReadSession, runCypher, uriForElementFor, meaningBody, xLog }, done) => {
	if (!withReadSession) {
		done(rangeListAbsentOf('noLiveGraph'));
		return;
	}
	const { meaning: cardStableId, hubName, hubVersion } = meaningBody;
	withReadSession((session, sessionDone) => hubCardTupleFor({ runCypher, session, hubName, cardStableId, uriForElement: uriForElementFor({ hubName, hubVersion }) }, sessionDone), (tupleError, cardTupleFacts) => {
		if (tupleError) {
			xLog.error(`meaningRangeList: the ranges of ${cardStableId} would not read: ${tupleError}`);
			done(rangeListAbsentOf('rangeListUnreadable'));
			return;
		}
		done(rangeFieldsOf(cardTupleFacts));
	});
};

// the range fields read next to the card's domain, before its manifests and mappings
const withMeaningRangeList = (meaningBody, rangeFields) => (PLACED_AFTER_FIELD_NAME in meaningBody
	? Object.keys(meaningBody).reduce((soFar, fieldName) => ({ ...soFar, [fieldName]: meaningBody[fieldName], ...(fieldName === PLACED_AFTER_FIELD_NAME ? rangeFields : {}) }), {})
	: { ...meaningBody, ...rangeFields });

module.exports = { meaningRangeListFieldsFor, withMeaningRangeList, rangeFieldsOf, rangeListAbsentOf, RANGE_LIST_ABSENT_NAME_LIST, RANGE_FIELD_NAME_LIST };
