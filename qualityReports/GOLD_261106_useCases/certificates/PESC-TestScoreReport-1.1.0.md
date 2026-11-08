# Quality certificate: PESC-TestScoreReport-1.1.0 (version 1.1.0)

How PESC-TestScoreReport-1.1.0 is represented and mapped in one EDUcore build, measured from the graph itself. 8,898 nodes of this standard are loaded.

## Coverage

| Measure | Figure |
|:---|---:|
| Properties in this standard | 1,181 |
| Mapped to at least one hub | 292 of 1,181 (24.7%) |
| Mapped to CEDS | 272 of 1,181 (23.0%) |
| Mapped to CTDL | 109 of 1,181 (9.2%) |

## How it is mapped

Mappings (match edges), by hub and relation. A property that appears in many places carries one edge per place.

| Hub | Edges | exact | close | broad | narrow |
|:---|---:|---:|---:|---:|---:|
| CEDS | 720 | 173 (24%) | 354 (49%) | 116 (16%) | 77 (11%) |
| CTDL | 349 | 46 (13%) | 173 (50%) | 109 (31%) | 21 (6%) |

Who made them, and the judge's confidence in the machine-proposed ones:

| Hub | Publisher-stated | Machine-proposed | Human-reviewed | strong | moderate | weak but real |
|:---|---:|---:|---:|---:|---:|---:|
| CEDS | 0 | 720 | 0 | 290 (40%) | 268 (37%) | 162 (23%) |
| CTDL | 0 | 349 | 0 | 165 (47%) | 126 (36%) | 58 (17%) |

## Consistency

| Hub | Elements mapped in 2+ places | Same hub property everywhere |
|:---|---:|---:|
| CEDS | 155 | 152 of 155 (98.1%) |
| CTDL | 76 | 76 of 76 (100.0%) |

## Agreement with human judgment

From the first CEDS Rater sample, CEDS hub only, pooled across the 7 PESC schemas the sample was drawn from (PESC-CollegeTranscript-1.8.0, PESC-HighSchoolTranscript-1.6.0, PESC-TestScoreReport-1.1.0, PESC-LearningRecord-1.0.0, PESC-AcademicEportfolio-1.0.0, PESC-DocumentRequest-1.0.0, PESC-DocumentResponse-1.0.0): the rater and the graph chose the same card, or both said nothing fits, in **21 of 34 (61.8%)** scored answers (95% interval 45% to 76%). The same CEDS property, class aside: 21 of 34 (61.8%).

> A small first sample: a baseline for the method, not a measured accuracy for this standard's mappings.

## Measured on

- **Graph:** `GOLD_261106_useCases`
- **Manifest:** educore-2026-10-30 (`783aef401faf…`)
- **Graph built:** 2026-11-06T21:23:29.132Z
- **Graph contract:** `f65db22ad184…`
- **Human judgments:** CEDS Rater store snapshot `raterTool-20261108-031501.sqlite3` (sha256 `7d5cbc07545f…`)
- **Generator:** `cli/lib.d/quality-report` at `01c3f790c2`

Every figure is defined, with its limits, in the full EDUcore mapping-quality report for this build (`qualityReport.md`).
