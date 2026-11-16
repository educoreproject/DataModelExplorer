# Quality certificate: PESC-AcademicEportfolio-1.0.0 (version 1.0.0)

How PESC-AcademicEportfolio-1.0.0 is represented and mapped in one EDUcore build, measured from the graph itself. 16,885 nodes of this standard are loaded.

## Coverage

| Measure | Figure |
|:---|---:|
| Properties in this standard | 1,933 |
| Mapped to at least one hub | 729 of 1,933 (37.7%) |
| Mapped to CEDS | 675 of 1,933 (34.9%) |
| Mapped to CTDL | 220 of 1,933 (11.4%) |

## How it is mapped

Mappings (match edges), by hub and relation. A property that appears in many places carries one edge per place.

| Hub | Edges | exact | close | broad | narrow |
|:---|---:|---:|---:|---:|---:|
| CEDS | 3,290 | 826 (25%) | 1,617 (49%) | 441 (13%) | 406 (12%) |
| CTDL | 1,659 | 354 (21%) | 783 (47%) | 431 (26%) | 91 (5%) |

Who made them, and the judge's confidence in the machine-proposed ones:

| Hub | Publisher-stated | Machine-proposed | Human-reviewed | strong | moderate | weak but real |
|:---|---:|---:|---:|---:|---:|---:|
| CEDS | 0 | 3,290 | 0 | 1,583 (48%) | 997 (30%) | 710 (22%) |
| CTDL | 0 | 1,659 | 0 | 931 (56%) | 556 (34%) | 172 (10%) |

## Consistency

| Hub | Elements mapped in 2+ places | Same hub property everywhere |
|:---|---:|---:|
| CEDS | 300 | 284 of 300 (94.7%) |
| CTDL | 119 | 117 of 119 (98.3%) |

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
