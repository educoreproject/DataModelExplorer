# How To: Add a SQLite RAG Tool to askMilo

Companion to [README_HOWTO-addToolToAskMilo.md](README_HOWTO-addToolToAskMilo.md). This covers the SQLite-specific steps for creating a RAG search tool backed by SQLite + sqlite-vec.

**For the general setup** (provider.json, .ini config, registration, deployment), see the main guide.

---

## Overview

The SQLite RAG pipeline uses `indexTextForMilo` to:

1. **Chunk** source documents using Claude (Anthropic API)
2. **Embed** chunks using OpenAI `text-embedding-3-small` (1536 dimensions)
3. **Store** chunks + embeddings in a SQLite database with sqlite-vec virtual table
4. **Scaffold** a complete provider directory with search CLI, provider.json, and data files

The generated provider is fully self-contained — a single directory you can rsync anywhere.

---

## Prerequisites

- `indexTextForMilo` CLI tool at: `qbookSuperTool/system/code/cli/lib.d/index-text-for-milo/indexTextForMilo.js`
- An OpenAI API key (for embedding generation and query-time embedding)
- An Anthropic API key (for chunking — the chunker calls Claude)
- Text files (`.md`, `.txt`, or similar) in a source directory

---

## Step 1: Run the Indexer

```bash
node /path/to/qbookSuperTool/system/code/cli/lib.d/index-text-for-milo/indexTextForMilo.js \
  -indexText \
  --sourcePath="/path/to/your/text/files/*.md" \
  --providerName=YourProviderName \
  --outDirPath=/path/to/output/directory \
  --chunkStrategy="your chunking instructions"
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `-indexText` | Yes | Action flag (single hyphen, qtools convention) |
| `--sourcePath` | Yes | Path or glob to source text files |
| `--providerName` | Yes | CamelCase name (e.g., `CareerStory`, `PolicyDocs`). Drives all file naming. |
| `--outDirPath` | Yes | Where to write the output provider directory |
| `--chunkStrategy` | No | Natural language chunking instructions, or a predefined shortcut (`paragraph`, `sections`, `sentences` from `[chunkers]` in askMilo.ini). Defaults to paragraph-level. |

### What It Produces

```
your-provider-directory/
  yourProviderNameSearch.js    # Search CLI (generated from ragSearchTemplate.js)
  provider.json                # Tool definition for askMilo registry
  tqDescriptiveName.db         # SQLite + sqlite-vec vector database
  tqDescriptiveName.jsonl      # Human-readable source chunks (archive, not used at runtime)
```

---

## Step 2: Rename the Database Files

The indexer may generate generic names. Rename to be descriptive:

```bash
mv chunks.db tqDescriptiveName.db
mv chunks.jsonl tqDescriptiveName.jsonl
```

**Naming convention:** Use camelCase names that describe the content.
Good: `tqCareerHistory.db`, `cedsPolicies.db`
Bad: `chunks.db`, `data.db`

---

## Step 3: Create the .ini Config

The search script's module name determines the `.ini` filename:

- Script: `careerStorySearch.js` → Config: `careerStorySearch.ini`

**Location:** `qbookSuperTool/system/configs/instanceSpecific/qbook/careerStorySearch.ini`

```ini
[_substitutions]

; Path to database — relative to the provider directory
dbPath=./tqCareerHistory.db

; OpenAI embedding config (for query-time embedding)
openAiApiKey=YOUR_OPENAI_API_KEY
embeddingModel=text-embedding-3-small
embeddingDimensions=1536

; Default number of results
topK=10

; Source label for provenance
sourceLabel=CareerStory

[careerStorySearch]
dbPath=<!dbPath!>
openAiApiKey=<!openAiApiKey!>
embeddingModel=<!embeddingModel!>
embeddingDimensions=<!embeddingDimensions!>
topK=<!topK!>
sourceLabel=<!sourceLabel!>
```

### Critical Details

- The **section name** in brackets MUST match the script's module name (filename without `.js`)
- **`dbPath`** is relative to the provider directory (where the search script lives), not relative to the `.ini`
- **Native SQLite modules** (`better-sqlite3`, `sqlite-vec`) are installed at the project root `system/code/node_modules/` and resolve automatically via Node's upward module walk. No `sqliteModulesPath` config needed.

---

## Step 4: Verify Locally

```bash
# Direct search test
cd /path/to/your-provider-directory
node yourProviderNameSearch.js "test query" --limit=3
```

Should return a JSON array of results with `chunk_text`, `source_file`, `label`, `start_line`, `distance`.

Then follow the main guide for registration (`aiToolsLib.enabled`) and deployment.

---

## Server Deployment Notes

### Native Module Architecture

`better-sqlite3` and `sqlite-vec` are **native modules** compiled for the target architecture. Mac binaries do not work on Linux.

On the server, native modules are installed at `system/code/node_modules/`. The `deployPrograms` rsync uses `--delete`, which wipes server-side `node_modules/`. To handle this:

1. Native modules are backed up to `zInstallationHelpers/` on the server
2. After each deploy, the backed-up modules are copied back to `code/node_modules/`

**To update server binaries:**
```bash
# SSH to server
cd /home/educore/system/code
npm install better-sqlite3 sqlite-vec
# Then copy from code/node_modules/ to zInstallationHelpers/
```

### Server .ini

Create a server-specific `.ini` at `educore/system/configs/instanceSpecific/educore.tqwhite.com/careerStorySearch.ini` with the same structure as the local config but with server-appropriate API keys.

---

## The SQLite Database Schema

The generated `.db` file contains two tables:

```sql
-- Chunk metadata (text, source info)
CREATE TABLE chunk_metadata (
    rowid INTEGER PRIMARY KEY,
    chunk_text TEXT,
    source_file TEXT,
    label TEXT,
    start_line INTEGER
);

-- Vector embeddings for similarity search (sqlite-vec)
CREATE VIRTUAL TABLE chunk_vectors USING vec0(
    embedding float[1536]
);
```

The two tables are linked by `rowid` — they must be inserted together in a transaction to maintain alignment.

### Search Query

```sql
SELECT m.chunk_text, m.source_file, m.label, m.start_line, v.distance
FROM chunk_vectors v
JOIN chunk_metadata m ON m.rowid = v.rowid
WHERE v.embedding MATCH ? AND k = ?
ORDER BY v.distance
```

The `?` parameters are the query embedding (as JSON string) and the limit (topK).

---

## Portability

The SQLite provider is **maximally portable** — the entire provider is a single directory containing:
- The search script
- The `.db` file (embeddings + metadata)
- `provider.json`
- `chunks.jsonl` (human-readable backup)

rsync the directory, create the `.ini` on the target, register in `askMilo.ini`, done.
