'use strict';

// rater-tool-access.js — the CEDS Rater's shared resources, built ONCE by data-model.js and injected into the rater
// access points as `raterToolAccess` (lane RATER, 2026-10-14):
//   - the rater store: its own sqlite file (raterTool.storeFilePath), created on first start;
//   - the frozen inputs: sample.json and suggested.json from raterTool.frozenInputDirPath, never recomputed;
//   - the gold: THE DME's configured gold (dataModelExplorerSearch.goldenContainerName, the golden pointer), passed in as
//     goldenContainerName; ⟪lane zbE, E4, TQ ruling 2026-10-23⟫ the rater no longer pins a gold of its own. Opened on first
//     use and kept; while it cannot be reached every graph read is refused by name (and retried on the next request);
//   - the query embedder for meaning search.
//
//   initRaterToolAccess({ raterToolConfig, goldenContainerName, sqlDbGen, dataMapping }, callback(errText, raterToolAccess))
//
// raterToolAccess:
//   setupRefusal                          null, or { refusalName, refusalText } when the tool cannot run at all
//   goldenContainerName, surveyNameList, sampleDocument, suggestedDocument, elementByStableId, elementListBySurvey
//   getStoreTable(tableRole, callback(errText, tableRef))
//   getRaterGraph(callback(errText, { raterGraph } | { refusal }))
//   getEmbedder() -> { embedder } | { refusal }
// A missing [raterTool] section is not an error: the server boots, and every rater endpoint answers setupRefusal.

const fs = require('fs');
const path = require('path');
const { openRaterGraph } = require('./rater-graph');
const { createRaterEmbedder } = require('./rater-embedder');

const RATER_SETUP_REFUSAL_NAME_LIST = Object.freeze(['raterToolNotConfigured', 'raterConfigInvalid', 'frozenInputsAbsent']);
const REQUIRED_CONFIG_NAME_LIST = Object.freeze(['storeFilePath', 'frozenInputDirPath', 'queryTimeoutMs']);
const STORE_TABLE_NAME_BY_ROLE = Object.freeze({ raters: 'raters', answers: 'answers', answerHistory: 'answerHistory', searchLog: 'searchLog' });
// the store's columns, declared: sqlite-instance adds a column only on a table's first save of it, so a query on a fresh
// store would fail with 'no such column'. ensureStoreColumns adds any declared column a table lacks, at start-up.
const STORE_COLUMN_LIST_BY_ROLE = Object.freeze({
	raters: ['raterUserName', 'surveyName', 'displayJson', 'raterSeedText', 'lastActiveAt', 'finishedAt'],
	answers: ['raterUserName', 'elementStableId', 'answerJson', 'savedAt'],
	answerHistory: ['raterUserName', 'elementStableId', 'answerJson', 'savedAt', 'historySequence'],
	searchLog: ['raterUserName', 'elementStableId', 'searchMode', 'searchJson', 'resultCount', 'searchedAt'],
});

const ensureStoreColumns = ({ raterStoreDb, dataMapping }, callback) => {
	const raterMapper = dataMapping['rater-tool'];
	const tableRoleList = Object.keys(STORE_COLUMN_LIST_BY_ROLE);
	const ensureNext = (tablePosition) => {
		if (tablePosition >= tableRoleList.length) {
			callback('');
			return;
		}
		const tableRole = tableRoleList[tablePosition];
		raterStoreDb.getTable(STORE_TABLE_NAME_BY_ROLE[tableRole], (tableError, tableRef) => {
			if (tableError) {
				callback(`the rater store table ${tableRole} did not open: ${tableError}`);
				return;
			}
			tableRef.getData(raterMapper.getSql('tableColumnList', {}), { suppressStatementLog: true, noTableNameOk: true }, (readError, columnRowList) => {
				if (readError) {
					callback(`reading the columns of ${tableRole} failed: ${readError}`);
					return;
				}
				const presentNameList = (columnRowList || []).map((columnRow) => columnRow.name);
				const missingNameList = STORE_COLUMN_LIST_BY_ROLE[tableRole].filter((columnName) => presentNameList.indexOf(columnName) === -1);
				if (missingNameList.length === 0) {
					ensureNext(tablePosition + 1);
					return;
				}
				tableRef.runStatement(missingNameList.map((columnName) => raterMapper.getSql('addTextColumn', { columnName })).join('\n'), { suppressStatementLog: true, noTableNameOk: true }, (alterError) =>
					alterError ? callback(`adding columns to ${tableRole} failed: ${alterError}`) : ensureNext(tablePosition + 1));
			});
		});
	};
	ensureNext(0);
};

const setupRefusalOf = (refusalName, refusalText) => {
	if (RATER_SETUP_REFUSAL_NAME_LIST.indexOf(refusalName) === -1) {
		throw new Error(`rater-tool-access: '${refusalName}' is not one of ${RATER_SETUP_REFUSAL_NAME_LIST.join(', ')}`);
	}
	return { setupRefusal: { refusalName, refusalText: `CEDS Rater: ${refusalText}` } };
};

const readFrozenInputs = ({ frozenInputDirPath }) => {
	const sampleFilePath = path.join(frozenInputDirPath, 'sample.json');
	const suggestedFilePath = path.join(frozenInputDirPath, 'suggested.json');
	const absentFilePathList = [sampleFilePath, suggestedFilePath].filter((filePath) => !fs.existsSync(filePath));
	if (absentFilePathList.length > 0) {
		return setupRefusalOf('frozenInputsAbsent', `the frozen inputs are missing (${absentFilePathList.join(', ')}); build them with raterTool.js -buildSample and -buildSuggested.`);
	}
	const sampleDocument = JSON.parse(fs.readFileSync(sampleFilePath, 'utf8'));
	const suggestedDocument = JSON.parse(fs.readFileSync(suggestedFilePath, 'utf8'));
	// the frozen documents still record the gold they were BUILT from (provenance); the tool reads the DME's gold, and
	// raterGraphCorrectnessCheck.js (testData/zeroBacklog/e4) proved every frozen item reads identically on both
	const elementByStableId = sampleDocument.elementList.reduce((soFar, element) => ({ ...soFar, [element.elementStableId]: element }), {});
	const elementListBySurvey = sampleDocument.surveyNameList.reduce((soFar, surveyName) => ({
		...soFar,
		[surveyName]: sampleDocument.elementList.filter((element) => element.surveyName === surveyName).sort((elementA, elementB) => (elementA.elementStableId < elementB.elementStableId ? -1 : 1)),
	}), {});
	return { sampleDocument, suggestedDocument, elementByStableId, elementListBySurvey, surveyNameList: sampleDocument.surveyNameList };
};

const initRaterToolAccess = ({ raterToolConfig, goldenContainerName, sqlDbGen, dataMapping }, callback) => {
	if (!raterToolConfig) {
		callback('', setupRefusalOf('raterToolNotConfigured', 'this server has no [raterTool] configuration (raterTool.ini merged into startApiServer.ini), so the rater tool is off here.'));
		return;
	}
	// the ini reader gives a number for a numeric value (queryTimeoutMs=30000) and a string otherwise
	const isAbsent = (configValue) => configValue === undefined || configValue === null || (typeof configValue === 'string' && (configValue.trim() === '' || configValue.indexOf('<!') !== -1));
	const missingNameList = REQUIRED_CONFIG_NAME_LIST.filter((configName) => isAbsent(raterToolConfig[configName]));
	const queryTimeoutMs = parseInt(raterToolConfig.queryTimeoutMs, 10);
	if (missingNameList.length > 0 || !(queryTimeoutMs > 0)) {
		callback('', setupRefusalOf('raterConfigInvalid', `[raterTool] is missing or has unresolved ${missingNameList.join(', ') || 'queryTimeoutMs (a positive number)'}.`));
		return;
	}
	if (isAbsent(goldenContainerName)) {
		callback('', setupRefusalOf('raterConfigInvalid', 'the DME names no gold (dataModelExplorerSearch.goldenContainerName, from _goldenContainer.ini); the rater reads the DME\'s gold and has none of its own.'));
		return;
	}
	const frozenInputs = readFrozenInputs({ frozenInputDirPath: raterToolConfig.frozenInputDirPath });
	if (frozenInputs.setupRefusal) {
		callback('', frozenInputs);
		return;
	}
	fs.mkdirSync(path.dirname(raterToolConfig.storeFilePath), { recursive: true });
	sqlDbGen.initDatabaseInstance(raterToolConfig.storeFilePath, (storeError, raterStoreDb) => {
		if (storeError) {
			callback(`rater-tool-access: the rater store ${raterToolConfig.storeFilePath} did not open: ${storeError}`);
			return;
		}
		ensureStoreColumns({ raterStoreDb, dataMapping }, (columnError) => {
		if (columnError) {
			callback(`rater-tool-access: ${columnError}`);
			return;
		}
		let openedRaterGraph = null;
		const getRaterGraph = (graphCallback) => {
			if (openedRaterGraph) {
				graphCallback('', { raterGraph: openedRaterGraph });
				return;
			}
			openRaterGraph({ goldenContainerName, queryTimeoutMs }, (openError, openResult) => {
				if (openError) {
					graphCallback(openError);
					return;
				}
				if (openResult.raterGraph) {
					openedRaterGraph = openResult.raterGraph;
				}
				graphCallback('', openResult);
			});
		};
		const embedderAnswer = createRaterEmbedder({ voyageApiKey: raterToolConfig.voyageApiKey });
		const getStoreTable = (tableRole, tableCallback) => {
			if (!STORE_TABLE_NAME_BY_ROLE[tableRole]) {
				tableCallback(`rater-tool-access: no store table for role '${tableRole}'`);
				return;
			}
			raterStoreDb.getTable(STORE_TABLE_NAME_BY_ROLE[tableRole], tableCallback);
		};
		callback('', {
			setupRefusal: null,
			goldenContainerName,
			storeFilePath: raterToolConfig.storeFilePath,
			...frozenInputs,
			getStoreTable,
			getRaterGraph,
			getEmbedder: () => embedderAnswer,
		});
		});
	});
};

module.exports = { initRaterToolAccess, RATER_SETUP_REFUSAL_NAME_LIST, STORE_TABLE_NAME_BY_ROLE, STORE_COLUMN_LIST_BY_ROLE };
