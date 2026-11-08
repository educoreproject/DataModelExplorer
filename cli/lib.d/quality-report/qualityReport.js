#!/usr/bin/env node
'use strict';

// qualityReport.js — EDUcore's accuracy and mapping-quality report, regenerated for any golden build
// (WORKORDER-qualityReport-110826). Reads one named graph read-only and a snapshot of the CEDS Rater's store, and writes
// the report (markdown and HTML), its data file and one quality certificate per loaded standard.
// Run `qualityReport.js -help` for the full page.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const os = require('os');
const fs = require('fs');
const path = require('path');
const commandLineParser = require('qtools-parse-command-line');
const configFileProcessor = require('qtools-config-file-processor');
const { pipeRunner, taskListPlus, mergeArgs } = new (require('qtools-asynchronous-pipe-plus'))();

const HELP_TEXT = `NAME
    qualityReport.js — write EDUcore's accuracy and mapping-quality report and per-standard certificates for one graph

SYNOPSIS
    qualityReport.js -build --goldenContainerName=NAME --raterStoreFilePath=FILE [--outputDirPath=DIR] [--uriContractFilePath=FILE]
    qualityReport.js -help

DESCRIPTION
    Reads the named golden graph READ-ONLY (its container resolved by name through docker), the uriContract store
    read-only (the manifest's public label), the CEDS Rater's frozen sample and candidate lists (committed beside the
    rater tool) and a SNAPSHOT of the CEDS Rater's answer store, opened read-only. Writes report files only; it never
    writes to a graph or a store.

    The overall coverage and relation figures are the answers of the same stats and listStandards handlers that serve
    standards_stats and standards_standards; every per-standard breakdown is checked to sum to them, and the run is
    refused (breakdownDisagreesWithMcp) when one does not. The same graph and inputs give byte-identical files: the
    stamp names the graph's build and each input's sha256, and there is no wall-clock time in the output.

ACTIONS
    -build            Read, compute and WRITE: qualityReport.md, qualityReport.html, qualityReportData.json and
                      certificates/<standard>.md and .html (one per loaded standard, hubs included) into the output
                      directory, replacing files of those names.
    -help, --help, -h Print this page and exit 0.

OPTIONS
    --goldenContainerName=NAME   Required. The graph to report on, a docker container name (eg GOLD_261106_useCases).
    --raterStoreFilePath=FILE    Required. A copy of the CEDS Rater's sqlite store. The live store is on the demo box;
                                 the nightly backups there are never rotated, so name a dated backup and the report
                                 can be regenerated from the same file later (see EXAMPLES).
    --outputDirPath=DIR          Where to write. Without it: <code>/qualityReports/<goldenContainerName>/.
    --uriContractFilePath=FILE   The uriContract store. Without it: startApiServer.ini [edc-resolver] uriContractFilePath
                                 for this host.

EXAMPLES
    # copy a dated rater backup down (read-only on the box), then WRITE the report for the production golden
    scp educore:/home/demo/system/dataStores/raterTool/backups/raterTool-20261108-031501.sqlite3 ../dataStores/qualityReport/
    qualityReport.js -build --goldenContainerName=GOLD_261106_useCases --raterStoreFilePath=../dataStores/qualityReport/raterTool-20261108-031501.sqlite3
    # WRITES into a scratch directory instead
    qualityReport.js -build --goldenContainerName=GOLD_261106_useCases --raterStoreFilePath=/tmp/rater.sqlite3 --outputDirPath=/tmp/qualityReportRun

EXIT STATUS
    0 on success or help; 1 when the build fails or is refused (the reason is printed).

FILES
    cli/lib.d/quality-report/config/qualityReportRules.json   relations, confidence bands, origins, prior measurements
    cli/lib.d/rater-tool/frozenInputs/sample.json, suggested.json   the sample and the lists the raters saw
    cli/lib.d/rater-tool/config/suggestRules.json   the rater tool's rule for which edges are "the graph's card"
    configs/instanceSpecific/<instance>/startApiServer.ini   [edc-resolver] uriContractFilePath

NOTES
    Requires an arm64 node for better-sqlite3 on this Mac (~/.local/node/bin/node).

SEE ALSO
    educore/system/management/zNotesPlansDocs/qualityReport-110826/DEVLOG-qualityReport-110826.md
`;

const CODE_DIR_PATH = path.join(__dirname, '..', '..', '..');
const FROZEN_INPUT_DIR_PATH = path.join(CODE_DIR_PATH, 'cli', 'lib.d', 'rater-tool', 'frozenInputs');
const RULES_FILE_PATH = path.join(__dirname, 'config', 'qualityReportRules.json');

const findProjectRoot = ({ rootFolderName = 'system', closest = true } = {}) => __dirname.replace(new RegExp(`^(.*${closest ? '' : '?'}\\/${rootFolderName}).*$`), '$1');
const projectRoot = findProjectRoot();
const commandLineParameters = commandLineParser.getParameters({ noFunctions: true });
const { switches = {}, values = {} } = commandLineParameters;
const configDirPathByHostname = Object.freeze({ 'qMini.local': 'instanceSpecific/qbook', 'qbook.local': 'instanceSpecific/qbook' });
const configDirPath = `${projectRoot}/configs/${configDirPathByHostname[os.hostname()] || ''}/`;

process.global = Object.freeze({
	xLog: Object.freeze({ status: (messageText) => process.stderr.write(`${messageText}\n`), error: (messageText) => process.stderr.write(`ERROR: ${messageText}\n`), result: (messageText) => process.stdout.write(`${messageText}\n`), verbose: () => {} }),
	getConfig: () => ({}),
	commandLineParameters,
	projectRoot,
});
const { xLog } = process.global;

const firstValueOf = (valueName) => (values[valueName] ? values[valueName][0] : undefined);
const SYNOPSIS_TEXT = 'qualityReport.js -build --goldenContainerName=NAME --raterStoreFilePath=FILE [--outputDirPath=DIR] [--uriContractFilePath=FILE]';

const resolveInvocation = () => {
	if (!switches.build) {
		return { refusalText: `name the action -build.\n  ${SYNOPSIS_TEXT}\n(${moduleName}.js -help for the full page)` };
	}
	const missingNameList = ['goldenContainerName', 'raterStoreFilePath'].filter((valueName) => !firstValueOf(valueName));
	if (missingNameList.length > 0) {
		return { refusalText: `missing ${missingNameList.map((valueName) => `--${valueName}`).join(' and ')}; there is no default for ${missingNameList.length > 1 ? 'either' : 'it'}.\n  ${SYNOPSIS_TEXT}\n(${moduleName}.js -help for the full page)` };
	}
	const goldenContainerName = firstValueOf('goldenContainerName');
	const uriContractFilePath = firstValueOf('uriContractFilePath') || ((configFileProcessor.getConfig('startApiServer.ini', configDirPath, { resolve: true }) || {})['edc-resolver'] || {}).uriContractFilePath;
	if (!uriContractFilePath) {
		return { refusalText: `no uriContract store: pass --uriContractFilePath or set [edc-resolver] uriContractFilePath in ${configDirPath}startApiServer.ini` };
	}
	return {
		goldenContainerName,
		raterStoreFilePath: path.resolve(firstValueOf('raterStoreFilePath')),
		outputDirPath: path.resolve(firstValueOf('outputDirPath') || path.join(CODE_DIR_PATH, 'qualityReports', goldenContainerName)),
		uriContractFilePath,
	};
};

const runQualityReport = (callback) => {
	if (switches.help || switches.h || values.help) {
		xLog.result(HELP_TEXT);
		callback('');
		return;
	}
	const invocation = resolveInvocation();
	if (invocation.refusalText) {
		callback(invocation.refusalText);
		return;
	}
	const rules = JSON.parse(fs.readFileSync(RULES_FILE_PATH, 'utf8'));
	const { readGraphStamp, fileFingerprintOf, generatorCommitOf } = require('./lib/graphStamp');
	const { readGraphFigures } = require('./lib/graphFigures');
	const { readHumanAgreement } = require('./lib/humanAgreement');
	const { readConsistencySignals } = require('./lib/consistencySignals');
	const { buildReportData } = require('./lib/reportDataBuilder');
	const { writeReportFiles } = require('./lib/reportWriter');
	const { resolveContainerConnection } = require(path.join(CODE_DIR_PATH, 'server', 'data-model', 'lib', 'user-graph', 'container-connection-resolver'));
	const { withNeo4jSession, sessionAccessModeFor } = require(path.join(CODE_DIR_PATH, 'cli', 'lib.d', 'data-model-explorer', 'dataModelExplorerSearch'));

	const connection = resolveContainerConnection(invocation.goldenContainerName);
	if (connection.error) {
		callback(`the graph ${invocation.goldenContainerName} cannot be reached (${connection.errorName}): ${connection.error}`);
		return;
	}
	if (!fs.existsSync(invocation.raterStoreFilePath)) {
		callback(`the rater store snapshot is absent at ${invocation.raterStoreFilePath}`);
		return;
	}
	const sessionConfig = { neo4jBoltUri: connection.boltUri, neo4jUser: connection.user, neo4jPassword: connection.password };
	// the stats handler's own access mode: READ (dataModelExplorerSearch.js WRITE_CAPABLE_QUERY_TYPE_LIST is empty)
	withNeo4jSession(sessionConfig, { accessMode: sessionAccessModeFor('stats') }, (session, sessionDone) => {
		const taskList = new taskListPlus();
		taskList.push((args, next) => readGraphStamp({ session, uriContractFilePath: invocation.uriContractFilePath, goldenContainerName: invocation.goldenContainerName }, mergeArgs(args, next, 'graphStamp')));
		taskList.push((args, next) => readGraphFigures({ session, rules }, mergeArgs(args, next, 'graphFigures')));
		taskList.push((args, next) => readHumanAgreement({ session, raterStoreFilePath: invocation.raterStoreFilePath, frozenInputDirPath: FROZEN_INPUT_DIR_PATH, rules }, mergeArgs(args, next, 'humanAgreement')));
		taskList.push((args, next) => readConsistencySignals({ session, hubList: args.graphFigures.hubList, rules }, mergeArgs(args, next, 'consistencySignals')));
		pipeRunner(taskList.getList(), {}, sessionDone);
	}, (readError, readResult) => {
		if (readError) {
			callback(readError);
			return;
		}
		const inputFingerprintList = [invocation.raterStoreFilePath, path.join(FROZEN_INPUT_DIR_PATH, 'sample.json'), path.join(FROZEN_INPUT_DIR_PATH, 'suggested.json'), RULES_FILE_PATH].map(fileFingerprintOf).map(({ fileName, byteCount, sha256 }) => ({ fileName, byteCount, sha256 }));
		const reportData = buildReportData({ rules, graphStamp: readResult.graphStamp, generatorCommit: generatorCommitOf(CODE_DIR_PATH), inputFingerprintList, graphFigures: readResult.graphFigures, humanAgreement: readResult.humanAgreement, consistencySignals: readResult.consistencySignals });
		writeReportFiles({ reportData, rules, outputDirPath: invocation.outputDirPath }, callback);
	});
};

runQualityReport((err, resultText) => {
	if (err) {
		xLog.error(err);
		process.exit(1);
	}
	if (resultText) {
		xLog.result(resultText);
	}
	process.exit(0);
});
