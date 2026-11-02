#!/usr/bin/env node
'use strict';

// forgeAdapter — the ONE place educore requires the educoreForge tree (edcResolverEndpoint-110226, briefing section 1). It loads the edc: resolver
// and the uriContract reader from a forge checkout named by config, because their closure is a third of the forge and a copy would be a fork.
//
//   loadForgeResolver({ educoreForgeCodePath, uriContractFilePath }) → { error } | { resolveEdcUri, edcIriFor, edcUri, registry, uriContractReader, Database }
//       used by the API (through openForgeAdapter) and by the whole-block child (resolveOneUri.js)
//   openForgeAdapter({ configValues }) → { refusalText } | { routeFor, resolveInProcess, edcIriFor, baseIri, startupLine, ...configured values }
//
// The store opens once, read-only, at startup. An open handle keeps the old inode, so REPLACING THE STORE FILE IS AN API RESTART. So is any change to
// the licence hold list the block kinds obey, which stubResolver.js freezes at require time: a hold change takes a forge re-sync plus an API restart.
// THE try BLOCK IS THE BOUNDARY, as attemptSql is in the forge: a foreign tree's exception becomes an error string here, because the API must
// start and keep serving whatever state that tree is in. No flow of this module is steered by an exception of its own.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const fs = require('fs');
const path = require('path');

const RELATIONSHIP_BLOCK_KIND = 'relationship';
const REQUIRED_TEXT_CONFIG_NAME_LIST = ['educoreForgeCodePath', 'uriContractFilePath', 'publicPathPrefix'];
const REQUIRED_POSITIVE_INTEGER_CONFIG_NAME_LIST = ['wholeBlockMaxBytes', 'wholeBlockMaxOldSpaceMegabytes', 'wholeBlockTimeoutMilliseconds'];

// the kinds that read whole block text (briefing section 4). A size rule means the block's byte size can be read first and capped without spawning.
const WHOLE_BLOCK_RULE_BY_KIND = Object.freeze({
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
	}), `loading the forge tree at ${educoreForgeCodePath}`);
	if (loaded.error) {
		return { error: loaded.error };
	}
	const { uriContractLib, stubResolver, edcUri, Database } = loaded.result;
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
		registry: opened.result.registryLoad.registry,
		uriContractReader: opened.result.uriContractReader,
		Database,
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
	// the size statements are prepared here so a store or an SQLite that cannot run them is a startup refusal, not a fault on a visitor's request
	const sizeStatementsPrepared = attemptForgeCall(() => {
		const sizeHandle = new forgeResolver.Database(uriContractFilePath, { readonly: true, fileMustExist: true });
		return Object.keys(WHOLE_BLOCK_RULE_BY_KIND).filter((oneKind) => WHOLE_BLOCK_RULE_BY_KIND[oneKind].byteSizeSql !== undefined).reduce((soFar, oneKind) => ({ ...soFar, [oneKind]: sizeHandle.prepare(WHOLE_BLOCK_RULE_BY_KIND[oneKind].byteSizeSql) }), {});
	}, `preparing the block size reads on ${uriContractFilePath}`);
	if (sizeStatementsPrepared.error) {
		return { refusalText: sizeStatementsPrepared.error };
	}
	const sizeStatementByKind = sizeStatementsPrepared.result;
	const wholeBlockMaxBytes = Number(configValues.wholeBlockMaxBytes);
	const { layerRegistry, agentRegistry } = forgeResolver.registry;

	// routeFor(edcRequestPath) → { routeName: 'inProcess' | 'wholeBlockChild' | 'overCap', kind, byteSize }
	// A request carrying a query is refused before any read, and an absent block reads nothing, so both resolve in process.
	const routeFor = (edcRequestPath) => {
		const parsed = forgeResolver.edcUri.parse(forgeResolver.edcIriFor(edcRequestPath));
		if (parsed.error) {
			return { routeName: 'inProcess' };
		}
		const wholeBlockRule = WHOLE_BLOCK_RULE_BY_KIND[parsed.kind];
		if (wholeBlockRule === undefined || edcRequestPath.indexOf('?') !== -1) {
			return { routeName: 'inProcess', kind: parsed.kind };
		}
		if (wholeBlockRule.byteSizeSql === undefined) {
			return { routeName: 'wholeBlockChild', kind: parsed.kind };
		}
		const sizeRow = sizeStatementByKind[parsed.kind].get(parsed.partByName[wholeBlockRule.blockIdentityPartName]);
		if (sizeRow === undefined) {
			return { routeName: 'inProcess', kind: parsed.kind };
		}
		return sizeRow.byteSize > wholeBlockMaxBytes
			? { routeName: 'overCap', kind: parsed.kind, byteSize: sizeRow.byteSize, blockIdentity: parsed.partByName[wholeBlockRule.blockIdentityPartName] }
			: { routeName: 'wholeBlockChild', kind: parsed.kind };
	};

	return {
		routeFor,
		resolveInProcess: (edcRequestPath, callback) => resolveThroughForge({ forgeResolver, uriOrPath: edcRequestPath, uriContractReader: forgeResolver.uriContractReader }, callback),
		edcIriFor: forgeResolver.edcIriFor,
		baseIri: forgeResolver.edcUri.URI_SCHEME.baseIri,
		publicPathPrefix,
		educoreForgeCodePath,
		uriContractFilePath,
		wholeBlockMaxBytes,
		wholeBlockMaxOldSpaceMegabytes: Number(configValues.wholeBlockMaxOldSpaceMegabytes),
		wholeBlockTimeoutMilliseconds: Number(configValues.wholeBlockTimeoutMilliseconds),
		startupLine: `${moduleName}: resolver open; forge ${educoreForgeCodePath} at commit ${forgeCommitOf(educoreForgeCodePath)}; store ${uriContractFilePath} (read-only); registry ${layerRegistry.layerList.length} layers, ${agentRegistry.agentList.length} agents`,
	};
};

module.exports = { openForgeAdapter, loadForgeResolver, readerForRequest, resolveThroughForge, moduleName };
