// rosettaDownloadAllStore — Download all on the Rosetta page (WORKORDER-rosettaDownloadAll-111226): every tab of the shown job in one zip, named by one Haiku call.
// It reads through rosettaStore's readReportPage and readPromptPage, which show nothing, so the page the person is looking at is never moved. Every page of the
// report and of the prompts is read first; a page that cannot be read refuses the whole download by name (never a partial zip), and nothing is spent on a name.
// Then the name (composables/useAiFilename.js, the DME's own call), the files (components/rosetta/rosettaDownloadAll.js) and the zip (components/buildZip.js).
// The page saves the zip; this store only builds it and says, in the button area, what happened.

import { useRosettaStore } from '@/stores/rosettaStore';
import { buildZip } from '@/components/buildZip';
import { askAiFilename } from '@/composables/useAiFilename';
import { rosettaPageWords, wordsOf } from '@/components/rosetta/rosettaVocabulary';
import { downloadFileListOf, downloadBaseNameOf, nameSnippetOf } from '@/components/rosetta/rosettaDownloadAll';

const FIRST_PAGE_NUMBER = 1;
// the two paginated parts, by the vocabulary's name for each, and the rosettaStore action that reads one page of it
const PART_READER_NAME_BY_PART = Object.freeze({ report: 'readReportPage', prompts: 'readPromptPage' });

export const useRosettaDownloadAllStore = defineStore('rosettaDownloadAllStore', {
	state: () => ({
		isBuilding: false,
		// what the button area says: where the zip was saved (and, for a stand-in name, why), or why nothing was
		noteText: '',
		refusalText: '',
	}),
	actions: {
		// every page of one part, in order: { pageList } or { refusalText }. The first page says how many there are.
		async everyPageOf(partName) {
			const rosettaStore = useRosettaStore();
			const readPage = (pageNumber) => rosettaStore[PART_READER_NAME_BY_PART[partName]](pageNumber);
			const partWords = rosettaPageWords.downloadAllPartWordsByName[partName];
			const refusalTextOf = ({ pageNumber, refusal }) => wordsOf(rosettaPageWords.downloadAllPageFailedTemplate, { pageNumber, partWords, reasonText: refusal.reason });
			const firstRead = await readPage(FIRST_PAGE_NUMBER);
			if (firstRead.refusal) {
				return { refusalText: refusalTextOf({ pageNumber: FIRST_PAGE_NUMBER, refusal: firstRead.refusal }) };
			}
			const { pageCount } = firstRead.answer;
			if (!Number.isInteger(pageCount) || pageCount < FIRST_PAGE_NUMBER) {
				return { refusalText: wordsOf(rosettaPageWords.downloadAllPageCountAbsentTemplate, { partWords }) };
			}
			const pageList = [firstRead.answer];
			for (let pageNumber = FIRST_PAGE_NUMBER + 1; pageNumber <= pageCount; pageNumber += 1) {
				const pageRead = await readPage(pageNumber);
				if (pageRead.refusal) {
					return { refusalText: refusalTextOf({ pageNumber, refusal: pageRead.refusal }) };
				}
				pageList.push(pageRead.answer);
			}
			return { pageList };
		},
		// { zipBlob, zipFileName } for the page to save, or null when it refused (refusalText says why)
		async buildDownloadAll({ jobLink }) {
			const rosettaStore = useRosettaStore();
			this.isBuilding = true;
			this.noteText = '';
			this.refusalText = '';
			try {
				const reportRead = await this.everyPageOf('report');
				if (reportRead.refusalText) {
					this.refusalText = reportRead.refusalText;
					return null;
				}
				const promptRead = await this.everyPageOf('prompts');
				if (promptRead.refusalText) {
					this.refusalText = promptRead.refusalText;
					return null;
				}
				const aiFilenameOutcome = await askAiFilename({ snippetText: nameSnippetOf(reportRead.pageList), authHeaders: rosettaStore.headers() });
				const { baseName, zipFileName, nameNoteText } = downloadBaseNameOf({ aiFilenameOutcome, jobRefId: rosettaStore.jobRefId });
				const fileList = downloadFileListOf({
					baseName,
					jobRefId: rosettaStore.jobRefId,
					pastedText: rosettaStore.pastedText,
					jobStatus: rosettaStore.jobStatus,
					jobLink,
					reportPageList: reportRead.pageList,
					promptPageList: promptRead.pageList,
					expressionByMeaningUri: rosettaStore.expressionByMeaningUri,
				});
				const zipBlob = await buildZip(fileList);
				this.noteText = nameNoteText;
				return { zipBlob, zipFileName };
			} catch (buildError) {
				this.refusalText = wordsOf(rosettaPageWords.downloadAllZipFailedTemplate, { reasonText: buildError.message });
				return null;
			} finally {
				this.isBuilding = false;
			}
		},
	},
});
