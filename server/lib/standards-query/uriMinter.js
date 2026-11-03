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

	// THE ONE PERMANENT CASE. edcUri.mint spells a CEDS term by its declared prefix (ceds:P000033), but four CEDS rows have stableIds in another publisher's namespace (http://www.w3.org/...: rdf:Property,
	// rdfs:Class, owl:Class, owl:NamedIndividual). The forge refuses those for the element kind by decision, so such a node carries its own IRI, marked ownIri and not resolving here. It says what the node
	// is; it promises nothing of ours. Any other refused mint stays absent, with its reason.
	const elementUriOrForeignVocabularyIri = ({ standardName, standardVersion, stableId }) => {
		const minted = mintedUriOf({ kind: 'element', standardName, standardVersion, elementStableId: stableId });
		const isAbsoluteIri = edcUri.URI_SCHEME.absoluteIriPrefixList.some((onePrefix) => stableId.startsWith(onePrefix));
		return minted.uri === undefined && isAbsoluteIri ? { uri: stableId, isOwnIri: true } : minted;
	};

	// a hub card's stableId IS its meaning IRI. Every other node is checked against the store, so an answer never carries a URI for a node the manifest does not hold.
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
		return elementUriOrForeignVocabularyIri({ standardName, standardVersion, stableId });
	};

	const questionUriFor = ({ stableId, standardName }) => {
		const standardVersion = standardVersionByName[standardName];
		return standardVersion === undefined ? {} : mintedUriOf({ kind: 'question', publicLabel: manifestLabel, standardName, standardVersion, elementStableId: stableId });
	};

	const standardListUri = () => mintedUriOf({ kind: 'manifestStandardList', publicLabel: manifestLabel }).uri;

	const elementListUriFor = (standardName) => {
		const standardVersion = standardVersionByName[standardName];
		return standardVersion === undefined ? undefined : mintedUriOf({ kind: 'manifestElementList', publicLabel: manifestLabel, standardName, standardVersion }).uri;
	};

	return { uriForNode, questionUriFor, standardListUri, elementListUriFor };
};

module.exports = { uriMinterFor, NOT_IN_STORE_REASON };
