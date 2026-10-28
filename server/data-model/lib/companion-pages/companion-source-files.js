#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]
//
// Where companion source bytes live and the rules for reaching them. Files sit under
// <companionSourcesDirPath>/<pageSlug>/<storedFileName>, where storedFileName is chosen by the server
// (<sourceRefId>-<sanitized original name>) and recorded on the companionSource row. Nothing here accepts a path from a
// request: a file is located only from its row, and the resolved path must stay inside its page's directory.
// Files are written with the 'wx' flag, so an existing file is never replaced.
//
//   companionSourcesDirPathOf(databaseContainerDirPath)          -> the sources directory, beside the database
//   mediaTypeOf(fileName)                                        -> { mediaType } or { refusalText }
//   storedFileNameOf({ sourceRefId, fileName })                  -> storedFileName
//   writeSourceFile({ companionSourcesDirPath, pageSlug, storedFileName, contentBuffer }, callback(errText))
//   readSourceFile({ companionSourcesDirPath, sourceRecord }, callback(errText, contentBuffer))   checks size and sha256
//   removeOwnOrphan({ companionSourcesDirPath, pageSlug, storedFileName }, callback(errText))   only for a write whose row failed
//   sha256Of(contentBuffer)                                      -> hex

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { mediaTypeByExtension } = require('./companion-source-rules.json');

const companionSourcesDirPathOf = (databaseContainerDirPath) => path.join(databaseContainerDirPath, 'companionSources');

const sha256Of = (contentBuffer) => crypto.createHash('sha256').update(contentBuffer).digest('hex');

const extensionOf = (fileName) => path.extname(String(fileName)).replace(/^\./, '').toLowerCase();

const mediaTypeOf = (fileName) => {
	const extensionText = extensionOf(fileName);
	if (!mediaTypeByExtension[extensionText]) {
		return { refusalText: `file extension '${extensionText}' is not allowed for a companion source (allowed: ${Object.keys(mediaTypeByExtension).join(', ')})` };
	}
	return { mediaType: mediaTypeByExtension[extensionText] };
};

// the original name keeps letters, digits, dot, dash and underscore; everything else becomes '_'
const storedFileNameOf = ({ sourceRefId, fileName }) => `${sourceRefId}-${path.basename(String(fileName)).replace(/[^A-Za-z0-9._-]/g, '_')}`;

const pageDirPathOf = ({ companionSourcesDirPath, pageSlug }) => path.join(companionSourcesDirPath, pageSlug);

// the one place a stored name becomes a path; refuses anything that would leave the page directory
const filePathOf = ({ companionSourcesDirPath, pageSlug, storedFileName }) => {
	const pageDirPath = path.resolve(pageDirPathOf({ companionSourcesDirPath, pageSlug }));
	const filePath = path.resolve(pageDirPath, String(storedFileName));
	if (path.dirname(filePath) !== pageDirPath) {
		return { refusalText: `${moduleName}: stored file name '${storedFileName}' does not resolve inside the page directory` };
	}
	return { filePath };
};

const writeSourceFile = ({ companionSourcesDirPath, pageSlug, storedFileName, contentBuffer }, callback) => {
	const { filePath, refusalText } = filePathOf({ companionSourcesDirPath, pageSlug, storedFileName });
	if (refusalText) {
		callback(refusalText);
		return;
	}
	fs.mkdir(path.dirname(filePath), { recursive: true }, (mkdirError) => {
		if (mkdirError) {
			callback(`${moduleName}: could not create ${pageSlug} source directory: ${mkdirError.message}`);
			return;
		}
		fs.writeFile(filePath, contentBuffer, { flag: 'wx' }, (writeError) => callback(writeError ? `${moduleName}: could not write ${storedFileName}: ${writeError.code || writeError.message}` : ''));
	});
};

const readSourceFile = ({ companionSourcesDirPath, sourceRecord }, callback) => {
	const { filePath, refusalText } = filePathOf({ companionSourcesDirPath, pageSlug: sourceRecord.pageSlug, storedFileName: sourceRecord.storedFileName });
	if (refusalText) {
		callback(refusalText);
		return;
	}
	fs.readFile(filePath, (readError, contentBuffer) => {
		if (readError) {
			callback(`${moduleName}: the file for source ${sourceRecord.refId} is not on record (${readError.code || readError.message})`);
			return;
		}
		if (contentBuffer.length !== Number(sourceRecord.byteSize) || sha256Of(contentBuffer) !== sourceRecord.sha256) {
			callback(`${moduleName}: the file for source ${sourceRecord.refId} does not match its recorded size and sha256`);
			return;
		}
		callback('', contentBuffer);
	});
};

const removeOwnOrphan = ({ companionSourcesDirPath, pageSlug, storedFileName }, callback) => {
	const { filePath, refusalText } = filePathOf({ companionSourcesDirPath, pageSlug, storedFileName });
	if (refusalText) {
		callback(refusalText);
		return;
	}
	fs.unlink(filePath, (unlinkError) => callback(unlinkError ? `${moduleName}: could not remove orphan ${storedFileName}: ${unlinkError.code}` : ''));
};

module.exports = { companionSourcesDirPathOf, mediaTypeOf, storedFileNameOf, writeSourceFile, readSourceFile, removeOwnOrphan, sha256Of };
