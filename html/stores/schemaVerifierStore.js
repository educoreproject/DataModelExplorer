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
//      EDUcore knowledge graph via POST /api/schemaEquivalents (the browser sends
//      words; the server's schema-equivalents mapper owns the query).
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
		// CEDS / cross-standard equivalents — LIVE graph lookup (ported to the current graph, campaign P4b, A11).
		// Sends the term's significant WORDS to POST /api/schemaEquivalents; the server runs the schema-equivalents
		// mapper's query on the golden graph. Each row's `related` list holds JUDGMENTS (EXACT/CLOSE/BROAD/NARROW
		// match edges through the CEDS hub), each with its mappingConfidence, mappingKind and mappingSource — none
		// is authoritative. A refusal (for example a graph that lacks a label the query reads) is shown as-is.

		async lookupGraph(term) {
			const wordList = significantTokens(term);
			const cacheRefId = wordList.join(' ');
			if (!cacheRefId) return [];
			if (this.graphCache[cacheRefId]) return this.graphCache[cacheRefId];

			this.graphLoading = true;
			this.graphError = '';
			try {
				const loginStore = useLoginStore();
				const headers = { 'Content-Type': 'application/json', ...loginStore.getAuthTokenProperty };
				const response = await axios.post('/api/schemaEquivalents', { wordList }, { headers });
				const equivalentRowList = (Array.isArray(response.data) ? response.data : []).map((oneRow) => ({
					standard: oneRow.standardFamily || oneRow.source,
					source: oneRow.source,
					name: oneRow.name,
					description: oneRow.description,
					sourceId: oneRow.sourceId,
					related: (oneRow.related || []).map((oneRelated) => ({
						standard: oneRelated.source,
						name: oneRelated.name,
						relation: oneRelated.relation,
						mappingConfidence: oneRelated.mappingConfidence,
						mappingKind: oneRelated.mappingKind,
						mappingSource: oneRelated.mappingSource,
						edgeCount: oneRelated.edgeCount,
					})),
				}));
				this.graphCache[cacheRefId] = equivalentRowList;
				return equivalentRowList;
			} catch (error) {
				this.graphError = error.response?.data || error.message || 'Schema equivalents lookup failed';
				return [];
			} finally {
				this.graphLoading = false;
			}
		},
	},
});
