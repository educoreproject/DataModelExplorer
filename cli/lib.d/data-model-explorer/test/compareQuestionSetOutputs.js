'use strict';

// compareQuestionSetOutputs.js — the ctdlHub P7 regression gate: two runs of multiHubQuestionSet.js (the single-hub gold
// before the multi-hub change, and after it) must answer byte for byte alike, EXCEPT for fields the change was ordered
// to add. Those are named here, once (ALLOWED_ADDED_FIELD_NAME_LIST); a field outside the list that appears in the
// after-run is a failure, as is any changed or missing value.
//
// How a JSON answer is compared: every field the after-run ADDED (absent from the baseline object at the same place)
// and named in the list is removed, the rest is re-serialised exactly as multiHubQuestionSet writes it, and the bytes
// are compared with the baseline file. Order therefore counts: a row that moved is a difference.
// ONE exception, counted and printed: a Neo4j map literal (traversal.cypher's entries) comes back with its keys in an
// order Neo4j derives from the key SET, so adding a key to the literal re-orders the others. In an object that gained a
// named field, and only there, the remaining keys are put back in the baseline's order before the bytes are compared;
// their values must still be identical. Measured on GOLD_EVAL_261013_jevQuestionPerBridge (DEVLOG-P7 checkpoint 2).
// A text answer (getSchema, the MCP instructions) has no fields: it is compared byte for byte and, when it differs, its
// line diff is printed so the change can be named in the DEVLOG; TEXT_ANSWER_CHANGE_ALLOWED_BY_FILE_NAME names those
// whose change the work order ordered (step 4).
//
// Run: node cli/lib.d/data-model-explorer/test/compareQuestionSetOutputs.js <baselineDirectoryPath> <afterDirectoryPath>
// Exit: 0 every answer identical or identical after named additions (and every changed text answer allowed); 1 otherwise.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ALLOWED_ADDED_FIELD_NAME_LIST = Object.freeze([
	// findMappings rows and payload (ruling SCARLET_ARROW 2026-10-21: hubName on every row, hubList + totalRowCountByHub)
	'hubName', 'hubTuple', 'hubDomain', 'hubProperty', 'hubRange', 'hubValue', 'hubQualifier', 'hubList', 'totalRowCountByHub',
	// compareCodesets rows
	'hubValueKey',
	// traversal entries and the Slack card, whose existing 'hubName' is the CARD's name: the hub standard is hubSource
	'hubSource',
	// unmappedFields / stats / listStandards: the hub standards, all of them; stats: per hub, the properties mapped onto it
	'hubStandardList', 'mappedPropertyCountByHub',
	// listStandards rows: their match edges per hub
	'hubMatchEdgeCountByHub',
	// Schema Verifier rows: whether the row's own standard is a hub (the name unmappedFields rows already use)
	'isHubStandard',
	// findMappings / explore: published cross-IRI assertions, listed apart and never a mapping (ruling 2026-10-21)
	'declaredCorrespondenceList', 'declaredCorrespondenceCount', 'declaredCorrespondenceRowUnit',
]);
const TEXT_ANSWER_CHANGE_ALLOWED_BY_FILE_NAME = Object.freeze({
	'getSchemaText.txt': 'step 4: hub paragraph generated from HubDefinition, hubName filters in examples, matchBasis authority',
	'mcpInstructionText.txt': 'step 4: hub-neutral instructions',
});

const [baselineDirectoryPath, afterDirectoryPath] = process.argv.slice(2);
if (!baselineDirectoryPath || !afterDirectoryPath) {
	console.error('usage: compareQuestionSetOutputs.js <baselineDirectoryPath> <afterDirectoryPath>');
	process.exit(2);
}

// strippedOfNamedAdditions — the after-value with every allowed field the baseline lacks removed; addedNameCount tallies them
const strippedOfNamedAdditions = (afterValue, baselineValue, addedNameCount, unexpectedPathList, pathText) => {
	if (Array.isArray(afterValue) && Array.isArray(baselineValue)) {
		return afterValue.map((afterMember, memberIndex) => strippedOfNamedAdditions(afterMember, baselineValue[memberIndex], addedNameCount, unexpectedPathList, `${pathText}[${memberIndex}]`));
	}
	if (afterValue && typeof afterValue === 'object' && !Array.isArray(afterValue) && baselineValue && typeof baselineValue === 'object' && !Array.isArray(baselineValue)) {
		const strippedObject = {};
		let namedFieldAdded = false;
		Object.keys(afterValue).forEach((fieldName) => {
			if (!(fieldName in baselineValue)) {
				if (ALLOWED_ADDED_FIELD_NAME_LIST.indexOf(fieldName) !== -1) {
					addedNameCount[fieldName] = (addedNameCount[fieldName] || 0) + 1;
					namedFieldAdded = true;
					return;
				}
				unexpectedPathList.push(`${pathText}.${fieldName}`);
			}
			strippedObject[fieldName] = strippedOfNamedAdditions(afterValue[fieldName], baselineValue[fieldName], addedNameCount, unexpectedPathList, `${pathText}.${fieldName}`);
		});
		const strippedKeyList = Object.keys(strippedObject);
		const baselineKeyList = Object.keys(baselineValue);
		const sameKeySet = strippedKeyList.length === baselineKeyList.length && baselineKeyList.every((fieldName) => fieldName in strippedObject);
		if (namedFieldAdded && sameKeySet && strippedKeyList.join('\u0000') !== baselineKeyList.join('\u0000')) {
			addedNameCount['(map keys re-ordered by Neo4j)'] = (addedNameCount['(map keys re-ordered by Neo4j)'] || 0) + 1;
			return baselineKeyList.reduce((reorderedObject, fieldName) => ({ ...reorderedObject, [fieldName]: strippedObject[fieldName] }), {});
		}
		return strippedObject;
	}
	return afterValue;
};

const firstDifferingLineOf = (leftText, rightText) => {
	const leftLineList = leftText.split('\n');
	const rightLineList = rightText.split('\n');
	const lineIndex = leftLineList.findIndex((leftLine, oneIndex) => leftLine !== rightLineList[oneIndex]);
	return lineIndex === -1 ? `line ${leftLineList.length + 1}: after-run is longer` : `line ${lineIndex + 1}: baseline ${JSON.stringify(leftLineList[lineIndex])} / after ${JSON.stringify(rightLineList[lineIndex])}`;
};

const baselineFileNameList = fs.readdirSync(baselineDirectoryPath).filter((fileName) => /^\d\d-/.test(fileName)).sort();
const afterFileNameList = fs.readdirSync(afterDirectoryPath).filter((fileName) => /^\d\d-/.test(fileName)).sort();
let failureCount = 0;
const reportLine = (verdictText, fileName, detailText) => console.log(`${verdictText.padEnd(34)} ${fileName}${detailText ? `  ${detailText}` : ''}`);

baselineFileNameList.forEach((fileName) => {
	if (afterFileNameList.indexOf(fileName) === -1) {
		failureCount++;
		reportLine('FAIL missing in after-run', fileName);
		return;
	}
	const baselineText = fs.readFileSync(path.join(baselineDirectoryPath, fileName), 'utf8');
	const afterText = fs.readFileSync(path.join(afterDirectoryPath, fileName), 'utf8');
	if (baselineText === afterText) {
		reportLine('IDENTICAL', fileName);
		return;
	}
	if (fileName.endsWith('.txt')) {
		const allowedReason = TEXT_ANSWER_CHANGE_ALLOWED_BY_FILE_NAME[fileName.replace(/^\d\d-/, '')];
		if (!allowedReason) failureCount++;
		reportLine(allowedReason ? 'TEXT CHANGED (named)' : 'FAIL text changed', fileName, allowedReason || '');
		// diff exits 1 when the files differ, the expected outcome here; spawnSync reports it rather than throwing
		const diffText = spawnSync('diff', [path.join(baselineDirectoryPath, fileName), path.join(afterDirectoryPath, fileName)], { encoding: 'utf8' }).stdout;
		console.log(diffText.split('\n').map((diffLine) => `      ${diffLine}`).join('\n'));
		return;
	}
	const addedNameCount = {};
	const unexpectedPathList = [];
	const strippedText = `${JSON.stringify(strippedOfNamedAdditions(JSON.parse(afterText), JSON.parse(baselineText), addedNameCount, unexpectedPathList, '$'), null, 2)}\n`;
	if (unexpectedPathList.length > 0) {
		failureCount++;
		reportLine('FAIL unnamed field added', fileName, unexpectedPathList.slice(0, 5).join(', '));
		return;
	}
	if (strippedText !== baselineText) {
		failureCount++;
		reportLine('FAIL differs', fileName, firstDifferingLineOf(baselineText, strippedText));
		return;
	}
	reportLine('IDENTICAL after named additions', fileName, Object.keys(addedNameCount).map((fieldName) => `${fieldName}×${addedNameCount[fieldName]}`).join(' '));
});
afterFileNameList.filter((fileName) => baselineFileNameList.indexOf(fileName) === -1).forEach((fileName) => reportLine('(after-run only, not compared)', fileName));

console.log(`\ncompareQuestionSetOutputs: ${baselineFileNameList.length} answers, ${failureCount} failure(s)`);
process.exit(failureCount > 0 ? 1 : 0);
