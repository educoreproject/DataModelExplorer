# User-proposed mappings (`dme_user_mappings`)

Schema Verifier users accept cross-specification equivalences ("mappings") and
attach a transformation rule to each. This document is the operator's view:
where they are stored, how to test the server side without the UI, how to
review them, and how to pull them into the EDUcore graph.

## What a mapping is

One row = one proposal that a SOURCE element and a TARGET element mean the same
thing, with how a value moves between them.

| column | meaning |
| --- | --- |
| `refId` | 20-char id, stable across edits (also the `proposalId` on the graph edge) |
| `userRefId` | proposer (`users.refId`) |
| `mappingKey` | the browser's curation key for the source element, e.g. `CEDS::Person`, `LIF::Person.Name.givenName`, or an HR Open crosswalk id like `I.G.1` |
| `sourceStandard`, `sourceName`, `sourceId`, `sourcePath` | the element being mapped FROM (display standard name, element name, stable/CEDS id when known, dotted graph path when known) |
| `targetStandard`, `targetName`, `targetSourceId`, `targetPath` | the element being mapped TO |
| `rel` | the graph relationship the suggestion came from (`EXACT_MATCH`, `CLOSE_MATCH`, `crosswalk`, `node` …) |
| `detail` | free text carried from the suggestion (usually the target's description) |
| `transformType` | `direct` · `rename` · `valueMap` · `format` · `concat` · `split` · `constant` · `expression` |
| `transformRule` | the rule text; for `valueMap`, one `source => target` per line |
| `transformNotes` | free text |
| `status` | `proposed` (default) · `accepted` · `rejected` |
| `reviewedBy`, `reviewedAt`, `reviewNote` | set by the review endpoint (admin/super) |
| `createdAt`, `updatedAt` | maintained by sqlite-instance |

Upsert identity is `(userRefId, mappingKey, targetStandard, targetName)`. The
table is created on first use and any missing column is added automatically,
so there is no migration step. Inserts and updates go through `safeSql`
directly rather than `saveObject()`, because the latter double-escapes
apostrophes and would corrupt rule text.

## Visibility model

- Every logged-in user can **read every proposal** (`scope=all`), labelled with who proposed it.
- Only the **owner** can edit or delete their proposal. `admin`/`super` can delete any.
- Only `admin`/`super` can **review** (accept / reject) and **export**.
- Logged-out users keep mappings in browser localStorage only; on their first
  login the browser pushes those up and they become proposals.

## Endpoints (`/api/…`, `Authorization: Bearer <token>`)

| method | route | roles | purpose |
| --- | --- | --- | --- |
| POST | `dmeUserMappingSave` | user+ | upsert `{ mappings: [ … ] }`; new rows are `proposed`; re-saves never touch review fields |
| GET | `dmeUserMappingList?scope=mine\|all&status=…` | user+ | list; rows carry `proposedBy`, `mine`, `status` |
| DELETE | `dmeUserMappingDelete?refId=…` (or `?mappingKey=&targetStandard=&targetName=`) | owner, or admin/super by refId | remove |
| POST | `dmeUserMappingReview` | admin/super | `{ refId, status, note? }` |
| GET | `dmeUserMappingExport?format=json\|csv\|cypher&status=accepted\|proposed\|rejected\|all` | admin/super | download; defaults `json`, `accepted` |

Get a token the same way the UI does:

```bash
TOKEN=$(curl -s -D - "https://ed-core.org/api/login?username=$USER&password=$PASS" -o /dev/null | awk 'tolower($1)=="authtoken:"{print $2}' | tr -d '\r')
```

## Test on the droplet without the UI

Runs the real sqlite-instance, data-mapping and access-point modules against a
throwaway database in `/tmp`. No config, no Neo4j, nothing touched in the live DB.

```bash
cd /home/educore/system/code
node server/test/userMappings/user-mappings-harness.js
```

Expect `ALL PASSED` and exit 0. It covers: table creation and column growth,
upsert keeping `refId`, apostrophes/newlines in rules, shared listing with
proposer names, accept/reject, owner re-save preserving review, owner-only vs
admin delete, and all three export formats. Add `--keep` to leave the temp
database for inspection with `sqlite3`.

Then, after deploying and restarting `com.tqwhite.educore`, confirm the routes
are live (401 = mounted and wants a token; 404 = old code still running):

```bash
for p in dmeUserMappingList dmeUserMappingReview dmeUserMappingExport; do printf '%s ' $p; curl -s -o /dev/null -w '%{http_code}\n' https://ed-core.org/api/$p; done
```

## Look at the live table

The SQLite file is the one `data-model.js` opens (`databaseContainerDirPath`/`databaseFileName` in the server config; the startup log prints `Database File Path:`).

```bash
sqlite3 "$DB" "SELECT status, COUNT(*) FROM dme_user_mappings GROUP BY status;"
sqlite3 -header -column "$DB" "SELECT refId, status, sourceStandard, sourceName, targetStandard, targetName, transformType FROM dme_user_mappings ORDER BY updatedAt DESC LIMIT 20;"
```

## Review, then ingest into the graph

1. In the UI (Explore → Schema Verifier → View all → Everyone) an admin sees every proposal with Accept / Reject buttons. Or via curl:

   ```bash
   curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"refId":"<refId>","status":"accepted","note":"verified against CEDS"}' \
     https://ed-core.org/api/dmeUserMappingReview
   ```

2. Export accepted rows as Cypher and run them against the graph:

   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" \
     "https://ed-core.org/api/dmeUserMappingExport?format=cypher&status=accepted" -o accepted-mappings.cypher
   cat accepted-mappings.cypher | cypher-shell -a bolt://localhost:7687 -u neo4j -p "$NEO4J_PASSWORD"
   ```

   Each statement resolves both elements by `path`, then stable/CEDS id, then
   `name` (best single hit), and `MERGE`s a **`PROPOSED_MATCH`** edge keyed by
   `proposalId` with the rule, proposer, reviewer and timestamps as properties.
   Re-running is idempotent. The edge type is deliberately not `EXACT_MATCH` /
   `CLOSE_MATCH`: these are human proposals until the forge promotes them.
   Rows whose standard is not in the graph (HR Open) are emitted as `// SKIPPED`
   comments; they still appear in the JSON/CSV exports.

3. Display names in the browser differ from graph `_source` codes for a few
   standards; the exporter maps them (`Ed-Fi`→`EdFi`, `Ed-API`→`EduAPI`,
   `Open Badges`→`OpenBadges`). Add to `GRAPH_SOURCE_BY_DISPLAY` in
   `server/data-model/lib/dme-user-mapping-export.js` if a new one appears.

## Files

```
server/data-model/data-mapping/mappers/dme-user-mapping.js          columns + named SQL
server/data-model/lib/dme-user-mapping-table.js                     table open/grow, users directory, row decoration
server/data-model/lib/dme-user-mapping-export.js                    JSON / CSV / Cypher renderers (pure)
server/data-model/access-points-dot-d/accessPoints.d/dme-user-mapping-{save,list,delete,review,export}.js
server/endpoints-dot-d/qtDotLib.d/dme-user-mapping-{save,list,delete,review,export}.js
server/test/userMappings/user-mappings-harness.js                   run me
```
