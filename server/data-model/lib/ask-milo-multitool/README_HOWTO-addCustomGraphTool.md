# How To: Add a Custom Neo4j Graph Tool to askMilo

Companion to [README_HOWTO-addToolToAskMilo.md](README_HOWTO-addToolToAskMilo.md). This covers building structured graph tools backed by Neo4j — tools where the data has explicit entities and relationships, and queries use Cypher traversal rather than (or in addition to) vector similarity.

**For vector-only RAG tools** (chunked documents with embedding search), see [README_HOWTO-addGraphRagTool.md](README_HOWTO-addGraphRagTool.md).
**For the general setup** (provider.json, .ini config, registration, deployment), see the main guide.

**Reference implementation:** `himed-call-report-graph` — 26,000+ CRM records with 5 query tools, hybrid BM25 + vector search.

---

## When to Use This Pattern

- Your data has **explicit entities and relationships** (customers → contacts → interactions, not raw prose)
- Queries are structural ("who are the contacts at Company X?", "show all interactions with this customer") not just semantic ("find documents about X")
- You want **multiple specialized query tools**, not just a single search endpoint
- You may also want **hybrid search** (BM25 full-text + vector similarity) for the free-text fields

### Key Differences from RAG Tools

| Concern | RAG (Vector Search) | Custom Graph |
|---------|---------------------|--------------|
| **Data model** | Chunks from documents | Domain entities with relationships |
| **Embeddings** | Required (Voyage AI / OpenAI) | Optional — only if free-text search needed |
| **Container setup** | `indexTextGraphForMilo -start` | Manual `docker run` or custom containerManager |
| **Query style** | Vector similarity → context → LLM | Direct Cypher queries, optionally hybrid |
| **Search script** | Single `search()` calls vector index | Multiple query handlers via dispatch |
| **Tool count** | Usually 1 | Usually 3-6 (search, history, lookup, stats, rawCypher) |

---

## Architecture Overview

A custom graph tool has two major components:

### 1. The Indexer/Loader (run once)

Lives in `cli/lib.d/index-{name}-for-milo/`:
- **Parser**: Reads source data (TSV, CSV, JSON, database export) → structured records
- **Loader**: Creates constraints, loads nodes and relationships into Neo4j via batched `UNWIND`
- **Indexer**: Creates BM25 full-text index across searchable text fields
- **Embedder**: (Optional) Generates vector embeddings for semantic search
- **Container Manager**: Docker lifecycle (start, stop, status, forceInit)

### 2. The Search Provider (runs at query time)

Lives in `cli/lib.d/{name}/`:
- **Search script**: Multiple query handlers dispatched by query type
- **provider.json**: One tool definition per query handler
- **package.json**: `neo4j-driver` dependency

### The separation matters

The parser, loader, indexer, and embedder all belong in the **indexer** directory — they are build-time tools that run once to populate the database. The **provider** directory contains only what runs at query time: the search script, provider.json, and package.json.

Do **not** put parsing or loading code in the provider directory. The provider is registered with askMilo and should contain only query logic. The indexer *is* deployed alongside it (the provider's `startup` command in provider.json calls the indexer's `-start` action to ensure the container is running), but the parser, loader, and embedder inside the indexer are build-time operations — they run once during initial data population, not at query time.

---

## Step 1: Create the Docker Container

### Option A: Custom containerManager (recommended for complex tools)

Write a `containerManager.js` that handles:
- Port scanning (find available ports starting from 7700)
- Docker container creation with persistent bind-mounted volumes
- Auto-generation of the search `.ini` config
- Idempotent start (check if running, start if stopped, create if missing)

The HiMed tool's `containerManager.js` is the reference. Key patterns:

```javascript
// Port scanning — find available bolt/http pair
const scanPorts = async (startPort) => {
    for (let port = startPort; port < startPort + 100; port += 2) {
        if (await isPortFree(port) && await isPortFree(port + 1)) {
            return { bolt: port, http: port + 1 };
        }
    }
    throw new Error('No free port pair found');
};

// Docker run with bind mounts for persistent data
const cmd = `docker run -d --name ${containerName} --restart unless-stopped ` +
    `-p ${ports.bolt}:7687 -p ${ports.http}:7474 ` +
    `-e NEO4J_AUTH=neo4j/${password} ` +
    `-v ${dataDir}/data:/data -v ${dataDir}/logs:/logs ` +
    `neo4j:5-community`;
```

### Option B: Manual Docker setup (simpler, less portable)

```bash
# Check existing ports
docker ps --format '{{.Ports}}'

# Pick unique ports (convention: custom graph tools use 77xx)
docker run -d \
  --name rag_YourToolName \
  --restart unless-stopped \
  -p 7704:7687 -p 7705:7474 \
  -e NEO4J_AUTH=neo4j/YOUR_PASSWORD \
  -v $(pwd)/neo4j-data/data:/data \
  -v $(pwd)/neo4j-data/logs:/logs \
  neo4j:5-community
```

### Critical: `encrypted: false`

When connecting to local Docker Neo4j containers, the Node.js `neo4j-driver` defaults to attempting TLS. Local containers don't have certificates. You **must** pass `encrypted: false`:

```javascript
const driver = neo4j.driver(
    config.neo4jBoltUri,
    neo4j.auth.basic(config.neo4jUser, config.neo4jPassword),
    { encrypted: false }  // Required for local Docker containers
);
```

Without this, the driver hangs silently on connection — no error, no timeout, just nothing. Note: on the production server where Neo4j is also a local Docker container, you also need `encrypted: false`.

### Critical: Startup stdout suppression

The `startup` field in `provider.json` runs before tool registration. `docker start` prints the container name to stdout, which contaminates the JSON response from `getDefaults` and breaks the Graphinator UI.

**Always redirect both stdout and stderr:**

```json
"startup": "docker start rag_YourToolName >/dev/null 2>&1 || true"
```

The `|| true` prevents a non-zero exit (container already running) from killing the provider registration.

---

## Step 2: Parse and Load the Data

### The Parser

Write a parser module that transforms raw source data into structured records. Key patterns:

**Field mapping constant** — explicit index-to-name mapping for positional data:

```javascript
const FIELD_MAP = {
    callType: 1,
    custId: 2,
    custName: 3,
    contactId1: 4,
    contactName1: 5,
    // ...
};

const get = (fields, fieldName) => {
    const idx = FIELD_MAP[fieldName];
    return (fields[idx] || '').trim();
};
```

**Entity extraction with deduplication** — use Maps to collect unique entities from records that mention them repeatedly:

```javascript
const customers = new Map();  // custId → { custId, name }
const contacts = new Map();   // contactId → { contactId, fullName }

for (const record of records) {
    const custId = get(record, 'custId');
    if (custId && !customers.has(custId)) {
        customers.set(custId, { custId, name: get(record, 'custName') });
    }
}

return {
    customers: [...customers.values()],
    contacts: [...contacts.values()],
    callLogs,  // every record becomes a call log
};
```

### The Loader

Key patterns for efficient Neo4j bulk loading:

**1. Create constraints FIRST** — this enables MERGE to use index lookups:

```javascript
const constraints = [
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:HimedCustomer) REQUIRE n.custId IS UNIQUE',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:HimedContact) REQUIRE n.contactId IS UNIQUE',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:HimedCallLog) REQUIRE n.callLogId IS UNIQUE',
];
for (const c of constraints) { await session.run(c); }
await session.run('CALL db.awaitIndexes(300)');
```

**2. Batch load with UNWIND** — never insert one node at a time:

```javascript
const runBatched = async (cypher, items, batchSize) => {
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        await session.run(cypher, { batch });
    }
};

// 500 nodes per batch for node creation
await runBatched(`
    UNWIND $batch AS item
    MERGE (n:HimedCustomer:Himed {custId: item.custId})
    SET n.name = item.name
`, customers, 500);

// 1000 per batch for relationships (smaller objects)
await runBatched(`
    UNWIND $batch AS item
    MATCH (cl:HimedCallLog {callLogId: item.callLogId})
    MATCH (cust:HimedCustomer {custId: item.custId})
    MERGE (cl)-[:WITH_CUSTOMER]->(cust)
`, callCustomerBatch, 1000);
```

**3. Use superlabels** — every node gets both a specific label and a superlabel:

```cypher
MERGE (n:HimedCustomer:Himed {custId: item.custId})
--    ^^^^^^^^^^^^^^^  ^^^^^
--    specific label   superlabel
```

The superlabel (`:Himed`) enables queries across all node types in this graph without interfering with other graphs in the same database. It also enables efficient stats queries:

```cypher
MATCH (n:Himed) RETURN labels(n) AS labels, count(n) AS count
```

**4. Load nodes before relationships** — all entity nodes must exist before you create relationships between them. Order: constraints → nodes → `db.awaitIndexes` → relationships.

**5. Build relationship batches from the data** — extract relationship data into flat objects that MATCH can resolve:

```javascript
// Extract callLog → customer relationships
const callCustomerBatch = callLogs
    .filter(cl => cl.custId)
    .map(cl => ({ callLogId: cl.callLogId, custId: cl.custId }));

// Extract callLog → contact relationships (one-to-many)
const callContactBatch = [];
for (const cl of callLogs) {
    for (const contactId of cl.contactIds) {
        callContactBatch.push({ callLogId: cl.callLogId, contactId });
    }
}
```

---

## Step 3: Create the BM25 Full-Text Index

Full-text indexes enable keyword search across multiple node types and properties simultaneously:

```javascript
await session.run(`
    CREATE FULLTEXT INDEX himed_fulltext IF NOT EXISTS
    FOR (n:HimedCallLog|HimedCustomer|HimedContact)
    ON EACH [n.callSummary, n.subject, n.name, n.fullName]
`);
await session.run('CALL db.awaitIndexes(300)');
```

**Key decisions:**
- **Which node types?** Include all types that have searchable text (call logs, customers, contacts — not salespersons since they're just names)
- **Which properties?** Include all free-text fields. Properties that don't exist on a given node type are silently ignored.
- **Index name:** Use a descriptive prefix (`himed_fulltext`) that won't collide with other graphs

### Verifying the Index

```javascript
const result = await session.run(`SHOW INDEXES WHERE name = 'himed_fulltext'`);
const state = result.records[0].get('state'); // should be 'ONLINE'
```

---

## Step 4: Add Vector Embeddings (Optional but Recommended)

If your data has free-text fields (call summaries, descriptions, notes), adding vector embeddings enables semantic search — finding records by meaning, not just keywords.

### Embedding Generation

Key patterns for bulk embedding:

**Batch size:** 128 texts per API call (Voyage AI limit). Larger batches = fewer API calls = faster.

**Text preparation:** Combine relevant fields into a single string, with type prefix for richer context:

```javascript
const texts = batch.map(n => {
    const prefix = n.callType ? `[${n.callType}] ` : '';
    const text = n.callSummary || n.subject || '';
    return `${prefix}${text}`.slice(0, 8000);  // Voyage limit
});
```

**Rate limiting:** Add a small delay between batches to avoid API throttling:

```javascript
if (i + batchSize < nodes.length) {
    await delay(100);  // 100ms between batches
}
```

**Write embeddings back in batches:**

```javascript
await session.run(`
    UNWIND $batch AS item
    MATCH (n:HimedCallLog {callLogId: item.callLogId})
    SET n.embedding = item.embedding
`, { batch: writeBack });
```

**Resumable:** Query for nodes without embeddings (`WHERE n.embedding IS NULL`) so you can restart if interrupted without re-embedding everything.

### Vector Index Creation

```javascript
await session.run(`
    CREATE VECTOR INDEX himed_vector IF NOT EXISTS
    FOR (n:HimedCallLog) ON (n.embedding)
    OPTIONS {indexConfig: {
        \`vector.dimensions\`: 1024,
        \`vector.similarity_function\`: 'cosine'
    }}
`);
await session.run('CALL db.awaitIndexes(300)');
```

**Dimensions:** Voyage AI `voyage-3` produces 1024-dimensional vectors. Must match exactly.

---

## Step 5: Build the Search Provider

### Multi-Tool Dispatch Pattern

Custom graph tools typically have 3-6 query handlers, each exposed as a separate tool. The search script dispatches by query type:

```javascript
const search = async (queryType, params, callback) => {
    const config = getLocalConfig();
    const driver = neo4j.driver(config.neo4jBoltUri, neo4j.auth.basic(config.neo4jUser, config.neo4jPassword));
    const session = driver.session();

    try {
        let result;
        switch (queryType) {
            case 'search':         result = await hybridSearch(session, params.query, config, neo4j); break;
            case 'customerHistory': result = await customerHistory(session, params.name, neo4j); break;
            case 'contactLookup':  result = await contactLookup(session, params.name); break;
            case 'stats':          result = await getStats(session); break;
            case 'rawCypher':      result = await rawCypher(session, params.query); break;
            default:               result = { error: `Unknown query type: ${queryType}` };
        }
        if (callback) { return callback(null, result); }
        return result;
    } finally {
        await session.close();
        await driver.close();
    }
};
```

### Hybrid Search (BM25 + Vector)

The most powerful search pattern combines keyword matching with semantic similarity:

```javascript
const hybridSearch = async (session, query, config, neo4j) => {
    const limit = 15;
    const results = new Map();  // nodeId → result object

    // 1. BM25 full-text search
    const ftResult = await session.run(`
        CALL db.index.fulltext.queryNodes('himed_fulltext', $query)
        YIELD node, score
        // ... project fields
        LIMIT $limit
    `, { query, limit: neo4j.int(limit) });

    for (const rec of ftResult.records) {
        results.set(rec.get('nodeId'), { ...fields, ftScore: rec.get('score'), vecScore: 0 });
    }

    // 2. Vector search
    const queryEmbedding = await embedQuery(query, config.voyageApiKey);
    const vecResult = await session.run(`
        CALL db.index.vector.queryNodes('himed_vector', $limit, $embedding)
        YIELD node, score
        // ... project fields
    `, { limit: neo4j.int(limit), embedding: queryEmbedding });

    for (const rec of vecResult.records) {
        const nodeId = rec.get('nodeId');
        if (results.has(nodeId)) {
            results.get(nodeId).vecScore = rec.get('vecScore');  // boost: found by both
        } else {
            results.set(nodeId, { ...fields, ftScore: 0, vecScore: rec.get('vecScore') });
        }
    }

    // 3. Combine scores and rank
    const ranked = [...results.values()]
        .map(r => ({
            ...r,
            combinedScore: (r.ftScore > 0 ? 0.5 : 0) + (r.vecScore > 0 ? r.vecScore * 0.5 : 0)
        }))
        .sort((a, b) => b.combinedScore - a.combinedScore)
        .slice(0, limit);

    // 4. Enrich top results with neighborhood data
    for (const r of ranked.slice(0, 5)) {
        // Fetch related contacts, customer info, etc.
    }

    return ranked;
};
```

**Why hybrid?** BM25 catches exact names and codes that vector search might miss. Vector search catches semantic matches that keyword search would miss ("spinal implant" finds records about "interbody fusion cages"). The Map-based merge naturally boosts results found by both methods.

**Neighborhood enrichment:** For the top N results, run additional queries to fetch related entities (contacts for a call log, recent interactions for a customer). This gives the LLM richer context for generating answers.

### Recommended Query Handlers

| Handler | Purpose | Input |
|---------|---------|-------|
| `search` (or `hybridSearch`) | Free-text search across all data | query string |
| `customerHistory` | Complete interaction timeline for a specific entity | entity name (partial match) |
| `contactLookup` | Find people by name or by associated entity | name string |
| `stats` | Database overview: counts, distributions, top entities | (none) |
| `rawCypher` | Passthrough Cypher execution for ad-hoc analysis | Cypher query string |

**Always include `rawCypher`** — it lets the LLM construct arbitrary queries for analysis the predefined tools don't cover. Document the full graph schema in the tool description so the LLM knows what nodes and relationships exist.

### Neo4j Integer Handling

Neo4j returns integers as `Integer` objects, not JavaScript numbers. The `toNumber()` helper is essential:

```javascript
const toNumber = (val) => {
    if (val === null || val === undefined) { return 0; }
    if (typeof val === 'number') { return val; }
    if (typeof val.toNumber === 'function') { return val.toNumber(); }
    return Number(val);
};
```

Use it anywhere you display counts: `toNumber(rec.get('count'))`.

Also pass integers to Neo4j using `neo4j.int()`:
```javascript
await session.run('...LIMIT $limit', { limit: neo4j.int(15) });
```

---

## Step 6: Multi-Tool provider.json

Each query handler gets its own tool entry. Here's a complete multi-tool example:

```json
{
    "providerName": "HimedCallReportGraph",
    "description": "HiMed CRM call log history — 26,000+ records spanning 2009-2026",
    "startup": "docker start rag_HimedCallReportGraph >/dev/null 2>&1 || true",
    "startupTimeout": 15,
    "tools": [
        {
            "definition": {
                "name": "himed_search",
                "description": "Search HiMed's CRM using hybrid BM25 + semantic search...",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Search query" }
                    },
                    "required": ["query"]
                }
            },
            "cli": {
                "command": "node himedCallReportGraphSearch.js -search",
                "positionalArgs": ["query"],
                "flagArgs": {}
            }
        },
        {
            "definition": {
                "name": "himed_customer_history",
                "description": "Get complete interaction history with a specific customer...",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "Customer name (partial OK)" }
                    },
                    "required": ["name"]
                }
            },
            "cli": {
                "command": "node himedCallReportGraphSearch.js -customerHistory",
                "positionalArgs": ["name"],
                "flagArgs": {}
            }
        },
        {
            "definition": {
                "name": "himed_stats",
                "description": "Get database statistics — customer count, call types, top customers...",
                "input_schema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            "cli": {
                "command": "node himedCallReportGraphSearch.js -stats",
                "positionalArgs": [],
                "flagArgs": {}
            }
        },
        {
            "definition": {
                "name": "himed_raw_cypher",
                "description": "Execute raw Cypher. Graph contains: :HimedCustomer (custId, name), :HimedContact (contactId, fullName), :HimedCallLog (callLogId, callType, subject, callSummary, dateEntry), :HimedSalesperson (name). Relationships: WITH_CUSTOMER, WITH_CONTACT, ENTERED_BY, WORKS_AT.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Cypher query" }
                    },
                    "required": ["query"]
                }
            },
            "cli": {
                "command": "node himedCallReportGraphSearch.js -rawCypher",
                "positionalArgs": [],
                "flagArgs": { "query": "--query" }
            }
        }
    ]
}
```

### Tool Naming Convention

- **Tool names:** `{prefix}_{action}` in snake_case (e.g., `himed_search`, `himed_customer_history`)
- **CLI flags:** `-{action}` in camelCase (e.g., `-search`, `-customerHistory`) — single hyphen for action flags per qtools convention
- **Provider name:** CamelCase (e.g., `HimedCallReportGraph`)

### CLI Command Mapping

The `cli` section maps tool inputs to command-line arguments:

- **`positionalArgs`** — tool input fields that become bare positional arguments in declared order
- **`flagArgs`** — tool input fields that become `--flag=value` pairs

For tools with no input (like `stats`), use empty arrays:
```json
"positionalArgs": [],
"flagArgs": {}
```

For tools where a parameter could conflict with shell parsing (like Cypher queries with special characters), use `flagArgs` instead of `positionalArgs`:
```json
"flagArgs": { "query": "--query" }
```

---

## Step 7: Config (.ini) Files

Custom graph tools need Neo4j connection info and optionally a Voyage API key (if using vector search):

```ini
[_substitutions]
neo4jBoltUri=bolt://localhost:7704
neo4jUser=neo4j
neo4jPassword=GENERATED_PASSWORD
voyageApiKey=pa-YOUR_VOYAGE_API_KEY

[himedCallReportGraphSearch]
neo4jBoltUri=<!neo4jBoltUri!>
neo4jUser=<!neo4jUser!>
neo4jPassword=<!neo4jPassword!>
voyageApiKey=<!voyageApiKey!>
```

The `[sectionName]` must match `moduleName` in the search script (filename without `.js`).

**If your containerManager auto-generates this .ini**, include the Voyage API key by reading it from the askMilo config or passing it via `--voyageApiKey`.

---

## Step 8: Deployment Checklist

### Provider Directory

```
cli/lib.d/your-tool-name/
  yourToolNameSearch.js     # Search script with query handlers
  provider.json             # Multi-tool definitions
  package.json              # neo4j-driver dependency
```

### Indexer Directory (if applicable)

```
cli/lib.d/index-your-tool-for-milo/
  indexYourToolForMilo.js   # Main CLI entry point
  lib/
    parser.js               # Source data parser
    neo4jLoader.js           # Neo4j node/relationship loader
    indexer.js               # BM25 full-text index creation
    embedder.js              # Vector embedding generation (optional)
    containerManager.js      # Docker lifecycle management
  assets/
    instanceConfig.template.ini
  package.json
```

### Configs

| File | Location | Purpose |
|------|----------|---------|
| `yourSearch.ini` | `configs/instanceSpecific/qbook/` | Local Neo4j connection + API keys |
| `yourSearch.ini` | `configs/instanceSpecific/server/` | Server Neo4j connection + API keys |
| `askMilo.ini` (modified) | Both local and server | Added provider path to `aiToolsLib.enabled` |

### Server Deployment

1. **Symlink** for deployment (if source lives outside educore):
   ```bash
   ln -s /source/path/your-tool-name /path/to/educore/system/code/cli/lib.d/your-tool-name
   ```
2. **Deploy**: `deployPrograms educore --actions=configs,code,restart`
3. **On server**: Create Docker container, run parser/loader, verify `.ini`
4. **Verify**: `node yourSearch.js -stats` should return counts

---

## Incremental Ingest (Keeping the Data Fresh)

Once the initial graph is loaded, you'll likely need to ingest new data periodically — daily CRM exports, weekly report dumps, etc. The architecture supports this naturally:

### Why it works without rebuilding

1. **MERGE is idempotent** — the loader uses `MERGE` on unique IDs, so re-loading a full export updates existing records and adds new ones without duplicates
2. **SET preserves unmentioned properties** — the loader's `SET n.field = item.field` only touches declared fields, leaving the `embedding` property intact on existing nodes
3. **Embedder is incremental** — it queries `WHERE n.embedding IS NULL`, so it only generates embeddings for newly added nodes
4. **BM25 full-text index auto-updates** — Neo4j maintains the index as nodes are created or modified, so no explicit index recreation is needed for incremental loads

### Indexer actions for ongoing use

Design your indexer with these action flags:

| Action | When to use | What it does |
|--------|------------|--------------|
| `-loadCallLog --dataPath=FILE` | First-time setup | Full pipeline: parse → load → BM25 index → embeddings |
| `-ingest --dataPath=FILE` | Periodic refresh | Parse → load (MERGE) → embed new nodes only. Skips BM25 index recreation. |
| `-embed` | After manual data changes | Generate embeddings for any unembedded nodes |

### Example: periodic ingest

```bash
# Client drops a new export; ingest it
node indexYourToolForMilo.js -ingest --dataPath=/path/to/latest-export.txt

# Or if you've added data via rawCypher and need embeddings
node indexYourToolForMilo.js -embed
```

### Design considerations for your loader

- **Use `SET field = value` for individual properties**, not `SET n = item` (which would wipe the embedding and any other enrichment properties)
- **Use `MERGE` on natural keys** (primary keys from the source system), not synthetic UUIDs, so re-ingesting the same record updates rather than duplicates
- **Create constraints before loading** — `MERGE` without a unique constraint does a full scan, which is catastrophically slow on large datasets
- **The embedder should query `WHERE embedding IS NULL`** so it's safe to run repeatedly without re-embedding existing nodes

### Automation potential

For a production deployment with regular data drops:

1. Client drops export to a known path (SFTP, shared drive, S3 bucket)
2. A cron job or file watcher detects the new file
3. Runs `-ingest --dataPath=/path/to/new-file.txt`
4. Logs results to stderr

The HiMed indexer's `-ingest` action is designed for exactly this workflow.

---

## Data Layout

### On Dev Machine

```
qbookSuperTool/
  system/
    code/cli/lib.d/
      index-your-tool-for-milo/         # Indexer (code)
      your-tool-name/                    # Search provider (code)
        yourToolNameSearch.js
        provider.json
        package.json
    dataStores/
      instanceSpecific/
        index-your-tool-for-milo/
          index-your-tool-for-milo.ini   # Container ports, password
          neo4j-YourToolName/            # Docker volumes
            data/
            logs/
    configs/
      instanceSpecific/qbook/
        yourToolNameSearch.ini           # Search tool config
```

### On Server

Same structure under `/home/educore/system/`, with server-specific ports and configs at `configs/yourToolNameSearch.ini` (flat layout per Conway/server convention).

---

## Common Patterns

### Partial Name Matching

Case-insensitive partial match for entity lookups:

```cypher
MATCH (cust:HimedCustomer)
WHERE toLower(cust.name) CONTAINS toLower($name)
RETURN cust.custId AS custId, cust.name AS name
LIMIT 5
```

### Cascading Fallback Search

Try the most specific search first, then broaden:

```javascript
// First try searching by contact name
const contactResult = await session.run(`
    MATCH (contact:HimedContact)
    WHERE toLower(contact.fullName) CONTAINS toLower($name)
    ...
`);

if (contactResult.records.length > 0) { return format(contactResult); }

// If no contacts found, try searching by company name
const companyResult = await session.run(`
    MATCH (contact:HimedContact)-[:WORKS_AT]->(cust:HimedCustomer)
    WHERE toLower(cust.name) CONTAINS toLower($name)
    ...
`);
```

### Comprehensive Stats

A stats endpoint should cover: node counts by type, relationship counts by type, top entities by activity, and any meaningful distributions:

```cypher
-- Node counts using superlabel
MATCH (n:Himed) RETURN labels(n) AS labels, count(n) AS count

-- Relationship counts
MATCH (:Himed)-[r]->(:Himed) RETURN type(r) AS relType, count(r) AS count

-- Top entities by relationship count
MATCH (cl:HimedCallLog)-[:WITH_CUSTOMER]->(cust:HimedCustomer)
RETURN cust.name AS name, count(cl) AS interactions ORDER BY interactions DESC LIMIT 15
```

### rawCypher Result Serialization

Neo4j returns rich objects (nodes with properties, Integer types). Flatten them for JSON output:

```javascript
const rawCypher = async (session, query) => {
    const result = await session.run(query);
    return result.records.map(rec => {
        const obj = {};
        for (const key of rec.keys) {
            const val = rec.get(key);
            if (val && typeof val === 'object' && val.properties) {
                obj[key] = val.properties;           // Node → its properties
            } else if (val && typeof val.toNumber === 'function') {
                obj[key] = val.toNumber();            // Neo4j Integer → JS number
            } else {
                obj[key] = val;                       // Everything else as-is
            }
        }
        return obj;
    });
};
```
