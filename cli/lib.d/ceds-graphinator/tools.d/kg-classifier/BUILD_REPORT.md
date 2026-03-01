# kg-classifier Build Report

## Files Created

```
kg-classifier/
  kg-classifier.js                              Tool group dispatcher
  package.json                                  Module metadata
  BUILD_REPORT.md                               This file
  lib/
    classify-data/
      classify-data.js                          Core metrics computation tool
      lib/
        help-string.js                          Help text for classifyData
        tool-selector.js                        Tool selector metadata for classifyData
    classify-export/
      classify-export.js                        Classification artifact export tool
      lib/
        help-string.js                          Help text for classifyExport
        tool-selector.js                        Tool selector metadata for classifyExport
    classify-import/
      classify-import.js                        Classification artifact import/validate tool
      lib/
        help-string.js                          Help text for classifyImport
        tool-selector.js                        Tool selector metadata for classifyImport
```

Total: 12 files (including package.json and this report)

## Decisions Made

1. **Hub connectivity query strategy:** Rather than using a single expensive path query, the implementation runs one query per hub (Person, Membership, Organization) checking 1-hop and 2-hop reachability via domainIncludes/rangeIncludes chains. Each hub is queried independently and counts are accumulated. Hub classes themselves are marked as reachable from themselves.

2. **Neo4j integer handling:** All Neo4j integer results use a safe conversion pattern that checks for Neo4j Integer objects (which have a `.toNumber()` method) and falls back to `Number()` for plain values.

3. **classifyExport stdin data:** The tool expects `args.stdinData` to be populated by the chassis with any stdin content. The spec says the classification artifact is piped via stdin. If the chassis does not currently populate `stdinData`, this will need a small chassis enhancement.

4. **Validation approach:** Both classifyExport and classifyImport perform structural validation (schema conformance) and, when Neo4j is available, class-name validation against the actual CEDS ontology. Validation errors are blocking for export; warnings (missing classes, low confidence without explanation) are non-blocking.

5. **formatOutput integration:** All three tools use `resolveFormat` and `formatOutput` from output-formatter.js. Each provides a `formatText` function for human-readable output. JSON output uses the standard envelope pattern.

## Smoke Test Results

`ceds2 -listTools` shows all three tools registered correctly:
- `kg-classifier: ceds2 -classifyData`
- `kg-classifier: ceds2 -classifyExport`
- `kg-classifier: ceds2 -classifyImport`

Help system works for all three tools (`-classifyData -help`, etc.).

## Known Issues / Future Work

- The hub connectivity query for classifyData is potentially expensive on large ontologies. The spec notes this and suggests pre-computing BFS reachability. The current implementation uses EXISTS subqueries which should be reasonably efficient on Neo4j 5.x.
- classifyExport depends on `args.stdinData` being populated by the chassis. If the chassis does not yet pass stdin data through to tool working functions, that will need to be wired up.
- Full integration testing against the live CEDS Neo4j database has not been performed (requires running Neo4j instance).
