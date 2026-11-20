#!/usr/bin/env node
'use strict';
// ci-config-names-match.test.js: the committed CI config (server/test/ciConfig/configs) still mirrors the real one.
//
// Needs the real configs repository beside the code (code/../configs/instanceSpecific, with qbook and _globalPrompts),
// so it runs on a workstation and is excluded on GitHub (ciExcludedTestList.txt). It compares NAMES (sections and
// settings) and prints names only, never a value. When it goes red, re-run server/test/ciConfig/buildCiConfig.js.
//
// Checks: (1) the same .ini files exist in both; (2) each file has the same section and setting names; (3) no real
// value that the CI copy replaces appears anywhere in it; (4) the committed copy is exactly what the builder makes now.

const fs = require('fs');
const path = require('path');
const { keptValueRulesOf, iniNameListOf, mirroredIniPathListOf, ciConfigBuildOf } = require('./ciConfig/ciConfigTransform');

const codeRootDirPath = path.resolve(__dirname, '../..');
const realInstanceSpecificDirPath = path.resolve(codeRootDirPath, '../configs/instanceSpecific');
const ciInstanceSpecificDirPath = path.join(__dirname, 'ciConfig', 'configs', 'instanceSpecific');
const keptValueRules = keptValueRulesOf(path.join(__dirname, 'ciConfig', 'keptValueRuleList.json'));

let failCount = 0;
const check = (isPassing, checkDescription, detailText = '') => {
	console.log(`${isPassing ? 'PASS' : 'FAIL'}: ${checkDescription}${!isPassing && detailText ? `\n    ${detailText}` : ''}`);
	if (!isPassing) {
		failCount++;
	}
};

const differenceOf = (leftList, rightList) => leftList.filter((listItem) => !rightList.includes(listItem));

const main = () => {
	if (!fs.existsSync(path.join(realInstanceSpecificDirPath, 'qbook'))) {
		console.log(`FAIL: the real configs are not at ${realInstanceSpecificDirPath} (this test runs only where the configs repository is; it is excluded on GitHub)`);
		return 1;
	}

	const realIniPathList = mirroredIniPathListOf(realInstanceSpecificDirPath, keptValueRules.mirroredDirNameList);
	const ciIniPathList = mirroredIniPathListOf(ciInstanceSpecificDirPath, keptValueRules.mirroredDirNameList);
	check(
		differenceOf(realIniPathList, ciIniPathList).length === 0 && differenceOf(ciIniPathList, realIniPathList).length === 0,
		`(1) the CI copy has the same ${realIniPathList.length} .ini files as the real configs`,
		`only real: ${differenceOf(realIniPathList, ciIniPathList).join(', ')}; only CI: ${differenceOf(ciIniPathList, realIniPathList).join(', ')}`,
	);

	realIniPathList
		.filter((relativeIniPath) => ciIniPathList.includes(relativeIniPath))
		.forEach((relativeIniPath) => {
			const realNameList = iniNameListOf(fs.readFileSync(path.join(realInstanceSpecificDirPath, relativeIniPath), 'utf8'));
			const ciNameList = iniNameListOf(fs.readFileSync(path.join(ciInstanceSpecificDirPath, relativeIniPath), 'utf8'));
			check(
				differenceOf(realNameList, ciNameList).length === 0 && differenceOf(ciNameList, realNameList).length === 0,
				`(2) ${relativeIniPath}: same section and setting names (${realNameList.length})`,
				`only real: ${differenceOf(realNameList, ciNameList).slice(0, 10).join(', ')}; only CI: ${differenceOf(ciNameList, realNameList).slice(0, 10).join(', ')}`,
			);
		});

	const { builtFileList, leakList } = ciConfigBuildOf(realInstanceSpecificDirPath, keptValueRules);
	check(leakList.length === 0, '(3) no replaced real value appears in the CI copy (with (4), this covers the committed files)', leakList.join(', '));

	const staleFileList = builtFileList
		.filter(({ relativeIniPath }) => ciIniPathList.includes(relativeIniPath))
		.filter(({ relativeIniPath, ciIniText }) => fs.readFileSync(path.join(ciInstanceSpecificDirPath, relativeIniPath), 'utf8') !== ciIniText)
		.map(({ relativeIniPath }) => relativeIniPath);
	check(staleFileList.length === 0, '(4) the committed CI copy is what buildCiConfig.js makes from the real configs today', `stale: ${staleFileList.join(', ')}`);

	console.log(`ci-config-names-match: ${failCount ? `${failCount} FAILED` : 'all passed'}`);
	return failCount ? 1 : 0;
};

process.exitCode = main();
