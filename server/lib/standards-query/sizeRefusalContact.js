'use strict';

// sizeRefusalContact — what a refusal for size tells a person (TQ, cardUriAnswers-110426): who to write to for what they need. The words are the registry's and the address is one config value, [edc-resolver] sizeRefusalContactAddress.
//   sizeRefusalContactFor({ registry, contactAddress }) → { contact, sentence }
//   refusalWithSizeContact({ registry, contactAddress, refusal }) → the refusal, with the sentence and the address when registry.sizeRefusalNameList names it. Both places that refuse by name call this: the core, and the endpoint for a body over a route's limit.

const ADDRESS_MARK = '{contactAddress}';

const sizeRefusalContactFor = ({ registry, contactAddress }) => ({ contact: contactAddress, sentence: registry.sizeRefusalContactText.split(ADDRESS_MARK).join(contactAddress) });

const refusalWithSizeContact = ({ registry, contactAddress, refusal }) => {
	if (!registry.sizeRefusalNameList.includes(refusal.refusalName)) {
		return refusal;
	}
	const { contact, sentence } = sizeRefusalContactFor({ registry, contactAddress });
	return { ...refusal, reason: `${refusal.reason} ${sentence}`, contact };
};

module.exports = { sizeRefusalContactFor, refusalWithSizeContact };
