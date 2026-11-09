'use strict';

// rosettaAnswerDetail — the two forms of a Rosetta answer, shared by fetch (rosettaReport) and retrieval (rosettaRetrieval) so the family has one word for each.
// lean is what a reader needs; audit is the same answer with everything lean leaves out put back. The registry rows declare lean as the default; a module given
// anything else throws, never reading it as the default. Its own file because retrieval must not load the judged step's modules (rosettaReport reads the judge's settings).

const DETAIL_LEAN = 'lean';
const DETAIL_AUDIT = 'audit';
const DETAIL_LIST = Object.freeze([DETAIL_LEAN, DETAIL_AUDIT]);

module.exports = { DETAIL_LEAN, DETAIL_AUDIT, DETAIL_LIST };
