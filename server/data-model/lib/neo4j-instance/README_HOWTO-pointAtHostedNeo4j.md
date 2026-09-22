# HOWTO: point the server at a hosted Neo4j

Everything the server does against the graph goes through one place,
`initDatabaseInstance` in `neo4j-instance.js`. Moving from the droplet's docker
container to a hosted Neo4j (Aura or equivalent) is a config change, not a code
change.

## The config

The server reads `dataModelExplorerSearch` (see `data-model.js`, pipeline stage 3.5):

```ini
neo4jBoltUri=neo4j+s://xxxxxxxx.databases.neo4j.io
neo4jUser=neo4j
neo4jPassword=THE_PASSWORD
neo4jDatabase=neo4j
```

`neo4jDatabase` is optional and new. A hosted instance can serve more than one
database from a single URI; Aura's default is named `neo4j`. Leave it out and the
server uses whatever the connection's default database is, which is what every
self-hosted container does today.

## Why the scheme matters

The URI scheme, not the config, decides encryption:

| Scheme | Encryption | Driver options sent |
|---|---|---|
| `bolt://`, `neo4j://` | none | `{ encrypted: false }` |
| `bolt+s://`, `neo4j+s://` | TLS, CA-verified | none — the URI says it |
| `bolt+ssc://`, `neo4j+ssc://` | TLS, self-signed ok | none — the URI says it |

Self-hosted Neo4j 5 community serves bolt without TLS, so those URIs have to be
given `{ encrypted: false }` explicitly. A `+s` URI already states its encryption,
and passing `encrypted` alongside it makes the driver throw

```
Encryption/trust can only be configured either through URL or config, not both
```

before it ever opens a socket. `neo4j-instance.js` picks the right options from the
scheme, so both kinds of URI work with no edit.

## Check it

Offline, no Neo4j needed — proves the URI handling, not a live connection:

```bash
node server/test/neo4jConnection/bolt-uri-options-harness.js
```

Expect `ALL PASSED`, exit 0.

Against the real host, once the config is in place, the startup log line is the
confirmation:

```
neo4j-instance: connected to neo4j+s://xxxxxxxx.databases.neo4j.io (database neo4j)
```

A bad URI or unreachable host now reports through the normal error path
(`neo4j-instance: cannot open driver for …` or `connection verification failed`)
instead of throwing out of the startup pipeline.

## What this does NOT move

Two things still assume a local docker Neo4j and need their own decision before the
graph leaves the droplet:

- **Per-user graph clones** (`lib/user-graph/clone-manager.js`) provision a user's
  graph by `docker inspect`-ing the `rag_DataModelExplorer` container, copying its
  data directory on the local filesystem, and starting a dedicated container on the
  copy. None of that has a hosted equivalent — a hosted golden cannot be cloned this
  way. Either the golden stays local for clones, or clones move to a per-user
  database / separate hosted instance.
- **The indexers** under `cli/lib.d/…` create and load the container they index into,
  and still pass `{ encrypted: false }` unconditionally. They are unchanged here;
  loading a hosted graph from them would need the same scheme-aware treatment.

The read/query path the API and MCP server use is fully covered.
