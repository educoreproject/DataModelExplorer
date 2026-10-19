#!/usr/bin/env node
'use strict';

// raterTool.js — the CEDS Rater's two build scripts (lane RATER, 2026-10-14). Both read the ONE gold named in
// raterTool.ini [raterTool] goldenContainerName, read-only, and write frozen files the tool reads but never recomputes.
//   -buildSample      the 150-element sample (50 Ed-Fi, 50 SIF, 50 PESC) dealt into surveys A, B, C, plus the 25/25
//                     dev/sealed split: sample.json and sample-report.md
//   -buildSuggested   each sampled element's candidate CEDS cards (15 by meaning + 15 by words, merged, capped at 20,
//                     unordered; revision 3: a mapped element's gold tuples always on the list): suggested.json and
//                     suggested-report.md; reads sample.json from the same directory
// Run `raterTool.js -help` for the full page.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const os = require('os');
const fs = require('fs');
const path = require('path');
const commandLineParser = require('qtools-parse-command-line');
const configFileProcessor = require('qtools-config-file-processor');
const { pipeRunner, taskListPlus } = new (require('qtools-asynchronous-pipe-plus'))();

const HELP_TEXT = `NAME
    raterTool.js — build the CEDS Rater's frozen inputs from the named gold

SYNOPSIS
    raterTool.js -buildSample [--outputDirPath=DIR]
    raterTool.js -buildSuggested [--outputDirPath=DIR]
    raterTool.js -help

DESCRIPTION
    Reads the gold named in raterTool.ini [raterTool] goldenContainerName (resolved by name through docker; refused by
    name if it cannot be reached) and writes deterministic JSON: the same gold and seed give byte-identical files.

ACTIONS
    -buildSample      Build each standard's frame of leaf elements, classify each element's kind, exclude the 13
                      worked-example elements, draw 50 per standard stratified by kind, split each 25/25 dev/sealed, and
                      deal the 150 into surveys A, B, C. WRITES sample.json and sample-report.md.
    -buildSuggested   For every element in sample.json, the top 15 CEDS cards by meaning and the top 15 by words, merged,
                      deduplicated, collapsed and capped at 20. For an element mapped in the gold (isMappedInGold), every
                      CEDS tuple the gold maps it to is also put on its list as an ordinary card (revision 3, a TQ-approved
                      exception to "no machine results"); the lowest-ranked non-gold cards make room, a gold card is never
                      dropped. WRITES suggested.json (with goldTupleIdList and goldInjectedTupleIdList per mapped element,
                      never shown to raters) and suggested-report.md.
    -help, --help, -h Print this page and exit 0.

OPTIONS
    --outputDirPath=DIR   Where to write (and, for -buildSuggested, read sample.json). Without it, the directory named
                          by raterTool.ini [raterTool] frozenInputDirPath.

EXAMPLES
    # writes sample.json and sample-report.md into a scratch directory
    raterTool.js -buildSample --outputDirPath=/tmp/raterRun1
    # writes suggested.json and suggested-report.md beside that sample.json
    raterTool.js -buildSuggested --outputDirPath=/tmp/raterRun1

EXIT STATUS
    0 on success or help; 1 when the build fails or is refused (the reason is printed).

FILES
    configs/instanceSpecific/<instance>/raterTool.ini   goldenContainerName, frozenInputDirPath, queryTimeoutMs, voyageApiKey
    cli/lib.d/rater-tool/config/raterDraw.json           seed, counts, PESC releases, survey composition
    cli/lib.d/rater-tool/config/sampleExclusionList.json the 13 excluded elements
    cli/lib.d/rater-tool/config/kindRuleRegistry.json    how an element's kind is read from its type
    cli/lib.d/rater-tool/config/suggestRules.json        the suggested-list query and merge rules

SEE ALSO
    educoreForge/system/management/zNotesPlansDocs/humanTruthSet-101326/README-raterTool.md
`;

const findProjectRoot = ({ rootFolderName = 'system', closest = true } = {}) => __dirname.replace(new RegExp(`^(.*${closest ? '' : '?'}\\/${rootFolderName}).*$`), '$1');
const projectRoot = findProjectRoot();
const commandLineParameters = commandLineParser.getParameters({ noFunctions: true });
const { switches = {}, values = {} } = commandLineParameters;

const configDirPathByHostname = Object.freeze({ 'qMini.local': 'instanceSpecific/qbook', 'qbook.local': 'instanceSpecific/qbook' });
const configDirPath = `${projectRoot}/configs/${configDirPathByHostname[os.hostname()] || ''}/`;
const allConfig = configFileProcessor.getConfig('raterTool.ini', configDirPath, { resolve: true }) || {};

process.global = Object.freeze({
	xLog: Object.freeze({ status: (messageText) => process.stderr.write(`${messageText}\n`), error: (messageText) => process.stderr.write(`ERROR: ${messageText}\n`), result: (messageText) => process.stdout.write(`${messageText}\n`), verbose: () => {} }),
	getConfig: (sectionName) => allConfig[sectionName],
	commandLineParameters,
	projectRoot,
});
const { xLog } = process.global;

const ACTION_BY_NAME = Object.freeze({
	buildSample: require('./lib/buildSample'),
	buildSuggested: require('./lib/buildSuggested'),
});

const runRaterTool = (callback) => {
	if (switches.help || switches.h || values.help) {
		xLog.result(HELP_TEXT);
		callback('');
		return;
	}
	const requestedActionNameList = Object.keys(ACTION_BY_NAME).filter((actionName) => switches[actionName]);
	if (requestedActionNameList.length !== 1) {
		callback(`name exactly one action (${Object.keys(ACTION_BY_NAME).map((actionName) => `-${actionName}`).join(' or ')}); got ${requestedActionNameList.length}. (raterTool.js -help for the full page)`);
		return;
	}
	const raterToolConfig = allConfig.raterTool;
	if (!raterToolConfig) {
		callback(`no [raterTool] section in ${configDirPath}raterTool.ini`);
		return;
	}
	const outputDirPath = values.outputDirPath ? values.outputDirPath[0] : raterToolConfig.frozenInputDirPath;
	if (!outputDirPath || /<!/.test(outputDirPath)) {
		callback(`no output directory: pass --outputDirPath or set raterTool.ini [raterTool] frozenInputDirPath (got ${JSON.stringify(outputDirPath)})`);
		return;
	}
	fs.mkdirSync(outputDirPath, { recursive: true });
	const readConfigJson = (configFileName) => JSON.parse(fs.readFileSync(path.join(__dirname, 'config', configFileName), 'utf8'));
	ACTION_BY_NAME[requestedActionNameList[0]]({ raterToolConfig, outputDirPath, readConfigJson }, callback);
};

runRaterTool((err, resultText) => {
	if (err) {
		xLog.error(err);
		process.exit(1);
	}
	if (resultText) {
		xLog.result(resultText);
	}
	process.exit(0);
});
