#!/usr/bin/env node
'use strict';
// @concept: [[UseCaseEditor]]
// @concept: [[Neo4jAbstraction]]
// @concept: [[AccessPointPattern]]

// Use Case Editor access point.
// Dispatches on xQuery.action:
//   schema  — returns the declarative schema manifest
//   list    — enumerate UseCases
//   get     — retrieve one UseCase aggregate
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
	const { xLog } = process.global;

	const { neo4jDb, dataMapping } = passThroughParameters;
	const uceMapper = dataMapping['use-case-editor'];

	// ================================================================================
	// HELPERS — run a named Cypher query and return its records.
	// Wraps getCypher + runQuery so access-point pipeline stages stay terse.

	const runNamed = (queryName, params, callback) => {
		const bundle = uceMapper.getCypher(queryName, params || {});
		if (!bundle) {
			callback(`Unknown query ${queryName}`, []);
			return;
		}
		neo4jDb.runQuery(bundle.query, bundle.params, callback);
	};

	// ================================================================================
	// ACTION HANDLERS

	const doSchema = (xQuery, callback) => {
		callback('', [schemas.useCase]);
	};

	const doList = (xQuery, callback) => {
		runNamed('listUseCases', {}, (err, records) => {
			if (err) { callback(err, []); return; }
			const list = records
				.filter((r) => r.issueNumber != null)
				.map((r) => ({
					id: `usecase-${r.issueNumber}`,
					name: r.name || `Use Case ${r.issueNumber}`,
					primaryCategory: r.primaryCategory || ''
				}));
			callback('', list);
		});
	};

	const doGet = (xQuery, callback) => {
		const id = xQuery.id;
		const issueNumber = uceMapper.parseIssueNumberFromId(id);
		if (issueNumber == null) {
			callback('get requires a valid UseCase id like "usecase-<issueNumber>"', []);
			return;
		}

		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			runNamed('getUseCaseRoot', { issueNumber }, (err, records) => {
				if (err) { next(err, args); return; }
				if (records.length === 0) {
					next(`No UseCase with issueNumber ${issueNumber}`, args);
					return;
				}
				const root = uceMapper.mapUseCaseRoot(records[0].node);
				next('', { ...args, root });
			});
		});

		taskList.push((args, next) => {
			runNamed('getUseCaseSteps', { issueNumber }, (err, records) => {
				if (err) { next(err, args); return; }
				const steps = records.map((r) =>
					uceMapper.mapUseCaseStep(r.node, { parentIssueNumber: issueNumber }),
				);
				next('', { ...args, steps });
			});
		});

		taskList.push((args, next) => {
			runNamed('getUseCaseActors', { issueNumber }, (err, records) => {
				if (err) { next(err, args); return; }
				const actors = records.map((r) =>
					uceMapper.mapUseCaseActor(r.node, {
						edgeProperties: { role: (r.edge && r.edge.role) || '' },
						shareCount: Math.max(0, (r.shareCount || 0) - 1)
					}),
				);
				next('', { ...args, actors });
			});
		});

		taskList.push((args, next) => {
			runNamed('getUseCaseDataRefs', { issueNumber }, (err, records) => {
				if (err) { next(err, args); return; }
				const dataRefs = records.map((r) =>
					uceMapper.mapDataReference(r.node, {
						shareCount: Math.max(0, (r.shareCount || 0) - 1)
					}),
				);
				next('', { ...args, dataRefs });
			});
		});

		taskList.push((args, next) => {
			runNamed('getUseCaseExternalRefs', { issueNumber }, (err, records) => {
				if (err) { next(err, args); return; }
				const externalRefs = records.map((r) =>
					uceMapper.mapExternalReference(r.node, {
						shareCount: Math.max(0, (r.shareCount || 0) - 1)
					}),
				);
				next('', { ...args, externalRefs });
			});
		});

		taskList.push((args, next) => {
			runNamed('getUseCaseCategories', { issueNumber }, (err, records) => {
				if (err) { next(err, args); return; }
				const categories = records.map((r) =>
					uceMapper.mapUseCaseCategory(r.node, r.edge || {}),
				);
				next('', { ...args, categories });
			});
		});

		pipeRunner(taskList.getList(), {}, (err, args) => {
			if (err) { callback(err, []); return; }
			const { root, steps, actors, dataRefs, externalRefs, categories } = args;
			const aggregate = {
				id: root.id,
				issueNumber: root.issueNumber,
				properties: root.properties,
				systemProperties: root.systemProperties,
				extraProperties: root.extraProperties,
				steps,
				actors,
				dataRefs,
				externalRefs,
				categories
			};
			callback('', [aggregate]);
		});
	};

	const doSave = (xQuery, callback) => {
		callback('save action not yet implemented (Phase 3)', []);
	};

	// ================================================================================
	// SERVICE FUNCTION — thin dispatcher.

	const serviceFunction = (xQuery, callback) => {
		if (!neo4jDb) {
			callback('Use Case Editor requires DME (neo4jDb). Check dataModelExplorerSearch configuration.', []);
			return;
		}

		const action = xQuery && xQuery.action;
		switch (action) {
			case 'schema':   return doSchema(xQuery, callback);
			case 'list':     return doList(xQuery, callback);
			case 'get':      return doGet(xQuery, callback);
			case 'save':     return doSave(xQuery, callback);
			default:
				callback(`Unknown action: ${action}. Known actions: schema, list, get, save.`, []);
		}
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
