# Graph Enrichment Framework Specification

**Author:** TQ White II / Milo
**Date:** 2026-03-12
**Status:** Draft
**Project:** askMilo (qbookSuperTool)

---

## Problem

RAG and structured graph databases ingest raw data that often contains implicit structure stored as strings — dates in arbitrary formats, product names buried in free text, boolean values as "Yes"/"No"/"Y"/"N", monetary amounts as "$45,000". The AI can see this when querying but cannot perform native operations (date ranges, numeric comparisons, relationship traversals) on string-encoded data.

Currently there is no mechanism to improve a graph after ingestion. Each re-ingestion overwrites the graph with the same raw data, losing any manual corrections.

## Solution

A **Graph Enrichment Framework** that:

1. Lets an AI (via Graphinator/askMilo) examine data and author enrichment rules
2. Stores enrichment rules **in the graph itself** as `:EnrichmentRule` nodes
3. Applies rules automatically on re-ingestion (post-load step)
4. Supports export/import so rules travel with the database tarball to other deployments

## Core Concepts

### EnrichmentRule Node

An enrichment rule is a graph node that describes a transformation:

```
(:EnrichmentRule {
  ruleId: <uuid>,
  name: "callLogDates",
  description: "Convert M/D/YYYY date strings to native Neo4j datetime",
  operationType: "property" | "node_creation" | "relationship" | "composite",
  mode: "cypher" | "ai-assisted",
  targetLabel: "HimedCallLog",
  cypherApply: "<Cypher statement that performs the enrichment>",
  cypherVerify: "<optional Cypher that checks if enrichment was applied>",
  aiPrompt: "<prompt template for ai-assisted mode, null for cypher mode>",
  priority: 10,
  createdBy: "graphinator",
  createdAt: <datetime>,
  lastApplied: <datetime>,
  lastAppliedCount: <integer>,
  enabled: true
})
```

### Operation Types

| Type | What It Does | Example |
|------|-------------|---------|
| `property` | Add or convert a property on existing nodes | String date → native datetime |
| `node_creation` | Create new nodes extracted from existing data | Product nodes from call summary text |
| `relationship` | Create relationships between existing nodes | Link call logs to extracted products |
| `composite` | Ordered sequence of the above | Create product nodes AND link them |

### Execution Modes

**`cypher` mode** — The `cypherApply` field contains a complete Cypher statement that runs directly. Fast, deterministic, idempotent. Used for:
- Date format conversion
- Boolean normalization
- Numeric extraction from simple patterns
- Relationship creation based on existing properties

**`ai-assisted` mode** — For each matching node, the enrichment engine sends the specified text property to an AI call using the `aiPrompt` template, then writes the result. Used for:
- Product name extraction from free text
- Categorization/tagging
- Entity recognition
- Any extraction that requires language understanding

AI-assisted enrichments are idempotent — they skip nodes that already have the target property or relationship. They are expensive and should include a `cypherVerify` query that checks which nodes still need processing.

### Composite Rules

A composite enrichment contains an ordered list of sub-operations stored as a JSON array in `cypherApply`:

```json
[
  {"step": 1, "cypher": "CREATE nodes..."},
  {"step": 2, "cypher": "CREATE relationships..."}
]
```

Steps execute in order. If any step fails, the composite stops and reports which step failed.

## The `-enrich` Tool

New action on each indexer (e.g., `indexHimedCallReportForMilo -enrich`), backed by a shared library module.

### Actions

| Flag | Purpose |
|------|---------|
| `-enrich --write` | Store a new enrichment rule in the graph |
| `-enrich --apply` | Execute all enabled rules for this database |
| `-enrich --apply --rule=<name>` | Execute a single named rule |
| `-enrich --list` | List all enrichment rules in the database |
| `-enrich --show --rule=<name>` | Show full details of a named rule |
| `-enrich --disable --rule=<name>` | Disable a rule (keeps it, skips on apply) |
| `-enrich --enable --rule=<name>` | Re-enable a disabled rule |
| `-enrich --delete --rule=<name>` | Remove a rule from the graph |
| `-enrich --export` | Export all rules as JSON to stdout or file |
| `-enrich --import --file=<path>` | Import rules from JSON into the graph |

### `--write` Input

Accepts a JSON object via stdin (consistent with bb2/indexer patterns):

```json
{
  "name": "callLogDates",
  "description": "Convert M/D/YYYY date strings to native Neo4j datetime",
  "operationType": "property",
  "mode": "cypher",
  "targetLabel": "HimedCallLog",
  "cypherApply": "MATCH (n:HimedCallLog) WHERE n.dateEntry IS NOT NULL AND n.dateEntryDt IS NULL SET n.dateEntryDt = datetime(apoc.date.parse(n.dateEntry, 'ms', 'M/d/yyyy  hh:mm:ss a'))",
  "priority": 10
}
```

### `--apply` Execution Order

1. Query all `:EnrichmentRule` nodes where `enabled = true`
2. Sort by `priority` (lower numbers first)
3. For each rule:
   a. If `mode = "cypher"`: execute `cypherApply` directly
   b. If `mode = "ai-assisted"`: run `cypherVerify` to find unprocessed nodes, then iterate with AI calls
   c. Update `lastApplied` and `lastAppliedCount` on the rule node
4. Report summary: rules applied, nodes affected, errors

### `--apply` Idempotency

All enrichments must be idempotent. Guidelines:

- **Property enrichments:** Use `WHERE n.targetProp IS NULL` to skip already-enriched nodes
- **Node creation:** Use `MERGE` to avoid duplicates
- **Relationship creation:** Use `MERGE` to avoid duplicates
- **AI-assisted:** `cypherVerify` returns only nodes lacking the target property/relationship

## The Enrichment Prompt

A new prompt in the `[prompts]` section of `askMilo.ini` — `enrichmentAnalyst`:

```
You are a graph database enrichment specialist. You have access to tools
that query a Neo4j graph database. Your job is to help the user improve
their graph by identifying implicit structure in the data and creating
enrichment rules to make that structure explicit and queryable.

Your workflow:
1. EXAMINE: Sample the data. Look at property values, identify patterns,
   understand what's stored as strings that should be native types.
2. DIAGNOSE: Report what you found. Show examples of the problematic data.
3. PROPOSE: Suggest specific enrichment rules. Show the Cypher that would
   run. Explain what it does and what properties/nodes/relationships it
   creates.
4. AUTHOR: When the user approves, use the enrich_write tool to store the
   rule in the graph.
5. APPLY: Use the enrich_apply tool to execute the rule.
6. VERIFY: Query the enriched data to confirm it worked.

For date conversions: sample multiple values to detect all format variants.
For entity extraction: sample text fields and identify recurring patterns
before proposing node creation.

Always make rules idempotent. Always use MERGE for node/relationship creation.
Always include a WHERE clause that skips already-enriched nodes.
```

This prompt is selected in the Graphinator UI like any other prompt. The user switches to it when they want to do enrichment work.

## Export / Import (Portability)

### Export Format

`-enrich --export` produces a JSON array of all enrichment rules:

```json
{
  "exportedAt": "2026-03-12T10:00:00Z",
  "providerName": "HimedCallReportGraph",
  "rules": [
    {
      "ruleId": "...",
      "name": "callLogDates",
      "description": "...",
      "operationType": "property",
      "mode": "cypher",
      "targetLabel": "HimedCallLog",
      "cypherApply": "...",
      "cypherVerify": "...",
      "priority": 10,
      "enabled": true
    }
  ]
}
```

### Export Destination

The export file goes into the provider's `assets/` directory as `enrichments.json`. This means it:

- Gets included in the tarball when `neo4j-data.tar.gz` is created
- Travels with the database to any deployment (educore, qbook, etc.)
- Is available for `--import` on the receiving end

### Import on Deployment

When `-start` initializes from a tarball, or when `-enrich --import` is called explicitly:

1. Read `enrichments.json` from assets
2. For each rule: `MERGE` into the graph by `ruleId` (idempotent)
3. Rules that already exist are updated; new rules are created

### Tarball Integration

The tarball creation process (which currently snapshots `neo4j-data/`) should also:

1. Auto-run `-enrich --export` before creating the tarball
2. Place the export in `assets/enrichments.json`

This ensures the enrichment rules always travel with the data. If someone applies enrichments on dev, those rules are baked into the tarball that goes to production.

However, the enrichment rules also live *inside* the Neo4j data (as `:EnrichmentRule` nodes), so the tarball already contains them in the graph. The `enrichments.json` export serves as:

- A human-readable audit trail
- A fallback for re-import if the graph is rebuilt from raw data without enrichment
- Documentation of what enrichments exist

## Integration with Existing Indexers

### Automatic Application

Each indexer's data-loading action (e.g., `-loadCallLogs`, `-loadOntology`, `-loadText`) should call `-enrich --apply` as a final step. This ensures enrichments are reapplied after every re-ingestion.

### Shared Enrichment Library

The enrichment engine lives as a shared module:

```
cli/lib.d/graph-enrichment/
  enrichmentEngine.js   — core logic (write, apply, list, export, import)
  package.json
```

Each indexer requires it:

```javascript
const { enrichmentEngine } = require('../graph-enrichment/enrichmentEngine');
```

### Tool Registration in provider.json

Each provider that supports enrichment adds enrichment tools to its `provider.json`:

```json
{
  "name": "himed_enrich_write",
  "description": "Store a new enrichment rule in the HiMed graph...",
  "cli": { "command": "node indexHimedCallReportForMilo.js -enrich --write" }
},
{
  "name": "himed_enrich_apply",
  "description": "Apply all enrichment rules to the HiMed graph...",
  "cli": { "command": "node indexHimedCallReportForMilo.js -enrich --apply" }
}
```

This makes the enrichment tools available to the AI when the enrichment prompt is active.

## HiMed Test Case

### Enrichment 1: Date Conversion (cypher mode)

- **Source:** `HimedCallLog.dateEntry` = `"5/6/2009  12:00:00 AM"`
- **Target:** `HimedCallLog.dateEntryDt` = native `datetime`
- **Mode:** cypher
- **Cypher:** Parse using APOC date functions, write as native datetime
- **Same for:** `dateMod` → `dateModDt`

### Enrichment 2: Product Extraction (ai-assisted mode)

- **Source:** `HimedCallLog.callSummary` free text
- **Target:** New `:HimedProduct` nodes + `:DISCUSSES_PRODUCT` relationships
- **Mode:** ai-assisted
- **AI Prompt:** "Given this call summary, list any HiMed products mentioned (HA coating, MCD abrasive, TCP, PEEK coating, etc.)"
- **Cypher:** MERGE product nodes, MERGE relationships

### After Enrichment

Update `himed_raw_cypher` tool description to mention new queryable properties:

```
"HimedCallLog now also has: dateEntryDt (datetime), dateModDt (datetime).
Use these for date range queries: WHERE cl.dateEntryDt >= datetime('2025-12-01')"
```

## Implementation Order

1. **Shared library:** `graph-enrichment/enrichmentEngine.js` with write/apply/list/export/import
2. **HiMed integration:** Add `-enrich` action to `indexHimedCallReportForMilo`
3. **First enrichment (repair):** Date conversion on existing HiMed database
4. **Enrichment prompt:** Add `enrichmentAnalyst` prompt to askMilo.ini
5. **Provider.json tools:** Register enrich_write/apply tools for HiMed
6. **Export/import:** Tarball integration
7. **Second enrichment (test AI-assisted):** Product extraction on HiMed
8. **Generalize:** Add enrichment support to other indexers

## Design Decisions (Resolved)

1. **Provider.json auto-update:** YES. After enrichment adds new properties, nodes, or relationships, the enrichment engine automatically updates the relevant tool descriptions in `provider.json`. This keeps the AI's knowledge of the schema current without manual intervention.

2. **APOC dependency:** Non-issue. All Neo4j containers in the askMilo ecosystem are created by the tooling. APOC is always available.

3. **AI-assisted cost control:** No limits. No budget caps. Run all nodes every time. If this becomes a financial problem, add limits then — not before.

4. **Enrichment tools as askMilo-visible tools:** YES. The enrichment tools (`enrich_write`, `enrich_apply`, `enrich_list`, `enrich_export`) must be registered in each provider's `provider.json` so the AI can call them directly from the enrichment prompt. This is the entire point — the AI examines data with the existing raw_cypher tool, then authors and applies enrichments using the enrichment tools, all within a single Graphinator session. Without tool registration, the enrichment prompt has no hands.
