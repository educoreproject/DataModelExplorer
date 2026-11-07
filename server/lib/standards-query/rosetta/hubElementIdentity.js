'use strict';

// hubElementIdentity — the native identifier of the hub element a judged card stands for (WORKORDER-P7-apiAnswerFixes-110726, fix 1). A proposal named its card by a hash
// URI and a label, so a reader could not cite the element (CEDS P002040, Military Discharge Date). The card decomposes to that element through its PROPERTY slot; the element's
// standard declares which of its properties is its own published identifier (StandardDefinition.nativeIdentifierPropertyName, read by lib/nativeIdentifier.js as the rest of
// the DME reads it), so nothing here names cedsId.
//
//   hubElementIdentityFor({ runCypher, session, cardStableId, hubName, tierName }, done) → done('', identityFields) | done(cypherErrorText)
//     identityFields is { hubElementNativeIdentifier, hubElementNativeIdentifierPropertyName } when the element carries its identifier,
//     else { hubElementNativeIdentifierAbsentName }: never a blank, never the stableId in its place.
//
// The absent names (HUB_ELEMENT_NATIVE_IDENTIFIER_ABSENT_NAME_LIST): the graph's declarations refused (nativeIdentifierUnstamped / nativeIdentifierDeclarationInvalid, as
// nativeIdentifier.js names them); the card decomposes to no element, or to more than one; the element's standard declares no native identifier; the element lacks it.
// judgedBeforeNativeIdentifierRecorded is not answered here: rosettaReport gives it to a proposal written before this module existed.

const { NATIVE_IDENTIFIER_DECLARATION_CYPHER, nativeIdentifierDeclarationVerdictFor, nativeIdentifierCypherTextFor } = require('../../../../cli/lib.d/data-model-explorer/lib/nativeIdentifier');
const { hubEdgeTypeFor } = require('../../../../cli/lib.d/data-model-explorer/lib/toolPayloadContract');

// which slot carries a card's own element, per tier the judge is offered; a tier not listed is refused by name
const HUB_ELEMENT_SLOT_NAME_BY_TIER_NAME = Object.freeze({ property: 'PROPERTY' });
const HUB_ELEMENT_NATIVE_IDENTIFIER_ABSENT_NAME_LIST = Object.freeze([
	'nativeIdentifierUnstamped',
	'nativeIdentifierDeclarationInvalid',
	'hubElementNotFound',
	'hubElementAmbiguous',
	'hubStandardDeclaresNoNativeIdentifier',
	'hubElementCarriesNoNativeIdentifier',
	'hubElementUnreadable',
	'judgedBeforeNativeIdentifierRecorded',
]);

const absentOf = (absentName) => {
	if (!HUB_ELEMENT_NATIVE_IDENTIFIER_ABSENT_NAME_LIST.includes(absentName)) {
		throw new Error(`hubElementIdentity: '${absentName}' is not a declared absent name (${HUB_ELEMENT_NATIVE_IDENTIFIER_ABSENT_NAME_LIST.join(', ')})`);
	}
	return { hubElementNativeIdentifierAbsentName: absentName };
};

const hubElementCypherFor = (declarationList) => `MATCH (card:HubReference { stableId: $cardStableId })-[slotEdge]->(element:ForgedNode) WHERE type(slotEdge) = $elementSlotEdgeType
RETURN element._source AS elementSource, ${nativeIdentifierCypherTextFor('element', declarationList)} AS nativeIdentifier`;

const hubElementIdentityFor = ({ runCypher, session, cardStableId, hubName, tierName }, done) => {
	const slotName = HUB_ELEMENT_SLOT_NAME_BY_TIER_NAME[tierName];
	if (!slotName) {
		done(`hubElementIdentity: tier '${tierName}' names no element slot (${Object.keys(HUB_ELEMENT_SLOT_NAME_BY_TIER_NAME).join(', ')})`);
		return;
	}
	if (typeof cardStableId !== 'string' || !cardStableId) {
		done(`hubElementIdentity: cardStableId must be a stableId (got ${JSON.stringify(cardStableId)})`);
		return;
	}
	runCypher(session, NATIVE_IDENTIFIER_DECLARATION_CYPHER, {}, (declarationError, declarationResult) => {
		if (declarationError) {
			done(`hubElementIdentity: the native identifier declarations would not read: ${declarationError}`);
			return;
		}
		const verdict = nativeIdentifierDeclarationVerdictFor(declarationResult.records.map((oneRecord) => ({ sourceKey: oneRecord.get('sourceKey'), nativeIdentifierPropertyName: oneRecord.get('nativeIdentifierPropertyName') })));
		if (verdict.refusalName) {
			done('', absentOf(verdict.refusalName));
			return;
		}
		runCypher(session, hubElementCypherFor(verdict.declarationList), { cardStableId, elementSlotEdgeType: hubEdgeTypeFor(hubName, slotName) }, (elementError, elementResult) => {
			if (elementError) {
				done(`hubElementIdentity: the card's element would not read: ${elementError}`);
				return;
			}
			const elementRowList = elementResult.records.map((oneRecord) => ({ elementSource: oneRecord.get('elementSource'), nativeIdentifier: oneRecord.get('nativeIdentifier') }));
			if (elementRowList.length === 0) {
				done('', absentOf('hubElementNotFound'));
				return;
			}
			if (elementRowList.length > 1) {
				done('', absentOf('hubElementAmbiguous'));
				return;
			}
			const [{ elementSource, nativeIdentifier }] = elementRowList;
			const declaration = verdict.declarationList.find((oneDeclaration) => oneDeclaration.sourceKey === elementSource);
			if (!declaration) {
				done('', absentOf('hubStandardDeclaresNoNativeIdentifier'));
				return;
			}
			// a standard may publish a number as its identifier: it is carried as its text, as a reader would cite it
			if (nativeIdentifier === null || nativeIdentifier === undefined || String(nativeIdentifier) === '') {
				done('', absentOf('hubElementCarriesNoNativeIdentifier'));
				return;
			}
			done('', { hubElementNativeIdentifier: String(nativeIdentifier), hubElementNativeIdentifierPropertyName: declaration.nativeIdentifierPropertyName });
		});
	});
};

module.exports = { hubElementIdentityFor, absentOf, HUB_ELEMENT_NATIVE_IDENTIFIER_ABSENT_NAME_LIST, HUB_ELEMENT_SLOT_NAME_BY_TIER_NAME };
