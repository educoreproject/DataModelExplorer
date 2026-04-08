# HOW — Add a Graph to DME

**What this is.** Step-by-step procedural runbook for taking a directory of source data and turning it into a new subgraph inside the educore Data Model Explorer (DME), then deploying the result to production. Written so a fresh Programmer Milo can execute the whole job starting from TQ saying *"Read this directory. It has data we are going to add to DME."*

**What you will produce, in order:**
1. A new **forge module** under `graphForge/system/code/cli/lib.d/forge-{name}/` that parses the source data and writes it into the DME Neo4j container
2. A **bridge spec** that wires the new standard to CEDS (and possibly others) via cross-standard edges
3. A **rebuilt local DME** with the new standard loaded, embedded, bridged, and searchable
4. A **new seed tarball** (`neo4j-data.tar.gz`) under `educore/system/dataStores/initializationData/index-data-model-explorer-for-milo/` replacing the previous one
5. A **deployed production DME** on `educore.tqtmp.org` (and optionally promoted to `educore.tqwhite.com` staging) with the new standard live

---

# Part 0 — Prerequisites

Read this section in full before starting. Missing any of these assumptions will waste time.

## Project locations

All three project roots are on qbook under `/Users/tqwhite/Documents/webdev/`:

| Project | Path | What it contains |
|---|---|---|
| **educore** | `/Users/tqwhite/Documents/webdev/educore` | The DME server + CLI + deployment configs. Contains the `index-data-model-explorer-for-milo` indexer (which holds `containerManager.js`) and the canonical seed location. |
| **graphForge** | `/Users/tqwhite/Documents/webdev/graphForge` | Where forge modules live. Where `rebuildDme.js` lives. Where you'll be creating new code for Phases 2–3. |
| **DataModelExplorer (git)** | `/Users/tqwhite/Documents/webdev/educore/system/code` | The git working tree for the `github.com:educoreproject/DataModelExplorer.git` remote. Don't confuse this with the "educore" project root above — the code/ subdirectory is its own repo. |

## Where to work (CWD requirements)

- Phase 2–4 work (forge creation, rebuild) happens in **graphForge**: `cd /Users/tqwhite/Documents/webdev/graphForge/system/code`
- Phase 5 work (local verify) happens in **educore** CLI: `cd /Users/tqwhite/Documents/webdev/educore/system/code/cli/lib.d/index-data-model-explorer-for-milo`
- Phase 6+ deploy commands can be run from any directory since `deployPrograms` is on PATH

**Important: the `indexDataModelExplorer.js` CLI walks up from its CWD looking for a directory containing a `configs/` folder to resolve `providerProjectRoot`.** If you run it from outside the educore tree it will fail with `Cannot find provider project root`. Always `cd` into the educore tree before invoking it.

**Never operate from `/Users/tqwhite` as CWD.** If you notice your CWD is the home directory, stop and `cd` into the appropriate project tree. Editing files outside the current project requires explicit TQ confirmation anyway.

## Required tools

| Tool | Check | Install if missing |
|---|---|---|
| `docker` | `docker --version` | Docker Desktop |
| `node` | `node --version` | should already be present |
| `git` | `git --version` | should already be present |
| `git-filter-repo` | `git filter-repo --version` | `brew install git-filter-repo` (only needed if doing history cleanup — see Appendix B) |
| `deployPrograms` | `which deployPrograms` | This is a TQ-personal CLI on PATH; if missing, something is wrong with the environment |
| `bb2` | `which bb2` | TQ-personal CLI for neoBrain; should be present |
| `cypher-shell` (inside the container) | `docker exec rag_DataModelExplorer cypher-shell --version` | Provided by the Neo4j Docker image, not installed separately |
| `fileStash` | `which fileStash` | TQ-personal CLI for file backup; should be on PATH |

## SSH access to production

The production test instance is `educore.tqtmp.org`. Key details:

- SSH command: `ssh -p 22314 -i ~/.ssh/tqKey1 root@educore.tqtmp.org`
- Remote `deployPrograms` alias: **`educore` → `educore.tqtmp.org`** (TEST instance — where you verify first)
- Remote `deployPrograms` alias: **`educore_cfnew` → `educore.tqwhite.com`** (STAGING instance — only promoted to after TEST is verified)
- Remote project root on the server: `/home/educore/`
- Systemd service name: `com.tqwhite.educore.service`

## Credentials and secrets

Do **not** hard-code credentials in code you write. Read them from config files:

- **Voyage API key** (for embeddings): `configs/instanceSpecific/qbook/askMilo.ini` on qbook — look for the `voyageApiKey` field. Also appears in `dataModelExplorerSearch.ini`. When you write forge code that needs it, import via the same `configFileProcessor` pattern the existing forges use.
- **Neo4j password for the local DME container**: `configs/instanceSpecific/qbook/dataModelExplorerSearch.ini` section `[dataModelExplorerSearch]` field `neo4jPassword`. Also duplicated in `dataStores/instanceSpecific/index-data-model-explorer-for-milo/index-data-model-explorer-for-milo.ini` field `password`.
- **graphForge target config** (bolt URI, password): `graphForge/system/configs/instanceSpecific/qbook/targets.ini` section `[dme]`.

**Do NOT propose splitting `dataModelExplorerSearch.ini` so secrets stop replicating from qbook to production.** The replication is intentional per an explicit TQ ruling. See Appendix C.

## Neo4j container

- Container name: **`rag_DataModelExplorer`**
- Local ports: bolt `7706`, http `7707` (the actual port is re-resolved on cold bootstrap; `containerManager.js` picks the first available pair starting from 7700)
- Volume mount: `educore/system/dataStores/instanceSpecific/index-data-model-explorer-for-milo/neo4j-DataModelExplorer/data/` → container `/data`
- The container must be running before you can load data. Check with `docker ps --filter name=rag_DataModelExplorer`.

Other DME-adjacent containers that may or may not exist: `rag_CedsOntology14`, `rag_SifSpecGraph`, `rag_CareerStoryGraph`. These are independent indexers — leave them alone unless you know why you're touching them.

## The `add-dme-standard` Claude skill (maybe)

A skill exists at `graphForge/system/code/cli/.claude/skills/add-dme-standard/SKILL.md` that covers the forge-creation flow (Phases 2 through 4 of this runbook). If the skill is loaded in your session, it may offer interactive acceleration. **If the skill is not loaded, ignore its existence and follow the inline instructions in Phases 2–4 of this runbook — they are complete on their own.**

This runbook does not depend on the skill. Everything you need is inline.

## File-handling imperatives

Before modifying any existing file:

1. **`fileStash` the file.** Run `fileStash <filepath>` to back it up to `~/Documents/MILO Backups/`. No exceptions.
2. **Read the file in full** before editing so you understand context.
3. **Consult the `programming-skills` agent** before writing any code — even trivial scripts — to get TQ's coding standards briefing. Use `Task` with `subagent_type="general-purpose"` and point it at the programming-skills agent definition.

When creating new files, place them:

- Forge code → `graphForge/system/code/cli/lib.d/forge-{name}/`
- Notes and plans → `educore/system/management/zNotesPlansDocs/` (for docs about the work) or `graphForge/system/management/zNotesPlansDocs/` (for notes about the forge itself)

## Hard-ruled design decisions (DO NOT "fix")

Some things look wrong at first glance but are deliberate. Do not propose "fixing" them:

- `configs/instanceSpecific/educore.tqtmp.org/dataModelExplorerSearch.ini` is byte-identical to the qbook version — same port, same Neo4j password, same Voyage API key. **Intentional.** See Appendix C.
- `containerManager.js` Case 2 preserves an already-populated data directory as "externally managed" rather than extracting the tarball. **Intentional after the fix documented in Appendix A.** The old form of this check was a bug; the new form is correct — read Appendix A before touching it.

---

# Part 1 — Understand the source data

TQ has handed you a directory. Before writing any code, understand what's in it.

## 1.1 Read the whole directory

```bash
ls -la <source-directory>
```

For each file, identify:
- **Format** — JSON-LD, RDF/XML, CSV, TSV, plain JSON, something else
- **Size** — gigabyte files may need streaming parsers; small files can be loaded whole
- **Role** — schema definitions, instance data, option sets, cross-references, metadata

Sample the first ~100 lines of each file (`head -100 <file>`) to understand structure. For RDF/XML, also `tail -50` to check the closing structure. For CSV/TSV, check whether the first row is a header.

## 1.2 Ask TQ if anything is unclear

Before proposing a node-type mapping, get answers to:

1. **Standard name and abbreviation** — what does TQ call this? (e.g., "CTDL", "SEDM", "CEASN", "PESC"). This drives every derived identifier.
2. **Source format** — confirm your read from 1.1 matches what TQ expects.
3. **What cross-standards references are in it?** — does the data reference CEDS by Global ID? By URI? By namespace-prefixed code? This determines bridge-rule authorship.
4. **Is there authoritative metadata** (version, publication date, spec URL) worth capturing on the root node?

## 1.3 Derive identifiers from the standard name

Given a standard name (e.g., `CTDL`), derive these canonical forms. Confirm with TQ before proceeding.

| Identifier | Rule | Example (CTDL) |
|---|---|---|
| `graphName` | Uppercase abbreviation | `CTDL` |
| `superLabel` | PascalCase + `Model` | `CtdlModel` |
| `toolPrefix` | lowercase + `_graph` | `ctdl_graph` |
| `cliName` | `forge` + PascalCase | `forgeCtdl` |
| `dirName` | `forge-` + lowercase | `forge-ctdl` |

## 1.4 Analyze and report

Read the source files fully (or stream-sample for very large files). Report to TQ:

- Total entities/rows found
- Types of entities (classes, properties, option sets, option values, concepts, etc.)
- Hierarchical structure (subclass chains, parent-child relationships)
- Cross-references to other standards (especially CEDS)
- Any data-quality issues (duplicates, missing IDs, encoding problems)

## 1.5 Propose the node-type mapping

Every graphForge standard follows the same shape. Propose to TQ:

```
{Name}Root          — singleton anchor for this standard
{Name}Class/Entity  — top-level objects (classes, tables, entity types)
{Name}Property      — data elements (fields, attributes, columns)
{Name}OptionSet     — enumerated value containers (code sets, value lists)
{Name}OptionValue   — individual enumerated values
{Name}Concept       — optional; freestanding concepts not tied to a class
```

All nodes will carry the `:ForgedNode` umbrella label plus the source-specific `:{superLabel}` label for per-source indexing.

**Do not write code until TQ approves the mapping.**

---

# Part 2 — Build the forge module

## 2.1 Scaffold the directory

```bash
mkdir -p /Users/tqwhite/Documents/webdev/graphForge/system/code/cli/lib.d/forge-{name}/lib
mkdir -p /Users/tqwhite/Documents/webdev/graphForge/system/code/cli/lib.d/forge-{name}/bridges
```

Target layout after scaffolding:

```
graphForge/system/code/cli/lib.d/forge-{name}/
    {cliName}.js          — entry point
    package.json          — dependencies
    lib/
        parser.js         — source parser
    bridges/
        {name}-to-ceds.json — cross-standard bridge spec
```

## 2.2 Write the entry point

File: `{cliName}.js` in the forge directory. This delegates to `forgeRunner`:

```javascript
#!/usr/bin/env node
'use strict';

const forgeRunner = require('qtools-graph-forge-core/lib/forgeRunner');

forgeRunner({
    graphName: '{graphName}',
    superLabel: '{superLabel}',
    toolPrefix: '{toolPrefix}',
    cliName: '{cliName}',
    displayName: '{displayName}',
    description: '{description}',
    parser: require('./lib/parser'),
    sourceConfigKey: '{dirName}',
    hasBridges: true,
    hasExport: true,
    forgeDir: __dirname
});
```

Substitute the identifiers you derived in 1.3.

Make it executable: `chmod 755 {cliName}.js`.

## 2.3 Write the `package.json`

```json
{
  "name": "{dirName}",
  "version": "1.0.0",
  "description": "{description}",
  "main": "{cliName}.js",
  "dependencies": {
    "qtools-graph-forge-core": "^1.4.6"
  }
}
```

## 2.4 Write the parser

File: `lib/parser.js`. It must follow the `forgeRunner` contract:

```javascript
module.exports = (sourcePath, options, callback) => {
    // 1. Read source files from sourcePath (a directory)
    // 2. Build a nodes array. Each node has:
    //    { id, label, superLabel, properties, edges, _parentEdge? }
    // 3. callback('', { nodes, metadata })
    //    metadata is a plain object with stats like { entityCount, propertyCount, ... }
};
```

**Every node your parser produces must include:**

- A unique `id` (unique within this source — `_source` will scope it globally)
- `label` — the specific node label (e.g., `CtdlClass`, `CtdlProperty`)
- `superLabel` — always the `{superLabel}` you derived (e.g., `CtdlModel`)
- A `name` property — human-readable display name
- A `description` property — searchable descriptive text
- A `searchText` property — `name + description + additional context`, used for BM25 fulltext search
- `_source` property — matches the `{graphName}`
- Any cross-standard reference IDs (e.g., `cedsGlobalId`, `cedsEquivalent`) as properties so bridge rules can match on them later

**Edges:** build them as either explicit entries in an `edges` array on the source node (for sibling-to-sibling references), or as `_parentEdge: { type, target }` for child→parent relationships that graphForge resolves during load.

**Root node:** Create exactly one `{Name}Root` node as a singleton anchor, with summary stats as properties.

**Parser patterns by source format:**

| Format | Read with | Template to look at |
|---|---|---|
| JSON-LD | `JSON.parse(fs.readFileSync(...))`, iterate `@graph` | `graphForge/.../forge-ctdl/lib/parser.js` (if present) |
| RDF/XML | `xml2js.parseString(...)`, walk parsed DOM | `graphForge/.../forge-ceds-rdf/lib/parser.js` |
| CSV | Custom `parseCsvLine()` with multi-line quote handling | `graphForge/.../forge-sedm/lib/parser.js` |
| TSV | Similar to CSV but tab-delimited, no quote handling | `forge-sif-tsv` (in educore's CEDS indexer) |

Read at least one existing parser in full before writing yours — the contract has subtleties best learned from a working example. For most JSON-LD standards, `forge-ctdl` is the cleanest reference.

**Always dedupe.** Source files often contain duplicate rows. Track seen IDs with a `Set` and skip repeats. Log the dedupe count at the end.

**Log progress.** Prefix every console log with `[{name}/parser]` so it's greppable.

## 2.5 Write the bridge spec

File: `bridges/{name}-to-ceds.json`. This creates cross-standard edges between your new forge's nodes and CEDS nodes (which are always loaded first).

```json
{
    "name": "{name}-to-ceds",
    "description": "Cross-standard mappings between {graphName} and CEDS",
    "from": "{graphName}",
    "to": "CEDS",
    "rules": [
        {
            "name": "spec-annotated-maps-to",
            "type": "MAPS_TO",
            "description": "{graphName} elements with explicit CEDS references",
            "method": "cypher",
            "query": "MATCH (n:{superLabel}) WHERE n.cedsEquivalent IS NOT NULL MATCH (cp:CedsProperty) WHERE cp._id = n.cedsEquivalent MERGE (n)-[:MAPS_TO {source: 'spec-annotation', confidence: 1.0, _source: '{graphName}:bridge:{name}-to-ceds'}]->(cp)"
        },
        {
            "name": "embedding-inferred-maps-to",
            "type": "MAPS_TO",
            "description": "{graphName} nodes mapped to nearest CEDS node by embedding similarity",
            "method": "cypher",
            "query": "MATCH (n:{nodeLabel}) WHERE n.embedding IS NOT NULL AND NOT EXISTS { (n)-[:MAPS_TO {source: 'spec-annotation'}]->() } CALL db.index.vector.queryNodes('ceds_vector', 3, n.embedding) YIELD node AS cedsNode, score WHERE score > 0.7 AND cedsNode:CedsProperty MERGE (n)-[r:MAPS_TO {source: 'embedding-inferred', _source: '{graphName}:bridge:{name}-to-ceds'}]->(cedsNode) SET r.confidence = score"
        }
    ]
}
```

**Customize the spec-annotation rule** based on how the source schema references CEDS:
- If the source uses P-prefixed CEDS Global IDs (e.g., `P000255`): match on `cp._id = 'P' + n.cedsGlobalId` if source bare, or `cp._id = n.cedsGlobalId` if source already prefixed
- If the source uses URI references: match on `cp.uri`
- If the source uses namespace-prefixed codes (e.g., `ceds:000113`): extract the numeric part and prepend `P`

**The embedding-inferred rule** fires for any node that doesn't already have a spec-annotated MAPS_TO edge. Threshold 0.7 is a safe default; tune if you find false positives.

## 2.6 Install dependencies

```bash
cd /Users/tqwhite/Documents/webdev/graphForge/system/code/cli/lib.d/forge-{name}
npm install
```

## 2.7 Dry-run the parser

```bash
cd /Users/tqwhite/Documents/webdev/graphForge/system/code/cli/lib.d/forge-{name}
node -e "const p = require('./lib/parser'); p('<source-path>', {}, (e,r) => { if(e) console.error('ERROR:', e); else console.log(JSON.stringify(r.metadata, null, 2)); console.log('First 3 nodes:'); console.log(JSON.stringify(r.nodes.slice(0,3), null, 2)); })"
```

Confirm:
- Metadata counts look plausible
- First 3 nodes have all required properties (`id`, `label`, `superLabel`, `name`, `description`, `searchText`, `_source`)
- No errors

**Report results to TQ before proceeding.** TQ will want to see the metadata block and at least one node sample.

---

# Part 3 — Register the forge in the build pipeline

## 3.1 Add source path to `graphForge.ini`

fileStash the file first:

```bash
fileStash /Users/tqwhite/Documents/webdev/graphForge/system/configs/instanceSpecific/qbook/graphForge.ini
```

Then edit: add your new source path under `[sourceData]`:

```ini
[sourceData]
...existing entries...
forge-{name}=/path/to/your/source/data/directory
```

The key must match the `sourceConfigKey` you set in the forge entry point (which matches `dirName` from 1.3).

## 3.2 Register in `rebuildDme.js`

fileStash the file first:

```bash
fileStash /Users/tqwhite/Documents/webdev/graphForge/system/code/cli/lib.d/rebuild-dme/rebuildDme.js
```

Find the `FORGES` object near the top of the file. Add your forge entry:

```javascript
const FORGES = {
    // ... existing entries ...
    {name}: {
        name: '{graphName}',
        dir: path.join(LIB_D, '{dirName}'),
        cli: '{cliName}.js',
        bridges: ['bridges/{name}-to-ceds.json']
    }
};
```

New standards go **last** in the object because they bridge to earlier standards.

Also find the `loadOrder` arrays — there are **three** of them (full rebuild, embed loop, loadOnly). Add `'{name}'` to the end of each array.

## 3.3 Sanity-check the forge standalone

Before running the full rebuild, test that your forge alone can load into the DME container. Make sure `rag_DataModelExplorer` is running (`docker start rag_DataModelExplorer` if needed).

```bash
cd /Users/tqwhite/Documents/webdev/graphForge/system/code/cli/lib.d/forge-{name}
node {cliName}.js -export --target=dme -replace
```

If this succeeds, run the bridge and the search-tool generation:

```bash
node {cliName}.js -writeProviderToTargetDir --targetDirPathConfigAlias=dme
node {cliName}.js -bridge --spec=bridges/{name}-to-ceds.json --target=dme
```

Report to TQ: node count loaded, edge count, bridge count by rule.

Test a search query and a cross-standard traversal query. Show results to TQ.

**If any of the above fails, debug before proceeding.** Common failures:
- Voyage API key missing — check `configs/instanceSpecific/qbook/askMilo.ini`
- DME container not running — `docker start rag_DataModelExplorer`
- Parser threw during load — re-run the dry-run in 2.7 with more verbose logging
- Bridge query returned 0 edges — the spec-annotation rule's ID matching may be wrong; verify the CEDS ID format assumption

---

# Part 4 — Rebuild the full DME locally

Once the forge works standalone, do the full rebuild to confirm nothing else broke.

```bash
cd /Users/tqwhite/Documents/webdev/graphForge/system/code
node cli/lib.d/rebuild-dme/rebuildDme.js -full -verbose
```

**Runtime:** ~30 minutes on qbook, mostly Voyage API calls for embeddings.

**What this does:**
1. Wipes the DME Neo4j container's data
2. Loads all 8+ forges in order (CEDS, SIF, EdMatrix, JEDx, EdFi, SEDM, CTDL, CIP, and your new one)
3. Generates voyage embeddings per source
4. Runs all bridge specs (each forge's `bridges/*-to-*.json`)
5. Regenerates `provider.json` and per-standard search CLI scripts

**Dry-run alternative:** `rebuildDme.js -full -skipEmbed` (~25 seconds) — skips embeddings and bridges. Useful for verifying the load pipeline without API costs. Not a substitute for a real rebuild, but useful when debugging parser issues.

**Exit criteria:**

```bash
# Counts per source
docker exec rag_DataModelExplorer cypher-shell -u neo4j -p <password> \
    "MATCH (g:GraphSource) RETURN g.name, g.nodeCount ORDER BY g.name"

# Total node count (sanity check)
docker exec rag_DataModelExplorer cypher-shell -u neo4j -p <password> \
    "MATCH (n) RETURN count(n) AS total"
```

Your new standard's count should match what `rebuildDme.js` reported during load. The other standards should match their baselines (roughly: CEDS ~23k, SIF ~23k, EdMatrix ~83, etc.).

---

# Part 5 — Package the seed tarball

Turn the rebuilt local Neo4j data directory into the seed tarball that production will consume.

## 5.1 Stop the local container

```bash
docker stop rag_DataModelExplorer
```

The data directory must be quiescent so the tarball is consistent.

## 5.2 Copy the data directory out of Docker

```bash
docker cp rag_DataModelExplorer:/data /tmp/dme-export-data
```

## 5.3 Tar it up

```bash
cd /tmp && tar -czf dme-graphforge-build.tar.gz -C dme-export-data .
```

**The `-C dme-export-data .` matters.** It tells tar to change into `dme-export-data` and archive the contents (`.`), so the tarball has **no leading directory**. On extract, the files go straight into the target dir. If you archive with a leading path, the tarball will extract into a subdirectory and `containerManager.js` will fail to find `databases/`.

## 5.4 Move to the canonical seed location

fileStash the existing tarball first (it's large but the imperative stands):

```bash
fileStash /Users/tqwhite/Documents/webdev/educore/system/dataStores/initializationData/index-data-model-explorer-for-milo/neo4j-data.tar.gz
```

Then move:

```bash
mv /tmp/dme-graphforge-build.tar.gz \
   /Users/tqwhite/Documents/webdev/educore/system/dataStores/initializationData/index-data-model-explorer-for-milo/neo4j-data.tar.gz
```

## 5.5 Update `manifest.json` if needed

The manifest lives next to the tarball:

```
educore/system/dataStores/initializationData/index-data-model-explorer-for-milo/manifest.json
```

Current fields:

```json
{
    "providerName": "DataModelExplorer",
    "containerName": "rag_DataModelExplorer",
    "password": "<neo4j-password>",
    "searchModuleName": "dataModelExplorerSearch",
    "embeddingModel": "voyage-3",
    "embeddingDimensions": 1024
}
```

**Open question — `embeddingModel` value.** The manifest currently says `voyage-3`. The graphForge `README_FRESH_DATABASE.md` documents `voyage-4`. These contradict. Ask TQ which is correct before your rebuild, and update both the manifest and the README so they agree. Do not silently pick one.

**Password** — this should match the password that's baked into the tarball's internal Neo4j system database. If you change the local container's password during the rebuild, the manifest here must reflect the new password or production will fail to connect after cold bootstrap.

## 5.6 Restart the local container

```bash
docker start rag_DataModelExplorer
```

## 5.7 Scope note — what moves, what stays

**Only two files migrate** to `dataStores/initializationData/index-data-model-explorer-for-milo/`: the seed `neo4j-data.tar.gz` and its `manifest.json`. The other files under `educore/system/code/cli/lib.d/index-data-model-explorer-for-milo/assets/` — `CEDS-Ontology.rdf`, `ImplementationSpecification_031326.tsv`, `refIdResolutionMap.tsv` — are **parser source data** for legacy load paths, not seed data. They stay where they are.

## 5.8 Git hygiene

The canonical seed directory (`dataStores/initializationData/**/*.tar.gz`) must be in `.gitignore`. The tarball is a build artifact; it ships via `deployPrograms` rsync, not via git. Confirm:

```bash
cd /Users/tqwhite/Documents/webdev/educore/system/code
git check-ignore -v dataStores/initializationData/index-data-model-explorer-for-milo/neo4j-data.tar.gz
```

Should output a line confirming the file is ignored by a `.gitignore` rule. If it's NOT ignored, add the rule before committing anything else.

If you ever accidentally commit a large blob to `educore/system/code` (the DataModelExplorer repo), see **Appendix B** for the git-filter-repo recovery recipe.

---

# Part 6 — Local verify

Before deploying, confirm the new tarball bootstraps correctly on your local machine.

## 6.1 Stop and destroy the local container

```bash
docker stop rag_DataModelExplorer
docker rm rag_DataModelExplorer
```

## 6.2 Delete the instance state

```bash
rm -rf /Users/tqwhite/Documents/webdev/educore/system/dataStores/instanceSpecific/index-data-model-explorer-for-milo
```

This forces `containerManager.js` to treat the next start as a fresh bootstrap.

## 6.3 Bootstrap from the new tarball

```bash
cd /Users/tqwhite/Documents/webdev/educore/system/code/cli/lib.d/index-data-model-explorer-for-milo
node indexDataModelExplorer.js -start
```

Expected log output:

```
[containerManager] No instanceConfig found at ...
[containerManager] Found pre-built assets for DataModelExplorer
[containerManager] Extracting pre-built Neo4j data from tarball...
[containerManager] Pre-built data extracted
[containerManager] Wrote instanceConfig to .../index-data-model-explorer-for-milo.ini
[containerManager] Container rag_DataModelExplorer created
[containerManager] Neo4j ready on bolt port 7706 (Ns)
[containerManager] Pre-built data loaded, skipping index creation
[containerManager] Search config written: .../configs/instanceSpecific/qbook/dataModelExplorerSearch.ini
[indexDataModelExplorer] Container rag_DataModelExplorer ready (bolt:7706 http:7707)
```

If you see `[containerManager] Skipping initialization — existing database may contain additional data`, then either the data directory wasn't fully cleaned (re-run 6.2) OR the Case 2 bug regressed (see Appendix A).

## 6.4 Query the new standard

```bash
docker exec rag_DataModelExplorer cypher-shell -u neo4j -p <password> \
    "MATCH (n:{superLabel}) RETURN count(n)"
```

Should match your rebuild counts.

**Exit criteria:** bootstrap succeeds without manual intervention, your new standard's nodes are queryable, counts match rebuild output.

---

# Part 7 — Deploy to production (test instance)

## 7.1 Commands

```bash
# Deploy to TEST (educore.tqtmp.org)
deployPrograms educore --actions=dmeDb

# Deploy to STAGING (educore.tqwhite.com) — ONLY after TEST is verified
deployPrograms educore_cfnew --actions=dmeDb
```

**Always deploy to TEST first and verify before promoting to STAGING.**

## 7.2 What the `dmeDb` action does

The action is defined in `educore/system/configs/instanceSpecific/{instance}/deployment/deployPrograms.ini`. It executes nine hooks in order:

1. **`ssh.before.0`** — `docker stop rag_DataModelExplorer 2>/dev/null || true` (stop the running container, tolerate absence)
2. **`ssh.before.1`** — `mkdir -p <remoteBasePath>/dataStores/zBackups/dme` (ensure backup target exists)
3. **`ssh.before.2`** — If `dataStores/instanceSpecific/.../neo4j-DataModelExplorer/data` exists, `tar -czf` it into `dataStores/zBackups/dme/dme-YYYYMMDD-HHMMSS.tar.gz`. Otherwise log *"No live DME data to back up (fresh instance)"*.
4. **`ssh.before.3`** — `docker rm rag_DataModelExplorer 2>/dev/null || true` (remove the container so the next start is fresh)
5. **`rsync`** — local `dataStores/initializationData/` → remote `dataStores/initializationData/`. The rsync scope is narrowly `initializationData`, not the whole `dataStores/` tree — this is critical because `--delete` on the whole tree would wipe live runtime state in `dataStores/instanceSpecific/`.
6. **`ssh.after.0`** — `rm -rf <remoteBasePath>/dataStores/instanceSpecific/index-data-model-explorer-for-milo` (force fresh bootstrap by deleting the instance dir entirely)
7. **`ssh.after.1`** — `cd <remoteBasePath>/code/cli/lib.d/index-data-model-explorer-for-milo && node indexDataModelExplorer.js -start 2>&1 | tail -20` (explicitly trigger `containerManager.startContainer()` — **see Gotcha B below**)
8. **`ssh.after.2`** — `systemctl restart <systemServiceName>.service` (restart the educore API so it reconnects to the fresh Neo4j)
9. **`ssh.after.3`** — `sleep 5 && systemctl status ... | head -20` (report final state)

## 7.3 Verbatim action definition

Copy-paste reference for the action in `deployPrograms.ini`:

```ini
actions.dmeDb.annotation=Force-bootstrap DME from seed tarball on <!serverConfigName!>
actions.dmeDb.source.hostName=localhost
actions.dmeDb.dest.hostName=specificRemoteHost1

actions.dmeDb.ssh.before.0=docker stop rag_DataModelExplorer 2>/dev/null || true
actions.dmeDb.ssh.before.1=mkdir -p <!remoteBasePath!>/dataStores/zBackups/dme
actions.dmeDb.ssh.before.2=if [ -d <!remoteBasePath!>/dataStores/instanceSpecific/index-data-model-explorer-for-milo/neo4j-DataModelExplorer/data ]; then cd <!remoteBasePath!>/dataStores/instanceSpecific/index-data-model-explorer-for-milo/neo4j-DataModelExplorer && tar -czf <!remoteBasePath!>/dataStores/zBackups/dme/dme-$(date +%Y%m%d-%H%M%S).tar.gz data; else echo "No live DME data to back up (fresh instance)"; fi
actions.dmeDb.ssh.before.3=docker rm rag_DataModelExplorer 2>/dev/null || true

actions.dmeDb.source.pathName=initializationData
actions.dmeDb.dest.pathName=initializationData

actions.dmeDb.ssh.after.0=rm -rf <!remoteBasePath!>/dataStores/instanceSpecific/index-data-model-explorer-for-milo
actions.dmeDb.ssh.after.1=cd <!remoteBasePath!>/code/cli/lib.d/index-data-model-explorer-for-milo && node indexDataModelExplorer.js -start 2>&1 | tail -20
actions.dmeDb.ssh.after.2=systemctl restart <!systemServiceName!>.service
actions.dmeDb.ssh.after.3=sleep 5 && systemctl status <!systemServiceName!>.service --no-pager -l | head -20

sftpHostLib.specificRemoteHost1.pathLib.initializationData=<!remoteBasePath!>/dataStores/initializationData/
sftpHostLib.localhost.pathLib.initializationData=<!localBasePath!>/dataStores/initializationData/
```

If this action definition is missing from one of the `deployPrograms.ini` files (perhaps someone removed it), add it verbatim. Both instances share identical definitions.

## 7.4 Gotcha A — `zip` is not installed on the server

An earlier version of the action used `zip -qr` for the backup. The server has no `zip` binary. The deploy aborted with `bash: line 1: zip: command not found`. **Never use `zip` in server-side hooks.** Use `tar -czf` as the action does now. Backup files are `.tar.gz`, not `.zip`.

## 7.5 Gotcha B — API restart does NOT trigger `containerManager`

**This is the most important gotcha in the whole runbook.** `educore/system/code/server/startApiServer.js` contains **zero references** to `containerManager` or `indexDataModelExplorer`. It assumes the `rag_DataModelExplorer` Docker container is already running. **Restarting the systemd service does not cold-boot the container.**

This is why `ssh.after.1` explicitly invokes `node indexDataModelExplorer.js -start`. Without it, the deploy would:
1. Land the new tarball via rsync ✓
2. Delete the instance dir via `ssh.after.0` ✓
3. Restart the API via `ssh.after.2` but find no DME container running
4. Leave the server in a broken state

**If you ever modify the action, preserve `ssh.after.1`.** If you see the action working without it, be suspicious — it means the DME was already running before the deploy and the rsync didn't actually touch the live Neo4j state.

## 7.6 Exit criteria

- `deployPrograms` exits 0
- `ssh.after.1` log output in the deploy stream contains `[containerManager] Pre-built data extracted` and `[containerManager] Container rag_DataModelExplorer created`
- A new backup exists at `/home/educore/system/dataStores/zBackups/dme/dme-YYYYMMDD-HHMMSS.tar.gz` on the server
- The `rag_DataModelExplorer` container is running on bolt port 7706

## 7.7 Legacy escape hatch (don't use unless told)

`educore/system/configs/instanceSpecific/educore.tqtmp.org/terminalAndOperation/deployDmeData` is a 290-line bash script that rsyncs the **live** Neo4j data directory instead of shipping the tarball. It predates the `dmeDb` action and does NOT use the cold-bootstrap mechanism. It's preserved as an emergency path when live-data sync is specifically wanted. Prefer `deployPrograms dmeDb` for normal deploys. Only touch `deployDmeData` if TQ explicitly asks.

---

# Part 8 — Remote verification

SSH in and run the verification queries.

```bash
ssh -p 22314 -i ~/.ssh/tqKey1 root@educore.tqtmp.org
```

## 8.1 Sanity checks

```bash
# Container running?
docker ps --filter name=rag_DataModelExplorer

# Node counts by source — your new standard should appear
docker exec rag_DataModelExplorer cypher-shell -u neo4j -p <password> \
    "MATCH (n:ForgedNode) RETURN n._source AS source, count(n) AS nodes ORDER BY source"

# Edge types — top-15
docker exec rag_DataModelExplorer cypher-shell -u neo4j -p <password> \
    "MATCH ()-[r]->() RETURN type(r) AS edge, count(r) AS cnt ORDER BY cnt DESC LIMIT 15"

# Embeddings per source — should cover every node
docker exec rag_DataModelExplorer cypher-shell -u neo4j -p <password> \
    "MATCH (n:ForgedNode) WHERE n.embedding IS NOT NULL RETURN n._source AS source, count(n) AS embedded ORDER BY source"

# Graph history events (oldest first)
docker exec rag_DataModelExplorer cypher-shell -u neo4j -p <password> \
    "MATCH (h:GraphHistory)-[:HAS_EVENT]->(e) RETURN e.action, e.source, toString(e.datetime) AS dt ORDER BY e.datetime DESC LIMIT 10"
```

Look for:
- Your new standard's name under `n._source`
- Its node count matches the local rebuild
- Its embedding count equals its node count (every node embedded)
- `MAPS_TO` edges in the edge-types table (your bridges)

## 8.2 Canonical test prompts

Run these against the explorer page (educore.tqtmp.org web UI) to sanity-check search:

1. *What CEDS properties relate to student enrollment?* (Cross-standard search)
2. *Find fields that describe a person's relationship to an educational institution over time* (Vector search, natural language)
3. *Show me EdFi entities and descriptors related to student demographics* (EdFi-specific)
4. *What JEDx fields exist and how do they map to CEDS?* (JEDx + bridges)
5. *Which education standards does EdMatrix track and what categories do they cover?* (EdMatrix)
6. *Compare how SIF and CEDS each represent disability accommodation types. Show the mappings between them.* (Explicit cross-standard)
7. *Search across all standards for anything related to assessment scores and results.* (All standards)
8. *Deeply understand the concept of "student disability" across all standards. Use the graph retriever to show full context.* (Graph retriever integration)

**Add a test prompt for your new standard.** Something like "Find {name} fields related to <domain-specific concept>" so you can verify the new data is reachable via search.

## 8.3 Report to TQ

Report the verification table (source/count/embedded), the canonical test prompt outputs, and any discrepancies. Only then consider Phase 7.

---

# Part 9 — Promote to staging (optional)

After TEST is verified clean, promote to STAGING:

```bash
deployPrograms educore_cfnew --actions=dmeDb
```

Same action definition applies. After it lands, repeat the Part 8 verification against `educore.tqwhite.com`.

**Do not promote to staging without TQ explicit approval.** Staging is a different instance with its own users; any regression affects them.

---

# Part 10 — Commit your work

Two repositories are involved:

## 10.1 `educore/system/code` (→ github.com:educoreproject/DataModelExplorer.git)

If you modified any files under `educore/system/code` (parser changes in shared libs, CLI changes, etc.), commit them. Keep commits surgical — don't bundle unrelated changes.

**Never commit the tarball.** Verify:

```bash
cd /Users/tqwhite/Documents/webdev/educore/system/code
git status
git check-ignore -v ../dataStores/initializationData/index-data-model-explorer-for-milo/neo4j-data.tar.gz
```

The tarball should either not appear in `git status` at all, or be listed as ignored. If it appears staged, unstage it immediately.

Push with a commit message that describes what the forge does and which standard it added.

## 10.2 `educore/system/configs`

If you modified `deployPrograms.ini` or any other config, commit to the configs repo. This is a local-only git repo for backup — no remote push needed.

## 10.3 `graphForge/system/code`

If you created a new forge module or modified `rebuildDme.js` / `graphForge.ini`, commit to the graphForge repo.

---

# Appendix A — `containerManager.js` Case 2 bug (read before touching containerManager)

**There was a bug in `containerManager.js` that gated bootstrap on the presence of a sidecar config file (`dataModelExplorerSearch.ini`) instead of on the actual state of the Neo4j data directory.** It was fixed in commit `735604d` (DataModelExplorer repo) which now gates on `fs.existsSync(path.join(dataDirPath, 'databases'))` — the `databases/` subdirectory is Neo4j's own marker for an initialized store.

**Current correct behavior** (as of `containerManager.js` lines 282–286 at time of writing):

```js
const dataDirPath = path.join(dataStoreBase, 'neo4j-DataModelExplorer', 'data');
const dataDirPopulated = fs.existsSync(path.join(dataDirPath, 'databases'));
if (dataDirPopulated) {
    xLog.status(`[containerManager] Data directory already populated: ${dataDirPath}`);
    xLog.status('[containerManager] Preserving existing data — skipping tarball extraction');
    // ... preserve as external
}
```

**Rule of thumb:** gate decisions on the state of the thing you care about, not on the presence of sidecar config files. Config files are evidence that something happened in the past; they are not evidence that current state matches what those files describe. If you ever need to modify the bootstrap ladder, keep this principle.

**If you see the old form of the check** (`fs.existsSync(searchIniPath)` gating Case 2), the bug has regressed. Restore the current form.

**Do not "simplify" Case 2 away.** It exists to preserve externally-loaded data. The fix was the gate, not the concept.

---

# Appendix B — Git filter-repo recipe (only if you committed a large blob)

The `educore/system/code` repo was previously rewritten to purge a 778 MB tarball. If you ever commit a large blob by accident and get rejected by GitHub's 100 MB limit, here's the recipe.

## B.1 Install

```bash
brew install git-filter-repo
```

Not installed by default on macOS.

## B.2 Safety prep

```bash
cd /Users/tqwhite/Documents/webdev/educore/system/code

# Full-repo bundle backup
mkdir -p ~/Documents/MILO\ Backups/dme-filter-repo-$(date +%Y%m%d)
git bundle create \
    ~/Documents/MILO\ Backups/dme-filter-repo-$(date +%Y%m%d)/pre-rewrite.bundle \
    --all

# Tag the pre-rewrite HEAD
git tag pre-filter-repo-$(date +%Y%m%d)
```

## B.3 Rewrite

```bash
git filter-repo --strip-blobs-bigger-than 100m --force
```

**Why blob-size-based rather than path-based:** catches any oversized blob regardless of filename. Safer if you don't know every large file in history.

## B.4 Re-add origin

`git-filter-repo` removes the `origin` remote automatically as a safety precaution.

```bash
git remote add origin git@github.com:educoreproject/DataModelExplorer.git
```

## B.5 Dry-run force-push

```bash
git push --force-with-lease --dry-run origin main
```

Expected output: `[new branch] main -> main`. The "new branch" label is correct — all commit hashes changed from GitHub's perspective.

## B.6 Pre-flight checklist before force-push

- Any other clones of the repo? (anyone with a clone will need to re-clone or `git fetch && git reset --hard origin/main`)
- Any CI/CD pulling the repo?
- Backup bundle still present?
- Tag `pre-filter-repo-*` still present locally?

**Never force-push without TQ explicit confirmation.** History rewrite is destructive to every other clone.

## B.7 Force-push

```bash
git push --force-with-lease origin main
```

## B.8 Recovery scenarios

**Undo local rewrite before pushing:**
```bash
git reset --hard pre-filter-repo-<date>
```

**Restore from bundle:**
```bash
cd /tmp && git clone ~/Documents/MILO\ Backups/dme-filter-repo-<date>/pre-rewrite.bundle recovered
```

**Orphaned clone after force-push:** tell the clone owner to `rm -rf` and re-clone fresh.

---

# Appendix C — Hard-ruled design decisions

Do not "fix" these. They are deliberate.

## C.1 `dataModelExplorerSearch.ini` secret replication

The file `configs/instanceSpecific/educore.tqtmp.org/dataModelExplorerSearch.ini` is byte-identical to `configs/instanceSpecific/qbook/dataModelExplorerSearch.ini` — same bolt port, same Neo4j password, same Voyage API key. It is replicated to production via `deployPrograms --actions=configs` every time configs are deployed.

**This is intentional per an explicit TQ ruling.** Do not propose splitting the file so secrets live in a server-local template. Do not propose excluding it from rsync. Do not flag it as a concern in any documentation. If you must describe its behavior, describe it neutrally as "replicated from dev config to production via deployPrograms."

## C.2 Case 2 preservation behavior in `containerManager.js`

When the Neo4j data directory is already populated (has a `databases/` subdirectory), `containerManager.js` preserves it rather than extracting the tarball. This is correct. It protects manually-loaded data and also protects the external-management workflow some operators use. Do not remove this check. The bug that previously existed was in the gate (`searchIniPath` presence), not in the concept — see Appendix A.

## C.3 The tarball as distribution channel

The seed `neo4j-data.tar.gz` ships via `deployPrograms` rsync from `dataStores/initializationData/`, not via git and not via a package manager. This is deliberate. The tarball is a build artifact and lives outside git for good reason (100 MB+ blobs are a git pain). Do not propose moving it into git-lfs, a package registry, a CI artifact bucket, or any other distribution mechanism without TQ explicit discussion.
