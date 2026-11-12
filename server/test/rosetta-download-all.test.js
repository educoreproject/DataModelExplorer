'use strict';
// rosetta-download-all.test.js — WORKORDER-rosettaDownloadAll-111226 gate 1. No server, no graph, no model.
// The browser modules run here as they are (html/components/rosetta/*.js from their own files); the two stores run in the real Pinia with axios and the login
// store pointed at doubles (the double answers by route and keeps every request).
//   1. THE REPORT MARKDOWN (rosettaReportMarkdown.reportMarkdownOf): every field of every page, in order; the search description marked as a model's, as on screen;
//      a hub with no result for a field says so; the summary table holds every page; hostile text stays text.
//   2. THE FILES (rosettaDownloadAll.downloadFileListOf): the suffixes from rosettaPageSettings, one drafts file per hub with the per-hub button's own bytes, the
//      pasted text, the job, every prompt of every page.
//   3. THE NAME (rosettaDownloadAll.downloadBaseNameOf): the model's name cleaned; a failed, capped or unusable answer gives the stand-in name, said as one, with why.
//   4. THE STORE (rosettaDownloadAllStore.buildDownloadAll): every page of both read, the visitor's view unmoved, the zip holds the files; a failed naming call
//      still downloads under the stand-in name; a failed page refuses by name, and nothing is named or zipped.
// ROSETTA_DOWNLOAD_HTML_PATH=<another tree's html dir> runs the same gates there (the base, to watch them fail).
// Run: /Users/tqwhite/.local/node/bin/node server/test/rosetta-download-all.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFileSync } = require('child_process');

const htmlPath = process.env.ROSETTA_DOWNLOAD_HTML_PATH || path.join(__dirname, '..', '..', 'html');
const rosettaDirPath = path.join(htmlPath, 'components', 'rosetta');
const ROSETTA_ROUTE_BASE_PATH = '/api/standards/v1/rosetta/';
const AI_FILENAME_URL = '/api/askmilo-utility';

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${String(detailText).slice(0, 800)}` : ''}`);
};
const finish = () => {
	console.log(`\nrosetta-download-all: ${passedCount} passed, ${failedCount} failed`);
	process.exit(failedCount === 0 ? 0 : 1);
};

const requiredFilePathList = [
	path.join(rosettaDirPath, 'rosettaReportMarkdown.js'),
	path.join(rosettaDirPath, 'rosettaDownloadAll.js'),
	path.join(htmlPath, 'stores', 'rosettaDownloadAllStore.js'),
	path.join(htmlPath, 'composables', 'useAiFilename.js'),
];
const absentFilePathList = requiredFilePathList.filter((filePath) => !fs.existsSync(filePath));
if (absentFilePathList.length) {
	absentFilePathList.forEach((filePath) => ok(`the module exists (${path.relative(htmlPath, filePath)})`, false, `${filePath} is absent`));
	finish();
}

const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'rosettaDownloadAll-'));
const writeModule = (fileName, sourceText) => {
	const filePath = path.join(scratchDirPath, fileName);
	fs.writeFileSync(filePath, sourceText);
	return pathToFileURL(filePath).href;
};
const rewriteOnce = ({ sourceText, findText, replaceText, fileLabel }) => {
	const matchCount = sourceText.split(findText).length - 1;
	if (matchCount !== 1) {
		throw new Error(`rosetta-download-all.test: '${findText}' occurs ${matchCount} times in ${fileLabel}; the test rewrites it exactly once`);
	}
	return sourceText.replace(findText, () => replaceText);
};
const urlOf = (filePath) => pathToFileURL(filePath).href;

const vocabularyUrl = urlOf(path.join(rosettaDirPath, 'rosettaVocabulary.js'));
const settingsUrl = urlOf(path.join(rosettaDirPath, 'rosettaPageSettings.js'));
const blocksUrl = urlOf(path.join(rosettaDirPath, 'rosettaReportBlocks.js'));
const markdownUrl = urlOf(path.join(rosettaDirPath, 'rosettaReportMarkdown.js'));
const downloadUrl = urlOf(path.join(rosettaDirPath, 'rosettaDownloadAll.js'));
const ladderUrl = urlOf(path.join(htmlPath, 'stores', 'rosettaFreeText.js'));
const buildZipUrl = urlOf(path.join(htmlPath, 'components', 'buildZip.js'));
const piniaUrl = urlOf(path.join(htmlPath, 'node_modules', 'pinia', 'dist', 'pinia.mjs'));
const axiosDoubleUrl = writeModule('axiosDouble.mjs', 'export default { post: (url, body, options) => globalThis.downloadAxiosDouble.answer("post", url, body, options), get: (url, options) => globalThis.downloadAxiosDouble.answer("get", url, undefined, options) };\n');
const loginDoubleUrl = writeModule('loginStoreDouble.mjs', 'export const useLoginStore = () => ({ getAuthTokenProperty: { Authorization: "Bearer downloadTestToken" } });\n');
const aiFilenameUrl = (() => {
	const sourceText = fs.readFileSync(path.join(htmlPath, 'composables', 'useAiFilename.js'), 'utf8');
	const settingsFileUrl = urlOf(path.join(htmlPath, 'composables', 'aiFilenameSettings.js'));
	let rewrittenText = rewriteOnce({ sourceText, findText: "import axios from 'axios';", replaceText: `import axios from '${axiosDoubleUrl}';`, fileLabel: 'useAiFilename.js' });
	rewrittenText = rewriteOnce({ sourceText: rewrittenText, findText: "from './aiFilenameSettings.js';", replaceText: `from '${settingsFileUrl}';`, fileLabel: 'useAiFilename.js' });
	return writeModule('useAiFilename.mjs', rewrittenText);
})();
const rosettaStoreUrl = (() => {
	const fileLabel = 'rosettaStore.js';
	let storeText = fs.readFileSync(path.join(htmlPath, 'stores', 'rosettaStore.js'), 'utf8');
	storeText = rewriteOnce({ sourceText: storeText, findText: "import axios from 'axios';", replaceText: `import { defineStore } from '${piniaUrl}';\nimport axios from '${axiosDoubleUrl}';`, fileLabel });
	storeText = rewriteOnce({ sourceText: storeText, findText: "from '@/stores/loginStore';", replaceText: `from '${loginDoubleUrl}';`, fileLabel });
	storeText = rewriteOnce({ sourceText: storeText, findText: "from '@/stores/rosettaFreeText';", replaceText: `from '${ladderUrl}';`, fileLabel });
	storeText = rewriteOnce({ sourceText: storeText, findText: "from '@/components/rosetta/rosettaVocabulary';", replaceText: `from '${vocabularyUrl}';`, fileLabel });
	storeText = rewriteOnce({ sourceText: storeText, findText: "from '@/components/rosetta/rosettaReportBlocks';", replaceText: `from '${blocksUrl}';`, fileLabel });
	return writeModule('rosettaStore.mjs', storeText);
})();
const downloadStoreUrl = (() => {
	const fileLabel = 'rosettaDownloadAllStore.js';
	let storeText = fs.readFileSync(path.join(htmlPath, 'stores', 'rosettaDownloadAllStore.js'), 'utf8');
	storeText = rewriteOnce({ sourceText: storeText, findText: "import { useRosettaStore } from '@/stores/rosettaStore';", replaceText: `import { defineStore } from '${piniaUrl}';\nimport { useRosettaStore } from '${rosettaStoreUrl}';`, fileLabel });
	storeText = rewriteOnce({ sourceText: storeText, findText: "from '@/components/buildZip';", replaceText: `from '${buildZipUrl}';`, fileLabel });
	storeText = rewriteOnce({ sourceText: storeText, findText: "from '@/composables/useAiFilename';", replaceText: `from '${aiFilenameUrl}';`, fileLabel });
	storeText = rewriteOnce({ sourceText: storeText, findText: "from '@/components/rosetta/rosettaVocabulary';", replaceText: `from '${vocabularyUrl}';`, fileLabel });
	storeText = rewriteOnce({ sourceText: storeText, findText: "from '@/components/rosetta/rosettaDownloadAll';", replaceText: `from '${downloadUrl}';`, fileLabel });
	return writeModule('rosettaDownloadAllStore.mjs', storeText);
})();

// the double answers by route (the Rosetta route less its base, or the naming call's own URL); every request is kept
globalThis.downloadAxiosDouble = {
	requestList: [],
	answerByRoute: {},
	answer(methodName, url, body, options) {
		this.requestList.push({ methodName, url, body, options });
		const routeName = url.startsWith(ROSETTA_ROUTE_BASE_PATH) ? url.slice(ROSETTA_ROUTE_BASE_PATH.length) : url;
		const scripted = this.answerByRoute[routeName];
		if (!scripted) {
			return Promise.reject(new Error(`the double has no answer for ${url}`));
		}
		const outcome = typeof scripted === 'function' ? scripted({ body, options }) : scripted;
		if (outcome.rejectWith) {
			return Promise.reject(outcome.rejectWith);
		}
		return Promise.resolve({ data: outcome.data });
	},
	reset(answerByRoute) {
		this.requestList = [];
		this.answerByRoute = answerByRoute;
	},
};

// ---- the fixture: an audit fetch answer, two pages (the service's shape: page, pageCount, totalFieldCount; draftContextByHub and counts for the whole job)
const JOB_REF_ID = '1a2b3c4d5e6f708192a3b4c5d6e7f809';
const HOSTILE_RATIONALE = 'It matches <img src=x onerror="alert(1)"> | and **bold** and `code`.';
const HOSTILE_FIELD_NAME = 'pipe|field';
const MEANING_URI = 'https://w3id.org/EDUcore/CEDStandards/hub/14.0.0.0/aaaa000000000000000000000000000000000000000000000000000000000001';
const SEARCH_DESCRIPTION_TEXT = 'The given name of a student as recorded by the school.';
const draftContextByHub = {
	CEDS: { '@context': { studentFirstName: { '@id': MEANING_URI } } },
	CTDL: { '@context': {} },
};
const reportPageOf = ({ page, fieldList }) => ({
	jobRefId: JOB_REF_ID,
	status: 'done',
	job: { hubList: ['CEDS', 'CTDL'] },
	fieldList,
	draftNote: 'A draft: check it before you use it.',
	draftContextByHub,
	counts: { byHub: { CEDS: { proposedStrong: 1, abstained: 2 }, CTDL: { noCandidate: 2 } } },
	page,
	pageCount: 2,
	totalFieldCount: 3,
});
const reportPageList = [
	reportPageOf({
		page: 1,
		fieldList: [
			{
				requestName: 'studentFirstName',
				searchDescription: { descriptionText: SEARCH_DESCRIPTION_TEXT },
				resultList: [
					{
						hub: 'CEDS',
						status: 'proposed',
						proposal: { uri: MEANING_URI, label: 'First Name', tuple: { property: { kind: 'property', nativeId: { cedsId: 'P000115' }, label: 'First Name', uri: 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:P000115' } }, predicate: 'exactMatch', category: 'strong', confidence: 0.95 },
						judgesRationale: HOSTILE_RATIONALE,
						judgedWithSearchDescription: true,
					},
					{ hub: 'CTDL', status: 'noCandidate' },
				],
			},
			{
				requestName: HOSTILE_FIELD_NAME,
				requestDefinition: 'a field with a pipe in its name',
				resultList: [
					{ hub: 'CEDS', status: 'abstained', judgesRationale: 'None says it.' },
					{ hub: 'CTDL', status: 'noCandidate' },
				],
			},
		],
	}),
	reportPageOf({
		page: 2,
		fieldList: [
			{
				// a hub with no result for this field: the CTDL entry is missing
				requestName: 'secondPageOnlyField',
				requestDefinition: 'only on page two',
				resultList: [{ hub: 'CEDS', status: 'abstained', judgesRationale: 'Page two words.' }],
			},
		],
	}),
];
const promptOf = (requestName, hubName, ordinal) => ({ requestName, hub: hubName, systemPrompt: `SYSTEM ${ordinal}\n\`\`\`\nfenced inside`, userPrompt: `USER ${ordinal} for ${requestName}` });
const promptPageList = [
	{ jobRefId: JOB_REF_ID, page: 1, pageCount: 2, promptCount: 3, promptList: [promptOf('studentFirstName', 'CEDS', 1), promptOf(HOSTILE_FIELD_NAME, 'CEDS', 2)] },
	{ jobRefId: JOB_REF_ID, page: 2, pageCount: 2, promptCount: 3, promptList: [promptOf('secondPageOnlyField', 'CEDS', 3)] },
];
const jobStatus = { jobRefId: JOB_REF_ID, status: 'done', unitsFinished: 6, unitsTotal: 6, estimateUsd: '0.51', billedUsd: '0.42', inFlightCallCount: 0 };
const JOB_LINK = `https://example.test/explore/rosetta?job=${JOB_REF_ID}`;
const PASTED_TEXT = 'studentFirstName\npipe|field: a field with a pipe in its name\nsecondPageOnlyField: only on page two';
const MEANING_COUNTED = { [MEANING_URI]: { expressionCount: 7 } };

const fileNamesOf = (zipFilePath) => execFileSync('unzip', ['-Z1', zipFilePath], { encoding: 'utf8' }).split('\n').filter(Boolean);
const zipEntryTextOf = (zipFilePath, entryName) => execFileSync('unzip', ['-p', zipFilePath, entryName], { encoding: 'utf8' });

Promise.all([import(vocabularyUrl), import(settingsUrl), import(markdownUrl), import(downloadUrl), import(piniaUrl), import(rosettaStoreUrl), import(downloadStoreUrl), import(blocksUrl)]).then(async ([vocabulary, settings, markdown, download, pinia, { useRosettaStore }, { useRosettaDownloadAllStore }, blocks]) => {
	const words = vocabulary.rosettaPageWords;
	const { wordsOf } = vocabulary;
	const pageSettings = settings.rosettaPageSettings;

	// ---- 1. the report markdown
	console.log('- 1. the report markdown');
	const reportText = markdown.reportMarkdownOf({ reportPageList, expressionByMeaningUri: MEANING_COUNTED });
	const firstFieldAt = reportText.indexOf('studentFirstName');
	const secondFieldAt = reportText.indexOf('pipe\\|field');
	const thirdFieldAt = reportText.indexOf('secondPageOnlyField');
	ok('every field of every page, in the order sent', firstFieldAt !== -1 && secondFieldAt > firstFieldAt && thirdFieldAt > secondFieldAt, `${firstFieldAt} ${secondFieldAt} ${thirdFieldAt}`);
	ok('the search description is marked as a model\'s, in the page\'s own words', reportText.includes(wordsOf(words.reportSearchDescriptionTemplate, { descriptionText: SEARCH_DESCRIPTION_TEXT })) && reportText.includes(words.reportSearchDescriptionUseText), reportText.slice(0, 900));
	ok('a hub the judge saw the sentence for says so', reportText.includes(words.reportJudgedWithSearchDescriptionText));
	ok('a field given no description says so; one given a description shows it', reportText.includes(words.reportFieldDefinitionAbsentText) && reportText.includes('only on page two'));
	ok('a proposal names the meaning, its URI, its strength and relation, and the counted graph links', reportText.includes('First Name') && reportText.includes(MEANING_URI) && reportText.includes(words.strengthByCategory.strong.words) && reportText.includes(words.relationByPredicate.exactMatch) && reportText.includes('7 elements of other standards already map to this meaning.'));
	ok('a no-proposal block says why', reportText.includes(words.noProposalTextByStatus.abstained) && reportText.includes(words.noProposalTextByStatus.noCandidate));
	ok('a hub with no result for a field says so, in the field and in the summary', reportText.split(words.reportHubResultAbsentText).length - 1 === 2, reportText);
	const summaryText = reportText.slice(reportText.indexOf(`## ${words.reportSummaryHeading}`));
	ok('the summary comes after the fields, with each hub\'s counts', summaryText.length > 0 && reportText.indexOf(`## ${words.reportSummaryHeading}`) > thirdFieldAt && summaryText.includes(markdownCountLine(words)));
	const tableRowList = summaryText.split('\n').filter((oneLine) => oneLine.startsWith('| ') && !oneLine.startsWith(`| ${words.reportFieldHeading}`) && !oneLine.startsWith('| ---'));
	ok('the summary table holds every field of every page against every hub (3 fields × 2 hubs)', tableRowList.length === 6, tableRowList.join('\n'));
	ok('every table row has four cells: a pipe in a field name or a rationale is escaped', tableRowList.every((oneRow) => oneRow.split(/(?<!\\)\|/).length === 6), tableRowList.join('\n'));
	ok('hostile text stays text: no bare HTML tag, no live emphasis or code', !/(?<!\\)<img/.test(reportText) && reportText.includes('\\<img') && !/(?<!\\)\*\*bold(?<!\\)\*\*/.test(reportText.replace(/\\\*/g, '')) && reportText.includes('\\`code\\`'));
	ok('a meaning still being read says nothing about the graph rather than "reading"', !markdown.reportMarkdownOf({ reportPageList, expressionByMeaningUri: {} }).includes(words.reportExpressedReadingText));

	// ⟪D1⟫ the summary rows the page and the markdown both draw: a hub a field has no result for says so, never throws
	const everyFieldList = reportPageList.flatMap((onePage) => onePage.fieldList);
	const summaryRowList = typeof blocks.summaryRowListOf === 'function' ? blocks.summaryRowListOf({ fieldList: everyFieldList, hubNameList: ['CEDS', 'CTDL'] }) : [];
	const missingHubRow = summaryRowList.find((oneRow) => oneRow.requestName === 'secondPageOnlyField' && oneRow.hubName === 'CTDL');
	ok('D1: summaryRowListOf gives one row per field per hub, and a missing hub says so in words', summaryRowList.length === 6 && missingHubRow && missingHubRow.resultText === words.reportHubResultAbsentText && missingHubRow.rationaleText === '', JSON.stringify(missingHubRow));
	ok('D1: a row with a result carries the page\'s result words and the judge\'s words', summaryRowList.length > 0 && summaryRowList[0].resultText === blocks.summaryResultTextOf(reportPageList[0].fieldList[0].resultList[0]) && summaryRowList[0].rationaleText === HOSTILE_RATIONALE);

	// ---- 2. the files
	console.log('- 2. the files');
	const BASE_NAME = 'studentNameFields';
	const fileList = download.downloadFileListOf({ baseName: BASE_NAME, jobRefId: JOB_REF_ID, pastedText: PASTED_TEXT, jobStatus, jobLink: JOB_LINK, reportPageList, promptPageList, expressionByMeaningUri: MEANING_COUNTED });
	const fileNameList = fileList.map((oneFile) => oneFile.name);
	const suffixByPart = pageSettings.downloadAllFileSuffixByPart;
	const expectedNameList = [
		`${BASE_NAME}${suffixByPart.fields}`,
		`${BASE_NAME}${suffixByPart.job}`,
		`${BASE_NAME}${suffixByPart.report}`,
		`${BASE_NAME}${pageSettings.downloadAllDraftsFilePrefix}CEDS${pageSettings.downloadAllDraftsFileExtension}`,
		`${BASE_NAME}${pageSettings.downloadAllDraftsFilePrefix}CTDL${pageSettings.downloadAllDraftsFileExtension}`,
		`${BASE_NAME}${suffixByPart.prompts}`,
	];
	ok('the files are named base_fields.txt, base_job.md, base_report.md, base_drafts_<HUB>.jsonld per hub, base_prompts.md', JSON.stringify(fileNameList) === JSON.stringify(expectedNameList) && expectedNameList.join() === 'studentNameFields_fields.txt,studentNameFields_job.md,studentNameFields_report.md,studentNameFields_drafts_CEDS.jsonld,studentNameFields_drafts_CTDL.jsonld,studentNameFields_prompts.md', fileNameList.join());
	const contentOf = (fileName) => (fileList.find((oneFile) => oneFile.name === fileName) || { content: '' }).content;
	ok('the fields file is the pasted text, as it is', contentOf(expectedNameList[0]) === PASTED_TEXT);
	ok('an empty Your fields box says so rather than leaving an empty file', download.downloadFileListOf({ baseName: BASE_NAME, jobRefId: JOB_REF_ID, pastedText: '', jobStatus, jobLink: JOB_LINK, reportPageList, promptPageList, expressionByMeaningUri: {} })[0].content === words.markdownFieldsEmptyText);
	const jobText = contentOf(expectedNameList[1]);
	ok('the job file holds the status, the spend and the job\'s link', jobText.includes(words.jobStatusWordsByStatus.done) && jobText.includes('Estimate $0.51; billed so far $0.42') && jobText.includes(JOB_LINK) && jobText.includes(JOB_REF_ID), jobText);
	ok('the report file is the report markdown', contentOf(expectedNameList[2]) === reportText);
	ok('each drafts file is the bytes the per-hub button saves (draftFileTextOf), one per hub', contentOf(expectedNameList[3]) === download.draftFileTextOf(draftContextByHub.CEDS) && contentOf(expectedNameList[4]) === download.draftFileTextOf(draftContextByHub.CTDL) && download.draftFileTextOf(draftContextByHub.CEDS) === JSON.stringify(draftContextByHub.CEDS, null, 2));
	const promptsText = contentOf(expectedNameList[5]);
	ok('the prompts file holds every prompt of every page, with its field and hub', [1, 2, 3].every((ordinal) => promptsText.includes(`SYSTEM ${ordinal}`) && promptsText.includes(`USER ${ordinal} for`)) && promptsText.includes(wordsOf(words.promptUserLabel, { requestName: 'secondPageOnlyField', hubName: 'CEDS' })), promptsText);
	ok('a prompt holding a code fence cannot close its own block', /^````/m.test(promptsText), promptsText.slice(0, 600));
	ok('a job with no prompts says so', download.downloadFileListOf({ baseName: BASE_NAME, jobRefId: JOB_REF_ID, pastedText: PASTED_TEXT, jobStatus, jobLink: JOB_LINK, reportPageList, promptPageList: [{ page: 1, pageCount: 1, promptCount: 0, promptList: [] }], expressionByMeaningUri: {} })[5].content.includes(words.promptNoneText));

	// ---- 3. the name
	console.log('- 3. the name');
	const named = download.downloadBaseNameOf({ aiFilenameOutcome: { suggestedName: '"studentName.Fields"\n' }, jobRefId: JOB_REF_ID });
	ok('the model\'s name, cleaned to letters, digits, - and _', named.baseName === 'studentNameFields' && named.isStandInName === false, JSON.stringify(named));
	const longNamed = download.downloadBaseNameOf({ aiFilenameOutcome: { suggestedName: 'x'.repeat(200) }, jobRefId: JOB_REF_ID });
	ok('the name is cut to the configured length', longNamed.baseName.length === pageSettings.downloadAllNameMaxLength);
	const STAND_IN_NAME = `${pageSettings.downloadAllStandInNamePrefix}${JOB_REF_ID.slice(0, pageSettings.downloadAllStandInJobRefIdLength)}`;
	ok('the stand-in name is rosetta-<first 8 of the job id>', STAND_IN_NAME === 'rosetta-1a2b3c4d');
	['capped', 'failed', 'unusable'].forEach((failureName) => {
		const standIn = download.downloadBaseNameOf({ aiFilenameOutcome: { failureName, failureDetailText: 'detail' }, jobRefId: JOB_REF_ID });
		ok(`a ${failureName} naming call gives the stand-in name, said as a stand-in, with why`, standIn.baseName === STAND_IN_NAME && standIn.isStandInName === true && standIn.nameNoteText.includes(words.downloadAllNameReasonByFailure[failureName]) && standIn.nameNoteText.includes(`${STAND_IN_NAME}.zip`), JSON.stringify(standIn));
	});
	ok('an answer that cleans to nothing is unusable, never an empty name', download.downloadBaseNameOf({ aiFilenameOutcome: { suggestedName: '...' }, jobRefId: JOB_REF_ID }).baseName === STAND_IN_NAME);
	ok('the naming snippet is the field names of every page, cut to the configured length', download.nameSnippetOf(reportPageList) === 'studentFirstName, pipe|field, secondPageOnlyField' && download.nameSnippetOf([reportPageOf({ page: 1, fieldList: [{ requestName: 'y'.repeat(2000), resultList: [] }] })]).length === pageSettings.downloadAllNameSnippetLength);

	// ---- 4. the store
	console.log('- 4. the store');
	pinia.setActivePinia(pinia.createPinia());
	const rosettaStore = useRosettaStore();
	const downloadStore = useRosettaDownloadAllStore();
	const pageNumberOf = (options) => Number(options.params.page);
	const answerByRouteOf = ({ reportFailsAt, promptFailsAt, namingAnswer }) => ({
		'jobs/fetch': ({ options }) => (pageNumberOf(options) === reportFailsAt ? { rejectWith: { response: { data: { answer: { refusalName: 'notFound', reason: 'That page is gone.' } } }, message: 'refused' } } : { data: { answer: reportPageList[pageNumberOf(options) - 1] } }),
		'jobs/prompts': ({ options }) => (pageNumberOf(options) === promptFailsAt ? { rejectWith: { message: 'socket hang up' } } : { data: { answer: promptPageList[pageNumberOf(options) - 1] } }),
		[AI_FILENAME_URL]: () => namingAnswer,
	});
	const shownView = () => JSON.stringify({ report: rosettaStore.report, reportPage: rosettaStore.reportPage, promptPage: rosettaStore.promptPage, refusal: rosettaStore.refusal });
	rosettaStore.jobRefId = JOB_REF_ID;
	rosettaStore.jobStatus = jobStatus;
	rosettaStore.pastedText = PASTED_TEXT;
	rosettaStore.report = reportPageList[1];
	rosettaStore.reportPage = 2;
	rosettaStore.promptPage = promptPageList[0];
	const viewBefore = shownView();

	globalThis.downloadAxiosDouble.reset(answerByRouteOf({ namingAnswer: { data: { response: 'studentNameFields' } } }));
	const built = await downloadStore.buildDownloadAll({ jobLink: JOB_LINK });
	const requestList = globalThis.downloadAxiosDouble.requestList;
	const pagesAsked = (routeName) => requestList.filter((oneRequest) => oneRequest.url === `${ROSETTA_ROUTE_BASE_PATH}${routeName}`).map((oneRequest) => Number(oneRequest.options.params.page)).join();
	ok('every report page is read, in audit detail', pagesAsked('jobs/fetch') === '1,2' && requestList.filter((oneRequest) => oneRequest.url.endsWith('jobs/fetch')).every((oneRequest) => oneRequest.options.params.detail === 'audit' && oneRequest.options.params.rowDetail === 'full'), pagesAsked('jobs/fetch'));
	ok('every prompt page is read', pagesAsked('jobs/prompts') === '1,2', pagesAsked('jobs/prompts'));
	const namingRequest = requestList.find((oneRequest) => oneRequest.url === AI_FILENAME_URL);
	ok('one naming call, to the utility, with haiku, the field names, and the person\'s token', requestList.filter((oneRequest) => oneRequest.url === AI_FILENAME_URL).length === 1 && namingRequest.body.model === 'haiku' && namingRequest.body.prompt.includes('studentFirstName, pipe|field, secondPageOnlyField') && namingRequest.options.headers.Authorization === 'Bearer downloadTestToken', JSON.stringify(namingRequest));
	ok('the visitor\'s view is not moved: the shown report page, its number and the shown prompt page are as they were', shownView() === viewBefore);
	ok('the zip is named for the model\'s name', built && built.zipFileName === 'studentNameFields.zip', JSON.stringify(built && built.zipFileName));
	ok('the button area says where it was saved', downloadStore.noteText === wordsOf(words.downloadAllSavedTemplate, { zipFileName: 'studentNameFields.zip' }) && downloadStore.refusalText === '' && downloadStore.isBuilding === false, downloadStore.noteText);
	if (built && built.zipBlob) {
		const zipFilePath = path.join(scratchDirPath, built.zipFileName);
		fs.writeFileSync(zipFilePath, Buffer.from(await built.zipBlob.arrayBuffer()));
		ok('the zip unzips to the six files', JSON.stringify(fileNamesOf(zipFilePath)) === JSON.stringify(expectedNameList), fileNamesOf(zipFilePath).join());
		ok('and the report in it holds both pages', zipEntryTextOf(zipFilePath, expectedNameList[2]).includes('secondPageOnlyField') && zipEntryTextOf(zipFilePath, expectedNameList[2]).includes('studentFirstName'));
	} else {
		ok('the zip unzips to the six files', false, 'no zip was built');
	}

	globalThis.downloadAxiosDouble.reset(answerByRouteOf({ namingAnswer: { rejectWith: { response: { status: 429, data: 'Daily usage limit reached, please try again later.' }, message: 'Request failed with status code 429' } } }));
	const cappedBuilt = await downloadStore.buildDownloadAll({ jobLink: JOB_LINK });
	ok('a capped naming call still downloads, under the stand-in name', cappedBuilt && cappedBuilt.zipFileName === `${STAND_IN_NAME}.zip`, JSON.stringify(cappedBuilt && cappedBuilt.zipFileName));
	ok('and the button area says it is a stand-in name, and why', downloadStore.noteText.includes(words.downloadAllNameReasonByFailure.capped) && downloadStore.noteText.includes(`${STAND_IN_NAME}.zip`), downloadStore.noteText);
	globalThis.downloadAxiosDouble.reset(answerByRouteOf({ namingAnswer: { rejectWith: { message: 'Network Error' } } }));
	const failedNamingBuilt = await downloadStore.buildDownloadAll({ jobLink: JOB_LINK });
	ok('a failed naming call says it failed, not that it was capped', failedNamingBuilt && failedNamingBuilt.zipFileName === `${STAND_IN_NAME}.zip` && downloadStore.noteText.includes(words.downloadAllNameReasonByFailure.failed), downloadStore.noteText);

	globalThis.downloadAxiosDouble.reset(answerByRouteOf({ reportFailsAt: 2, namingAnswer: { data: { response: 'neverAsked' } } }));
	const refusedReport = await downloadStore.buildDownloadAll({ jobLink: JOB_LINK });
	ok('a report page that fails refuses the download: nothing comes back', refusedReport === null);
	ok('the refusal names the part and the page, with the service\'s reason', downloadStore.refusalText === wordsOf(words.downloadAllPageFailedTemplate, { partWords: words.downloadAllPartWordsByName.report, pageNumber: 2, reasonText: 'That page is gone.' }) && downloadStore.noteText === '', downloadStore.refusalText);
	ok('and nothing is named after a refusal (no model spend)', !globalThis.downloadAxiosDouble.requestList.some((oneRequest) => oneRequest.url === AI_FILENAME_URL));
	globalThis.downloadAxiosDouble.reset(answerByRouteOf({ promptFailsAt: 2, namingAnswer: { data: { response: 'neverAsked' } } }));
	const refusedPrompts = await downloadStore.buildDownloadAll({ jobLink: JOB_LINK });
	ok('a prompt page that fails refuses too, naming the prompts', refusedPrompts === null && downloadStore.refusalText.includes(words.downloadAllPartWordsByName.prompts) && downloadStore.refusalText.includes('socket hang up'), downloadStore.refusalText);
	ok('a refused download leaves the view where it was', shownView() === viewBefore && downloadStore.isBuilding === false);

	fs.rmSync(scratchDirPath, { recursive: true, force: true });
	finish();
}).catch((thrown) => {
	ok('the modules load and run', false, thrown && thrown.stack);
	finish();
});

// the count line the page shows for CEDS (rosettaReportBlocks.countLineListOf), as a markdown line
function markdownCountLine(words) {
	return `CEDS: ${words.countWordsByName.proposedStrong} 1, ${words.countWordsByName.abstained} 2`;
}
