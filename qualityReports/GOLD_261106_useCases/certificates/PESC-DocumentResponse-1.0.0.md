# Quality certificate: PESC-DocumentResponse-1.0.0 (version 1.0.0)

How PESC-DocumentResponse-1.0.0 is represented and mapped in one EDUcore build, measured from the graph itself. 8,057 nodes of this standard are loaded.

## Coverage

| Measure | Figure |
|:---|---:|
| Properties in this standard | 1,282 |
| Mapped to at least one hub | 95 of 1,282 (7.4%) |
| Mapped to CEDS | 84 of 1,282 (6.6%) |
| Mapped to CTDL | 40 of 1,282 (3.1%) |

## How it is mapped

Mappings (match edges), by hub and relation. A property that appears in many places carries one edge per place.

| Hub | Edges | exact | close | broad | narrow |
|:---|---:|---:|---:|---:|---:|
| CEDS | 243 | 55 (23%) | 101 (42%) | 51 (21%) | 36 (15%) |
| CTDL | 150 | 36 (24%) | 81 (54%) | 20 (13%) | 13 (9%) |

Who made them, and the judge's confidence in the machine-proposed ones:

| Hub | Publisher-stated | Machine-proposed | Human-reviewed | strong | moderate | weak but real |
|:---|---:|---:|---:|---:|---:|---:|
| CEDS | 0 | 243 | 0 | 124 (51%) | 70 (29%) | 49 (20%) |
| CTDL | 0 | 150 | 0 | 93 (62%) | 44 (29%) | 13 (9%) |

## Consistency

| Hub | Elements mapped in 2+ places | Same hub property everywhere |
|:---|---:|---:|
| CEDS | 67 | 64 of 67 (95.5%) |
| CTDL | 31 | 31 of 31 (100.0%) |

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
