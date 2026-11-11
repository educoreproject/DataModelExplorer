#!/usr/bin/env node
'use strict';

// forgeAdapter — the ONE place educore requires the educoreForge tree (edcResolverEndpoint-110226, briefing section 1). It loads the edc: resolver
// and the uriContract reader from a forge checkout named by config, because their closure is a third of the forge and a copy would be a fork.
//
//   loadForgeResolver({ educoreForgeCodePath, uriContractFilePath }) → { error } | { resolveEdcUri, edcIriFor, edcUri, stubResolver, registry, uriContractReader, Database, retrievalModules }
//       used by the API (through openForgeAdapter) and by the whole-block child (resolveOneUri.js)
//   openForgeAdapter({ configValues }) → { refusalText } | { routeFor, resolveInProcess, edcIriFor, edcUri, retrievalModules, baseIri, startupLine, openStoreReadHandle, ...configured values }
//       openStoreReadHandle() → { storeHandle } | { error }: one more read-only handle on the store (the standards query core's reads; never a write)
//       routeFor(edcRequestPath) → { routeName: 'inProcess' | 'wholeBlockChild' | 'directBlock' | 'overCap', kind, byteSize }: a block over wholeBlockMaxBytes is sent as the store holds it by streamOneBlock.js, up to directBlockMaxBytes
//       retrievalModules: { candidateRetrievalLib, hubEdgeType, dmeRoles }: the forge's pure vote and rank modules and the names they read (Rosetta retrieval, design 4.1); they take records by injection and read no store
//       loadJudgeModules() → { error } | { judgeOne, renderQuestion, promptIdentifierScanFor, loadSpendPricing, judgePromptVariantNameList, spendLedgerLib, spendRecordLib, createLlmClient, hubBridgingFor }: the bridge's judging machinery, for Rosetta's judged step (design 1.8, 4.5). Loaded only when an instance configures a judge. Every call into it keeps this file's try boundary. Paths are always handed in, because the forge's own defaults name the canonical stores and a Mac.
//
// The store opens once, read-only, at startup. An open handle keeps the old inode, so REPLACING THE STORE FILE IS AN API RESTART. So is any change to
// the licence hold list the block kinds obey, which stubResolver.js freezes at require time: a hold change takes a forge re-sync plus an API restart.
// THE try BLOCK IS THE BOUNDARY, as attemptSql is in the forge: a foreign tree's exception becomes an error string here, because the API must
// start and keep serving whatever state that tree is in. No flow of this module is steered by an exception of its own.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const fs = require('fs');
const path = require('path');

const RELATIONSHIP_BLOCK_KIND = 'relationship';
const REQUIRED_TEXT_CONFIG_NAME_LIST = ['educoreForgeCodePath', 'uriContractFilePath', 'publicPathPrefix', 'directBlockSqliteCommandPath', 'sizeRefusalContactAddress'];
const REQUIRED_POSITIVE_INTEGER_CONFIG_NAME_LIST = ['wholeBlockMaxBytes', 'wholeBlockMaxOldSpaceMegabytes', 'wholeBlockTimeoutMilliseconds', 'directBlockMaxBytes', 'directBlockTimeoutMilliseconds'];

const JUDGE_MODULE_RELATIVE_PATH_BY_NAME = Object.freeze({
	judgeComponentLib: ['lib', 'bridge-framework', 'judgeComponent'],
	evidenceRendererLib: ['lib', 'bridge-framework', 'evidenceRenderer'],
	promptIdentifierScanLib: ['lib', 'bridge-framework', 'promptIdentifierScan'],
	spendPricingLib: ['lib', 'spend-ledger', 'spendPricing'],
	spendLedgerLib: ['lib', 'spend-ledger', 'spendLedger'],
	spendRecordLib: ['lib', 'spend-ledger', 'spendRecord'],
	llmClientFactory: ['apps', 'graph-builder', 'apps', 'bridge-maker', 'lib', 'llmClient'],
});

// the kinds that run in the child, never in the API. Whole block text (briefing section 4), where a size rule means the byte size is read first and capped
// without spawning; and the manifest, standard, hub and element listings, which the brief expected to be cheap: measured on the server each holds a
// synchronous read for 0.6 to 17 seconds, which is that long with the API's event loop stopped. A listing takes a query, so a query does not keep it in process.
const LISTING_RULE = Object.freeze({ takesQuery: true });
// An element answers its whole sibling list, minted URI by URI: under this many siblings it takes under 50 ms on the server and stays in process; a family
// of 13,006 took 0.8 seconds warm and 2.3 cold. The count is read with a LIMIT, so reading it costs next to nothing whatever the family's size.
const ELEMENT_SIBLING_COUNT_IN_PROCESS = 200;
const WHOLE_BLOCK_RULE_BY_KIND = Object.freeze({
	element: {
		siblingCountSql: `WITH thisElement AS (SELECT schemaBlockRefId, parentStableId FROM derivedElementIndex WHERE standardName = ? AND standardVersion = ? AND elementStableId = ? ORDER BY rowid LIMIT 1)
			SELECT count(*) AS siblingCount FROM (SELECT 1 FROM derivedElementIndex sibling, thisElement WHERE sibling.schemaBlockRefId = thisElement.schemaBlockRefId AND sibling.parentStableId = thisElement.parentStableId LIMIT ${ELEMENT_SIBLING_COUNT_IN_PROCESS + 1})`,
	},
	manifest: {},
	manifestByContent: {},
	manifestStandardList: {},
	manifestStandardListByContent: {},
	manifestHubList: {},
	manifestHubListByContent: {},
	manifestElementList: LISTING_RULE,
	manifestElementListByContent: LISTING_RULE,
	hubDomainList: LISTING_RULE,
	hubDomainListByContent: LISTING_RULE,
	hubDomainCardList: LISTING_RULE,
	hubDomainCardListByContent: LISTING_RULE,
	schemaBlock: { byteSizeSql: 'SELECT octet_length(text) AS byteSize FROM schemaBlocks WHERE refId = ?', blockIdentityPartName: 'schemaBlockRefId' },
	decisionSchemaBlock: { byteSizeSql: 'SELECT octet_length(frozenText) AS byteSize FROM decisionSchemaBlocks WHERE decisionSchemaBlockHash = ?', blockIdentityPartName: 'decisionBlockHash' },
	question: { readsRelationshipBlocksOnly: true },
	questionForHub: { readsRelationshipBlocksOnly: true },
	questionByContent: { readsRelationshipBlocksOnly: true },
	questionForHubByContent: { readsRelationshipBlocksOnly: true },
});

// a thrown exception from the foreign tree becomes { error }
const attemptForgeCall = (forgeCall, whatFailed) => {
	try {
		return { result: forgeCall() };
	} catch (forgeException) {
		return { error: `${moduleName}: ${whatFailed}: ${forgeException.message}` };
	}
};

const loadForgeResolver = ({ educoreForgeCodePath, uriContractFilePath }) => {
	if (!fs.existsSync(educoreForgeCodePath)) {
		return { error: `${moduleName}: educoreForgeCodePath ${educoreForgeCodePath} does not exist` };
	}
	if (!fs.existsSync(uriContractFilePath)) {
		return { error: `${moduleName}: uriContractFilePath ${uriContractFilePath} does not exist` };
	}
	const loaded = attemptForgeCall(() => ({
		uriContractLib: require(path.join(educoreForgeCodePath, 'lib', 'uri-contract', 'uriContract')),
		stubResolver: require(path.join(educoreForgeCodePath, 'lib', 'edc-uri', 'stubResolver')),
		edcUri: require(path.join(educoreForgeCodePath, 'lib', 'edc-uri', 'edcUri')),
		Database: require(path.join(educoreForgeCodePath, 'node_modules', 'better-sqlite3')),
		candidateRetrievalLib: require(path.join(educoreForgeCodePath, 'lib', 'bridge-framework', 'candidateRetrieval')),
		vocabularyLib: require(path.join(educoreForgeCodePath, 'lib', 'vocabulary', 'vocabulary')),
	}), `loading the forge tree at ${educoreForgeCodePath}`);
	if (loaded.error) {
		return { error: loaded.error };
	}
	const { uriContractLib, stubResolver, edcUri, Database, candidateRetrievalLib, vocabularyLib } = loaded.result;
	const opened = attemptForgeCall(() => {
		const openedContract = uriContractLib.uriContractReaderFor({ uriContractFilePath });
		return openedContract.error ? openedContract : { ...openedContract, registryLoad: openedContract.uriContract.loadRegistry() };
	}, `opening ${uriContractFilePath}`);
	if (opened.error || opened.result.error) {
		return { error: opened.error || `${moduleName}: ${opened.result.error}` };
	}
	if (opened.result.registryLoad.error) {
		return { error: `${moduleName}: ${opened.result.registryLoad.error}` };
	}
	return {
		resolveEdcUri: stubResolver.resolveEdcUri,
		edcIriFor: stubResolver.edcIriFor,
		edcUri,
		stubResolver,
		registry: opened.result.registryLoad.registry,
		uriContractReader: opened.result.uriContractReader,
		Database,
		retrievalModules: { candidateRetrievalLib, hubEdgeType: vocabularyLib.hubEdgeType, dmeRoles: vocabularyLib.DME_ROLES },
	};
};

// readerForRequest — a question reads EVERY member block of its manifest, verifying and holding each in memory for as long as the whole answer is
// being built, and then ignores all but the relationship blocks: the 476 MB CEDS base among them took a child past a 768 MB heap (measured, G2 run 1).
// For those kinds the blocks it would ignore are answered with their kind alone, so the answer is byte-identical and a question costs what it uses.
const readerForRequest = ({ forgeResolver, uriOrPath, uriContractFilePath }) => {
	const parsed = forgeResolver.edcUri.parse(forgeResolver.edcIriFor(uriOrPath));
	const wholeBlockRule = parsed.error ? undefined : WHOLE_BLOCK_RULE_BY_KIND[parsed.kind];
	if (wholeBlockRule === undefined || wholeBlockRule.readsRelationshipBlocksOnly !== true) {
		return forgeResolver.uriContractReader;
	}
	const blockKindStatement = new forgeResolver.Database(uriContractFilePath, { readonly: true, fileMustExist: true }).prepare('SELECT kind FROM schemaBlocks WHERE refId = ?');
	return {
		...forgeResolver.uriContractReader,
		schemaBlockFor: (schemaBlockRefId, done) => {
			const blockKindRow = blockKindStatement.get(schemaBlockRefId);
			if (blockKindRow !== undefined && blockKindRow.kind !== RELATIONSHIP_BLOCK_KIND) {
				done('', { schemaBlockRefId, blockKind: blockKindRow.kind, subject: null, version: null, text: '' });
				return;
			}
			forgeResolver.uriContractReader.schemaBlockFor(schemaBlockRefId, done);
		},
	};
};

// resolveThroughForge — one resolution; a thrown exception answers 500 by name instead of reaching the API's event loop
const resolveThroughForge = ({ forgeResolver, uriOrPath, uriContractReader }, callback) => {
	const { resolveEdcUri, registry } = forgeResolver;
	const attempted = attemptForgeCall(() => resolveEdcUri({ uriOrPath, registry, uriContractReader }, (resolveError, resolved) => callback(resolveError ? { httpStatus: 500, body: { error: resolveError } } : resolved)), 'resolving');
	if (attempted.error) {
		callback({ httpStatus: 500, body: { error: attempted.error } });
	}
};

// the forge commit: DEPLOYED_COMMIT.txt where a deploy wrote one (a subtree rsync brings no .git, and the .git beside it on the server is another
// checkout's), else the checkout's own HEAD; a tree stating neither says so
const forgeCommitOf = (educoreForgeCodePath) => {
	const stampFilePath = path.join(educoreForgeCodePath, 'DEPLOYED_COMMIT.txt');
	if (fs.existsSync(stampFilePath)) {
		return fs.readFileSync(stampFilePath, 'utf8').trim();
	}
	const headFilePath = path.join(educoreForgeCodePath, '..', '.git', 'HEAD');
	if (!fs.existsSync(headFilePath) || !fs.statSync(headFilePath).isFile()) {
		return 'unknown (no DEPLOYED_COMMIT.txt, no readable .git/HEAD)';
	}
	const headText = fs.readFileSync(headFilePath, 'utf8').trim();
	const refFilePath = path.join(path.dirname(headFilePath), headText.replace(/^ref: /, ''));
	return headText.startsWith('ref: ') && fs.existsSync(refFilePath) ? fs.readFileSync(refFilePath, 'utf8').trim() : headText;
};

const configRefusalFor = (configValues) => {
	const absentNameList = REQUIRED_TEXT_CONFIG_NAME_LIST.concat(REQUIRED_POSITIVE_INTEGER_CONFIG_NAME_LIST).filter((configName) => !configValues[configName]);
	if (absentNameList.length) {
		return `${moduleName}: this instance's [edc-resolver] config section does not give ${absentNameList.join(', ')}; the resolver is off here`;
	}
	const badNumberNameList = REQUIRED_POSITIVE_INTEGER_CONFIG_NAME_LIST.filter((configName) => !/^[1-9][0-9]*$/.test(String(configValues[configName])));
	return badNumberNameList.length ? `${moduleName}: [edc-resolver] ${badNumberNameList.join(', ')} must be positive integers` : '';
};

// a foreign call that answers by callback: a throw becomes the callback's error, once, and an answer already given is not given again
const attemptForgeCallback = (forgeCall, whatFailed, callback) => {
	let hasAnswered = false;
	const answerOnce = (...answerList) => {
		if (!hasAnswered) {
			hasAnswered = true;
			callback(...answerList);
		}
	};
	const attempted = attemptForgeCall(() => forgeCall(answerOnce), whatFailed);
	if (attempted.error) {
		answerOnce(attempted.error);
	}
};

const loadJudgeModulesFrom = (educoreForgeCodePath) => {
	const loaded = attemptForgeCall(() => Object.keys(JUDGE_MODULE_RELATIVE_PATH_BY_NAME).reduce((soFar, moduleLabel) => ({ ...soFar, [moduleLabel]: require(path.join(educoreForgeCodePath, ...JUDGE_MODULE_RELATIVE_PATH_BY_NAME[moduleLabel])) }), {}), `loading the judge from ${educoreForgeCodePath}`);
	if (loaded.error) {
		return { error: loaded.error };
	}
	const { judgeComponentLib, evidenceRendererLib, promptIdentifierScanLib, spendPricingLib, spendLedgerLib, spendRecordLib, llmClientFactory } = loaded.result;
	const forgesDirPath = path.join(educoreForgeCodePath, 'forges');
	return {
		judgeOne: (judgeInput, callback) => attemptForgeCallback((answerOnce) => judgeComponentLib.judgeOne(judgeInput, answerOnce), 'judging', callback),
		renderQuestion: (renderInput) => {
			const attempted = attemptForgeCall(() => evidenceRendererLib.renderQuestion(renderInput), 'rendering a question');
			return attempted.error ? { error: { message: attempted.error } } : attempted.result;
		},
		// a hub's identifier scan, compiled once, and the two surfaces Rosetta asks it about
		promptIdentifierScanFor: ({ scanDeclaration, standardKey }) => {
			const attempted = attemptForgeCall(() => {
				const identifierList = scanDeclaration.identifierListPath === null ? null : promptIdentifierScanLib.readIdentifierList({ filePath: promptIdentifierScanLib.identifierListFilePathFor({ identifierListPath: scanDeclaration.identifierListPath, forgesDirPath, standardKey }) });
				return promptIdentifierScanLib.compileScan({ scanDeclaration, identifierList }).compiledScan;
			}, `compiling the identifier scan of ${standardKey}`);
			return attempted.error ? { error: attempted.error } : {
				firstHitIn: (surfaceTextByName) => promptIdentifierScanLib.scanSurfaces({ compiledScan: attempted.result, surfaceTextByName }).hit,
				surfacesOfQuestion: ({ predicateRule, question }) => promptIdentifierScanLib.questionSurfaceTextByName({ predicateRule, question }),
			};
		},
		loadSpendPricing: ({ pricingFilePath }) => {
			const attempted = attemptForgeCall(() => spendPricingLib.loadSpendPricing({ pricingFilePath }), `reading prices from ${pricingFilePath}`);
			if (attempted.error || attempted.result.error) {
				return { error: attempted.error || attempted.result.error };
			}
			const { spendPricer } = attempted.result;
			const attemptPricing = (priceInput, askPrice) => {
				const priced = attemptForgeCall(() => askPrice(priceInput), 'pricing a call');
				return priced.error ? { error: priced.error } : priced.result;
			};
			return { spendPricer: { ...spendPricer, usdFor: (priceInput) => attemptPricing(priceInput, spendPricer.usdFor), priceRowFor: (priceInput) => attemptPricing(priceInput, spendPricer.priceRowFor) } };
		},
		// ⟪rosettaMeanings review B1⟫ the prompt variants this forge renders, so a judge configured for one it lacks is refused at startup, by name
		judgePromptVariantNameList: Object.keys(evidenceRendererLib.JUDGE_PROMPT_VARIANT_REGISTRY || {}),
		spendLedgerLib,
		spendRecordLib, // ⟪rosettaFreeInput⟫ the forge's own spend record and totals, so rosetta/interpret builds its ledger line by the forge's rules rather than by hand
		// a configuration fault in the client is a throw at construction, by the client's own rule: here it becomes { error }. It never echoes a credential.
		createLlmClient: (constructionOptions) => {
			const attempted = attemptForgeCall(() => llmClientFactory(constructionOptions), 'constructing the judge client');
			return attempted.error ? { error: attempted.error } : { judgeClient: attempted.result };
		},
		hubBridgingFor: ({ forgeBundleName, hubBridgingModuleName }) => {
			const attempted = attemptForgeCall(() => require(path.join(forgesDirPath, forgeBundleName, 'lib', hubBridgingModuleName)).hubBridging, `reading the hub half of ${forgeBundleName}`);
			return attempted.error ? { error: attempted.error } : { hubBridging: attempted.result };
		},
	};
};

const openForgeAdapter = ({ configValues }) => {
	const configRefusal = configRefusalFor(configValues);
	if (configRefusal) {
		return { refusalText: configRefusal };
	}
	const { educoreForgeCodePath, uriContractFilePath, publicPathPrefix } = configValues;
	const forgeResolver = loadForgeResolver({ educoreForgeCodePath, uriContractFilePath });
	if (forgeResolver.error) {
		return { refusalText: forgeResolver.error };
	}
	// the routing statements are prepared here so a store or an SQLite that cannot run them is a startup refusal, not a fault on a visitor's request
	const routingStatementsPrepared = attemptForgeCall(() => {
		const routingHandle = new forgeResolver.Database(uriContractFilePath, { readonly: true, fileMustExist: true });
		return Object.keys(WHOLE_BLOCK_RULE_BY_KIND).filter((oneKind) => WHOLE_BLOCK_RULE_BY_KIND[oneKind].byteSizeSql !== undefined || WHOLE_BLOCK_RULE_BY_KIND[oneKind].siblingCountSql !== undefined).reduce((soFar, oneKind) => ({ ...soFar, [oneKind]: routingHandle.prepare(WHOLE_BLOCK_RULE_BY_KIND[oneKind].byteSizeSql || WHOLE_BLOCK_RULE_BY_KIND[oneKind].siblingCountSql) }), {});
	}, `preparing the routing reads on ${uriContractFilePath}`);
	if (routingStatementsPrepared.error) {
		return { refusalText: routingStatementsPrepared.error };
	}
	const routingStatementByKind = routingStatementsPrepared.result;
	const wholeBlockMaxBytes = Number(configValues.wholeBlockMaxBytes);
	const directBlockMaxBytes = Number(configValues.directBlockMaxBytes);
	const { layerRegistry, agentRegistry } = forgeResolver.registry;

	// routeFor(edcRequestPath) → { routeName: 'inProcess' | 'wholeBlockChild' | 'directBlock' | 'overCap', kind, byteSize }
	// A query on a kind that takes none is refused before any read, and an absent block reads nothing, so both resolve in process.
	const routeFor = (edcRequestPath) => {
		const parsed = forgeResolver.edcUri.parse(forgeResolver.edcIriFor(edcRequestPath));
		if (parsed.error) {
			return { routeName: 'inProcess' };
		}
		const wholeBlockRule = WHOLE_BLOCK_RULE_BY_KIND[parsed.kind];
		if (wholeBlockRule === undefined || (edcRequestPath.indexOf('?') !== -1 && wholeBlockRule.takesQuery !== true)) {
			return { routeName: 'inProcess', kind: parsed.kind };
		}
		if (wholeBlockRule.siblingCountSql !== undefined) {
			const { standardName, standardVersion, elementStableId } = parsed.partByName;
			const { siblingCount } = routingStatementByKind[parsed.kind].get(standardName, standardVersion, elementStableId);
			return { routeName: siblingCount > ELEMENT_SIBLING_COUNT_IN_PROCESS ? 'wholeBlockChild' : 'inProcess', kind: parsed.kind };
		}
		if (wholeBlockRule.byteSizeSql === undefined) {
			return { routeName: 'wholeBlockChild', kind: parsed.kind };
		}
		const sizeRow = routingStatementByKind[parsed.kind].get(parsed.partByName[wholeBlockRule.blockIdentityPartName]);
		if (sizeRow === undefined) {
			return { routeName: 'inProcess', kind: parsed.kind };
		}
		if (sizeRow.byteSize <= wholeBlockMaxBytes) {
			return { routeName: 'wholeBlockChild', kind: parsed.kind };
		}
		return { routeName: sizeRow.byteSize <= directBlockMaxBytes ? 'directBlock' : 'overCap', kind: parsed.kind, byteSize: sizeRow.byteSize, blockIdentity: parsed.partByName[wholeBlockRule.blockIdentityPartName] };
	};

	return {
		routeFor,
		resolveInProcess: (edcRequestPath, callback) => resolveThroughForge({ forgeResolver, uriOrPath: edcRequestPath, uriContractReader: forgeResolver.uriContractReader }, callback),
		edcIriFor: forgeResolver.edcIriFor,
		edcUri: forgeResolver.edcUri,
		retrievalModules: forgeResolver.retrievalModules,
		loadJudgeModules: () => loadJudgeModulesFrom(educoreForgeCodePath),
		openStoreReadHandle: () => {
			const opened = attemptForgeCall(() => new forgeResolver.Database(uriContractFilePath, { readonly: true, fileMustExist: true }), `opening ${uriContractFilePath} read-only`);
			return opened.error ? { error: opened.error } : { storeHandle: opened.result };
		},
		baseIri: forgeResolver.edcUri.URI_SCHEME.baseIri,
		publicPathPrefix,
		educoreForgeCodePath,
		uriContractFilePath,
		wholeBlockMaxBytes,
		directBlockMaxBytes,
		directBlockTimeoutMilliseconds: Number(configValues.directBlockTimeoutMilliseconds),
		directBlockSqliteCommandPath: configValues.directBlockSqliteCommandPath,
		sizeRefusalContactAddress: configValues.sizeRefusalContactAddress,
		wholeBlockMaxOldSpaceMegabytes: Number(configValues.wholeBlockMaxOldSpaceMegabytes),
		wholeBlockTimeoutMilliseconds: Number(configValues.wholeBlockTimeoutMilliseconds),
		startupLine: `${moduleName}: resolver open; forge ${educoreForgeCodePath} at commit ${forgeCommitOf(educoreForgeCodePath)}; store ${uriContractFilePath} (read-only); registry ${layerRegistry.layerList.length} layers, ${agentRegistry.agentList.length} agents`,
	};
};

module.exports = { openForgeAdapter, loadForgeResolver, readerForRequest, resolveThroughForge, moduleName };
