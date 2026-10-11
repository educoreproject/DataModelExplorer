'use strict';

// describeGraph.js — the graph card (PLAN-inGraphSelfDocumentationEnrichment-070126.md §6; rewritten for campaign P2,
// 2026-10-06: V2-C01 passport, V2-C02 attestations, V2-C03 recipe and lineage, W-D-15 standards). Reads the in-graph
// self-documentation the educoreForge finishers write — :GraphProvenance (the passport), :ManifestRecipe / :RecipeBlock,
// :StandardDefinition, :BuildAttestation — and renders a human card plus the structured JSON behind it.
//
// EVERY SECTION IS READ BY CONTRACT (contract/graphContract.json, the bytes educoreForge emits; see lib/graphContract.js):
//   - the passport through passportReader, which refuses a graph whose contract sha is not this reader's, a missing
//     required field, or a field not of its declared type — so this card never prints '?', '(none)' or 'predates';
//   - the recipe through the passport's BUILT_FROM edge ONLY (the old isBuildManifest alternative is gone: one door), its
//     blocks and the recipe itself checked against §5's required fields;
//   - the lineage from the recipe's own basedOnManifestRefId (+ basedOnManifestRefIdBasis) and its BASED_ON chain — a null
//     is printed as "none recorded", NEVER as "root manifest";
//   - the standards by §5 verbatim (every stringList field must arrive as a list: the loader keeps declared lists as lists
//     since P2's W-A-1, so the old one-value re-widening is gone);
//   - the attestations through (:GraphProvenance)-[:ATTESTS]->(:BuildAttestation), each checked against §4's common fields;
//   - ⟪G21⟫ the round trip's OMISSION DECLARATION from the roundTrip row's explicitOmissionDeclarationList (§4): one line per
//     standard naming what it omitted by kind, the rule that declares it and the rule's caveat, under its own heading — a
//     measured roundTrip row without the list is refused by name; a notRun row says it declared nothing.
// A shape the contract does not admit is REFUSED BY NAME (refusalFor), never shown with blanks.
//
// CONTRACT (CRIMSON gate 7): READ-ONLY (the caller's session is READ) and PARAMETERIZED (no data interpolated into Cypher;
// the standards projection is generated from contract field names, each checked against a plain-name pattern at load).
//
// Control flow: a qtools taskList; callback(err, result), TQ's CLI standard.

const { pipeRunner, taskListPlus, mergeArgs } = new (require('qtools-asynchronous-pipe-plus'))();
const { runCypherQuery } = require('./runCypherQuery');
const { refusalFor } = require('./toolPayloadContract');
const { contract, readerSha256 } = require('./graphContract');
const { readPassport } = require('./passportReader');

const CARD_BLOCK_LIMIT = 200; // recipe display bound; overflow is REPORTED, never silent

// the recipe and its member blocks, through BUILT_FROM only
const RECIPE_CYPHER = `
		MATCH (:GraphProvenance)-[:BUILT_FROM]->(r:ManifestRecipe)
		OPTIONAL MATCH (r)-[:HAS_BLOCK]->(b:RecipeBlock)
		WITH r, b ORDER BY b.position, b.subject
		RETURN properties(r) AS recipe, collect(properties(b))[0..$blockLimit] AS blocks, count(b) AS blockTotal
		LIMIT 1
	`;
// the lineage chain from the recipe this graph was built from
const ANCESTRY_CYPHER = `
		MATCH (:GraphProvenance)-[:BUILT_FROM]->(r:ManifestRecipe)
		OPTIONAL MATCH ancestryPath = (r)-[:BASED_ON*1..50]->(a:ManifestRecipe)
		WITH a, ancestryPath ORDER BY length(ancestryPath)
		RETURN collect(a.manifestRefId) AS ancestorManifestRefIdList
	`;
// the per-standard definitions — W-D-15: §5's field list verbatim, generated from the contract file
const STANDARD_DEFINITION_FIELD_LIST = contract.standardDefinitionFieldList;
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
// the build attestations (V2-C02)
const ATTESTATION_CYPHER = `
		MATCH (:GraphProvenance)-[:ATTESTS]->(a:BuildAttestation)
		RETURN properties(a) AS attestation, labels(a) AS labelList
		ORDER BY a.gate
	`;

const requiredNameListOf = (fieldList) => fieldList.filter((oneField) => oneField.required).map((oneField) => oneField.name);
const ATTESTATION_COMMON_FIELD_NAME_LIST = contract.attestationFieldList.filter((oneField) => oneField.channel === 'all').map((oneField) => oneField.name);
// ⟪G21⟫ the omission declaration: the §4 field, read by name, and refused at load if the contract does not declare it as a
// gate's stringList — and every stringList attestation field is one this card renders as its own section (none dropped)
const OMISSION_DECLARATION_FIELD = contract.attestationFieldList.find((oneField) => oneField.name === 'explicitOmissionDeclarationList');
if (!OMISSION_DECLARATION_FIELD || OMISSION_DECLARATION_FIELD.type !== 'stringList' || !Array.isArray(OMISSION_DECLARATION_FIELD.gateList)) {
	throw new Error('describeGraph: graphContract.json does not declare explicitOmissionDeclarationList as a gate\'s stringList attestation field (§4, G21) — this reader renders it');
}
const OMISSION_DECLARATION_HEADING = 'Omission declaration (round trip)';
const unrenderedListFieldList = contract.attestationFieldList.filter((oneField) => oneField.type === 'stringList' && oneField !== OMISSION_DECLARATION_FIELD);
if (unrenderedListFieldList.length) {
	throw new Error(`describeGraph: graphContract.json declares attestation list field(s) ${unrenderedListFieldList.map((oneField) => oneField.name).join(', ')} that this card does not render`);
}

// shapeFaultTextFor — the required names a stored map lacks, and the stringList fields that did not arrive as lists
const shapeFaultTextFor = ({ storedMap, fieldList, requiredNameList, label }) => {
	const missingNameList = requiredNameList.filter((fieldName) => storedMap[fieldName] === null || storedMap[fieldName] === undefined);
	const nonListNameList = fieldList.filter((oneField) => oneField.type === 'stringList' && storedMap[oneField.name] !== null && storedMap[oneField.name] !== undefined && !Array.isArray(storedMap[oneField.name])).map((oneField) => oneField.name);
	return []
		.concat(missingNameList.length ? [`${label} lacks ${missingNameList.join(', ')}`] : [])
		.concat(nonListNameList.length ? [`${label} carries ${nonListNameList.join(', ')} as a scalar, declared stringList (a graph replayed before P2's W-A-1)`] : [])
		.join('; ');
};

const describeGraph = (session, params, callback) => {
	const blockLimit = Number.isFinite(parseInt(params.limit)) ? parseInt(params.limit) : CARD_BLOCK_LIMIT;

	const taskList = new taskListPlus();
	taskList.push((args, next) => readPassport({ session, verbName: 'describeGraph' }, mergeArgs(args, next, 'passportRead')));
	taskList.push((args, next) => runCypherQuery(session, RECIPE_CYPHER, { blockLimit: neo4jInt(blockLimit) }, mergeArgs(args, next, 'recipeResult')));
	taskList.push((args, next) => runCypherQuery(session, ANCESTRY_CYPHER, {}, mergeArgs(args, next, 'ancestryResult')));
	taskList.push((args, next) => runCypherQuery(session, STANDARD_DEFINITION_CYPHER, {}, mergeArgs(args, next, 'standardsResult')));
	taskList.push((args, next) => runCypherQuery(session, ATTESTATION_CYPHER, {}, mergeArgs(args, next, 'attestationResult')));

	pipeRunner(taskList.getList(), {}, (err, args) => {
		if (err) {
			callback(err);
			return;
		}
		const { passportRead, recipeResult, ancestryResult, standardsResult, attestationResult } = args;
		if (passportRead.refusal) {
			callback('', passportRead.refusal);
			return;
		}
		const passport = passportRead.passport;

		// the recipe and its blocks, by §5
		const recipeRow = recipeResult.records.length ? recipeResult.records[0] : null;
		const recipe = recipeRow ? deepPlain(recipeRow.get('recipe')) : null;
		const blocks = recipeRow ? deepPlain(recipeRow.get('blocks')) : [];
		const blockTotal = recipeRow ? toPlainNumber(recipeRow.get('blockTotal')) : 0;
		const recipeFaultText = []
			.concat(recipe ? [shapeFaultTextFor({ storedMap: recipe, fieldList: contract.manifestRecipeFieldList, requiredNameList: requiredNameListOf(contract.manifestRecipeFieldList), label: 'ManifestRecipe' })] : [])
			.concat(blocks.map((oneBlock) => shapeFaultTextFor({ storedMap: oneBlock, fieldList: contract.recipeBlockFieldList, requiredNameList: requiredNameListOf(contract.recipeBlockFieldList), label: `RecipeBlock ${oneBlock.stableId}` })))
			.filter(Boolean)
			.join('; ');
		if (recipeFaultText) {
			callback('', refusalFor('describeGraph', 'recipeShapeNotRecognised', `${recipeFaultText} (CONTRACTS §5).`));
			return;
		}
		const ancestorManifestRefIdList = ancestryResult.records.length ? ancestryResult.records[0].get('ancestorManifestRefIdList') : [];

		// the standards, by §5
		const standards = standardsResult.records.map((oneRecord) => deepPlain(oneRecord.get('standard')));
		const standardFaultText = standardsResult.records
			.map((oneRecord, recordIndex) => shapeFaultTextFor({ storedMap: standards[recordIndex], fieldList: STANDARD_DEFINITION_FIELD_LIST, requiredNameList: requiredNameListOf(STANDARD_DEFINITION_FIELD_LIST), label: `StandardDefinition ${oneRecord.get('definitionStableId')}` }))
			.filter(Boolean)
			.join('; ');
		if (standardFaultText) {
			callback('', refusalFor('describeGraph', 'standardDefinitionShapeNotRecognised', `${standardFaultText} (CONTRACTS §5 requires them).`));
			return;
		}

		// the attestations, by §4
		const attestations = attestationResult.records.map((oneRecord) => ({ ...deepPlain(oneRecord.get('attestation')), labelList: oneRecord.get('labelList') }));
		const attestationFaultText = attestations
			.map((oneAttestation) => {
				const missingNameList = ATTESTATION_COMMON_FIELD_NAME_LIST.filter((fieldName) => fieldName !== 'writtenOnChannelNote' && (oneAttestation[fieldName] === null || oneAttestation[fieldName] === undefined));
				const badVerdict = contract.buildAttestationVerdictList.indexOf(oneAttestation.verdict) === -1;
				const listFaultText = omissionListFaultTextFor(oneAttestation);
				return missingNameList.length || badVerdict || listFaultText
					? `BuildAttestation ${oneAttestation.gate || oneAttestation.stableId}${missingNameList.length ? ` lacks ${missingNameList.join(', ')}` : ''}${badVerdict ? ` has verdict ${JSON.stringify(oneAttestation.verdict)}` : ''}${listFaultText}`
					: '';
			})
			.filter(Boolean)
			.join('; ');
		if (attestationFaultText) {
			callback('', refusalFor('describeGraph', 'attestationShapeNotRecognised', `${attestationFaultText} (CONTRACTS §4).`));
			return;
		}

		const structured = {
			passport,
			readerContractSha256: readerSha256,
			recipe,
			blocks,
			blockTotal,
			blocksTruncated: blockTotal > blocks.length,
			lineage: { basedOnManifestRefId: recipe ? recipe.basedOnManifestRefId || null : null, basedOnManifestRefIdBasis: recipe ? recipe.basedOnManifestRefIdBasis || null : null, ancestorManifestRefIdList },
			standards,
			attestations,
		};
		structured.card = renderCard(structured);
		callback('', structured);
	});
};

// ---- helpers ----

let neo4jDriverModule = null;
const neo4jInt = (oneNumber) => {
	if (!neo4jDriverModule) {
		neo4jDriverModule = require('neo4j-driver');
	}
	return neo4jDriverModule.int(oneNumber);
};

const toPlainNumber = (storedValue) => {
	if (typeof storedValue === 'number') return storedValue;
	if (storedValue && typeof storedValue.toNumber === 'function') return storedValue.toNumber();
	return Number(storedValue);
};

const deepPlain = (storedValue) => {
	if (storedValue === null || storedValue === undefined) return storedValue;
	if (typeof storedValue === 'object' && typeof storedValue.toNumber === 'function') return storedValue.toNumber();
	if (Array.isArray(storedValue)) return storedValue.map(deepPlain);
	if (typeof storedValue === 'object') {
		return Object.keys(storedValue).reduce((plainObject, propertyName) => ({ ...plainObject, [propertyName]: deepPlain(storedValue[propertyName]) }), {});
	}
	return storedValue;
};

const shortText = (oneText, characterCount) => `${oneText}`.slice(0, characterCount);
const flag = (oneValue) => (oneValue === true ? '✓' : '✗');

// one line per declared attestation detail field the row carries (the contract decides which fields are details); a list
// field is a section of its own (the omission declaration), never squeezed into this line
const ATTESTATION_DETAIL_FIELD_LIST = contract.attestationFieldList.filter((oneField) => oneField.channel !== 'all' && oneField.type !== 'stringList');

// ⟪G21⟫ omissionListFaultTextFor — '' | the fault of a MEASURED row of a gate the field names that does not carry the list
const omissionListFaultTextFor = (oneAttestation) => {
	if (OMISSION_DECLARATION_FIELD.gateList.indexOf(oneAttestation.gate) === -1 || oneAttestation.verdict === 'notRun') return '';
	const declarationList = oneAttestation[OMISSION_DECLARATION_FIELD.name];
	return Array.isArray(declarationList) && declarationList.every((oneLine) => typeof oneLine === 'string')
		? ''
		: ` (verdict ${oneAttestation.verdict}) lacks ${OMISSION_DECLARATION_FIELD.name} as a list of strings (§4, G21: a measured round trip declares its omissions)`;
};
// ⟪G21⟫ omissionDeclarationLineListFor — the card section: the heading and one line per standard, verbatim from the row
const omissionDeclarationLineListFor = (attestations) => {
	const roundTripAttestation = attestations.find((oneAttestation) => OMISSION_DECLARATION_FIELD.gateList.indexOf(oneAttestation.gate) !== -1);
	if (!roundTripAttestation) {
		return [`${OMISSION_DECLARATION_HEADING}: none — the graph carries no ${OMISSION_DECLARATION_FIELD.gateList.join('/')} attestation`];
	}
	if (roundTripAttestation.verdict === 'notRun') {
		return [`${OMISSION_DECLARATION_HEADING}: none — the round trip did not run (${roundTripAttestation.verdict}), so it declared nothing`];
	}
	return [`${OMISSION_DECLARATION_HEADING}: omitted by declared rule, not lost`].concat(roundTripAttestation[OMISSION_DECLARATION_FIELD.name].map((oneLine) => `  ${oneLine}`));
};
const attestationDetailText = (oneAttestation) =>
	ATTESTATION_DETAIL_FIELD_LIST.filter((oneField) => oneAttestation[oneField.name] !== undefined && oneAttestation[oneField.name] !== null)
		.map((oneField) => `${oneField.name} ${oneField.name === 'evidenceSha256' ? shortText(oneAttestation[oneField.name], 12) : oneAttestation[oneField.name]}`)
		.join(', ');

const renderCard = ({ passport, readerContractSha256, recipe, blocks, blockTotal, blocksTruncated, lineage, standards, attestations }) => {
	const lines = [];
	const engineVersions = passport.engineVersions;
	lines.push(`Graph: ${passport.graphName} · scratch ${passport.scratchGraphName || 'not yet stamped'} · built ${passport.builtAt} · manifest ${shortText(passport.manifestRefId, 8)}`);
	lines.push(`Engines: replayManager ${engineVersions.replayManager} · replayEngine ${shortText(engineVersions.replayEngine, 12)} · serializer ${engineVersions.serializer} · forgeFramework ${shortText(engineVersions.forgeFramework, 12)} · bridgeFramework ${shortText(engineVersions.bridgeFramework, 12)}`);
	lines.push(`Embeddings: ${passport.embeddingBasis ? passport.embeddingBasis : `${passport.embeddingModelVersion} × ${passport.embeddingDims}`} · vector indexes ${passport.vectorIndexNameList.join(', ') || 'none'}`);
	lines.push(`Judges: ${passport.judgeIdentityList.join(', ') || 'none'} · renderers ${passport.rendererVersionList.join(', ') || 'none'}`);
	lines.push(`Content: ${passport.contentNodeCount} nodes · ${passport.contentEdgeCount} edges · ${passport.standardCount} standards (${passport.standardsIncluded.join(', ')})`);
	lines.push(`Meaning: ${passport.meaningBearingEdgeCount} meaning-bearing edges · trustworthy ${flag(passport.trustworthyForMeaning)} (${passport.trustBasis}) — ${passport.trustNote}`);
	lines.push(`  breakdown: ${passport.meaningTierBreakdown.map((oneRow) => `${oneRow.edgeType} ${oneRow.mappingKind || oneRow.provenanceTier}${oneRow.mappingSource ? ` ${oneRow.mappingSource}` : ''} ${oneRow.tierCount}`).join(' · ')}`);
	lines.push(`Recipe identity: ${passport.recipeName} · hash ${shortText(passport.recipeHash, 12)}`);
	lines.push(`Previous build: ${passport.previousManifestRefIdBasis}`);
	lines.push(`Framework: ${passport.frameworkFingerprint ? shortText(passport.frameworkFingerprint, 12) : passport.frameworkFingerprintBasis}`);
	lines.push(`Contract: graphContract ${shortText(passport.graphContractSha256, 12)} (reader ${shortText(readerContractSha256, 12)})`);

	if (standards.length) {
		lines.push(`Standards (${standards.length}):`);
		standards.forEach((oneStd) => {
			const versionText = `v${oneStd.version} (${oneStd.versionSource})${oneStd.versionDisagreement ? ` published ${oneStd.publishedVersion} — DISAGREES: ${oneStd.versionNote}` : ''}`;
			// sourceKey first (the `_source` every filter takes, padded to the longest live value), the forge token after it
			lines.push(
				`  ${String(oneStd.sourceKey).padEnd(31)} (${oneStd.standardKey}) ${versionText.padEnd(28)} ${String(oneStd.propertyCount).padStart(6)} properties · ` +
					`${oneStd.classCount} classes · ${oneStd.optionValueCount} values · exact ${oneStd.exactMappedProperties} · close ${oneStd.closeMappedProperties} · ` +
					`mapping kinds: ${oneStd.mappingKindList.join(', ') || 'none'} · sources: ${oneStd.mappingSourceList.join(', ') || 'none'} · edge types: ${oneStd.mappingEdgeTypes.join(', ') || 'none'}` +
					`${oneStd.standardFamily ? ` · family ${oneStd.standardFamily} release ${oneStd.releaseLabel}` : ''}`,
			);
			// standardKind and standardUsageTips (lane Q, 2026-10-04): askMilo is told to read a standard's card before answering
			lines.push(`    kind: ${oneStd.standardKind} · usage tips: ${oneStd.standardUsageTips}`);
			// descriptionSource (educoreForge lane FIX, Fix 3, 2026-10-09; TQ): where in the standard's source its description text comes from
			lines.push(`    description text from: ${oneStd.descriptionSource}`);
		});
	} else {
		lines.push('Standards: none — the graph carries no StandardDefinition');
	}

	if (recipe) {
		lines.push(`Recipe: ${recipe.name} (${recipe.recipeName}, ${recipe.recipeFileName}) · manifest ${shortText(recipe.manifestRefId, 8)} · hash ${shortText(recipe.recipeHash, 12)} · created ${recipe.createdAt} · ${blockTotal} block(s)${blocksTruncated ? ` (showing ${blocks.length})` : ''}`);
		blocks.forEach((oneBlock) => {
			lines.push(`  ${String(oneBlock.position).padStart(3)} ${String(oneBlock.subject).padEnd(48)} ${String(oneBlock.kind).padEnd(13)} v${oneBlock.version || 'absent'} ${shortText(oneBlock.schemaBlockRefId, 8)} — ${oneBlock.purpose} [${oneBlock.purposeSource}]`);
		});
		lines.push(`Lineage: basedOnManifestRefId ${lineage.basedOnManifestRefId ? shortText(lineage.basedOnManifestRefId, 8) : 'none recorded'}${lineage.basedOnManifestRefIdBasis ? ` (${lineage.basedOnManifestRefIdBasis})` : ''} · chain ${lineage.ancestorManifestRefIdList.length ? lineage.ancestorManifestRefIdList.map((oneRefId) => shortText(oneRefId, 8)).join(' ← ') : 'none'}`);
	} else {
		lines.push('Recipe: absent — the passport carries no BUILT_FROM edge');
	}

	if (attestations.length) {
		lines.push(`Attestations (${attestations.length}): ${attestations.map((oneAttestation) => `${oneAttestation.gate} ${oneAttestation.verdict}${oneAttestation.verdictSupplied === false ? ' (no verdict supplied by the producer)' : ''}${attestationDetailText(oneAttestation) ? ` (${attestationDetailText(oneAttestation)})` : ''}`).join(' · ')}`);
		const verdictCountByVerdict = attestations.reduce((soFar, oneAttestation) => ({ ...soFar, [oneAttestation.verdict]: (soFar[oneAttestation.verdict] || 0) + 1 }), {});
		lines.push(`Verdicts: ${contract.buildAttestationVerdictList.map((oneVerdict) => `${oneVerdict} ${verdictCountByVerdict[oneVerdict] || 0}`).join(' · ')}`);
		lines.push(...omissionDeclarationLineListFor(attestations));
	} else {
		lines.push('Attestations: none — the passport carries no ATTESTS edge');
	}
	return lines.join('\n');
};

module.exports = { describeGraph, renderCard, RECIPE_CYPHER, ANCESTRY_CYPHER, ATTESTATION_CYPHER, STANDARD_DEFINITION_CYPHER };
