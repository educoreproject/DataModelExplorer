// jedxCompanionAskDmePromptList.ts — the Ask DME links on the JEDx companion page (SPEC-companionPages-102826, the Ask
// DME panel; DEV-122: "Link opens Data Model Explorer with a baked-in prompt ... the baked-in prompt returns consistent
// output across repeated runs in DME"). Each link opens /dm/explorer with the prompt filled in and NOT sent
// (?prefillPrompt=), so the visitor reads it and presses Submit.
//
// A prompt is listed here only after it was run FIVE times through the local DME on the golden named in its record and
// the five answers agreed on the substantive content: the JEDx object, its fields, and the CEDS and CTDL equivalents
// named. The runs, the answers and the judgement are in the companion pages DEVLOG, "Phase 4". A prompt that failed is
// not here; it is recorded there with why.

export interface JedxAskDmePrompt {
	jedxObjectName: string;
	promptText: string;
	consistencyRecord: { goldenName: string; runCount: number; agreedRunCount: number; testedOn: string };
}

export const jedxCompanionAskDmePromptList: JedxAskDmePrompt[] = [
	{
		jedxObjectName: 'WorkerType',
		promptText: 'Show the JEDx WorkerType object, its fields, and their CEDS and CTDL equivalents with match relation and confidence.',
		consistencyRecord: { goldenName: 'GOLD_EVAL_261026_respelled', runCount: 5, agreedRunCount: 5, testedOn: '2026-10-28' },
	},
	{
		jedxObjectName: 'PositionType',
		promptText: 'Show the JEDx PositionType object, its fields, and their CEDS and CTDL equivalents with match relation and confidence.',
		consistencyRecord: { goldenName: 'GOLD_EVAL_261026_respelled', runCount: 5, agreedRunCount: 5, testedOn: '2026-10-28' },
	},
	{
		jedxObjectName: 'JobType',
		promptText: 'Show the JEDx JobType object, its fields, and their CEDS and CTDL equivalents with match relation and confidence.',
		consistencyRecord: { goldenName: 'GOLD_EVAL_261026_respelled', runCount: 5, agreedRunCount: 5, testedOn: '2026-10-28' },
	},
	{
		jedxObjectName: 'AddressType',
		promptText: 'Show the JEDx AddressType object, its fields, and their CEDS and CTDL equivalents with match relation and confidence.',
		consistencyRecord: { goldenName: 'GOLD_EVAL_261026_respelled', runCount: 5, agreedRunCount: 5, testedOn: '2026-10-28' },
	},
];
