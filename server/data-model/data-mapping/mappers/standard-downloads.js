#!/usr/bin/env node
'use strict';

// standard-downloads.js (mapper) — the standard downloads (WORKORDER-standardDownloads-101526 §3b). The downloads are
// generated in educoreForge (apps/graph-builder/tools/downloadArtifacts.js) as one directory per golden graph:
//   <downloadArtifactsRootDirPath>/<graphName>/downloads.json   the manifest (manifestFormat educoreStandardDownloads/2)
//   <downloadArtifactsRootDirPath>/<graphName>/<fileName>.zip   one zip per available entry
// This mapper holds what the access point must not invent: the manifest's declared shape, the fields a browser may
// filter on, the fields an entry carries out to a browser (a whitelist, never renamed), and the one Cypher it runs (the
// golden's passport, read-only).

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName }) =>
	() => {
		const MANIFEST_FILE_NAME = 'downloads.json';
		// /2 (WORKORDER-sourceUrls-101526) added where each source came from; a /1 manifest is refused by name, never served
		// without it
		const MANIFEST_FORMAT = 'educoreStandardDownloads/2';
		// the request fields that filter the manifest, each matched exactly against the entry field of the same name
		const FILTER_FIELD_NAME_LIST = Object.freeze(['family', 'group', 'standardKey', 'facet']);
		// what an entry carries out to the browser; anything else in the manifest stays on the server
		// sourceUrl..sourceUrlNote: where the source came from, as the forge's standardSourceLocation records it (all null when
		// not recorded); sourceUrlRelationText is the wording to show, written by the generator from the forge's relation table
		const ENTRY_FIELD_NAME_LIST = Object.freeze(['downloadId', 'family', 'group', 'standardKey', 'standardName', 'version', 'facet', 'fileName', 'byteSize', 'sha256', 'roundTrip', 'description', 'available', 'unavailableReason', 'sourceUrl', 'sourceUrlRelation', 'sourceUrlRelationText', 'sourceUrlPage', 'sourceUrlNote']);
		// a manifest's fileName is a bare name in the golden's directory: nothing that could leave it
		const ZIP_FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/;

		const CYPHER_BY_NAME = Object.freeze({
			goldenPassport: 'MATCH (p:GraphProvenance) RETURN p.graphName AS graphName, p.graphContractSha256 AS graphContractSha256',
		});
		const getCypher = (queryName) => {
			if (!CYPHER_BY_NAME[queryName]) {
				throw new Error(`${moduleName}: unknown query name '${queryName}'; known: ${Object.keys(CYPHER_BY_NAME).join(', ')}`);
			}
			return { cypher: CYPHER_BY_NAME[queryName], params: {} };
		};

		// manifestShapeFaultOf — '' or why a parsed downloads.json is not a manifest this server can serve
		const manifestShapeFaultOf = (manifest) => {
			if (!manifest || typeof manifest !== 'object') {
				return 'it is not a JSON object';
			}
			if (manifest.manifestFormat !== MANIFEST_FORMAT) {
				return `its manifestFormat is '${manifest.manifestFormat}', not '${MANIFEST_FORMAT}'`;
			}
			const absentList = ['graphName', 'graphContractSha256', 'generatedAt'].filter((fieldName) => typeof manifest[fieldName] !== 'string' || manifest[fieldName] === '');
			if (absentList.length || !Array.isArray(manifest.entryList)) {
				return `it lacks ${absentList.concat(Array.isArray(manifest.entryList) ? [] : ['entryList']).join(', ')}`;
			}
			// every entry carries every field the browser is given (null where the manifest says there is none): a field
			// absent from the file is a malformed manifest, refused, never filled in here
			const incompleteList = manifest.entryList.filter((oneEntry) => ENTRY_FIELD_NAME_LIST.some((fieldName) => oneEntry[fieldName] === undefined)).map((oneEntry) => `${oneEntry.downloadId} (lacks ${ENTRY_FIELD_NAME_LIST.filter((fieldName) => oneEntry[fieldName] === undefined).join(', ')})`);
			if (incompleteList.length) {
				return `entries ${incompleteList.join('; ')}`;
			}
			const badFileNameList = manifest.entryList.filter((oneEntry) => oneEntry.available === true && !ZIP_FILE_NAME_PATTERN.test(`${oneEntry.fileName}`)).map((oneEntry) => oneEntry.downloadId);
			return badFileNameList.length ? `entries ${badFileNameList.join(', ')} name a file that is not a bare .zip name` : '';
		};

		const mapEntry = (oneEntry) => ENTRY_FIELD_NAME_LIST.reduce((soFar, fieldName) => ({ ...soFar, [fieldName]: oneEntry[fieldName] }), {});

		// ⟪ML3.1c, educoreForge mappingLayers⟫ THE PUBLICATION LISTING beside downloads.json: the gold's published mapping sets
		// (SSSOM sets, their registries and JSON-LD contexts) and the card download per hub release, written by educoreForge
		// layerPublicationCli -indexPublication as <graphName>/publicationDownloads.json
		const PUBLICATION_FILE_NAME = 'publicationDownloads.json';
		const PUBLICATION_FORMAT = 'educorePublicationDownloads/1';
		// what a publication entry carries out to the browser (a whitelist, never renamed); null where the kind has none
		const PUBLICATION_ENTRY_FIELD_NAME_LIST = Object.freeze(['downloadId', 'kind', 'format', 'relativePath', 'byteSize', 'sha256', 'layerKey', 'versionTag', 'standardKey', 'hubSegment', 'hubReleaseSegment', 'layerTitle', 'registrationStatus', 'hubName', 'hubVersion', 'cardCount']);
		// the kinds and the content type each is served with (DATA; an unlisted kind is refused, never served as octets)
		const CONTENT_TYPE_BY_PUBLICATION_KIND = Object.freeze({
			mappingSet: 'text/tab-separated-values; charset=utf-8',
			mappingContext: 'application/ld+json; charset=utf-8',
			layerRegistry: 'application/yaml; charset=utf-8',
			siteRegistry: 'application/yaml; charset=utf-8',
			hubCardsCsv: 'text/csv; charset=utf-8',
			hubCardsJsonLd: 'application/ld+json; charset=utf-8',
		});
		// a relativePath stays inside the gold's two publication folders: relative segments of safe characters, no '..'
		const PUBLICATION_RELATIVE_PATH_PATTERN = /^(mappingLayers|hubCards)(\/[A-Za-z0-9][A-Za-z0-9._@%:-]*)+$/;

		// publicationShapeFaultOf — '' or why a parsed publicationDownloads.json is not a listing this server can serve
		const publicationShapeFaultOf = (publication) => {
			if (!publication || typeof publication !== 'object') {
				return 'it is not a JSON object';
			}
			if (publication.manifestFormat !== PUBLICATION_FORMAT) {
				return `its manifestFormat is '${publication.manifestFormat}', not '${PUBLICATION_FORMAT}'`;
			}
			const absentList = ['graphName', 'publicLabel', 'manifestRefId', 'generatedAt'].filter((fieldName) => typeof publication[fieldName] !== 'string' || publication[fieldName] === '');
			if (absentList.length || !Array.isArray(publication.entryList)) {
				return `it lacks ${absentList.concat(Array.isArray(publication.entryList) ? [] : ['entryList']).join(', ')}`;
			}
			const badEntryList = publication.entryList.filter((oneEntry) => PUBLICATION_ENTRY_FIELD_NAME_LIST.some((fieldName) => oneEntry[fieldName] === undefined && ['downloadId', 'kind', 'format', 'relativePath', 'byteSize', 'sha256'].includes(fieldName)) || !CONTENT_TYPE_BY_PUBLICATION_KIND[oneEntry.kind] || !PUBLICATION_RELATIVE_PATH_PATTERN.test(`${oneEntry.relativePath}`) || `${oneEntry.relativePath}`.split('/').includes('..')).map((oneEntry) => `${oneEntry.downloadId}`);
			return badEntryList.length ? `entries ${badEntryList.join(', ')} lack a field, name an unknown kind, or name a path outside mappingLayers/ and hubCards/` : '';
		};

		const mapPublicationEntry = (oneEntry) => PUBLICATION_ENTRY_FIELD_NAME_LIST.reduce((soFar, fieldName) => ({ ...soFar, [fieldName]: oneEntry[fieldName] === undefined ? null : oneEntry[fieldName] }), {});
		// the name the browser saves a file under: its path, flattened, so two sets named set.sssom.tsv never collide
		const saveFileNameOf = (relativePath) => relativePath.split('/').join('_');

		return {
			MANIFEST_FILE_NAME,
			FILTER_FIELD_NAME_LIST,
			ZIP_FILE_NAME_PATTERN,
			getCypher,
			manifestShapeFaultOf,
			mapEntry,
			PUBLICATION_FILE_NAME,
			CONTENT_TYPE_BY_PUBLICATION_KIND,
			PUBLICATION_RELATIVE_PATH_PATTERN,
			publicationShapeFaultOf,
			mapPublicationEntry,
			saveFileNameOf,
		};
	};

module.exports = moduleFunction({ moduleName });
