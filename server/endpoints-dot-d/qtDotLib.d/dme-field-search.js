#!/usr/bin/env node
'use strict';
// @concept: [[SchemaVerifier]]
// @concept: [[SemanticSearch]]
//
// GET /api/dme-field-search
//   ?q=<free text>&target=<spec code | '' for all>&exclude=<spec code>
//   &kinds=property,class[,value]&limit=<n>
//
// Free-text search for a target field: "grade level", "date of birth". The
// phrase is embedded with the graph's own Voyage model and candidates are
// ranked by cosine similarity to it, so wording need not match. If no Voyage
// key is configured (or the call fails) the endpoint degrades to a lexical
// ranking over name / description / path against the live graph; every row
// carries `basis: 'semantic' | 'lexical'` so the browser can say which it got.
//
// Read-only and public, like dme-spec-elements. Complements dme-semantic-search,
// which anchors on an existing element's vector instead of typed text.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();
const makeRefId = require('../../lib/make-ref-id');
const { resolveVoyageApiKey, embedQueryText } = require('../../data-model/lib/voyage-query-embed');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	// ================================================================================
	// INITIALIZATION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(moduleName) || {};

	const { expressApp, accessTokenHeaderTools, accessPointsDotD, routingPrefix } =
		passThroughParameters;

	const CANDIDATES = `
		MATCH (n:ForgedNode)
		WHERE NOT n:HubReference
		  AND n.embedding IS NOT NULL
		  AND ($target = '' OR n._source = $target)
		  AND ($exclude = '' OR n._source <> $exclude)
		  AND n.role IN $roles
	`;

	const RETURN = `
		RETURN labels(n) AS labels,
		       n.name AS name,
		       n._source AS source,
		       coalesce(n.path, '') AS path,
		       coalesce(n.description, n.definition, '') AS description,
		       coalesce(n.cedsId, n.stableId, n.persistentId, '') AS sourceId,
		       CASE n.role WHEN 'DmeClass' THEN 'class' WHEN 'DmeOptionValue' THEN 'value' ELSE 'property' END AS kind,
		       score,
		       $basis AS basis
	`;

	// Semantic: cosine between the query vector and every candidate.
	const SEMANTIC_QUERY = `
		${CANDIDATES}
		WITH n, vector.similarity.cosine($qvec, n.embedding) AS score
		ORDER BY score DESC
		LIMIT $limit
		${RETURN}
	`;

	// Lexical: name hits outrank description hits; an exact name is best.
	// Scores are squashed into 0..1 so the browser's chip reads the same way.
	const LEXICAL_QUERY = `
		${CANDIDATES}
		  AND (toLower(coalesce(n.name, '')) CONTAINS $q
		       OR toLower(coalesce(n.description, '')) CONTAINS $q
		       OR toLower(coalesce(n.path, '')) CONTAINS $q)
		WITH n,
		     CASE
		       WHEN toLower(n.name) = $q THEN 1.0
		       WHEN toLower(n.name) STARTS WITH $q THEN 0.85
		       WHEN toLower(n.name) CONTAINS $q THEN 0.7
		       WHEN toLower(coalesce(n.path, '')) CONTAINS $q THEN 0.5
		       ELSE 0.35
		     END AS score
		ORDER BY score DESC, size(n.name) ASC
		LIMIT $limit
		${RETURN}
	`;

	const KIND_TO_ROLE = { property: 'DmeProperty', class: 'DmeClass', value: 'DmeOptionValue' };

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (permissionValidator) => (xReq, xRes, next) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) =>
			args.permissionValidator(xReq.appValueGetter('authclaims'), forwardArgs({ next, args })),
		);

		// --------------------------------------------------------------------------------
		// PARAMETERS

		taskList.push((args, next) => {
			const xQuery = xReq.qtGetSurePath('query', {});
			const q = String(xQuery.q || '').slice(0, 200).trim();
			const target = String(xQuery.target || '').slice(0, 60).trim();
			const exclude = String(xQuery.exclude || '').slice(0, 60).trim();
			const requested = parseInt(xQuery.limit, 10);
			const limit = Math.min(60, Math.max(1, Number.isFinite(requested) ? requested : 25));
			const kinds = String(xQuery.kinds || 'property,class')
				.split(',')
				.map((k) => k.trim())
				.filter((k) => KIND_TO_ROLE[k]);
			const roles = (kinds.length ? kinds : ['property', 'class']).map((k) => KIND_TO_ROLE[k]);

			if (q.length < 2) {
				next('q must be at least 2 characters', args);
				return;
			}
			next('', { ...args, q, target, exclude, limit, roles });
		});

		// --------------------------------------------------------------------------------
		// EMBED THE QUERY (best effort — failure means lexical)

		taskList.push((args, next) => {
			const apiKey = resolveVoyageApiKey();
			const model = localConfig.embeddingModel || undefined;
			if (!apiKey) {
				next('', { ...args, qvec: null, embedError: 'no voyageApiKey configured' });
				return;
			}
			embedQueryText(args.q, { apiKey, model }, (err, vec) => {
				if (err) xLog.error(`${moduleName}: embedding failed, falling back to lexical — ${err}`);
				next('', { ...args, qvec: err ? null : vec, embedError: err || '' });
			});
		});

		// --------------------------------------------------------------------------------
		// RANK

		taskList.push((args, next) => {
			const { accessPointsDotD, q, target, exclude, limit, roles, qvec } = args;
			const semantic = Array.isArray(qvec);
			const queryData = {
				action: 'query',
				query: semantic ? SEMANTIC_QUERY : LEXICAL_QUERY,
				params: {
					q: q.toLowerCase(),
					target,
					exclude,
					limit,
					roles,
					qvec: semantic ? qvec : [],
					basis: semantic ? 'semantic' : 'lexical',
				},
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
			const { result, embedError } = args;
			if (embedError) xRes.setHeader('X-Search-Basis', 'lexical');
			else xRes.setHeader('X-Search-Basis', 'semantic');
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
