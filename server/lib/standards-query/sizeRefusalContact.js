'use strict';

// sizeRefusalContact — what a refusal for size tells a person (TQ, cardUriAnswers-110426): who to write to for what they need. The words are the registry's and the address is one config value, [edc-resolver] sizeRefusalContactAddress.
//   sizeRefusalContactFor({ registry, contactAddress }) → { contact, sentence }

const ADDRESS_MARK = '{contactAddress}';

const sizeRefusalContactFor = ({ registry, contactAddress }) => ({ contact: contactAddress, sentence: registry.sizeRefusalContactText.split(ADDRESS_MARK).join(contactAddress) });

module.exports = { sizeRefusalContactFor };
