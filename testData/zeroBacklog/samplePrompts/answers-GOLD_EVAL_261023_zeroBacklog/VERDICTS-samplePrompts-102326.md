# DME sample prompts: verdicts on GOLD_EVAL_261023_zeroBacklog (COBALT_PRISM, zeroBacklog lane E, 2026-10-23)

**How each answer was produced.** `runSamplePrompts.js` (this folder), STEEL_ARROW's 10-21 method: ws-graphinator Standard-mode input (singleCallPromptName DataModelExplorer, expandModel opus, perspectives 0, DmeUser* suppressed), `json` for `stream`, askMilo from the merge-ready code (educore zb/e-dme) through a scratch config naming GOLD_EVAL_261023_zeroBacklog directly; the 29 live prompts plus the 4 PESC_LD prompts (live only in the scratch copy until these verdicts). Stop line $55 (BRONZE_CROWN).

**Spend (measured, askMilo cost.usd summed):** USD 25.5551 over 33 answers. Every answer `end_turn`, none cut off, none carries a refusal name or an error (mechanical screen).

**How each answer was judged.** Figure-checked against read-only Cypher on the gold where the prompt asks for counts or names a CTDL mapping, a PESC_LD declared identity, a CEDS term card or the structural version (marked below). The others were screened mechanically only (completed, no refusal, no error): **not** figure-checked, said plainly.

| # | prompt (short) | cost USD | verdict |
|---|---|---|---|
| prompt01 | Describe this graph from its self-documentation: identity, provenance, and the recipe it w | 0.3488 | GOOD: passport identity, structural version V.09, standards by family with per-hub mapping columns (CTDL now non-zero) |
| prompt02 | How many match edges of each relation — exact, close, broad, narrow — does the graph hold, | 0.1808 | GOOD, with noise: relation totals = graph, hubs combined (CLOSE 7,822 = 5,565 CEDS + 2,257 CTDL; BROAD 4,565; EXACT 4,501; NARROW 2,634; 19,522). Noise: says every edge carries mappingConfidence; the 237 PESC_LD declared identities carry none |
| prompt03 | Explain the difference between EXACT_MATCH, CLOSE_MATCH, BROAD_MATCH and NARROW_MATCH in t | 0.2197 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt04 | Pick a concept — student attendance — and show which standards model it and, for each mapp | 0.6091 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt05 | What is the canonical CEDS address (the HubReference tuple) for a student’s birthdate, and | 0.2372 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt06 | Compare how SIF and Ed-Fi model a student’s birth date: which CEDS tuple does each land on | 1.0486 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt07 | Find a few elements in SIF and Ed-Fi that are equivalent under the conservative rule — bot | 0.3782 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt08 | SIF splits some concepts across letter case (BirthDate and birthDate). Show the SIF nodes  | 0.4006 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt09 | Which PESC College Transcript elements were mapped to CEDS with confidence below 0.7? Show | 0.6064 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt10 | How many judged mappings to CEDS does each PESC release carry, and which release has the m | 0.2222 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt11 | Which Ed-Fi properties have no CEDS mapping? Show a few examples and the total count. | 1.9194 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt12 | How do the loaded standards represent a student’s English learner status, and how confiden | 0.598 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt13 | What is ceterms:Credential in this graph: its CTDL hub card, a few of its properties, and  | 2.4191 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt14 | Which hubs does this graph hold, with their versions, and how many judged mappings reach e | 0.1548 | GOOD: CEDS 14.0.0.0 and CTDL Release 20260927, per-hub counts |
| prompt15 | For Ed-Fi, SIF and each PESC release, count the judged mappings by hub and by relation. Do | 0.2835 | GOOD: per standard, per hub, per relation; Ed-Fi CEDS 1,106 / CTDL 283, SIF CEDS 4,689 / CTDL 2,283 = graph |
| prompt16 | Show a few PESC College Transcript 1.8.0 elements judged EXACT_MATCH to a CEDS tuple with  | 0.2897 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt17 | Compare the Ed-Fi and CEDS code sets for a student’s sex: which values line up, and which  | 0.8543 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt18 | Which CEDS tuple does a student’s grade level land on, and which SIF, Ed-Fi and PESC eleme | 0.7601 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt19 | List the hubs in this graph with their versions, and how many HubReference cards each hold | 0.9359 | GOOD: every hub tier count = graph (CEDS term 23,237 / property 2,777 / value 91,825; CTDL term 1,027 / property 7,459 / value 5,510) |
| prompt20 | Show the CTDL term ceterms:name and its HubReference cards: how many CTDL classes use it,  | 0.3196 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt21 | Walk the CTDL Accommodation concept scheme: its top concepts and the narrower concepts und | 0.6497 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt22 | Which CTDL properties are declared subproperties or inverses of other CTDL properties? Sho | 0.3916 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt23 | Which CTDL concepts does CTDL publish as corresponding to CEDS values? Group those declare | 1.5413 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt24 | Which CTDL Financial Assistance concepts does CTDL declare equivalent to CEDS financial ai | 0.3962 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt25 | What does CTDL-ASN declare equivalent to in CTDL? Show each pair and the predicate. | 0.5646 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt26 | How does CTDL-QData connect to CTDL? Show which QData classes use CTDL properties or point | 2.3848 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt27 | What does this graph say about itself: its hubs and their versions, its standards by famil | 0.3425 | GOOD: names structural version V.09, hubs, families, edges by hub |
| prompt28 | What is the difference between a declared correspondence and a judged mapping in this grap | 0.7067 | ANSWERED (mechanical screen only; not figure-checked) |
| prompt29 | Which build attestations does this graph carry, what does each check, and do they all pass | 0.2796 | GOOD: 6 attestations, 5 pass, goldEvalCheck notRun (= graph) |
| prompt30 | Which PESC JSON-LD College Transcript elements carry a ceds: identifier, and does each lan | 2.6265 | GOOD: 62 PESC_LD property rows carry a ceds: CURIE; 61 reach the CEDS term card by declaredIdentity (authored, no confidence); the one exception, hasStudentIdentificationSystem ceds:P001075, has no CEDS card (P001075 is absent from CEDS 14, measured: a PESC_LD authoring question for the Credential Engine / PESC letter). Scope: property rows only (also 140 option values and 18 shapes carry ceds: CURIEs, all declared) |
| prompt31 | Which PESC JSON-LD elements reuse ceterms: terms, and which CTDL term HubReference card do | 1.3 | GOOD: 16 property rows, 11 distinct ceterms: terms, every one EXACT_MATCH declaredIdentity to its CTDL term card (= graph). Omits the 2 shapes that also carry ceterms: CURIEs |
| prompt32 | PESC JSON-LD elements carry labels but no definitions. How many have a definition, and how | 1.049 | GOOD: 48 of 266 property rows carry a usage note, 0 of 39 shapes; 322 edges by mechanism (219 + 18 declared, 47 / 18 / 10 / 10 judged) = graph |
| prompt33 | Show a College Transcript concept such as course credit in both PESC encodings, XML 1.8.0  | 0.5366 | GOOD: CourseCreditEarned (XML 1.8.0, EXACT 0.5 via instances to P000200) beside Number of Credits Earned (PESC_LD, declared identity to the P000200 term card) = graph |
