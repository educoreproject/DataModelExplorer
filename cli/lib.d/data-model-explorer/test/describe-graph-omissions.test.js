#!/usr/bin/env node
'use strict';

// describe-graph-omissions.test.js — the DME half of G21 (WORKORDER-G21 item 3): describeGraph SHOWS the round trip's
// omission declaration from the in-graph certificate (the roundTrip BuildAttestation's explicitOmissionDeclarationList,
// graph-contract §4), so a reader learns what each standard omitted, by kind, under which rule, with the rule's caveat —
// and that omitted is not lost. Read-only. HERMETIC: a session double answers each read, its passport built FROM the
// contract file itself.
//
// PROVES:
//   (a) the contract this reader is built against declares explicitOmissionDeclarationList on the roundTrip row (stringList)
//   (b) a roundTrip row carrying the list renders an "Omission declaration" section, one line per standard, verbatim, and
//       the Attestations line does not repeat the list
//   (c) a MEASURED roundTrip row (pass or fail) without the list is REFUSED BY NAME (attestationShapeNotRecognised, naming
//       the field) — a certificate that counts omissions without declaring them is the pre-G21 shape
//   (d) a notRun roundTrip row renders, saying the round trip did not run so nothing was declared
// RED TWINS (in memory, test/lib/moduleTwin.js): declarationSectionDropped -> (b); measuredRowCheckRemoved -> (c);
// notRunLineDropped -> (d).
//
//   node cli/lib.d/data-model-explorer/test/describe-graph-omissions.test.js

const path = require('path');
const { loadWithMutations } = require('./lib/moduleTwin');

const DME_DIR_PATH = path.join(__dirname, '..');
const { contract, readerSha256 } = require('../lib/graphContract');

const SAMPLE_BY_TYPE = { string: 'sample', integer: 7, boolean: true, stringList: ['sample'], jsonString: '{}' };
const SAMPLE_BY_NAME = {
	graphName: 'DEV_G21', graphContractSha256: readerSha256, embeddingModelVersion: 'voyage-4-large', embeddingDims: 1024,
	vectorIndexNameList: ['DEV_G21_vector'], judgeIdentityList: ['jev:x'],
	engineVersions: JSON.stringify({ replayManager: 'finish/1', replayEngine: 'a'.repeat(64), serializer: '1', forgeFramework: 'b'.repeat(64), bridgeFramework: 'c'.repeat(64) }),
	meaningTierBreakdown: JSON.stringify([{ edgeType: 'EXACT_MATCH', mappingKind: 'inferred', mappingSource: 'bridge-jev', tierCount: 1 }]),
	manifestRefId: 'e'.repeat(64), recipeHash: 'd'.repeat(64),
};
const storedPassport = contract.passportFieldList.reduce((soFar, oneRow) => {
	if (oneRow.name === 'embeddingBasis' || oneRow.name === 'frameworkFingerprint') return soFar;
	return { ...soFar, [oneRow.name]: SAMPLE_BY_NAME[oneRow.name] !== undefined ? SAMPLE_BY_NAME[oneRow.name] : SAMPLE_BY_TYPE[oneRow.type] };
}, {});
const recordOf = (fieldValueByName) => ({ get: (fieldName) => fieldValueByName[fieldName], keys: Object.keys(fieldValueByName) });
const fieldMapOf = (fieldList) => fieldList.reduce((soFar, oneRow) => ({ ...soFar, [oneRow.name]: SAMPLE_BY_TYPE[oneRow.type] }), {});

const PESC_LINE = 'pesccollegetranscript1v8v0: whitespace 28,428, comment 907, processingInstruction 4 (rule: lib/pesc-release-forge/roundTripPair.js); comments may carry content (PLAN G20)';
const SIF_LINE = 'sif260928: container 6,586 (rule: forges/sif260928/lib/sif260928RoundTripPair.js)';
const roundTripRowWith = (overrideByName) => ({
	stableId: 'buildAttestation:roundTrip', gate: 'roundTrip', verdict: 'pass', verdictSupplied: true, expected: true, detail: 'two standards ran', writtenOnChannel: 'channelA',
	roundTripClean: true, inventedTotal: 0, lostTotal: 0, explicitlyOmittedTotal: 35925, standardCount: 2, explicitOmissionDeclarationList: [PESC_LINE, SIF_LINE],
	...overrideByName,
});
const sessionDouble = (roundTripRow) => ({
	run: (cypherText) => {
		const answer = (rowList) => Promise.resolve({ records: rowList.map(recordOf) });
		if (/MATCH \(p:GraphProvenance\) RETURN properties\(p\)/.test(cypherText)) return answer([{ passport: storedPassport }]);
		if (/\[:BUILT_FROM\]->\(r:ManifestRecipe\)\s+OPTIONAL MATCH \(r\)-\[:HAS_BLOCK\]/.test(cypherText)) return answer([{ recipe: { ...fieldMapOf(contract.manifestRecipeFieldList), basedOnManifestRefId: null, basedOnManifestRefIdBasis: 'none named at build' }, blocks: [], blockTotal: 0 }]);
		if (/BASED_ON\*1\.\.50/.test(cypherText)) return answer([{ ancestorManifestRefIdList: [] }]);
		if (/MATCH \(d:StandardDefinition\)/.test(cypherText)) return answer([]);
		if (/\[:ATTESTS\]->\(a:BuildAttestation\)/.test(cypherText)) return answer([{ attestation: roundTripRow, labelList: ['ForgedNode', 'BuildAttestation', 'GraphMeta'] }]);
		return Promise.reject(new Error(`unexpected statement: ${cypherText.slice(0, 60)}`));
	},
});
const DESCRIBE_PATH = path.join(DME_DIR_PATH, 'lib', 'describeGraph.js');
const describeWith = (roundTripRow, mutationList, done) => {
	const describeModule = mutationList.length === 0 ? require(DESCRIBE_PATH) : loadWithMutations({ modulePath: DESCRIBE_PATH, mutationList });
	// a twin that lets a malformed row through can make the card itself throw inside the driver's promise chain; that IS
	// the red (the card cannot render), recorded as such instead of ending the run (describe-graph-contract's pattern)
	let settled = false;
	const settle = (err, result) => {
		if (settled) return;
		settled = true;
		process.removeListener('uncaughtException', onCrash);
		done(err || '', result || {});
	};
	const onCrash = (crashError) => settle('', { refusalName: 'CRASHED', reason: `the card threw: ${crashError.message}` });
	process.once('uncaughtException', onCrash);
	describeModule.describeGraph(sessionDouble(roundTripRow), {}, settle);
};

let passed = 0;
let failed = 0;
const assert = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const conjunctByName = {
	a_contractDeclaresTheField: (mutationList, done) => {
		const declaredField = contract.attestationFieldList.find((oneField) => oneField.name === 'explicitOmissionDeclarationList') || {};
		done({ pass: declaredField.type === 'stringList' && JSON.stringify(declaredField.gateList) === '["roundTrip"]', detail: JSON.stringify(declaredField) });
	},
	b_declarationRendered: (mutationList, done) =>
		describeWith(roundTripRowWith({}), mutationList, (err, result) => {
			const card = result.card || '';
			const cardLineList = card.split('\n');
			const headingIndex = cardLineList.findIndex((oneLine) => /^Omission declaration \(round trip\): omitted by declared rule, not lost$/.test(oneLine));
			const attestationsLine = cardLineList.find((oneLine) => /^Attestations \(/.test(oneLine)) || '';
			done({
				pass: !err && headingIndex !== -1 && cardLineList[headingIndex + 1] === `  ${PESC_LINE}` && cardLineList[headingIndex + 2] === `  ${SIF_LINE}` && attestationsLine.indexOf('comments may carry content') === -1 && /explicitlyOmittedTotal 35925/.test(attestationsLine),
				detail: err || result.reason || cardLineList.slice(-5).join(' | '),
			});
		}),
	c_measuredRowWithoutListRefused: (mutationList, done) =>
		describeWith(roundTripRowWith({ explicitOmissionDeclarationList: undefined }), mutationList, (err, result) =>
			done({ pass: result.refusalName === 'attestationShapeNotRecognised' && /BuildAttestation roundTrip \(verdict pass\) lacks explicitOmissionDeclarationList/.test(result.reason || ''), detail: err || result.reason || 'rendered' })),
	d_notRunRowSaysSo: (mutationList, done) =>
		describeWith(roundTripRowWith({ verdict: 'notRun', roundTripClean: undefined, inventedTotal: undefined, lostTotal: undefined, explicitlyOmittedTotal: undefined, standardCount: undefined, explicitOmissionDeclarationList: undefined }), mutationList, (err, result) => {
			const card = result.card || '';
			done({ pass: !err && /^Omission declaration \(round trip\): none — the round trip did not run \(notRun\), so it declared nothing$/m.test(card), detail: err || result.reason || card.split('\n').slice(-3).join(' | ') });
		}),
};
const TWIN_LIST = [
	{ conjunctName: 'b_declarationRendered', twinName: 'declarationSectionDropped', mutationList: [{ find: '	lines.push(...omissionDeclarationLineListFor(attestations));', replace: '' }] },
	{ conjunctName: 'c_measuredRowWithoutListRefused', twinName: 'measuredRowCheckRemoved', mutationList: [{ find: 'const listFaultText = omissionListFaultTextFor(oneAttestation);', replace: "const listFaultText = '';" }] },
	{ conjunctName: 'd_notRunRowSaysSo', twinName: 'notRunLineDropped', mutationList: [{ find: "return [`${OMISSION_DECLARATION_HEADING}: none — the round trip did not run (${roundTripAttestation.verdict}), so it declared nothing`];", replace: 'return [];' }] },
];

const conjunctNameList = Object.keys(conjunctByName);
const runSequence = (stepList, whenDone) => {
	const nextStep = (stepIndex) => (stepIndex >= stepList.length ? whenDone() : stepList[stepIndex](() => nextStep(stepIndex + 1)));
	nextStep(0);
};
const judgeSafely = (conjunctName, mutationList, done) => {
	// a twin whose find-text no longer matches throws from moduleTwin: that is a stale twin, never a red
	try {
		conjunctByName[conjunctName](mutationList, done);
	} catch (judgeError) {
		done({ pass: false, threw: true, detail: `THREW: ${judgeError.message}` });
	}
};
console.log('describe-graph-omissions — BASELINE');
runSequence(
	conjunctNameList.map((oneName) => (stepDone) => judgeSafely(oneName, [], (verdict) => { assert(oneName, verdict.pass, verdict.detail); stepDone(); })),
	() => {
		console.log('describe-graph-omissions — TWIN SWEEP (each observed RED)');
		runSequence(
			TWIN_LIST.map((oneTwin) => (stepDone) =>
				judgeSafely(oneTwin.conjunctName, oneTwin.mutationList, (verdict) => {
					assert(`${oneTwin.conjunctName} observed RED under '${oneTwin.twinName}' (not by a stale find-text)`, !verdict.pass && !verdict.threw, verdict.detail);
					console.log(`  RED-OBSERVED ${oneTwin.conjunctName} twin='${oneTwin.twinName}' → ${verdict.pass ? 'STILL PASSING' : 'FAIL'}: ${String(verdict.detail).slice(0, 200)}`);
					stepDone();
				})),
			() => {
				console.log(`\n${passed} passed, ${failed} failed`);
				process.exit(failed ? 1 : 0);
			},
		);
	},
);
