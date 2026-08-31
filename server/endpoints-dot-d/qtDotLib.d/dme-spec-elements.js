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
	// ELEMENT LIST FOR ONE SPECIFICATION
	//
	// Backs the Schema Verifier's left-hand list once a specification has been
	// picked from the inventory (dme-specifications). Node eligibility matches
	// dme-equivalents so an element listed here is one the equivalence lookups can
	// actually resolve.
	//
	// Classes sort ahead of properties — a class is the structural home of the
	// properties beneath it, so leading with them gives the list a readable shape
	// even before the user filters. `search` is an optional case-insensitive
	// substring; the row cap keeps a 10k-element standard like CEDS from being
	// shipped to a browser in one response.

	const ELEMENTS_QUERY = `
		MATCH (n)
		WHERE (n:DmeProperty OR n:DmeClass OR (n:DmeOptionValue AND n._source = 'CTDL'))
		  AND n._source = $source
		  AND ($search = '' OR toLower(coalesce(n.name, '')) CONTAINS $search)
		WITH n, CASE WHEN n:DmeClass THEN 0 ELSE 1 END AS kindOrder
		RETURN labels(n) AS labels,
		       n.name AS name,
		       n._source AS source,
		       coalesce(n.description, n.definition, '') AS description,
		       coalesce(n.cedsId, n.stableId, n.persistentId, '') AS sourceId,
		       CASE WHEN n:DmeClass THEN 'class' ELSE 'property' END AS kind
		ORDER BY kindOrder, toLower(coalesce(n.name, ''))
		LIMIT $limit
	`;

	// ================================================================================
	// SERVICE FUNCTION (GET — ?source=<spec code>&search=<free text>&limit=<n>)

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
			const search = String(xQuery.search || '').slice(0, 100).trim().toLowerCase();
			const requested = parseInt(xQuery.limit, 10);
			const limit = Math.min(
				1000,
				Math.max(1, Number.isFinite(requested) ? requested : 400),
			);

			if (!source) {
				next('source is required', args);
				return;
			}

			const queryData = {
				action: 'query',
				query: ELEMENTS_QUERY,
				params: { source, search, limit },
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
				xLog.error(`dme-spec-elements GET error (${errorId}): ${err}`);
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
