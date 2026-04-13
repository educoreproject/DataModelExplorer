# How To: Add a Tool to askMilo

This guide covers what every askMilo tool provider needs, regardless of backend. For backend-specific setup, see the companion guides:

- **SQLite RAG tools:** [README_HOWTO-addSqliteRagTool.md](README_HOWTO-addSqliteRagTool.md)
- **Neo4j RAG tools:** [README_HOWTO-addGraphRagTool.md](README_HOWTO-addGraphRagTool.md)
- **Custom Neo4j graph tools:** [README_HOWTO-addCustomGraphTool.md](README_HOWTO-addCustomGraphTool.md) — structured entity graphs with multiple query tools, hybrid search, batch loading

---

## What Is a Tool Provider?

An askMilo tool provider is a directory containing:

1. **`provider.json`** — Declares the tool's name, description, input schema (Anthropic format), and CLI command
2. **A search script** (e.g., `yourToolSearch.js`) — CLI executable that accepts a query and returns JSON results
3. **Supporting files** — Database, config, dependencies, whatever the search script needs

When askMilo starts, it reads `provider.json` from each registered provider directory, collects all tool definitions, and passes them to the Claude API. When Claude invokes a tool, askMilo's `toolHandler.js` spawns the CLI command declared in `provider.json` and feeds the result back.

---

## The provider.json Contract

Every provider must have a `provider.json` at the root of its directory:

```json
{
    "providerName": "YourToolName",
    "description": "What this tool searches",
    "tools": [
        {
            "definition": {
                "name": "your_tool_name_search",
                "description": "Search YourToolName documents by semantic similarity. Returns the most relevant text chunks matching the query.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Natural language search query"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Max results (default 10)",
                            "default": 10
                        }
                    },
                    "required": ["query"]
                }
            },
            "cli": {
                "command": "node yourToolNameSearch.js",
                "positionalArgs": ["query"],
                "flagArgs": { "limit": "--limit" }
            }
        }
    ]
}
```

### Multi-Tool Providers

A single provider can expose multiple tools. Each tool maps to a different query handler in the search script. This is the standard pattern for custom graph tools (see [README_HOWTO-addCustomGraphTool.md](README_HOWTO-addCustomGraphTool.md)):

```json
{
    "providerName": "YourToolName",
    "description": "What this tool collection searches",
    "startup": "docker start rag_YourToolName >/dev/null 2>&1 || true",
    "startupTimeout": 15,
    "tools": [
        {
            "definition": {
                "name": "your_tool_search",
                "description": "Search across all data...",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Search query" }
                    },
                    "required": ["query"]
                }
            },
            "cli": {
                "command": "node yourToolSearch.js -search",
                "positionalArgs": ["query"],
                "flagArgs": {}
            }
        },
        {
            "definition": {
                "name": "your_tool_entity_history",
                "description": "Get complete history for a specific entity...",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "Entity name (partial OK)" }
                    },
                    "required": ["name"]
                }
            },
            "cli": {
                "command": "node yourToolSearch.js -entityHistory",
                "positionalArgs": ["name"],
                "flagArgs": {}
            }
        },
        {
            "definition": {
                "name": "your_tool_stats",
                "description": "Database statistics and overview...",
                "input_schema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            "cli": {
                "command": "node yourToolSearch.js -stats",
                "positionalArgs": [],
                "flagArgs": {}
            }
        },
        {
            "definition": {
                "name": "your_tool_raw_cypher",
                "description": "Execute raw Cypher. Graph schema: ...",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Cypher query" }
                    },
                    "required": ["query"]
                }
            },
            "cli": {
                "command": "node yourToolSearch.js -rawCypher",
                "positionalArgs": [],
                "flagArgs": { "query": "--query" }
            }
        }
    ]
}
```

**Tool naming:** `{prefix}_{action}` in snake_case. All tools from one provider share a prefix.

**CLI flags:** `-{action}` in camelCase per qtools convention. The `cli.command` includes the action flag; `positionalArgs` and `flagArgs` map the tool's input fields to CLI arguments.

**rawCypher:** Always include a raw query tool as a fallback. Document the full graph schema in the description so the LLM knows what to query.

### Critical Rules

- **`providerName`** — CamelCase, unique across all providers. This is how askMilo identifies the provider.
- **`definition.name`** — snake_case version. This is the Anthropic tool name Claude sees. Must be unique across all registered tools.
- **`cli.command`** — MUST use `node filename.js` format, not bare executable names. The toolHandler sets `cwd` to the provider directory, so relative filenames resolve correctly. Bare names (e.g., `sifSearch -search`) fail with ENOENT on servers.
- **`positionalArgs`** and **`flagArgs`** — Map Claude's input object to CLI arguments. `positionalArgs` become bare args in declared order; `flagArgs` become `--flag=value`.

### Optional: Startup Command

If your tool needs initialization before it can handle queries (e.g., starting a Docker container), add:

```json
{
    "providerName": "YourToolName",
    "startup": "node ../your-indexer/yourIndexer.js -start --assetsDir=./assets",
    "startupTimeout": 30,
    "tools": [...]
}
```

The `startup` command runs once when the provider registry loads. It runs with `cwd` set to the provider directory, so relative paths like `../your-indexer/` and `./assets` resolve from the provider's location. `startupTimeout` is in seconds (default 30). If the startup command fails, the provider still loads — it just logs a warning.

The `--assetsDir=./assets` pattern is standard for Neo4j RAG providers — it tells `-start` to look for a pre-built data tarball and manifest in the provider's `assets/` directory, enabling portable cold starts on any server.

Use this for idempotent operations only (container health checks, connection verification). Non-idempotent startup should be run manually.

---

## The Search Script Contract

The search script must:

1. **Accept a query as a positional argument** — `node yourSearch.js "the user's question"`
2. **Accept `--limit=N`** (optional) — Cap the number of results
3. **Output JSON to stdout** — An array of result objects
4. **Output diagnostics to stderr** — Anything on stdout that isn't JSON will break the tool result
5. **Exit 0 on success, non-zero on failure**

### Expected Output Format

```json
[
    {
        "chunk_text": "The relevant text from the document...",
        "source_file": "original-document.md",
        "label": "Section: Background",
        "start_line": 42,
        "distance": 0.234
    }
]
```

The field names can vary by backend (`distance` for SQLite, `score` for Neo4j), but the tool result goes to Claude as raw text — it handles the interpretation.

### Dual-Mode Support

Search scripts should also work as Node modules:

```javascript
const { search } = require('./yourToolNameSearch');
search('query text', { limit: 5 }, (err, results) => { ... });
```

This is used by the `require.main === module` pattern — CLI mode when run directly, module mode when required.

---

## Configuration Pattern

### The askMilo Consumer Topology

askMilo runs in multiple contexts. Understanding which project's configs get used in each context is the key to avoiding "works here, fails there" bugs.

#### The consumers

| Consumer | Where askMilo runs | askMilo.ini location | Search .ini location |
|----------|-------------------|---------------------|---------------------|
| **CLI** (`askMilo` on command line) | qbookSuperTool | `qbookSuperTool/.../instanceSpecific/qbook/askMilo.ini` | `qbookSuperTool/.../instanceSpecific/qbook/yourSearch.ini` |
| **qbookInternal** (local web UI at qbook.local) | qbookSuperTool (shared backend) | Same as CLI — qbookInternal calls the same askMilo | Same as CLI |
| **qbook.work** (production web UI) | qbookSuperTool on server | `qbookSuperTool/system/configs/askMilo.ini` (flat on server) | `qbookSuperTool/system/configs/yourSearch.ini` (flat on server) |
| **educore** (production web UI) | educore on server | `educore/system/configs/askMilo.ini` (flat on server) | `educore/system/configs/yourSearch.ini` (flat on server) |

#### CLI, qbookInternal, and qbook.work share a backend

These three consumers all use qbookSuperTool's askMilo. Adding a tool to `qbookSuperTool/.../qbook/askMilo.ini` makes it available to all three. Specifically:

- **CLI** runs askMilo directly from qbookSuperTool
- **qbookInternal** (at `qbook.local`) connects via WebSocket to `ws-askmilo.js`, which spawns askMilo as a child process from qbookSuperTool
- **qbook.work** is the production deployment of the same qbookSuperTool project on CodeFactory, with nginx proxying WebSocket connections

**Note:** `qbook.local` (local access to qbookInternal) currently lacks WebSocket proxy configuration, so askMilo's WebSocket connection fails from the local hostname. Access via `qbook.work` from the internet works correctly because nginx handles the WebSocket upgrade. This is a known limitation of the local dev setup, not a config issue.

#### Why qbook.work and educore have separate configs

On the production server (CodeFactory), qbookSuperTool and educore are separate deployments under `/home/qbookSuperTool/` and `/home/educore/`. Each has its own `askMilo.ini` with server-appropriate provider paths. A tool deployed to educore won't appear on qbook.work unless it's also deployed to qbookSuperTool (and vice versa).

#### Server config layout is flat

Locally, configs live in `configs/instanceSpecific/{hostname}/`. On the server, `deployPrograms` rsyncs the contents of `instanceSpecific/{serverConfigName}/` **flat** into `configs/`. So `instanceSpecific/educore.tqwhite.com/yourSearch.ini` lands as `configs/yourSearch.ini` on the server. The search script's hostname check (`os.hostname() == 'qMini.local'`) controls which path to use: on qMini.local (your Mac), it looks in `instanceSpecific/qbook/`; on any other hostname, it looks in `configs/` directly.

### The .ini Config

Each search script bootstraps `process.global` via `qtools-config-file-processor` and loads config from a `.ini` file. The `.ini` filename must match the script's module name:

- Script: `careerStorySearch.js` → Config: `careerStorySearch.ini`
- Script: `himedCallReportGraphSearch.js` → Config: `himedCallReportGraphSearch.ini`

### Config Resolution

The script calls `findProjectRoot()` from its `__dirname`, walks up to find `system/`, then loads from:

1. On `qMini.local` → `configs/instanceSpecific/qbook/` (hostname-specific)
2. On any other host → `configs/` (flat, server layout)

**This means config resolution depends on where the script physically lives at runtime**, not where it was authored. A symlinked tool resolves from the source project's `system/` root (locally); an rsynced copy (on server) resolves from the destination project's `system/` root.

### Which Configs You Need

Every tool needs configs **in each project where it will run**. Here's the checklist:

#### For CLI + qbookInternal (always needed):

1. **Search .ini:** `qbookSuperTool/system/configs/instanceSpecific/qbook/yourSearch.ini`
2. **askMilo.ini:** Add provider path to `aiToolsLib.enabled` in `qbookSuperTool/.../qbook/askMilo.ini`
   - Provider path is local: `/Users/tqwhite/tq_usr_bin/qbookSuperTool/system/code/cli/lib.d/your-provider`

#### For educore.tqwhite.com (if deploying to educore):

3. **Search .ini:** `educore/system/configs/instanceSpecific/educore.tqwhite.com/yourSearch.ini`
4. **askMilo.ini:** Add provider path to `aiToolsLib.enabled` in `educore/.../educore.tqwhite.com/askMilo.ini`
   - Provider path is server: `/home/educore/system/code/cli/lib.d/your-provider`
5. **Symlink:** Create symlink in educore's `lib.d/` pointing to qbookSuperTool's provider directory (so `deployPrograms` carries it to the server)

#### For qbook.work (if deploying to qbook.work):

6. **Search .ini** and **askMilo.ini** would go in qbookSuperTool's server config dir
7. Provider path would be `/home/qbookSuperTool/system/code/cli/lib.d/your-provider`

> **The #1 cause of "works on CLI, fails on website" bugs:** Missing server `.ini`. If the server config is missing, `getConfig()` returns empty config and any required values (API keys, Neo4j credentials) will be undefined. The tool will appear available but fail when called.

> **The #2 cause:** Missing provider path in the server's `askMilo.ini`. The tool won't appear in the UI at all.

---

## Registering the Tool

### Step 1: Add to aiToolsLib.enabled

Edit the appropriate `askMilo.ini` file(s) and add the provider directory's full path to the colon-separated `aiToolsLib.enabled` list:

```ini
aiToolsLib.enabled=/path/to/existing-tool:/path/to/your-new-provider-directory
```

Remember: the paths are **different** locally vs on server:

| Context | Path prefix |
|---------|------------|
| Local (CLI + qbookInternal) | `/Users/tqwhite/tq_usr_bin/qbookSuperTool/system/code/cli/lib.d/` |
| Server (educore) | `/home/educore/system/code/cli/lib.d/` |
| Server (qbook.work) | `/home/qbookSuperTool/system/code/cli/lib.d/` |

### Step 2: Verify Registration

```bash
# Check that your tool appears in the available tools list
askMilo -getDefaults
```

Your tool should appear in the `availableTools` array. If it doesn't:

- Is the path in `aiToolsLib.enabled` correct?
- Does `provider.json` exist and have a valid `providerName`?
- Is the tool in `aiToolsLib.suppressedTools`? (suppressed tools are excluded)

### Step 3: Test Through askMilo

```bash
echo '{"switches":{"stream":true},"values":{"expandModel":["sonnet"]},"fileList":["a question that should use your tool"]}' | askMilo
```

Claude should decide to use your tool. Check stderr for tool invocation logs.

---

## Deploying to a Web Server

### Symlink for Deployment

Provider directories live in qbookSuperTool but must be visible in the web project (e.g., educore) so `deployPrograms` carries them to the server:

```bash
ln -s /Users/tqwhite/tq_usr_bin/qbookSuperTool/system/code/cli/lib.d/your-provider \
      /Users/tqwhite/Documents/webdev/educore/system/code/cli/lib.d/your-provider
```

The symlink makes the provider visible to educore's rsync-based deployment without duplicating files. On the server, the symlink is resolved by rsync — the provider directory arrives as a real directory at `/home/educore/system/code/cli/lib.d/your-provider/`.

If the provider uses a container manager (indexer with `-start`), symlink that too:

```bash
ln -s /Users/tqwhite/tq_usr_bin/qbookSuperTool/system/code/cli/lib.d/index-your-tool-for-milo \
      /Users/tqwhite/Documents/webdev/educore/system/code/cli/lib.d/index-your-tool-for-milo
```

### Deploy

```bash
deployPrograms educore --actions=configs,code,restart
```

This rsyncs configs (your new `.ini` files from `instanceSpecific/educore.tqwhite.com/`) and code (the provider directory via symlink) to the server, then restarts.

### Server-Side First-Time Setup (Neo4j tools)

If the tool uses a Neo4j Docker container, the first deploy requires additional server-side setup:

1. **Container startup:** Either the provider.json `startup` command handles this automatically (via `-start --assetsDir=./assets` with a pre-built tarball), or you SSH in and create the container manually
2. **Verify the search .ini:** Check that `configs/yourSearch.ini` exists on the server with correct Neo4j credentials and API keys. If auto-generated by the container manager, verify the Voyage API key is populated.
3. **Test:** `node /home/educore/system/code/cli/lib.d/your-provider/yourSearch.js -stats`

### Verify on Web UI

Open the web UI (Graphinator or askMilo page). Your tool should appear as a checkbox in the Tools section. Submit a query with the tool enabled and confirm results come back.

---

## How It All Connects at Runtime

```
User types query in web UI (educore.tqwhite.com or qbook.work or qbookInternal)
  → Vue component sends via WebSocket
    → nginx proxies /ws/ to the Node backend (production)
       OR direct connect to localhost:7797 (dev/local)
    → ws-askmilo.js spawns askMilo as child process
      → askMilo loads askMilo.ini from the HOST PROJECT's configs
        → Builds provider registry from aiToolsLib.enabled paths
        → Runs any provider startup commands
        → Collects tool definitions from all provider.json files
      → askMilo sends query + tool definitions to Claude API
        → Claude decides to use your tool, returns tool_use block
      → toolHandler.js looks up CLI mapping from registry
        → Spawns: node yourSearch.js "the query" --limit=10
          → Search script calls findProjectRoot() from __dirname
          → Walks up to system/, loads yourSearch.ini from configs/
          → Generates query embedding (API call) if needed
          → Searches database (SQLite or Neo4j)
          → Returns JSON results to stdout
      → askMilo feeds stdout back to Claude as tool_result
        → Claude incorporates retrieved text into its response
    → Response streams back through WebSocket to UI
```

---

## Common Problems

**Tool doesn't appear in UI:** `askMilo -getDefaults` must return your tool in `availableTools`. If it doesn't, check `aiToolsLib.enabled` path and that `provider.json` exists with valid `providerName`.

**Search returns no results:** Run the search script directly (`node yourSearch.js "test"`) to isolate whether the problem is config resolution, API connectivity, or the database itself.

**Tool command ENOENT:** The `cli.command` in `provider.json` must use `node filename.js` format. The toolHandler sets `cwd` to the provider directory — bare executable names require PATH setup and fail on servers.

**Config not loading:** The search script walks up from `__dirname` to find `system/`, then loads from `configs/instanceSpecific/qbook/` (on qMini.local) or `configs/` (on server). Verify with `hostname` on the target machine.

**Works on CLI, fails on website:** Almost always a missing server `.ini` or missing provider path in the server's `askMilo.ini`. See "Which Configs You Need" above.

**Works on qbook.work, not on educore (or vice versa):** These are separate server deployments with separate configs. A tool registered in educore's `askMilo.ini` won't appear on qbook.work, and vice versa. Check that both the search `.ini` and the `askMilo.ini` entry exist in the correct project on the server.

**Works on qbook.work but not qbook.local:** This is a known WebSocket limitation. `qbook.local` (local access) lacks WebSocket proxy configuration, so the askMilo WebSocket connection fails. Access via `qbook.work` from the internet works because nginx handles the upgrade. This is not a tool configuration issue.

**Startup command fails:** Check that the `startup` command in `provider.json` works when run manually from the provider directory. Startup failures are logged but don't prevent the provider from loading — the tool will appear available but fail when actually called.

---

## File Inventory

After full setup, you'll have created or modified:

| File | Location | Purpose |
|------|----------|---------|
| Search script | `qbookSuperTool/.../lib.d/your-provider/` | CLI tool, bootstraps process.global |
| `provider.json` | `qbookSuperTool/.../lib.d/your-provider/` | Tool definition for askMilo registry |
| Database/data | Provider directory or dataStore/ | Backend-specific data store |
| `yourSearch.ini` | `qbookSuperTool/.../instanceSpecific/qbook/` | Local config (CLI + qbookInternal) |
| `askMilo.ini` (modified) | `qbookSuperTool/.../instanceSpecific/qbook/` | Added local provider path |
| Symlink | `educore/.../lib.d/your-provider` → qbookSuperTool | For server deployment |
| `yourSearch.ini` | `educore/.../instanceSpecific/educore.tqwhite.com/` | Server config for educore |
| `askMilo.ini` (modified) | `educore/.../instanceSpecific/educore.tqwhite.com/` | Added server provider path |
