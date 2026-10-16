'use strict';

// card-property-identity.js — revision 12 (WORKORDER-RATER12): which CEDS PROPERTY a card is, the class ignored, and
// the gathering of a shuffled card list by it. A card is a CEDS property in a class; one property often comes in
// several classes in one list (eg Number of Credits Earned ×7), and side by side the rater compares classes directly.
//
//   propertyIdentityOf(card) -> text: the card's cedsId (the CEDS property's P-id, HubReference.propertyKey) and its
//       qualifierNameList (sorted, so their order does not matter), eg 'P001572|Student Identifier'. Two cards with the
//       same identity differ only by class. Throws, naming the field, when cedsId or qualifierNameList is absent.
//       Revision 13 (property-level agreement in the admin results) keys on the same two fields.
//   gatherCardsByPropertyIdentity(cardList) -> a new list: each property's cards together, the group where its first
//       member falls in the given order, its members after it in the given order; singletons unchanged. The input is
//       not changed. Applied AFTER the rater's (or the preview's) seeded shuffle, so the shuffle still decides where
//       each group and each singleton sits.

const CEDS_PROPERTY_ID_PATTERN = /^P\d{6}$/;

const propertyIdentityOf = (card) => {
	if (!card || typeof card.cedsId !== 'string' || !CEDS_PROPERTY_ID_PATTERN.test(card.cedsId)) {
		throw new Error(`card-property-identity: card ${card && card.cedsTupleId} has no CEDS property id (cedsId, a P-id); got ${JSON.stringify(card && card.cedsId)}`);
	}
	if (!Array.isArray(card.qualifierNameList)) {
		throw new Error(`card-property-identity: card ${card.cedsTupleId} has no qualifierNameList (an empty list when it has no qualifier)`);
	}
	return [card.cedsId].concat(card.qualifierNameList.slice().sort()).join('|');
};

const gatherCardsByPropertyIdentity = (cardList) => {
	const memberListByPropertyIdentity = new Map();
	cardList.forEach((card) => {
		const propertyIdentity = propertyIdentityOf(card);
		if (!memberListByPropertyIdentity.has(propertyIdentity)) {
			memberListByPropertyIdentity.set(propertyIdentity, []);
		}
		memberListByPropertyIdentity.get(propertyIdentity).push(card);
	});
	return Array.from(memberListByPropertyIdentity.values()).reduce((soFar, memberList) => soFar.concat(memberList), []);
};

module.exports = { propertyIdentityOf, gatherCardsByPropertyIdentity };
