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

// Turn one schema object into a flat list of property rows. Inline nested
// objects (a property that is itself `type: object` with `properties`, or an
// array of such) are flattened with dotted names — `address.street` — and each
// row records its `parent` so the browser can partition the list by the
// sub-object it belongs to, the way the spec browser partitions by class.
// `$ref` properties are not expanded (the referenced schema is its own
// component tab); the row keeps `ref` so the UI can link across.
function extractProperties(schema, prefix = '', depth = 0) {
	if (!schema || typeof schema !== 'object') return [];
	const required = new Set(Array.isArray(schema.required) ? schema.required : []);
	const props = schema.properties || {};
	const rows = [];
	for (const [key, rawDef] of Object.entries(props)) {
		const def = rawDef || {};
		const ref = def.$ref || def.items?.$ref || null;
		let type = def.type || (ref ? 'object' : (def.enum ? 'enum' : 'any'));
		if (type === 'array') {
			const itemType = def.items?.type || resolveRefName(def.items?.$ref) || 'item';
			type = `array<${itemType}>`;
		}
		const name = prefix ? `${prefix}.${key}` : key;
		rows.push({
			name,
			leaf: key,
			parent: prefix,
			depth,
			type,
			format: def.format || '',
			description: def.description || def.title || '',
			required: required.has(key),
			ref: resolveRefName(ref),
			enum: Array.isArray(def.enum) ? def.enum : null,
		});
		const inline = def.properties ? def : def.items?.properties ? def.items : null;
		if (inline && depth < 6) rows.push(...extractProperties(inline, name, depth + 1));
	}
	return rows;
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
		// Which other components this one points at, for the "uses" links.
		refs: [...new Set(extractProperties(schema).map((p) => p.ref).filter(Boolean))],
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
//
// Two token lists play different roles. ELIGIBILITY uses the significant
// tokens (broad stop list — "name"/"code"/"id" match half the graph, so they
// may not qualify a candidate on their own). RANKING counts hits over the
// full matchTokens list, so those same words still discriminate between
// eligible candidates: for "last name", "Last or Surname" scores 2 hits
// (sur-NAME) while "Last Instruction Date" scores 1, and the tier filter
// below then drops the 1-hit rows.

function scoreSnapshotMember(sigTokens, allTokens, minHits, member) {
	const nameLower = String(member.name || '').toLowerCase();
	const sigHits = sigTokens.filter((w) => nameLower.includes(w)).length;
	if (sigHits < minHits) return null;
	const hits = allTokens.filter((w) => nameLower.includes(w)).length;
	const candWords = nameLower.trim().split(/\s+/).length;
	const denom = Math.max(candWords, hits);
	const prec = Math.round((10 * hits) / denom);
	return (
		hits * 100 + prec + (member.k === 'P' ? 1 : 0) + (member.source === 'CEDS' ? 2 : 0)
	);
}

// Keep only the best hit tier. When any candidate matched 2+ query tokens,
// candidates that matched fewer are near-certain false positives (they share
// one word, e.g. "last"), so hide them rather than merely rank them lower.
// Single-token queries (maxHits <= 1) pass through untouched.
function keepTopHitTier(rows) {
	const hitsOf = (r) => Math.floor((r.score || 0) / 100);
	const maxHits = rows.reduce((m, r) => Math.max(m, hitsOf(r)), 0);
	return maxHits > 1 ? rows.filter((r) => hitsOf(r) === maxHits) : rows;
}

function searchSnapshot(snapshot, sigTokens, allTokens, minHits) {
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
			const score = scoreSnapshotMember(sigTokens, allTokens, minHits, member);
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
// Specification inventory + per-spec browsing.
//
// The Schema Verifier's entry point is a live list of the specifications the
// graph can actually explain element by element. That list is NOT hand-kept:
// every golden node carries a `_source` stamp, so the distinct sources ARE the
// inventory, and a spec appears the moment it is forged into the graph.
//
// Publishing organization is the sort key the dropdown groups on. The graph
// supplies it from the EdMatrix side ((EdStandard)-[:PUBLISHED_BY]->(Organization))
// when the EdMatrix title and the `_source` code line up; the table below fills
// the gaps for sources with no EdMatrix twin. It is a display convenience, never
// a source of truth — anything unmatched simply lands under "Other publishers".

const ORG_BY_SOURCE = {
	CEDS: 'NCES / US Department of Education',
	CIP: 'NCES',
	SIF: 'Access 4 Learning (A4L)',
	EdFi: 'Ed-Fi Alliance',
	CTDL: 'Credential Engine',
	CTDLASN: 'Credential Engine',
	CTDLQData: 'Credential Engine',
	PESC: 'PESC',
	JEDx: 'US Chamber of Commerce Foundation',
	SEDM: 'CIID / IDEA',
	CASE: '1EdTech',
	CLR: '1EdTech',
	OpenBadges: '1EdTech',
	LIF: '1EdTech',
	EduAPI: '1EdTech',
	MedBiquitous: 'MedBiquitous Consortium',
};

const UNATTRIBUTED_ORG = 'Other publishers';

// The entity an element belongs to, derived from the graph's dotted `path`
// ("Assessment.AssessmentPerformanceLevel.label" → "Assessment"). This is what
// the specification browser tabs on — the same categories-first shape the HR
// Open crosswalk has, but derived from the standard's own structure rather
// than hand-authored. A top-level class is its own group; an element with no
// path (snapshot rows) gets '' and the browser falls back to one flat list.
function elementGroup(path, name, kind) {
	const p = String(path || '').trim();
	if (!p) return '';
	const head = p.split('.')[0].trim();
	if (!head) return '';
	if (kind === 'class' && p === name) return name;
	return head;
}

// The snapshot is imported lazily and at most once — it is a large JSON blob
// that most sessions never need (it only comes into play when the live
// endpoints are unavailable).

let snapshotPromise = null;
function loadSnapshot() {
	if (!snapshotPromise) {
		snapshotPromise = import('@/data/educore-equivalents-snapshot.json').then(
			(mod) => mod.default,
		);
	}
	return snapshotPromise;
}

// Flatten the snapshot's hubs into the two shapes the spec views need: every
// element grouped by its spec, and, for each element, the hubs it sits in (the
// path to its cross-spec neighbours). Built once per session.
//
// A hub's CEDS anchors are its definition, so they enter as EXACT_MATCH — the
// same treatment searchSnapshot() gives them, and the reason they are excluded
// from "implied" results below.

let snapshotIndexCache = null;

function snapshotIndex(snapshot) {
	if (snapshotIndexCache) return snapshotIndexCache;

	const bySource = new Map(); // source -> Map(nameLower -> element)
	const hubsByMember = new Map(); // 'source|nameLower' -> [members[], ...]

	const kindOf = (k) => (k === 'C' ? 'class' : k === 'P' ? 'property' : 'value');

	const toElement = (source, member) => ({
		name: member.name,
		source,
		standard: standardOf(source),
		kind: kindOf(member.k),
		description: member.desc || '',
		sourceId: member.id || '',
		path: member.path || '',
		group: elementGroup(member.path, member.name, kindOf(member.k)),
	});

	// Structural elements the snapshot carries outright (a standard's classes and
	// properties, whether or not they have hub mappings yet). These are the data
	// model; hub members below only add what is missing.
	for (const [source, list] of Object.entries(snapshot.elements || {})) {
		const specMap = new Map();
		for (const member of list) {
			if (!member.name) continue;
			// Keyed by path when present so same-named fields on different
			// entities (every LIF entity has `identifier`) stay distinct.
			specMap.set((member.path || member.name).toLowerCase(), toElement(source, member));
		}
		bySource.set(source, specMap);
	}

	for (const hub of snapshot.hubs) {
		const members = [
			...(hub.ceds || []).map((c) => ({ ...c, rel: 'EXACT_MATCH' })),
			...(hub.matches || []),
		];
		for (const member of members) {
			if (!member.name || !member.source) continue;
			const nameKey = member.name.toLowerCase();
			const memberKey = `${member.source}|${nameKey}`;

			if (!bySource.has(member.source)) bySource.set(member.source, new Map());
			const specMap = bySource.get(member.source);
			const elementKey = (member.path || member.name).toLowerCase();
			if (!specMap.has(elementKey)) specMap.set(elementKey, toElement(member.source, member));

			if (!hubsByMember.has(memberKey)) hubsByMember.set(memberKey, []);
			hubsByMember.get(memberKey).push({ hub: hub.hub, members });
		}
	}

	snapshotIndexCache = { bySource, hubsByMember };
	return snapshotIndexCache;
}

// Which hub edges count as verified. EXACT_MATCH is the hub-verified
// equivalence; the HAS_CEDS_* edges are how a CEDS anchor is bound to the hub
// it defines, which is definitional and therefore at least as strong.
const VERIFIED_RELS = new Set([
	'EXACT_MATCH',
	'HAS_CEDS_PROPERTY',
	'HAS_CEDS_DOMAIN',
	'HAS_CEDS_VALUE',
]);

// A cross-spec correspondence runs over two hub edges — the element's own
// (selfRel) and the neighbour's (rel) — and is only as strong as the weaker of
// them. Both verified means the pair is authoritative BY COMPOSITION: no
// standard's documentation crosswalks directly to another's, so a SIF ↔ Ed-Fi
// equivalence is two asserted legs meeting at a CEDS hub. Anything else is a
// similarity-derived hypothesis.
const isAuthoritativePair = (selfRel, rel) =>
	VERIFIED_RELS.has(selfRel) && VERIFIED_RELS.has(rel);

// -------------------------------------------------------------------------
// Scoring a cross-spec row, for the "%" chip and for ranking.
//
// Two different things can supply the number, and they are NOT interchangeable,
// so each row records which one it used:
//
//   'semantic' — cosine distance between the two elements' voyage-3 embeddings,
//     computed by the graph on demand. This is the only basis that measures
//     MEANING, so it is preferred whenever available. Same model on both sides,
//     so the comparison is sound.
//
//   'confidence' — the forge's own number, stamped on the hub edges. Authored
//     crosswalk edges carried 1.0; similarity-derived ones carry the vector
//     score. A composed path multiplies its two legs, because two independent
//     0.9 hops genuinely are weaker evidence than one.
//
//   'similarity' — last resort, computed here from names (or definitions) when
//     the graph offers neither of the above; the bundled snapshot never does,
//     since it carries no embeddings. It says how alike the LABELS are, which is
//     nearly unrelated to whether the mapping is right: CASE `fullStatement` and
//     CEDS `Competency Definition` mean the same thing and share no words at
//     all. Recorded as its own basis so the UI can refuse to dress it up.
//
// Dice coefficient over significant tokens: symmetric, so "County" scores well
// against "NameOfCounty" but not against a long name that merely contains it.

function nameSimilarity(a, b) {
	const left = new Set(matchTokens(a));
	const right = new Set(matchTokens(b));
	if (!left.size || !right.size) return 0;
	let shared = 0;
	for (const token of left) if (right.has(token)) shared++;
	return (2 * shared) / (left.size + right.size);
}

function scoreRow({
	semantic,
	selfConfidence,
	confidence,
	fromName,
	toName,
	fromDescription = '',
	toDescription = '',
}) {
	if (typeof semantic === 'number' && Number.isFinite(semantic)) {
		// Cosine runs -1..1; only the positive half is meaningful here.
		return { score: Math.max(0, Math.min(1, semantic)), scoreBasis: 'semantic' };
	}
	const legs = [selfConfidence, confidence].filter(
		(c) => typeof c === 'number' && Number.isFinite(c),
	);
	if (legs.length === 2) {
		return { score: legs[0] * legs[1], scoreBasis: 'confidence' };
	}
	if (legs.length === 1) {
		return { score: legs[0], scoreBasis: 'confidence' };
	}
	// Best lexical evidence available, not a blend: two elements can share a
	// meaning while sharing no words in their names (CASE `fullStatement` and
	// CEDS `Competency Definition`), and then the definitions are the only
	// lexical signal there is. Taking the max avoids inventing a weighting.
	const score = Math.max(
		nameSimilarity(fromName, toName),
		nameSimilarity(fromDescription, toDescription),
	);
	return { score, scoreBasis: 'similarity' };
}

// Sort specs the way the dropdown groups them: organization first, then title.
function sortSpecs(specs) {
	return specs.sort(
		(a, b) =>
			a.organization.localeCompare(b.organization) ||
			a.standard.localeCompare(b.standard),
	);
}

// -------------------------------------------------------------------------
// User-curated equivalence crosswalk. Keyed by crosswalk element id (or
// "<spec>::<element>" / a term-derived key); each entry is a list of mappings
// the user built by accepting/removing suggestions in the UI. A mapping is
//
//   { standard, name, sourceId?, rel?, detail?,
//     sourceStandard?, sourceName?, sourceElementId?,   // the element being mapped
//     transform?: { type, rule, notes },                // how a value moves across
//     refId? }                                          // server row id once synced
//
// Persistence is two-tier: localStorage always (works logged out, survives the
// session), and the server's dme_user_mappings SQLite table whenever the user
// is logged in. On load the server copy wins; local-only entries are pushed up.

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

// The transformation-rule vocabulary. `direct` is the implicit default: the
// value is copied unchanged. Everything else needs a rule string whose shape
// depends on the type — the hint tells the user what to write.
export const TRANSFORM_TYPES = [
	{ value: 'direct', title: 'Direct copy', hint: 'Value moves across unchanged. No rule needed.' },
	{ value: 'rename', title: 'Rename only', hint: 'Same value, different field name. Optionally note the target path (e.g. person.name.legal).' },
	{ value: 'valueMap', title: 'Value / code lookup', hint: 'One mapping per line, source => target. Example:\nM => Male\nF => Female\n* => Unknown   (fallback)' },
	{ value: 'format', title: 'Format conversion', hint: 'Describe the conversion, e.g. date MM/DD/YYYY => YYYY-MM-DD, or number "1,234.50" => 1234.5.' },
	{ value: 'concat', title: 'Concatenate fields', hint: 'Template using {field} placeholders, e.g. {firstName} {lastName}.' },
	{ value: 'split', title: 'Split a field', hint: 'Delimiter or regex and which part to keep, e.g. split on " " take [0].' },
	{ value: 'constant', title: 'Constant value', hint: 'The fixed value the target always receives, e.g. "US".' },
	{ value: 'expression', title: 'Custom expression', hint: 'Any expression in your integration language (JSONata, JavaScript, SQL…). Note the language in Notes.' },
];

const EMPTY_TRANSFORM = { type: 'direct', rule: '', notes: '' };

function normalizeTransform(transform) {
	if (!transform || typeof transform !== 'object') return { ...EMPTY_TRANSFORM };
	return {
		type: transform.type || 'direct',
		rule: transform.rule || '',
		notes: transform.notes || '',
	};
}

const sameMapping = (a, b) => a.standard === b.standard && a.name === b.name;

// Server row  ⇄  store item. The server flattens the transform into three
// columns; the store keeps it nested so components can treat it as one thing.
function rowToItem(row) {
	return {
		refId: row.refId,
		standard: row.targetStandard,
		name: row.targetName,
		sourceId: row.targetSourceId || '',
		targetPath: row.targetPath || '',
		rel: row.rel || '',
		detail: row.detail || '',
		sourceStandard: row.sourceStandard || '',
		sourceName: row.sourceName || '',
		sourceElementId: row.sourceId || '',
		sourcePath: row.sourcePath || '',
		transform: normalizeTransform({
			type: row.transformType,
			rule: row.transformRule,
			notes: row.transformNotes,
		}),
		// review state, set server-side by an admin
		status: row.status || 'proposed',
		reviewedByName: row.reviewedByName || '',
		reviewNote: row.reviewNote || '',
		proposedBy: row.proposedBy || '',
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function itemToRow(key, item) {
	const transform = normalizeTransform(item.transform);
	return {
		mappingKey: key,
		sourceStandard: item.sourceStandard || '',
		sourceName: item.sourceName || '',
		sourceId: item.sourceElementId || '',
		sourcePath: item.sourcePath || '',
		targetStandard: item.standard,
		targetName: item.name,
		targetSourceId: item.sourceId || '',
		targetPath: item.targetPath || item.path || '',
		rel: item.rel || '',
		detail: item.detail || '',
		transformType: transform.type,
		transformRule: transform.rule,
		transformNotes: transform.notes,
	};
}

// A server row (anyone's proposal) in the flat shape the "all mappings" table
// and exports use. Same columns as flattenEquivalents() plus provenance.
function rowToFlat(row) {
	return {
		mappingKey: row.mappingKey,
		sourceStandard: row.sourceStandard || '',
		sourceName: row.sourceName || '',
		sourceId: row.sourceId || '',
		sourcePath: row.sourcePath || '',
		targetStandard: row.targetStandard,
		targetName: row.targetName,
		targetSourceId: row.targetSourceId || '',
		targetPath: row.targetPath || '',
		relationship: row.rel || '',
		detail: row.detail || '',
		transformType: row.transformType || 'direct',
		transformRule: row.transformRule || '',
		transformNotes: row.transformNotes || '',
		status: row.status || 'proposed',
		proposedBy: row.proposedBy || '',
		reviewedByName: row.reviewedByName || '',
		reviewNote: row.reviewNote || '',
		mine: !!row.mine,
		refId: row.refId || '',
		createdAt: row.createdAt || '',
		updatedAt: row.updatedAt || '',
	};
}

// One flat record per mapping — the export shape (and the "all mappings" table).
function flattenEquivalents(userEquivalents) {
	const rows = [];
	for (const [key, list] of Object.entries(userEquivalents)) {
		for (const item of list) {
			const transform = normalizeTransform(item.transform);
			rows.push({
				mappingKey: key,
				sourceStandard: item.sourceStandard || '',
				sourceName: item.sourceName || '',
				sourceId: item.sourceElementId || '',
				sourcePath: item.sourcePath || '',
				targetStandard: item.standard,
				targetName: item.name,
				targetSourceId: item.sourceId || '',
				targetPath: item.targetPath || '',
				relationship: item.rel || '',
				detail: item.detail || '',
				transformType: transform.type,
				transformRule: transform.rule,
				transformNotes: transform.notes,
				status: item.status || (item.refId ? 'proposed' : 'local'),
				proposedBy: item.proposedBy || '',
				reviewedByName: item.reviewedByName || '',
				reviewNote: item.reviewNote || '',
				mine: true,
				refId: item.refId || '',
				createdAt: item.createdAt || '',
				updatedAt: item.updatedAt || '',
			});
		}
	}
	return rows.sort(
		(a, b) =>
			a.mappingKey.localeCompare(b.mappingKey) ||
			a.targetStandard.localeCompare(b.targetStandard) ||
			a.targetName.localeCompare(b.targetName),
	);
}

const EXPORT_COLUMNS = [
	'mappingKey',
	'sourceStandard',
	'sourceName',
	'sourceId',
	'sourcePath',
	'targetStandard',
	'targetName',
	'targetSourceId',
	'targetPath',
	'relationship',
	'detail',
	'transformType',
	'transformRule',
	'transformNotes',
	'status',
	'proposedBy',
	'reviewedByName',
	'reviewNote',
	'refId',
	'createdAt',
	'updatedAt',
];

function csvCell(value) {
	const text = value === undefined || value === null ? '' : String(value);
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
	const lines = [EXPORT_COLUMNS.join(',')];
	for (const row of rows) lines.push(EXPORT_COLUMNS.map((c) => csvCell(row[c])).join(','));
	return lines.join('\r\n');
}

function authHeaders() {
	const loginStore = useLoginStore();
	return loginStore.authtoken ? { ...loginStore.getAuthTokenProperty } : null;
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

		// specification inventory (live graph, snapshot fallback)
		specs: [],
		specsLoading: false,
		specsError: '',
		specsSource: '', // '' until first load, then 'live' | 'snapshot'

		// the spec currently being browsed, and its elements
		selectedSpec: null,
		elements: [],
		elementsLoading: false,
		elementsError: '',
		elementsTruncated: false,

		// cross-spec mappings ({ authoritative, implied }), keyed by 'source|nameLower'
		mappingsCache: {},
		mappingsLoading: false,
		mappingsError: '',

		// user-curated equivalence crosswalk, keyed by element id / term
		userEquivalents: loadUserEquivalents(),
		// '' until the first sync attempt, then 'server' (rows persisted to the
		// user's account) or 'local' (browser storage only — not logged in, or the
		// endpoint is unavailable)
		mappingsPersistence: '',
		mappingsSyncing: false,
		mappingsSyncError: '',

		// Everyone's proposals (scope=all), flat rows with proposer + status.
		// Loaded alongside the user's own on sync; empty when logged out.
		communityMappings: [],
		communityLoading: false,
		communityError: '',
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

		// Top-level entities among the loaded elements, for the browser's tabs:
		// [{ name, count }] alphabetical. Empty when the elements carry no path
		// (snapshot fallback), which tells the page to show one flat list.
		elementGroups: (state) => {
			const counts = new Map();
			for (const el of state.elements) {
				if (!el.group) continue;
				counts.set(el.group, (counts.get(el.group) || 0) + 1);
			}
			return [...counts.entries()]
				.map(([name, count]) => ({ name, count }))
				.sort((a, b) => a.name.localeCompare(b.name));
		},

		// Every saved mapping, flattened to one record each — what gets exported.
		allMappings: (state) => flattenEquivalents(state.userEquivalents),
		mappingCount: (state) =>
			Object.values(state.userEquivalents).reduce((n, list) => n + list.length, 0),

		// Reviewing and bulk-exporting proposals is an admin job; the role comes
		// from the login token, and the server enforces it again.
		isMappingAdmin: () => {
			const loginStore = useLoginStore();
			return !!loginStore.authtoken && ['admin', 'super'].includes(loginStore.loggedInUser?.role);
		},
		communityCounts: (state) => {
			const counts = { proposed: 0, accepted: 0, rejected: 0 };
			for (const row of state.communityMappings) counts[row.status] = (counts[row.status] || 0) + 1;
			return counts;
		},

		// Specs grouped for the picker: [{ organization, specs: [...] }], both
		// levels alphabetical. `specs` is already sorted organization-then-title,
		// so a single pass preserves that order.
		specsByOrganization: (state) => {
			const groups = [];
			for (const spec of state.specs) {
				const last = groups[groups.length - 1];
				if (last && last.organization === spec.organization) last.specs.push(spec);
				else groups.push({ organization: spec.organization, specs: [spec] });
			}
			return groups;
		},
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
		// Auth header for the public reference endpoints. They accept
		// anonymous callers, but a signed-in user's token is forwarded so the
		// request is attributed rather than anonymous.

		authHeaders() {
			const loginStore = useLoginStore();
			return loginStore.authtoken ? { ...loginStore.getAuthTokenProperty } : {};
		},

		// ------------------------------------------------------------
		// Specification inventory — the list behind the picker. Live from the
		// graph; falls back to the bundled snapshot, which carries the same
		// `_source` stamps and so yields the same shape of answer.

		async loadSpecifications({ force = false } = {}) {
			if (this.specs.length && !force) return this.specs;

			this.specsLoading = true;
			this.specsError = '';

			try {
				const res = await axios.get('/api/dme-specifications', {
					headers: this.authHeaders(),
				});
				const rows = (Array.isArray(res.data) ? res.data : [])
					.filter((row) => row && row.source && row.elementCount > 0)
					.map((row) => ({
						source: row.source,
						standard: standardOf(row.source),
						organization:
							row.organization || ORG_BY_SOURCE[row.source] || UNATTRIBUTED_ORG,
						elementCount: row.elementCount || 0,
						propertyCount: row.propertyCount || 0,
						classCount: row.classCount || 0,
						url: row.url || '',
						description: row.description || '',
					}));
				if (!rows.length) throw new Error('graph returned no specifications');

				this.specsSource = 'live';
				this.specs = sortSpecs(rows);
				return this.specs;
			} catch (_liveErr) {
				try {
					const snapshot = await loadSnapshot();
					const { bySource } = snapshotIndex(snapshot);
					const rows = [...bySource.entries()].map(([source, elements]) => {
						const list = [...elements.values()];
						const classCount = list.filter((e) => e.kind === 'class').length;
						return {
							source,
							standard: standardOf(source),
							organization: ORG_BY_SOURCE[source] || UNATTRIBUTED_ORG,
							elementCount: list.length,
							propertyCount: list.length - classCount,
							classCount,
							url: '',
							description: '',
						};
					});

					this.specsSource = 'snapshot';
					this.snapshotDate = snapshot.generated || '';
					this.specs = sortSpecs(rows);
					return this.specs;
				} catch (err) {
					this.specsError =
						err.message || 'Could not load the specification list.';
					return [];
				}
			} finally {
				this.specsLoading = false;
			}
		},

		// ------------------------------------------------------------
		// Elements of one specification — the left-hand list. `search` is
		// pushed down to the query rather than applied in the browser: a
		// standard the size of CEDS is far larger than one response.

		// The cap is generous enough that a mid-sized model (LIF is ~1,700 rows
		// with its mapped values) arrives whole — the entity tabs partition it
		// client-side, and a truncated list would silently drop whole entities.
		// CEDS and SIF still exceed it and show the "filter to narrow" notice.
		async loadSpecElements(source, { search = '', limit = 2000 } = {}) {
			if (!source) return [];

			this.elementsLoading = true;
			this.elementsError = '';

			try {
				const res = await axios.get('/api/dme-spec-elements', {
					params: { source, search, limit },
					headers: this.authHeaders(),
				});
				const rows = (Array.isArray(res.data) ? res.data : [])
					.filter((row) => row && row.name)
					.map((row) => ({
						name: row.name,
						source: row.source || source,
						standard: standardOf(row.source || source, row.labels),
						kind: row.kind || 'property',
						description: row.description || '',
						sourceId: row.sourceId || '',
						path: row.path || '',
						group: elementGroup(row.path, row.name, row.kind),
					}));

				// When the graph supplies paths, order follows the model (an entity,
				// then its members) so the partitioned list reads top-down.
				if (rows.every((r) => r.path)) rows.sort((a, b) => a.path.localeCompare(b.path));

				this.elements = rows;
				this.elementsTruncated = rows.length >= limit;
				return rows;
			} catch (_liveErr) {
				try {
					const snapshot = await loadSnapshot();
					const { bySource } = snapshotIndex(snapshot);
					const q = search.trim().toLowerCase();
					// With paths, order follows the model (an entity, then its members);
					// without, classes first then alphabetical, as before.
					const all = [...(bySource.get(source)?.values() || [])]
						.filter((el) => !q || el.name.toLowerCase().includes(q))
						.sort(
							(a, b) =>
								(a.path && b.path ? a.path.localeCompare(b.path) : 0) ||
								(a.kind === 'class' ? 0 : 1) - (b.kind === 'class' ? 0 : 1) ||
								a.name.localeCompare(b.name),
						);

					this.snapshotDate = snapshot.generated || '';
					this.elements = all.slice(0, limit);
					this.elementsTruncated = all.length > limit;
					return this.elements;
				} catch (err) {
					this.elements = [];
					this.elementsTruncated = false;
					this.elementsError =
						err.message || 'Could not load elements for this specification.';
					return [];
				}
			} finally {
				this.elementsLoading = false;
			}
		},

		// ------------------------------------------------------------
		// Cross-specification mappings for one element, split into the graph's
		// two tiers. Returns { authoritative, implied }.
		//
		// AUTHORITATIVE — both hub edges are verified. Because cross-standard
		// authority is always CEDS-mediated, most of these are equivalences
		// between two non-CEDS specs (SIF ↔ Ed-Fi being the big one) that hold
		// by composition through a shared hub, plus the hub's CEDS anchor
		// itself. Each row carries the `hub` that carried the claim.
		//
		// IMPLIED — everything else: at least one leg is a similarity-derived
		// CLOSE / NARROW / RELATED_MATCH, so the pair is a hypothesis.
		//
		// The element's own specification is excluded from both.

		async lookupCrossSpec(element) {
			const empty = { authoritative: [], implied: [] };
			if (!element?.name || !element?.source) return empty;

			const nameKey = element.name.toLowerCase();
			const key = `${element.source}|${nameKey}`;
			if (this.mappingsCache[key]) return this.mappingsCache[key];

			this.mappingsLoading = true;
			this.mappingsError = '';

			// Identity is (standard, name). The same pair can be reachable over
			// several hubs; keep the strongest reading of it, so one verified
			// path is not buried by a weaker one elsewhere in the graph. Among
			// equally authoritative readings the higher-scoring one wins.
			const split = (rows) => {
				const best = new Map();
				for (const row of rows) {
					const k = `${row.standard}|${row.name}`;
					const prior = best.get(k);
					const better =
						!prior ||
						(row.authoritative && !prior.authoritative) ||
						(row.authoritative === prior.authoritative && row.score > prior.score);
					if (better) best.set(k, row);
				}
				// Highest score first — that is the ranking the UI presents.
				const sorted = [...best.values()].sort(
					(a, b) =>
						b.score - a.score ||
						a.standard.localeCompare(b.standard) ||
						a.name.localeCompare(b.name),
				);
				return {
					authoritative: sorted.filter((r) => r.authoritative),
					implied: sorted.filter((r) => !r.authoritative),
				};
			};

			try {
				const res = await axios.get('/api/dme-cross-spec-mappings', {
					params: { source: element.source, name: element.name },
					headers: this.authHeaders(),
				});
				const result = split(
					(Array.isArray(res.data) ? res.data : []).flatMap((row) =>
						(row?.matches || [])
							.filter((m) => m && m.name)
							.map((m) => ({
								standard: standardOf(m.source, m.labels),
								name: m.name,
								source: m.source || '',
								rel: m.rel || 'RELATED_MATCH',
								selfRel: m.selfRel || '',
								authoritative: isAuthoritativePair(m.selfRel, m.rel),
								description: m.description || '',
								sourceId: m.sourceId || '',
								hub: m.hub || '',
								...scoreRow({
									semantic: m.semantic,
									selfConfidence: m.selfConfidence,
									confidence: m.confidence,
									fromName: element.name,
									toName: m.name,
								}),
							})),
					),
				);

				this.graphSource = 'live';
				this.mappingsCache = { ...this.mappingsCache, [key]: result };
				return result;
			} catch (_liveErr) {
				try {
					const snapshot = await loadSnapshot();
					const { hubsByMember } = snapshotIndex(snapshot);
					const result = split(
						(hubsByMember.get(key) || []).flatMap(({ hub, members }) => {
							// The element's own edge to this hub sets the ceiling on
							// every correspondence drawn through it.
							const self = members.find(
								(m) =>
									m.source === element.source &&
									String(m.name).toLowerCase() === nameKey,
							);
							return members
								.filter((m) => m.name && m.source !== element.source && m.rel)
								.map((m) => ({
									standard: standardOf(m.source),
									name: m.name,
									source: m.source,
									rel: m.rel,
									selfRel: self?.rel || '',
									authoritative: isAuthoritativePair(self?.rel, m.rel),
									description: m.desc || '',
									sourceId: m.id || '',
									hub: hub || '',
									// The snapshot carries no edge confidence, so every
									// snapshot row scores on name similarity.
									...scoreRow({
										fromName: element.name,
										toName: m.name,
										fromDescription: element.description || '',
										toDescription: m.desc || '',
									}),
								}));
						}),
					);

					this.graphSource = 'snapshot';
					this.snapshotDate = snapshot.generated || '';
					this.mappingsCache = { ...this.mappingsCache, [key]: result };
					return result;
				} catch (err) {
					this.mappingsError = err.message || 'Cross-spec mapping lookup failed.';
					return empty;
				}
			} finally {
				this.mappingsLoading = false;
			}
		},

		// ------------------------------------------------------------
		// Manual match search. Ranks elements of `target` (or of every other
		// specification when target is '') by SEMANTIC similarity to `element`,
		// using the embeddings the graph already carries — the anchor is the
		// selected element's own vector, so no embedding API is involved. `q`
		// narrows candidates lexically before ranking. This is how a user picks
		// a mapping where the graph has no implied one.
		//
		// Offline the snapshot has no vectors, so the fallback is a lexical
		// match over the target spec's snapshot elements, and the rows say so
		// (scoreBasis 'similarity' instead of 'semantic').

		async searchSpecElements({ element, target = '', q = '', kinds = 'property,class', limit = 25 } = {}) {
			if (!element?.source || !element?.name) return { rows: [], basis: '' };

			try {
				const res = await axios.get('/api/dme-semantic-search', {
					params: {
						source: element.source,
						path: element.path || '',
						name: element.name,
						target,
						q,
						kinds,
						limit,
					},
					headers: this.authHeaders(),
				});
				const seen = new Set();
				const rows = (Array.isArray(res.data) ? res.data : [])
					.filter((r) => r && r.name)
					.filter((r) => {
						// the same element can be forged twice (SIF); show it once
						const key = `${r.source}|${r.path || r.name}`;
						if (seen.has(key)) return false;
						seen.add(key);
						return true;
					})
					.map((r) => ({
						name: r.name,
						source: r.source,
						standard: standardOf(r.source, r.labels),
						path: r.path || '',
						description: r.description || '',
						sourceId: r.sourceId || '',
						kind: r.kind || 'property',
						score: r.score || 0,
						scoreBasis: 'semantic',
					}));
				this.graphSource = 'live';
				return { rows, basis: 'semantic' };
			} catch (_liveErr) {
				const snapshot = await loadSnapshot();
				const { bySource } = snapshotIndex(snapshot);
				const tokens = matchTokens(q || element.name);
				if (!tokens.length) return { rows: [], basis: 'similarity' };
				const wantedKinds = new Set(String(kinds).split(',').map((k) => k.trim()).filter(Boolean));
				const sources = target ? [target] : [...bySource.keys()].filter((s) => s !== element.source);
				const rows = [];
				for (const source of sources) {
					if (source === element.source) continue;
					for (const el of bySource.get(source)?.values() || []) {
						if (wantedKinds.size && !wantedKinds.has(el.kind)) continue;
						const score = Math.max(matchScore(tokens, el.name), matchScore(tokens, el.path || '') * 0.8);
						if (score <= 0) continue;
						rows.push({ ...el, score: Math.round(score * 1000) / 1000, scoreBasis: 'similarity' });
					}
				}
				rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
				this.graphSource = 'snapshot';
				this.snapshotDate = snapshot.generated || '';
				return { rows: rows.slice(0, limit), basis: 'similarity' };
			}
		},

		// Switch the browsed specification: clears the element list so a stale
		// spec's elements never show under a new spec's heading.
		selectSpec(spec) {
			this.selectedSpec = spec || null;
			this.elements = [];
			this.elementsTruncated = false;
			this.elementsError = '';
		},

		// ------------------------------------------------------------
		// User-curated equivalence crosswalk. An item is
		// { standard, name, sourceId?, rel?, detail?, transform? } — identity is
		// (standard, name), so re-adding the same suggestion is a no-op.
		//
		// `source` ({ standard, name, sourceId }) describes the element being
		// mapped FROM; it is recorded on the item so exports read as complete
		// source → target rows rather than opaque keys.

		addUserEquivalent(key, item, source = null) {
			if (!key || !item?.name) return null;
			const list = this.userEquivalents[key] || [];
			const existing = list.find((e) => sameMapping(e, item));
			if (existing) return existing;
			const entry = {
				...item,
				sourceStandard: source?.standard || item.sourceStandard || '',
				sourceName: source?.name || item.sourceName || '',
				sourceElementId: source?.sourceId || item.sourceElementId || '',
				sourcePath: source?.path || item.sourcePath || '',
				targetPath: item.targetPath || item.path || '',
				transform: normalizeTransform(item.transform),
			};
			this.userEquivalents = { ...this.userEquivalents, [key]: [...list, entry] };
			persistUserEquivalents(this.userEquivalents);
			this.pushMappingToServer(key, entry);
			return entry;
		},

		removeUserEquivalent(key, item) {
			const list = this.userEquivalents[key] || [];
			const removed = list.find((e) => sameMapping(e, item));
			const next = list.filter((e) => !sameMapping(e, item));
			this.userEquivalents = { ...this.userEquivalents, [key]: next };
			if (!next.length) delete this.userEquivalents[key];
			persistUserEquivalents(this.userEquivalents);
			if (removed) this.deleteMappingOnServer(key, removed);
		},

		hasUserEquivalent(key, item) {
			return (this.userEquivalents[key] || []).some((e) => sameMapping(e, item));
		},

		getUserEquivalent(key, item) {
			return (this.userEquivalents[key] || []).find((e) => sameMapping(e, item)) || null;
		},

		// Attach / replace the transformation rule on an accepted mapping. The
		// mapping must already exist — rules describe a mapping, they don't create
		// one — so the UI adds first, then opens the rule editor.
		setUserEquivalentTransform(key, item, transform) {
			const list = this.userEquivalents[key] || [];
			const idx = list.findIndex((e) => sameMapping(e, item));
			if (idx < 0) return null;
			const updated = { ...list[idx], transform: normalizeTransform(transform) };
			const next = [...list];
			next[idx] = updated;
			this.userEquivalents = { ...this.userEquivalents, [key]: next };
			persistUserEquivalents(this.userEquivalents);
			this.pushMappingToServer(key, updated);
			return updated;
		},

		// ------------------------------------------------------------
		// Server persistence (dme_user_mappings). Every call is a no-op when the
		// user is not logged in, and a failure never blocks the local edit — the
		// browser copy stays authoritative for the session and the badge says so.

		async pushMappingToServer(key, item) {
			const headers = authHeaders();
			if (!headers) {
				this.mappingsPersistence = 'local';
				return;
			}
			try {
				const res = await axios.post(
					'/api/dmeUserMappingSave',
					{ mappings: [itemToRow(key, item)] },
					{ headers },
				);
				const row = (Array.isArray(res.data) ? res.data : [])[0];
				if (row?.refId) this._attachServerRow(key, row);
				this.mappingsPersistence = 'server';
				this.mappingsSyncError = '';
			} catch (err) {
				this.mappingsPersistence = 'local';
				this.mappingsSyncError = err.response?.data || err.message || 'Could not save mapping to your account.';
			}
		},

		async deleteMappingOnServer(key, item) {
			const headers = authHeaders();
			if (!headers) return;
			try {
				const params = item.refId
					? { refId: item.refId }
					: { mappingKey: key, targetStandard: item.standard, targetName: item.name };
				await axios.delete('/api/dmeUserMappingDelete', { params, headers });
				this.mappingsSyncError = '';
			} catch (err) {
				this.mappingsSyncError = err.response?.data || err.message || 'Could not remove mapping from your account.';
			}
		},

		// Pull the user's saved mappings and merge: server rows win (they carry
		// refIds and timestamps); anything that exists only in this browser is
		// pushed up so the account becomes the complete record.
		async syncMappingsFromServer() {
			const headers = authHeaders();
			if (!headers) {
				this.mappingsPersistence = 'local';
				return false;
			}
			this.mappingsSyncing = true;
			this.mappingsSyncError = '';
			try {
				const res = await axios.get('/api/dmeUserMappingList', { headers });
				const rows = Array.isArray(res.data) ? res.data : [];

				const merged = {};
				for (const row of rows) {
					if (!row?.mappingKey || !row?.targetName) continue;
					(merged[row.mappingKey] ||= []).push(rowToItem(row));
				}

				const localOnly = [];
				for (const [key, list] of Object.entries(this.userEquivalents)) {
					for (const item of list) {
						if ((merged[key] || []).some((e) => sameMapping(e, item))) continue;
						(merged[key] ||= []).push({ ...item, transform: normalizeTransform(item.transform) });
						localOnly.push(itemToRow(key, item));
					}
				}

				this.userEquivalents = merged;
				persistUserEquivalents(this.userEquivalents);

				if (localOnly.length) {
					const pushed = await axios.post('/api/dmeUserMappingSave', { mappings: localOnly }, { headers });
					for (const row of Array.isArray(pushed.data) ? pushed.data : []) {
						if (row?.refId) this._attachServerRow(row.mappingKey, row);
					}
				}

				this.mappingsPersistence = 'server';
				this.loadCommunityMappings();
				return true;
			} catch (err) {
				this.mappingsPersistence = 'local';
				this.mappingsSyncError = err.response?.data || err.message || 'Could not load saved mappings from your account.';
				return false;
			} finally {
				this.mappingsSyncing = false;
			}
		},

		// ------------------------------------------------------------
		// Everyone's proposals. Any logged-in user may read them; the rows say
		// who proposed each and whether it is the caller's own.

		async loadCommunityMappings({ status = '' } = {}) {
			const headers = authHeaders();
			if (!headers) {
				this.communityMappings = [];
				return [];
			}
			this.communityLoading = true;
			this.communityError = '';
			try {
				const res = await axios.get('/api/dmeUserMappingList', {
					params: { scope: 'all', ...(status ? { status } : {}) },
					headers,
				});
				this.communityMappings = (Array.isArray(res.data) ? res.data : [])
					.filter((r) => r?.mappingKey && r?.targetName)
					.map(rowToFlat);
				return this.communityMappings;
			} catch (err) {
				this.communityError = err.response?.data || err.message || 'Could not load shared mappings.';
				return [];
			} finally {
				this.communityLoading = false;
			}
		},

		// Admin: accept / reject / reopen a proposal. Updates the shared list in
		// place and, if the row is the caller's own, its curated item too.
		async reviewMapping(refId, status, note = '') {
			const headers = authHeaders();
			if (!headers) return null;
			const res = await axios.post('/api/dmeUserMappingReview', { refId, status, note }, { headers });
			const row = (Array.isArray(res.data) ? res.data : [])[0];
			if (!row?.refId) return null;
			const flat = rowToFlat(row);
			this.communityMappings = this.communityMappings.map((r) => (r.refId === refId ? flat : r));
			for (const [key, list] of Object.entries(this.userEquivalents)) {
				const idx = list.findIndex((e) => e.refId === refId);
				if (idx < 0) continue;
				const next = [...list];
				next[idx] = { ...next[idx], status: flat.status, reviewedByName: flat.reviewedByName, reviewNote: flat.reviewNote };
				this.userEquivalents = { ...this.userEquivalents, [key]: next };
				persistUserEquivalents(this.userEquivalents);
			}
			return flat;
		},

		// Admin: server-rendered export of everyone's mappings (json | csv |
		// cypher), filtered by status. Returns { filename, mimeType, content }.
		async exportCommunityMappings({ format = 'json', status = 'accepted' } = {}) {
			const headers = authHeaders();
			if (!headers) throw new Error('Log in as an admin to export shared mappings.');
			const res = await axios.get('/api/dmeUserMappingExport', {
				params: { format, status },
				headers,
				responseType: 'text',
				transformResponse: [(d) => d],
			});
			const disposition = res.headers?.['content-disposition'] || '';
			const match = disposition.match(/filename="([^"]+)"/);
			const ext = format === 'cypher' ? 'cypher' : format;
			return {
				filename: match ? match[1] : `educore-user-mappings-${status}.${ext}`,
				mimeType: (res.headers?.['content-type'] || 'text/plain').split(';')[0],
				content: typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2),
				count: Number(res.headers?.['x-mapping-count'] || 0),
			};
		},

		_attachServerRow(key, row) {
			const list = this.userEquivalents[key] || [];
			const idx = list.findIndex((e) => e.standard === row.targetStandard && e.name === row.targetName);
			if (idx < 0) return;
			const next = [...list];
			next[idx] = { ...next[idx], refId: row.refId, createdAt: row.createdAt, updatedAt: row.updatedAt };
			this.userEquivalents = { ...this.userEquivalents, [key]: next };
			persistUserEquivalents(this.userEquivalents);
		},

		// ------------------------------------------------------------
		// Export every saved mapping. Returns { filename, mimeType, content }; the
		// caller turns it into a download.

		exportMappings(format = 'json') {
			const rows = this.allMappings;
			const stamp = new Date().toISOString().slice(0, 10);
			if (format === 'csv') {
				return {
					filename: `educore-mappings-${stamp}.csv`,
					mimeType: 'text/csv',
					content: toCsv(rows),
				};
			}
			return {
				filename: `educore-mappings-${stamp}.json`,
				mimeType: 'application/json',
				content: JSON.stringify(
					{
						exportedAt: new Date().toISOString(),
						source: 'EDUcore Schema Verifier — curated crosswalk',
						persistence: this.mappingsPersistence || 'local',
						mappingCount: rows.length,
						mappings: rows,
					},
					null,
					2,
				),
			};
		},

		clearAllMappings() {
			const all = flattenEquivalents(this.userEquivalents);
			this.userEquivalents = {};
			persistUserEquivalents(this.userEquivalents);
			for (const row of all) {
				this.deleteMappingOnServer(row.mappingKey, {
					refId: row.refId,
					standard: row.targetStandard,
					name: row.targetName,
				});
			}
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
			const allTokens = matchTokens(term);
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

				const rows = keepTopHitTier(
					(Array.isArray(res.data) ? res.data : [])
						.filter((row) => row && row.name)
						.map((row) => ({
						standard: standardOf(row.source, row.labels),
						labels: row.labels,
						name: row.name,
						description: row.description,
						sourceId: row.sourceId,
						score: row.score || 0,
						related: (row.related || [])
							.filter((r) => r && r.name)
							.map((r) => ({
								standard: standardOf(r.source, r.labels),
								name: r.name,
								rel: r.rel,
								authoritative: r.rel === 'EXACT_MATCH',
							})),
					})),
				);

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
					const rows = keepTopHitTier(
						searchSnapshot(snapshot, tokens, allTokens, minHits),
					);
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
