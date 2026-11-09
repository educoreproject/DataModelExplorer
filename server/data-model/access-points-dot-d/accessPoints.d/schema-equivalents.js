#!/usr/bin/env node
'use strict';
// @concept: [[SpecificationViewer]]
// @concept: [[Neo4jAbstraction]]
// @concept: [[AccessPointPattern]]

// schema-equivalents — the Specification Viewer's graph lookup on the CURRENT graph (campaign P4b, A11 / W-E-8). Input
// { wordList }: the significant words of one property name, already tokenized by the browser store (the same words
// its HR Open crosswalk matching uses). Output: the mapper's equivalent rows (see mappers/schema-equivalents.js).
// Runs on the golden READ-ONLY handle; refuses by name when the graph lacks a label the query reads, and when the
// word list is absent or empty.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();
const { readNativeIdentifierDeclarations } = require('../../../lib/native-identifier-declarations');
const { makeRequiredLabelProbe } = require('../../lib/required-label-probe');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { neo4jDb, dataMapping } = passThroughParameters;
	const mapper = dataMapping[moduleName];

	const probeRequiredLabels = makeRequiredLabelProbe({
		neo4jDb,
		ownerName: moduleName,
		requiredLabelList: mapper.requiredLabelList,
		absentReason: 'the Specification Viewer reads the forged standards and their hub cards',
	});

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (xQuery, callback) => {
		const taskList = new taskListPlus();

		// STAGE 1: the word list is REQUIRED — a missing list is a caller bug, not a request for everything
		taskList.push((args, next) => {
			const { wordList } = args.xQuery;
			const usableWordList = Array.isArray(wordList) ? wordList.filter((oneWord) => typeof oneWord === 'string' && oneWord.trim() !== '').map((oneWord) => oneWord.trim().toLowerCase()) : [];
			if (usableWordList.length === 0) {
				next(`${moduleName}: wordList is REQUIRED as a non-empty list of words (received ${JSON.stringify(wordList)})`, args);
				return;
			}
			next('', { ...args, usableWordList, minimumHitCount: Math.max(1, Math.ceil(usableWordList.length / 2)) });
		});

		// STAGE 2: the graph must carry every label the query reads
		taskList.push((args, next) => probeRequiredLabels((probeError) => next(probeError, args)));

		// STAGE 3 (lane zbE, E1-1): which property carries each standard's own identifier, from the graph
		taskList.push((args, next) => readNativeIdentifierDeclarations({ neo4jDb }, (err, nativeIdentifierDeclarationList) => {
			if (err) {
				next(`${moduleName}: ${err}`, args);
				return;
			}
			next('', { ...args, nativeIdentifierDeclarationList });
		}));

		// STAGE 4: query and map
		taskList.push((args, next) => {
			const queryBundle = mapper.getCypher('equivalentsByWordList', { wordList: args.usableWordList, minimumHitCount: args.minimumHitCount, nativeIdentifierDeclarationList: args.nativeIdentifierDeclarationList });
			neo4jDb.runQuery(queryBundle.cypher, queryBundle.params, (queryError, recordList) => {
				if (queryError) {
					next(`${moduleName}: query failed: ${queryError}`, args);
					return;
				}
				next('', { ...args, equivalentRowList: mapper.mapEquivalentRows(recordList) });
			});
		});

		pipeRunner(taskList.getList(), { xQuery: xQuery || {} }, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			callback('', args.equivalentRowList);
		});
	};

	// ================================================================================
	// ACCESS POINT REGISTRATION

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
