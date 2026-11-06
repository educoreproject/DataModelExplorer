'use strict';

// graph-identity.js — a graph's CONTENT identity, read from its passport (TQ 2026-11-06: tying downloads to a graph's name is "a
// terrible mistake"; ROMANTIC_PARASOL's rule the same day). A name is only an address: one graph runs under several (production's
// byte copy of demo's golden, a renamed promotion, a zero-spend replay). The identity is
//
//     graphIdentitySha256 = sha256( manifestRefId | graphContractSha256 )        (utf-8, '|' between, in that order)
//
// manifestRefId is the content address of the manifest the graph was replayed from (educoreForge apps/graph-builder/interfaces.js,
// "A manifest's refId IS contentAddress.manifestKeyForMembership over its membership"); graphContractSha256 is the sha256 of the
// forge vocabulary contract the build ran with. Same inputs under the same contract give the same content: the forge attests
// reforgeDeterminism before a graph is stamped. NOT in it, deliberately: graphName (the promotion stamp rewrites it), builtAt (a
// replay of identical content has another), scratchGraphName and vectorIndexNameList (stamp-written).
// THE RESIDUAL RISK this rule accepts: a rebuild under the same manifest and contract that is NOT deterministic would share the
// identity while its content differs. Only a content hash stamped by the forge would close it.
//
//   graphIdentityOf(passport) -> { graphIdentitySha256 } | { refusalText }   every identity field must be 64 lowercase hex

const crypto = require('crypto');

// the passport fields the identity is made of, in hash order (DATA: the one place the rule is written)
const GRAPH_IDENTITY_FIELD_NAME_LIST = Object.freeze(['manifestRefId', 'graphContractSha256']);
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

const graphIdentityOf = (passport) => {
	const faultList = GRAPH_IDENTITY_FIELD_NAME_LIST.filter((fieldName) => !passport || typeof passport[fieldName] !== 'string' || !SHA256_HEX_PATTERN.test(passport[fieldName])).map((fieldName) => `${fieldName} ${JSON.stringify(passport ? passport[fieldName] : undefined)}`);
	if (faultList.length) {
		return { refusalText: `the passport's ${faultList.join(' and ')} ${faultList.length === 1 ? 'is' : 'are'} not 64 hex characters, so the graph has no identity` };
	}
	const identityText = GRAPH_IDENTITY_FIELD_NAME_LIST.map((fieldName) => passport[fieldName]).join('|');
	return { graphIdentitySha256: crypto.createHash('sha256').update(identityText, 'utf8').digest('hex') };
};

module.exports = { GRAPH_IDENTITY_FIELD_NAME_LIST, SHA256_HEX_PATTERN, graphIdentityOf };
