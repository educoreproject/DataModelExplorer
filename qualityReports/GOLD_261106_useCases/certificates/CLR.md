# Quality certificate: CLR (version 2.0)

How CLR is represented and mapped in one EDUcore build, measured from the graph itself. 717 nodes of this standard are loaded.

## Coverage

| Measure | Figure |
|:---|---:|
| Properties in this standard | 206 |
| Mapped to at least one hub | 91 of 206 (44.2%) |
| Mapped to CEDS | 79 of 206 (38.3%) |
| Mapped to CTDL | 51 of 206 (24.8%) |

## How it is mapped

Mappings (match edges), by hub and relation. A property that appears in many places carries one edge per place.

| Hub | Edges | exact | close | broad | narrow |
|:---|---:|---:|---:|---:|---:|
| CEDS | 79 | 12 (15%) | 46 (58%) | 8 (10%) | 13 (16%) |
| CTDL | 51 | 17 (33%) | 30 (59%) | 4 (8%) | 0 (0%) |

Who made them, and the judge's confidence in the machine-proposed ones:

| Hub | Publisher-stated | Machine-proposed | Human-reviewed | strong | moderate | weak but real |
|:---|---:|---:|---:|---:|---:|---:|
| CEDS | 0 | 79 | 0 | 22 (28%) | 24 (30%) | 33 (42%) |
| CTDL | 0 | 51 | 0 | 14 (27%) | 15 (29%) | 22 (43%) |

## Agreement with human judgment

Not yet measured: no human rater sample covers this standard yet. A rater survey drawn from it would measure it.

## Measured on

- **Graph:** `GOLD_261106_useCases`
- **Manifest:** educore-2026-10-30 (`783aef401faf…`)
- **Graph built:** 2026-11-06T21:23:29.132Z
- **Graph contract:** `f65db22ad184…`
- **Human judgments:** CEDS Rater store snapshot `raterTool-20261108-031501.sqlite3` (sha256 `7d5cbc07545f…`)
- **Generator:** `cli/lib.d/quality-report` at `fc81b82f49`

Every figure is defined, with its limits, in the full EDUcore mapping-quality report for this build (`qualityReport.md`).
