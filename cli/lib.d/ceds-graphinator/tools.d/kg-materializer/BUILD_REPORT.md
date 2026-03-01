# Build Report: kg-materializer (Stage 4)

## Files Created

### Tool Group Container
- `kg-materializer.js` — loads all 5 tools, follows ontology-navigation.js pattern exactly
- `package.json` — module metadata

### Tool 4.1: materializeJsonLd
- `lib/materialize-json-ld/materialize-json-ld.js` — JSON-LD context/schema/full generation
- `lib/materialize-json-ld/lib/help-string.js`
- `lib/materialize-json-ld/lib/tool-selector.js`

### Tool 4.2: materializeCypher
- `lib/materialize-cypher/materialize-cypher.js` — Cypher statement generation (schema/template/demo)
- `lib/materialize-cypher/lib/help-string.js`
- `lib/materialize-cypher/lib/tool-selector.js`

### Tool 4.3: materializeSchema
- `lib/materialize-schema/materialize-schema.js` — Schema definition in JSON/markdown/GraphQL
- `lib/materialize-schema/lib/help-string.js`
- `lib/materialize-schema/lib/tool-selector.js`

### Tool 4.4: materializeDiagram
- `lib/materialize-diagram/materialize-diagram.js` — Mermaid/Cytoscape/DOT diagram generation
- `lib/materialize-diagram/lib/help-string.js`
- `lib/materialize-diagram/lib/tool-selector.js`

### Tool 4.5: materializeValidate
- `lib/materialize-validate/materialize-validate.js` — Validates artifacts against live CEDS graph
- `lib/materialize-validate/lib/help-string.js`
- `lib/materialize-validate/lib/tool-selector.js`

## Total: 17 files

## Architecture Decisions

1. **Neo4j is optional for 4 of 5 tools.** materializeJsonLd, materializeCypher, materializeSchema, and materializeDiagram are primarily artifact-driven (reading the surfacing view spec). When Neo4j is available, they enrich data (property datatypes, enum values). materializeValidate requires Neo4j since its purpose is to cross-check against the live ontology.

2. **Output files written to disk.** Each materializer writes its output (JSON-LD, Cypher, schema, diagram) to the filesystem and returns a metadata result object describing what was generated. This follows the spec's two-level pattern: the tool's return value is about the generation process; the actual artifact is the written file.

3. **Consistent error handling.** All tools validate parameters first, then attempt file I/O. Errors are returned as structured result objects through formatOutput, never thrown.

4. **multiCall namespace resolution.** Every tool checks `process.global.commandLineParameters.switches?.multiCall` and resolves its own namespace, matching the lookup.js pattern exactly.

5. **Session management.** Neo4j sessions are created per-invocation and closed in `finally` blocks, matching the lookup.js pattern.

## Issues Encountered

None. All patterns from ontology-navigation were cleanly replicable.
