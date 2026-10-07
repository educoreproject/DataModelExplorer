// dmeExamplePromptList.ts — the Data Model Explorer's example prompts (WEL, 2026-10-07).
//
// Each prompt names the standard families it needs (requiredFamilyList, by StandardDefinition.standardFamily as
// dme_list_standards returns it). The explorer page shows a prompt only when every family it needs is loaded in the
// graph right now, so a prompt never asks about a standard the graph does not hold (the 16-standard list this replaced
// asked about LIF, SEDM, CTDL, JEDx, SOC and CIP after they had left the graph). A prompt needing no family is about
// the graph itself and is shown even when the standards list is unavailable.
//
// Every prompt was answered on GOLD_EVAL_261007_jevOmissions before it shipped. Wording rule: a mapping is a JUDGMENT
// (one of four relations, with a confidence and a source); never call one authored, authoritative or established.

export interface DmeExamplePrompt {
	promptText: string;
	requiredFamilyList: string[];
}

export const dmeExamplePromptList: DmeExamplePrompt[] = [
	{
		promptText: 'Describe this graph from its self-documentation: identity, provenance, and the recipe it was built from. Then list every standard it contains, grouped by family, with node counts and how many judged mappings each has to the hub.',
		requiredFamilyList: [],
	},
	{
		promptText: 'How many match edges of each relation — exact, close, broad, narrow — does the graph hold, and what share of the non-hub properties is mapped?',
		requiredFamilyList: [],
	},
	{
		promptText: 'Explain the difference between EXACT_MATCH, CLOSE_MATCH, BROAD_MATCH and NARROW_MATCH in this graph, with one real example of each and its confidence.',
		requiredFamilyList: [],
	},
	{
		promptText: 'Pick a concept — student attendance — and show which standards model it and, for each mapping to CEDS, its relation, confidence and source.',
		requiredFamilyList: ['CEDS'],
	},
	{
		promptText: 'What is the canonical CEDS address (the HubReference tuple) for a student’s birthdate, and which standards’ elements map to it — by which relation, and with what confidence?',
		requiredFamilyList: ['CEDS'],
	},
	{
		promptText: 'Compare how SIF and Ed-Fi model a student’s birth date: which CEDS tuple does each land on, by which relation, and how confident was the judge?',
		requiredFamilyList: ['CEDS', 'SIF', 'EdFi'],
	},
	{
		promptText: 'Find a few elements in SIF and Ed-Fi that are equivalent under the conservative rule — both judged EXACT_MATCH to the same CEDS tuple — and show both confidences. Then show a pair that is only a candidate because one hop is CLOSE_MATCH.',
		requiredFamilyList: ['CEDS', 'SIF', 'EdFi'],
	},
	{
		promptText: 'SIF splits some concepts across letter case (BirthDate and birthDate). Show the SIF nodes named BirthDate in any case and what each maps to in CEDS.',
		requiredFamilyList: ['CEDS', 'SIF'],
	},
	{
		promptText: 'Which PESC College Transcript elements were mapped to CEDS with confidence below 0.7? Show the relation and the judge’s rationale for a few.',
		requiredFamilyList: ['CEDS', 'PESC'],
	},
	{
		promptText: 'How many judged mappings to CEDS does each PESC release carry, and which release has the most?',
		requiredFamilyList: ['CEDS', 'PESC'],
	},
	{
		promptText: 'Which Ed-Fi properties have no CEDS mapping? Show a few examples and the total count.',
		requiredFamilyList: ['CEDS', 'EdFi'],
	},
	{
		promptText: 'How do the loaded standards represent a student’s English learner status, and how confidently does each map to CEDS?',
		requiredFamilyList: ['CEDS'],
	},
];
