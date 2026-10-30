#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[Neo4jAbstraction]]
// @concept: [[AccessPointPattern]]

// forged-use-cases — the graph reads behind the pages that show the FORGED use cases (use-case forge Phase 5, 2026-10-30;
// PLAN-useCaseDme-103026 Phase C). Input { action, ... }; one handler per action, chosen from handlerByActionName:
//   list  {}                → { caseList }: every UcUseCase with its step and citation counts
//   case  { caseStableId }  → { useCase, stepList, citationList, citationStateCountList }: one case, its steps in reading
//                             order (position, then codedNotation), and every data reference it reaches with its state
// Runs on the golden READ-ONLY handle. Refuses by name: an absent or unknown action, an absent caseStableId, a case the
// graph does not hold, and a graph that holds no use cases (a required label is absent).

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();
const { makeRequiredLabelProbe } = require('../../lib/required-label-probe');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { neo4jDb, dataMapping } = passThroughParameters;
	const mapper = dataMapping[moduleName];

	const probeRequiredLabels = makeRequiredLabelProbe({
		neo4jDb,
		ownerName: moduleName,
		requiredLabelList: mapper.requiredLabelList,
		absentReason: 'this graph holds no forged use cases (the EDUcore use-case standard is not in it)',
	});

	// runs one named query; a failure names the query
	const runNamedQuery = (queryName, queryParams, callback) => {
		const queryBundle = mapper.getCypher(queryName, queryParams);
		neo4jDb.runQuery(queryBundle.cypher, queryBundle.params, (queryError, recordList) => {
			if (queryError) {
				callback(`${moduleName}: ${queryName} failed: ${queryError}`);
				return;
			}
			callback('', recordList);
		});
	};

	// ================================================================================
	// ACTIONS

	const readCaseList = (callback) =>
		runNamedQuery('caseList', {}, (queryError, caseRecordList) => callback(queryError, queryError ? undefined : { caseList: caseRecordList }));

	const readCase = ({ caseStableId }, callback) => {
		if (typeof caseStableId !== 'string' || caseStableId.trim() === '') {
			callback(`${moduleName}: case requires caseStableId as a non-empty string (received ${JSON.stringify(caseStableId)})`);
			return;
		}
		const taskList = new taskListPlus();

		taskList.push((args, next) =>
			runNamedQuery('caseByStableId', { caseStableId }, (queryError, caseRecordList) => {
				if (queryError) {
					next(queryError, args);
					return;
				}
				if (!caseRecordList.length) {
					next(`${moduleName}: no use case in this graph has stableId '${caseStableId}'`, args);
					return;
				}
				next('', { ...args, useCase: caseRecordList[0] });
			}),
		);
		taskList.push((args, next) =>
			runNamedQuery('caseStepList', { caseStableId }, (queryError, stepRecordList) => next(queryError, { ...args, stepList: queryError ? [] : mapper.mapStepRecordList(stepRecordList) })),
		);
		taskList.push((args, next) =>
			runNamedQuery('caseCitationList', { caseStableId }, (queryError, citationRecordList) => next(queryError, { ...args, citationList: queryError ? [] : mapper.mapCitationRecordList(citationRecordList) })),
		);

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			callback('', {
				useCase: args.useCase,
				stepList: args.stepList,
				citationList: args.citationList,
				citationStateCountList: mapper.citationStateCountListOf(args.citationList),
			});
		});
	};

	// ================================================================================
	// SERVICE FUNCTION

	const handlerByActionName = {
		list: (xQuery, callback) => readCaseList(callback),
		case: (xQuery, callback) => readCase({ caseStableId: xQuery.caseStableId }, callback),
	};

	const serviceFunction = (xQuery, callback) => {
		const taskList = new taskListPlus();

		// STAGE 1: the action is REQUIRED and must be one this access point answers
		taskList.push((args, next) => {
			const actionHandler = handlerByActionName[args.xQuery.action];
			if (!actionHandler) {
				next(`${moduleName}: action '${args.xQuery.action}' is not one of: ${Object.keys(handlerByActionName).join(', ')}`, args);
				return;
			}
			next('', { ...args, actionHandler });
		});

		// STAGE 2: the graph must hold use cases
		taskList.push((args, next) => probeRequiredLabels((probeError) => next(probeError, args)));

		// STAGE 3: the action
		taskList.push((args, next) => args.actionHandler(args.xQuery, (actionError, actionResult) => next(actionError, { ...args, actionResult })));

		pipeRunner(taskList.getList(), { xQuery: xQuery || {} }, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			callback('', args.actionResult);
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
