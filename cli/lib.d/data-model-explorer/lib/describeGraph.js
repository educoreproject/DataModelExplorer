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
// Control flow (lane S, 2026-10-05): the four reads run as a qtools taskList and the module answers through
// callback(err, result), TQ's CLI standard. It was async/await until then; the queries and the card are unchanged.

const { pipeRunner, taskListPlus, mergeArgs } = new (require('qtools-asynchronous-pipe-plus'))();
const { runCypherQuery } = require('./runCypherQuery');
const { refusalFor } = require('./toolPayloadContract');

const CARD_BLOCK_LIMIT = 200; // recipe display bound; overflow is REPORTED, never silent

// 1) the passport (enriched by Wave B; may be pre-enrichment or absent on old graphs)
const PASSPORT_CYPHER = `
		MATCH (p:GraphProvenance)
		RETURN p { .graphName, .graphType, .owner, .status, .manifestKey, .builtBy,
			.replayEngineVersion, .serializerVersion, .embeddingModelVersion,
			.nodeCountAtBuild, .edgeCountAtBuild, .standardsIncluded, .provenanceTierComplete,
			.description, .standardsBreakdown, .classRangeModeled, .codesetMatching,
			.equivalenceLayer, .legacyEdgeCount, .legacyEdgesPresent,
			builtAt: toString(p.builtAt) } AS passport
		LIMIT 5
	`;

// 2) the recipe + member blocks (via the passport's BUILT_FROM when present, else any build recipe)
const RECIPE_CYPHER = `
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
	`;

// 3) the ancestry chain (recipe lineage, in-graph)
const ANCESTRY_CYPHER = `
		MATCH (r:ManifestRecipe { isBuildManifest: true })
		OPTIONAL MATCH path = (r)-[:BASED_ON*1..50]->(a:ManifestRecipe)
		WITH a ORDER BY length(path)
		RETURN collect(a.manifestKey) AS ancestorKeys
	`;

// 4) the per-standard definitions — W-D-15 (campaign P1): read by CONTRACTS §5 STANDARD_DEFINITION_FIELD_LIST verbatim,
// from the graphContract.json educoreForge emits, with no coalesce and no reader-only names. (Until 2026-10-06 this read
// coalesced the July vintage's source/displayName into the Sept one, so the card printed the forge token
// pesccollegetranscript1v8v0 where every filter takes PESC-CollegeTranscript-1.8.0.) A definition lacking a required
// field is refused by name, never shown with blanks.
const STANDARD_DEFINITION_FIELD_LIST = require('../contract/graphContract.json').standardDefinitionFieldList;
const CYPHER_PROPERTY_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
STANDARD_DEFINITION_FIELD_LIST.forEach((oneField) => {
	if (!CYPHER_PROPERTY_NAME_PATTERN.test(oneField.name)) {
		throw new Error(`describeGraph: graphContract.json standardDefinitionFieldList holds '${oneField.name}', not a plain property name`);
	}
});
const STANDARD_DEFINITION_CYPHER = `
		MATCH (d:StandardDefinition)
		RETURN d { ${STANDARD_DEFINITION_FIELD_LIST.map((oneField) => `.${oneField.name}`).join(', ')} } AS standard, d.stableId AS definitionStableId
		ORDER BY d.sourceKey
	`;
const REQUIRED_STANDARD_DEFINITION_FIELD_NAME_LIST = STANDARD_DEFINITION_FIELD_LIST.filter((oneField) => oneField.required).map((oneField) => oneField.name);

const describeGraph = (session, params, callback) => {
	const blockLimit = Number.isFinite(parseInt(params.limit)) ? parseInt(params.limit) : CARD_BLOCK_LIMIT;

	const taskList = new taskListPlus();
	taskList.push((args, next) => runCypherQuery(session, PASSPORT_CYPHER, {}, mergeArgs(args, next, 'passportResult')));
	taskList.push((args, next) => runCypherQuery(session, RECIPE_CYPHER, { blockLimit: neo4jInt(blockLimit) }, mergeArgs(args, next, 'recipeResult')));
	taskList.push((args, next) => runCypherQuery(session, ANCESTRY_CYPHER, {}, mergeArgs(args, next, 'ancestryResult')));
	taskList.push((args, next) => runCypherQuery(session, STANDARD_DEFINITION_CYPHER, {}, mergeArgs(args, next, 'standardsResult')));

	pipeRunner(taskList.getList(), {}, (err, args) => {
		if (err) {
			callback(err);
			return;
		}
		const { passportResult, recipeResult, ancestryResult, standardsResult } = args;
		const passports = passportResult.records.map((rec) => rec.get('passport'));

		const recipeRow = recipeResult.records.length ? recipeResult.records[0] : null;
		const recipe = recipeRow ? recipeRow.get('recipe') : null;
		const blocks = recipeRow ? recipeRow.get('blocks') : [];
		const blockTotal = recipeRow ? toPlainNumber(recipeRow.get('blockTotal')) : 0;

		const ancestorKeys = ancestryResult.records.length
			? ancestryResult.records[0].get('ancestorKeys')
			: [];

		const standards = standardsResult.records.map((rec) => deepPlain(rec.get('standard')));
		const shapeMismatchText = standardsResult.records.map((rec) => {
			const missingFieldNameList = REQUIRED_STANDARD_DEFINITION_FIELD_NAME_LIST.filter((fieldName) => rec.get('standard')[fieldName] === null || rec.get('standard')[fieldName] === undefined);
			return missingFieldNameList.length ? `StandardDefinition ${rec.get('definitionStableId')} lacks ${missingFieldNameList.join(', ')}` : '';
		}).filter(Boolean).join('; ');
		if (shapeMismatchText) {
			callback('', refusalFor('describeGraph', 'standardDefinitionShapeNotRecognised', `${shapeMismatchText} (CONTRACTS §5 requires them).`));
			return;
		}

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
		callback('', structured);
	});
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

	// mappingKindList / mappingSourceList are §5-required (the distinct values on the standard's own match edges; empty for
	// the hub). The loader stores a ONE-value list as a plain string (its pgToStored rule, W-A-1 fixes it in P2) and keeps
	// empty lists as lists, so each is read in either form (lane P, 2026-10-04).
	const asValueList = (storedValue) => (Array.isArray(storedValue) ? storedValue : [storedValue]);
	const describeStandardMappings = (oneStd) =>
		`mapping kinds: ${asValueList(oneStd.mappingKindList).join(', ') || 'none'} · sources: ${asValueList(oneStd.mappingSourceList).join(', ') || 'none'}`;

	if (standards.length) {
		lines.push(`Standards (${standards.length}):`);
		standards.forEach((oneStd) => {
			const version = oneStd.version
				? `v${oneStd.version} (${oneStd.versionSource || 'unstated'})`
				: 'version unrecorded';
			// sourceKey first (the `_source` every filter takes, padded to the longest live value), the forge token after it
			lines.push(
				`  ${String(oneStd.sourceKey).padEnd(31)} (${oneStd.standardKey}) ${version.padEnd(28)} ${String(oneStd.propertyCount).padStart(6)} properties · ` +
					describeStandardMappings(oneStd),
			);
			// standardKind and standardUsageTips (lane Q, 2026-10-04): askMilo is told to read a standard's
			// card before answering about it; a card without them says so rather than leaving a blank.
			lines.push(`    kind: ${oneStd.standardKind || 'unrecorded'} · usage tips: ${oneStd.standardUsageTips ? oneStd.standardUsageTips : 'none'}`);
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
