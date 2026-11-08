# Quality certificate: PESC-CollegeTranscript-1.8.0 (version 1.8.0)

How PESC-CollegeTranscript-1.8.0 is represented and mapped in one EDUcore build, measured from the graph itself. 8,997 nodes of this standard are loaded.

## Coverage

| Measure | Figure |
|:---|---:|
| Properties in this standard | 1,241 |
| Mapped to at least one hub | 227 of 1,241 (18.3%) |
| Mapped to CEDS | 210 of 1,241 (16.9%) |
| Mapped to CTDL | 87 of 1,241 (7.0%) |

## How it is mapped

Mappings (match edges), by hub and relation. A property that appears in many places carries one edge per place.

| Hub | Edges | exact | close | broad | narrow |
|:---|---:|---:|---:|---:|---:|
| CEDS | 713 | 182 (26%) | 329 (46%) | 133 (19%) | 69 (10%) |
| CTDL | 351 | 44 (13%) | 159 (45%) | 116 (33%) | 32 (9%) |

Who made them, and the judge's confidence in the machine-proposed ones:

| Hub | Publisher-stated | Machine-proposed | Human-reviewed | strong | moderate | weak but real |
|:---|---:|---:|---:|---:|---:|---:|
| CEDS | 0 | 713 | 0 | 280 (39%) | 247 (35%) | 186 (26%) |
| CTDL | 0 | 351 | 0 | 168 (48%) | 133 (38%) | 50 (14%) |

## Consistency

| Hub | Elements mapped in 2+ places | Same hub property everywhere |
|:---|---:|---:|
| CEDS | 138 | 137 of 138 (99.3%) |
| CTDL | 75 | 75 of 75 (100.0%) |

## Agreement with human judgment

From the first CEDS Rater sample, CEDS hub only, pooled across the 7 PESC schemas the sample was drawn from (PESC-CollegeTranscript-1.8.0, PESC-HighSchoolTranscript-1.6.0, PESC-TestScoreReport-1.1.0, PESC-LearningRecord-1.0.0, PESC-AcademicEportfolio-1.0.0, PESC-DocumentRequest-1.0.0, PESC-DocumentResponse-1.0.0): the rater and the graph chose the same card, or both said nothing fits, in **21 of 34 (61.8%)** scored answers (95% interval 45% to 76%). The same CEDS property, class aside: 21 of 34 (61.8%).

> A small first sample: a baseline for the method, not a measured accuracy for this standard's mappings.

## Measured on

- **Graph:** `GOLD_261106_useCases`
- **Manifest:** educore-2026-10-30 (`783aef401faf…`)
- **Graph built:** 2026-11-06T21:23:29.132Z
- **Graph contract:** `f65db22ad184…`
- **Human judgments:** CEDS Rater store snapshot `raterTool-20261108-031501.sqlite3` (sha256 `7d5cbc07545f…`)
- **Generator:** `cli/lib.d/quality-report` at `ebeb6dbfe6`

Every figure is defined, with its limits, in the full EDUcore mapping-quality report for this build (`qualityReport.md`).
