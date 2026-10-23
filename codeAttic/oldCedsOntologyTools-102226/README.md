# Attic: the pre-forge CEDS ontology tools (retired 2026-10-22, zeroBacklog lane E, E2-8)

**Ruling:** TQ's question Q-Z11 (educoreForge `zNotesPlansDocs/zeroBacklog-102226/PLAN-zeroBacklog-102226.md` §11), adopted by BRONZE_CROWN under TQ's mandate in `RULINGS-supervisor-102226.md`: the rater stays; the old `ceds-ontology*` tools and the `/ontology` page retire.

**Why they retired.** Each reads CEDS from its own copy of the CEDS RDF (or a Neo4j built from it by `index-ontology14-for-milo`), outside the forged graph the DME now answers from. They predate educoreForge's CEDS forge, the hub contract and the graph contract. Nothing in the live tree imports them: code fact, checked by `git grep` at the move (the only remaining mentions are history comments, "Derived from index-ontology14-for-milo/...", in `index-data-model-explorer-for-milo`).

**What is here, at its old path under this folder:**

| old path | what it was |
|---|---|
| `cli/lib.d/ceds-graphinator/` (`ceds2`) | the CEDS Graphinator CLI (configs `ceds2.ini`) |
| `cli/lib.d/ceds-ontology/` (`ceds1`) | the CEDS Ontology Navigator CLI (configs `ceds1.ini`), behind `/api/cedsOntology` |
| `cli/lib.d/ceds-ontology14/` | `cedsOntology14Search` and `parseRdf` over the CEDS v14 RDF (an askMilo provider; enabled by no `askMilo.ini`, measured) |
| `cli/lib.d/index-ontology14-for-milo/` | the indexer that built that tool's Neo4j |
| `cli/lib.d/data-model-explorer/ceds_rdfSearch.js` | an RDF search script that nothing required |
| `html/pages/ontology.vue`, `html/stores/cedsOntologyStore.js` | the `/ontology` "Data Miner" page and its store |
| `server/data-model/access-points-dot-d/accessPoints.d/ceds-ontology.js`, `server/endpoints-dot-d/qtDotLib.d/cedsOntology.js` | its access point and endpoint (`/api/cedsOntology`) |

Their git-ignored payloads (node_modules, `CEDS-Ontology.rdf`, `neo4j-data.tar.gz`) moved with them in the worktree; the live checkout keeps its own copies at the old paths until someone removes them.

**Left in place, deliberately:** the configs `ceds1.ini`, `ceds2.ini`, `cedsOntology14Search.ini` (configs are another repo; they are now read by nothing). Symlinks `initCli.js` made for these tools in `~/bin/educore/` dangle until `node cli/initCli.js` is re-run.

**To bring one back:** `git mv` it to its old path and re-run `node cli/initCli.js`.
