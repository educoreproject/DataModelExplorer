#!/usr/bin/env node
'use strict';

// standard-downloads.js (mapper) — the standard downloads (WORKORDER-standardDownloads-101526 §3b). The downloads are
// generated in educoreForge (apps/graph-builder/tools/downloadArtifacts.js) as one directory per golden graph:
//   <downloadArtifactsRootDirPath>/<graphName>/downloads.json   the manifest (manifestFormat educoreStandardDownloads/1)
//   <downloadArtifactsRootDirPath>/<graphName>/<fileName>.zip   one zip per available entry
// This mapper holds what the access point must not invent: the manifest's declared shape, the fields a browser may
// filter on, the fields an entry carries out to a browser (a whitelist, never renamed), and the one Cypher it runs (the
// golden's passport, read-only).

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName }) =>
	() => {
		const MANIFEST_FILE_NAME = 'downloads.json';
		const MANIFEST_FORMAT = 'educoreStandardDownloads/1';
		// the request fields that filter the manifest, each matched exactly against the entry field of the same name
		const FILTER_FIELD_NAME_LIST = Object.freeze(['family', 'group', 'standardKey', 'facet']);
		// what an entry carries out to the browser; anything else in the manifest stays on the server
		const ENTRY_FIELD_NAME_LIST = Object.freeze(['downloadId', 'family', 'group', 'standardKey', 'standardName', 'version', 'facet', 'fileName', 'byteSize', 'sha256', 'roundTrip', 'description', 'available', 'unavailableReason']);
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

		return {
			MANIFEST_FILE_NAME,
			FILTER_FIELD_NAME_LIST,
			ZIP_FILE_NAME_PATTERN,
			getCypher,
			manifestShapeFaultOf,
			mapEntry,
		};
	};

module.exports = moduleFunction({ moduleName });
