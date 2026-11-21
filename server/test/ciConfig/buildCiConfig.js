#!/usr/bin/env node
'use strict';
// buildCiConfig.js: writes the secret-free CI copy of the real configs into server/test/ciConfig/configs/.
//
//   node server/test/ciConfig/buildCiConfig.js --sourceInstanceSpecificDirPath=<system>/configs/instanceSpecific
//
// Run it on a workstation that has the configs repository, whenever qbook's section or setting NAMES change
// (ci-config-names-match.test.js goes red when they do). It mirrors every .ini in the directories named by
// keptValueRuleList.json's mirroredDirNameList, keeping names and only the values that file allows. Before it
// writes anything it checks that no replaced real value appears anywhere in its output, and refuses if one does.
// It prints names and counts, never a value.

const fs = require('fs');
const path = require('path');
const commandLineParser = require('qtools-parse-command-line');
const { keptValueRulesOf, ciConfigBuildOf } = require('./ciConfigTransform');

const ciConfigDirPath = __dirname;
const ruleListFilePath = path.join(ciConfigDirPath, 'keptValueRuleList.json');
const outputInstanceSpecificDirPath = path.join(ciConfigDirPath, 'configs', 'instanceSpecific');

const main = () => {
	const commandLineParameters = commandLineParser.getParameters();
	const sourceInstanceSpecificDirPath = [].concat(commandLineParameters.values.sourceInstanceSpecificDirPath || [])[0];
	if (!sourceInstanceSpecificDirPath || !fs.existsSync(sourceInstanceSpecificDirPath)) {
		console.error(`buildCiConfig: REFUSED: --sourceInstanceSpecificDirPath must name an existing configs/instanceSpecific directory (got '${sourceInstanceSpecificDirPath || ''}')`);
		return 2;
	}
	const { builtFileList, leakList } = ciConfigBuildOf(sourceInstanceSpecificDirPath, keptValueRulesOf(ruleListFilePath));
	if (leakList.length) {
		console.error(`buildCiConfig: REFUSED: a replaced real value still appears in the CI copy (names only):\n  ${leakList.join('\n  ')}`);
		return 1;
	}

	builtFileList.forEach(({ relativeIniPath, ciIniText, keptValueList, replacedValueList }) => {
		const outputFilePath = path.join(outputInstanceSpecificDirPath, relativeIniPath);
		fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
		fs.writeFileSync(outputFilePath, ciIniText);
		console.log(`${relativeIniPath}: ${keptValueList.length} values kept, ${replacedValueList.length} replaced`);
	});
	console.log(`buildCiConfig: wrote ${builtFileList.length} files under ${outputInstanceSpecificDirPath}`);
	return 0;
};

process.exitCode = main();
