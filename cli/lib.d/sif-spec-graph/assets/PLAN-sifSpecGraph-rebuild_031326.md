# SIF Spec Graph — Implementation Plan

**Date:** 2026-03-13
**Spec:** `SPEC-sifSpecGraph-schema_031326.md` (same directory)
**Target script:** `../parseSifSpecTsv.js` (rewrite of existing parser)

## Post-Implementation Review (2026-03-13)

Script was built by a spawned programmer Milo and reviewed. Two issues caught and fixed:

1. **Hostname check:** `findNeo4jConfig()` had `os.hostname() == 'qMini.local'` — wrong
   hostname. Fixed to `'qbook.local'`. This determines config path resolution to
   `configs/instanceSpecific/qbook/sifSpecGraphSearch.ini`.

2. **Config token resolution:** `getConfig()` was called with `{ resolve: false }`, which
   would skip `<!token!>` substitution in the ini file. The `sifSpecGraphSearch.ini` uses
   `_substitutions` for connection details, so tokens must be resolved. Removed the flag
   to use default resolution behavior.

## Prerequisites

- Read the spec file first. This plan assumes you understand the schema.
- Read the existing `parseSifSpecTsv.js` — you are rewriting it, not starting from scratch.
- Neo4j connection: configured in `sifSpecGraphSearch.ini` at
  `qbookSuperTool/system/configs/instanceSpecific/qbook/sifSpecGraphSearch.ini`.
  The existing parser also supports `--neo4jBoltUri` and `--neo4jPassword` CLI flags.
- The Neo4j container data lives at
  `qbookSuperTool/system/dataStores/instanceSpecific/sif-spec-graph/neo4j-SifSpecGraph/`.
  The container must be running before you execute.

## What to Preserve from the Existing Parser

Keep these functions largely intact (they work correctly):

1. **`parseTsvFile()`** — TSV parsing logic. The table header regex, column parsing,
   and field extraction are correct. Modify to also compute derived properties on each
   field (depth, isAttribute, pathSegments) during parsing rather than in a second pass.

2. **`loadResolutionMap()`** — Reads `refIdResolutionMap.tsv`. No changes needed.

3. **`resolveRefIdTargets()`** — RefId foreign key resolution. No changes needed.

4. **`deduplicateEdges()`** — Edge dedup. No changes needed.

5. **`findNeo4jConfig()`** — Neo4j connection discovery. Keep as-is, including the
   CLI flag override path (`--neo4jBoltUri`, `--neo4jPassword`).

6. **CLI entry point** — The `if (require.main === module)` block. Extend to accept
   the TSV path defaulting to the assets directory copy if `--tsvPath` not provided.

## What to Rewrite

Replace `loadGraphIntoNeo4j()` with a new function that builds the full graph per spec.

## Implementation Steps

### Step 1: Enhance parseTsvFile()

After parsing each field row, compute and attach:

```javascript
fieldDef.depth = xpathParts.length - 3;  // subtract empty, collection, object
fieldDef.isAttribute = fieldName.startsWith('@');
fieldDef.pathSegments = xpathParts.slice(3, -1);  // intermediate segments only
```

The existing field properties (name, mandatory, characteristics, type, description,
xpath, cedsId, format) remain unchanged.

### Step 2: Build In-Memory Data Structures (after parsing, before Neo4j)

After `parseTsvFile()` returns the object list, build these structures in memory:

**a. Type registry:**
```
Scan all fields' `type` values.
Classify each: ends with "Type" → SifSimpleType, else → SifPrimitiveType.
Exception list for XML Schema types that end in "Type" but are primitives:
  (none currently — all "Type" suffixed values in the data are SIF-defined)
Build a Map<typeName, {name, category, label}>.
For SifSimpleType entries, infer the base primitive where possible
  (e.g., StateProvinceType → string, based on what fields of that type commonly are).
  NOTE: The TSV doesn't explicitly declare base types. The BASED_ON relationship
  may need to be populated manually or heuristically. If uncertain, skip BASED_ON
  rather than guess wrong — it can be added later.
```

**b. Codeset registry:**
```
Scan all fields' `format` values (col 7).
Parse each: strip surrounding quotes, split on ", " (comma-space).
Compute fingerprint: sort values, join with "|", hash or use directly.
Build a Map<fingerprint, {values, valueCount, fingerprint}>.
For each field with a format value, record which fingerprint it maps to.
```

**c. Complex type registry:**
```
For each field, examine pathSegments (the intermediate XPath segments).
Build a tree of segment paths:
  - "Address" is a complex type
  - "Address/Street" means Street is a complex type contained by Address
  - Track which objects use each complex type (for objectCount)
  - Track which fields are members of each complex type
    (a field's complex type is determined by its innermost intermediate segment)

Result: Map<path, {name, children: Set<childPath>, objects: Set<tableName>, fields: []}>
```

**d. XML element tree:**
```
For each field's full XPath, extract all path segments from position 3 onward
  (everything after /Collection/Object/).
Each segment becomes a potential SifXmlElement node.
Key by the relative path from object (e.g., "Address/Street/Line1").

Deduplication: Two fields from different objects that share the same relative
  path structure produce the same SifXmlElement node. This means the tree is
  built from the UNION of all objects' paths.

Track:
  - parent→child relationships (CHILD_ELEMENT)
  - which objects connect to which root-level elements (HAS_ROOT_ELEMENT)
  - which elements are leaves (no children → link to SifField via REALIZED_BY)
  - which non-leaf elements correspond to complex types (TYPED_AS)
```

### Step 3: Neo4j Loading — Phase 1 (Core Graph)

Replace the existing `loadGraphIntoNeo4j()`. Use a single driver session.
Load in this order (relationship targets must exist before creating relationships):

**3a. Clear graph:**
```cypher
MATCH (n) DETACH DELETE n
```

**3b. Create SifPrimitiveType nodes:**
```cypher
UNWIND $types AS t
CREATE (n:SifPrimitiveType:SifModel {name: t.name, category: 'primitive'})
```
Small set (~12-15). Create first so HAS_TYPE can reference them.

**3c. Create SifSimpleType nodes:**
```cypher
UNWIND $types AS t
CREATE (n:SifSimpleType:SifModel {name: t.name, category: 'simple'})
```
Then create BASED_ON edges where known.

**3d. Create SifCodeset nodes:**
```cypher
UNWIND $codesets AS cs
CREATE (n:SifCodeset:SifModel {
  values: cs.values,
  valueCount: cs.valueCount,
  fingerprint: cs.fingerprint
})
```

**3e. Create SifComplexType nodes:**
```cypher
UNWIND $types AS ct
CREATE (n:SifComplexType:SifModel {
  name: ct.name,
  objectCount: ct.objectCount,
  fieldCount: ct.fieldCount
})
```
Then create CONTAINS relationships between complex types.

**3f. Create SifObject nodes:**
```cypher
UNWIND $objects AS obj
CREATE (s:SifObject:SifModel {
  name: obj.name,
  tableName: obj.tableName,
  fieldCount: obj.fieldCount,
  mandatoryFieldCount: obj.mandatoryFieldCount
})
```
Note: NO `fields` JSON blob property. That's the whole point of this rebuild.

Then create REFERENCES edges (same logic as current parser).
Then create USES_COMPLEX_TYPE edges.

**3g. Create SifField nodes (batched):**

~15,620 fields. Use UNWIND in batches of ~1000 to avoid transaction size issues:

```cypher
UNWIND $fields AS f
MATCH (obj:SifObject {tableName: f.objectTableName})
CREATE (field:SifField:SifModel {
  name: f.name,
  xpath: f.xpath,
  mandatory: f.mandatory,
  characteristics: f.characteristics,
  description: f.description,
  cedsId: f.cedsId,
  depth: f.depth,
  isAttribute: f.isAttribute,
  pathSegments: f.pathSegments
})
CREATE (obj)-[:HAS_FIELD]->(field)
```

Then in separate batched queries:
- HAS_TYPE: Match each field to its type node by type name
- CONSTRAINED_BY: Match each field to its codeset node by fingerprint
- MEMBER_OF: Match each field to its complex type node by complex type name

**Batching strategy:** Group fields by their objectTableName. Process one object's
fields at a time or in chunks of ~1000 fields across objects. The MATCH on SifObject
is indexed (create index first), so this is fast.

### Step 4: Neo4j Loading — Phase 2 (XML Element Tree)

**4a. Create SifXmlElement nodes:**
```cypher
UNWIND $elements AS el
CREATE (n:SifXmlElement:SifModel {
  name: el.name,
  path: el.path,
  depth: el.depth,
  isShared: el.isShared,
  isLeaf: el.isLeaf
})
```

**4b. Create CHILD_ELEMENT relationships:**
```cypher
UNWIND $edges AS e
MATCH (parent:SifXmlElement {path: e.parentPath})
MATCH (child:SifXmlElement {path: e.childPath})
CREATE (parent)-[:CHILD_ELEMENT]->(child)
```

**4c. Create HAS_ROOT_ELEMENT relationships:**
For each object, find its top-level path segments and link:
```cypher
UNWIND $links AS link
MATCH (obj:SifObject {tableName: link.tableName})
MATCH (el:SifXmlElement {path: link.elementPath})
CREATE (obj)-[:HAS_ROOT_ELEMENT]->(el)
```

**4d. Create REALIZED_BY relationships (leaf → field):**
This is the trickiest link. A leaf SifXmlElement at path "Address/City" needs to
connect to the SifField whose pathSegments include the right ancestry AND whose
name matches the leaf. Since multiple objects may share the element but have
different fields, REALIZED_BY should connect to ALL matching SifField nodes:
```cypher
UNWIND $links AS link
MATCH (el:SifXmlElement {path: link.elementPath})
MATCH (field:SifField {xpath: link.fieldXpath})
CREATE (el)-[:REALIZED_BY]->(field)
```
Build the link data in JavaScript by matching field xpaths to element paths.

**4e. Create TYPED_AS relationships (non-leaf → complex type):**
```cypher
UNWIND $links AS link
MATCH (el:SifXmlElement {path: link.elementPath})
MATCH (ct:SifComplexType {name: link.complexTypeName})
CREATE (el)-[:TYPED_AS]->(ct)
```

### Step 5: Create Indexes

Create after all nodes exist (indexes on empty labels slow down bulk creation):

```cypher
CREATE INDEX sifobject_name IF NOT EXISTS FOR (s:SifObject) ON (s.name)
CREATE INDEX sifobject_tablename IF NOT EXISTS FOR (s:SifObject) ON (s.tableName)
CREATE INDEX siffield_xpath IF NOT EXISTS FOR (f:SifField) ON (f.xpath)
CREATE INDEX siffield_name IF NOT EXISTS FOR (f:SifField) ON (f.name)
CREATE INDEX siffield_cedsid IF NOT EXISTS FOR (f:SifField) ON (f.cedsId)
CREATE INDEX sifxmlelement_path IF NOT EXISTS FOR (e:SifXmlElement) ON (e.path)
CREATE INDEX sifcomplextype_name IF NOT EXISTS FOR (c:SifComplexType) ON (c.name)
CREATE INDEX sifcodeset_fingerprint IF NOT EXISTS FOR (c:SifCodeset) ON (c.fingerprint)
CREATE INDEX sifsimpletype_name IF NOT EXISTS FOR (t:SifSimpleType) ON (t.name)
CREATE INDEX sifprimitivetype_name IF NOT EXISTS FOR (t:SifPrimitiveType) ON (t.name)
CREATE INDEX sifmodel_label IF NOT EXISTS FOR (n:SifModel) ON (n.name)
```

### Step 6: Verification

Print summary counts to stderr:
```
SifObject nodes: N
SifField nodes: N
SifComplexType nodes: N
SifSimpleType nodes: N
SifPrimitiveType nodes: N
SifCodeset nodes: N
SifXmlElement nodes: N
HAS_FIELD edges: N
REFERENCES edges: N
HAS_TYPE edges: N
CONSTRAINED_BY edges: N
MEMBER_OF edges: N
CONTAINS edges: N
USES_COMPLEX_TYPE edges: N
CHILD_ELEMENT edges: N
HAS_ROOT_ELEMENT edges: N
REALIZED_BY edges: N
TYPED_AS edges: N
```

Output JSON summary to stdout (same pattern as existing parser).

## Algorithmic Notes

### Complex Type Extraction Algorithm

The key insight: a complex type is any XPath segment that has children. Given field
XPaths like:
```
/StudentPersonals/StudentPersonal/Address/Street/Line1
/StudentPersonals/StudentPersonal/Address/City
/StaffPersonals/StaffPersonal/Address/Street/Line1
```

"Address" is a complex type because it has children (Street, City).
"Street" is a complex type because it has children (Line1).
"Line1" and "City" are leaves (they ARE the fields).

Algorithm:
1. For each field, take pathSegments (intermediate parts between object and field name)
2. For each prefix of pathSegments, that prefix names a complex type
3. Build parent→child from consecutive segments
4. Deduplicate across objects — "Address/Street" from StudentPersonals and StaffPersonals
   is the same complex type

### XmlElement Tree vs Complex Types

These are related but distinct:
- **SifComplexType** represents the *type definition* — "Address" as a reusable structure
- **SifXmlElement** represents the *tree position* — "Address" as a navigable node with
  children, linked to objects and fields

A SifXmlElement that corresponds to a complex type gets a TYPED_AS relationship.
Leaf SifXmlElements (the actual fields) get REALIZED_BY instead.

Not every XmlElement is a complex type — some intermediate elements might be
one-off containers specific to a single object. But most shared ones are complex types.

### Handling Duplicate Field Names

The TSV has many fields with the same name within one object (e.g., "Code" appears
multiple times under different XPath parents). The XPath makes each unique. When
creating SifField nodes, the XPath is the true primary key, not the field name.

### Batch Size

Neo4j handles UNWIND of a few thousand items well. For 15,620 fields, batching at
1000 per query gives ~16 queries. Each batch creates nodes AND the HAS_FIELD relationship
in one query (MATCH object, CREATE field, CREATE edge). Subsequent relationship
queries (HAS_TYPE, CONSTRAINED_BY, MEMBER_OF) can also batch at 1000.

## File Structure After Implementation

```
sif-spec-graph/
  parseSifSpecTsv.js          ← rewritten parser (this plan's output)
  sifSpecGraphSearch.js       ← query tool (unchanged)
  provider.json               ← tool manifest (update tool descriptions for new schema)
  package.json                ← unchanged
  assets/
    SPEC-sifSpecGraph-schema_031326.md
    PLAN-sifSpecGraph-rebuild_031326.md   ← this document
    ImplementationSpecification_031326.tsv
    refIdResolutionMap.tsv
```

## Testing

After the build completes, verify with sample queries:

```cypher
-- Count all SIF nodes
MATCH (n:SifModel) RETURN labels(n), count(n)

-- Check a specific object's fields
MATCH (o:SifObject {name: 'StudentPersonal'})-[:HAS_FIELD]->(f:SifField)
RETURN f.name, f.xpath, f.mandatory LIMIT 20

-- Check complex type membership
MATCH (f:SifField)-[:MEMBER_OF]->(ct:SifComplexType {name: 'Address'})
RETURN f.name, f.xpath LIMIT 10

-- Navigate XML element tree
MATCH (o:SifObject {name: 'StudentPersonal'})-[:HAS_ROOT_ELEMENT]->(el:SifXmlElement)
MATCH path = (el)-[:CHILD_ELEMENT*1..3]->(descendant)
RETURN [n IN nodes(path) | n.name] LIMIT 20

-- Find fields with CEDS IDs
MATCH (f:SifField) WHERE f.cedsId IS NOT NULL AND f.cedsId <> ''
RETURN f.name, f.cedsId, f.xpath LIMIT 20

-- Check codeset usage
MATCH (f:SifField)-[:CONSTRAINED_BY]->(cs:SifCodeset)
RETURN f.name, cs.valueCount, cs.values[0..5] LIMIT 10
```
