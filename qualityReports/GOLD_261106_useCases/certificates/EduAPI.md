# Quality certificate: EduAPI (version 1.0)

How EduAPI is represented and mapped in one EDUcore build, measured from the graph itself. 1,056 nodes of this standard are loaded.

## Coverage

| Measure | Figure |
|:---|---:|
| Properties in this standard | 341 |
| Mapped to at least one hub | 226 of 341 (66.3%) |
| Mapped to CEDS | 184 of 341 (54.0%) |
| Mapped to CTDL | 131 of 341 (38.4%) |

## How it is mapped

Mappings (match edges), by hub and relation. A property that appears in many places carries one edge per place.

| Hub | Edges | exact | close | broad | narrow |
|:---|---:|---:|---:|---:|---:|
| CEDS | 184 | 12 (7%) | 111 (60%) | 30 (16%) | 31 (17%) |
| CTDL | 131 | 27 (21%) | 65 (50%) | 35 (27%) | 4 (3%) |

Who made them, and the judge's confidence in the machine-proposed ones:

| Hub | Publisher-stated | Machine-proposed | Human-reviewed | strong | moderate | weak but real |
|:---|---:|---:|---:|---:|---:|---:|
| CEDS | 0 | 184 | 0 | 56 (30%) | 87 (47%) | 41 (22%) |
| CTDL | 0 | 131 | 0 | 42 (32%) | 53 (40%) | 36 (27%) |

## Agreement with human judgment

Not yet measured: no human rater sample covers this standard yet. A rater survey drawn from it would measure it.

## Measured on

- **Graph:** `GOLD_261106_useCases`
- **Manifest:** educore-2026-10-30 (`783aef401faf…`)
- **Graph built:** 2026-11-06T21:23:29.132Z
- **Graph contract:** `f65db22ad184…`
- **Human judgments:** CEDS Rater store snapshot `raterTool-20261108-031501.sqlite3` (sha256 `7d5cbc07545f…`)
- **Generator:** `cli/lib.d/quality-report` at `a0dc4985ba`

Every figure is defined, with its limits, in the full EDUcore mapping-quality report for this build (`qualityReport.md`).
