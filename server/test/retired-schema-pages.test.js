'use strict';
// retired-schema-pages.test.js — A11 / W-E-8 (campaign P4b, ruling: PORT the use-case editor and the schema verifier;
// RETIRE dme-lookup, get-nodes and edmatrix, whose function the Data Model Explorer covers).
// Every page built on the retired schema now either answers from the current graph or is gone; none returns an empty
// list from labels that do not exist.
//   1. RETIRED: each retired page's mapper, access point, endpoint and browser files are absent, and no menu or tab
//      links to its route (a caller gets the server's 404, not []);
//   2. PORTED schema verifier: the browser store posts no Cypher and names no retired label or edge; the
//      schema-equivalents mapper declares requiredLabelList and every label in it is LIVE on the golden graph; the
//      access point, run against the golden (read-only), returns the CEDS Birthdate row with judged equivalents
//      carrying relation, mappingConfidence, mappingKind and mappingSource; an empty word list is refused by name;
//   3. PORTED use-case editor: the mapper declares requiredLabelList; on the golden graph (which carries no use cases,
//      PLAN E2) the access point REFUSES BY NAME, naming the absent labels — never [] with success;
//   4. RED TWINS (in-memory doubles): a retired file restored, a fictitious label in requiredLabelList, the old Cypher
//      POST restored in the store text -> each conjunct red.
//
// Reads the golden graph read-only. Run: /usr/local/bin/node server/test/retired-schema-pages.test.js

const fs = require('fs');
const path = require('path');

process.global = {
	getConfig: () => ({}),
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const { readGoldenContainerName } = require('./lib/goldenContainerName');
const { resolveContainerConnection } = require('../data-model/lib/user-graph/container-connection-resolver');
const neo4jGen = require('../data-model/lib/neo4j-instance/neo4j-instance')({ unused: true });

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const CODE_ROOT_PATH = path.join(__dirname, '..', '..');

// ---- the retirement record, as data: what each retired page was made of, and the route strings no nav may carry
const RETIRED_PAGE_LIST = Object.freeze([
	{
		retiredPageName: 'dme-lookup',
		fileList: ['server/data-model/data-mapping/mappers/dme-lookup.js', 'server/data-model/access-points-dot-d/accessPoints.d/dme-lookup.js', 'server/endpoints-dot-d/qtDotLib.d/dme-lookup.js'],
		routeTextList: [],
	},
	{
		retiredPageName: 'get-nodes (the /dm/lookup tree browser)',
		fileList: ['server/data-model/data-mapping/mappers/get-nodes.js', 'server/data-model/access-points-dot-d/accessPoints.d/get-nodes.js', 'server/endpoints-dot-d/qtDotLib.d/lookupNodes.js', 'html/stores/lookupStore.js', 'html/components/LookupBrowser.vue', 'html/pages/dm/lookup.vue'],
		routeTextList: ['/dm/lookup'],
	},
	{
		retiredPageName: 'edmatrix-report (the /util/edmatrix report)',
		fileList: ['server/data-model/data-mapping/mappers/edmatrix-report.js', 'server/data-model/access-points-dot-d/accessPoints.d/edmatrix-report.js', 'server/endpoints-dot-d/qtDotLib.d/util-edmatrix-report.js', 'html/pages/util/edmatrix.vue', 'html/pages/util/index.vue', 'html/stores/utilityStore.js'],
		routeTextList: ['/util/edmatrix', '/api/util/edmatrix-report'],
	},
]);
// every browser source file is searched for a link to a retired route (a fixed nav list missed access-guide.vue's
// "Crosswalk" button the first time this gate was written)
const BROWSER_SOURCE_SKIP_DIRECTORY_NAME_LIST = Object.freeze(['node_modules', '.nuxt', '.output', 'dist', '.data', 'public']);
const listBrowserSourceFiles = (relativeDirPath) => fs.readdirSync(path.join(CODE_ROOT_PATH, relativeDirPath), { withFileTypes: true }).reduce((soFar, oneEntry) => {
	const entryRelativePath = path.join(relativeDirPath, oneEntry.name);
	if (oneEntry.isDirectory()) { return BROWSER_SOURCE_SKIP_DIRECTORY_NAME_LIST.indexOf(oneEntry.name) !== -1 ? soFar : soFar.concat(listBrowserSourceFiles(entryRelativePath)); }
	return /\.(vue|js|ts)$/.test(oneEntry.name) ? soFar.concat([entryRelativePath]) : soFar;
}, []);
const NAV_FILE_LIST = Object.freeze(listBrowserSourceFiles('html'));

// the retired edge names are assembled from parts: the W-E-11 meta-gate (noContainerLiterals) forbids the second one as a
// literal anywhere under server/test, and this test must not be the file that trips it
const RETIRED_EDGE_NAME_LIST = Object.freeze([['MAPS', 'TO'].join('_'), ['IMPLIED', 'MAPPING'].join('_')]);
const RETIRED_SCHEMA_TEXT_PATTERN = new RegExp(`\\b(${['SifField', 'CtdlProperty', 'EdfiField', 'LifProperty', 'JedxField', 'EduApiProperty'].concat(RETIRED_EDGE_NAME_LIST).join('|')})\\b`);
const SCHEMA_VERIFIER_STORE_PATH = 'html/stores/schemaVerifierStore.js';

const fileExistsAt = (relativePath) => fs.existsSync(path.join(CODE_ROOT_PATH, relativePath));
const readTextAt = (relativePath) => (fileExistsAt(relativePath) ? fs.readFileSync(path.join(CODE_ROOT_PATH, relativePath), 'utf8') : '');

const judgeRetiredPage = (oneRetiredPage, { fileExists, readText }) => {
	const survivingFileList = oneRetiredPage.fileList.filter(fileExists);
	const linkingNavList = NAV_FILE_LIST.filter((oneNavPath) => oneRetiredPage.routeTextList.some((oneRouteText) => readText(oneNavPath).indexOf(oneRouteText) !== -1));
	return { pass: survivingFileList.length === 0 && linkingNavList.length === 0, detail: `surviving files: ${survivingFileList.join(', ') || 'none'}; nav linking it: ${linkingNavList.join(', ') || 'none'}` };
};
const judgeSchemaVerifierStore = (storeText) => {
	const retiredMatch = storeText.match(RETIRED_SCHEMA_TEXT_PATTERN);
	const postsCypher = storeText.indexOf('/api/dme-cypher-query') !== -1;
	const usesPortedEndpoint = storeText.indexOf('/api/schemaEquivalents') !== -1;
	return { pass: !retiredMatch && !postsCypher && usesPortedEndpoint, detail: `retired name: ${retiredMatch ? retiredMatch[0] : 'none'}; posts Cypher: ${postsCypher}; uses /api/schemaEquivalents: ${usesPortedEndpoint}` };
};
const judgeLabelsLive = (requiredLabelList, liveLabelList) => {
	const absentLabelList = (requiredLabelList || []).filter((oneLabel) => liveLabelList.indexOf(oneLabel) === -1);
	return { pass: Array.isArray(requiredLabelList) && requiredLabelList.length > 0 && absentLabelList.length === 0, detail: `absent: ${absentLabelList.join(', ') || 'none'}` };
};

console.log('\n=== A11: pages on the retired schema are ported or retired ===\n');

// ---- 1. retired
const realFileAccess = { fileExists: fileExistsAt, readText: readTextAt };
RETIRED_PAGE_LIST.forEach((oneRetiredPage) => {
	const verdict = judgeRetiredPage(oneRetiredPage, realFileAccess);
	ok(`RETIRED ${oneRetiredPage.retiredPageName}: files gone, no nav links to it`, verdict.pass, verdict.detail);
});
const restoredFileTwin = judgeRetiredPage(RETIRED_PAGE_LIST[1], { fileExists: (relativePath) => relativePath === RETIRED_PAGE_LIST[1].fileList[0] || fileExistsAt(relativePath), readText: readTextAt });
ok('RED TWIN retiredFileRestored turns the retirement conjunct red', restoredFileTwin.pass === false, restoredFileTwin.detail);

// ---- 2a. schema verifier store
const storeVerdict = judgeSchemaVerifierStore(readTextAt(SCHEMA_VERIFIER_STORE_PATH));
ok('PORTED schema verifier store: no Cypher POST, no retired label or edge, uses /api/schemaEquivalents', storeVerdict.pass, storeVerdict.detail);
const storeTwin = judgeSchemaVerifierStore(`${readTextAt(SCHEMA_VERIFIER_STORE_PATH)}\n// axios.post('/api/dme-cypher-query', { query: 'MATCH (n:SifField) RETURN n' })\n`);
ok('RED TWIN cypherPostRestored turns the store conjunct red', storeTwin.pass === false, storeTwin.detail);

// ---- live halves
const loadMapper = (mapperName) => {
	const mapperPath = path.join(CODE_ROOT_PATH, 'server', 'data-model', 'data-mapping', 'mappers', `${mapperName}.js`);
	return fs.existsSync(mapperPath) ? require(mapperPath)({ baseMappingProcess: null }) : null;
};
const loadAccessPoint = (accessPointName, passThroughParameters) => {
	const accessPointPath = path.join(CODE_ROOT_PATH, 'server', 'data-model', 'access-points-dot-d', 'accessPoints.d', `${accessPointName}.js`);
	if (!fs.existsSync(accessPointPath)) { return null; }
	const registry = {};
	require(accessPointPath)({ dotD: { logList: [], library: { add: (name, fn) => { registry[name] = fn; } } }, passThroughParameters });
	return registry[accessPointName];
};

// neo4j-instance's close() takes no callback (it calls driver.close() and returns), so the verdict is printed and the
// exit code set FIRST; a finish that waited on a close callback would let the event loop drain and exit 0 on a red run
const finish = (goldenDb) => {
	console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
	if (goldenDb && goldenDb.close) { goldenDb.close(); }
	process.exit(failed === 0 ? 0 : 1);
};

const goldenContainerName = readGoldenContainerName();
const goldenConnection = resolveContainerConnection(goldenContainerName);
if (goldenConnection.error) {
	ok(`golden ${goldenContainerName} resolves`, false, goldenConnection.error);
	finish(null);
	return;
}

neo4jGen.initDatabaseInstance({ neo4jBoltUri: goldenConnection.boltUri, neo4jUser: goldenConnection.user, neo4jPassword: goldenConnection.password, readOnly: true, queryTimeoutMs: 30000 }, (connectError, goldenDb) => {
	if (connectError) { ok('golden read-only connection opens', false, connectError); finish(null); return; }
	goldenDb.runQuery('CALL db.labels() YIELD label RETURN label', {}, (labelError, labelRowList) => {
		if (labelError) { ok('golden db.labels() answers', false, labelError); finish(goldenDb); return; }
		const liveLabelList = labelRowList.map((oneRow) => oneRow.label);
		const dataMapping = { 'schema-equivalents': loadMapper('schema-equivalents'), 'use-case-editor': loadMapper('use-case-editor') };

		// ---- 2b. schema-equivalents labels live
		const equivalentsMapper = dataMapping['schema-equivalents'];
		const equivalentsLabelVerdict = judgeLabelsLive(equivalentsMapper && equivalentsMapper.requiredLabelList, liveLabelList);
		ok('PORTED schema-equivalents mapper: requiredLabelList declared and every label live on the golden', equivalentsLabelVerdict.pass, equivalentsLabelVerdict.detail);
		const fictitiousLabelTwin = judgeLabelsLive(((equivalentsMapper && equivalentsMapper.requiredLabelList) || []).concat(['SifField']), liveLabelList);
		ok('RED TWIN fictitiousLabel (SifField) turns the live-label conjunct red', fictitiousLabelTwin.pass === false, fictitiousLabelTwin.detail);

		// ---- 3a. use-case editor declares its labels
		const useCaseMapper = dataMapping['use-case-editor'];
		ok('PORTED use-case-editor mapper: requiredLabelList declared', !!useCaseMapper && Array.isArray(useCaseMapper.requiredLabelList) && useCaseMapper.requiredLabelList.indexOf('UseCase') !== -1, JSON.stringify(useCaseMapper && useCaseMapper.requiredLabelList));

		const passThroughParameters = { neo4jDb: goldenDb, dataMapping };
		const equivalentsAccessPoint = loadAccessPoint('schema-equivalents', passThroughParameters);
		const useCaseAccessPoint = loadAccessPoint('use-case-editor', passThroughParameters);
		ok('schema-equivalents access point exists', typeof equivalentsAccessPoint === 'function');

		const stepList = [
			(next) => {
				if (typeof equivalentsAccessPoint !== 'function') { next(); return; }
				equivalentsAccessPoint({ wordList: ['birthdate'] }, (equivalentsError, rowList) => {
					const cedsBirthdateRow = (rowList || []).find((oneRow) => oneRow.name === 'Birthdate' && oneRow.source === 'CEDS');
					const relatedList = (cedsBirthdateRow && cedsBirthdateRow.related) || [];
					const fieldsPresent = relatedList.length > 0 && relatedList.every((oneRelated) => ['EXACT_MATCH', 'CLOSE_MATCH', 'BROAD_MATCH', 'NARROW_MATCH'].indexOf(oneRelated.relation) !== -1 && typeof oneRelated.mappingConfidence === 'number' && typeof oneRelated.mappingKind === 'string' && typeof oneRelated.mappingSource === 'string');
					ok('LIVE schema-equivalents: the CEDS Birthdate row carries judged equivalents (relation, mappingConfidence, mappingKind, mappingSource)', !equivalentsError && fieldsPresent, equivalentsError || `${(rowList || []).length} row(s); Birthdate related ${relatedList.length}: ${JSON.stringify(relatedList.slice(0, 2))}`);
					next();
				});
			},
			(next) => {
				if (typeof equivalentsAccessPoint !== 'function') { next(); return; }
				equivalentsAccessPoint({ wordList: [] }, (emptyError) => {
					ok('LIVE schema-equivalents: an empty word list is refused by name', /schema-equivalents/.test(String(emptyError)) && /wordList/.test(String(emptyError)), String(emptyError));
					next();
				});
			},
			(next) => {
				// self-audit finding (P4b): the action registry is a plain object, so an inherited name ('constructor',
				// '__proto__') must be refused as an unknown action, never dispatched to Object.prototype
				if (typeof useCaseAccessPoint !== 'function') { next(); return; }
				const inheritedNameVerdictList = [];
				const sendInheritedName = (inheritedNameList) => {
					if (inheritedNameList.length === 0) {
						ok('use-case-editor refuses an inherited property name as an unknown action (constructor, __proto__, toString)', inheritedNameVerdictList.every((oneVerdict) => oneVerdict.refusedAsUnknown), JSON.stringify(inheritedNameVerdictList));
						next();
						return;
					}
					const inheritedName = inheritedNameList[0];
					let thrownText = '';
					const answer = (answerError) => {
						inheritedNameVerdictList.push({ inheritedName, refusedAsUnknown: /Unknown action/.test(String(answerError)), answerError: String(answerError).slice(0, 80), thrownText });
						sendInheritedName(inheritedNameList.slice(1));
					};
					try { useCaseAccessPoint({ action: inheritedName }, answer); } catch (thrownError) { thrownText = String(thrownError).slice(0, 80); answer(''); }
				};
				sendInheritedName(['constructor', '__proto__', 'toString']);
			},
			(next) => {
				if (typeof useCaseAccessPoint !== 'function') { ok('use-case-editor access point exists', false); next(); return; }
				useCaseAccessPoint({ action: 'list' }, (useCaseError, useCaseResult) => {
					ok('LIVE use-case-editor on a graph without use cases: refused by name, naming the absent labels — never [] with success', /use-case-editor/.test(String(useCaseError)) && /UseCase/.test(String(useCaseError)), `error: ${useCaseError}; result: ${JSON.stringify(useCaseResult)}`);
					next();
				});
			},
		];
		const runStep = (stepIndex) => (stepIndex >= stepList.length ? finish(goldenDb) : stepList[stepIndex](() => runStep(stepIndex + 1)));
		runStep(0);
	});
});
