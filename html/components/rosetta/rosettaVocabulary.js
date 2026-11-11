// ROSETTA VOCABULARY — every word the Rosetta page shows that is not the service's own answer, as data (TQ's standing rule, no magic strings, 2026-11-10).
// The service's words (a refusal's reason, a report's notes, the judge's rationale) arrive in its answers and are shown as they came. {name} slots are filled by
// wordsOf; a slot with no value throws, so a word can never reach the page as braces.

const TEMPLATE_SLOT_PATTERN = /\{([A-Za-z]+)\}/g;

export const rosettaPageWords = Object.freeze({
	pageTitle: 'Rosetta',
	introText: 'Paste your fields: plain lines (a name, or a name and its description), a table copied from a spreadsheet, a field list, a JSON Schema or a JSON-LD @context. A model then reads each field against each hub\'s meanings and proposes the one it expresses. You need no account; signed in, you may send more fields.',
	vendorNoticeText: 'Where your text goes: asking for a judged draft sends your fields to Voyage AI, to turn them into vectors, and to Anthropic, the judge\'s vendor. If your text is neither JSON nor plain lines, pressing Ask for a judged draft first sends it to Anthropic, whose AI lays it out as fields for you to check; nothing is judged until you press Submit the Request.',
	textareaLabel: 'Your fields: plain lines, a table, a field list, a JSON Schema or a @context',
	textareaPlaceholder: 'One field a line, with or without a description, for example:\nbirthDate: the date the person was born\nschoolName - the name of the school',
	askDraftButton: 'Ask for a judged draft',
	// ⟪rosettaReportLegible, TQ⟫ the button's words while the page shows its reading of the text for review; Undo, or a JSON paste, keeps askDraftButton
	submitRequestButton: 'Submit the Request',
	anonymousLimitsNote: 'Not signed in, you may send fewer fields a job and ask for a few jobs an hour; a refusal says the number. Your job is reached by its link alone, so keep the link. It is deleted sooner than a signed-in job.',
	reviewNextStepText: 'Edit it if you like, then press Submit the Request, or Undo.',
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

	// ⟪rosettaReportLegible⟫ PROGRESS while a job is open (TQ: "We need a progress spinner on the job page when it is started"), and its end
	progressSendingText: 'Sending your fields…',
	// ⟪review S4⟫ the AI laying pasted text out as fields is not a job: it says what it is
	progressInterpretingText: 'Reading your text into fields…',
	// ⟪review S2⟫ a status check that failed: the page stops claiming progress and offers to look again
	statusCheckFailedText: 'The page could not check on this job, so it is not showing progress. The job may still be running.',
	statusCheckRetryButton: 'Check again',
	progressQueuedText: 'Waiting in the queue',
	progressQueuedPlaceText: 'Waiting in the queue: place {position}',
	progressRunningText: 'Judging…',
	progressRunningUnitsText: 'Judging: {unitsFinished} of {unitsTotal} finished (one is one field against one hub)',
	progressCancellingText: 'Cancelling…',
	// what each status a job can end in says, by the status's own name (rosettaJobRunner's JOB_STATUS); a status not listed is said by endedOtherTemplate, never silently
	endedTextByStatus: Object.freeze({
		cancelled: 'This job was cancelled.',
		stopped: 'This job stopped before it finished.',
		fuseTripped: 'This job stopped: it reached a spending limit.',
		vendorStopped: 'This job stopped: the judge\'s vendor would not answer.',
	}),
	endedOtherTemplate: 'This job ended as {status}.',
	endedReasonTemplate: '{stopReasonText} ({stopReasonName})',
	// ⟪review B1⟫ a reason the service names without text (a queued job cancelled: cancelledByOwner), in words; a name not listed is said by endedReasonNameTemplate
	stopReasonWordsByName: Object.freeze({
		cancelledByOwner: 'It was cancelled before it started.',
	}),
	endedReasonNameTemplate: '({stopReasonName})',
	endedPartDivider: ' ',
	// ⟪TQ addendum⟫ on completion: where to look, and a mark on the Report tab until it is opened
	reportReadyText: 'Your report is ready. Open the Report tab to read it, field by field.',
	reportReadyOpenButton: 'Open the report',
	reportTabNewBadgeLabel: 'new',

	// ⟪rosettaReportLegible⟫ THE REPORT, field by field (TQ: "It doesn't tell me anything about what happened")
	reportDetailHeading: 'What the judge found, field by field',
	reportFieldDefinitionAbsentText: 'You gave this field no description.',
	reportHubTemplate: 'Against {hubName}',
	reportMeaningLabel: 'Meaning',
	reportMeaningUriLabel: 'Its EDUcore URI',
	reportOpenInMeaningsLink: 'Open in Meanings',
	reportSlotsLabel: 'What it names',
	reportTupleAbsentTemplate: 'Its parts could not be named ({tupleAbsentName}).',
	reportSlotUriAbsentTemplate: 'no URI ({uriAbsentReason})',
	reportHubIdsTemplate: '{hubName} {nativeIdListText}',
	reportStrengthLabel: 'Strength',
	reportRelationLabel: 'Relation',
	reportRationaleLabel: 'The judge\'s words',
	reportGraphLabel: 'In the graph',
	reportExpressedTemplate: '{elementCountText} of other standards already map to this meaning.',
	reportExpressedNoneText: 'No element of another standard maps to this meaning yet.',
	reportExpressedReadingText: 'Reading how it links into the graph…',
	reportExpressedUnreadTemplate: 'How it links into the graph could not be read: {reasonText}',
	reportExpressedLinkText: 'See them in Meanings',
	reportExpressedNoCountText: 'the Meanings answer gave no count',
	reportExpressedHttpTemplate: 'the Meanings answer came back {httpStatus} {httpStatusText}',
	reportExpressedRetryButton: 'Try again',
	reportExpressedOverLimitTemplate: 'this page proposes more meanings than it reads at once ({meaningReadsPerPageLimit}); open the meaning in Meanings',
	reportNoProposalLabel: 'No meaning proposed',
	reportNoProposalReasonLabel: 'Why',
	reportSummaryHeading: 'Summary',
	reportCountsTemplate: '{hubName}: {countListText}',
	reportCountPartTemplate: '{countWords} {count}',
	reportCountDivider: ', ',
	// the strength the judge gave (its category), with what it means; only strong goes into a draft (rosettaJudgedSettings.draftCategoryList)
	strengthByCategory: Object.freeze({
		strong: Object.freeze({ words: 'Strong', explanation: 'The judge found this meaning says what your field says. Only a strong match goes into the draft.' }),
		moderate: Object.freeze({ words: 'Moderate', explanation: 'The judge found this meaning close to your field, with a difference worth checking. It is left out of the draft.' }),
		weakButReal: Object.freeze({ words: 'Weak but real', explanation: 'The judge found a real link, but a loose one. It is left out of the draft.' }),
	}),
	strengthOtherTemplate: 'The judge named this strength {category}.',
	// the relation (SSSOM direction: the subject is your field, the object the hub's meaning, so a broad match says the meaning is the broader)
	relationByPredicate: Object.freeze({
		exactMatch: 'Exact match: your field and this meaning are the same idea.',
		closeMatch: 'Close match: your field and this meaning are nearly the same idea, close enough to use one for the other in most places.',
		broadMatch: 'Broad match: this meaning is broader than your field; your field is one kind of it.',
		narrowMatch: 'Narrow match: this meaning is narrower than your field; it is one kind of what your field holds.',
		relatedMatch: 'Related match: your field and this meaning are linked, but neither is the other.',
	}),
	relationOtherTemplate: 'The judge named this relation {predicate}.',
	relationAbsentText: 'The judge was not asked for a relation.',
	// a unit with no proposal, by its status's own name (rosettaReport's STATUS_COUNT_NAME_LIST); a status not listed is said by noProposalOtherTemplate
	noProposalTextByStatus: Object.freeze({
		abstained: 'The judge looked at this hub\'s closest meanings and found none that says what your field says.',
		abstainedOnCutAnswer: 'The judge\'s answer was cut off before it chose, so it is counted as no choice.',
		noCandidate: 'No meaning in this hub came close enough to your field to show the judge.',
		notJudged: 'This field was not judged against this hub.',
		lostAtRestart: 'The service restarted while this field was being judged, so it was not asked again.',
		judgeRefused: 'The judge\'s answer could not be used.',
		identifierInSourceText: 'Your field\'s text looks like it holds an identifier, so it was not sent to the judge.',
		identifierInCandidateText: 'A meaning the judge would have seen holds text that looks like an identifier, so nothing was sent.',
	}),
	noProposalOtherTemplate: 'This field ended as {status} against this hub.',
	notJudgedReasonTemplate: 'The service says: {notJudgedReason}',
	// the summary's count names, said plainly (rosettaReport's count names)
	countWordsByName: Object.freeze({
		proposedStrong: 'strong',
		proposedModerate: 'moderate',
		proposedWeak: 'weak but real',
		abstained: 'no meaning found',
		abstainedOnCutAnswer: 'answer cut off',
		noCandidate: 'nothing close enough',
		notJudged: 'not judged',
		lostAtRestart: 'lost at a restart',
		judgeRefused: 'answer unusable',
		identifierInSourceText: 'identifier in your text',
		identifierInCandidateText: 'identifier in a meaning',
		answersCut: 'answers cut off',
	}),
});

// the limits themselves are the service's config, never typed here: a refusal names the number that refused
export const wordsOf = (templateText, valueBySlotName) => templateText.replace(TEMPLATE_SLOT_PATTERN, (wholeSlot, slotName) => {
	if (valueBySlotName[slotName] === undefined || valueBySlotName[slotName] === null) {
		throw new Error(`rosettaVocabulary: '${templateText}' names {${slotName}}, which was not given`);
	}
	return String(valueBySlotName[slotName]);
});
