#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[SchemaVerifier]]
// @concept: [[SecurityFirstPattern]]

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const makeRefId = require('../../lib/make-ref-id');
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
	// (EXACT_MATCH, or the definitional HAS_CEDS_* edge a CEDS anchor uses). An
	// element that merely CLOSE_MATCHes its hub gets nothing authoritative out of
	// it, however solid the neighbour's own edge is.
	//
	// This matters most between two non-CEDS standards. No standard's
	// documentation crosswalks directly to another's — each maps to CEDS — so a
	// SIF ↔ Ed-Fi equivalence is authoritative BY COMPOSITION: two verified legs
	// through one CEDS hub. Reporting `hub` on every row lets the UI say which
	// concept carried the claim rather than implying a direct assertion.
	//
	// The element's own spec is excluded throughout: a mapping to yourself is not
	// a crosswalk.

	const MAPPINGS_QUERY = `
		MATCH (n)
		WHERE (n:DmeProperty OR n:DmeClass OR (n:DmeOptionValue AND n._source = 'CTDL'))
		  AND n._source = $source
		  AND toLower(coalesce(n.name, '')) = $name
		WITH n LIMIT 5
		OPTIONAL MATCH (n)-[r1:EXACT_MATCH|CLOSE_MATCH|NARROW_MATCH|RELATED_MATCH|HAS_CEDS_PROPERTY|HAS_CEDS_DOMAIN|HAS_CEDS_VALUE]-(hub:HubReference)
		OPTIONAL MATCH (hub)-[r2:EXACT_MATCH|CLOSE_MATCH|NARROW_MATCH|RELATED_MATCH|HAS_CEDS_PROPERTY|HAS_CEDS_DOMAIN|HAS_CEDS_VALUE]-(m)
		WHERE m <> n
		  AND coalesce(m._source, '') <> $source
		  AND (m:DmeProperty OR m:DmeClass OR (m:DmeOptionValue AND m._source = 'CTDL'))
		RETURN n.name AS name,
		       n._source AS source,
		       labels(n) AS labels,
		       coalesce(n.description, n.definition, '') AS description,
		       coalesce(n.cedsId, n.stableId, n.persistentId, '') AS sourceId,
		       [x IN collect(DISTINCT {
		         rel: type(r2),
		         selfRel: type(r1),
		         name: m.name,
		         source: m._source,
		         labels: labels(m),
		         description: coalesce(m.description, m.definition, ''),
		         sourceId: coalesce(m.cedsId, m.stableId, m.persistentId, ''),
		         hub: hub.name
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
		// STEP 2: VALIDATE PARAMETERS AND CALL ACCESS POINT

		taskList.push((args, next) => {
			const { accessPointsDotD } = args;

			const xQuery = xReq.qtGetSurePath('query', {});
			const source = String(xQuery.source || '').slice(0, 60).trim();
			const name = String(xQuery.name || '').slice(0, 200).trim().toLowerCase();

			if (!source || !name) {
				next('source and name are both required', args);
				return;
			}

			const queryData = {
				action: 'query',
				query: MAPPINGS_QUERY,
				params: { source, name },
			};

			const localCallback = (err, result) => {
				if (err) {
					next(err, args);
					return;
				}
				next('', { ...args, result });
			};

			accessPointsDotD['dme-cypher-query'](queryData, localCallback);
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
