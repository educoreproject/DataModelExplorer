// dmeExamplePromptList.ts — the Data Model Explorer's example prompts (WEL, 2026-10-07).
//
// Each prompt names the standard families it needs (requiredFamilyList, by StandardDefinition.standardFamily as
// dme_list_standards returns it). The explorer page shows a prompt only when every family it needs is loaded in the
// graph right now, so a prompt never asks about a standard the graph does not hold (the 16-standard list this replaced
// asked about LIF, SEDM, CTDL, JEDx, SOC and CIP after they had left the graph). A prompt needing no family is about
// the graph itself and is shown even when the standards list is unavailable.
//
// Every prompt was answered on GOLD_EVAL_261007_jevOmissions before it shipped, and every prompt below was answered again
// through the DEV askMilo path on GOLD_EVAL_261021_ctdlHub (two hubs, 14 standards) before ctdlHub/samplePrompts shipped;
// the answers are kept in educore/system/testData/dmeSamplePrompts/. Wording rule: a mapping is a JUDGMENT (one of four
// relations, with a confidence and a source); never call one authored, authoritative or established. A DECLARED
// CORRESPONDENCE is a statement a standard published; never call one a mapping. Hubs are peers: name the hub you mean,
// never "the hub".

export interface DmeExamplePrompt {
	promptText: string;
	requiredFamilyList: string[];
}

export const dmeExamplePromptList: DmeExamplePrompt[] = [
	{
		promptText: 'Describe this graph from its self-documentation: identity, provenance, and the recipe it was built from. Then list every standard it contains, grouped by family, with node counts and how many judged mappings each has to each hub.',
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
	// ctdlHub P7: CTDL as the second hub; offered only where the graph holds CTDL
	{
		promptText: 'What is ceterms:Credential in this graph: its CTDL hub card, a few of its properties, and any judged mapping or declared correspondence that reaches it? Keep the two hubs apart.',
		requiredFamilyList: ['CTDL'],
	},
	{
		promptText: 'Which hubs does this graph hold, with their versions, and how many judged mappings reach each hub from each standard?',
		requiredFamilyList: ['CEDS', 'CTDL'],
	},
	// ctdlHub samplePrompts: regression — the judged mappings of the non-CTDL standards are still present, and still CEDS-hub
	{
		promptText: 'For Ed-Fi, SIF and each PESC release, count the judged mappings by hub and by relation. Do any of them reach a hub other than CEDS?',
		requiredFamilyList: ['CEDS', 'EdFi', 'SIF', 'PESC'],
	},
	{
		promptText: 'Show a few PESC College Transcript 1.8.0 elements judged EXACT_MATCH to a CEDS tuple with confidence 0.9 or higher, with the tuple each lands on.',
		requiredFamilyList: ['CEDS', 'PESC'],
	},
	{
		promptText: 'Compare the Ed-Fi and CEDS code sets for a student’s sex: which values line up, and which have no counterpart?',
		requiredFamilyList: ['CEDS', 'EdFi'],
	},
	{
		promptText: 'Which CEDS tuple does a student’s grade level land on, and which SIF, Ed-Fi and PESC elements map to it, by which relation and confidence?',
		requiredFamilyList: ['CEDS', 'SIF', 'EdFi', 'PESC'],
	},
	// ctdlHub samplePrompts: two hubs — CEDS and CTDL side by side, the CTDL family, and the declared correspondences
	{
		promptText: 'List the hubs in this graph with their versions, and how many HubReference cards each holds in each tier: term, property and value.',
		requiredFamilyList: ['CEDS', 'CTDL'],
	},
	{
		promptText: 'Show the CTDL term ceterms:name and its HubReference cards: how many CTDL classes use it, and name a few of them.',
		requiredFamilyList: ['CTDL'],
	},
	{
		promptText: 'Walk the CTDL Accommodation concept scheme: its top concepts and the narrower concepts under each.',
		requiredFamilyList: ['CTDL'],
	},
	{
		promptText: 'Which CTDL properties are declared subproperties or inverses of other CTDL properties? Show a few of each.',
		requiredFamilyList: ['CTDL'],
	},
	{
		promptText: 'Which CTDL concepts does CTDL publish as corresponding to CEDS values? Group those declared correspondences by predicate, with a few examples each.',
		requiredFamilyList: ['CEDS', 'CTDL'],
	},
	{
		promptText: 'Which CTDL Financial Assistance concepts does CTDL declare equivalent to CEDS financial aid values? List each pair with its predicate.',
		requiredFamilyList: ['CEDS', 'CTDL'],
	},
	{
		promptText: 'What does CTDL-ASN declare equivalent to in CTDL? Show each pair and the predicate.',
		requiredFamilyList: ['CTDL', 'CTDLASN'],
	},
	{
		promptText: 'How does CTDL-QData connect to CTDL? Show which QData classes use CTDL properties or point at CTDL classes.',
		requiredFamilyList: ['CTDL', 'CTDLQData'],
	},
	// ctdlHub samplePrompts: the graph describing itself — hubs, standards, declared correspondences, attestations
	{
		promptText: 'What does this graph say about itself: its hubs and their versions, its standards by family, its judged match edges by hub, and its declared correspondences by source and target?',
		requiredFamilyList: [],
	},
	{
		promptText: 'What is the difference between a declared correspondence and a judged mapping in this graph? Give one real example of each, with its source and how it is recorded.',
		requiredFamilyList: ['CEDS', 'CTDL'],
	},
	{
		promptText: 'Which build attestations does this graph carry, what does each check, and do they all pass?',
		requiredFamilyList: [],
	},
];

// FUTURE — PESC_LD (PESC's JSON-LD College Transcript) is not in the graph yet. These prompts are NOT shipped: move each
// into the list above only after the PESC_LD forge lands AND the prompt has been answered on that graph. Replace
// 'PESCLD' with the standardFamily the PESC_LD forge actually declares (dme_list_standards prints it).
//
//	{
//		promptText: 'Which PESC JSON-LD College Transcript elements carry a ceds: identifier, and does each land on the CEDS card with that identifier by declared identity rather than by a judge?',
//		requiredFamilyList: ['CEDS', 'PESCLD'],
//	},
//	{
//		promptText: 'Which PESC JSON-LD elements reuse ceterms: terms, and which CTDL term HubReference card does each land on?',
//		requiredFamilyList: ['CTDL', 'PESCLD'],
//	},
//	{
//		promptText: 'PESC JSON-LD elements carry labels but no definitions. How many have a definition, and how were the label-only elements placed on a hub?',
//		requiredFamilyList: ['PESCLD'],
//	},
//	{
//		promptText: 'Show a College Transcript concept such as course credit in both PESC encodings, XML 1.8.0 and JSON-LD, side by side, with the hub card each lands on.',
//		requiredFamilyList: ['CEDS', 'CTDL', 'PESC', 'PESCLD'],
//	},
