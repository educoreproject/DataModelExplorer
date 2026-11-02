#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]
// @concept: [[AccessPointPattern]]
//
// Stores one uploaded companion source and makes it current for its (pageSlug, sourceRole, sourcePart) — gate G1.2.
// The server computes byteSize and sha256 from the decoded bytes; the caller's word on either is not asked for. The
// file is written first, under a new name ('wx': nothing is ever overwritten), then ONE insert adds the row as current,
// the table's MoveCurrent trigger clearing the previous current row inside that same statement. The previous row and
// its file stay. If the insert is refused, the file just written (referenced by nothing) is removed.
// The admin check is the endpoint's; seeding calls this same access point.
//
//   inputData: { pageSlug, sourceRole, sourcePart, fileName, fileBase64, originUrl, originNote, documentDate, uploadedBy }
//     sourcePart is '' for a single-file role; originUrl may be null; every other property is required
//   -> callback(errText, sourceRecord without storedFileName)

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();

const newRefId = require('../../lib/new-refid')({ digits: 20 });
const { getCompanionTables } = require('../../lib/companion-pages/companion-tables');
const { mediaTypeOf, storedFileNameOf, writeSourceFile, removeOwnOrphan, sha256Of } = require('../../lib/companion-pages/companion-source-files');
const { maxSourceByteSize, namePatternByField } = require('../../lib/companion-pages/companion-source-rules.json');

const QUIET = { suppressStatementLog: true };
const INPUT_PROPERTY_LIST = ['pageSlug', 'sourceRole', 'sourcePart', 'fileName', 'fileBase64', 'originUrl', 'originNote', 'documentDate', 'uploadedBy'];
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const isNonEmptyText = (candidateValue) => typeof candidateValue === 'string' && candidateValue.trim() !== '';

const isCalendarDate = (dateText) => /^\d{4}-\d{2}-\d{2}$/.test(String(dateText)) && new Date(`${dateText}T00:00:00Z`).toISOString().startsWith(dateText);

const refusalOfUpload = (uploadRequest) => {
	const unknownNameList = Object.keys(uploadRequest).filter((propertyName) => !INPUT_PROPERTY_LIST.includes(propertyName));
	if (unknownNameList.length) {
		return `upload has unknown propert${unknownNameList.length === 1 ? 'y' : 'ies'}: ${unknownNameList.join(', ')}`;
	}
	const absentNameList = INPUT_PROPERTY_LIST.filter((propertyName) => uploadRequest[propertyName] === undefined);
	if (absentNameList.length) {
		return `upload lacks ${absentNameList.join(', ')}`;
	}
	const badNameList = Object.keys(namePatternByField).filter((fieldName) => !new RegExp(namePatternByField[fieldName]).test(String(uploadRequest[fieldName])));
	if (badNameList.length) {
		return badNameList.map((fieldName) => `${fieldName} '${uploadRequest[fieldName]}' does not match ${namePatternByField[fieldName]}`).join('; ');
	}
	if (!isNonEmptyText(uploadRequest.fileName)) {
		return 'fileName is required';
	}
	const { refusalText } = mediaTypeOf(uploadRequest.fileName);
	if (refusalText) {
		return refusalText;
	}
	if (typeof uploadRequest.fileBase64 !== 'string' || !uploadRequest.fileBase64.length || !BASE64_PATTERN.test(uploadRequest.fileBase64)) {
		return 'fileBase64 must be non-empty base64 text';
	}
	if (uploadRequest.originUrl !== null && !/^https?:\/\/\S+$/.test(String(uploadRequest.originUrl))) {
		return 'originUrl must be an http(s) URL, or null';
	}
	if (!isNonEmptyText(uploadRequest.originNote)) {
		return 'originNote is required (who supplied the file, which draft)';
	}
	if (!isCalendarDate(uploadRequest.documentDate)) {
		return `documentDate '${uploadRequest.documentDate}' must be a YYYY-MM-DD date`;
	}
	if (!isNonEmptyText(uploadRequest.uploadedBy)) {
		return 'uploadedBy is required';
	}
	return '';
};

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { sqlDb, dataMapping, companionSourcesDirPath } = passThroughParameters;
	const pageMapper = dataMapping['companion-page'];
	const sourceMapper = dataMapping['companion-source'];

	const serviceFunction = (inputData, callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			if (!isNonEmptyText(companionSourcesDirPath)) {
				next(`${moduleName}: companionSourcesDirPath was not supplied to the access points`, args);
				return;
			}
			next(refusalOfUpload(args.uploadRequest), args);
		});

		taskList.push((args, next) => {
			const contentBuffer = Buffer.from(args.uploadRequest.fileBase64, 'base64');
			if (contentBuffer.length > maxSourceByteSize) {
				next(`the file is ${contentBuffer.length} bytes; the limit is ${maxSourceByteSize}`, args);
				return;
			}
			next('', { ...args, contentBuffer });
		});

		taskList.push((args, next) => getCompanionTables({ sqlDb, dataMapping }, mergeArgs(args, next, 'companionTables')));

		taskList.push((args, next) => {
			args.companionTables.pageTable.getData(pageMapper.getSql('byPageSlug', { pageSlug: args.uploadRequest.pageSlug }), QUIET, (err, rowList = []) =>
				next(err || (rowList.length ? '' : `no companion page '${args.uploadRequest.pageSlug}' is registered`), args),
			);
		});

		taskList.push((args, next) => {
			const { uploadRequest, contentBuffer } = args;
			const sourceRefId = newRefId();
			const sourceRecord = {
				refId: sourceRefId,
				pageSlug: uploadRequest.pageSlug,
				sourceRole: uploadRequest.sourceRole,
				sourcePart: uploadRequest.sourcePart,
				fileName: uploadRequest.fileName,
				storedFileName: storedFileNameOf({ sourceRefId, fileName: uploadRequest.fileName }),
				mediaType: mediaTypeOf(uploadRequest.fileName).mediaType,
				byteSize: contentBuffer.length,
				sha256: sha256Of(contentBuffer),
				originUrl: uploadRequest.originUrl,
				originNote: uploadRequest.originNote,
				documentDate: uploadRequest.documentDate,
				uploadedBy: uploadRequest.uploadedBy,
				uploadedAt: new Date().toISOString(),
				isCurrent: true,
			};
			writeSourceFile({ companionSourcesDirPath, pageSlug: sourceRecord.pageSlug, storedFileName: sourceRecord.storedFileName, contentBuffer }, (err) =>
				next(err, { ...args, sourceRecord }),
			);
		});

		taskList.push((args, next) => {
			const { sourceRecord, companionTables } = args;
			companionTables.sourceTable.runStatement(sourceMapper.getSql('insertAsCurrent', sourceMapper.map(sourceRecord, 'reverse')), QUIET, (insertError) => {
				if (!insertError) {
					next('', args);
					return;
				}
				removeOwnOrphan({ companionSourcesDirPath, pageSlug: sourceRecord.pageSlug, storedFileName: sourceRecord.storedFileName }, (removeError) =>
					next(`the source row was refused (${insertError})${removeError ? `; ${removeError}` : ''}`, args),
				);
			});
		});

		taskList.push((args, next) => {
			args.companionTables.sourceTable.getData(sourceMapper.getSql('byRefId', { refId: args.sourceRecord.refId }), QUIET, (err, rowList = []) =>
				next(err || (rowList.length ? '' : `${moduleName}: source ${args.sourceRecord.refId} was not stored`), { ...args, storedRow: rowList[0] }),
			);
		});

		const initialData = { uploadRequest: inputData || {} };

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				xLog.error(`${moduleName}: ${err}`);
				callback(err, {});
				return;
			}
			callback('', sourceMapper.toPublic(sourceMapper.map(args.storedRow, 'forward')));
		});
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
