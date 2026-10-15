#!/usr/bin/env node
'use strict';
// @concept: [[SchemaVerifier]]
// @concept: [[SemanticSearch]]
//
// GET /api/dme-semantic-search
//   ?source=<spec code>&path=<element path>&name=<element name>
//   &target=<spec code | '' for every other spec>&q=<free text>&kinds=property,class[,value]&limit=<n>
//
// Ranks elements of a TARGET specification by semantic similarity to ONE
// element of the SOURCE specification, using the embeddings the forge already
// stamped on every node (cosine over 1024-dim vectors). No embedding API is
// called: the anchor is the selected element's own vector, so the ranking is
// "what in spec X means what this element means". `q` is a lexical narrowing
// filter on name / description / path applied before ranking, so a user can
// type "grade" and still get the semantically closest "grade" elements first.
//
// This is what lets a user hand-pick a mapping where the graph has no implied
// one yet. It is read-only and, like dme-spec-elements, public.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();
const makeRefId = require('../../lib/make-ref-id');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	// ================================================================================
	// INITIALIZATION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(moduleName);

	const { expressApp, accessTokenHeaderTools, accessPointsDotD, routingPrefix } =
		passThroughParameters;

	// The anchor is resolved by exact path first (unique within a standard), then
	// by name. HubReference nodes are never anchors or candidates: a mapping is
	// between two standards' elements, and the hub is the forge's business.
	//
	// The candidate scan is a brute-force cosine over the target standard's
	// embedded nodes. SIF, the largest, is ~17k nodes — well within a request.
	const SEARCH_QUERY = `
		MATCH (src:ForgedNode {_source: $source})
		WHERE NOT src:HubReference
		  AND src.embedding IS NOT NULL
		  AND (($path <> '' AND src.path = $path) OR ($path = '' AND src.name = $name))
		WITH src ORDER BY CASE WHEN src.path = $path THEN 0 ELSE 1 END LIMIT 1
		MATCH (n:ForgedNode)
		WHERE NOT n:HubReference
		  AND n.embedding IS NOT NULL
		  AND n._source <> $source
		  AND ($target = '' OR n._source = $target)
		  AND n.role IN $roles
		  AND ($q = ''
		       OR toLower(coalesce(n.name, '')) CONTAINS $q
		       OR toLower(coalesce(n.description, '')) CONTAINS $q
		       OR toLower(coalesce(n.path, '')) CONTAINS $q)
		WITH src, n, vector.similarity.cosine(src.embedding, n.embedding) AS score
		ORDER BY score DESC
		LIMIT $limit
		RETURN labels(n) AS labels,
		       n.name AS name,
		       n._source AS source,
		       coalesce(n.path, '') AS path,
		       coalesce(n.description, n.definition, '') AS description,
		       coalesce(n.cedsId, n.stableId, n.persistentId, '') AS sourceId,
		       CASE n.role WHEN 'DmeClass' THEN 'class' WHEN 'DmeOptionValue' THEN 'value' ELSE 'property' END AS kind,
		       score,
		       src.name AS anchorName,
		       coalesce(src.path, '') AS anchorPath
	`;

	const KIND_TO_ROLE = { property: 'DmeProperty', class: 'DmeClass', value: 'DmeOptionValue' };

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (permissionValidator) => (xReq, xRes, next) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) =>
			args.permissionValidator(xReq.appValueGetter('authclaims'), forwardArgs({ next, args })),
		);

		taskList.push((args, next) => {
			const { accessPointsDotD } = args;

			const xQuery = xReq.qtGetSurePath('query', {});
			const source = String(xQuery.source || '').slice(0, 60).trim();
			const path = String(xQuery.path || '').slice(0, 400).trim();
			const name = String(xQuery.name || '').slice(0, 200).trim();
			const target = String(xQuery.target || '').slice(0, 60).trim();
			const q = String(xQuery.q || '').slice(0, 100).trim().toLowerCase();
			const requested = parseInt(xQuery.limit, 10);
			const limit = Math.min(60, Math.max(1, Number.isFinite(requested) ? requested : 25));
			const kinds = String(xQuery.kinds || 'property,class')
				.split(',')
				.map((k) => k.trim())
				.filter((k) => KIND_TO_ROLE[k]);
			const roles = (kinds.length ? kinds : ['property', 'class']).map((k) => KIND_TO_ROLE[k]);

			if (!source || (!path && !name)) {
				next('source and path (or name) are required', args);
				return;
			}

			const queryData = {
				action: 'query',
				query: SEARCH_QUERY,
				params: { source, path, name, target, q, roles, limit },
			};

			accessPointsDotD['dme-cypher-query'](queryData, (err, result) => {
				if (err) {
					next(err, args);
					return;
				}
				next('', { ...args, result });
			});
		});

		const initialData = { accessPointsDotD, permissionValidator };

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				const errorId = makeRefId(12);
				xLog.error(`${moduleName} GET error (${errorId}): ${err}`);
				xRes.status(401).send(`${err.toString()} (${errorId})`);
				return;
			}
			const { result } = args;
			xRes.send(Array.isArray(result) ? result : [result]);
		});
	};

	// ================================================================================
	// ENDPOINT REGISTRATION

	const addEndpoint = ({
		name,
		method,
		routePath,
		serviceFunction,
		expressApp,
		endpointsDotD,
		permissionValidator,
	}) => {
		expressApp[method](routePath, serviceFunction(permissionValidator));
		endpointsDotD.logList.push(name);
	};

	const thisEndpointName = moduleName;
	const routePath = `${routingPrefix}${thisEndpointName}`;

	const permissionValidator = accessTokenHeaderTools.getValidator(['public']);

	addEndpoint({
		name: `${routePath} [GET]`,
		method: 'get',
		routePath,
		serviceFunction,
		expressApp,
		endpointsDotD,
		permissionValidator,
	});

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
