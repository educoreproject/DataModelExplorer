#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]
// @concept: [[AccessPointPattern]]
//
// The bytes of one companion source, located ONLY through its companionSource row (gate G1.4). A request names the
// row, either by sourceRefId or as the CURRENT row of (pageSlug, sourceRole, sourcePart); it can never name a path.
// Any other property in the request (path, fileName, storedFileName ...) is refused by name. The bytes are checked
// against the row's byteSize and sha256 before they are returned.
//
//   inputData: { sourceRefId } or { pageSlug, sourceRole, sourcePart }
//   -> callback(errText, { fileName, mediaType, sha256, contentBuffer })

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();

const { getCompanionTables } = require('../../lib/companion-pages/companion-tables');
const { readSourceFile } = require('../../lib/companion-pages/companion-source-files');
const { namePatternByField } = require('../../lib/companion-pages/companion-source-rules.json');

const QUIET = { suppressStatementLog: true };
// each shape names the mapper query that finds its row and how the request fills that query
const REQUEST_SHAPE_LIST = [
	{ shapeName: 'byRefId', propertyList: ['sourceRefId'], queryName: 'byRefId', replaceObjectOf: (fileRequest) => ({ refId: fileRequest.sourceRefId }) },
	{ shapeName: 'currentByPart', propertyList: ['pageSlug', 'sourceRole', 'sourcePart'], queryName: 'currentByPart', replaceObjectOf: (fileRequest) => fileRequest },
];

const shapeOf = (fileRequest) => {
	const requestPropertyList = Object.keys(fileRequest).sort();
	return REQUEST_SHAPE_LIST.find((oneShape) => oneShape.propertyList.slice().sort().join(',') === requestPropertyList.join(','));
};

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { sqlDb, dataMapping, companionSourcesDirPath } = passThroughParameters;
	const sourceMapper = dataMapping['companion-source'];

	const serviceFunction = (inputData, callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			const { fileRequest } = args;
			const requestShape = shapeOf(fileRequest);
			if (!requestShape) {
				next(`a source file is requested by { sourceRefId } or by { pageSlug, sourceRole, sourcePart }, and nothing else (got: ${Object.keys(fileRequest).join(', ') || 'nothing'})`, args);
				return;
			}
			if (requestShape.shapeName === 'byRefId' && !/^[A-Za-z0-9]{1,64}$/.test(String(fileRequest.sourceRefId))) {
				next('sourceRefId is not a refId', args);
				return;
			}
			const badNameList = requestShape.shapeName === 'currentByPart' ? Object.keys(namePatternByField).filter((fieldName) => !new RegExp(namePatternByField[fieldName]).test(String(fileRequest[fieldName]))) : [];
			if (badNameList.length) {
				next(`${badNameList.join(', ')} not well formed`, args);
				return;
			}
			next('', { ...args, requestShape });
		});

		taskList.push((args, next) => getCompanionTables({ sqlDb, dataMapping }, mergeArgs(args, next, 'companionTables')));

		taskList.push((args, next) => {
			const { fileRequest, requestShape, companionTables } = args;
			const queryText = sourceMapper.getSql(requestShape.queryName, requestShape.replaceObjectOf(fileRequest));
			companionTables.sourceTable.getData(queryText, QUIET, (err, rowList = []) => {
				if (err) {
					next(err, args);
					return;
				}
				if (!rowList.length) {
					next('no such companion source', args);
					return;
				}
				next('', { ...args, sourceRecord: sourceMapper.map(rowList[0], 'forward') });
			});
		});

		taskList.push((args, next) =>
			readSourceFile({ companionSourcesDirPath, sourceRecord: args.sourceRecord }, (err, contentBuffer) => next(err, { ...args, contentBuffer })),
		);

		const initialData = { fileRequest: inputData && typeof inputData === 'object' && !Array.isArray(inputData) ? inputData : {} };

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}
			const { sourceRecord, contentBuffer } = args;
			callback('', { fileName: sourceRecord.fileName, mediaType: sourceRecord.mediaType, sha256: sourceRecord.sha256, contentBuffer });
		});
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
