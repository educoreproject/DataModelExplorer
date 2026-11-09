'use strict';
// @concept: [[DataModelExplorer]]

// explorer-uri-fields — the EDUcore URI a Standards Explorer node or a use-case citation carries, so a person browsing can cite what they find
// (WORKORDER-explorerUris-110926). Every URI comes from the standards query core's PROVED minter, reached through the access point
// 'standards-query-uri-minter'; nothing here composes a URI. A citable thing whose URI cannot be minted says why, by name; never a blank.
//
//   readUriMinter({ accessPointsDotD }, callback) → callback('', { uriMinter } | { uriAbsentName })
//   uriFieldsOf({ minterAnswer, stableId, standardSourceName }) → { uri, uriKind } | { uriAbsentName }
//   elementListUriFieldsOf({ minterAnswer, standardSourceName }) → { elementListUri } | {}   (a standard's manifest listing of its elements)
//   prefixedUriFieldsOf(fieldPrefix, uriFields) → the same fields named for a cited element: { citedUri, citedUriKind } | { citedUriAbsentName }
//
// uriKind is 'edc' (an EDUcore URI, resolving on /edc/) or 'ownIri': the one permanent case uriMinter.js describes, a node whose stableId is
// another publisher's IRI (rdf:Property and the like), which says what the node is and promises nothing of ours.

const URI_MINTER_ACCESS_POINT_NAME = 'standards-query-uri-minter';

// why a citable thing carries no uri: the closed list a reader may meet
const URI_ABSENT_NAME_BY_CAUSE = Object.freeze({
	minterNotLoaded: 'uriMinterNotLoaded', // this server built no standards-query-uri-minter access point
	notInGraph: 'notInGraph', // the stableId names no node of the golden graph
});
const URI_KIND_EDC = 'edc';
const URI_KIND_OWN_IRI = 'ownIri';

const readUriMinter = ({ accessPointsDotD }, callback) => {
	const minterAccessPoint = accessPointsDotD ? accessPointsDotD[URI_MINTER_ACCESS_POINT_NAME] : undefined;
	if (typeof minterAccessPoint !== 'function') {
		callback('', { uriAbsentName: URI_ABSENT_NAME_BY_CAUSE.minterNotLoaded });
		return;
	}
	minterAccessPoint({}, callback);
};

// the minter says 'notMintable: <the forge's words>'; the name is the part before the colon
const absentNameOfReason = (absentReason) => String(absentReason).split(':')[0];

const uriFieldsOf = ({ minterAnswer, stableId, standardSourceName }) => {
	if (!minterAnswer.uriMinter) {
		return { uriAbsentName: minterAnswer.uriAbsentName };
	}
	// a hub card's stableId is its meaning IRI and needs no standard; every other node is named by its standard (_source)
	const minted = minterAnswer.uriMinter.uriForNode({ stableId, standardName: standardSourceName });
	if (minted.uri !== undefined) {
		return { uri: minted.uri, uriKind: minted.isOwnIri === true ? URI_KIND_OWN_IRI : URI_KIND_EDC };
	}
	if (standardSourceName === undefined || standardSourceName === null) {
		return { uriAbsentName: URI_ABSENT_NAME_BY_CAUSE.notInGraph };
	}
	return { uriAbsentName: absentNameOfReason(minted.absentReason) };
};

const elementListUriFieldsOf = ({ minterAnswer, standardSourceName }) => {
	if (!minterAnswer.uriMinter || !standardSourceName) {
		return {};
	}
	const elementListUri = minterAnswer.uriMinter.elementListUriFor(standardSourceName);
	return elementListUri ? { elementListUri } : {};
};

// uri → citedUri, uriKind → citedUriKind, uriAbsentName → citedUriAbsentName
const prefixedUriFieldsOf = (fieldPrefix, uriFields) =>
	Object.fromEntries(Object.entries(uriFields).map(([fieldName, fieldValue]) => [`${fieldPrefix}${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}`, fieldValue]));

module.exports = { readUriMinter, uriFieldsOf, elementListUriFieldsOf, prefixedUriFieldsOf, URI_MINTER_ACCESS_POINT_NAME, URI_ABSENT_NAME_BY_CAUSE, URI_KIND_EDC, URI_KIND_OWN_IRI };
