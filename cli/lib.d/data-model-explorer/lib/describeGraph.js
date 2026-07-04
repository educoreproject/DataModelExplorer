'use strict';

// describeGraph.js — the Wave-B graph card (PLAN-inGraphSelfDocumentationEnrichment-070126.md §6;
// WORKORDER-inferenceAndSelfDoc-070226.md WAVE B item 5, CRIMSON gate 7). Reads the in-graph
// self-documentation the educoreForge finishers write at replay time — :GraphProvenance (enriched
// passport), :ManifestRecipe/:RecipeBlock (the recipe + lineage), :StandardDefinition (per-standard
// facts) — and renders a human graph card plus the structured JSON behind it.
//
// CONTRACT (CRIMSON gate 7, honored FROM BIRTH):
//   - READ-ONLY: the caller opens the session with defaultAccessMode READ (dataModelExplorerSearch.js
//     does; the standalone test harness does). This module runs no write clauses.
//   - PARAMETERIZED: every value position travels as a Cypher parameter ($param). There is no string
//     interpolation of data into query text anywhere in this module.
//   - HONEST DEGRADATION: a graph built before the self-doc finishers (no passport enrichment, no
//     recipe, no standard definitions) yields a card that SAYS what is absent — never an error, never
//     fabricated content.
//
// Style note: this file matches the data-model-explorer tool's own idiom (async/await + neo4j-driver),
// which the workorder names as legitimate for this module family.

const CARD_BLOCK_LIMIT = 200; // recipe display bound; overflow is REPORTED, never silent

const describeGraph = async (session, params = {}) => {
	const blockLimit = Number.isFinite(parseInt(params.limit)) ? parseInt(params.limit) : CARD_BLOCK_LIMIT;

	// 1) the passport (enriched by Wave B; may be pre-enrichment or absent on old graphs)
	const passportResult = await session.run(`
		MATCH (p:GraphProvenance)
		RETURN p { .graphName, .graphType, .owner, .status, .manifestKey, .builtBy,
			.replayEngineVersion, .serializerVersion, .embeddingModelVersion,
			.nodeCountAtBuild, .edgeCountAtBuild, .standardsIncluded, .provenanceTierComplete,
			.description, .standardsBreakdown, .classRangeModeled, .codesetMatching,
			.equivalenceLayer, .legacyEdgeCount, .legacyEdgesPresent,
			builtAt: toString(p.builtAt) } AS passport
		LIMIT 5
	`);
	const passports = passportResult.records.map((rec) => rec.get('passport'));

	// 2) the recipe + member blocks (via the passport's BUILT_FROM when present, else any build recipe)
	const recipeResult = await session.run(`
		OPTIONAL MATCH (:GraphProvenance)-[:BUILT_FROM]->(linked:ManifestRecipe)
		OPTIONAL MATCH (unlinked:ManifestRecipe { isBuildManifest: true })
		WITH coalesce(linked, unlinked) AS r
		WHERE r IS NOT NULL
		OPTIONAL MATCH (r)-[:HAS_BLOCK]->(b:RecipeBlock)
		WITH r, b ORDER BY b.blockType, b.subject, b.blockId
		RETURN r { .manifestKey, .label, .note, .basedOn, createdAt: toString(r.createdAt) } AS recipe,
			collect(b { .blockId, .blockType, .subject, .version, .producedBy, .purpose,
				createdAt: toString(b.createdAt) })[0..$blockLimit] AS blocks,
			count(b) AS blockTotal
		LIMIT 1
	`, { blockLimit: neo4jInt(blockLimit) });
	const recipeRow = recipeResult.records.length ? recipeResult.records[0] : null;
	const recipe = recipeRow ? recipeRow.get('recipe') : null;
	const blocks = recipeRow ? recipeRow.get('blocks') : [];
	const blockTotal = recipeRow ? toPlainNumber(recipeRow.get('blockTotal')) : 0;

	// 3) the ancestry chain (recipe lineage, in-graph)
	const ancestryResult = await session.run(`
		MATCH (r:ManifestRecipe { isBuildManifest: true })
		OPTIONAL MATCH path = (r)-[:BASED_ON*1..50]->(a:ManifestRecipe)
		WITH a ORDER BY length(path)
		RETURN collect(a.manifestKey) AS ancestorKeys
	`);
	const ancestorKeys = ancestryResult.records.length
		? ancestryResult.records[0].get('ancestorKeys')
		: [];

	// 4) the per-standard definitions
	const standardsResult = await session.run(`
		MATCH (d:StandardDefinition)
		RETURN d { .source, .displayName, .version, .versionSource, .sourceFormat, .sourceUrl,
			.description, .nodeCount, .propertyCount, .classCount, .optionSetCount, .optionValueCount,
			.exactMappedProperties, .closeMappedProperties, .mappingEdgeCount,
			.exactEdgeCount, .closeEdgeCount, .mappingDisposition,
			.subjectVersions, .objectVersions } AS standard
		ORDER BY d.source
	`);
	const standards = standardsResult.records.map((rec) => deepPlain(rec.get('standard')));

	const passport = passports.length === 1 ? deepPlain(passports[0]) : null;
	const structured = {
		passport,
		passportCount: passports.length,
		recipe: recipe ? deepPlain(recipe) : null,
		blocks: (blocks || []).map(deepPlain),
		blockTotal,
		blocksTruncated: blockTotal > (blocks || []).length,
		ancestry: ancestorKeys || [],
		standards,
		selfDocumentationPresent: !!(recipe || standards.length),
	};
	structured.card = renderCard(structured);
	return structured;
};

// ---- helpers ----

let neo4jDriverModule = null;
const neo4jInt = (n) => {
	if (!neo4jDriverModule) {
		neo4jDriverModule = require('neo4j-driver');
	}
	return neo4jDriverModule.int(n);
};

const toPlainNumber = (val) => {
	if (val === null || val === undefined) return 0;
	if (typeof val === 'number') return val;
	if (typeof val.toNumber === 'function') return val.toNumber();
	return Number(val);
};

const deepPlain = (val) => {
	if (val === null || val === undefined) return val;
	if (typeof val === 'object' && typeof val.toNumber === 'function') return val.toNumber();
	if (Array.isArray(val)) return val.map(deepPlain);
	if (typeof val === 'object') {
		const out = {};
		for (const key of Object.keys(val)) out[key] = deepPlain(val[key]);
		return out;
	}
	return val;
};

const flag = (v) => (v === true ? '✓' : v === false ? '✗' : '—');
const shortKey = (k) => (k ? `${k}`.slice(0, 8) : '(none)');

const renderCard = ({ passport, passportCount, recipe, blocks, blockTotal, blocksTruncated, ancestry, standards, selfDocumentationPresent }) => {
	const lines = [];
	if (!passport) {
		lines.push(
			passportCount === 0
				? 'Graph: (no GraphProvenance passport — this graph predates build passports)'
				: `Graph: AMBIGUOUS — ${passportCount} GraphProvenance passports found (expected exactly 1)`,
		);
	} else {
		lines.push(
			`Graph: ${passport.graphName} · built ${passport.builtAt || '(unrecorded)'} · engine ${passport.replayEngineVersion || '?'} · embeddings ${passport.embeddingModelVersion || '(none)'}`,
		);
		lines.push(
			`Status: ${passport.status || '?'} (${passport.graphType || '?'}) · ${passport.nodeCountAtBuild ?? '?'} nodes / ${passport.edgeCountAtBuild ?? '?'} edges · manifest ${shortKey(passport.manifestKey)}`,
		);
		if (passport.classRangeModeled !== undefined && passport.classRangeModeled !== null) {
			lines.push(
				`Capabilities: class-range ${flag(passport.classRangeModeled)} · codeset-matching ${flag(passport.codesetMatching)} · equivalence ${flag(passport.equivalenceLayer)} · legacy edges ${passport.legacyEdgeCount ?? '—'}`,
			);
		} else {
			lines.push('Capabilities: (passport predates Wave-B enrichment — no capability flags recorded)');
		}
		if (passport.description) {
			lines.push(`Description: ${passport.description}`);
		}
	}

	if (standards.length) {
		lines.push(`Standards (${standards.length}):`);
		standards.forEach((oneStd) => {
			const version = oneStd.version
				? `v${oneStd.version} (${oneStd.versionSource || 'unstated'})`
				: 'version unrecorded';
			lines.push(
				`  ${oneStd.source.padEnd(14)} ${version.padEnd(28)} ${String(oneStd.propertyCount ?? '?').padStart(6)} properties · ` +
					`${oneStd.mappingDisposition || '?'} · EXACT ${oneStd.exactEdgeCount ?? 0} / CLOSE ${oneStd.closeEdgeCount ?? 0}`,
			);
		});
	} else {
		lines.push('Standards: (no StandardDefinition self-documentation on this graph)');
	}

	if (recipe) {
		lines.push(
			`Recipe: ${recipe.label || '(unlabeled)'} · key ${shortKey(recipe.manifestKey)} · ${blockTotal} block(s)${blocksTruncated ? ` (showing ${blocks.length})` : ''}:`,
		);
		blocks.forEach((oneBlock) => {
			lines.push(
				`  ${String(oneBlock.subject || '?').padEnd(14)} ${String(oneBlock.blockType || '?').padEnd(16)} ` +
					`${(oneBlock.version ? `v${oneBlock.version}` : 'v?').padEnd(12)} ${shortKey(oneBlock.blockId)} — ${oneBlock.purpose || ''}`,
			);
		});
		lines.push(
			ancestry.length
				? `Ancestry: ${shortKey(recipe.manifestKey)} ← ${ancestry.map(shortKey).join(' ← ')}`
				: 'Ancestry: (root manifest — no recorded parent)',
		);
	} else {
		lines.push('Recipe: (no ManifestRecipe self-documentation on this graph — rebuild with the Wave-B finishers to materialize it)');
	}

	if (!selfDocumentationPresent) {
		lines.push('NOTE: this graph carries no Wave-B self-documentation; the card above is passport-only.');
	}
	return lines.join('\n');
};

module.exports = { describeGraph };
