// useAiFilename — one Haiku call that suggests a camelCase filename for a download, shared by the DME (pages/dm/explorer.vue) and Rosetta
// (stores/rosettaDownloadAllStore.js). Extracted from explorer.vue's generateAiFilename (WORKORDER-rosettaDownloadAll-111226); its words and limit are in
// aiFilenameSettings.js.
//
//   askAiFilename({ snippetText, authHeaders }) → { suggestedName } or { failureName, failureDetailText }: never throws, so a caller can say why it has no name
//   useAiFilename({ getAuthHeaders, warnLabel }) → { generateAiFilename(snippet) }: the DME's door, unchanged in behaviour: the answer's text, or null after a
//     console warning under warnLabel. Headers are asked for at call time, so a sign-in after the page opened is used.
//
// The answer is the model's text as it came. Each caller cleans it for its own use (the DME's panels strip quotes and dots; Rosetta keeps letters, digits, - and _).

import axios from 'axios';
import { aiFilenameSettings } from './aiFilenameSettings.js';

export const AI_FILENAME_FAILURE_NAME = Object.freeze({ capped: 'capped', failed: 'failed', unusable: 'unusable' });

const PROMPT_SLOT_PATTERN = /\{(maxNameLength|snippetText)\}/g;
export const aiFilenamePromptOf = (snippetText) => {
	const valueBySlotName = { maxNameLength: aiFilenameSettings.maxNameLength, snippetText };
	return aiFilenameSettings.promptTemplate.replace(PROMPT_SLOT_PATTERN, (wholeSlot, slotName) => String(valueBySlotName[slotName]));
};

export const askAiFilename = async ({ snippetText, authHeaders }) => {
	try {
		const response = await axios.post(aiFilenameSettings.utilityUrl, { prompt: aiFilenamePromptOf(snippetText), model: aiFilenameSettings.modelName }, { headers: authHeaders });
		const suggestedName = response.data ? response.data.response : undefined;
		if (typeof suggestedName !== 'string' || suggestedName.trim() === '') {
			return { failureName: AI_FILENAME_FAILURE_NAME.unusable, failureDetailText: '' };
		}
		return { suggestedName };
	} catch (requestError) {
		const isCapped = requestError?.response?.status === aiFilenameSettings.cappedHttpStatus;
		return { failureName: isCapped ? AI_FILENAME_FAILURE_NAME.capped : AI_FILENAME_FAILURE_NAME.failed, failureDetailText: requestError.message };
	}
};

export const useAiFilename = ({ getAuthHeaders, warnLabel }) => ({
	generateAiFilename: async (snippet) => {
		const outcome = await askAiFilename({ snippetText: snippet, authHeaders: getAuthHeaders() });
		if (outcome.suggestedName !== undefined) {
			return outcome.suggestedName;
		}
		console.warn(`[${warnLabel}] AI filename generation failed:`, outcome.failureDetailText || outcome.failureName);
		return null;
	},
});
