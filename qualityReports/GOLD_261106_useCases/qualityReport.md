# EDUcore mapping-quality report: the first baseline

- **Graph:** `GOLD_261106_useCases`
- **Manifest:** educore-2026-10-30 (`783aef401faf…`)
- **Graph built:** 2026-11-06T21:23:29.132Z
- **Graph contract:** `f65db22ad184…`
- **Human judgments:** CEDS Rater store snapshot `raterTool-20261108-031501.sqlite3` (sha256 `7d5cbc07545f…`)
- **Generator:** `cli/lib.d/quality-report` at `a0dc4985ba`

This is the first published measurement of the mappings in EDUcore, for one build: `GOLD_261106_useCases`, manifest educore-2026-10-30. It reports what can be counted today and states the size of every sample beside the figure drawn from it. Most of the graph's mappings were proposed by an AI judge and have not been reviewed by people; a first sample of human judgments exists, and it is reported here as a baseline to measure against as the human gold set grows, ahead of the evaluation harness that is the next step.

## 1. At a glance

| Measure | Figure | Drawn from |
|:---|:---|:---|
| Standards loaded | 27 | every standard root in the graph (`standards_standards`) |
| Graph nodes | 315,273 | every node, by standard (`standards_stats`) |
| Non-hub properties mapped to at least one hub | 8,999 of 23,331 (38.6%) | `standards_stats` coverage, all 24 non-hub standards with properties |
| … mapped to CEDS | 7,909 of 23,331 (33.9%) | the CEDS hub only |
| … mapped to CTDL | 3,328 of 23,331 (14.3%) | the CTDL hub only |
| Mappings (match edges) | 22,691 | 5,368 exact, 9,341 close, 5,007 broad, 2,975 narrow |
| Publisher-stated mappings | 454 of 22,691 (2.0%) | edges whose source is the standard's own document |
| Machine-proposed mappings | 22,237 of 22,691 (98.0%) | edges chosen by the AI judge |
| Human-reviewed mappings in the graph | 0 | no edge records a review yet (see section 4) |
| Agreement with human raters, same CEDS card | 60 of 101 (59.4%) answers; 95% interval 50% to 68% | a first sample: 3 raters, 100 elements of Ed-Fi, SIF and PESC, CEDS hub only |
| … where the judge was confident (strong) | 29 of 40 (72.5%) | answers whose element the graph maps with strong confidence |
| … where the judge was least sure (weak) | 3 of 16 (18.8%) | answers whose element the graph maps with weak-but-real confidence |
| Same hub property wherever one element recurs | 1,975 of 2,037 (97.0%) | SIF and PESC elements judged separately in two or more places, both hubs |

## 2. How to read the figures

- **Hubs.** This build has two hubs, CEDS 14.0.0.0 and CTDL Release 20260927. Other standards' elements are mapped onto hub **cards** (a hub class, property and qualifiers). The hubs are peers: two elements correspond only through one card of one hub, never across hubs, so every mapping figure below names its hub.
- **Properties and edges are different units.** A *property* is one element of a standard (a SIF Question or a PESC element declaration counts once, however many places it appears). An *edge* is one mapping in the graph. SIF and PESC carry their mappings on each place an element appears, so one property can own many edges.
- **Relations** (SKOS): **exact**, the hub card means the same thing as the element; **close**, nearly the same, differing slightly in scope or detail; **broad**, the hub card is BROADER than the element; **narrow**, the hub card is NARROWER than the element.
- **Confidence** is the AI judge's own confidence in its pick, stored in three bands: **strong** (the judge's own confidence in its pick was 0.8 or more); **moderate** (the judge's confidence was 0.5 to under 0.8); **weak but real** (the judge's confidence was under 0.5). It is the judge's view of itself, not a measured accuracy; section 5 compares it with human answers.
- **Every count here is read from the graph or the rater store named on the stamp above.** The overall counts are the same answers the public `standards_stats` and `standards_standards` tools give for this graph; each per-standard table was checked to add up to them (appendix).

## 3. Coverage

Of the 23,331 properties of the non-hub standards, **8,999 of 23,331 (38.6%)** are mapped to at least one hub card. 7,909 are mapped to CEDS and 3,328 are mapped to CTDL; a property mapped to both counts once in the total. The hubs' own 2,721 properties are counted apart: a hub is not mapped to itself.

An unmapped property is not necessarily a gap. Many have no counterpart in either hub (a standard's internal identifiers, message plumbing, or concepts the hubs do not model), and the judge is allowed to decline. How much of the unmapped share is a true miss is not yet measured; section 5 gives the first evidence from human raters.

| Standard | Version | Properties | Mapped to any hub | to CEDS | to CTDL |
|:---|:---|---:|---:|---:|---:|
| CASE | 1.1 | 201 | 101 of 201 (50.2%) | 95 | 30 |
| CLR | 2.0 | 206 | 91 of 206 (44.2%) | 79 | 51 |
| CTDLASN | 20260626 | 97 | 0 of 97 (0.0%) | 0 | 0 |
| CTDLQData | 20260626 | 82 | 0 of 82 (0.0%) | 0 | 0 |
| EdFi | 5.2.0 | 1,904 | 1,190 of 1,904 (62.5%) | 1,106 | 283 |
| EduAPI | 1.0 | 341 | 226 of 341 (66.3%) | 184 | 131 |
| JEDx | 1.0.0 | 694 | 320 of 694 (46.1%) | 258 | 139 |
| LIF | 2.0 | 1,393 | 892 of 1,393 (64.0%) | 771 | 450 |
| MedBiquitous | unknown | 1,768 | 324 of 1,768 (18.3%) | 234 | 168 |
| OneRoster-Gradebook-1.2 | 1.2 | 138 | 48 of 138 (34.8%) | 44 | 10 |
| OneRoster-Resources-1.2 | 1.2 | 19 | 7 of 19 (36.8%) | 6 | 1 |
| OneRoster-Rostering-1.2 | 1.2 | 158 | 87 of 158 (55.1%) | 76 | 30 |
| OpenBadges | 3.0 | 201 | 91 of 201 (45.3%) | 79 | 53 |
| PESC-AcademicEportfolio-1.0.0 | 1.0.0 | 1,933 | 729 of 1,933 (37.7%) | 675 | 220 |
| PESC-CollegeTranscript-1.7.0 | 1.7.0 | 1,185 | 212 of 1,185 (17.9%) | 197 | 80 |
| PESC-CollegeTranscript-1.8.0 | 1.8.0 | 1,241 | 227 of 1,241 (18.3%) | 210 | 87 |
| PESC-DocumentRequest-1.0.0 | 1.0.0 | 1,282 | 98 of 1,282 (7.6%) | 84 | 48 |
| PESC-DocumentResponse-1.0.0 | 1.0.0 | 1,282 | 95 of 1,282 (7.4%) | 84 | 40 |
| PESC-HighSchoolTranscript-1.6.0 | 1.6.0 | 1,185 | 214 of 1,185 (18.1%) | 199 | 75 |
| PESC-LearningRecord-1.0.0 | 1.0.0 | 1,235 | 216 of 1,235 (17.5%) | 197 | 92 |
| PESC-TestScoreReport-1.1.0 | 1.1.0 | 1,181 | 292 of 1,181 (24.7%) | 272 | 109 |
| PESCLD | 0.0.2 | 266 | 141 of 266 (53.0%) | 120 | 31 |
| SEDM | unknown | 321 | 221 of 321 (68.8%) | 217 | 63 |
| SIF260928 | 4.3 | 5,018 | 3,177 of 5,018 (63.3%) | 2,722 | 1,137 |

Not counted for coverage: UseCase (useCaseCorpus, 191 nodes, no properties of its own). Loaded but not yet mapped: CTDLASN, CTDLQData.

## 4. Relation mix, mapping origin and confidence

### 4.1 Relation mix

| Relation | CEDS edges | CTDL edges | All edges | Meaning |
|:---|---:|---:|---:|:---|
| exact | 4,001 of 15,307 (26.1%) | 1,367 of 7,384 (18.5%) | 5,368 of 22,691 (23.7%) | the hub card means the same thing as the element |
| close | 6,530 of 15,307 (42.7%) | 2,811 of 7,384 (38.1%) | 9,341 of 22,691 (41.2%) | nearly the same, differing slightly in scope or detail |
| broad | 2,193 of 15,307 (14.3%) | 2,814 of 7,384 (38.1%) | 5,007 of 22,691 (22.1%) | the hub card is BROADER than the element |
| narrow | 2,583 of 15,307 (16.9%) | 392 of 7,384 (5.3%) | 2,975 of 22,691 (13.1%) | the hub card is NARROWER than the element |

Only exact and close mappings are offered as equivalents by the query tools, and an equivalence composed of two exact mappings is still labelled a composition of two judgments. Broad and narrow mappings say an element and a card are related, not that they are interchangeable. Per standard and hub, in edges:

| Standard | Hub | Edges | exact | close | broad | narrow |
|:---|:---|---:|---:|---:|---:|---:|
| CASE | CEDS | 95 | 18 (19%) | 66 (69%) | 2 (2%) | 9 (9%) |
| CASE | CTDL | 30 | 2 (7%) | 20 (67%) | 7 (23%) | 1 (3%) |
| CLR | CEDS | 79 | 12 (15%) | 46 (58%) | 8 (10%) | 13 (16%) |
| CLR | CTDL | 51 | 17 (33%) | 30 (59%) | 4 (8%) | 0 (0%) |
| EdFi | CEDS | 1,106 | 179 (16%) | 644 (58%) | 153 (14%) | 130 (12%) |
| EdFi | CTDL | 283 | 10 (4%) | 146 (52%) | 111 (39%) | 16 (6%) |
| EduAPI | CEDS | 184 | 12 (7%) | 111 (60%) | 30 (16%) | 31 (17%) |
| EduAPI | CTDL | 131 | 27 (21%) | 65 (50%) | 35 (27%) | 4 (3%) |
| JEDx | CEDS | 258 | 27 (10%) | 146 (57%) | 34 (13%) | 51 (20%) |
| JEDx | CTDL | 139 | 12 (9%) | 66 (47%) | 42 (30%) | 19 (14%) |
| LIF | CEDS | 771 | 272 (35%) | 353 (46%) | 28 (4%) | 118 (15%) |
| LIF | CTDL | 450 | 108 (24%) | 199 (44%) | 129 (29%) | 14 (3%) |
| MedBiquitous | CEDS | 234 | 46 (20%) | 129 (55%) | 16 (7%) | 43 (18%) |
| MedBiquitous | CTDL | 168 | 44 (26%) | 96 (57%) | 20 (12%) | 8 (5%) |
| OneRoster-Gradebook-1.2 | CEDS | 44 | 1 (2%) | 25 (57%) | 13 (30%) | 5 (11%) |
| OneRoster-Gradebook-1.2 | CTDL | 10 | 0 (0%) | 5 (50%) | 4 (40%) | 1 (10%) |
| OneRoster-Resources-1.2 | CEDS | 6 | 0 (0%) | 4 (67%) | 2 (33%) | 0 (0%) |
| OneRoster-Resources-1.2 | CTDL | 1 | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) |
| OneRoster-Rostering-1.2 | CEDS | 76 | 13 (17%) | 41 (54%) | 17 (22%) | 5 (7%) |
| OneRoster-Rostering-1.2 | CTDL | 30 | 3 (10%) | 18 (60%) | 8 (27%) | 1 (3%) |
| OpenBadges | CEDS | 79 | 14 (18%) | 44 (56%) | 10 (13%) | 11 (14%) |
| OpenBadges | CTDL | 53 | 16 (30%) | 29 (55%) | 8 (15%) | 0 (0%) |
| PESC-AcademicEportfolio-1.0.0 | CEDS | 3,290 | 826 (25%) | 1,617 (49%) | 441 (13%) | 406 (12%) |
| PESC-AcademicEportfolio-1.0.0 | CTDL | 1,659 | 354 (21%) | 783 (47%) | 431 (26%) | 91 (5%) |
| PESC-CollegeTranscript-1.7.0 | CEDS | 575 | 148 (26%) | 273 (47%) | 99 (17%) | 55 (10%) |
| PESC-CollegeTranscript-1.7.0 | CTDL | 301 | 44 (15%) | 136 (45%) | 96 (32%) | 25 (8%) |
| PESC-CollegeTranscript-1.8.0 | CEDS | 713 | 182 (26%) | 329 (46%) | 133 (19%) | 69 (10%) |
| PESC-CollegeTranscript-1.8.0 | CTDL | 351 | 44 (13%) | 159 (45%) | 116 (33%) | 32 (9%) |
| PESC-DocumentRequest-1.0.0 | CEDS | 327 | 85 (26%) | 127 (39%) | 72 (22%) | 43 (13%) |
| PESC-DocumentRequest-1.0.0 | CTDL | 211 | 44 (21%) | 129 (61%) | 15 (7%) | 23 (11%) |
| PESC-DocumentResponse-1.0.0 | CEDS | 243 | 55 (23%) | 101 (42%) | 51 (21%) | 36 (15%) |
| PESC-DocumentResponse-1.0.0 | CTDL | 150 | 36 (24%) | 81 (54%) | 20 (13%) | 13 (9%) |
| PESC-HighSchoolTranscript-1.6.0 | CEDS | 626 | 111 (18%) | 338 (54%) | 119 (19%) | 58 (9%) |
| PESC-HighSchoolTranscript-1.6.0 | CTDL | 280 | 54 (19%) | 102 (36%) | 105 (38%) | 19 (7%) |
| PESC-LearningRecord-1.0.0 | CEDS | 690 | 165 (24%) | 317 (46%) | 119 (17%) | 89 (13%) |
| PESC-LearningRecord-1.0.0 | CTDL | 354 | 50 (14%) | 169 (48%) | 91 (26%) | 44 (12%) |
| PESC-TestScoreReport-1.1.0 | CEDS | 720 | 173 (24%) | 354 (49%) | 116 (16%) | 77 (11%) |
| PESC-TestScoreReport-1.1.0 | CTDL | 349 | 46 (13%) | 173 (50%) | 109 (31%) | 21 (6%) |
| PESCLD | CEDS | 285 | 234 (82%) | 38 (13%) | 6 (2%) | 7 (2%) |
| PESCLD | CTDL | 37 | 21 (57%) | 9 (24%) | 4 (11%) | 3 (8%) |
| SEDM | CEDS | 217 | 217 (100%) | 0 (0%) | 0 (0%) | 0 (0%) |
| SEDM | CTDL | 63 | 6 (10%) | 25 (40%) | 25 (40%) | 7 (11%) |
| SIF260928 | CEDS | 4,689 | 1,211 (26%) | 1,427 (30%) | 724 (15%) | 1,327 (28%) |
| SIF260928 | CTDL | 2,283 | 429 (19%) | 370 (16%) | 1,434 (63%) | 50 (2%) |

### 4.2 Who made each mapping

| Origin | CEDS | CTDL | All | Meaning |
|:---|---:|---:|---:|:---|
| publisher-stated | 436 | 18 | 454 of 22,691 (2.0%) | the standard's own published document names the hub element (matchBasis declaredIdentity) |
| machine-proposed | 14,871 | 7,366 | 22,237 of 22,691 (98.0%) | an AI judge chose the hub card from ranked candidates (matchBasis derived) |
| human-reviewed | 0 | 0 | 0 | a person confirmed the mapping in the graph |

> No edge in the graph records a human review: the graph's vocabulary has no such mapping kind yet. Human judgments are kept apart, in the CEDS Rater's store, and are compared with the graph in the agreement section.

The recorded source of each edge (`mappingSource`), in edges:

| mappingSource | Edges |
|:---|---:|
| `bridge-jev` | 22,237 |
| `declared-pescldCedsDeclaredIdentity` | 219 |
| `declared-pescldCtdlDeclaredIdentity` | 18 |
| `declared-sedmCedsDeclaredIdentity` | 217 |

### 4.3 The judge's confidence

Publisher-stated edges carry no confidence (454 edges); the machine-proposed ones, by band:

| Band | CEDS | CTDL | All machine-proposed |
|:---|---:|---:|---:|
| strong (0.9) | 6,042 of 14,871 (40.6%) | 3,279 of 7,366 (44.5%) | 9,321 of 22,237 (41.9%) |
| moderate (0.7) | 5,044 of 14,871 (33.9%) | 2,711 of 7,366 (36.8%) | 7,755 of 22,237 (34.9%) |
| weak but real (0.5) | 3,785 of 14,871 (25.5%) | 1,376 of 7,366 (18.7%) | 5,161 of 22,237 (23.2%) |

Per standard and hub, machine-proposed edges by band:

| Standard | Hub | Machine edges | strong | moderate | weak but real |
|:---|:---|---:|---:|---:|---:|
| CASE | CEDS | 95 | 28 (29%) | 38 (40%) | 29 (31%) |
| CASE | CTDL | 30 | 5 (17%) | 13 (43%) | 12 (40%) |
| CLR | CEDS | 79 | 22 (28%) | 24 (30%) | 33 (42%) |
| CLR | CTDL | 51 | 14 (27%) | 15 (29%) | 22 (43%) |
| EdFi | CEDS | 1,106 | 494 (45%) | 374 (34%) | 238 (22%) |
| EdFi | CTDL | 283 | 84 (30%) | 117 (41%) | 82 (29%) |
| EduAPI | CEDS | 184 | 56 (30%) | 87 (47%) | 41 (22%) |
| EduAPI | CTDL | 131 | 42 (32%) | 53 (40%) | 36 (27%) |
| JEDx | CEDS | 258 | 69 (27%) | 109 (42%) | 80 (31%) |
| JEDx | CTDL | 139 | 47 (34%) | 51 (37%) | 41 (29%) |
| LIF | CEDS | 771 | 352 (46%) | 182 (24%) | 237 (31%) |
| LIF | CTDL | 450 | 166 (37%) | 173 (38%) | 111 (25%) |
| MedBiquitous | CEDS | 234 | 45 (19%) | 105 (45%) | 84 (36%) |
| MedBiquitous | CTDL | 168 | 49 (29%) | 73 (43%) | 46 (27%) |
| OneRoster-Gradebook-1.2 | CEDS | 44 | 9 (20%) | 13 (30%) | 22 (50%) |
| OneRoster-Gradebook-1.2 | CTDL | 10 | 2 (20%) | 5 (50%) | 3 (30%) |
| OneRoster-Resources-1.2 | CEDS | 6 | 2 (33%) | 4 (67%) | 0 (0%) |
| OneRoster-Resources-1.2 | CTDL | 1 | 0 (0%) | 1 (100%) | 0 (0%) |
| OneRoster-Rostering-1.2 | CEDS | 76 | 21 (28%) | 30 (39%) | 25 (33%) |
| OneRoster-Rostering-1.2 | CTDL | 30 | 14 (47%) | 12 (40%) | 4 (13%) |
| OpenBadges | CEDS | 79 | 20 (25%) | 30 (38%) | 29 (37%) |
| OpenBadges | CTDL | 53 | 14 (26%) | 15 (28%) | 24 (45%) |
| PESC-AcademicEportfolio-1.0.0 | CEDS | 3,290 | 1,583 (48%) | 997 (30%) | 710 (22%) |
| PESC-AcademicEportfolio-1.0.0 | CTDL | 1,659 | 931 (56%) | 556 (34%) | 172 (10%) |
| PESC-CollegeTranscript-1.7.0 | CEDS | 575 | 244 (42%) | 189 (33%) | 142 (25%) |
| PESC-CollegeTranscript-1.7.0 | CTDL | 301 | 151 (50%) | 107 (36%) | 43 (14%) |
| PESC-CollegeTranscript-1.8.0 | CEDS | 713 | 280 (39%) | 247 (35%) | 186 (26%) |
| PESC-CollegeTranscript-1.8.0 | CTDL | 351 | 168 (48%) | 133 (38%) | 50 (14%) |
| PESC-DocumentRequest-1.0.0 | CEDS | 327 | 166 (51%) | 107 (33%) | 54 (17%) |
| PESC-DocumentRequest-1.0.0 | CTDL | 211 | 128 (61%) | 73 (35%) | 10 (5%) |
| PESC-DocumentResponse-1.0.0 | CEDS | 243 | 124 (51%) | 70 (29%) | 49 (20%) |
| PESC-DocumentResponse-1.0.0 | CTDL | 150 | 93 (62%) | 44 (29%) | 13 (9%) |
| PESC-HighSchoolTranscript-1.6.0 | CEDS | 626 | 213 (34%) | 256 (41%) | 157 (25%) |
| PESC-HighSchoolTranscript-1.6.0 | CTDL | 280 | 122 (44%) | 100 (36%) | 58 (21%) |
| PESC-LearningRecord-1.0.0 | CEDS | 690 | 267 (39%) | 251 (36%) | 172 (25%) |
| PESC-LearningRecord-1.0.0 | CTDL | 354 | 175 (49%) | 125 (35%) | 54 (15%) |
| PESC-TestScoreReport-1.1.0 | CEDS | 720 | 290 (40%) | 268 (37%) | 162 (23%) |
| PESC-TestScoreReport-1.1.0 | CTDL | 349 | 165 (47%) | 126 (36%) | 58 (17%) |
| PESCLD | CEDS | 66 | 19 (29%) | 24 (36%) | 23 (35%) |
| PESCLD | CTDL | 19 | 6 (32%) | 7 (37%) | 6 (32%) |
| SEDM | CTDL | 63 | 29 (46%) | 28 (44%) | 6 (10%) |
| SIF260928 | CEDS | 4,689 | 1,738 (37%) | 1,639 (35%) | 1,312 (28%) |
| SIF260928 | CTDL | 2,283 | 874 (38%) | 884 (39%) | 525 (23%) |

## 5. Agreement with human judgment (CEDS hub)

> This is a first sample, and it is small. 103 answers from 3 raters, on 100 elements of three standards, compared with this graph's CEDS mappings. It is reported as a baseline for the method, not as the accuracy of the graph's 22,691 mappings; the interval beside each rate shows how far a sample this size can move.

### 5.1 What the raters were asked

The CEDS Rater shows a person one element of a standard, with its definition and context, beside up to 20 candidate CEDS cards found by meaning and by words; the rater can also search all of CEDS. The rater picks the **Best** card, may tick other cards as the **Same**, or answers **No match in CEDS** or **Unsure**. For an element the graph maps, the graph's own card was always among the candidates, unmarked: raters were not told which card the graph had chosen.

The sample is 150 elements, 50 each from Ed-Fi, PESC, SIF: per standard 40 elements the sampling build had mapped and 10 it had not, each part stratified by kind of element (identifier, code, date, number, indicator, free text). It was drawn from `GOLD_EVAL_261013_jevQuestionPerBridge` with seed `cedsRater-humanTruthSet-101426-r2` and dealt into surveys A, B, C. This graph maps 120 of the 150 sample elements; the sampling build mapped 120, and 120 are mapped in both. Of the 81 answered elements this graph maps, 0 had a card of this graph's missing from the rater's list.

### 5.2 What exists so far

- 103 current answers (174 saves in all, counting edits), saved between 2026-10-20 and 2026-10-29.
- 3 raters answered; 2 finished a whole survey. 6 rater accounts exist.
- Surveys answered: A and B. The remaining survey has not been answered yet.
- 103 answers counted, on 100 elements; 2 were Unsure and are not scored, leaving **101 scored answers**.

### 5.3 How the graph and the raters compare

| Outcome | Answers | What it means |
|:---|---:|:---|
| same card | 47 | the rater's Best card is the graph's card |
| same CEDS property, other class | 1 | the same CEDS property and qualifiers, placed in a different CEDS class |
| different card | 17 | both chose a card, and they are different CEDS properties |
| graph maps, rater says no match | 17 | the rater found nothing in CEDS that fits; the graph maps the element anyway |
| both say no match | 13 | the graph maps nothing, and the rater found nothing that fits |
| graph maps nothing, rater chose a card | 6 | a possible gap in the graph |
| unsure (not scored) | 2 | the rater could not decide |

| Agreement | Scored answers | 95% interval |
|:---|---:|:---|
| same card, or both say no match | 60 of 101 (59.4%) | 50% to 68% |
| same CEDS property (class aside), or both say no match | 61 of 101 (60.4%) | 51% to 69% |

Seen from the graph's side: where the graph maps the element (82 scored answers), the rater chose the graph's card in 47 of 82 (57.3%) and accepted it as Best or Same in 53 of 82 (64.6%). Where the graph maps nothing (19 scored answers), the rater agreed nothing fits in 13 of 19 (68.4%).

### 5.4 Agreement follows the judge's confidence

The judge's confidence band, read from the graph's edge for each answered element (its strongest edge, where it has several), against the raters' answers. Agreement is the same card; on the last row, where the graph maps nothing, it is the rater also finding nothing that fits. The bands rank the way they should; the samples behind each are small.

| Graph's confidence | Scored answers | Agreement | 95% interval |
|:---|---:|---:|:---|
| weak but real | 16 | 3 of 16 (18.8%) | 7% to 43% |
| moderate | 26 | 15 of 26 (57.7%) | 39% to 74% |
| strong | 40 | 29 of 40 (72.5%) | 57% to 84% |
| graph maps nothing | 19 | 13 of 19 (68.4%) | 46% to 85% |

### 5.5 By standard

| Standard (sample) | Scored answers | Same card or both no match | 95% interval | Same property or both no match |
|:---|---:|---:|:---|---:|
| Ed-Fi | 35 | 17 of 35 (48.6%) | 33% to 64% | 17 of 35 (48.6%) |
| PESC | 34 | 21 of 34 (61.8%) | 45% to 76% | 21 of 34 (61.8%) |
| SIF | 32 | 22 of 32 (68.8%) | 51% to 82% | 23 of 32 (71.9%) |

The sample is split in two: a dev half that may be looked at while the judge is tuned, and a sealed half that is scored only for reports such as this one, never for tuning. Agreement (same card, or both say no match): dev half 33 of 49 (67.3%) (interval 53% to 79%); sealed half 27 of 52 (51.9%) (interval 39% to 65%).

### 5.6 Rater with rater

3 elements have answers from two raters; they chose the same Best card on 2. That is too few to say how often people agree with each other, which bounds how well any judge can be expected to agree with one person. It will be measured once each survey has a second rater.

## 6. Automatic consistency signals

These need no human and are recomputed on every build. None of them is accuracy: each says whether the judge is consistent with itself or with what the standards publish.

### 6.1 One element, many places

A SIF Question or a PESC element declaration appears in many places (SIF objects, PESC document sections), and the judge was asked about each place on its own. Where two or more places are mapped onto one hub, did every place get the same card? The same hub property? A different class in a different place can be right, since the class follows the context, so the property column is the fairer one.

| Standard | Hub | Elements in 2+ mapped places | Same card everywhere | Same property everywhere |
|:---|:---|---:|---:|---:|
| PESC-AcademicEportfolio-1.0.0 | CEDS | 300 | 274 of 300 (91.3%) | 284 of 300 (94.7%) |
| PESC-AcademicEportfolio-1.0.0 | CTDL | 119 | 116 of 119 (97.5%) | 117 of 119 (98.3%) |
| PESC-CollegeTranscript-1.7.0 | CEDS | 129 | 127 of 129 (98.4%) | 128 of 129 (99.2%) |
| PESC-CollegeTranscript-1.7.0 | CTDL | 69 | 69 of 69 (100.0%) | 69 of 69 (100.0%) |
| PESC-CollegeTranscript-1.8.0 | CEDS | 138 | 136 of 138 (98.6%) | 137 of 138 (99.3%) |
| PESC-CollegeTranscript-1.8.0 | CTDL | 75 | 75 of 75 (100.0%) | 75 of 75 (100.0%) |
| PESC-DocumentRequest-1.0.0 | CEDS | 66 | 60 of 66 (90.9%) | 62 of 66 (93.9%) |
| PESC-DocumentRequest-1.0.0 | CTDL | 37 | 36 of 37 (97.3%) | 37 of 37 (100.0%) |
| PESC-DocumentResponse-1.0.0 | CEDS | 67 | 63 of 67 (94.0%) | 64 of 67 (95.5%) |
| PESC-DocumentResponse-1.0.0 | CTDL | 31 | 31 of 31 (100.0%) | 31 of 31 (100.0%) |
| PESC-HighSchoolTranscript-1.6.0 | CEDS | 131 | 126 of 131 (96.2%) | 128 of 131 (97.7%) |
| PESC-HighSchoolTranscript-1.6.0 | CTDL | 66 | 65 of 66 (98.5%) | 66 of 66 (100.0%) |
| PESC-LearningRecord-1.0.0 | CEDS | 116 | 112 of 116 (96.6%) | 114 of 116 (98.3%) |
| PESC-LearningRecord-1.0.0 | CTDL | 50 | 50 of 50 (100.0%) | 50 of 50 (100.0%) |
| PESC-TestScoreReport-1.1.0 | CEDS | 155 | 150 of 155 (96.8%) | 152 of 155 (98.1%) |
| PESC-TestScoreReport-1.1.0 | CTDL | 76 | 76 of 76 (100.0%) | 76 of 76 (100.0%) |
| SIF260928 | CEDS | 271 | 241 of 271 (88.9%) | 244 of 271 (90.0%) |
| SIF260928 | CTDL | 141 | 141 of 141 (100.0%) | 141 of 141 (100.0%) |

All together: the same property everywhere for 1,975 of 2,037 (97.0%) elements, the same card for 1,948 of 2,037 (95.6%).

### 6.2 How decided the judge was

For each machine-proposed edge the judge recorded the probability it gave its chosen card. Edges by that probability, and the "close calls", where the runner-up card was within 0.1 of the winner:

| Top probability | CEDS | CTDL |
|:---|---:|---:|
| 0.0–0.1 | 0 | 0 |
| 0.1–0.2 | 3 | 0 |
| 0.2–0.3 | 282 | 67 |
| 0.3–0.4 | 1,277 | 289 |
| 0.4–0.5 | 1,962 | 923 |
| 0.5–0.6 | 2,502 | 1,044 |
| 0.6–0.7 | 1,371 | 861 |
| 0.7–0.8 | 1,387 | 899 |
| 0.8–0.9 | 1,747 | 1,250 |
| 0.9–1.0 | 4,340 | 2,033 |
| close calls | 1,862 of 14,871 (12.5%) | 986 of 7,366 (13.4%) |

### 6.3 Triangulation across the hubs: not yet measurable

Where an element maps to a card on one hub and a card on the other, the hubs' own published correspondences could confirm or contradict the pair. This build cannot check that yet:

- CEDS publishes 0 correspondences to CTDL; 0 of them sit under a card any element is mapped to, so 0 pairs can be checked.
- CTDL publishes 53 correspondences to CEDS; 0 of them sit under a card any element is mapped to, so 0 pairs can be checked.

(CTDL's published correspondences to CEDS are between code values, and this build's judge maps at the property level.) Meanwhile 4,900 mapped places (edge owners) reach a card on both hubs: the population a property-level crosswalk between the hubs would let us check.

## 7. Earlier measurements (not of this graph)

3 earlier experiments checked the judge against a reference: a publisher's own crosswalk, or another AI reading its picks. They measured earlier builds, earlier judge configurations or mappings not in this graph, and are cited for their method, not as this graph's accuracy.

| When | What was measured | Result | Build | Source |
|:---|:---|:---|:---|:---|
| 2026-08-03 | Ed-Fi to CEDS, property tier: the AI judge, run blind, against Ed-Fi's own published CEDS crosswalk, on the 65 sampled Ed-Fi elements that crosswalk maps | the judge chose Ed-Fi's mapped CEDS property for 47 of the 65 (72.3%) | blind-evaluation build DEV_edfiBlindEvalV2_080326 (an earlier hub and judge configuration) | `educoreForge/system/management/zNotesPlansDocs/REPORT-blindEvalVsProduction-080326.md` |
| 2026-08-17 | Ed-Fi to CEDS, every element: the AI judge's mappings against Ed-Fi's published crosswalk (666 authored mappings) | 421 agreed; precision 80.96% (of the judge's 520 mappings), recall 63.2% (of the crosswalk's 666) | DEV_edfiDerived_260817 against GOLD_EVAL_260817_edfiBridge (an earlier build) | `educore/system/management/zNotesPlansDocs/continuityArchive-preCollapse-103126.json (topFindings.recallNeverMeasured)` |
| 2026-11-03 | A peer bridge pilot, Ed-Fi to LIF directly (no hub): the judge's 49 picks from 300 Ed-Fi subjects, each ruled by a separate AI agent working blind, NOT by people (the pilot's report says so) | 19 of 49 picks ruled same or close (2 same, 17 close), 10 of 10 at confidence 0.8 and above; the supervisor's stand-down, removing rulings that rest on an undefined LIF element, puts it at 13 of 49 and 7 of 10 | peer bridge pilot run; peer mappings are not part of this graph | `educoreForge/system/management/zNotesPlansDocs/peerBridgePilot-110326/REPORT-peerBridgePilot-110326.md and STANDDOWN-RAFFISH_TRINKET-110326.md` |

## 8. Method and limits

- **Coverage** counts DmeProperty nodes of non-hub standards; a property is mapped when it, or one of its instances, has an edge into a hub card (the rule `standards_stats` uses). It says a mapping exists, not that it is right.
- **Relation, origin and confidence** count match edges, read from each edge's `mappingKind`, `mappingSource` and `mappingConfidence`. Confidence is the judge's self-assessment.
- **Agreement with human judgment** compares each rater's current answer (edits replace earlier ones) with the CEDS cards this graph maps the element to, by the CEDS Rater's own rules for "the graph's card" and "the same property". An answer counts only while its rater is still assigned to the element's survey. The rate is over scored answers (Unsure excluded); the interval is a 95% Wilson interval.
- **The human sample is not the population.** It is stratified (80% elements the sampling build had mapped, 20% it had not, by kind), covers three standards and one hub, and is not re-weighted to the graph. Its rates describe these answers, and they are not extrapolated to the graph as a whole.
- **One rater per element**, almost everywhere. Where a rater and the graph disagree, either may be wrong; the rater's answer is treated as the reference only because it is the human one.
- **The raters judged cards, not relations.** Whether a mapping is exact, close, broad or narrow is not yet checked by people.
- **Consistency signals** say the judge agrees with itself; a judge can be consistently wrong.
- **Reproducible.** The generator reads only what the stamp names. Rerun it on the same graph and the same rater snapshot and it writes the same files.

## 9. Not yet measured, and what would measure it

| Not yet measured | What would measure it |
|:---|:---|
| Accuracy of the graph's mappings as a whole | a human gold set large enough, and drawn widely enough, to weight to the population: the remaining survey, more raters, more standards |
| How often people agree with each other | a second rater on every element of a survey |
| Agreement on the CTDL hub | a rater survey of CTDL cards, as the CEDS Rater does for CEDS |
| The other loaded standards | samples from CASE, CLR, JEDx, LIF, MedBiquitous, OneRoster, Open Badges, EduAPI and the rest |
| Whether the relation (exact, close, broad, narrow) is right | a relation question in the rater tool |
| Recall: mappings the graph is missing | rerunning the earlier Ed-Fi crosswalk comparison against this graph, and the "graph maps nothing, rater chose a card" count as the human sample grows |
| Run-to-run variance of the judge | re-judging a fixed sample with the judgment cache bypassed; the cache returns the same verdict for the same prompt, so a rebuild alone does not measure it |
| Triangulation across the hubs | a property-level crosswalk between CEDS and CTDL, or judging at the code-value level where CTDL publishes its CEDS correspondences |
| Accuracy of AI answers grounded in EDUcore | the evaluation harness: real questions with expert-verified answers, asked with and without EDUcore |

## Appendix: the breakdowns add up to the public tools' figures

Every per-standard breakdown in this report was summed and compared with the answer of the handler behind `standards_stats` or `standards_standards` on the same graph: 62 of 62 checks equal (the generator refuses to write a report when any is not). The overall ones:

| Figure | Public tool | Sum of breakdown |
|:---|---:|---:|
| `coverage.totalProperties` | 23,331 | 23,331 |
| `coverage.mappedProperties` | 8,999 | 8,999 |
| `coverage.mappedPropertyCountByHub.CEDS` | 7,909 | 7,909 |
| `coverage.mappedPropertyCountByHub.CTDL` | 3,328 | 3,328 |
| `mappings.EXACT_MATCH` | 5,368 | 5,368 |
| `mappings.CLOSE_MATCH` | 9,341 | 9,341 |
| `mappings.BROAD_MATCH` | 5,007 | 5,007 |
| `mappings.NARROW_MATCH` | 2,975 | 2,975 |

Each loaded standard has its own one-page certificate drawn from the same figures, in `certificates/` beside this report.
