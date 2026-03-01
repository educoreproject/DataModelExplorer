# kg-namer Build Report — Stage 2 Namer Tools

## Build Date
2026-03-01

## Tools Implemented (7 total)

### Tool 2.1: `-connectionAnalysis`
- **Path:** `lib/connection-analysis/connection-analysis.js`
- **Purpose:** Analyze a Connection class to determine bridge endpoints, property character (temporal/status/substantive/reference), hub paths, and name parsing (verb hints, entity hints, domain prefix).
- **Queries:** 3 Neo4j queries (bridge endpoints, property categorization, hub path via shortestPath)
- **Notable:** Includes built-in verb hint dictionary (12 entries) and property categorization via label pattern matching.

### Tool 2.2: `-nameSuggest`
- **Path:** `lib/name-suggest/name-suggest.js`
- **Purpose:** Propose UPPER_SNAKE_CASE relationship name, direction (from->to), property distribution (included/optional/excluded), and alternatives for a Connection class.
- **Modes:** Single class or batch (`--all-connections` with `--classification` artifact)
- **Notable:** Runs connectionAnalysis internally, classifies properties into included (temporal+status), optional (substantive), excluded (reference/FK).

### Tool 2.3: `-nameExport`
- **Path:** `lib/name-export/name-export.js`
- **Purpose:** Validate and write a naming artifact JSON to disk. Validates structure, UPPER_SNAKE_CASE format, cross-references against CEDS and optionally against Stage 1 classification.
- **Input:** Naming artifact JSON via stdin.
- **Notable:** Supports `--validate-only` mode.

### Tool 2.4: `-nameImport`
- **Path:** `lib/name-import/name-import.js`
- **Purpose:** Read and validate a naming artifact from disk. Used by Stage 3/4 to load Stage 2 output.
- **Notable:** Supports `--summary-only` mode.

### Tool 2.5: `-schemaUpload`
- **Path:** `lib/schema-upload/schema-upload.js`
- **Purpose:** Ingest a user's existing data dictionary (JSON, CSV, or plain text) and produce a vocabulary mapping. Calculates match potential against CEDS.
- **Notable:** Auto-detects format from extension/content. Heuristic parsing supports flexible input formats.

### Tool 2.6: `-thingNameSuggest`
- **Path:** `lib/thing-name-suggest/thing-name-suggest.js`
- **Purpose:** Propose local node type names for Thing classes. Strips domain prefixes, matches against uploaded vocabulary, and provides synonym-based alternatives.
- **Modes:** Single class or batch (`--all-things`)
- **Notable:** Built-in synonym dictionary covers common CEDS entity mappings (Person->Student, Organization->School, etc.)

### Tool 2.7: `-detailNameSuggest`
- **Path:** `lib/detail-name-suggest/detail-name-suggest.js`
- **Purpose:** Propose property group names for Detail classes. Identifies parent Thing via graph traversal, derives grouping name from dictionary or name parsing.
- **Modes:** Single class or batch (`--all-details`)
- **Notable:** Built-in group name dictionary maps common suffixes (Birth->Demographics, Address->ContactInfo, Calendar->Schedule, etc.)

## Files Created (23 total)

```
kg-namer/
  kg-namer.js                                          # Group dispatcher
  package.json                                         # Module metadata
  BUILD_REPORT.md                                      # This file
  lib/
    connection-analysis/
      connection-analysis.js                           # Tool 2.1
      lib/
        help-string.js
        tool-selector.js
    name-suggest/
      name-suggest.js                                  # Tool 2.2
      lib/
        help-string.js
        tool-selector.js
    name-export/
      name-export.js                                   # Tool 2.3
      lib/
        help-string.js
        tool-selector.js
    name-import/
      name-import.js                                   # Tool 2.4
      lib/
        help-string.js
        tool-selector.js
    schema-upload/
      schema-upload.js                                 # Tool 2.5
      lib/
        help-string.js
        tool-selector.js
    thing-name-suggest/
      thing-name-suggest.js                            # Tool 2.6
      lib/
        help-string.js
        tool-selector.js
    detail-name-suggest/
      detail-name-suggest.js                           # Tool 2.7
      lib/
        help-string.js
        tool-selector.js
```

## Architecture Decisions

1. **Exact pattern match:** All tools follow the curried moduleFunction pattern from ontology-navigation tools (lookup.js, explore.js). Each tool handles help mode, tool-selector mode, multiCall namespace resolution, and registers with the dispatch map.

2. **Format support:** All tools use `formatOutput`/`resolveFormat` from output-formatter.js. Each provides a `formatText` function for human-readable output; JSON/table/markdown come from the shared formatter.

3. **Shared utilities:** All tools use `ceds-utils.js` (formatLabel, regexEscape) and `common-queries.js` (resolveClass, buildPattern) where applicable. Relative path from tool to shared lib is `../../../../lib/`.

4. **Session management:** All Neo4j sessions created with `cedsNeo4jDriver.session()` and closed in `finally` blocks.

5. **Verb hint dictionary:** Shared between connectionAnalysis and nameSuggest. The dictionary maps 12 CEDS noun forms to UPPER_SNAKE_CASE relationship verbs (Enrollment->ENROLLED_IN, Employment->EMPLOYED_BY, etc.)

6. **Property categorization:** Temporal and status patterns use regex label matching as specified. Reference detection uses the `isClassRef` flag from range type checking.

7. **Batch modes:** nameSuggest, thingNameSuggest, and detailNameSuggest all support batch processing via `--all-connections`/`--all-things`/`--all-details` flags reading from a Stage 1 classification artifact.

## Smoke Test

```
ceds2 -listTools
```
Successfully shows all 7 kg-namer tools registered alongside existing tool groups (ontology-navigation, kg-classifier, kg-surfacer, kg-materializer).
