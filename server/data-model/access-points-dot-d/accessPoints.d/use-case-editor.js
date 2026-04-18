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
// Note: `pipeRunner` / `taskListPlus` / `forwardArgs` required by serviceFunction below
// (defined via the qtools-asynchronous-pipe-plus import at module top).

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

	// Phase 5: full transactional save — root scalars, steps, actors, dataRefs,
	// externalRefs, categories, and derived counts, all in one Neo4j transaction.
	// Payload shape: { id, properties, steps?, actors?, dataRefs?, externalRefs?, categories? }
	//
	// If a collection key is omitted from the payload, it is left untouched. If a
	// collection is present (even if empty), it is treated as the authoritative new
	// set and missing rows are removed (edges for shared children; full DETACH
	// DELETE for UseCase-owned steps).
	const doSave = (xQuery, callback) => {
		const id = xQuery.id;
		const issueNumber = uceMapper.parseIssueNumberFromId(id);
		if (issueNumber == null) {
			callback('save requires a valid UseCase id like "usecase-<issueNumber>"', []);
			return;
		}

		const violation = uceMapper.validateSaveAggregate(xQuery);
		if (violation) {
			callback(`validation: ${violation.message}`, []);
			return;
		}

		// Project incoming collections onto what Cypher needs. Undefined === no change.
		const incomingSteps = Array.isArray(xQuery.steps) ? xQuery.steps.map((row) => {
			const filtered = uceMapper.filterWritableProps(row.properties || {}, schemas.useCaseStep);
			return {
				stepNumber: filtered.stepNumber,
				props: filtered
			};
		}) : null;

		const incomingActors = Array.isArray(xQuery.actors) ? xQuery.actors.map((row) => ({
			slug: uceMapper.deriveActorSlug(row),
			props: uceMapper.filterWritableProps(row.properties || {}, schemas.useCaseActor)
		})).filter((r) => r.slug && r.slug.length > 0) : null;

		const incomingDataRefs = Array.isArray(xQuery.dataRefs) ? xQuery.dataRefs.map((row) => ({
			slug: uceMapper.deriveRefSlug(row, 'data'),
			props: uceMapper.filterWritableProps(row.properties || {}, schemas.dataReference)
		})).filter((r) => r.slug && r.slug.length > 0) : null;

		const incomingExternalRefs = Array.isArray(xQuery.externalRefs) ? xQuery.externalRefs.map((row) => ({
			slug: uceMapper.deriveRefSlug(row, 'external'),
			props: uceMapper.filterWritableProps(row.properties || {}, schemas.externalReference)
		})).filter((r) => r.slug && r.slug.length > 0) : null;

		const incomingCategories = Array.isArray(xQuery.categories) ? xQuery.categories.map((row) => ({
			name: String(row.name || '').trim(),
			isPrimary: row.isPrimary === true
		})).filter((r) => r.name.length > 0) : null;

		const rootProps = uceMapper.filterWritableProps(xQuery.properties || {}, schemas.useCase);

		neo4jDb.runTransaction((tx, done) => {
			const saveTasks = new taskListPlus();

			// --- Stage 1: ensure the UseCase exists.
			saveTasks.push((args, next) => {
				tx.run(
					`MATCH (u:UseCase { issueNumber: $issueNumber }) RETURN u.issueNumber AS n`,
					{ issueNumber },
					(err, recs) => {
						if (err) { next(err, args); return; }
						if (recs.length === 0) { next(`No UseCase with issueNumber ${issueNumber}`, args); return; }
						next('', args);
					},
				);
			});

			// --- Stage 2: root props + searchText + updatedAt (single statement).
			saveTasks.push((args, next) => {
				tx.run(
					`MATCH (u:UseCase { issueNumber: $issueNumber })
					 SET u += $props
					 SET u.searchText =
					     coalesce(u.name,'') + ': ' +
					     coalesce(u.introduction,'') + ' ' +
					     coalesce(u.objectives,'')
					 SET u.updatedAt = toString(datetime())
					 RETURN u.updatedAt AS updatedAt`,
					{ issueNumber, props: rootProps },
					(err, recs) => {
						if (err) { next(err, args); return; }
						next('', { ...args, updatedAt: recs[0] && recs[0].updatedAt });
					},
				);
			});

			// --- Stage 3: steps diff (UseCase-owned; DETACH DELETE missing rows).
			if (incomingSteps) {
				// Upsert via stepNumber; SET declared writable props.
				saveTasks.push((args, next) => {
					tx.run(
						`MATCH (u:UseCase { issueNumber: $issueNumber })
						 UNWIND $steps AS s
						 MERGE (u)-[:HAS_STEP]->(node:UseCaseStep { stepNumber: s.stepNumber })
						 SET node += s.props
						 RETURN count(node) AS n`,
						{ issueNumber, steps: incomingSteps },
						(err) => { if (err) { next(err, args); return; } next('', args); },
					);
				});
				// Delete any existing step whose stepNumber is not in the incoming set.
				saveTasks.push((args, next) => {
					const keep = incomingSteps.map((s) => s.stepNumber).filter((n) => n != null);
					tx.run(
						`MATCH (u:UseCase { issueNumber: $issueNumber })-[:HAS_STEP]->(s:UseCaseStep)
						 WHERE NOT s.stepNumber IN $keep
						 DETACH DELETE s
						 RETURN 1 AS ok`,
						{ issueNumber, keep },
						(err) => { if (err) { next(err, args); return; } next('', args); },
					);
				});
			}

			// --- Stage 4: actors. MERGE by slug (graph-wide); property updates
			// are propagated to the shared node. Edges removed for actors not in the payload.
			if (incomingActors) {
				saveTasks.push((args, next) => {
					tx.run(
						`MATCH (u:UseCase { issueNumber: $issueNumber })
						 UNWIND $rows AS row
						 MERGE (a:UseCaseActor { slug: row.slug })
						 ON CREATE SET a._source = 'UseCaseEditor', a.slug = row.slug
						 SET a += row.props
						 SET a.slug = row.slug
						 MERGE (u)-[:INVOLVES_ACTOR]->(a)
						 RETURN count(a) AS n`,
						{ issueNumber, rows: incomingActors },
						(err) => { if (err) { next(err, args); return; } next('', args); },
					);
				});
				saveTasks.push((args, next) => {
					const keep = incomingActors.map((r) => r.slug);
					tx.run(
						`MATCH (u:UseCase { issueNumber: $issueNumber })-[r:INVOLVES_ACTOR]->(a:UseCaseActor)
						 WHERE NOT a.slug IN $keep
						 DELETE r
						 RETURN 1 AS ok`,
						{ issueNumber, keep },
						(err) => { if (err) { next(err, args); return; } next('', args); },
					);
				});
			}

			// --- Stage 5: dataRefs — same pattern.
			if (incomingDataRefs) {
				saveTasks.push((args, next) => {
					tx.run(
						`MATCH (u:UseCase { issueNumber: $issueNumber })
						 UNWIND $rows AS row
						 MERGE (d:DataReference { slug: row.slug })
						 ON CREATE SET d._source = 'UseCaseEditor', d.slug = row.slug
						 SET d += row.props
						 SET d.slug = row.slug
						 MERGE (u)-[:HAS_DATA_REFERENCE]->(d)
						 RETURN count(d) AS n`,
						{ issueNumber, rows: incomingDataRefs },
						(err) => { if (err) { next(err, args); return; } next('', args); },
					);
				});
				saveTasks.push((args, next) => {
					const keep = incomingDataRefs.map((r) => r.slug);
					tx.run(
						`MATCH (u:UseCase { issueNumber: $issueNumber })-[r:HAS_DATA_REFERENCE]->(d:DataReference)
						 WHERE NOT d.slug IN $keep
						 DELETE r
						 RETURN 1 AS ok`,
						{ issueNumber, keep },
						(err) => { if (err) { next(err, args); return; } next('', args); },
					);
				});
			}

			// --- Stage 6: externalRefs — same pattern.
			if (incomingExternalRefs) {
				saveTasks.push((args, next) => {
					tx.run(
						`MATCH (u:UseCase { issueNumber: $issueNumber })
						 UNWIND $rows AS row
						 MERGE (e:ExternalReference { slug: row.slug })
						 ON CREATE SET e._source = 'UseCaseEditor', e.slug = row.slug
						 SET e += row.props
						 SET e.slug = row.slug
						 MERGE (u)-[:HAS_REFERENCE]->(e)
						 RETURN count(e) AS n`,
						{ issueNumber, rows: incomingExternalRefs },
						(err) => { if (err) { next(err, args); return; } next('', args); },
					);
				});
				saveTasks.push((args, next) => {
					const keep = incomingExternalRefs.map((r) => r.slug);
					tx.run(
						`MATCH (u:UseCase { issueNumber: $issueNumber })-[r:HAS_REFERENCE]->(e:ExternalReference)
						 WHERE NOT e.slug IN $keep
						 DELETE r
						 RETURN 1 AS ok`,
						{ issueNumber, keep },
						(err) => { if (err) { next(err, args); return; } next('', args); },
					);
				});
			}

			// --- Stage 7: categories. MERGE by name (categories are stored with name only).
			if (incomingCategories) {
				saveTasks.push((args, next) => {
					tx.run(
						`MATCH (u:UseCase { issueNumber: $issueNumber })
						 UNWIND $rows AS row
						 MERGE (c:UseCaseCategory { name: row.name })
						 MERGE (u)-[e:CATEGORIZED_AS]->(c)
						 SET e.isPrimary = row.isPrimary
						 RETURN count(c) AS n`,
						{ issueNumber, rows: incomingCategories },
						(err) => { if (err) { next(err, args); return; } next('', args); },
					);
				});
				saveTasks.push((args, next) => {
					const keep = incomingCategories.map((r) => r.name);
					tx.run(
						`MATCH (u:UseCase { issueNumber: $issueNumber })-[r:CATEGORIZED_AS]->(c:UseCaseCategory)
						 WHERE NOT c.name IN $keep
						 DELETE r
						 RETURN 1 AS ok`,
						{ issueNumber, keep },
						(err) => { if (err) { next(err, args); return; } next('', args); },
					);
				});
			}

			// --- Stage 8: recompute derived counts on the root (stepCount/actorCount/etc).
			saveTasks.push((args, next) => {
				tx.run(
					`MATCH (u:UseCase { issueNumber: $issueNumber })
					 OPTIONAL MATCH (u)-[:HAS_STEP]->(s:UseCaseStep)
					 WITH u, count(DISTINCT s) AS stepCount
					 OPTIONAL MATCH (u)-[:INVOLVES_ACTOR]->(a:UseCaseActor)
					 WITH u, stepCount, count(DISTINCT a) AS actorCount
					 OPTIONAL MATCH (u)-[:HAS_DATA_REFERENCE]->(d:DataReference)
					 WITH u, stepCount, actorCount, count(DISTINCT d) AS dataReferenceCount
					 OPTIONAL MATCH (u)-[:HAS_REFERENCE]->(e:ExternalReference)
					 WITH u, stepCount, actorCount, dataReferenceCount, count(DISTINCT e) AS referenceCount
					 SET u.stepCount = stepCount,
					     u.actorCount = actorCount,
					     u.dataReferenceCount = dataReferenceCount,
					     u.referenceCount = referenceCount,
					     u.cedsReferenceCount = coalesce(size(u.cedsIds), 0)
					 RETURN stepCount, actorCount, dataReferenceCount, referenceCount, u.cedsReferenceCount AS cedsReferenceCount`,
					{ issueNumber },
					(err, recs) => {
						if (err) { next(err, args); return; }
						next('', { ...args, counts: recs[0] || {} });
					},
				);
			});

			pipeRunner(saveTasks.getList(), {}, (err, args) => {
				if (err) { done(err); return; }
				done('', args);
			});
		}, (err, result) => {
			if (err) { callback(err, []); return; }
			callback('', [{
				id: `usecase-${issueNumber}`,
				savedAt: (result && result.updatedAt) || null,
				counts: (result && result.counts) || {},
				savedCollections: [
					incomingSteps != null ? 'steps' : null,
					incomingActors != null ? 'actors' : null,
					incomingDataRefs != null ? 'dataRefs' : null,
					incomingExternalRefs != null ? 'externalRefs' : null,
					incomingCategories != null ? 'categories' : null
				].filter(Boolean)
			}]);
		});
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
