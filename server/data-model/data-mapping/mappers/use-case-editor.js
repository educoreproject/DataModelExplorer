#!/usr/bin/env node
'use strict';
// @concept: [[UseCaseEditor]]
// @concept: [[MapperPattern]]
// @concept: [[Neo4jAbstraction]]

// Mapper for the Use Case Editor. Cypher-based, not SQL — so the public surface
// differs from the SQLite mappers:
//   getCypher(queryName, params)  — returns { query, params } for neo4jDb.runQuery
//   splitProperties(nodeObj)      — partitions a raw node's props into declared / extra / system
//   mapUseCaseRoot, mapUseCaseStep, mapUseCaseActor, mapDataReference,
//   mapExternalReference, mapUseCaseCategory — forward graph→wire transforms
//   deriveLogicalId(label, node, ctx) — compute the stable logical id used in the UI
//
// Identity convention (derived on read; graph does NOT store an `id` property):
//   UseCase             usecase-<issueNumber>
//   UseCaseStep         usecase-<parentIssueNumber>-step-<stepNumber>
//   UseCaseActor        usecase-actor-<slug>
//   DataReference       dataref-<slug>
//   ExternalReference   externref-<slug>
//   UseCaseCategory     usecase-category-<slugify(name)>
//
// All Cypher uses driver parameters ($name). The neo4j driver escapes at the bolt
// layer, so no safeSql equivalent is needed.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const schemas = require('../../schemas/useCase');

// Mirrors graphForge/cli/lib.d/forge-usecases/lib/nodeBuilder.js slugify().
// Kept in sync by convention; if the forge rule changes, update here too.
const slugify = (raw) => {
	if (!raw) { return ''; }
	return String(raw)
		.toLowerCase()
		.replace(/['\u2018\u2019]/g, '')
		.replace(/[\/,()]/g, ' ')
		.replace(/[^a-z0-9\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-');
};

const parseIssueNumberFromId = (id) => {
	if (!id || typeof id !== 'string') { return null; }
	const m = id.match(/^usecase-(\d+)$/);
	if (!m) { return null; }
	const n = parseInt(m[1], 10);
	return Number.isFinite(n) ? n : null;
};

//START OF moduleFunction() ============================================================

const moduleFunction = ({ moduleName }) => (deps) => {
	const xLog = process.global && process.global.xLog;

	// ================================================================================
	// NAMED CYPHER QUERIES
	// Each returns { query, params }. Params are passed straight to neo4jDb.runQuery.

	const queries = {
		listUseCases: () => ({
			query: `
				MATCH (u:UseCase)
				RETURN u.issueNumber AS issueNumber,
				       u.name AS name,
				       u.primaryCategory AS primaryCategory
				ORDER BY coalesce(u.name, toString(u.issueNumber))
			`,
			params: {}
		}),

		getUseCaseRoot: ({ issueNumber }) => ({
			query: `
				MATCH (u:UseCase { issueNumber: $issueNumber })
				RETURN u AS node
			`,
			params: { issueNumber }
		}),

		getUseCaseSteps: ({ issueNumber }) => ({
			query: `
				MATCH (u:UseCase { issueNumber: $issueNumber })-[:HAS_STEP]->(s:UseCaseStep)
				RETURN s AS node
				ORDER BY coalesce(s.stepNumber, 0)
			`,
			params: { issueNumber }
		}),

		getUseCaseActors: ({ issueNumber }) => ({
			query: `
				MATCH (u:UseCase { issueNumber: $issueNumber })-[r:INVOLVES_ACTOR]->(a:UseCaseActor)
				OPTIONAL MATCH (a)<-[:INVOLVES_ACTOR]-(other:UseCase)
				WITH a, r, count(DISTINCT other) AS shareCount
				RETURN a AS node, r AS edge, shareCount
				ORDER BY coalesce(a.name, '')
			`,
			params: { issueNumber }
		}),

		getUseCaseDataRefs: ({ issueNumber }) => ({
			query: `
				MATCH (u:UseCase { issueNumber: $issueNumber })-[:HAS_DATA_REFERENCE]->(d:DataReference)
				OPTIONAL MATCH (d)<-[:HAS_DATA_REFERENCE]-(other:UseCase)
				WITH d, count(DISTINCT other) AS shareCount
				RETURN d AS node, shareCount
				ORDER BY coalesce(d.name, '')
			`,
			params: { issueNumber }
		}),

		getUseCaseExternalRefs: ({ issueNumber }) => ({
			query: `
				MATCH (u:UseCase { issueNumber: $issueNumber })-[:HAS_REFERENCE]->(e:ExternalReference)
				OPTIONAL MATCH (e)<-[:HAS_REFERENCE]-(other:UseCase)
				WITH e, count(DISTINCT other) AS shareCount
				RETURN e AS node, shareCount
				ORDER BY coalesce(e.name, '')
			`,
			params: { issueNumber }
		}),

		getUseCaseCategories: ({ issueNumber }) => ({
			query: `
				MATCH (u:UseCase { issueNumber: $issueNumber })-[r:CATEGORIZED_AS]->(c:UseCaseCategory)
				RETURN c AS node, r AS edge
				ORDER BY coalesce(c.name, '')
			`,
			params: { issueNumber }
		}),

		getAllCategories: () => ({
			query: `
				MATCH (c:UseCaseCategory)
				RETURN c AS node
				ORDER BY coalesce(c.name, '')
			`,
			params: {}
		}),

		// Phase 3: single-statement root-scalar save. Props are merged with += so
		// any absent properties are preserved. searchText and updatedAt are
		// recomputed in the same statement for atomicity.
		saveUseCaseRoot: ({ issueNumber, props }) => ({
			query: `
				MATCH (u:UseCase { issueNumber: $issueNumber })
				SET u += $props
				SET u.searchText =
					coalesce(u.name,'') + ': ' +
					coalesce(u.introduction,'') + ' ' +
					coalesce(u.objectives,'')
				SET u.updatedAt = toString(datetime())
				RETURN u.issueNumber AS issueNumber, u.updatedAt AS updatedAt
			`,
			params: { issueNumber, props }
		})
	};

	// ================================================================================
	// VALIDATION — strict allow-list driven by the manifest. Returns null on pass,
	// otherwise { code, message } describing the first violation. The access point
	// maps the code to the appropriate HTTP status.

	const validateRootSavePayload = (props) => {
		if (!props || typeof props !== 'object' || Array.isArray(props)) {
			return { code: 'invalid', message: 'properties must be a plain object' };
		}

		const declared = new Map();
		for (const p of schemas.useCase.properties) {
			declared.set(p.name, p);
		}

		for (const key of Object.keys(props)) {
			const spec = declared.get(key);
			if (!spec) {
				return { code: 'undeclared', message: `Undeclared property "${key}" cannot be saved` };
			}
			if (spec.readOnly) {
				return { code: 'readOnly', message: `Property "${key}" is read-only` };
			}
			if (spec.system) {
				return { code: 'system', message: `Property "${key}" is system-managed and cannot be set via the editor` };
			}
		}

		for (const p of schemas.useCase.properties) {
			if (!p.required) { continue; }
			if (!(p.name in props)) { continue; }
			const v = props[p.name];
			if (v == null || (typeof v === 'string' && v.trim().length === 0)) {
				return { code: 'required', message: `Property "${p.name}" is required and cannot be empty` };
			}
		}

		return null;
	};

	const getCypher = (queryName, params = {}) => {
		const builder = queries[queryName];
		if (!builder) {
			if (xLog) { xLog.error(`Unknown query name "${queryName}" in ${moduleName}`); }
			return undefined;
		}
		return builder(params);
	};

	// ================================================================================
	// DERIVE LOGICAL ID — the graph does not store an `id` property on any of the
	// Use Case family labels; ids are computed from stable unique properties.

	const deriveLogicalId = (label, nodeObj, ctx = {}) => {
		if (!nodeObj || typeof nodeObj !== 'object') { return null; }
		switch (label) {
			case 'UseCase':
				return nodeObj.issueNumber != null ? `usecase-${nodeObj.issueNumber}` : null;
			case 'UseCaseStep': {
				const parent = ctx.parentIssueNumber;
				if (parent == null || nodeObj.stepNumber == null) { return null; }
				return `usecase-${parent}-step-${nodeObj.stepNumber}`;
			}
			case 'UseCaseActor':
				return nodeObj.slug ? `usecase-actor-${nodeObj.slug}` : (nodeObj.name ? `usecase-actor-${slugify(nodeObj.name)}` : null);
			case 'DataReference':
				return nodeObj.slug ? `dataref-${nodeObj.slug}` : null;
			case 'ExternalReference':
				return nodeObj.slug ? `externref-${nodeObj.slug}` : null;
			case 'UseCaseCategory':
				return nodeObj.name ? `usecase-category-${slugify(nodeObj.name)}` : null;
			default:
				return null;
		}
	};

	// ================================================================================
	// PROPERTY PARTITIONING
	// Split a raw graph node (post-neo4jValueToJs) into declared / system / extra.

	const BOOKKEEPING_KEYS = new Set(['_id', '_labels', '_source', 'embedding']);

	const splitProperties = (nodeObj, schemaManifest) => {
		const out = { properties: {}, systemProperties: {}, extraProperties: {} };
		if (!nodeObj || typeof nodeObj !== 'object') { return out; }

		const declared = new Map();
		for (const p of schemaManifest.properties) {
			declared.set(p.name, p);
		}

		for (const key of Object.keys(nodeObj)) {
			if (BOOKKEEPING_KEYS.has(key)) { continue; }
			const spec = declared.get(key);
			if (!spec) {
				out.extraProperties[key] = nodeObj[key];
				continue;
			}
			if (spec.system) {
				out.systemProperties[key] = nodeObj[key];
				continue;
			}
			out.properties[key] = nodeObj[key];
		}

		// Ensure every declared non-system property is represented so the form can
		// render either way (null vs absent gets confusing on the client).
		for (const p of schemaManifest.properties) {
			if (p.system) { continue; }
			if (!(p.name in out.properties)) {
				out.properties[p.name] = null;
			}
		}

		return out;
	};

	// ================================================================================
	// FORWARD MAP — convert a graph node into the wire shape expected by the editor.

	const mapUseCaseRoot = (nodeObj) => {
		const split = splitProperties(nodeObj, schemas.useCase);
		return {
			id: deriveLogicalId('UseCase', nodeObj),
			issueNumber: nodeObj.issueNumber,
			properties: split.properties,
			systemProperties: split.systemProperties,
			extraProperties: split.extraProperties
		};
	};

	const mapUseCaseStep = (nodeObj, ctx = {}) => {
		const split = splitProperties(nodeObj, schemas.useCaseStep);
		return {
			id: deriveLogicalId('UseCaseStep', nodeObj, ctx),
			properties: split.properties,
			systemProperties: split.systemProperties,
			extraProperties: split.extraProperties
		};
	};

	const mapUseCaseActor = (nodeObj, extras = {}) => {
		const split = splitProperties(nodeObj, schemas.useCaseActor);
		return {
			id: deriveLogicalId('UseCaseActor', nodeObj),
			properties: split.properties,
			systemProperties: split.systemProperties,
			extraProperties: split.extraProperties,
			...extras
		};
	};

	const mapDataReference = (nodeObj, extras = {}) => {
		const split = splitProperties(nodeObj, schemas.dataReference);
		return {
			id: deriveLogicalId('DataReference', nodeObj),
			properties: split.properties,
			systemProperties: split.systemProperties,
			extraProperties: split.extraProperties,
			...extras
		};
	};

	const mapExternalReference = (nodeObj, extras = {}) => {
		const split = splitProperties(nodeObj, schemas.externalReference);
		return {
			id: deriveLogicalId('ExternalReference', nodeObj),
			properties: split.properties,
			systemProperties: split.systemProperties,
			extraProperties: split.extraProperties,
			...extras
		};
	};

	const mapUseCaseCategory = (nodeObj, edgeObj = {}) => ({
		id: deriveLogicalId('UseCaseCategory', nodeObj),
		name: nodeObj.name || '',
		isPrimary: edgeObj && edgeObj.isPrimary === true
	});

	return {
		getCypher,
		splitProperties,
		deriveLogicalId,
		parseIssueNumberFromId,
		slugify,
		validateRootSavePayload,
		mapUseCaseRoot,
		mapUseCaseStep,
		mapUseCaseActor,
		mapDataReference,
		mapExternalReference,
		mapUseCaseCategory
	};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
