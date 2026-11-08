# Quality certificate: EdFi (version 5.2.0)

How EdFi is represented and mapped in one EDUcore build, measured from the graph itself. 9,617 nodes of this standard are loaded.

## Coverage

| Measure | Figure |
|:---|---:|
| Properties in this standard | 1,904 |
| Mapped to at least one hub | 1,190 of 1,904 (62.5%) |
| Mapped to CEDS | 1,106 of 1,904 (58.1%) |
| Mapped to CTDL | 283 of 1,904 (14.9%) |

## How it is mapped

Mappings (match edges), by hub and relation. A property that appears in many places carries one edge per place.

| Hub | Edges | exact | close | broad | narrow |
|:---|---:|---:|---:|---:|---:|
| CEDS | 1,106 | 179 (16%) | 644 (58%) | 153 (14%) | 130 (12%) |
| CTDL | 283 | 10 (4%) | 146 (52%) | 111 (39%) | 16 (6%) |

Who made them, and the judge's confidence in the machine-proposed ones:

| Hub | Publisher-stated | Machine-proposed | Human-reviewed | strong | moderate | weak but real |
|:---|---:|---:|---:|---:|---:|---:|
| CEDS | 0 | 1,106 | 0 | 494 (45%) | 374 (34%) | 238 (22%) |
| CTDL | 0 | 283 | 0 | 84 (30%) | 117 (41%) | 82 (29%) |

## Agreement with human judgment

From the first CEDS Rater sample, CEDS hub only: the rater and the graph chose the same card, or both said nothing fits, in **17 of 35 (48.6%)** scored answers (95% interval 33% to 64%). The same CEDS property, class aside: 17 of 35 (48.6%).

> A small first sample: a baseline for the method, not a measured accuracy for this standard's mappings.

## Measured on

- **Graph:** `GOLD_261106_useCases`
- **Manifest:** educore-2026-10-30 (`783aef401faf…`)
- **Graph built:** 2026-11-06T21:23:29.132Z
- **Graph contract:** `f65db22ad184…`
- **Human judgments:** CEDS Rater store snapshot `raterTool-20261108-031501.sqlite3` (sha256 `7d5cbc07545f…`)
- **Generator:** `cli/lib.d/quality-report` at `fc81b82f49`

Every figure is defined, with its limits, in the full EDUcore mapping-quality report for this build (`qualityReport.md`).
