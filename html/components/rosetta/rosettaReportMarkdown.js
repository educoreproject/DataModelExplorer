// rosettaReportMarkdown — the Report, Job and Prompt tabs as markdown files, for Download all (WORKORDER-rosettaDownloadAll-111226). Pure: answers in, text out.
// The report is written from the same blocks the Report tab draws (rosettaReportBlocks.fieldBlockListOf, countLineListOf, summaryRowListOf), in the same words,
// so there is one description of a report and two ways to show it.
//
//   reportMarkdownOf({ reportPageList, expressionByMeaningUri }) → every field of every page, field by field, then the summary (counts and a table of every row)
//   jobMarkdownOf({ jobRefId, jobStatus, jobLink }) → the Job tab: status, queue place, units, spend, link
//   promptsMarkdownOf({ promptPageList, jobRefId }) → every prompt of every page: its field and hub, its system prompt and its prompt
//
// A FIELD NAME, A RATIONALE AND A PROMPT CAN BE HOSTILE, and a markdown viewer renders HTML and emphasis. Inline text is escaped (inlineTextOf); a URI is a code span
// and a prompt a fenced block, each fence longer than any run of backticks inside it, so no text can end its own block.

import { rosettaPageWords, wordsOf } from './rosettaVocabulary.js';
import { fieldBlockListOf, countLineListOf, summaryRowListOf, jobStatusLineOf, spendLineOf } from './rosettaReportBlocks.js';

// markdown's own marks: syntax, not words
const MARK = Object.freeze({ title: '# ', heading: '## ', subheading: '### ', hubHeading: '#### ', item: '- ', subItem: '  - ', quote: '> ', strongEdge: '**', labelEnd: ':', tableEdge: '|', tableRule: '---', backtick: '`', lineBreak: '\n' });
const MIN_FENCE_LENGTH = 3;
const INLINE_SPECIAL_PATTERN = /([\\`*_[\]<>|#])/g;
const LINE_END_PATTERN = /\r?\n/g;
const BACKTICK_RUN_PATTERN = /`+/g;

const inlineTextOf = (text) => String(text).replace(LINE_END_PATTERN, ' ').replace(INLINE_SPECIAL_PATTERN, '\\$1');
const longestBacktickRunOf = (text) => (String(text).match(BACKTICK_RUN_PATTERN) || []).reduce((longest, oneRun) => Math.max(longest, oneRun.length), 0);
// a code span, its edge longer than any run of backticks inside; padded with a space (which markdown strips) only when the text starts or ends with a backtick
const codeSpanOf = (text) => {
	const spanText = String(text).replace(LINE_END_PATTERN, ' ');
	const edge = MARK.backtick.repeat(longestBacktickRunOf(spanText) + 1);
	const padding = spanText.startsWith(MARK.backtick) || spanText.endsWith(MARK.backtick) ? ' ' : '';
	return `${edge}${padding}${spanText}${padding}${edge}`;
};
const fencedBlockOf = (text) => {
	const fence = MARK.backtick.repeat(Math.max(MIN_FENCE_LENGTH, longestBacktickRunOf(text) + 1));
	return [fence, String(text), fence].join(MARK.lineBreak);
};
const labelledItemOf = (labelText, valueText) => `${MARK.item}${MARK.strongEdge}${inlineTextOf(labelText)}${MARK.labelEnd}${MARK.strongEdge} ${valueText}`;
const tableRowOf = (cellTextList) => `${MARK.tableEdge} ${cellTextList.join(` ${MARK.tableEdge} `)} ${MARK.tableEdge}`;
const paragraphListOf = (lineList) => lineList.filter((oneLine) => oneLine !== '').join(`${MARK.lineBreak}${MARK.lineBreak}`);

// ---- the report

const reportWithEveryFieldOf = (reportPageList) => ({ ...reportPageList[0], fieldList: reportPageList.flatMap((onePage) => onePage.fieldList) });

const slotLineOf = (oneSlot) => {
	const uriText = oneSlot.uri ? codeSpanOf(oneSlot.uri) : inlineTextOf(oneSlot.uriAbsentText);
	return `${MARK.subItem}${inlineTextOf(oneSlot.slotLabel)} ${inlineTextOf(oneSlot.label)} (${inlineTextOf(oneSlot.detailText)}) ${uriText}`;
};
const proposalLineListOf = (oneHubBlock) => {
	const meaningText = [inlineTextOf(oneHubBlock.meaningName), oneHubBlock.hubIdsText ? `(${inlineTextOf(oneHubBlock.hubIdsText)})` : ''].filter(Boolean).join(' ');
	const slotLineList = oneHubBlock.tupleAbsentText ? [`${MARK.subItem}${inlineTextOf(oneHubBlock.tupleAbsentText)}`] : oneHubBlock.slotList.map(slotLineOf);
	// a meaning whose graph links are still being read when the zip is built says nothing of them, rather than "reading"
	const isStillReading = oneHubBlock.expressedText === rosettaPageWords.reportExpressedReadingText;
	return [
		labelledItemOf(rosettaPageWords.reportMeaningLabel, meaningText),
		labelledItemOf(rosettaPageWords.reportMeaningUriLabel, codeSpanOf(oneHubBlock.meaningUri)),
		labelledItemOf(rosettaPageWords.reportSlotsLabel, ''),
		...slotLineList,
		labelledItemOf(rosettaPageWords.reportStrengthLabel, `${inlineTextOf(oneHubBlock.strengthWords)}: ${inlineTextOf(oneHubBlock.strengthExplanation)}`),
		labelledItemOf(rosettaPageWords.reportRelationLabel, inlineTextOf(oneHubBlock.relationText)),
		labelledItemOf(rosettaPageWords.reportRationaleLabel, inlineTextOf(oneHubBlock.rationaleText)),
		...(isStillReading ? [] : [labelledItemOf(rosettaPageWords.reportGraphLabel, inlineTextOf(oneHubBlock.expressedText))]),
	];
};
const noProposalLineListOf = (oneHubBlock) => [
	labelledItemOf(rosettaPageWords.reportMeaningLabel, inlineTextOf(rosettaPageWords.reportNoProposalLabel)),
	labelledItemOf(rosettaPageWords.reportNoProposalReasonLabel, inlineTextOf(oneHubBlock.whyText)),
	...(oneHubBlock.rationaleText ? [labelledItemOf(rosettaPageWords.reportRationaleLabel, inlineTextOf(oneHubBlock.rationaleText))] : []),
];
// one section a hub of the job, in the job's hub order; a hub the field has no result for says so
const hubSectionOf = ({ hubName, oneFieldBlock }) => {
	const oneHubBlock = oneFieldBlock.hubBlockList.find((hubBlock) => hubBlock.hubName === hubName);
	const headingLine = `${MARK.hubHeading}${inlineTextOf(wordsOf(rosettaPageWords.reportHubTemplate, { hubName }))}`;
	if (!oneHubBlock) {
		return paragraphListOf([headingLine, inlineTextOf(rosettaPageWords.reportHubResultAbsentText)]);
	}
	const judgedWithLine = oneHubBlock.judgedWithSearchDescriptionText ? inlineTextOf(oneHubBlock.judgedWithSearchDescriptionText) : '';
	const factLineList = oneHubBlock.hasProposal ? proposalLineListOf(oneHubBlock) : noProposalLineListOf(oneHubBlock);
	return paragraphListOf([headingLine, judgedWithLine, factLineList.join(MARK.lineBreak)]);
};
// the search description, marked as a model's, as the Report tab shows it: a quoted sentence and, when the model wrote it, that it is not the person's
const searchDescriptionLinesOf = (oneFieldBlock) => {
	if (!oneFieldBlock.searchDescriptionText) return '';
	const quotedLineList = [oneFieldBlock.searchDescriptionText, ...(oneFieldBlock.hasSearchDescription ? [rosettaPageWords.reportSearchDescriptionUseText] : [])];
	return quotedLineList.map((oneLine) => `${MARK.quote}${inlineTextOf(oneLine)}`).join(`${MARK.lineBreak}${MARK.quote.trim()}${MARK.lineBreak}`);
};
const fieldSectionOf = ({ oneFieldBlock, hubNameList }) =>
	paragraphListOf([
		`${MARK.subheading}${inlineTextOf(oneFieldBlock.requestName)}`,
		inlineTextOf(oneFieldBlock.definitionText),
		searchDescriptionLinesOf(oneFieldBlock),
		...hubNameList.map((hubName) => hubSectionOf({ hubName, oneFieldBlock })),
	]);

const summaryTableOf = ({ fieldList, hubNameList }) => {
	const headingRow = tableRowOf([rosettaPageWords.reportFieldHeading, rosettaPageWords.reportHubHeading, rosettaPageWords.reportResultHeading, rosettaPageWords.reportRationaleHeading].map(inlineTextOf));
	const ruleRow = tableRowOf([MARK.tableRule, MARK.tableRule, MARK.tableRule, MARK.tableRule]);
	const rowList = summaryRowListOf({ fieldList, hubNameList }).map((oneRow) => tableRowOf([oneRow.requestName, oneRow.hubName, oneRow.resultText, oneRow.rationaleText].map(inlineTextOf)));
	return [headingRow, ruleRow, ...rowList].join(MARK.lineBreak);
};

export const reportMarkdownOf = ({ reportPageList, expressionByMeaningUri }) => {
	const report = reportWithEveryFieldOf(reportPageList);
	const hubNameList = report.job.hubList;
	const fieldBlockList = fieldBlockListOf({ report, expressionByMeaningUri });
	return `${paragraphListOf([
		`${MARK.title}${inlineTextOf(wordsOf(rosettaPageWords.markdownReportTitleTemplate, { jobRefId: report.jobRefId }))}`,
		`${MARK.strongEdge}${inlineTextOf(report.draftNote)}${MARK.strongEdge}`,
		inlineTextOf(rosettaPageWords.reportRationaleCautionText),
		report.isPartial ? inlineTextOf(rosettaPageWords.reportPartialText) : '',
		`${MARK.heading}${inlineTextOf(rosettaPageWords.reportDetailHeading)}`,
		...fieldBlockList.map((oneFieldBlock) => fieldSectionOf({ oneFieldBlock, hubNameList })),
		`${MARK.heading}${inlineTextOf(rosettaPageWords.reportSummaryHeading)}`,
		countLineListOf(report.counts).map((oneLine) => `${MARK.item}${inlineTextOf(oneLine)}`).join(MARK.lineBreak),
		summaryTableOf({ fieldList: report.fieldList, hubNameList }),
	])}${MARK.lineBreak}`;
};

// ---- the job

export const jobMarkdownOf = ({ jobRefId, jobStatus, jobLink }) =>
	`${paragraphListOf([
		`${MARK.title}${inlineTextOf(wordsOf(rosettaPageWords.markdownJobTitleTemplate, { jobRefId }))}`,
		`${MARK.strongEdge}${inlineTextOf(rosettaPageWords.statusLabel)}${MARK.strongEdge} ${inlineTextOf(jobStatusLineOf(jobStatus))}`,
		jobStatus.position ? inlineTextOf(wordsOf(rosettaPageWords.queuePlaceText, { position: jobStatus.position })) : '',
		jobStatus.unitsTotal ? inlineTextOf(wordsOf(rosettaPageWords.unitsFinishedText, { unitsFinished: jobStatus.unitsFinished, unitsTotal: jobStatus.unitsTotal })) : '',
		inlineTextOf(spendLineOf(jobStatus)),
		jobLink ? `${inlineTextOf(rosettaPageWords.jobLinkLabel)} ${codeSpanOf(jobLink)}` : '',
	])}${MARK.lineBreak}`;

// ---- the prompts

const promptSectionOf = (onePrompt) =>
	paragraphListOf([
		`${MARK.heading}${inlineTextOf(wordsOf(rosettaPageWords.promptUserLabel, { requestName: onePrompt.requestName, hubName: onePrompt.hub }))}`,
		`${MARK.subheading}${inlineTextOf(rosettaPageWords.promptSystemLabel)}`,
		fencedBlockOf(onePrompt.systemPrompt),
		`${MARK.subheading}${inlineTextOf(rosettaPageWords.promptUserBodyLabel)}`,
		fencedBlockOf(onePrompt.userPrompt),
	]);

export const promptsMarkdownOf = ({ promptPageList, jobRefId }) => {
	const promptList = promptPageList.flatMap((onePage) => onePage.promptList);
	return `${paragraphListOf([
		`${MARK.title}${inlineTextOf(wordsOf(rosettaPageWords.markdownPromptsTitleTemplate, { jobRefId }))}`,
		inlineTextOf(rosettaPageWords.promptIntroText),
		promptList.length === 0 ? inlineTextOf(rosettaPageWords.promptNoneText) : '',
		...promptList.map(promptSectionOf),
	])}${MARK.lineBreak}`;
};
