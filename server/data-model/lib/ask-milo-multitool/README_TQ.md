# askMilo Tool System — Owner's Guide

*How the tool provider system works, what to hand Milo, and what to expect back.*

---

## What This System Does

askMilo can search external databases and datasets at query time. You give it data, it builds a searchable graph, and then anyone using askMilo (CLI, qbookInternal, qbook.work, educore) can ask questions against that data using natural language.

The system that makes this possible has two layers:

1. **Indexers** — one-time tools that parse raw data, load it into a Neo4j graph, create search indexes, and (optionally) generate vector embeddings
2. **Providers** — lightweight query tools that askMilo calls at runtime to search the graph and return results

---

## The Moving Parts

### On your Mac (development)

```
qbookSuperTool/system/
  code/cli/lib.d/
    index-{name}-for-milo/          # Indexer — parses data, loads graph, manages container
    {name}/                          # Provider — search script + provider.json (what askMilo calls)
  configs/instanceSpecific/qbook/
    askMilo.ini                      # Tool registration (aiToolsLib.enabled list)
    {name}Search.ini                 # Neo4j connection + API keys for the search script
  dataStores/instanceSpecific/
    index-{name}-for-milo/
      neo4j-{Name}/                  # Docker volumes (the actual data)
      index-{name}-for-milo.ini      # Container ports + password
```

### On the server (production)

Same structure under `/home/educore/system/` or `/home/qbookSuperTool/system/`, but configs land flat in `configs/` (not `configs/instanceSpecific/`).

### Docker

Each dataset gets its own Neo4j container. Containers persist across reboots (`--restart unless-stopped`). Data lives in bind-mounted volumes, so it survives container recreation.

Check what's running: `docker ps --filter "name=rag_"`

---

## What Exists Today

| Tool | Data | Container | Records | Search Type |
|------|------|-----------|---------|-------------|
| CEDS Ontology v14 | Education data standards | rag_CedsOntology14 | ~3,800 elements | Hybrid BM25 + vector |
| SIF Spec Graph | School data interchange spec | rag_SifSpecGraph | 159 objects + 427 relationships | Cypher traversal |
| Career Story Graph | TQ's career narrative | rag_CareerStoryGraph | ~200 chunks | Vector search |
| SIF Search | SIF specification text | (SQLite, no container) | ~500 chunks | Vector search |
| HiMed Call Reports | CRM call log history | rag_HimedCallReportGraph | 26,500+ interactions | Hybrid BM25 + vector |

---

## How to Add a New Dataset

### What to give Milo

1. **The raw data file** — CSV, TSV, JSON, database export, whatever format the client gave you
2. **A description of what's in it** — "This is 5 years of customer support tickets" or "This is a product catalog with categories and specifications"
3. **Point Milo to the HOWTO docs:**
   ```
   /Users/tqwhite/tq_usr_bin/qbookSuperTool/system/code/cli/lib.d/ask-milo-multitool/
   ```

### What to say

The prompt that worked for HiMed (and should work for future datasets):

> "I have [description of data] from [client]. Read the HOWTO docs at [path above], analyze the data, and build a graph tool for askMilo. Put the indexer and provider in qbookSuperTool's lib.d/ directory."

If you want to be more specific:

> "Read README_HOWTO-addCustomGraphTool.md and use the HiMed implementation as a reference. The data is at [path]. Build it as a custom graph tool with hybrid search."

### What Milo should produce

1. **An indexer** at `lib.d/index-{name}-for-milo/` with:
   - Parser (reads your raw data format)
   - Loader (creates Neo4j nodes + relationships)
   - Indexer (BM25 full-text index)
   - Embedder (vector embeddings, if the data has free-text fields)
   - Container manager (Docker lifecycle)

2. **A provider** at `lib.d/{name}/` with:
   - Search script with multiple query handlers
   - provider.json with tool definitions
   - package.json

3. **Config files** in `instanceSpecific/qbook/`

4. **Updated askMilo.ini** with the new provider path

### What to verify

```bash
# Is the container running?
docker ps --filter "name=rag_YourName"

# Does the search script work?
cd /path/to/provider && node yourSearch.js -stats

# Does askMilo see it?
askMilo -getDefaults | python3 -c "import sys,json; print([t for t in json.load(sys.stdin)['availableTools'] if 'your' in t.lower()])"
```

---

## Three Flavors of Tool

| Type | Guide | Example |
|------|-------|---------|
| **SQLite RAG** | `README_HOWTO-addSqliteRagTool.md` | Career Story |
| **Neo4j RAG** | `README_HOWTO-addGraphRagTool.md` | CEDS Ontology |
| **Custom Graph** | `README_HOWTO-addCustomGraphTool.md` | HiMed CRM |

### Which one do I need?

The choice isn't about what format the source data is in — it's about **what kind of questions you want to answer**.

**"Search the text"** → RAG (SQLite or Neo4j)
- "What does the documentation say about X?"
- "Find mentions of Y across these reports"
- "Summarize what these documents cover"

Use this when you have documents, reports, notes, or narrative text and you want semantic search across them. The RAG pipeline chunks the text, embeds it, and lets the LLM search by meaning. No custom code needed — `indexTextForMilo` or `indexTextGraphForMilo` handles everything end to end.

**"Query the entities and relationships"** → Custom Graph
- "Show me all interactions with Customer X"
- "Which salesperson logged the most calls last year?"
- "What products has this customer discussed?"
- "Find customers who mentioned 3D printing"

Use this when the data contains **entities** (customers, contacts, products, tickets) with **relationships** between them, and you want to ask structural questions — not just "find text about X" but "trace the history of X's relationship with Y." This requires a custom parser to extract entities and a graph model to represent them.

**The same source data can go either way.** HiMed's 96MB CRM export was a single text file. We *could* have chunked it and done RAG — that would have answered "find call logs mentioning spinal implants." But by extracting customers, contacts, salespersons, and call logs as graph entities, we got queries like "show me DeGen Medical's complete history" and "which customers have the most interactions" — questions that RAG can't answer because they require traversing relationships, not searching text.

**Rule of thumb:** If the client would ask questions that start with "show me all..." or "who/which/how many...", you want Custom Graph. If they'd ask "what does it say about..." or "summarize the...", RAG is sufficient. Many datasets benefit from both — Custom Graph with hybrid BM25 + vector search gives you structural queries AND semantic text search in one tool.

---

## Enriching an Existing Graph

Once a graph tool is running, you can add new relationships, new node types, or new query tools without rebuilding from scratch. The container and existing data stay put.

### Adding inferred relationships to existing data

If you see patterns in the data that would be useful as explicit graph edges — "these customers share a contact," "this contact moved companies," "these call logs form a sales sequence" — you can create them with Cypher:

```cypher
-- Example: connect customers who share contacts (business network)
MATCH (c1:HimedCustomer)<-[:WORKS_AT]-(contact:HimedContact)-[:WORKS_AT]->(c2:HimedCustomer)
WHERE c1 <> c2
MERGE (c1)-[:SHARES_CONTACT {via: contact.fullName}]->(c2)
```

Run it once against the live container via `himed_raw_cypher` or a direct script, then add it to `neo4jLoader.js` so it runs on future reloads. Update the `rawCypher` tool description in `provider.json` to document the new relationship so the LLM knows about it.

### Adding new data from additional sources

If the client gives you a second export (products, invoices, survey responses), write a new parser and a new loader action in the indexer (e.g., `-loadProducts`). Same container, same graph — new nodes and relationships woven into the existing data. Then add new query handlers to the search script and new tool definitions to provider.json.

### What to tell Milo

> "The HiMed graph at rag_HimedCallReportGraph needs enrichment. Read the custom graph HOWTO and the existing indexer at [path]. Add [describe the new relationships or data]. Don't rebuild — enrich what's there."

---

## Keeping Data Fresh (Incremental Ingest)

Client data isn't static. CRM exports arrive daily, new records accumulate, corrections get made. The system handles this without rebuilding from scratch.

### How it works

The loader uses `MERGE` on natural keys (customer IDs, call log IDs from the source system). Re-ingesting a full export updates existing records and adds new ones — no duplicates. The embedder only processes nodes without embeddings (`WHERE embedding IS NULL`), so it's naturally incremental. The BM25 full-text index auto-updates as Neo4j writes nodes.

### The commands

```bash
# Periodic refresh — parse, load (MERGE dedup), embed new nodes only
node indexYourToolForMilo.js -ingest --dataPath=/path/to/latest-export.txt

# Just add embeddings to nodes that don't have them (after manual data changes)
node indexYourToolForMilo.js -embed

# Full pipeline (first-time only) — includes BM25 index creation
node indexYourToolForMilo.js -loadCallLog --dataPath=/path/to/export.txt
```

### The workflow for a client like HiMed

1. Lenny drops a new CRM export (full or incremental — either works)
2. You run `-ingest --dataPath=/path/to/new-export.txt`
3. New call logs appear in the graph with embeddings
4. Updated records get refreshed properties (embeddings preserved)
5. Existing data is untouched

This could be automated with a cron job or file watcher for production deployments.

### Future: web-based upload

A planned feature will add a file upload UI to the askMilo web tool, allowing clients to upload new data exports directly through the browser. The upload endpoint would receive the file, call the indexer's `-ingest` action, and report results back to the UI. This removes the need for you to be in the loop for routine data refreshes.

### What to tell Milo

> "There's a new data export for [tool name] at [path]. Run the indexer's -ingest action to load it incrementally."

---

## Deploying to the Server

### For educore.tqwhite.com:

1. Create symlinks in educore's `lib.d/` pointing to your provider (and indexer if it has container management)
2. Create `yourSearch.ini` in `educore/.../instanceSpecific/educore.tqwhite.com/`
3. Add the server-path provider entry to educore's `askMilo.ini`
4. `deployPrograms educore --actions=configs,code,restart`
5. SSH in, verify the container starts, check the search .ini has correct credentials

### For qbook.work:

Same deployment as qbookSuperTool. Tools registered locally in `qbookSuperTool/.../qbook/askMilo.ini` are available on qbook.work after deploying qbookSuperTool.

### The gotcha

**Server configs are flat.** Your `instanceSpecific/educore.tqwhite.com/yourSearch.ini` lands as `configs/yourSearch.ini` on the server. The hostname check in the search script handles this automatically — but if you're debugging on the server, look in `configs/`, not `configs/instanceSpecific/`.

---

## The Sales Pitch

When showing this to a client:

1. **Run the tool creation** while they watch (or describe it) — "We took your data export and in [time] built a searchable AI tool"
2. **Ask demo questions** through askMilo that show off the data — customer histories, trend analysis, cross-references they didn't know existed
3. **Generate reports** — askMilo output → markdown → PDF via `/md-to-pdf`
4. **Show the web UI** — qbook.work or educore, with their tool as a checkbox they can enable

The HiMed 3D printing analysis is a good template for what a demo report looks like.

---

## The HOWTO Docs

All four live in the same directory:

```
ask-milo-multitool/
  README_HOWTO-addToolToAskMilo.md        # Universal contract — provider.json, .ini, registration, deployment topology
  README_HOWTO-addSqliteRagTool.md        # SQLite + sqlite-vec vector search
  README_HOWTO-addGraphRagTool.md         # Neo4j vector-only RAG (chunked documents)
  README_HOWTO-addCustomGraphTool.md      # Neo4j structured graph — entities, relationships, hybrid search, multi-tool
  README_TQ.md                            # This file
```

The main guide (`addToolToAskMilo`) covers everything that's common: provider.json format, config topology, registration, deployment. The three companion guides cover backend-specific setup. Read the main guide first, then the one that matches your data type.
