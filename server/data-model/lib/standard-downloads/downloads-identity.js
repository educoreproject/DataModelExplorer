'use strict';

// downloads-identity.js — THE FOLDER INDEX: which downloads folder holds the downloads of which graph, by the graph's content
// identity (graph-identity.js), never by its name (WORKORDER-downloadsByIdentity-110626). One file beside the folders:
//
//   <downloadArtifactsRootDirPath>/downloadsIdentityIndex.json
//   { indexFormat: 'educoreDownloadsIdentityIndex/1',
//     entryList: [ { graphIdentitySha256, manifestRefId, graphContractSha256, folderName, downloadsManifestSha256, recordedAt, recordedFromGraphName } ] }
//
// An entry binds ONE identity to ONE folder and to the sha256 of that folder's downloads.json BYTES, so the forge-written manifest
// is never changed and yet nothing but the manifest recorded can be served under the identity. The folders keep their forge names
// (GOLD_261030_useCases ...); a server before this change reads them by name and ignores the index, so the two serve side by side
// while the new code rolls out. Entries are written by recordDownloadsIdentity.js, never by the server.
//
//   readIndex(rootDirPath)                         -> { index } | { refusalText }   (downloadsIdentityIndexAbsent | ...Unreadable)
//   entryForIdentity(index, graphIdentitySha256)   -> the one entry, or undefined
//   indexShapeFaultOf(index)                       -> '' | why it is not an index this code can trust
//   indexWithEntry(index | null, entry)            -> { index, recordOutcome: 'recorded' | 'alreadyRecorded' } | { refusalText }

const fs = require('fs');
const path = require('path');
const { GRAPH_IDENTITY_FIELD_NAME_LIST, SHA256_HEX_PATTERN, graphIdentityOf } = require('../graph-identity');

const INDEX_FILE_NAME = 'downloadsIdentityIndex.json';
const INDEX_FORMAT = 'educoreDownloadsIdentityIndex/1';
const INDEX_ENTRY_FIELD_NAME_LIST = Object.freeze(['graphIdentitySha256', 'manifestRefId', 'graphContractSha256', 'folderName', 'downloadsManifestSha256', 'recordedAt', 'recordedFromGraphName']);
const SHA256_FIELD_NAME_LIST = Object.freeze(['graphIdentitySha256', 'manifestRefId', 'graphContractSha256', 'downloadsManifestSha256']);
// a folder is a bare name in the root: nothing that could leave it
const FOLDER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const refusalOf = (refusalName, reasonText) => `${refusalName}: ${reasonText}`;

const entryFaultOf = (oneEntry) => {
	if (!oneEntry || typeof oneEntry !== 'object') {
		return 'an entry is not an object';
	}
	const absentList = INDEX_ENTRY_FIELD_NAME_LIST.filter((fieldName) => typeof oneEntry[fieldName] !== 'string' || oneEntry[fieldName] === '');
	if (absentList.length) {
		return `an entry lacks ${absentList.join(', ')}`;
	}
	const notHashList = SHA256_FIELD_NAME_LIST.filter((fieldName) => !SHA256_HEX_PATTERN.test(oneEntry[fieldName]));
	if (notHashList.length) {
		return `entry ${oneEntry.graphIdentitySha256}: ${notHashList.join(', ')} not 64 hex characters`;
	}
	if (!FOLDER_NAME_PATTERN.test(oneEntry.folderName) || oneEntry.folderName === '..' || oneEntry.folderName === '.') {
		return `entry ${oneEntry.graphIdentitySha256}: folderName '${oneEntry.folderName}' is not a bare folder name`;
	}
	// the identity must be the hash of the entry's own identity fields: an edited field is caught here, not served
	const recomputed = graphIdentityOf(GRAPH_IDENTITY_FIELD_NAME_LIST.reduce((soFar, fieldName) => ({ ...soFar, [fieldName]: oneEntry[fieldName] }), {}));
	if (recomputed.graphIdentitySha256 !== oneEntry.graphIdentitySha256) {
		return `entry ${oneEntry.graphIdentitySha256}: its ${GRAPH_IDENTITY_FIELD_NAME_LIST.join(' and ')} hash to ${recomputed.graphIdentitySha256}, not to its graphIdentitySha256`;
	}
	return '';
};

const indexShapeFaultOf = (index) => {
	if (!index || typeof index !== 'object') {
		return 'it is not a JSON object';
	}
	if (index.indexFormat !== INDEX_FORMAT) {
		return `its indexFormat is '${index.indexFormat}', not '${INDEX_FORMAT}'`;
	}
	if (!Array.isArray(index.entryList)) {
		return 'it lacks entryList';
	}
	const entryFaultList = index.entryList.map(entryFaultOf).filter((faultText) => faultText !== '');
	if (entryFaultList.length) {
		return entryFaultList.join('; ');
	}
	const repeatedIdentityList = index.entryList.map((oneEntry) => oneEntry.graphIdentitySha256).filter((graphIdentitySha256, entryIndex, identityList) => identityList.indexOf(graphIdentitySha256) !== entryIndex);
	return repeatedIdentityList.length ? `identity ${repeatedIdentityList.join(', ')} is listed more than once` : '';
};

const readIndex = (rootDirPath) => {
	const indexFilePath = path.join(rootDirPath, INDEX_FILE_NAME);
	if (!fs.existsSync(indexFilePath)) {
		return { refusalText: refusalOf('downloadsIdentityIndexAbsent', `${indexFilePath} does not exist: record the downloads with recordDownloadsIdentity.js`) };
	}
	let index;
	// the index is a file from outside this process: a parse fault is turned into a named refusal here
	try {
		index = JSON.parse(fs.readFileSync(indexFilePath, 'utf8'));
	} catch (parseError) {
		return { refusalText: refusalOf('downloadsIdentityIndexUnreadable', `${indexFilePath}: ${parseError.message}`) };
	}
	const shapeFault = indexShapeFaultOf(index);
	if (shapeFault) {
		return { refusalText: refusalOf('downloadsIdentityIndexUnreadable', `${indexFilePath}: ${shapeFault}`) };
	}
	return { index };
};

const entryForIdentity = (index, graphIdentitySha256) => index.entryList.find((oneEntry) => oneEntry.graphIdentitySha256 === graphIdentitySha256);

// the index with one more entry; the same entry again is alreadyRecorded; the same identity bound otherwise is refused
const indexWithEntry = (index, entry) => {
	const baseIndex = index || { indexFormat: INDEX_FORMAT, entryList: [] };
	const entryFault = entryFaultOf(entry);
	if (entryFault) {
		return { refusalText: refusalOf('downloadsIdentityIndexUnreadable', entryFault) };
	}
	const existingEntry = entryForIdentity(baseIndex, entry.graphIdentitySha256);
	if (!existingEntry) {
		return { index: { ...baseIndex, entryList: [...baseIndex.entryList, entry] }, recordOutcome: 'recorded' };
	}
	if (existingEntry.folderName === entry.folderName && existingEntry.downloadsManifestSha256 === entry.downloadsManifestSha256) {
		return { index: baseIndex, recordOutcome: 'alreadyRecorded', entry: existingEntry };
	}
	return { refusalText: refusalOf('downloadsIdentityAlreadyBound', `identity ${entry.graphIdentitySha256} is already bound to folder '${existingEntry.folderName}' (downloads.json ${existingEntry.downloadsManifestSha256}); remove that entry by hand before binding it to '${entry.folderName}'`) };
};

module.exports = { INDEX_FILE_NAME, INDEX_FORMAT, INDEX_ENTRY_FIELD_NAME_LIST, FOLDER_NAME_PATTERN, graphIdentityOf, indexShapeFaultOf, readIndex, entryForIdentity, indexWithEntry };
