'use strict';

// uriMinter — every permanent URI in an answer comes from here, through the forge's own edcUri.mint (never composed by hand: a stableId without its standardKey
// prefix answers 404). The element form's version is read from the STORE by the manifest's member blocks, not from the graph: for MedBiquitous and SEDM
// :StandardDefinition.version says 'unknown' where the store's element index says 'unknown_02' and 'unknown_01', and the store is what answers the URI.
//
//   uriMinterFor({ edcUri, storeHandle, manifestLabel, standardVersionByName })
//     → { uriForNode({ stableId, standardName }) → { uri, isOwnIri? } | { absentReason }, questionUriFor(...), standardListUri(), elementListUriFor(standardName) }

const ELEMENT_IN_STORE_SQL = 'SELECT 1 AS isPresent FROM derivedElementIndex INDEXED BY derivedElementIndexByElement WHERE standardName = ? AND standardVersion = ? AND elementStableId = ? LIMIT 1';
const NOT_IN_STORE_REASON = 'notInManifestStore';
const UNKNOWN_STANDARD_REASON = 'standardNotInManifest';

const uriMinterFor = ({ edcUri, storeHandle, manifestLabel, standardVersionByName }) => {
	const elementInStore = storeHandle.prepare(ELEMENT_IN_STORE_SQL);

	const mintedUriOf = (mintRequest) => {
		const minted = edcUri.mint(mintRequest);
		return minted.error ? { absentReason: `notMintable: ${minted.error}` } : { uri: minted.uri };
	};

	// a hub card's stableId IS its meaning IRI. Any other stableId that is already an absolute IRI (CEDS's own terms) is its own URI by the forge's rule (assertionIdentity.js):
	// edcUri.mint refuses it for the element kind, and /edc/ does not resolve it, so isOwnIri says so. Every other node is minted. Both are checked against the store, so an
	// answer never carries a URI for a node the manifest does not hold.
	const isAbsoluteIri = (stableId) => edcUri.URI_SCHEME.absoluteIriPrefixList.some((onePrefix) => stableId.startsWith(onePrefix));

	const uriForNode = ({ stableId, standardName }) => {
		if (edcUri.parse(stableId).kind === 'meaning') {
			return { uri: stableId };
		}
		const standardVersion = standardVersionByName[standardName];
		if (standardVersion === undefined) {
			return { absentReason: UNKNOWN_STANDARD_REASON };
		}
		if (elementInStore.get(standardName, standardVersion, stableId) === undefined) {
			return { absentReason: NOT_IN_STORE_REASON };
		}
		return isAbsoluteIri(stableId) ? { uri: stableId, isOwnIri: true } : mintedUriOf({ kind: 'element', standardName, standardVersion, elementStableId: stableId });
	};

	const questionUriFor = ({ stableId, standardName }) => {
		const standardVersion = standardVersionByName[standardName];
		return standardVersion === undefined || isAbsoluteIri(stableId) ? {} : mintedUriOf({ kind: 'question', publicLabel: manifestLabel, standardName, standardVersion, elementStableId: stableId });
	};

	const standardListUri = () => mintedUriOf({ kind: 'manifestStandardList', publicLabel: manifestLabel }).uri;

	const elementListUriFor = (standardName) => {
		const standardVersion = standardVersionByName[standardName];
		return standardVersion === undefined ? undefined : mintedUriOf({ kind: 'manifestElementList', publicLabel: manifestLabel, standardName, standardVersion }).uri;
	};

	return { uriForNode, questionUriFor, standardListUri, elementListUriFor };
};

module.exports = { uriMinterFor, NOT_IN_STORE_REASON };
