// askDmeAgreement.mjs — reads the answers askDmeConsistency.mjs wrote and lays out, per prompt, the substantive content
// each run named, so agreement can be judged: the JEDx fields listed, and each hub mapping as field | hub | relation |
// confidence. A mapping row is any table row (the answer's HTML control table, or a markdown table) that names a
// relation (EXACT_MATCH, CLOSE_MATCH, BROAD_MATCH, NARROW_MATCH, or the bare word) and a hub (CEDS or CTDL); its field
// is the row's first cell. A field row is any table row whose first cell is one identifier. The judgement stays a
// person's: this prints what differs between runs, it does not decide.
//
//   node html/tests/companion/askDmeAgreement.mjs --evidenceDir=<the runs' folder> [--jsonOut=<file>]

import path from 'node:path';
import fs from 'node:fs';

const argumentByName = Object.fromEntries(process.argv.slice(2).filter((argumentText) => argumentText.startsWith('--')).map((argumentText) => argumentText.slice(2).split(/=(.*)/s).slice(0, 2)));
if (!argumentByName.evidenceDir) {
	console.error('askDmeAgreement: missing --evidenceDir');
	process.exit(2);
}

const RELATION_PATTERN = /\b(EXACT|CLOSE|BROAD|NARROW)(?:_MATCH)?\b/i;
const HUB_PATTERN = /\b(CEDS|CTDL)\b/;
const CONFIDENCE_PATTERN = /(?:^|\s|\|)(0\.\d+|1\.0+)(?=\s|\||$)/;
const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_.]*$/;

const plainTextOf = (htmlText) => htmlText.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// every table row of the answer as a list of cell texts: HTML <tr> rows and markdown | rows
const tableRowListOf = (answerText) => {
	const htmlRowList = [...answerText.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(([, rowHtml]) => [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(([, cellHtml]) => plainTextOf(cellHtml)));
	const markdownRowList = answerText
		.split('\n')
		.filter((lineText) => /^\s*\|.*\|\s*$/.test(lineText) && !/^\s*\|[\s:|-]+\|\s*$/.test(lineText))
		.map((lineText) => lineText.trim().replace(/^\||\|$/g, '').split('|').map((cellText) => plainTextOf(cellText).replace(/[`*]/g, '')));
	return [...htmlRowList, ...markdownRowList];
};

const contentOf = (answerText) => {
	const rowList = tableRowListOf(answerText);
	let currentFieldName = '';
	const mappingSet = new Set();
	const fieldSet = new Set();
	rowList.forEach((cellList) => {
		const firstCell = (cellList[0] || '').replace(/[`*]/g, '').trim();
		if (IDENTIFIER_PATTERN.test(firstCell) && !/^(Field|Hub|Relation|Property)$/i.test(firstCell)) {
			currentFieldName = firstCell;
			fieldSet.add(firstCell);
		}
		const rowText = cellList.join(' | ');
		const relationMatch = rowText.match(RELATION_PATTERN);
		const hubMatch = rowText.match(HUB_PATTERN);
		if (!relationMatch || !hubMatch || !currentFieldName) return;
		const confidenceMatch = rowText.match(CONFIDENCE_PATTERN);
		mappingSet.add(`${currentFieldName} | ${hubMatch[1]} | ${relationMatch[1].toUpperCase()} | ${confidenceMatch ? Number(confidenceMatch[1]).toFixed(1) : '?'}`);
	});
	return { fieldList: [...fieldSet].sort(), mappingList: [...mappingSet].sort() };
};

const summaryList = JSON.parse(fs.readFileSync(path.join(argumentByName.evidenceDir, 'summary.json'), 'utf8'));
const runListByObjectName = {};
summaryList.forEach((runSummary) => (runListByObjectName[runSummary.jedxObjectName] ||= []).push(runSummary));

const reportList = Object.entries(runListByObjectName).map(([jedxObjectName, runList]) => {
	const runContentList = runList.map((runSummary) => ({ runNumber: runSummary.runNumber, errorText: runSummary.errorText, ...contentOf(fs.readFileSync(path.join(argumentByName.evidenceDir, runSummary.answerFileName), 'utf8')) }));
	const everyMappingList = [...new Set(runContentList.flatMap((runContent) => runContent.mappingList))].sort();
	const everyFieldList = [...new Set(runContentList.flatMap((runContent) => runContent.fieldList))].sort();
	const mappingPresenceList = everyMappingList.map((mappingText) => ({ mappingText, runNumberList: runContentList.filter((runContent) => runContent.mappingList.includes(mappingText)).map((runContent) => runContent.runNumber) }));
	const fieldPresenceList = everyFieldList.map((fieldName) => ({ fieldName, runNumberList: runContentList.filter((runContent) => runContent.fieldList.includes(fieldName)).map((runContent) => runContent.runNumber) }));
	return {
		jedxObjectName,
		runCount: runContentList.length,
		errorRunList: runContentList.filter((runContent) => runContent.errorText).map((runContent) => runContent.runNumber),
		mappingCountByRun: Object.fromEntries(runContentList.map((runContent) => [runContent.runNumber, runContent.mappingList.length])),
		fieldCountByRun: Object.fromEntries(runContentList.map((runContent) => [runContent.runNumber, runContent.fieldList.length])),
		mappingInEveryRunCount: mappingPresenceList.filter((mappingPresence) => mappingPresence.runNumberList.length === runContentList.length).length,
		mappingNotInEveryRunList: mappingPresenceList.filter((mappingPresence) => mappingPresence.runNumberList.length !== runContentList.length),
		fieldNotInEveryRunList: fieldPresenceList.filter((fieldPresence) => fieldPresence.runNumberList.length !== runContentList.length),
	};
});

reportList.forEach((objectReport) => {
	console.log(`\n== ${objectReport.jedxObjectName}: ${objectReport.runCount} runs${objectReport.errorRunList.length ? `, ERRORS in runs ${objectReport.errorRunList.join(', ')}` : ''}`);
	console.log(`   fields per run ${JSON.stringify(objectReport.fieldCountByRun)}; mappings per run ${JSON.stringify(objectReport.mappingCountByRun)}; mappings in every run ${objectReport.mappingInEveryRunCount}`);
	objectReport.fieldNotInEveryRunList.forEach((fieldPresence) => console.log(`   field not in every run: ${fieldPresence.fieldName} (runs ${fieldPresence.runNumberList.join(',')})`));
	objectReport.mappingNotInEveryRunList.forEach((mappingPresence) => console.log(`   mapping not in every run: ${mappingPresence.mappingText} (runs ${mappingPresence.runNumberList.join(',')})`));
});
if (argumentByName.jsonOut) fs.writeFileSync(argumentByName.jsonOut, JSON.stringify(reportList, null, '\t'));
