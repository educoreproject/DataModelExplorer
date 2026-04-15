#!/usr/bin/env node
'use strict';
// @concept: [[UseCaseEditor]]
// @concept: [[Neo4jAbstraction]]
// @concept: [[AccessPointPattern]]

// Use Case Editor access point.
// Dispatches on xQuery.action:
//   schema  — returns the declarative schema manifest
//   list    — [Phase 2] enumerate UseCases
//   get     — [Phase 2] retrieve one UseCase aggregate
//   save    — [Phase 3+] persist edits
//
// Neo4j access is the already-wired `neo4jDb` handle (pointing at DME via
// dataModelExplorerSearch config). No separate `dmeGraph` handle is created;
// see DEVLOG-useCaseEditor.md Phase 0 for rationale.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const schemas = require('../../schemas/useCase');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig } = process.global;

	const { neo4jDb, dataMapping } = passThroughParameters;

	const serviceFunction = (xQuery, callback) => {
		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 1: VALIDATE NEO4J AVAILABILITY

		taskList.push((args, next) => {
			if (!neo4jDb) {
				next('Use Case Editor requires DME (neo4jDb). Check dataModelExplorerSearch configuration.', args);
				return;
			}
			next('', args);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: DISPATCH ON ACTION

		taskList.push((args, next) => {
			const { xQuery } = args;
			const action = xQuery.action;

			if (action === 'schema') {
				next('skipRestOfPipe', { ...args, result: [schemas.useCase] });
				return;
			}

			if (action === 'list' || action === 'get' || action === 'save') {
				// Phase 2+: not yet implemented.
				next(`Action "${action}" is not yet implemented.`, args);
				return;
			}

			next(`Unknown action: ${action}. Known actions: schema, list, get, save.`, args);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE EXECUTION

		const initialData = { xQuery };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err && err !== 'skipRestOfPipe') {
				callback(err, []);
				return;
			}
			callback('', args.result || []);
		});
	};

	// ================================================================================
	// REGISTRATION

	const addEndpoint = ({ name, serviceFunction, dotD }) => {
		dotD.logList.push(name);
		dotD.library.add(name, serviceFunction);
	};

	const name = moduleName;
	addEndpoint({ name, serviceFunction, dotD });

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
