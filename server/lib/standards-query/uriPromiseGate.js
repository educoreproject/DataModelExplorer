'use strict';

// uriPromiseGate — no answer without a URI that resolves (design section 1.5; TQ's ruling R1). Run at startup and at EVERY connection of the golden handle, since a new
// golden can arrive under the same container name. It reads the passport, requires the store to publish the passport's manifest, and proves by resolving: one element
// per standard the passport includes, one card per hub, one instance node where the graph has them.
//
//   runUriPromiseGate({ session, forgeAdapter, storeHandle }, callback) → callback('', { serviceFacts } | { unavailableReason })
//   serviceFacts: { passport, manifestLabel, manifestUri, manifestByContentUri, standardVersionByName, decisionBlockHashListByStandard, uriMinter, resolvedUriCount }
// A sampled element is one that resolves in process: an element with over 200 siblings runs in the resolver's child because its answer mints every sibling, and
// startup must not stall the API's event loop to prove a point a neighbour proves as well.

const path = require('path');
const neo4j = require('neo4j-driver');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();

const DME_LIB_DIR_PATH = path.join(__dirname, '..', '..', '..', 'cli', 'lib.d', 'data-model-explorer', 'lib');
const { readPassport } = require(path.join(DME_LIB_DIR_PATH, 'passportReader'));
const { runCypherQuery } = require(path.join(DME_LIB_DIR_PATH, 'runCypherQuery'));
const { uriMinterFor } = require('./uriMinter');

const ELEMENT_CANDIDATE_COUNT = 25;
const IN_PROCESS_SIBLING_LIMIT = 200;
// a family's first element, among families small enough to resolve in process (the resolver's limit is on siblings, read here from the same parentId)
const ELEMENT_SAMPLE_CYPHER = `MATCH (n:ForgedNode {_source: $standardName}) WHERE NOT n:HubReference AND NOT n:StandardLayer AND n.stableId IS NOT NULL AND n.parentId IS NOT NULL
	WITH n.parentId AS familyParentId, count(n) AS siblingCount, min(n.stableId) AS stableId WHERE siblingCount <= $siblingLimit
	RETURN stableId ORDER BY stableId LIMIT $candidateCount`;
const CARD_SAMPLE_CYPHER = `MATCH (h:HubDefinition) CALL { WITH h MATCH (card:HubReference {hubName: h.hubName, referenceTier: 'property'}) RETURN card.stableId AS stableId ORDER BY stableId LIMIT 1 }
	RETURN h.hubName AS hubName, h._source AS standardName, stableId`;
const INSTANCE_SAMPLE_CYPHER = `MATCH (n:ForgedNode {role: 'DmeInstance'}) WITH n._source AS standardName, min(n.stableId) AS stableId RETURN standardName, stableId ORDER BY standardName`;

const STORE_READ_LIST = Object.freeze({
	manifest: 'SELECT publicLabel, uri, uriByContent FROM publishedManifests WHERE manifestRefId = ?',
	allManifests: 'SELECT publicLabel, manifestRefId FROM publishedManifests ORDER BY publishedAt DESC',
	memberBlocks: 'SELECT schemaBlockRefId FROM publishedManifestMembers WHERE manifestRefId = ? ORDER BY position',
	memberStandard: 'SELECT standardName, standardVersion FROM derivedElementIndex WHERE schemaBlockRefId = ? LIMIT 1',
	memberDecisionBlocks: 'SELECT DISTINCT decisionBlockHash FROM derivedAnswerEdges WHERE schemaBlockRefId = ? AND decisionBlockHash IS NOT NULL',
	blockStandard: 'SELECT subjectStandardName FROM derivedAssertionBlocks WHERE decisionBlockHash = ?',
});

const readStoreFacts = ({ storeHandle, manifestRefId }) => {
	const statementByName = Object.keys(STORE_READ_LIST).reduce((soFar, readName) => ({ ...soFar, [readName]: storeHandle.prepare(STORE_READ_LIST[readName]) }), {});
	const manifestRow = statementByName.manifest.get(manifestRefId);
	if (manifestRow === undefined) {
		const heldList = statementByName.allManifests.all().map((oneRow) => `${oneRow.publicLabel} (${oneRow.manifestRefId})`);
		return { unavailableReason: `the graph's manifest ${manifestRefId} is not published in this instance's store, which holds: ${heldList.join(', ') || 'nothing'}` };
	}
	const memberBlockIdList = statementByName.memberBlocks.all(manifestRefId).map((oneRow) => oneRow.schemaBlockRefId);
	const standardVersionByName = {};
	memberBlockIdList.forEach((schemaBlockRefId) => {
		const standardRow = statementByName.memberStandard.get(schemaBlockRefId);
		if (standardRow !== undefined) {
			standardVersionByName[standardRow.standardName] = standardRow.standardVersion;
		}
	});
	const decisionBlockHashListByStandard = {};
	[...new Set(memberBlockIdList.flatMap((schemaBlockRefId) => statementByName.memberDecisionBlocks.all(schemaBlockRefId).map((oneRow) => oneRow.decisionBlockHash)))].forEach((decisionBlockHash) => {
		const blockRow = statementByName.blockStandard.get(decisionBlockHash);
		if (blockRow !== undefined && blockRow.subjectStandardName) {
			decisionBlockHashListByStandard[blockRow.subjectStandardName] = [...(decisionBlockHashListByStandard[blockRow.subjectStandardName] || []), decisionBlockHash];
		}
	});
	return { manifestRow, standardVersionByName, decisionBlockHashListByStandard };
};

const runUriPromiseGate = ({ session, forgeAdapter, storeHandle }, callback) => {
	// the adapter's routeFor and resolveInProcess take the request path, the part after the base IRI, as the /edc/ route hands them
	const pathOfUri = (uriText) => `/${uriText.slice(forgeAdapter.baseIri.length)}`;
	const taskList = new taskListPlus();

	taskList.push((args, next) => readPassport({ session, verbName: 'describeGraph' }, (passportError, passportRead) => {
		if (passportError) {
			next(passportError, args);
			return;
		}
		if (passportRead.refusal) {
			next('skipRestOfPipe', { ...args, unavailableReason: `the graph's passport cannot be read: ${passportRead.refusal.reason}` });
			return;
		}
		next('', { ...args, passport: passportRead.passport });
	}));

	taskList.push((args, next) => {
		const storeFacts = readStoreFacts({ storeHandle, manifestRefId: args.passport.manifestRefId });
		if (storeFacts.unavailableReason) {
			next('skipRestOfPipe', { ...args, unavailableReason: storeFacts.unavailableReason });
			return;
		}
		next('', { ...args, storeFacts, uriMinter: uriMinterFor({ edcUri: forgeAdapter.edcUri, storeHandle, manifestLabel: storeFacts.manifestRow.publicLabel, standardVersionByName: storeFacts.standardVersionByName }) });
	});

	// the samples: for each standard the first few elements, of which the first that resolves in process is proved
	taskList.push((args, next) => {
		const sampleList = [];
		const readStandard = (standardIndex) => {
			if (standardIndex >= args.passport.standardsIncluded.length) {
				next('', { ...args, sampleList });
				return;
			}
			const standardName = args.passport.standardsIncluded[standardIndex];
			runCypherQuery(session, ELEMENT_SAMPLE_CYPHER, { standardName, candidateCount: neo4j.int(ELEMENT_CANDIDATE_COUNT), siblingLimit: neo4j.int(IN_PROCESS_SIBLING_LIMIT) }, (sampleError, sampleResult) => {
				if (sampleError) {
					next(sampleError, args);
					return;
				}
				// every standard proves an element by resolving it, CEDS included: a foreign-vocabulary row (uriMinter) proves nothing and is never the sample
				const provableStableId = sampleResult.records.map((oneRecord) => oneRecord.get('stableId')).find((stableId) => {
					const minted = args.uriMinter.uriForNode({ stableId, standardName });
					return minted.uri !== undefined && !minted.isOwnIri && forgeAdapter.routeFor(pathOfUri(minted.uri)).routeName === 'inProcess';
				});
				sampleList.push({ sampleKind: 'element', standardName, stableId: provableStableId });
				readStandard(standardIndex + 1);
			});
		};
		readStandard(0);
	});

	taskList.push((args, next) => runCypherQuery(session, CARD_SAMPLE_CYPHER, {}, mergeArgs(args, next, 'cardResult')));
	taskList.push((args, next) => runCypherQuery(session, INSTANCE_SAMPLE_CYPHER, {}, mergeArgs(args, next, 'instanceResult')));

	taskList.push((args, next) => {
		const proofList = [
			...args.sampleList,
			...args.cardResult.records.map((oneRecord) => ({ sampleKind: 'card', standardName: oneRecord.get('standardName'), stableId: oneRecord.get('stableId') })),
			...args.instanceResult.records.map((oneRecord) => ({ sampleKind: 'instance', standardName: oneRecord.get('standardName'), stableId: oneRecord.get('stableId') })),
		];
		const unsampled = proofList.find((oneProof) => !oneProof.stableId);
		if (unsampled) {
			next('skipRestOfPipe', { ...args, unavailableReason: `no ${unsampled.sampleKind} of ${unsampled.standardName} could be resolved in process among its first ${ELEMENT_CANDIDATE_COUNT}` });
			return;
		}
		let resolvedUriCount = 0;
		const proveNext = (proofIndex) => {
			if (proofIndex >= proofList.length) {
				next('', { ...args, resolvedUriCount });
				return;
			}
			const { sampleKind, standardName, stableId } = proofList[proofIndex];
			const minted = args.uriMinter.uriForNode({ stableId, standardName });
			if (minted.uri === undefined) {
				next('skipRestOfPipe', { ...args, unavailableReason: `the ${sampleKind} ${stableId} of ${standardName} has no URI: ${minted.absentReason}` });
				return;
			}
			if (forgeAdapter.routeFor(pathOfUri(minted.uri)).routeName !== 'inProcess') {
				proveNext(proofIndex + 1);
				return;
			}
			forgeAdapter.resolveInProcess(pathOfUri(minted.uri), ({ httpStatus }) => {
				if (httpStatus !== 200) {
					next('skipRestOfPipe', { ...args, unavailableReason: `the ${sampleKind} URI ${minted.uri} answers ${httpStatus}, not 200` });
					return;
				}
				resolvedUriCount += 1;
				setImmediate(() => proveNext(proofIndex + 1));
			});
		};
		proveNext(0);
	});

	pipeRunner(taskList.getList(), {}, (pipeError, args) => {
		if (pipeError && pipeError !== 'skipRestOfPipe') {
			callback(pipeError);
			return;
		}
		if (args.unavailableReason) {
			callback('', { unavailableReason: args.unavailableReason });
			return;
		}
		const { passport, storeFacts, uriMinter, resolvedUriCount } = args;
		callback('', {
			serviceFacts: {
				passport,
				manifestLabel: storeFacts.manifestRow.publicLabel,
				manifestUri: storeFacts.manifestRow.uri,
				manifestByContentUri: storeFacts.manifestRow.uriByContent,
				standardVersionByName: storeFacts.standardVersionByName,
				decisionBlockHashListByStandard: storeFacts.decisionBlockHashListByStandard,
				uriMinter,
				resolvedUriCount,
			},
		});
	});
};

module.exports = { runUriPromiseGate };
