# SIF Spec Graph — Schema and Build Specification

**Purpose:** This document defines the graph schema for the SIF Implementation Specification
database and provides everything needed to rebuild or update the graph from a new version
of the SIF spec TSV. If you are a future Milo reading this, you have what you need here.

**Current version built from:** `ImplementationSpecification 2.tsv` (2026-03-13)

## How to Rebuild

1. Obtain the new SIF Implementation Specification as a TSV file
2. Place it in this assets directory (or pass its path via `--tsvPath`)
3. Run `parseSifSpecTsv.js` — it clears the existing graph and rebuilds from scratch
4. The entire build (parsing + Neo4j loading) takes seconds for ~20K nodes

**The graph is always rebuilt from scratch, not patched.** This is intentional — with this
graph size, a clean rebuild is faster and safer than delta logic. A new spec TSV version
simply replaces the old graph entirely.

## TSV Input Format

The parser expects a TSV file structured as follows:

### Table Headers
Each SIF object type begins with a line matching the pattern:
```
ObjectName: Table N
```
Where `ObjectName` is the plural table name (e.g., "StudentPersonals") and N is a
table number. The singular form (e.g., "StudentPersonal") is derived by stripping
the trailing "s".

### Column Headers
Immediately after each table header is a column header row (skipped by the parser):
```
Name	Mandatory	Characteristics	Type	Description	XPath	CEDS ID	Format
```

### Field Rows
Each subsequent row until the next table header or blank line defines a field:

| Column | Index | Content | Notes |
|--------|-------|---------|-------|
| Name | 0 | Field name | "@" prefix indicates XML attribute |
| Mandatory | 1 | "*" if mandatory | Empty if optional |
| Characteristics | 2 | M, O, MR, OR, C | Mandatory, Optional, Mandatory Repeatable, Optional Repeatable, Conditional |
| Type | 3 | Data type | e.g., "string", "RefIdType", "StateProvinceType" |
| Description | 4 | Human-readable description | May be empty, may contain quotes |
| XPath | 5 | Full XML path | Canonical SIF identifier for this field |
| CEDS ID | 6 | CEDS Global ID | e.g., "000040" — the bridge to CEDS ontology |
| Format | 7 | Allowed values | Comma-separated codeset values, may be quoted |

### RefId Resolution Map
A separate TSV (`refIdResolutionMap.tsv` in this directory) provides manual resolution
for RefId foreign keys that cannot be resolved by naive pluralization. Format:
```
RefIdProperty	SourceTable	ResolvedTargetTable
```

## Multi-Standard Labeling Strategy

**Every node in this graph carries a `:SifModel` label** in addition to its specific type label.
This enables:
- `MATCH (n:SifModel)` — select the entire SIF subgraph for export/migration
- `MATCH (n:SifField)` — specific type queries still work
- When CEDS elements later join the same graph, they carry `:CedsModel`
- Cross-standard: `MATCH (f:SifField)-[:MAPS_TO_CEDS]->(c:CedsModel)`
- Export: `MATCH (n:SifModel)-[r]-(m:SifModel)` dumps SIF cleanly for import elsewhere

All relationship types between SIF nodes are already SIF-prefixed or contextually
unambiguous, so no relationship labeling changes needed.

## Node Types

### :SifObject :SifModel
Top-level SIF data objects (the "tables").

| Property | Type | Source | Description |
|----------|------|--------|-------------|
| name | string | Derived (singular of tableName) | e.g., "StudentPersonal" |
| tableName | string | TSV table header | e.g., "StudentPersonals" |
| fieldCount | integer | Computed | Total fields belonging to this object |
| mandatoryFieldCount | integer | Computed | Fields where mandatory=true |

### :SifField :SifModel
Individual field definitions — one per field per object. The core entity for CEDS crosswalking.

| Property | Type | Source | Description |
|----------|------|--------|-------------|
| name | string | Col 0 (Name) | Field name, e.g., "City" |
| xpath | string | Col 5 (XPath) | Full XPath — the canonical SIF identifier |
| mandatory | boolean | Col 1 (Mandatory) | True if marked "*" |
| characteristics | string | Col 2 | M, O, MR, OR, C |
| description | string | Col 4 | Human-readable description |
| cedsId | string | Col 6 (CEDS ID) | CEDS Global ID reference, if present |
| depth | integer | Derived from XPath | Nesting depth below object level |
| isAttribute | boolean | Derived from name | True if name starts with "@" |
| pathSegments | string[] | Derived from XPath | Intermediate path segments array |

### :SifComplexType :SifModel
Shared structural groupings derived from XPath analysis. Examples: Address, SIF_Metadata,
LifeCycle, EducationFilter, Street, GridLocation.

| Property | Type | Source | Description |
|----------|------|--------|-------------|
| name | string | XPath segment | e.g., "Address", "SIF_Metadata" |
| description | string | Manual/derived | What this complex type represents |
| objectCount | integer | Computed | How many objects use this type |
| fieldCount | integer | Computed | How many fields it contains |

### :SifSimpleType :SifModel
SIF-defined constrained types built on primitives. Examples: RefIdType, IdRefType,
LocalIdType, StateProvinceType, CountryType, MonetaryAmountType, SchoolYearType.

| Property | Type | Source | Description |
|----------|------|--------|-------------|
| name | string | Col 3 (Type) | e.g., "StateProvinceType" |
| category | string | Derived | "simple" |

### :SifPrimitiveType :SifModel
XML Schema primitive types. Examples: string, token, normalizedString, boolean, date,
dateTime, decimal, integer, unsignedInt, anyURI.

| Property | Type | Source | Description |
|----------|------|--------|-------------|
| name | string | Col 3 (Type) | e.g., "string", "boolean" |
| category | string | Derived | "primitive" |

**Classification rule:** Types ending in "Type" (except base XML Schema types like
"dateTime") are SifSimpleType. Everything else is SifPrimitiveType.

### :SifCodeset :SifModel
Enumerated value lists from the Format column. Represents constrained vocabularies.

| Property | Type | Source | Description |
|----------|------|--------|-------------|
| values | string[] | Col 7 (Format) | Array of allowed values |
| valueCount | integer | Computed | Number of values in the codeset |
| fingerprint | string | Computed | Hash/sorted-join for deduplication |

**Deduplication:** Many fields share identical codesets. Deduplicate by comparing sorted
value arrays. Each unique codeset becomes one node, shared by all fields that use it.

### :SifXmlElement :SifModel
Nodes forming the XML schema tree structure. Each represents a distinct element in the
XPath hierarchy. Shared across objects — the SIF_Metadata subtree exists once, not 136 times.

| Property | Type | Source | Description |
|----------|------|--------|-------------|
| name | string | XPath segment | Local element name, e.g., "Street" |
| path | string | Derived | Relative path from object, e.g., "Address/Street" |
| depth | integer | Computed | Depth in the tree |
| isShared | boolean | Computed | True if used by multiple objects |
| isLeaf | boolean | Computed | True if no child elements |

## Relationships

### Object Structure
| Relationship | From | To | Properties | Description |
|-------------|------|-----|------------|-------------|
| HAS_FIELD | SifObject | SifField | | Object owns this field |
| REFERENCES | SifObject | SifObject | via, mandatory | RefId foreign key link |

### Field Classification
| Relationship | From | To | Properties | Description |
|-------------|------|-----|------------|-------------|
| HAS_TYPE | SifField | SifSimpleType or SifPrimitiveType | | Field's data type |
| CONSTRAINED_BY | SifField | SifCodeset | | Field uses this value list |
| MEMBER_OF | SifField | SifComplexType | | Field participates in this complex type |
| MAPS_TO_CEDS | SifField | (external CedsElement) | cedsId | Bridge to CEDS ontology |

### Type Hierarchy
| Relationship | From | To | Properties | Description |
|-------------|------|-----|------------|-------------|
| BASED_ON | SifSimpleType | SifPrimitiveType | | e.g., StateProvinceType BASED_ON string |

### Complex Type Structure
| Relationship | From | To | Properties | Description |
|-------------|------|-----|------------|-------------|
| CONTAINS | SifComplexType | SifComplexType | | Nesting: Address CONTAINS Street |
| USES_COMPLEX_TYPE | SifObject | SifComplexType | | Object uses this shared structure |

### XML Element Tree
| Relationship | From | To | Properties | Description |
|-------------|------|-----|------------|-------------|
| CHILD_ELEMENT | SifXmlElement | SifXmlElement | | Parent-to-child in XML hierarchy |
| HAS_ROOT_ELEMENT | SifObject | SifXmlElement | | Object's top-level tree entry points |
| REALIZED_BY | SifXmlElement | SifField | | Leaf elements link to their field definitions |
| TYPED_AS | SifXmlElement | SifComplexType | | Non-leaf elements link to their complex type |

## Construction Strategy

The build runs in two logical phases within a single script execution.

### Phase 1: Core Graph (single pass over TSV)
1. Parse all objects and fields from TSV
2. Create :SifObject nodes (with :SifModel label)
3. Create :SifField nodes with full properties, HAS_FIELD relationships
4. Create :SifObject REFERENCES edges (RefId resolution using refIdResolutionMap.tsv)
5. Extract and deduplicate :SifCodeset nodes, create CONSTRAINED_BY
6. Extract :SifPrimitiveType and :SifSimpleType nodes, create HAS_TYPE and BASED_ON
7. Derive :SifComplexType nodes from XPath intermediate segments, create MEMBER_OF and CONTAINS

### Phase 2: XML Element Tree (from completed field graph)
1. Build tree from all XPaths — deduplicate shared subtrees
2. Create :SifXmlElement nodes with CHILD_ELEMENT relationships
3. Link objects to their root elements via HAS_ROOT_ELEMENT
4. Link leaf elements to :SifField via REALIZED_BY
5. Link non-leaf elements to :SifComplexType via TYPED_AS

**Rationale for two phases:** The XML element tree benefits from having all fields and
complex types already present. Linking REALIZED_BY and TYPED_AS is simpler when target
nodes exist.

### Phase 3: CEDS Bridge (future — requires merged graph)
1. For each SifField with a cedsId, create MAPS_TO_CEDS relationship to CedsElement
2. Deferred until SIF and CEDS share a graph container

## Expected Counts (from ImplementationSpecification 2.tsv)

These numbers characterize the current SIF spec version. A new TSV may differ.

| Entity | Count |
|--------|-------|
| :SifObject | 159 |
| :SifField | ~15,620 |
| :SifComplexType | ~200-300 |
| :SifSimpleType | ~15-20 |
| :SifPrimitiveType | ~12-15 |
| :SifCodeset | ~140 |
| :SifXmlElement | ~3,000-5,000 (shared, deduplicated) |
| Total nodes | ~20,000+ |
| Total edges | ~50,000+ |

## Design Decisions

1. **Multi-standard labeling:** All nodes carry `:SifModel` for clean export and future
   graph merge with CEDS (`:CedsModel`) and other standards.

2. **XmlElement sharing:** Shared. "Address" under StudentPersonals and StaffPersonals
   is the same :SifXmlElement node. Multiple objects link to it via HAS_ROOT_ELEMENT
   or through ancestor elements.

3. **Attribute handling:** Consistent treatment — XML attributes (names starting with "@")
   are :SifField nodes with isAttribute=true AND :SifXmlElement leaf nodes. All information
   is preserved; structure can be revised later without re-parsing since the full XPath
   and all properties exist on every node.

4. **Full rebuild, not delta:** The parser clears the graph and rebuilds from scratch.
   At this graph size, rebuild is faster and safer than incremental patching. To update
   from a new spec version: drop in the new TSV, run the parser, done.

## Files in This Directory

| File | Purpose |
|------|---------|
| `SPEC-sifSpecGraph-schema_031326.md` | This document — schema and build instructions |
| `ImplementationSpecification_031326.tsv` | The SIF Implementation Specification source data |
| `refIdResolutionMap.tsv` | Manual RefId foreign key resolution overrides |
