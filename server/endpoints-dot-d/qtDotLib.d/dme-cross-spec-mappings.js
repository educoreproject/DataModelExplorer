#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[SpecificationViewer]]
// @concept: [[SecurityFirstPattern]]

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const makeRefId = require('../../lib/make-ref-id');
// ⟪ctdlHub P7⟫ a card's own hub names its slot edges
const { cardHubSlotEdgeTypeTextFor } = require('../../../cli/lib.d/data-model-explorer/lib/toolPayloadContract');
const { sourceIdentifierCypherTextFor } = require('../../../cli/lib.d/data-model-explorer/lib/nativeIdentifier');
const { readNativeIdentifierDeclarations } = require('../../lib/native-identifier-declarations');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({
	dotD: endpointsDotD,
	passThroughParameters,
}) {
	// ================================================================================
	// INITIALIZATION AND DEPENDENCY INJECTION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;

	const {
		expressApp,
		accessTokenHeaderTools,
		accessPointsDotD,
		routingPrefix,
	} = passThroughParameters;

	// ================================================================================
	// CROSS-SPECIFICATION MAPPINGS FOR ONE ELEMENT
	//
	// Takes a specific element (spec + exact name) rather than a free-text term,
	// walks its HubReference, and returns the hub's neighbours in EVERY OTHER
	// specification, in BOTH tiers. The caller separates them; this query's job is
	// to report enough for that split to be made honestly.
	//
	// The tier of a neighbour is a property of the PATH, not of one edge. Two hops
	// are involved — the element's own edge to the hub (r1) and the neighbour's
	// (r2) — and a correspondence is authoritative only when both are verified
	// (EXACT_MATCH, or the definitional HAS_<HUB>_* slot edge a hub anchor uses). An
	// element that merely CLOSE_MATCHes its hub gets nothing authoritative out of
	// it, however solid the neighbour's own edge is.
	//
	// This matters most between two standards that are no hub. No standard's
	// documentation crosswalks directly to another's — each maps to a hub — so a
	// SIF ↔ Ed-Fi equivalence is authoritative BY COMPOSITION: two verified legs
	// through one hub card. Reporting `hub` on every row lets the UI say which
	// concept carried the claim rather than implying a direct assertion.
	//
	// The element's own spec is excluded throughout: a mapping to yourself is not
	// a crosswalk.
	//
	// ⟪ctdlHub P7⟫ Every hub of the graph: the definitional edge is the card's OWN hub's slot edge (it was HAS_CEDS_*),
	// and each match names its card's hub (hubName) beside the card (hub). Two legs compose only through ONE card, so
	// never across hubs.
	//
	// Both edges' `confidence` is returned when the forge stamped one (MAPS_TO-era
	// edges carried 1.0; similarity-derived ones carry the vector score). It is
	// null on edges that never got the property, so the caller must treat it as
	// optional and fall back to its own scoring rather than printing a zero.

	// SEMANTIC SCORE
	//
	// Every searchable node carries a voyage-3 embedding (1024-dim, cosine) written
	// by the indexers — the SAME model on both sides of any pair, so the vectors are
	// directly comparable. That makes a real semantic score computable here, on
	// demand, without depending on the forge having stamped a confidence: cosine of
	// the two element embeddings.
	//
	// It is built as an optional term because vector.similarity.cosine() needs a
	// recent Neo4j 5. If the deployed server is older the enriched query is a hard
	// parse error, which would take the whole mappings list down with it — so the
	// caller runs the enriched form first and silently retries the plain one.
	const SEMANTIC_TERM = `
		         semantic: CASE
		           WHEN n.embedding IS NOT NULL AND m.embedding IS NOT NULL
		           THEN vector.similarity.cosine(n.embedding, m.embedding)
		           ELSE null END,`;

	// ⟪lane zbE, E1-1⟫ sourceId by each node's OWN standard's declared identifier (read per request), stableId beside it
	const buildMappingsQuery = (semanticTerm, nativeIdentifierDeclarationList) => `
		MATCH (n)
		WHERE (n:DmeProperty OR n:DmeClass OR (n:DmeOptionValue AND n._source = 'CTDL'))
		  AND n._source = $source
		  AND toLower(coalesce(n.name, '')) = $name
		WITH n LIMIT 5
		OPTIONAL MATCH (n)-[r1]-(hub:HubReference)
		WHERE type(r1) IN ['EXACT_MATCH', 'CLOSE_MATCH', 'BROAD_MATCH', 'NARROW_MATCH',
		                   ${cardHubSlotEdgeTypeTextFor('hub', 'PROPERTY')}, ${cardHubSlotEdgeTypeTextFor('hub', 'DOMAIN')}, ${cardHubSlotEdgeTypeTextFor('hub', 'VALUE')}]
		OPTIONAL MATCH (hub)-[r2]-(m)
		WHERE type(r2) IN ['EXACT_MATCH', 'CLOSE_MATCH', 'BROAD_MATCH', 'NARROW_MATCH',
		                   ${cardHubSlotEdgeTypeTextFor('hub', 'PROPERTY')}, ${cardHubSlotEdgeTypeTextFor('hub', 'DOMAIN')}, ${cardHubSlotEdgeTypeTextFor('hub', 'VALUE')}]
		  AND m <> n
		  AND coalesce(m._source, '') <> $source
		  AND (m:DmeProperty OR m:DmeClass OR (m:DmeOptionValue AND m._source = 'CTDL'))
		RETURN n.name AS name,
		       n._source AS source,
		       labels(n) AS labels,
		       coalesce(n.description, n.definition, '') AS description,
		       ${sourceIdentifierCypherTextFor('n', nativeIdentifierDeclarationList)} AS sourceId,
		       n.stableId AS stableId,
		       [x IN collect(DISTINCT {
		         rel: type(r2),
		         selfRel: type(r1),
		         confidence: r2.confidence,
		         selfConfidence: r1.confidence,${semanticTerm}
		         name: m.name,
		         source: m._source,
		         labels: labels(m),
		         description: coalesce(m.description, m.definition, ''),
		         sourceId: ${sourceIdentifierCypherTextFor('m', nativeIdentifierDeclarationList)},
		         stableId: m.stableId,
		         hub: hub.name,
		         hubName: hub.hubName
		       }) WHERE x.name IS NOT NULL][0..120] AS matches
	`;

	// ================================================================================
	// SERVICE FUNCTION (GET — ?source=<spec code>&name=<element name>)

	const serviceFunction = (permissionValidator) => (xReq, xRes, next) => {
		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// STEP 1: PERMISSION VALIDATION

		taskList.push((args, next) =>
			args.permissionValidator(
				xReq.appValueGetter('authclaims'),
				forwardArgs({ next, args }),
			),
		);

		// --------------------------------------------------------------------------------
		// STEP 2: NATIVE IDENTIFIERS (lane zbE, E1-1), from the graph

		taskList.push((args, next) => readNativeIdentifierDeclarations({ accessPointsDotD: args.accessPointsDotD }, (err, nativeIdentifierDeclarationList) => {
			if (err) {
				next(err, args);
				return;
			}
			next('', { ...args, nativeIdentifierDeclarationList });
		}));

		// --------------------------------------------------------------------------------
		// STEP 3: VALIDATE PARAMETERS AND CALL ACCESS POINT

		taskList.push((args, next) => {
			const { accessPointsDotD, nativeIdentifierDeclarationList } = args;

			const xQuery = xReq.qtGetSurePath('query', {});
			const source = String(xQuery.source || '').slice(0, 60).trim();
			const name = String(xQuery.name || '').slice(0, 200).trim().toLowerCase();

			if (!source || !name) {
				next('source and name are both required', args);
				return;
			}

			const runQuery = (semanticTerm, callback) =>
				accessPointsDotD['dme-cypher-query'](
					{
						action: 'query',
						query: buildMappingsQuery(semanticTerm, nativeIdentifierDeclarationList),
						params: { source, name },
					},
					callback,
				);

			// Enriched first; on ANY failure fall back to the plain query rather
			// than returning nothing. A server too old for vector.similarity
			// should cost the caller its percentages, not its mappings.
			runQuery(SEMANTIC_TERM, (semanticErr, semanticResult) => {
				if (!semanticErr) {
					next('', { ...args, result: semanticResult });
					return;
				}
				xLog.status(
					`dme-cross-spec-mappings: semantic scoring unavailable, retrying without it (${semanticErr})`,
				);
				runQuery('', (err, result) => {
					if (err) {
						next(err, args);
						return;
					}
					next('', { ...args, result });
				});
			});
		});

		// --------------------------------------------------------------------------------
		// EXECUTE PIPELINE AND HANDLE RESPONSE

		const initialData = {
			accessPointsDotD,
			permissionValidator,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				const errorId = makeRefId(12);
				xLog.error(`dme-cross-spec-mappings GET error (${errorId}): ${err}`);
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

	// ================================================================================
	// ENDPOINT CONFIGURATION

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
