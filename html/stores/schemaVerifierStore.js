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
//      EDUcore knowledge graph via GET /api/dme-equivalents, a fixed
//      parameterised query the server runs on our behalf. (The generic
//      /api/dme-cypher-query endpoint is internal-only per SEC-2 — browsers may
//      not send arbitrary Cypher.) When the live endpoint is unavailable (not
//      yet deployed, or offline) we fall back to a bundled snapshot of the
//      graph's hub equivalences (data/educore-equivalents-snapshot.json,
//      lazy-loaded), and the UI badge switches from "live" to "snapshot".
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

// The graph stamps every golden node with its standard in `_source`
// (e.g. 'CEDS', 'SIF', 'EdFi', 'EduAPI'). Normalise the few whose display
// name differs, and fall back to label parsing for rows without a source.
const SOURCE_DISPLAY = {
	EdFi: 'Ed-Fi',
	EduAPI: 'Ed-API',
	OpenBadges: 'Open Badges',
};

const STANDARD_FROM_LABEL = (labels = []) => {
	const l = labels.find((x) => /Property|Field|Class|Element|Entity/.test(x)) || labels[0] || '';
	if (l.startsWith('Ceds')) return 'CEDS';
	if (l.startsWith('Jedx')) return 'JEDx';
	if (l.startsWith('Eduapi') || l.startsWith('EduApi')) return 'Ed-API';
	if (l.startsWith('Sif')) return 'SIF';
	if (l.startsWith('Edfi')) return 'Ed-Fi';
	if (l.startsWith('Ctdl')) return 'CTDL';
	if (l.startsWith('Pesc')) return 'PESC';
	if (l.startsWith('Sedm')) return 'SEDM';
	if (l.startsWith('Lif')) return 'LIF';
	if (l.startsWith('Clr')) return 'CLR';
	if (l.startsWith('OpenBadges')) return 'Open Badges';
	if (l.startsWith('Case')) return 'CASE';
	if (l.startsWith('Medbiq')) return 'MedBiquitous';
	return l.replace(/(Property|Field|Class|Element|Entity)$/, '') || 'Other';
};

const standardOf = (source, labels) =>
	(source && (SOURCE_DISPLAY[source] || source)) || STANDARD_FROM_LABEL(labels);

// -------------------------------------------------------------------------
// Snapshot fallback — client-side equivalents lookup over the bundled hub
// snapshot. Mirrors the server's dme-equivalents ranking: token coverage
// (hits*100), precision, +1 for property leaves, +2 for CEDS.

function scoreSnapshotMember(tokens, minHits, member) {
	const nameLower = String(member.name || '').toLowerCase();
	const hits = tokens.filter((w) => nameLower.includes(w)).length;
	if (hits < minHits) return null;
	const candWords = nameLower.trim().split(/\s+/).length;
	const denom = Math.max(candWords, hits);
	const prec = Math.round((10 * hits) / denom);
	return (
		hits * 100 + prec + (member.k === 'P' ? 1 : 0) + (member.source === 'CEDS' ? 2 : 0)
	);
}

function searchSnapshot(snapshot, tokens, minHits) {
	const rows = [];
	for (const hub of snapshot.hubs) {
		// A hub's members: its CEDS anchor(s) plus its cross-standard matches.
		// The anchor's "relationship" to the hub is definitional, so when it
		// appears in another member's related list it is marked authoritative.
		const members = [
			...(hub.ceds || []).map((c) => ({ ...c, rel: 'EXACT_MATCH' })),
			...(hub.matches || []),
		];
		for (const member of members) {
			const score = scoreSnapshotMember(tokens, minHits, member);
			if (score === null) continue;
			rows.push({
				standard: standardOf(member.source),
				name: member.name,
				description: member.desc || '',
				sourceId: member.id || '',
				score,
				related: members
					.filter((m) => m !== member)
					.slice(0, 10)
					.map((m) => ({
						standard: standardOf(m.source),
						name: m.name,
						rel: m.rel,
						authoritative: m.rel === 'EXACT_MATCH',
					})),
			});
		}
	}
	// Dedupe (the same node can sit in several hubs) keeping the best score.
	const best = new Map();
	for (const row of rows) {
		const k = `${row.standard}|${row.name}`;
		if (!best.has(k) || best.get(k).score < row.score) best.set(k, row);
	}
	return [...best.values()].sort((a, b) => b.score - a.score).slice(0, 20);
}

// -------------------------------------------------------------------------
// User-curated equivalence crosswalk — persisted in localStorage. Keyed by
// crosswalk element id (or a term-derived key in OpenAPI mode); each entry is
// a list the user built by accepting/removing suggestions in the UI.

const USER_EQUIV_STORAGE_KEY = 'schemaVerifier.userEquivalents';

function loadUserEquivalents() {
	try {
		return JSON.parse(localStorage.getItem(USER_EQUIV_STORAGE_KEY)) || {};
	} catch (_err) {
		return {};
	}
}

function persistUserEquivalents(value) {
	try {
		localStorage.setItem(USER_EQUIV_STORAGE_KEY, JSON.stringify(value));
	} catch (_err) {
		/* storage full or unavailable — curation still works for the session */
	}
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
		graphSource: '', // '' until first lookup, then 'live' | 'snapshot'
		snapshotDate: '',

		// user-curated equivalence crosswalk, keyed by element id / term
		userEquivalents: loadUserEquivalents(),
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
		userEquivalentsFor: (state) => (key) => state.userEquivalents[key] || [],
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
		// User-curated equivalence crosswalk. An item is
		// { standard, name, sourceId?, rel?, detail? } — identity is
		// (standard, name), so re-adding the same suggestion is a no-op.

		addUserEquivalent(key, item) {
			if (!key || !item?.name) return;
			const list = this.userEquivalents[key] || [];
			if (list.some((e) => e.standard === item.standard && e.name === item.name)) return;
			this.userEquivalents = { ...this.userEquivalents, [key]: [...list, item] };
			persistUserEquivalents(this.userEquivalents);
		},

		removeUserEquivalent(key, item) {
			const list = this.userEquivalents[key] || [];
			const next = list.filter(
				(e) => !(e.standard === item.standard && e.name === item.name),
			);
			this.userEquivalents = { ...this.userEquivalents, [key]: next };
			if (!next.length) delete this.userEquivalents[key];
			persistUserEquivalents(this.userEquivalents);
		},

		hasUserEquivalent(key, item) {
			return (this.userEquivalents[key] || []).some(
				(e) => e.standard === item.standard && e.name === item.name,
			);
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
		// GET /api/dme-equivalents runs the one fixed, relevance-ranked query
		// server-side: golden nodes whose name shares tokens with the term, each
		// with its HubReference's cross-standard neighbours (EXACT_MATCH is the
		// hub-verified equivalence; CLOSE/NARROW/RELATED_MATCH are suggestions).

		async lookupGraph(term) {
			const tokens = significantTokens(term);
			const key = tokens.join(' ');
			if (!key) return [];
			if (this.graphCache[key]) return this.graphCache[key];

			this.graphLoading = true;
			this.graphError = '';

			try {
				const loginStore = useLoginStore();
				const headers = {};
				if (loginStore.authtoken) Object.assign(headers, loginStore.getAuthTokenProperty);

				const res = await axios.get('/api/dme-equivalents', {
					params: { term },
					headers,
				});

				const rows = (Array.isArray(res.data) ? res.data : [])
					.filter((row) => row && row.name)
					.map((row) => ({
						standard: standardOf(row.source, row.labels),
						labels: row.labels,
						name: row.name,
						description: row.description,
						sourceId: row.sourceId,
						related: (row.related || [])
							.filter((r) => r && r.name)
							.map((r) => ({
								standard: standardOf(r.source, r.labels),
								name: r.name,
								rel: r.rel,
								authoritative: r.rel === 'EXACT_MATCH',
							})),
					}));

				this.graphSource = 'live';
				this.graphCache[key] = rows;
				return rows;
			} catch (_liveErr) {
				// Live endpoint unavailable (not deployed / offline / rejected) —
				// fall back to the bundled snapshot of the graph's hub equivalences.
				try {
					const { default: snapshot } = await import(
						'@/data/educore-equivalents-snapshot.json'
					);
					const minHits = Math.max(1, Math.ceil(tokens.length / 2));
					const rows = searchSnapshot(snapshot, tokens, minHits);
					this.graphSource = 'snapshot';
					this.snapshotDate = snapshot.generated || '';
					this.graphCache[key] = rows;
					return rows;
				} catch (err) {
					this.graphError = err.message || 'Graph lookup failed';
					return [];
				}
			} finally {
				this.graphLoading = false;
			}
		},
	},
});
