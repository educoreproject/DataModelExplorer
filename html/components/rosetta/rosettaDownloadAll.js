// rosettaDownloadAll — what Download all puts in its zip, and what it is called (WORKORDER-rosettaDownloadAll-111226; TQ Q113: one zip). Pure: answers in, files out.
// The store (stores/rosettaDownloadAllStore.js) reads every page and asks for the name; this module only says what the files are.
//
//   draftFileTextOf(draftContext) → a hub's draft as the per-hub button saves it, and as the Drafts tab shows it: one builder for all three
//   nameSnippetOf(reportPageList) → the field names of every page, cut to rosettaPageSettings.downloadAllNameSnippetLength, for the naming call
//   downloadBaseNameOf({ aiFilenameOutcome, jobRefId }) → { baseName, isStandInName, zipFileName, nameNoteText }: the model's name cleaned, or the stand-in name
//     (rosetta-<the job id's first characters>) when the call failed, was capped, or gave nothing usable; the note says which, in the page's words
//   downloadFileListOf({ baseName, jobRefId, pastedText, jobStatus, jobLink, reportPageList, promptPageList, expressionByMeaningUri }) → [{ name, content }] for buildZip:
//     base_fields.txt, base_job.md, base_report.md, base_drafts_<HUB>.jsonld for each hub of the job, base_prompts.md

import { rosettaPageWords, wordsOf } from './rosettaVocabulary.js';
import { rosettaPageSettings } from './rosettaPageSettings.js';
import { reportMarkdownOf, jobMarkdownOf, promptsMarkdownOf } from './rosettaReportMarkdown.js';

const DRAFT_JSON_INDENT = 2;
const NAME_SNIPPET_DIVIDER = ', ';

export const draftFileTextOf = (draftContext) => JSON.stringify(draftContext, null, DRAFT_JSON_INDENT);

export const nameSnippetOf = (reportPageList) =>
	reportPageList
		.flatMap((onePage) => onePage.fieldList.map((oneField) => oneField.requestName))
		.join(NAME_SNIPPET_DIVIDER)
		.slice(0, rosettaPageSettings.downloadAllNameSnippetLength);

const zipFileNameOf = (baseName) => `${baseName}${rosettaPageSettings.downloadAllZipExtension}`;
const cleanedNameOf = (suggestedName) => suggestedName.replace(rosettaPageSettings.downloadAllNameDisallowedPattern, '').slice(0, rosettaPageSettings.downloadAllNameMaxLength);
// the failure an answer that cleans to nothing counts as (useAiFilename's AI_FILENAME_FAILURE_NAME.unusable)
const UNUSABLE_FAILURE_NAME = 'unusable';

export const downloadBaseNameOf = ({ aiFilenameOutcome, jobRefId }) => {
	const cleanedName = aiFilenameOutcome.suggestedName === undefined ? '' : cleanedNameOf(aiFilenameOutcome.suggestedName);
	if (cleanedName) {
		return { baseName: cleanedName, isStandInName: false, zipFileName: zipFileNameOf(cleanedName), nameNoteText: wordsOf(rosettaPageWords.downloadAllSavedTemplate, { zipFileName: zipFileNameOf(cleanedName) }) };
	}
	// a name that cleaned to nothing is unusable; otherwise the call's own failure, which must be one the vocabulary words
	const failureName = aiFilenameOutcome.suggestedName === undefined ? aiFilenameOutcome.failureName : UNUSABLE_FAILURE_NAME;
	const reasonText = rosettaPageWords.downloadAllNameReasonByFailure[failureName];
	if (reasonText === undefined) {
		throw new Error(`rosettaDownloadAll: the naming call failed as '${failureName}', which rosettaVocabulary's downloadAllNameReasonByFailure has no words for`);
	}
	const standInName = `${rosettaPageSettings.downloadAllStandInNamePrefix}${jobRefId.slice(0, rosettaPageSettings.downloadAllStandInJobRefIdLength)}`;
	return { baseName: standInName, isStandInName: true, zipFileName: zipFileNameOf(standInName), nameNoteText: wordsOf(rosettaPageWords.downloadAllStandInSavedTemplate, { zipFileName: zipFileNameOf(standInName), reasonText }) };
};

export const downloadFileListOf = ({ baseName, jobRefId, pastedText, jobStatus, jobLink, reportPageList, promptPageList, expressionByMeaningUri }) => {
	const suffixByPart = rosettaPageSettings.downloadAllFileSuffixByPart;
	const firstReportPage = reportPageList[0];
	const draftFileList = firstReportPage.job.hubList.map((hubName) => ({
		name: `${baseName}${rosettaPageSettings.downloadAllDraftsFilePrefix}${hubName}${rosettaPageSettings.downloadAllDraftsFileExtension}`,
		content: draftFileTextOf(firstReportPage.draftContextByHub[hubName]),
	}));
	return [
		{ name: `${baseName}${suffixByPart.fields}`, content: pastedText === '' ? rosettaPageWords.markdownFieldsEmptyText : pastedText },
		{ name: `${baseName}${suffixByPart.job}`, content: jobMarkdownOf({ jobRefId, jobStatus, jobLink }) },
		{ name: `${baseName}${suffixByPart.report}`, content: reportMarkdownOf({ reportPageList, expressionByMeaningUri }) },
		...draftFileList,
		{ name: `${baseName}${suffixByPart.prompts}`, content: promptsMarkdownOf({ promptPageList, jobRefId }) },
	];
};
