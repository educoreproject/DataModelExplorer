// @concept: [[SchemaVerifier]]
// @concept: [[PiniaStorePattern]]
//
// SCHEMA VERIFIER STORE
//
// Powers the Reference Library "Schema Verifier" tool. Two complementary data
// sources are joined here:
//
//   1. HR Open equivalence — the bundled JEDx ↔ HR Open crosswalk
//      (data/hr-open-crosswalk.ts). HR Open is NOT in the EDUcore graph, so this
//      file is the authoritative source for HR Open property paths.
//
//   2. CEDS (and every other standard) equivalence — looked up LIVE from the
//      EDUcore knowledge graph via POST /api/dmeCypherQuery (the same engine the
//      EDUcore MCP server exposes as cypherQuery).
//
// The tool can either browse the crosswalk directly (a better-than-spreadsheet
// view) or load an arbitrary OpenAPI document, break it into its component
// schemas, and resolve each property against both sources.

import axios from 'axios';
import { parse as parseYaml } from 'yaml';
import { useLoginStore } from '@/stores/loginStore';
import { hrOpenCrosswalk, hrOpenCrosswalkMeta } from '@/data/hr-open-crosswalk';

// -------------------------------------------------------------------------
// Text helpers — normalise property names so camelCase / snake_case /
// "Title Case" all compare on the same footing.

const STOP_WORDS = new Set([
	'the', 'a', 'an', 'of', 'to', 'for', 'and', 'or', 'id', 'ids', 'code',
	'value', 'type', 'name', 'number', 'info', 'information', 'data', 'element',
]);

function tokenize(raw) {
	if (!raw) return [];
	return String(raw)
		// split camelCase / PascalCase
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		// split on non-alphanumerics
		.split(/[^a-zA-Z0-9]+/)
		.map((w) => w.toLowerCase().trim())
		.filter(Boolean);
}

// Significant tokens: drop pure stop words, but never return empty if the only
// tokens are stop words (fall back to the raw token list).
function significantTokens(raw) {
	const all = tokenize(raw);
	const sig = all.filter((w) => !STOP_WORDS.has(w) && w.length > 1);
	return sig.length ? sig : all;
}

// Lighter stop-word set for crosswalk *element* matching. In this dictionary
// words like "name", "code", "type", "number", "id" are discriminating (every
// element is a name/code/id of something), so the broad STOP_WORDS list above —
// tuned for the graph lookup — collapses queries too aggressively. e.g.
// "Legal Name" → ["legal"], which then scores 100% against any element merely
// containing "legal" (such as the Worker-Comp "Group Legal Insurance Premiums
// Paid"). Keeping "name" gives ["legal","name"], cleanly separating the real
// "Legal Name" (2/2) from that false positive (1/2).
const MATCH_STOP = new Set(['the', 'a', 'an', 'of', 'to', 'for', 'and', 'or']);
function matchTokens(raw) {
	return tokenize(raw).filter((w) => !MATCH_STOP.has(w) && w.length > 1);
}

// Score a candidate string against a set of query tokens (0..1).
function matchScore(queryTokens, candidate) {
	if (!queryTokens.length) return 0;
	const cand = new Set(tokenize(candidate));
	let hits = 0;
	for (const w of queryTokens) if (cand.has(w)) hits++;
	return hits / queryTokens.length;
}

// -------------------------------------------------------------------------
// Build a flat, searchable index of every crosswalk element once.

const crosswalkIndex = hrOpenCrosswalk.flatMap((section) =>
	section.elements.map((el) => ({
		...el,
		sectionId: section.id,
		sectionLabel: section.label,
		group: section.group,
		nameTokens: tokenize(el.name),
		propTokens: tokenize(el.hrOpenProperty),
	})),
);

// -------------------------------------------------------------------------
// OpenAPI parsing

function resolveRefName(ref) {
	if (!ref || typeof ref !== 'string') return null;
	return ref.split('/').pop();
}

// Turn one schema object into a flat list of property rows.
function extractProperties(schema) {
	if (!schema || typeof schema !== 'object') return [];
	const required = new Set(Array.isArray(schema.required) ? schema.required : []);
	const props = schema.properties || {};
	return Object.entries(props).map(([name, def]) => {
		def = def || {};
		const ref = def.$ref || def.items?.$ref || null;
		let type = def.type || (ref ? 'object' : (def.enum ? 'enum' : 'any'));
		if (type === 'array') {
			const itemType = def.items?.type || resolveRefName(def.items?.$ref) || 'item';
			type = `array<${itemType}>`;
		}
		return {
			name,
			type,
			format: def.format || '',
			description: def.description || def.title || '',
			required: required.has(name),
			ref: resolveRefName(ref),
			enum: Array.isArray(def.enum) ? def.enum : null,
		};
	});
}

function parseOpenApi(doc) {
	// OpenAPI 3.x → components.schemas; Swagger 2.0 → definitions.
	const schemas = doc?.components?.schemas || doc?.definitions || {};
	const components = Object.entries(schemas).map(([name, schema]) => ({
		name,
		description: schema?.description || schema?.title || '',
		type: schema?.type || 'object',
		propertyCount: schema?.properties ? Object.keys(schema.properties).length : 0,
		properties: extractProperties(schema),
		raw: schema,
	}));
	// Sort: schemas with properties first, then alphabetical.
	components.sort((a, b) =>
		(b.propertyCount > 0) - (a.propertyCount > 0) || a.name.localeCompare(b.name),
	);
	return {
		title: doc?.info?.title || 'Untitled API',
		version: doc?.info?.version || '',
		openapiVersion: doc?.openapi || doc?.swagger || '',
		description: doc?.info?.description || '',
		componentCount: components.length,
		components,
	};
}

// -------------------------------------------------------------------------
// Standard label / colour helpers shared with the UI.

const STANDARD_FROM_LABEL = (labels = []) => {
	const l = labels.find((x) => /Property|Field|Class|Element|Entity/.test(x)) || labels[0] || '';
	if (l.startsWith('Ceds')) return 'CEDS';
	if (l.startsWith('Jedx')) return 'JEDx';
	if (l.startsWith('EduApi')) return 'Ed-API';
	if (l.startsWith('Sif')) return 'SIF';
	if (l.startsWith('Edfi')) return 'Ed-Fi';
	if (l.startsWith('Ctdl')) return 'CTDL';
	if (l.startsWith('Pesc')) return 'PESC';
	if (l.startsWith('Sedm')) return 'SEDM';
	if (l.startsWith('Lif')) return 'LIF';
	if (l.startsWith('Clr')) return 'CLR';
	if (l.startsWith('OpenBadges')) return 'Open Badges';
	if (l.startsWith('Case')) return 'CASE';
	return l.replace(/(Property|Field|Class|Element|Entity)$/, '') || 'Other';
};

// =========================================================================

export const useSchemaVerifierStore = defineStore('schemaVerifierStore', {
	state: () => ({
		// crosswalk (static)
		crosswalk: hrOpenCrosswalk,
		crosswalkMeta: hrOpenCrosswalkMeta,

		// loaded OpenAPI document (null until the user loads one)
		api: null,
		loadError: '',

		// graph lookup cache + status, keyed by search term
		graphCache: {},
		graphLoading: false,
		graphError: '',
	}),

	getters: {
		sectionGroups: (state) => {
			const groups = {};
			for (const s of state.crosswalk) {
				(groups[s.group] ||= []).push(s);
			}
			return groups;
		},
		hasApi: (state) => !!state.api,
	},

	actions: {
		// ------------------------------------------------------------
		// Load an OpenAPI document from raw text (JSON or YAML).

		loadOpenApiText(text) {
			this.loadError = '';
			if (!text || !text.trim()) {
				this.loadError = 'Nothing to load — paste an OpenAPI document first.';
				return false;
			}
			let doc;
			try {
				doc = JSON.parse(text);
			} catch (_jsonErr) {
				try {
					doc = parseYaml(text);
				} catch (yamlErr) {
					this.loadError = `Could not parse as JSON or YAML: ${yamlErr.message}`;
					return false;
				}
			}
			const schemas = doc?.components?.schemas || doc?.definitions;
			if (!schemas || !Object.keys(schemas).length) {
				this.loadError =
					'Parsed OK, but no schemas found. Expected OpenAPI 3 components.schemas or Swagger 2 definitions.';
				return false;
			}
			this.api = parseOpenApi(doc);
			return true;
		},

		async loadOpenApiUrl(url) {
			this.loadError = '';
			try {
				const res = await axios.get(url, { responseType: 'text', transformResponse: (d) => d });
				return this.loadOpenApiText(res.data);
			} catch (err) {
				this.loadError = `Failed to fetch ${url}: ${err.message}`;
				return false;
			}
		},

		clearApi() {
			this.api = null;
			this.loadError = '';
		},

		// ------------------------------------------------------------
		// HR Open equivalents for a free-text term (property name or path).
		// Pure client-side against the bundled crosswalk. Returns ranked matches.

		// `context` (optional) is the section the term belongs to ({ id, group,
		// label, title }). When supplied, matches are RANKED with category
		// proximity in mind — same section first, same information group (Org vs
		// Worker) next, and cross-group collisions pushed down — while the
		// displayed `score` stays pure text similarity so the "% match" chip
		// remains meaningful.
		findHrOpen(term, { limit = 6, context = null } = {}) {
			const tokens = matchTokens(term);
			if (!tokens.length) return [];
			const ctxTokens = context
				? matchTokens(`${context.title || ''} ${context.label || ''}`)
				: [];
			return crosswalkIndex
				.map((el) => {
					const nameScore = matchScore(tokens, el.name);
					const propScore = matchScore(tokens, el.hrOpenProperty) * 0.8;
					const score = Math.max(nameScore, propScore);
					let rank = score;
					if (context) {
						if (el.sectionId === context.id) rank += 0.5;
						else if (el.group === context.group) rank += 0.12;
						else rank -= 0.2;
						if (ctxTokens.length) rank += matchScore(ctxTokens, el.sectionLabel) * 0.1;
					}
					return { el, score, rank };
				})
				.filter((x) => x.score > 0)
				.sort((a, b) => b.rank - a.rank || b.score - a.score)
				.slice(0, limit)
				.map((x) => ({ ...x.el, score: Math.round(x.score * 100) / 100 }));
		},

		// ------------------------------------------------------------
		// CEDS / cross-standard equivalents — LIVE graph lookup.
		// Searches property/field/class nodes whose name matches the term,
		// then collects each match's cross-standard MAPS_TO / IMPLIED_MAPPING
		// neighbours (the actual "equivalents").

		async lookupGraph(term) {
			const tokens = significantTokens(term);
			const key = tokens.join(' ');
			if (!key) return [];
			if (this.graphCache[key]) return this.graphCache[key];

			this.graphLoading = true;
			this.graphError = '';

			// Relevance-ranked, parameterised, read-only.
			//
			// Strict "all tokens present" misses real equivalents whenever the
			// standard names the concept slightly differently (e.g. the element
			// "Position Job Title" vs. CEDS "Position Title"). Instead we keep any
			// node sharing at least `minHits` significant tokens and rank by:
			//   hits*100   — coverage of the query's tokens (primary)
			//   + prec     — tightness: fewer extra words ranks higher (capped at 1.0
			//                so a no-space name like "PositionTitle" can't over-score)
			//   + 1        — prefer Property/Field leaves over Class hubs
			//   + 2        — surface CEDS first (the headline equivalence)
			const minHits = Math.max(1, Math.ceil(tokens.length / 2));
			const query = `
				WITH $words AS words, $minHits AS minHits
				MATCH (n)
				WHERE (n:CedsProperty OR n:CedsClass OR n:JedxField OR n:EduApiProperty
				       OR n:SifField OR n:CtdlProperty OR n:EdfiField OR n:LifProperty)
				  AND size(words) > 0
				  AND size([w IN words WHERE toLower(coalesce(n.name,'')) CONTAINS w]) >= minHits
				WITH n,
				     size([w IN words WHERE toLower(coalesce(n.name,'')) CONTAINS w]) AS hits,
				     size(split(trim(toLower(coalesce(n.name,''))), ' ')) AS candWords
				WITH n, hits, (CASE WHEN candWords > hits THEN candWords ELSE hits END) AS denom
				WITH n, hits, toInteger(round(10.0 * hits / denom)) AS prec
				WITH n, hits,
				     (hits * 100 + prec
				      + CASE WHEN (n:CedsProperty OR n:JedxField OR n:EduApiProperty
				                   OR n:SifField OR n:CtdlProperty OR n:EdfiField OR n:LifProperty)
				             THEN 1 ELSE 0 END
				      + CASE WHEN n:CedsProperty OR n:CedsClass THEN 2 ELSE 0 END) AS score
				ORDER BY score DESC LIMIT 20
				OPTIONAL MATCH (n)-[r:MAPS_TO|IMPLIED_MAPPING]-(m)
				WHERE m:CedsProperty OR m:CedsClass OR m:JedxField OR m:EduApiProperty
				      OR m:SifField OR m:CtdlProperty OR m:EdfiField OR m:LifProperty
				RETURN labels(n) AS labels,
				       n.name AS name,
				       coalesce(n.description, n.definition, '') AS description,
				       coalesce(n.cedsId, n.persistentId, '') AS sourceId,
				       score,
				       collect(DISTINCT {
				         rel: type(r),
				         name: m.name,
				         labels: labels(m),
				         confidence: r.confidence
				       })[0..10] AS related
				ORDER BY score DESC
			`;

			try {
				const loginStore = useLoginStore();
				const headers = { 'Content-Type': 'application/json' };
				if (loginStore.authtoken) Object.assign(headers, loginStore.getAuthTokenProperty);

				const res = await axios.post(
					'/api/dme-cypher-query',
					{ action: 'query', query, params: { words: tokens, minHits } },
					{ headers },
				);

				const rows = (Array.isArray(res.data) ? res.data : []).map((row) => ({
					standard: STANDARD_FROM_LABEL(row.labels),
					labels: row.labels,
					name: row.name,
					description: row.description,
					sourceId: row.sourceId,
					related: (row.related || [])
						.filter((r) => r && r.name)
						.map((r) => ({
							standard: STANDARD_FROM_LABEL(r.labels),
							name: r.name,
							rel: r.rel,
							authoritative: r.rel === 'MAPS_TO',
							confidence: r.confidence,
						})),
				}));

				this.graphCache[key] = rows;
				return rows;
			} catch (err) {
				this.graphError = err.response?.data || err.message || 'Graph lookup failed';
				return [];
			} finally {
				this.graphLoading = false;
			}
		},
	},
});
