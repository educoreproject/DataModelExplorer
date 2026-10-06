'use strict';

// passportReader.js — the ONE reader of the :GraphProvenance passport (campaign P2, W-A-3 / V2-C01, V2-C04), shared by
// describeGraph, dme_history and the query embedder's contract check. It reads the passport AS graph-contract §3 declares it
// (PASSPORT_FIELD_LIST, from contract/graphContract.json) and REFUSES BY NAME what it cannot read honestly:
//   passportAbsent              — no :GraphProvenance (the graph was never finished)
//   passportShapeNotRecognised  — more than one passport; a required field missing; a field not of its declared type
//   graphContractMismatch       — the passport's graphContractSha256 is not this reader's (absent: the graph was finished
//                                 before the graph contract existed; rebuild it, or read it with a pre-contract reader)
// There is no '?', no '(none)', no 'predates' line any more: a missing required value never reaches a renderer, and an
// optional absent value is rendered from its declared basis field (embeddingBasis, frameworkFingerprintBasis).
//
//   readPassport({ session, verbName }, callback(err, { passport } | { refusal }))
//     err: the query could not run (an ERROR, stderr); refusal: a refusalFor() object (a correct answer, stdout)
//
// Async style: callback(err, result); the driver's promises end at runCypherQuery.

const { runCypherQuery } = require('./runCypherQuery');
const { refusalFor } = require('./toolPayloadContract');
const { contract, readerSha256, PASSPORT_PARSER_BY_TYPE } = require('./graphContract');

const PASSPORT_CYPHER = 'MATCH (p:GraphProvenance) RETURN properties(p) AS passport LIMIT 5';
// the declared alternatives: when the basis field is present, the fields it stands for are absent BY DECLARATION
const PASSPORT_ALTERNATIVE_BY_BASIS_FIELD_NAME = Object.freeze({
	embeddingBasis: Object.freeze(['embeddingModelVersion', 'embeddingDims']),
	frameworkFingerprintBasis: Object.freeze(['frameworkFingerprint']),
});

const plainValueOf = (storedValue) => {
	if (storedValue === null || storedValue === undefined) return storedValue;
	if (typeof storedValue === 'object' && typeof storedValue.toNumber === 'function') return storedValue.toNumber();
	if (Array.isArray(storedValue)) return storedValue.map(plainValueOf);
	return storedValue;
};
// a stored value checked against its declared type -> '' or the reason it is not that type
const TYPE_FAULT_BY_TYPE = Object.freeze({
	string: (oneValue) => (typeof oneValue === 'string' ? '' : `a ${typeof oneValue}, declared string`),
	integer: (oneValue) => (Number.isInteger(oneValue) ? '' : `${JSON.stringify(oneValue)}, declared integer`),
	boolean: (oneValue) => (typeof oneValue === 'boolean' ? '' : `a ${typeof oneValue}, declared boolean`),
	stringList: (oneValue) => (Array.isArray(oneValue) && oneValue.every((oneMember) => typeof oneMember === 'string') ? '' : `${Array.isArray(oneValue) ? 'a list holding a non-string' : `a ${typeof oneValue}`}, declared stringList`),
	jsonString: (oneValue) => (typeof oneValue === 'string' ? '' : `a ${typeof oneValue}, declared jsonString`),
});

// parsedOrFault — the declared parse of a stored text. The graph is EXTERNAL data to this reader, so this is the one
// boundary where a parser's throw is caught and turned into a named fault (TQ's rule: try only where outside data enters).
const parsedOrFault = (typeName, storedText) => {
	try {
		return { value: PASSPORT_PARSER_BY_TYPE[typeName](storedText) };
	} catch (parseError) {
		return { fault: parseError.message };
	}
};

// passportVerdictFor — PURE: the stored property map -> { passport } | { refusalName, reason }
const passportVerdictFor = (storedPassport) => {
	const storedSha = storedPassport.graphContractSha256;
	if (storedSha !== readerSha256) {
		return {
			refusalName: 'graphContractMismatch',
			reason: `graph contract ${storedSha || '(absent: this graph was finished before the graph contract existed)'} is not the contract this reader was built against (${readerSha256}) — rebuild the graph with the current educoreForge, or read it with a reader from its own era`,
		};
	}
	const absentByDeclarationSet = new Set();
	Object.keys(PASSPORT_ALTERNATIVE_BY_BASIS_FIELD_NAME).forEach((oneBasisName) => {
		if (storedPassport[oneBasisName] !== undefined && storedPassport[oneBasisName] !== null) {
			PASSPORT_ALTERNATIVE_BY_BASIS_FIELD_NAME[oneBasisName].forEach((oneName) => absentByDeclarationSet.add(oneName));
		}
	});
	const missingNameList = contract.passportFieldList.filter((oneRow) => oneRow.required && !absentByDeclarationSet.has(oneRow.name) && (storedPassport[oneRow.name] === undefined || storedPassport[oneRow.name] === null)).map((oneRow) => oneRow.name);
	if (missingNameList.length) {
		return { refusalName: 'passportShapeNotRecognised', reason: `passport shape not recognised — missing required field(s) ${missingNameList.join(', ')} declared in graphContract ${readerSha256.slice(0, 12)}` };
	}
	const passport = {};
	const typeFaultList = [];
	contract.passportFieldList.forEach((oneRow) => {
		const plainValue = plainValueOf(storedPassport[oneRow.name]);
		if (plainValue === undefined || plainValue === null) {
			return;
		}
		const typeFault = TYPE_FAULT_BY_TYPE[oneRow.type](plainValue);
		if (typeFault) {
			typeFaultList.push(`${oneRow.name} is ${typeFault}`);
			return;
		}
		if (!PASSPORT_PARSER_BY_TYPE[oneRow.type]) {
			passport[oneRow.name] = plainValue;
			return;
		}
		const parsed = parsedOrFault(oneRow.type, plainValue);
		if (parsed.fault) {
			typeFaultList.push(`${oneRow.name} is not parseable as its declared ${oneRow.type}: ${parsed.fault}`);
			return;
		}
		passport[oneRow.name] = parsed.value;
	});
	if (typeFaultList.length) {
		return { refusalName: 'passportShapeNotRecognised', reason: `passport field(s) not of their declared type: ${typeFaultList.join('; ')}` };
	}
	return { passport };
};

const readPassport = ({ session, verbName }, callback) => {
	runCypherQuery(session, PASSPORT_CYPHER, {}, (err, result) => {
		if (err) {
			callback(`reading the passport failed: ${err}`);
			return;
		}
		const storedPassportList = result.records.map((oneRecord) => oneRecord.get('passport'));
		if (storedPassportList.length === 0) {
			callback('', { refusal: refusalFor(verbName, 'passportAbsent', 'this graph holds no :GraphProvenance passport — it was never finished by educoreForge\'s finish verb') });
			return;
		}
		if (storedPassportList.length > 1) {
			callback('', { refusal: refusalFor(verbName, 'passportShapeNotRecognised', `this graph holds ${storedPassportList.length} :GraphProvenance passports; a build record must be singular`) });
			return;
		}
		const verdict = passportVerdictFor(storedPassportList[0]);
		if (verdict.refusalName) {
			callback('', { refusal: refusalFor(verbName, verdict.refusalName, verdict.reason) });
			return;
		}
		callback('', { passport: verdict.passport });
	});
};

module.exports = { readPassport, passportVerdictFor, PASSPORT_CYPHER, PASSPORT_ALTERNATIVE_BY_BASIS_FIELD_NAME };
