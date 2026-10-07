#!/usr/bin/env node
'use strict';

// describe-graph-contract.test.js — the DME half of campaign P2 (V2-C01 passport, V2-C02 attestations, V2-C03 recipe and
// lineage, V2-C04 dme_history, V2-C28 the query embedder; W-D-15 in step). HERMETIC: a session double answers each read
// with a passport built FROM the contract file itself, so the gate cannot drift from the contract it tests.
//
// PROVES:
//   (a) a passport carrying every declared field renders a card with no '?', '(none)', 'predates', 'unrecorded' or
//       'root manifest' — model x width, vector indexes, judges, engines, attestations, lineage 'none recorded'
//   (b) a passport lacking embeddingDims is refused BY NAME (passportShapeNotRecognised, naming the field)
//   (c) a passport whose graphContractSha256 differs is refused (graphContractMismatch); an absent sha says the graph was
//       finished before the graph contract
//   (d) a StandardDefinition whose mappingKindList arrives as a scalar is refused (declared stringList)
//   (e) dme_history answers ONE passport row with contentNodeCount, and passes a passport refusal through
//   (f) the embedder check: a passport naming voyage-3 -> embedderMismatch; embeddingBasis -> graphHasNoVectors; an index
//       the passport does not name -> vectorIndexNotInPassport; the declared model, width and index -> the index name
// RED TWINS (in memory, test/lib/moduleTwin.js): requiredCheckRemoved (passportReader) -> (b); shaCheckRemoved
// (passportReader) -> (c); listCheckRemoved (describeGraph) -> (d); embedderComparisonRemoved (graphEmbeddingContract) -> (f).
//
//   node cli/lib.d/data-model-explorer/test/describe-graph-contract.test.js

const path = require('path');
const { loadWithMutations } = require('./lib/moduleTwin');

const DME_DIR_PATH = path.join(__dirname, '..');
const { contract, readerSha256 } = require('../lib/graphContract');
const SAMPLE_BY_TYPE = { string: 'sample', integer: 7, boolean: true, stringList: ['sample'], jsonString: '{}' };
const SAMPLE_BY_NAME = {
	graphName: 'DEV_P2R1_jevAcceptance', graphContractSha256: readerSha256, embeddingModelVersion: 'voyage-4-large', embeddingDims: 1024,
	vectorIndexNameList: ['DEV_P2R1_jevAcceptance_embedText_vector', 'DEV_P2R1_jevAcceptance_vector'], judgeIdentityList: ['jev:jev-1.13.0:data:rel-04bab2bc4b28'],
	engineVersions: JSON.stringify({ replayManager: 'finish/1', replayEngine: 'a'.repeat(64), serializer: '1', forgeFramework: 'b'.repeat(64), bridgeFramework: 'c'.repeat(64) }),
	meaningTierBreakdown: JSON.stringify([{ edgeType: 'EXACT_MATCH', mappingKind: 'inferred', mappingSource: 'bridge-jev', tierCount: 12681 }]),
	contentNodeCount: 243796, manifestRefId: 'e'.repeat(64), recipeHash: 'd'.repeat(64), recipeName: 'goldJevFresh',
};
const passportWith = (overrideByName = {}, omittedNameList = []) => {
	const storedPassport = contract.passportFieldList.reduce((soFar, oneRow) => {
		if (oneRow.name === 'embeddingBasis' || oneRow.name === 'frameworkFingerprint' || omittedNameList.indexOf(oneRow.name) !== -1) return soFar;
		return { ...soFar, [oneRow.name]: SAMPLE_BY_NAME[oneRow.name] !== undefined ? SAMPLE_BY_NAME[oneRow.name] : SAMPLE_BY_TYPE[oneRow.type] };
	}, {});
	const merged = { ...storedPassport, ...overrideByName };
	Object.keys(merged).forEach((oneName) => merged[oneName] === undefined && delete merged[oneName]);
	return merged;
};
const recordOf = (fieldValueByName) => ({ get: (fieldName) => fieldValueByName[fieldName], keys: Object.keys(fieldValueByName) });
const fieldMapOf = (fieldList) => fieldList.reduce((soFar, oneRow) => ({ ...soFar, [oneRow.name]: oneRow.type === 'stringList' ? ['sample'] : SAMPLE_BY_TYPE[oneRow.type] }), {});
const sessionDouble = ({ storedPassport, standardOverride = {}, indexRowList }) => ({
	run: (cypherText) => {
		const answer = (rowList) => Promise.resolve({ records: rowList.map(recordOf) });
		if (/MATCH \(p:GraphProvenance\) RETURN properties\(p\)/.test(cypherText)) return answer(storedPassport ? [{ passport: storedPassport }] : []);
		if (/\[:BUILT_FROM\]->\(r:ManifestRecipe\)\s+OPTIONAL MATCH \(r\)-\[:HAS_BLOCK\]/.test(cypherText)) return answer([{ recipe: { ...fieldMapOf(contract.manifestRecipeFieldList), basedOnManifestRefId: null, basedOnManifestRefIdBasis: 'none named at build' }, blocks: [{ ...fieldMapOf(contract.recipeBlockFieldList), stableId: 'recipeBlock:x' }], blockTotal: 1 }]);
		if (/BASED_ON\*1\.\.50/.test(cypherText)) return answer([{ ancestorManifestRefIdList: [] }]);
		if (/MATCH \(d:StandardDefinition\)/.test(cypherText)) return answer([{ standard: { ...fieldMapOf(contract.standardDefinitionFieldList), sourceKey: 'PESC-CollegeTranscript-1.8.0', standardKey: 'pesccollegetranscript1v8v0', ...standardOverride }, definitionStableId: 'standardDefinition:x' }]);
		if (/\[:ATTESTS\]->\(a:BuildAttestation\)/.test(cypherText)) return answer([{ attestation: { stableId: 'buildAttestation:roundTrip', gate: 'roundTrip', verdict: 'pass', verdictSupplied: true, expected: true, detail: 'ten clean', writtenOnChannel: 'channelA', lostTotal: 0, explicitOmissionDeclarationList: ['ceds: nothing omitted (rule: forges/ceds/roundTripValidator.js EXPLICITLY_OMITTED_PREDICATES)'] }, labelList: ['ForgedNode', 'BuildAttestation', 'GraphMeta'] }]);
		if (/^SHOW INDEXES/.test(cypherText)) return answer(indexRowList || [{ name: 'DEV_P2R1_jevAcceptance_vector', type: 'VECTOR', entityType: 'NODE', labelsOrTypes: ['ForgedNode'], properties: ['embedding'] }]);
		return Promise.reject(new Error(`unexpected statement: ${cypherText.slice(0, 60)}`));
	},
});

const moduleFor = (relativePath, mutationList) => (mutationList.length === 0 ? require(path.join(DME_DIR_PATH, relativePath)) : loadWithMutations({ modulePath: path.join(DME_DIR_PATH, relativePath), mutationList }));
// describeGraph and graphEmbeddingContract require passportReader by relative path; a passportReader twin is reached by
// handing the dependent module a twin through a require-cache swap for the duration of one call
const withPassportReaderTwin = (mutationList, thunk) => {
	if (mutationList.length === 0) return thunk();
	const readerPath = require.resolve(path.join(DME_DIR_PATH, 'lib', 'passportReader.js'));
	const realEntry = require.cache[readerPath];
	require.cache[readerPath] = { ...realEntry, exports: loadWithMutations({ modulePath: readerPath, mutationList }) };
	const describePath = require.resolve(path.join(DME_DIR_PATH, 'lib', 'describeGraph.js'));
	const realDescribe = require.cache[describePath];
	delete require.cache[describePath];
	const restore = () => {
		require.cache[readerPath] = realEntry;
		require.cache[describePath] = realDescribe;
	};
	return thunk(restore);
};

const describeWith = (sessionSpec, mutationList, done) =>
	withPassportReaderTwin(mutationList.passportReader || [], (restore = () => {}) => {
		const describeModule = moduleFor('lib/describeGraph.js', mutationList.describeGraph || []);
		// a twin that lets a malformed value through can make the card itself throw inside the driver's promise chain; that
		// IS the red (the card cannot render), recorded as such instead of ending the run
		let settled = false;
		const settle = (err, result) => {
			if (settled) return;
			settled = true;
			process.removeListener('uncaughtException', onCrash);
			restore();
			done(err || '', result || {});
		};
		const onCrash = (crashError) => settle('', { refusalName: 'CRASHED', reason: `the card threw: ${crashError.message}` });
		process.once('uncaughtException', onCrash);
		describeModule.describeGraph(sessionDouble(sessionSpec), {}, settle);
	});

let passed = 0;
let failed = 0;
const assert = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const conjunctByName = {
	a_fullPassportRenders: (mutationList, done) =>
		describeWith({ storedPassport: passportWith() }, mutationList, (err, result) => {
			const card = result.card || '';
			const pass = !err && !result.refusedByName && !/\?|\(none\)|predates|unrecorded|root manifest/.test(card) && /voyage-4-large × 1024/.test(card) && /DEV_P2R1_jevAcceptance_vector/.test(card) && /jev:jev-1\.13\.0/.test(card) && /Attestations \(1\): roundTrip pass/.test(card) && /Lineage: basedOnManifestRefId none recorded \(none named at build\)/.test(card);
			done({ pass, detail: err || result.reason || card.split('\n').slice(0, 3).join(' | ') });
		}),
	b_missingFieldRefused: (mutationList, done) =>
		describeWith({ storedPassport: passportWith({}, ['embeddingDims']) }, mutationList, (err, result) =>
			done({ pass: result.refusalName === 'passportShapeNotRecognised' && /missing required field\(s\) embeddingDims/.test(result.reason), detail: err || result.reason || 'rendered' })),
	c_contractMismatchRefused: (mutationList, done) =>
		describeWith({ storedPassport: passportWith({ graphContractSha256: 'f'.repeat(64) }) }, mutationList, (err, otherResult) =>
			describeWith({ storedPassport: passportWith({ graphContractSha256: undefined }) }, mutationList, (absentErr, absentResult) =>
				done({ pass: otherResult.refusalName === 'graphContractMismatch' && /is not the contract this reader was built against/.test(otherResult.reason) && /finished before the graph contract existed/.test(absentResult.reason || ''), detail: `${otherResult.reason || 'rendered'} | ${absentResult.reason || 'rendered'}` }))),
	d_scalarListRefused: (mutationList, done) =>
		describeWith({ storedPassport: passportWith(), standardOverride: { mappingKindList: 'inferred' } }, mutationList, (err, result) =>
			done({ pass: result.refusalName === 'standardDefinitionShapeNotRecognised' && /mappingKindList as a scalar, declared stringList/.test(result.reason), detail: err || result.reason || 'rendered' })),
	f_embedderChecked: (mutationList, done) => {
		const { checkGraphEmbeddingContract } = moduleFor('lib/graphEmbeddingContract.js', mutationList.graphEmbeddingContract || []);
		const run = (sessionSpec, next) => checkGraphEmbeddingContract({ session: sessionDouble(sessionSpec), verbName: 'search' }, (err, verdict) => next(verdict || {}));
		run({ storedPassport: passportWith({ embeddingModelVersion: 'voyage-3' }) }, (mismatch) =>
			run({ storedPassport: passportWith({ embeddingBasis: 'noVectors: vectorize=false' }, ['embeddingModelVersion', 'embeddingDims']) }, (vectorless) =>
				run({ storedPassport: passportWith(), indexRowList: [{ name: 'rogue_vector', type: 'VECTOR', entityType: 'NODE', labelsOrTypes: ['ForgedNode'], properties: ['embedding'] }] }, (rogue) =>
					run({ storedPassport: passportWith() }, (good) =>
						done({
							pass: (mismatch.refusal || {}).refusalName === 'embedderMismatch' && (vectorless.refusal || {}).refusalName === 'graphHasNoVectors' && (rogue.refusal || {}).refusalName === 'vectorIndexNotInPassport' && good.vectorIndexName === 'DEV_P2R1_jevAcceptance_vector',
							detail: [mismatch, vectorless, rogue, good].map((oneVerdict) => (oneVerdict.refusal ? oneVerdict.refusal.refusalName : oneVerdict.vectorIndexName || 'ACCEPTED')).join(' | '),
						})))));
	},
};
const TWIN_LIST = [
	{ conjunctName: 'b_missingFieldRefused', twinName: 'requiredCheckRemoved', mutationList: { passportReader: [{ find: '	if (missingNameList.length) {\n		return { refusalName', replace: '	if (false) {\n		return { refusalName' }] } },
	{ conjunctName: 'c_contractMismatchRefused', twinName: 'shaCheckRemoved', mutationList: { passportReader: [{ find: '	if (storedSha !== readerSha256) {', replace: '	if (false) {' }] } },
	{ conjunctName: 'd_scalarListRefused', twinName: 'listCheckRemoved', mutationList: { describeGraph: [{ find: "oneField.type === 'stringList' && storedMap[oneField.name] !== null", replace: "false && storedMap[oneField.name] !== null" }] } },
	{ conjunctName: 'f_embedderChecked', twinName: 'embedderComparisonRemoved', mutationList: { graphEmbeddingContract: [{ find: '		if (passport.embeddingModelVersion !== QUERY_EMBEDDER_CONTRACT.model || passport.embeddingDims !== QUERY_EMBEDDER_CONTRACT.dimension) {', replace: '		if (false) {' }] } },
];

// (e) history, through the real CLI handler table: one passport row; a refusal passed through
const historyCheck = (done) => {
	const { readPassport } = require('../lib/passportReader');
	readPassport({ session: sessionDouble({ storedPassport: passportWith() }), verbName: 'history' }, (err, read) =>
		readPassport({ session: sessionDouble({ storedPassport: null }), verbName: 'history' }, (absentErr, absentRead) =>
			done({ pass: !err && read.passport.contentNodeCount === 243796 && typeof read.passport.engineVersions === 'object' && (absentRead.refusal || {}).refusalName === 'passportAbsent', detail: `${err || read.passport.contentNodeCount} | ${(absentRead.refusal || {}).refusalName}` })));
};

const conjunctNameList = Object.keys(conjunctByName);
const runSequence = (stepList, whenDone) => {
	const nextStep = (stepIndex) => (stepIndex >= stepList.length ? whenDone() : stepList[stepIndex](() => nextStep(stepIndex + 1)));
	nextStep(0);
};
console.log('describe-graph-contract — BASELINE');
runSequence(
	conjunctNameList.map((oneName) => (stepDone) => conjunctByName[oneName]({}, (verdict) => { assert(`${oneName}`, verdict.pass, verdict.detail); stepDone(); })),
	() =>
		historyCheck((historyVerdict) => {
			assert('e_historyAnswersThePassport', historyVerdict.pass, historyVerdict.detail);
			console.log('describe-graph-contract — TWIN SWEEP (each observed RED)');
			runSequence(
				TWIN_LIST.map((oneTwin) => (stepDone) =>
					conjunctByName[oneTwin.conjunctName](oneTwin.mutationList, (verdict) => {
						assert(`${oneTwin.conjunctName} observed RED under '${oneTwin.twinName}'`, !verdict.pass, verdict.detail);
						console.log(`  RED-OBSERVED ${oneTwin.conjunctName} twin='${oneTwin.twinName}' → ${verdict.pass ? 'STILL PASSING' : 'FAIL'}: ${String(verdict.detail).slice(0, 160)}`);
						stepDone();
					})),
				() => {
					console.log(`\n${passed} passed, ${failed} failed`);
					process.exit(failed ? 1 : 0);
				},
			);
		}),
);
