# Quality certificate: PESC-LearningRecord-1.0.0 (version 1.0.0)

How PESC-LearningRecord-1.0.0 is represented and mapped in one EDUcore build, measured from the graph itself. 8,829 nodes of this standard are loaded.

## Coverage

| Measure | Figure |
|:---|---:|
| Properties in this standard | 1,235 |
| Mapped to at least one hub | 216 of 1,235 (17.5%) |
| Mapped to CEDS | 197 of 1,235 (16.0%) |
| Mapped to CTDL | 92 of 1,235 (7.4%) |

## How it is mapped

Mappings (match edges), by hub and relation. A property that appears in many places carries one edge per place.

| Hub | Edges | exact | close | broad | narrow |
|:---|---:|---:|---:|---:|---:|
| CEDS | 690 | 165 (24%) | 317 (46%) | 119 (17%) | 89 (13%) |
| CTDL | 354 | 50 (14%) | 169 (48%) | 91 (26%) | 44 (12%) |

Who made them, and the judge's confidence in the machine-proposed ones:

| Hub | Publisher-stated | Machine-proposed | Human-reviewed | strong | moderate | weak but real |
|:---|---:|---:|---:|---:|---:|---:|
| CEDS | 0 | 690 | 0 | 267 (39%) | 251 (36%) | 172 (25%) |
| CTDL | 0 | 354 | 0 | 175 (49%) | 125 (35%) | 54 (15%) |

## Consistency

| Hub | Elements mapped in 2+ places | Same hub property everywhere |
|:---|---:|---:|
| CEDS | 116 | 114 of 116 (98.3%) |
| CTDL | 50 | 50 of 50 (100.0%) |

## Agreement with human judgment

From the first CEDS Rater sample, CEDS hub only, pooled across the 7 PESC schemas the sample was drawn from (PESC-CollegeTranscript-1.8.0, PESC-HighSchoolTranscript-1.6.0, PESC-TestScoreReport-1.1.0, PESC-LearningRecord-1.0.0, PESC-AcademicEportfolio-1.0.0, PESC-DocumentRequest-1.0.0, PESC-DocumentResponse-1.0.0): the rater and the graph chose the same card, or both said nothing fits, in **21 of 34 (61.8%)** scored answers (95% interval 45% to 76%). The same CEDS property, class aside: 21 of 34 (61.8%).

> A small first sample: a baseline for the method, not a measured accuracy for this standard's mappings.

## Measured on

- **Graph:** `GOLD_261106_useCases`
- **Manifest:** educore-2026-10-30 (`783aef401faf…`)
- **Graph built:** 2026-11-06T21:23:29.132Z
- **Graph contract:** `f65db22ad184…`
- **Human judgments:** CEDS Rater store snapshot `raterTool-20261108-031501.sqlite3` (sha256 `7d5cbc07545f…`)
- **Generator:** `cli/lib.d/quality-report` at `a0dc4985ba`

Every figure is defined, with its limits, in the full EDUcore mapping-quality report for this build (`qualityReport.md`).
