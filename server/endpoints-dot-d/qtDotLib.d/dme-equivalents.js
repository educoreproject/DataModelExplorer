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
	// TERM TOKENIZATION
	//
	// Mirrors the Schema Verifier client (html/stores/schemaVerifierStore.js) so a
	// term produces the same significant tokens whichever side computes them.

	const STOP_WORDS = new Set([
		'the', 'a', 'an', 'of', 'to', 'for', 'and', 'or', 'id', 'ids', 'code',
		'value', 'type', 'name', 'number', 'info', 'information', 'data', 'element',
	]);

	const tokenize = (raw) =>
		String(raw || '')
			.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
			.split(/[^a-zA-Z0-9]+/)
			.map((w) => w.toLowerCase().trim())
			.filter(Boolean);

	const significantTokens = (raw) => {
		const all = tokenize(raw);
		const sig = all.filter((w) => !STOP_WORDS.has(w) && w.length > 1);
		return sig.length ? sig : all;
	};

	// Ranking tokens keep the discriminating words the broad list drops
	// ("name", "code", "date", ...). Eligibility still runs on significant
	// tokens — "name" alone matches half the graph — but among eligible
	// candidates these words separate "Last or Surname" (2 hits for
	// "last name"; sur-NAME) from "Last Instruction Date" (1 hit).
	const MATCH_STOP = new Set(['the', 'a', 'an', 'of', 'to', 'for', 'and', 'or']);
	const matchTokens = (raw) =>
		tokenize(raw).filter((w) => !MATCH_STOP.has(w) && w.length > 1);

	// ================================================================================
	// EQUIVALENTS QUERY
	//
	// The Schema Verifier's one fixed lookup: rank golden standard nodes by how many
	// significant tokens of the term appear in their name, then walk each match's
	// HubReference to collect its cross-standard equivalents (EXACT_MATCH is the
	// hub-verified equivalence; CLOSE/NARROW/RELATED_MATCH are weaker suggestions).
	//
	// CTDL models many field-level concepts as concept-scheme values (CtdlConcept,
	// labeled DmeOptionValue) rather than properties — nearly half its hub
	// connections. Those are included; other standards' option values (e.g. Ed-Fi
	// descriptor values) are enum entries, the wrong granularity for field
	// matching, and stay excluded.
	//
	// This endpoint exists because /api/dme-cypher-query is internal-only (SEC-2):
	// browsers may not send arbitrary Cypher. A fixed, parameterised, read-only
	// query over public reference data carries none of that risk, so this route is
	// public like the reference-library pages that use it.

	const EQUIVALENTS_QUERY = `
		WITH $words AS words, $allWords AS allWords, $minHits AS minHits
		MATCH (n)
		WHERE (n:DmeProperty OR n:DmeClass OR (n:DmeOptionValue AND n._source = 'CTDL'))
		  AND size(words) > 0
		  AND size([w IN words WHERE toLower(coalesce(n.name,'')) CONTAINS w]) >= minHits
		WITH n,
		     size([w IN allWords WHERE toLower(coalesce(n.name,'')) CONTAINS w]) AS hits,
		     size(split(trim(toLower(coalesce(n.name,''))), ' ')) AS candWords
		WITH n, hits, (CASE WHEN candWords > hits THEN candWords ELSE hits END) AS denom
		WITH n, hits, toInteger(round(10.0 * hits / denom)) AS prec
		WITH n, hits,
		     (hits * 100 + prec
		      + CASE WHEN n:DmeProperty THEN 1 ELSE 0 END
		      + CASE WHEN n._source = 'CEDS' THEN 2 ELSE 0 END) AS score
		ORDER BY score DESC LIMIT 20
		OPTIONAL MATCH (n)-[:EXACT_MATCH|CLOSE_MATCH|NARROW_MATCH|RELATED_MATCH|HAS_CEDS_PROPERTY|HAS_CEDS_DOMAIN|HAS_CEDS_VALUE]-(hub:HubReference)
		OPTIONAL MATCH (hub)-[r2:EXACT_MATCH|CLOSE_MATCH|NARROW_MATCH|RELATED_MATCH|HAS_CEDS_PROPERTY]-(m)
		WHERE m <> n AND (m:DmeProperty OR m:DmeClass OR (m:DmeOptionValue AND m._source = 'CTDL'))
		RETURN labels(n) AS labels,
		       n.name AS name,
		       n._source AS source,
		       coalesce(n.description, n.definition, '') AS description,
		       coalesce(n.cedsId, n.stableId, n.persistentId, '') AS sourceId,
		       score,
		       [x IN collect(DISTINCT {
		         rel: type(r2),
		         name: m.name,
		         source: m._source,
		         labels: labels(m)
		       }) WHERE x.name IS NOT NULL][0..10] AS related
		ORDER BY score DESC
	`;

	// ================================================================================
	// SERVICE FUNCTION (GET — ?term=<free text>)

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
		// STEP 2: TOKENIZE TERM AND CALL ACCESS POINT

		taskList.push((args, next) => {
			const { accessPointsDotD } = args;

			const xQuery = xReq.qtGetSurePath('query', {});
			const term = String(xQuery.term || '').slice(0, 200);
			const words = significantTokens(term).slice(0, 12);
			const allWords = matchTokens(term).slice(0, 12);

			if (!words.length) {
				next('term is required', args);
				return;
			}

			const minHits = Math.max(1, Math.ceil(words.length / 2));

			const queryData = {
				action: 'query',
				query: EQUIVALENTS_QUERY,
				params: { words, allWords: allWords.length ? allWords : words, minHits },
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
				xLog.error(`dme-equivalents GET error (${errorId}): ${err}`);
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
