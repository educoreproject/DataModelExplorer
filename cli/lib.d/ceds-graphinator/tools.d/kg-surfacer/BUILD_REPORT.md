# kg-surfacer Build Report

## Files Created (17 total)

### Tool Group Container
- `kg-surfacer.js` -- dispatches to all 5 tool modules
- `package.json` -- module metadata

### Tool 3.1: kgView
- `lib/kg-view/kg-view.js` -- main tool implementation
- `lib/kg-view/lib/help-string.js` -- help text and listing
- `lib/kg-view/lib/tool-selector.js` -- AI tool selection metadata

### Tool 3.2: kgScope
- `lib/kg-scope/kg-scope.js` -- main tool implementation
- `lib/kg-scope/lib/help-string.js` -- help text and listing
- `lib/kg-scope/lib/tool-selector.js` -- AI tool selection metadata

### Tool 3.3: kgCollapse
- `lib/kg-collapse/kg-collapse.js` -- main tool implementation
- `lib/kg-collapse/lib/help-string.js` -- help text and listing
- `lib/kg-collapse/lib/tool-selector.js` -- AI tool selection metadata

### Tool 3.4: kgPaths
- `lib/kg-paths/kg-paths.js` -- main tool implementation
- `lib/kg-paths/lib/help-string.js` -- help text and listing
- `lib/kg-paths/lib/tool-selector.js` -- AI tool selection metadata

### Tool 3.5: surfaceExport
- `lib/surface-export/surface-export.js` -- main tool implementation
- `lib/surface-export/lib/help-string.js` -- help text and listing
- `lib/surface-export/lib/tool-selector.js` -- AI tool selection metadata

## Architecture Decisions

1. **Artifact-driven approach**: kgView, kgPaths, and surfaceExport are primarily artifact-driven (reading Stage 1/2 JSON files) with optional Neo4j enrichment. This matches the spec's guidance that surfacer tools work from upstream artifacts rather than re-querying the ontology for everything.

2. **kgScope is Neo4j-driven**: It queries the ontology directly to count classes by domain prefix, since domain detection needs the actual class inventory. Optionally enriched with classification artifact counts.

3. **kgCollapse uses both**: Reads artifacts for classification/naming context, then queries Neo4j for the actual connection structure (properties, incoming/outgoing edges) to build the before/after preview.

4. **kgPaths uses BFS**: Builds an in-memory adjacency map from naming artifact entries, then BFS to enumerate all paths up to --depth. No Neo4j needed since the naming artifact already captures the surfaced relationship graph.

5. **surfaceExport enriches with Neo4j**: The core spec assembly is artifact-driven, but when cedsNeo4jDriver is available, it enriches nodeTypes with actual property details from Neo4j.

6. **Output format**: All tools use `formatOutput` / `resolveFormat` from output-formatter.js with custom `formatText` functions for human-readable output.

7. **multiCall namespace resolution**: All tools handle the `switches.multiCall` pattern for command chaining compatibility.

8. **Scope filtering**: kgPaths and surfaceExport both accept --scope for domain filtering. kgView does not (it works on the full artifact set and lets the user explore freely).

## Smoke Test

`ceds2 -listTools` shows all 5 new tools registered under the `kg-surfacer` category. Help system works for all tools.
