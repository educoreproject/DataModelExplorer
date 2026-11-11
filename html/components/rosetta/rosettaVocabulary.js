// ROSETTA VOCABULARY — every word the Rosetta page shows that is not the service's own answer, as data (TQ's standing rule, no magic strings, 2026-11-10).
// The service's words (a refusal's reason, a report's notes, the judge's rationale) arrive in its answers and are shown as they came. {name} slots are filled by
// wordsOf; a slot with no value throws, so a word can never reach the page as braces.

const TEMPLATE_SLOT_PATTERN = /\{([A-Za-z]+)\}/g;

export const rosettaPageWords = Object.freeze({
	pageTitle: 'Rosetta',
	introText: 'Paste your fields: plain lines (a name, or a name and its description), a table copied from a spreadsheet, a field list, a JSON Schema or a JSON-LD @context. A model then reads each field against each hub\'s meanings and proposes the one it expresses. You need no account; signed in, you may send more fields.',
	vendorNoticeText: 'Where your text goes: asking for a judged draft sends your fields to Voyage AI, to turn them into vectors, and to Anthropic, the judge\'s vendor. If your text is neither JSON nor plain lines, pressing Ask for a judged draft first sends it to Anthropic, whose AI lays it out as fields for you to check; nothing is judged until you press again.',
	textareaLabel: 'Your fields: plain lines, a table, a field list, a JSON Schema or a @context',
	textareaPlaceholder: 'One field a line, with or without a description, for example:\nbirthDate: the date the person was born\nschoolName - the name of the school',
	askDraftButton: 'Ask for a judged draft',
	anonymousLimitsNote: 'Not signed in, you may send fewer fields a job and ask for a few jobs an hour; a refusal says the number. Your job is reached by its link alone, so keep the link. It is deleted sooner than a signed-in job.',
	reviewNextStepText: 'Edit it if you like, then press Ask for a judged draft again, or Undo.',
	tabYourFields: 'Your fields',
	tabJob: 'Job',
	tabReport: 'Report',
	tabDrafts: 'Drafts',
	tabPrompt: 'Prompt',
	undoButton: 'Undo',
	statusLabel: 'Status:',
	queuePlaceText: 'Place in the queue: {position}',
	unitsFinishedText: 'Finished {unitsFinished} of {unitsTotal} (one is one field against one hub)',
	estimateText: 'Estimate ${estimateUsd}',
	spentText: '; spent ${spentUsd}',
	cancelButton: 'Cancel',
	jobLinkLabel: 'This job\'s link:',
	copyJobLinkButton: 'Copy the link',
	reportFieldHeading: 'Field',
	reportHubHeading: 'Hub',
	reportResultHeading: 'Result',
	reportRationaleHeading: 'The judge\'s words',
	downloadDraftButton: 'Download the {hubName} draft',
	promptIntroText: 'The exact prompt each field was judged with against each hub, as it was sent to the judge. A field judged without a prompt (no candidate, or an identifier in its text) has none.',
	promptSystemLabel: 'System prompt',
	promptUserLabel: 'Prompt for {requestName} against {hubName}',
	promptUserBodyLabel: 'Prompt',
	promptNoneText: 'No prompt was stored for this job.',
	undoConfirmTitle: 'Undo your edits too?',
	undoConfirmText: 'You have changed the fields since they were read. Undo puts back the text you pasted, and your changes are lost.',
	undoKeepButton: 'Keep my edits',
	undoDiscardButton: 'Undo',
});

// the limits themselves are the service's config, never typed here: a refusal names the number that refused
export const wordsOf = (templateText, valueBySlotName) => templateText.replace(TEMPLATE_SLOT_PATTERN, (wholeSlot, slotName) => {
	if (valueBySlotName[slotName] === undefined || valueBySlotName[slotName] === null) {
		throw new Error(`rosettaVocabulary: '${templateText}' names {${slotName}}, which was not given`);
	}
	return String(valueBySlotName[slotName]);
});
