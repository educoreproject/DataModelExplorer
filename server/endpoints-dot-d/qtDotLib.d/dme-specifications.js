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
	// SPECIFICATION INVENTORY
	//
	// The Schema Verifier's entry point: which specifications can actually be
	// explored element by element. A spec qualifies when the graph holds golden
	// nodes stamped with its `_source` — the same eligibility rule dme-equivalents
	// uses, so every spec offered here returns something when opened.
	//
	// Publishing organization comes from the EdMatrix side of the graph
	// (EdStandard)-[:PUBLISHED_BY]->(Organization). EdMatrix titles are marketing
	// names ("Ed-Fi Data Standard") while `_source` is a short code ("EdFi"), so
	// the join is done on a normalised form (lowercase, punctuation stripped) and
	// matches loosely — a spec with no EdMatrix twin simply comes back with a null
	// organization for the caller to fill in.

	const SPECIFICATIONS_QUERY = `
		MATCH (n)
		WHERE (n:DmeProperty OR n:DmeClass OR (n:DmeOptionValue AND n._source = 'CTDL'))
		  AND n._source IS NOT NULL AND n._source <> ''
		WITH n._source AS source,
		     count(n) AS elementCount,
		     size([x IN collect(labels(n)) WHERE 'DmeClass' IN x]) AS classCount
		WITH source, elementCount, classCount,
		     toLower(replace(replace(replace(source, '-', ''), ' ', ''), '_', '')) AS sourceKey
		OPTIONAL MATCH (s:EdStandard)-[:PUBLISHED_BY]->(org:Organization)
		WHERE toLower(replace(replace(replace(coalesce(s.name, ''), '-', ''), ' ', ''), '_', ''))
		      STARTS WITH sourceKey
		WITH source, elementCount, classCount,
		     collect(DISTINCT {org: org.name, title: s.name, url: s.url, description: s.description}) AS edMatrix
		RETURN source,
		       elementCount,
		       classCount,
		       elementCount - classCount AS propertyCount,
		       [x IN edMatrix WHERE x.org IS NOT NULL][0].org AS organization,
		       [x IN edMatrix WHERE x.title IS NOT NULL][0].title AS edMatrixTitle,
		       [x IN edMatrix WHERE x.url IS NOT NULL][0].url AS url,
		       [x IN edMatrix WHERE x.description IS NOT NULL][0].description AS description
		ORDER BY source
	`;

	// ================================================================================
	// SERVICE FUNCTION (GET — no parameters)

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
		// STEP 2: CALL ACCESS POINT

		taskList.push((args, next) => {
			const { accessPointsDotD } = args;

			const queryData = {
				action: 'query',
				query: SPECIFICATIONS_QUERY,
				params: {},
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
				xLog.error(`dme-specifications GET error (${errorId}): ${err}`);
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
